use super::memlog::{self, WebviewSample};

/// The webview hands over what only it can see; the log line is assembled in
/// the background task, so this only has to remember the latest one.
#[tauri::command]
pub(crate) fn record_memory_sample(sample: WebviewSample) {
    memlog::record(sample);
}
