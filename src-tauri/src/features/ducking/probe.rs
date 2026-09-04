//! What a platform probe has to be able to answer, and which one is compiled in.

pub(crate) enum Probe {
    Known(bool),
    Unsupported,
}

#[cfg(target_os = "windows")]
pub(crate) use super::probe_windows::telegram_is_playing;

#[cfg(target_os = "linux")]
pub(crate) use super::probe_linux::{telegram_is_playing, watch};

#[cfg(target_os = "windows")]
pub(crate) use fallback::watch;

#[cfg(target_os = "windows")]
mod fallback {
    use std::sync::Arc;
    use tokio::sync::Notify;

    #[derive(Default)]
    pub(crate) struct Watcher;

    pub(crate) fn watch(_notify: Arc<Notify>) -> Watcher {
        Watcher
    }
}

#[cfg(target_os = "linux")]
pub(crate) const IDLE_POLL: std::time::Duration = std::time::Duration::from_secs(2);
#[cfg(target_os = "windows")]
pub(crate) const IDLE_POLL: std::time::Duration = std::time::Duration::from_millis(150);
