//! The IPC surface of playback: play, pause, seek, volume, position.

use tauri::{AppHandle, State};

use crate::AppState;

use super::audio;
use super::service;

use crate::features::ducking;

#[tauri::command]
pub(crate) async fn play_track(
    state: State<'_, AppState>,
    app: AppHandle,
    track_id: String,
    seq: u64,
) -> Result<(), String> {
    Box::pin(async move {
        let result = service::play(state, app, track_id, seq)
            .await
            .map_err(String::from);
        ducking::service::set_playback_active(result.is_ok());
        result
    })
    .await
}

#[tauri::command]
pub(crate) fn prefetch_track(app: AppHandle, track_id: String) {
    service::spawn_prefetch(app, track_id);
}

#[tauri::command]
pub(crate) fn pause_playback(state: State<'_, AppState>) {
    state.player.pause();
    ducking::service::set_playback_active(false);
}

#[tauri::command]
pub(crate) fn resume_playback(state: State<'_, AppState>) {
    state.player.resume();
    ducking::service::set_playback_active(true);
}

#[tauri::command]
pub(crate) fn stop_playback(state: State<'_, AppState>, seq: u64) {
    state.player.stop_for_switch(seq);
    ducking::service::set_playback_active(false);
}

#[tauri::command]
pub(crate) fn set_volume(state: State<'_, AppState>, volume: f32) {
    state.player.set_volume(volume);
}

#[tauri::command]
pub(crate) fn seek_playback(state: State<'_, AppState>, seconds: f64) {
    state.player.seek(seconds);
}

#[tauri::command]
pub(crate) fn get_playback_position(state: State<'_, AppState>) -> audio::PlaybackState {
    state.player.position()
}
