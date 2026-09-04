//! What the machine underneath actually is.
//!
//! Window width is a different question and lives in `src/layouts`: a desktop
//! window dragged narrow is still a desktop.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct Host {
    /// `linux`, `macos`, `windows`, `android` or `ios`.
    pub(crate) os: &'static str,

    /// Whether autostart, fullscreen and ducking mean anything here.
    pub(crate) desktop: bool,
}

#[tauri::command]
pub(crate) fn host_info() -> Host {
    Host {
        os: std::env::consts::OS,
        desktop: cfg!(desktop),
    }
}
