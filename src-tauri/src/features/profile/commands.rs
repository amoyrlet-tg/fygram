use tauri::Manager;
use tauri::{AppHandle, State};

use crate::AppState;

use super::service;

#[tauri::command]
pub(crate) async fn get_profile_sync_enabled(state: State<'_, AppState>) -> Result<bool, String> {
    Box::pin(async move { service::sync_enabled(state).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn set_profile_sync_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    Box::pin(async move {
        service::set_sync_enabled(state, enabled)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) fn set_now_playing_track(
    app: AppHandle,
    track_id: Option<String>,
) -> Result<(), String> {
    service::spawn_set_now_playing(app, track_id);
    Ok(())
}

#[tauri::command]
pub(crate) fn get_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    service::autostart_enabled(&app).map_err(String::from)
}

#[tauri::command]
pub(crate) fn set_autostart_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    service::set_autostart_enabled(&app, enabled).map_err(String::from)
}

#[tauri::command]
pub(crate) async fn detect_language() -> String {
    Box::pin(async move { service::detect_language().await }).await
}

#[cfg(target_os = "windows")]
static RESTORE_MAXIMIZED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[cfg(target_os = "windows")]
fn apply_fullscreen(window: &tauri::WebviewWindow, on: bool) -> Result<(), String> {
    use std::sync::atomic::Ordering;

    if on {
        let was_maximized = window.is_maximized().map_err(|e| e.to_string())?;
        RESTORE_MAXIMIZED.store(was_maximized, Ordering::Relaxed);
        if was_maximized {
            window.unmaximize().map_err(|e| e.to_string())?;
        }
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
    } else {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        if RESTORE_MAXIMIZED.swap(false, Ordering::Relaxed) {
            window.maximize().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn apply_fullscreen(window: &tauri::WebviewWindow, on: bool) -> Result<(), String> {
    window.set_fullscreen(on).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn toggle_fullscreen(app: AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main").ok_or("no main window")?;
    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    apply_fullscreen(&window, !is_fullscreen)?;
    Ok(!is_fullscreen)
}

#[tauri::command]
pub(crate) async fn list_profile_music(
    state: State<'_, AppState>,
) -> Result<Vec<super::music::ProfileTrack>, String> {
    Box::pin(async move { super::music::list(state).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn add_profile_music(
    state: State<'_, AppState>,
    app: AppHandle,
    track_id: String,
) -> Result<(), String> {
    Box::pin(async move {
        super::music::add(state, app, track_id)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn remove_profile_music(
    state: State<'_, AppState>,
    app: AppHandle,
    document_id: String,
) -> Result<(), String> {
    Box::pin(async move {
        super::music::remove(state, app, document_id)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn reorder_profile_music(
    state: State<'_, AppState>,
    app: AppHandle,
    document_id: String,
    after_document_id: Option<String>,
) -> Result<(), String> {
    Box::pin(async move {
        super::music::reorder(state, app, document_id, after_document_id)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn toggle_profile_music(
    state: State<'_, AppState>,
    app: AppHandle,
    track_id: String,
) -> Result<bool, String> {
    Box::pin(async move {
        super::music::toggle(state, app, track_id)
            .await
            .map_err(String::from)
    })
    .await
}
