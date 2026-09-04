//! The probe where there is no mixer to ask - Android, and any desktop that is
//! neither Linux nor Windows.

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Notify;

// never built here, but the loop matches on it
#[allow(dead_code)]
pub(crate) enum Probe {
    Known(bool),
    Unsupported,
}

pub(crate) fn telegram_is_playing() -> Probe {
    Probe::Unsupported
}

#[derive(Default)]
pub(crate) struct Watcher;

pub(crate) fn watch(_notify: Arc<Notify>) -> Watcher {
    Watcher
}

pub(crate) const IDLE_POLL: Duration = Duration::from_millis(150);
