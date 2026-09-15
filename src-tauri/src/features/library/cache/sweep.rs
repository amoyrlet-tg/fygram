use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::shared::media_paths;
use crate::AppState;

use super::{repository, service};

const SETTLE_DELAY: Duration = Duration::from_secs(90);
const SWEEP_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

pub(crate) fn spawn(app: AppHandle) {
    let handle = app.clone();
    crate::shutdown::spawn_tracked(&handle, run(app));
}

async fn run(app: AppHandle) {
    tokio::time::sleep(SETTLE_DELAY).await;
    loop {
        sweep(&app).await;
        tokio::time::sleep(SWEEP_EVERY).await;
    }
}

async fn sweep(app: &AppHandle) {
    let (db, ready) = {
        let state = app.state::<AppState>();
        (state.db.clone(), state.sync.snapshot().await)
    };
    if !ready.ready || !ready.online {
        return;
    }

    let aged = match service::aged_out_files(&db).await {
        Ok(paths) if paths.is_empty() => return,
        Ok(paths) => paths,
        Err(err) => {
            crate::log!("cache sweep: could not list aged out files: {err}");
            return;
        }
    };

    let current_playing = { app.state::<AppState>().player.current_path() };
    let mut evicted = 0u32;
    let mut freed = 0u64;
    for path in aged {
        if current_playing
            .as_deref()
            .is_some_and(|p| p.as_os_str() == std::ffi::OsStr::new(&path))
        {
            continue;
        }
        let Ok(meta) = tokio::fs::metadata(&path).await else {
            continue;
        };
        if let Err(err) = repository::evict_file(&db, &path).await {
            crate::log!("cache sweep: could not forget {path}: {err}");
            continue;
        }
        if tokio::fs::remove_file(&path).await.is_ok() {
            freed += meta.len();
            evicted += 1;
        }
    }

    if evicted == 0 {
        return;
    }
    if let Ok(root) = media_paths::media_root(app, &db).await {
        media_paths::prune_empty_dirs(&root).await;
    }
    crate::log!("cache sweep: removed {evicted} file(s), {freed} byte(s)");
    let _ = app.emit("library-changed", ());
}
