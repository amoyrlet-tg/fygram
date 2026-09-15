use super::memlog::{self, WebviewSample};

#[tauri::command]
pub(crate) fn record_memory_sample(sample: WebviewSample) {
    memlog::record(sample);
}
