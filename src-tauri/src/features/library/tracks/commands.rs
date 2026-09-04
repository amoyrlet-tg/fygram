//! The IPC surface of the tracks feature.

use tauri::{AppHandle, State};

use crate::features::library::media;
use crate::shared::models::Track;
use crate::AppState;

use super::service;

#[tauri::command]
pub(crate) async fn list_tracks(state: State<'_, AppState>) -> Result<Vec<Track>, String> {
    Box::pin(async move { service::list(state).await.map_err(String::from) }).await
}

/// None means the file carries no picture.
#[tauri::command]
pub(crate) async fn track_cover(
    state: State<'_, AppState>,
    app: AppHandle,
    track_id: String,
) -> Result<Option<media::covers::Cover>, String> {
    Box::pin(async move {
        service::cover(state, app, track_id)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn retag_tracks(state: State<'_, AppState>) -> Result<u32, String> {
    Box::pin(async move { service::retag_tracks(state).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn update_track(
    state: State<'_, AppState>,
    app: AppHandle,
    track_id: String,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    cover_path: Option<String>,
) -> Result<Track, String> {
    Box::pin(async move {
        let edit = service::TagEdit {
            title,
            artist,
            album,
            cover_path,
        };
        service::update_track(state, app, track_id, edit)
            .await
            .map_err(String::from)
    })
    .await
}

/// Not an edit: the old message is taken down and a new one posted.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) async fn repost_track(
    state: State<'_, AppState>,
    app: AppHandle,
    track_id: String,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    cover_path: Option<String>,
    caption: String,
    delete_original: bool,
) -> Result<Track, String> {
    Box::pin(async move {
        let repost = service::Repost {
            tags: service::TagEdit {
                title,
                artist,
                album,
                cover_path,
            },
            caption,
            delete_original,
        };
        service::repost_track(state, app, track_id, repost)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn search_tracks(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<Track>, String> {
    Box::pin(async move { service::search(state, query).await.map_err(String::from) }).await
}

/// Paths only, no palettes - see `media::covers::cover_paths`.
#[tauri::command]
pub(crate) async fn track_cover_paths(
    state: State<'_, AppState>,
    app: AppHandle,
    track_ids: Vec<String>,
) -> Result<std::collections::HashMap<String, String>, String> {
    Box::pin(async move {
        service::cover_paths(state, app, track_ids)
            .await
            .map_err(String::from)
    })
    .await
}
