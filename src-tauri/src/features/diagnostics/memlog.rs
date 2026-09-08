//! A running account of where the app's memory goes, written to a file.
//!
//! The ordinary log is compiled out of release builds and goes to stderr,
//! which nobody sees once the app is installed. This one is always on and
//! lands next to the database, because the questions it answers - is the
//! renderer growing, is it the database, the artwork, or the webview holding
//! event listeners - can only be answered on the machine that has the problem.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

use super::process;
use crate::shared::media_paths;
use crate::AppState;

/// Often enough to see a trend within minutes, rarely enough that the sampling
/// is not itself part of the measurement.
const SAMPLE_EVERY: Duration = Duration::from_secs(15);

/// Walking the media tree costs real IO, so it happens once a minute.
const DISK_EVERY: u32 = 4;

pub(crate) const LOG_FILE: &str = "memory.log";

/// What the webview reports about itself. It knows things the OS cannot see:
/// the size of the JS heap, how many nodes are in the document, how big our
/// own caches have grown, and how many event listeners are registered.
#[derive(Clone, Default, serde::Deserialize)]
pub(crate) struct WebviewSample {
    pub(crate) js_heap_used: Option<u64>,
    pub(crate) js_heap_total: Option<u64>,
    pub(crate) js_heap_limit: Option<u64>,
    pub(crate) dom_nodes: Option<u64>,
    pub(crate) tracks_in_state: Option<u64>,
    /// cache name -> entries held
    pub(crate) caches: Option<Vec<(String, u64)>>,
    /// event name -> listeners registered for it
    pub(crate) listeners: Option<Vec<(String, u64)>>,
}

static LATEST: Mutex<Option<WebviewSample>> = Mutex::new(None);

pub(crate) fn record(sample: WebviewSample) {
    if let Ok(mut slot) = LATEST.lock() {
        *slot = Some(sample);
    }
}

fn mb(bytes: u64) -> String {
    format!("{:.1}MB", bytes as f64 / 1_048_576.0)
}

pub(crate) fn spawn(app: AppHandle) {
    let handle = app.clone();
    crate::shutdown::spawn_tracked(&handle, run(app));
}

async fn run(app: AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let path = dir.join(LOG_FILE);
    let started = Instant::now();
    let mut round: u32 = 0;
    let mut disk = String::from("disk=pending");

    loop {
        tokio::time::sleep(SAMPLE_EVERY).await;
        round += 1;

        let db = { app.state::<AppState>().db.clone() };
        let processes = tokio::task::spawn_blocking(process::tree)
            .await
            .unwrap_or_default();
        let database = database_line(&db, &dir).await;
        if round % DISK_EVERY == 1 {
            disk = disk_line(&app, &db).await;
        }
        let webview = webview_line();

        let uptime = started.elapsed().as_secs();
        let mut line = format!(
            "{} up={:02}:{:02}:{:02}",
            now(),
            uptime / 3600,
            (uptime % 3600) / 60,
            uptime % 60
        );
        for sample in &processes {
            line.push_str(&format!(
                " | {}#{} ws={} priv={}",
                sample.name,
                sample.pid,
                mb(sample.working_set),
                mb(sample.private)
            ));
        }
        line.push_str(&format!(" | {database} | {disk} | {webview}\n"));

        append(&path, &line).await;
    }
}

fn now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

async fn append(path: &std::path::Path, line: &str) {
    use tokio::io::AsyncWriteExt;
    let Ok(mut file) = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await
    else {
        return;
    };
    let _ = file.write_all(line.as_bytes()).await;
    let _ = file.flush().await;
}

async fn database_line(db: &SqlitePool, dir: &std::path::Path) -> String {
    let page_count: i64 = sqlx::query_scalar("PRAGMA page_count")
        .fetch_one(db)
        .await
        .unwrap_or(0);
    let page_size: i64 = sqlx::query_scalar("PRAGMA page_size")
        .fetch_one(db)
        .await
        .unwrap_or(0);
    let tracks: i64 = sqlx::query_scalar("SELECT count(*) FROM tracks")
        .fetch_one(db)
        .await
        .unwrap_or(-1);
    let file = tokio::fs::metadata(dir.join("library.db"))
        .await
        .map(|meta| meta.len())
        .unwrap_or(0);
    let wal = tokio::fs::metadata(dir.join("library.db-wal"))
        .await
        .map(|meta| meta.len())
        .unwrap_or(0);

    format!(
        "db pages={}x{} ({}) file={} wal={} tracks={}",
        page_count,
        page_size,
        mb((page_count.max(0) as u64) * (page_size.max(0) as u64)),
        mb(file),
        mb(wal),
        tracks
    )
}

async fn disk_line(app: &AppHandle, db: &SqlitePool) -> String {
    let Ok(root) = media_paths::media_root(app, db).await else {
        return "disk=unknown".to_string();
    };
    let covers = root.join("covers");
    let (audio_files, audio_bytes) = tree_size(root.clone(), Some("covers")).await;
    let (cover_files, cover_bytes) = tree_size(covers, None).await;
    format!(
        "audio={} in {} files, covers={} in {} files",
        mb(audio_bytes),
        audio_files,
        mb(cover_bytes),
        cover_files
    )
}

/// Adds up a directory tree, optionally skipping one child by name.
async fn tree_size(root: std::path::PathBuf, skip: Option<&'static str>) -> (u64, u64) {
    tokio::task::spawn_blocking(move || {
        let mut files = 0u64;
        let mut bytes = 0u64;
        let mut stack = vec![root];
        while let Some(dir) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let Ok(kind) = entry.file_type() else {
                    continue;
                };
                if kind.is_dir() {
                    if skip.is_some_and(|name| entry.file_name() == name) {
                        continue;
                    }
                    stack.push(entry.path());
                } else if let Ok(meta) = entry.metadata() {
                    files += 1;
                    bytes += meta.len();
                }
            }
        }
        (files, bytes)
    })
    .await
    .unwrap_or((0, 0))
}

fn webview_line() -> String {
    let Ok(slot) = LATEST.lock() else {
        return "webview=unavailable".to_string();
    };
    let Some(sample) = slot.as_ref() else {
        return "webview=silent".to_string();
    };

    let heap = match (
        sample.js_heap_used,
        sample.js_heap_total,
        sample.js_heap_limit,
    ) {
        (Some(used), Some(total), Some(limit)) => {
            format!("js={}/{} of {}", mb(used), mb(total), mb(limit))
        }
        _ => "js=unreported".to_string(),
    };
    let nodes = sample
        .dom_nodes
        .map(|n| format!("dom={n}"))
        .unwrap_or_else(|| "dom=?".to_string());
    let tracks = sample
        .tracks_in_state
        .map(|n| format!("state_tracks={n}"))
        .unwrap_or_else(|| "state_tracks=?".to_string());

    let caches = sample
        .caches
        .as_ref()
        .map(|entries| {
            entries
                .iter()
                .map(|(name, count)| format!("{name}:{count}"))
                .collect::<Vec<_>>()
                .join(",")
        })
        .unwrap_or_else(|| "?".to_string());

    // the one that mattered: a listener array that only ever grew
    let listeners = sample
        .listeners
        .as_ref()
        .map(|entries| {
            let mut sorted = entries.clone();
            sorted.sort_by(|a, b| b.1.cmp(&a.1));
            sorted
                .iter()
                .take(6)
                .map(|(name, count)| format!("{name}:{count}"))
                .collect::<Vec<_>>()
                .join(",")
        })
        .unwrap_or_else(|| "?".to_string());

    format!("{heap} {nodes} {tracks} caches[{caches}] listeners[{listeners}]")
}
