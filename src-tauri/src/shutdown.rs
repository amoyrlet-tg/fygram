//! Letting the app finish what it started. `spawn_tracked` is how background
//! work asks to be waited for.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, RunEvent};

use crate::AppState;

const DRAIN_TIMEOUT: Duration = Duration::from_millis(1500);

static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);

pub(crate) fn on_run_event(app: &AppHandle, event: RunEvent) {
    if let RunEvent::ExitRequested { api, .. } = event {
        if SHUTTING_DOWN.swap(true, Ordering::SeqCst) {
            return;
        }
        api.prevent_exit();
        teardown(app);
        app.exit(0);
    }
}

fn teardown(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };

    state.player.stop_now();

    tauri::async_runtime::block_on(async {
        for flag in state.sync_cancel_flags.lock().await.values() {
            flag.store(true, Ordering::Relaxed);
        }

        state.shutdown.cancel();
        state.tasks.close();
        if tokio::time::timeout(DRAIN_TIMEOUT, state.tasks.wait())
            .await
            .is_err()
        {
            eprintln!(
                "shutdown: background tasks still running after {DRAIN_TIMEOUT:?} - exiting anyway"
            );
        }

        state.telegram.shutdown().await;

        state.db.close().await;
    });
}

pub(crate) fn spawn_tracked<F>(app: &AppHandle, future: F)
where
    F: std::future::Future<Output = ()> + Send + 'static,
{
    let Some(state) = app.try_state::<AppState>() else {
        tauri::async_runtime::spawn(future);
        return;
    };
    let token = state.shutdown.clone();
    let tracked = state.tasks.track_future(async move {
        tokio::select! {
            _ = token.cancelled() => {}
            _ = future => {}
        }
    });
    tauri::async_runtime::spawn(tracked);
}
