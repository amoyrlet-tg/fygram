//! The IPC surface of the media root: reading it and moving it.

use tauri::{AppHandle, State};

use crate::AppState;

use super::service::{self, MediaRootInfo, RelocateResult};

#[tauri::command]
pub(crate) async fn get_media_root(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<MediaRootInfo, String> {
    Box::pin(async move { service::info(state, app).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn set_media_root(
    state: State<'_, AppState>,
    app: AppHandle,
    path: String,
    move_existing: bool,
) -> Result<RelocateResult, String> {
    Box::pin(async move {
        service::set_root(state, app, path, move_existing)
            .await
            .map_err(String::from)
    })
    .await
}
