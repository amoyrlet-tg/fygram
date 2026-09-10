use tauri::{AppHandle, State};

use crate::features::library::ingest::{SyncDepth, SyncStats};
use crate::features::library::media;
use crate::shared::models::Channel;
use crate::AppState;

use super::service;

#[tauri::command]
pub(crate) async fn list_channels(state: State<'_, AppState>) -> Result<Vec<Channel>, String> {
    Box::pin(async move { service::list(state).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn add_channel_by_link(
    state: State<'_, AppState>,
    app: AppHandle,
    link: String,
) -> Result<Channel, String> {
    Box::pin(async move {
        service::add_by_link(state, app, link)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn sync_channel(
    state: State<'_, AppState>,
    app: AppHandle,
    channel_id: String,
    depth: Option<SyncDepth>,
) -> Result<SyncStats, String> {
    Box::pin(async move {
        service::sync(state, app, channel_id, depth.unwrap_or_default())
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn refresh_channel_rights(
    state: State<'_, AppState>,
    app: AppHandle,
    channel_id: String,
) -> Result<bool, String> {
    Box::pin(async move {
        service::refresh_rights(&state, &app, &channel_id)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn cancel_sync(
    state: State<'_, AppState>,
    channel_id: String,
) -> Result<(), String> {
    Box::pin(async move {
        service::cancel(state, channel_id)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn download_channel(
    state: State<'_, AppState>,
    app: AppHandle,
    channel_id: String,
) -> Result<media::download::DownloadStats, String> {
    Box::pin(async move {
        service::download(state, app, channel_id)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn rename_channel(
    state: State<'_, AppState>,
    app: AppHandle,
    channel_id: String,
    title: String,
) -> Result<(), String> {
    Box::pin(async move {
        service::rename(state, app, channel_id, title)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn set_channel_photo(
    state: State<'_, AppState>,
    app: AppHandle,
    channel_id: String,
    path: String,
) -> Result<(), String> {
    Box::pin(async move {
        service::set_photo(state, app, channel_id, path)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn delete_channel(
    state: State<'_, AppState>,
    app: AppHandle,
    channel_id: String,
) -> Result<(), String> {
    Box::pin(async move {
        service::delete(state, app, channel_id)
            .await
            .map_err(String::from)
    })
    .await
}
