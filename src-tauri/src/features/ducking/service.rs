//! The loop that watches the probe and steps our own volume down while a Telegram client is playing.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Notify;

use crate::shared::settings;
use crate::AppState;

use super::probe::{self, Probe};

pub(crate) const ENABLED_KEY: &str = "ducking_enabled";

const IDLE_WHEN_SILENT: Duration = Duration::from_secs(1);

static PLAYBACK_ACTIVE: AtomicBool = AtomicBool::new(false);

static WATCHING: AtomicBool = AtomicBool::new(false);

pub(crate) fn set_playback_active(active: bool) {
    PLAYBACK_ACTIVE.store(active, Ordering::Relaxed);
}

#[derive(Clone, Copy, PartialEq, serde::Serialize)]
struct ForeignAudio {
    active: bool,
}

pub(crate) fn spawn(app: AppHandle) {
    if WATCHING.swap(true, Ordering::SeqCst) {
        return;
    }
    let handle = app.clone();
    crate::shutdown::spawn_tracked(&handle, async move {
        run(app).await;
        WATCHING.store(false, Ordering::SeqCst);
    });
}

async fn run(app: AppHandle) {
    let mut reported = false;
    let mut wait = IDLE_WHEN_SILENT;

    let notify = Arc::new(Notify::new());
    let _watcher = probe::watch(notify.clone());

    loop {
        let shutdown = app.state::<AppState>().shutdown.clone();
        tokio::select! {
            _ = shutdown.cancelled() => return,
            _ = notify.notified() => {}
            _ = tokio::time::sleep(wait) => {}
        }

        let db = app.state::<AppState>().db.clone();
        let enabled = settings::get(&db, ENABLED_KEY)
            .await
            .ok()
            .flatten()
            .as_deref()
            == Some("1");

        if !enabled || (!PLAYBACK_ACTIVE.load(Ordering::Relaxed) && !reported) {
            if reported {
                reported = false;
                let _ = app.emit("foreign-audio", ForeignAudio { active: false });
            }
            wait = IDLE_WHEN_SILENT;
            continue;
        }
        wait = probe::IDLE_POLL;

        let heard = match tokio::task::spawn_blocking(probe::telegram_is_playing).await {
            Ok(Probe::Known(heard)) => heard,
            Ok(Probe::Unsupported) => {
                eprintln!(
                    "ducking: nothing here can say which app is playing; leaving playback alone"
                );
                if reported {
                    let _ = app.emit("foreign-audio", ForeignAudio { active: false });
                }
                return;
            }
            Err(err) => {
                eprintln!("ducking: probe task failed: {err}");
                continue;
            }
        };

        if heard != reported {
            reported = heard;
            let _ = app.emit("foreign-audio", ForeignAudio { active: heard });
        }
    }
}
