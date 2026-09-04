//! What the UI is told about sync, and the handle the engine is woken through.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Notify, RwLock};

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub(crate) struct SyncStatus {
    pub(crate) online: bool,
    pub(crate) syncing: bool,
    pub(crate) pending: i64,
    pub(crate) last_synced_at: Option<DateTime<Utc>>,
    pub(crate) pending_since: Option<DateTime<Utc>>,
    pub(crate) last_error: Option<String>,
    pub(crate) ready: bool,
    pub(crate) session_invalid: bool,
}

pub(crate) struct SyncHandle {
    wake: Notify,
    pull_requested: AtomicBool,
    status: RwLock<SyncStatus>,
}

impl SyncHandle {
    pub(crate) fn new() -> Arc<Self> {
        Arc::new(Self {
            wake: Notify::new(),
            pull_requested: AtomicBool::new(true),
            status: RwLock::new(SyncStatus::default()),
        })
    }

    pub(crate) fn nudge(&self) {
        self.wake.notify_one();
    }

    pub(crate) fn request_pull(&self) {
        self.pull_requested.store(true, Ordering::SeqCst);
        self.nudge();
    }

    pub(crate) async fn wait_for_work(&self, timeout: std::time::Duration) {
        tokio::select! {
            _ = self.wake.notified() => {}
            _ = tokio::time::sleep(timeout) => {}
        }
    }

    pub(crate) fn take_pull_request(&self) -> bool {
        self.pull_requested.swap(false, Ordering::SeqCst)
    }

    pub(crate) async fn snapshot(&self) -> SyncStatus {
        self.status.read().await.clone()
    }

    pub(crate) async fn update(&self, app: &AppHandle, edit: impl FnOnce(&mut SyncStatus)) {
        let next = {
            let mut status = self.status.write().await;
            let before = status.clone();
            edit(&mut status);
            if *status == before {
                return;
            }
            status.clone()
        };
        let _ = app.emit("sync-status", next);
    }
}
