//! The loop: when to push, when to pull, and how long to wait after a failure.

use std::time::{Duration, Instant};

use anyhow::Result;
use chrono::Utc;
use tauri::{AppHandle, Emitter, Manager};

use crate::features::cloud::service as cloud;
use crate::features::playlists::telegram_sync;
use crate::shared::media_paths;
use crate::shared::telegram::TelegramState;
use crate::AppState;

use super::outbox::{self, Job};

const TICK_IDLE: Duration = Duration::from_secs(45);
const TICK_OFFLINE: Duration = Duration::from_secs(15);
const PULL_EVERY: Duration = Duration::from_secs(90);
const PROBE_TIMEOUT: Duration = Duration::from_secs(8);
const RETRY_BASE: Duration = Duration::from_secs(10);
const RETRY_MAX: Duration = Duration::from_secs(300);

enum Outcome {
    Offline,
    Stuck,
    Idle,
}

pub(crate) fn spawn(app: AppHandle) {
    let handle = app.clone();
    crate::shutdown::spawn_tracked(&handle, run(app));
}

async fn run(app: AppHandle) {
    let mut last_pull: Option<Instant> = None;
    let mut failures: u32 = 0;
    let mut wait = Duration::from_millis(400);

    loop {
        {
            let sync = app.state::<AppState>().sync.clone();
            sync.wait_for_work(wait).await;
        }

        wait = match cycle(&app, &mut last_pull).await {
            Outcome::Offline => {
                failures = 0;
                TICK_OFFLINE
            }
            Outcome::Stuck => {
                failures = failures.saturating_add(1);
                backoff(failures)
            }
            Outcome::Idle => {
                failures = 0;
                TICK_IDLE
            }
        };
    }
}

fn backoff(failures: u32) -> Duration {
    let doublings = failures.saturating_sub(1).min(5);
    RETRY_BASE.saturating_mul(1 << doublings).min(RETRY_MAX)
}

async fn cycle(app: &AppHandle, last_pull: &mut Option<Instant>) -> Outcome {
    let state = app.state::<AppState>();
    let sync = state.sync.clone();
    let db = state.db.clone();

    let online = probe(&state.telegram).await;
    let session_invalid = state.telegram.session_invalid();
    let pending = outbox::pending_count(&db).await;
    let pending_since = outbox::oldest_queued_at(&db).await;

    if session_invalid != sync.snapshot().await.session_invalid {
        crate::features::auth::repository::remember_session_invalid(&db, session_invalid).await;
    }

    sync.update(app, |status| {
        status.ready = true;
        status.online = online;
        status.session_invalid = session_invalid;
        status.pending = pending;
        status.pending_since = pending_since;
        if !online {
            status.syncing = false;
        }
    })
    .await;

    if !online {
        return Outcome::Offline;
    }

    sync.update(app, |status| status.syncing = true).await;

    let mut trouble: Option<String> = None;
    let mut library_changed = false;
    let mut channels_reconciled = false;

    for job in outbox::list(&db).await {
        match push(app, &state, &job).await {
            Ok(changed) => {
                library_changed |= changed;
                channels_reconciled |= job.entity == outbox::CHANNELS;
                outbox::remove(&db, &job.entity, &job.entity_id).await;
            }
            Err(err) => {
                let message = format!("{err:#}");
                eprintln!(
                    "sync: pushing {}/{} failed: {message}",
                    job.entity, job.entity_id
                );
                outbox::fail(&db, &job.entity, &job.entity_id, &message).await;
                trouble = Some(message);
                break;
            }
        }
    }

    let due = last_pull.is_none_or(|at| at.elapsed() >= PULL_EVERY);
    if trouble.is_none() && (sync.take_pull_request() || due) {
        match pull(app, &state, channels_reconciled).await {
            Ok(changed) => {
                library_changed |= changed;
                *last_pull = Some(Instant::now());
            }
            Err(err) => {
                let message = format!("{err:#}");
                eprintln!("sync: pull failed: {message}");
                trouble = Some(message);
            }
        }
    }

    let pending = outbox::pending_count(&db).await;
    let pending_since = outbox::oldest_queued_at(&db).await;
    let settled = trouble.is_none() && pending == 0;
    sync.update(app, |status| {
        status.syncing = false;
        status.pending = pending;
        status.pending_since = pending_since;
        status.last_error = trouble.clone();
        if settled {
            status.last_synced_at = Some(Utc::now());
        }
    })
    .await;

    if library_changed {
        let _ = app.emit("library-changed", ());
    }

    if trouble.is_some() {
        Outcome::Stuck
    } else {
        Outcome::Idle
    }
}

async fn probe(telegram: &TelegramState) -> bool {
    match tokio::time::timeout(PROBE_TIMEOUT, telegram.is_authorized()).await {
        Ok(Ok(true)) => {
            telegram.mark_session_alive();
            true
        }
        Ok(Ok(false)) => {
            telegram.mark_session_invalid();
            false
        }
        Ok(Err(err)) => {
            telegram.note_failure(&err);
            false
        }
        Err(_elapsed) => false,
    }
}

async fn push(app: &AppHandle, state: &AppState, job: &Job) -> Result<bool> {
    match job.entity.as_str() {
        outbox::PLAYLIST => {
            telegram_sync::push_playlist(&state.db, &state.telegram, &job.entity_id).await?;
            Ok(false)
        }
        outbox::CHANNELS => reconcile_channels(app, state).await,
        other => {
            eprintln!("sync: dropping unknown outbox entity {other:?}");
            Ok(false)
        }
    }
}

async fn pull(app: &AppHandle, state: &AppState, channels_done: bool) -> Result<bool> {
    let mut changed = if channels_done {
        false
    } else {
        reconcile_channels(app, state).await?
    };
    let media_root = media_paths::media_root(app, &state.db).await?;
    changed |= telegram_sync::pull_playlists(&state.db, &state.telegram, &media_root).await?;
    telegram_sync::gc_tombstones(&state.db, &state.telegram).await;
    Ok(changed)
}

async fn reconcile_channels(app: &AppHandle, state: &AppState) -> Result<bool> {
    let current_playing = state.player.current_path();
    let merge =
        cloud::reconcile_channels(&state.db, &state.telegram, current_playing.as_deref()).await?;

    if !merge.added.is_empty() {
        let handle = app.clone();
        let for_task = app.clone();
        let added = merge.added.clone();
        crate::shutdown::spawn_tracked(&handle, async move {
            cloud::index_new_channels(&for_task, &added).await;
        });
    }

    Ok(merge.changed_locally)
}
