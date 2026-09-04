//! The IPC surface of playlists: creating, filling, reordering and deleting one.

use tauri::{AppHandle, State};

use crate::features::library::media;
use crate::shared::models::{Playlist, Track};
use crate::AppState;

use super::service;

#[tauri::command]
pub(crate) async fn list_playlists(state: State<'_, AppState>) -> Result<Vec<Playlist>, String> {
    Box::pin(async move { service::list(state).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn create_playlist(
    state: State<'_, AppState>,
    name: String,
) -> Result<Playlist, String> {
    Box::pin(async move { service::create(state, name).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn download_playlist(
    state: State<'_, AppState>,
    app: AppHandle,
    playlist_id: String,
) -> Result<media::download::DownloadStats, String> {
    Box::pin(async move {
        service::download(state, app, playlist_id)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn list_playlist_tracks(
    state: State<'_, AppState>,
    playlist_id: String,
) -> Result<Vec<Track>, String> {
    Box::pin(async move {
        service::list_tracks(state, playlist_id)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn add_track_to_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    track_id: String,
) -> Result<(), String> {
    Box::pin(async move {
        service::add_track(state, playlist_id, track_id)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn remove_track_from_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    track_id: String,
) -> Result<(), String> {
    Box::pin(async move {
        service::remove_track(state, playlist_id, track_id)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn reorder_playlist_track(
    state: State<'_, AppState>,
    playlist_id: String,
    track_id: String,
    new_index: i64,
) -> Result<(), String> {
    Box::pin(async move {
        service::reorder(state, playlist_id, track_id, new_index)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn delete_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
) -> Result<(), String> {
    Box::pin(async move {
        service::delete(state, playlist_id)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn rename_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    name: String,
) -> Result<Playlist, String> {
    Box::pin(async move {
        service::rename(state, playlist_id, name)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn set_playlist_cover(
    state: State<'_, AppState>,
    app: AppHandle,
    playlist_id: String,
    source_path: String,
) -> Result<Playlist, String> {
    Box::pin(async move {
        service::set_cover(state, app, playlist_id, source_path)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn clear_playlist_cover(
    state: State<'_, AppState>,
    app: AppHandle,
    playlist_id: String,
) -> Result<Playlist, String> {
    Box::pin(async move {
        service::clear_cover(state, app, playlist_id)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn playlist_cover_sources(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, Vec<String>>, String> {
    Box::pin(async move { service::cover_sources(state).await.map_err(String::from) }).await
}
