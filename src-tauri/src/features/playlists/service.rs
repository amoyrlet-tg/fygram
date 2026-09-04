//! What the playlist commands do, and what they queue for the sync engine afterwards.

use std::collections::HashMap;

use chrono::Utc;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::features::library::media;
use crate::features::sync::outbox;
use crate::features::sync::stamp::device_id;
use crate::shared::error::AppError;
use crate::shared::media_paths;
use crate::shared::models::{Playlist, Track};
use crate::AppState;

use super::repository;

async fn mark_changed(state: &AppState, playlist_id: &str) -> Result<(), AppError> {
    let device = device_id(&state.db).await;
    repository::touch_and_queue(&state.db, playlist_id, &device).await?;
    state.sync.nudge();
    Ok(())
}

pub(crate) async fn queue_playlist(db: &sqlx::SqlitePool, playlist_id: &str) {
    let device = device_id(db).await;
    if let Err(err) = repository::touch_and_queue(db, playlist_id, &device).await {
        eprintln!("sync: could not queue playlist {playlist_id}: {err}");
    }
}

pub(crate) async fn list(state: State<'_, AppState>) -> Result<Vec<Playlist>, AppError> {
    repository::list(&state.db).await
}

pub(crate) async fn create(state: State<'_, AppState>, name: String) -> Result<Playlist, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Msg("playlist name cannot be empty".to_string()));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let device = device_id(&state.db).await;
    repository::insert(&state.db, &id, name, &device).await?;
    outbox::enqueue(&state.db, outbox::PLAYLIST, &id).await;
    state.sync.nudge();

    repository::get(&state.db, &id).await
}

pub(crate) async fn download(
    state: State<'_, AppState>,
    app: AppHandle,
    playlist_id: String,
) -> Result<media::download::DownloadStats, AppError> {
    let dir = media_paths::media_root(&app, &state.db)
        .await
        .map_err(|err| AppError::Msg(err.to_string()))?;

    let cancel = Arc::new(AtomicBool::new(false));
    state
        .sync_cancel_flags
        .lock()
        .await
        .insert(playlist_id.clone(), cancel.clone());

    let result = media::download::download_playlist_tracks(
        &state.db,
        &state.telegram,
        &dir,
        &playlist_id,
        cancel,
        &state.download_locks,
        |progress| {
            let _ = app.emit("download-progress", progress);
        },
    )
    .await;

    state.sync_cancel_flags.lock().await.remove(&playlist_id);

    result.map_err(|err| {
        eprintln!("download_playlist({playlist_id}) failed: {err:#}");
        AppError::Telegram(err)
    })
}

pub(crate) async fn list_tracks(
    state: State<'_, AppState>,
    playlist_id: String,
) -> Result<Vec<Track>, AppError> {
    repository::list_tracks(&state.db, &playlist_id).await
}

pub(crate) async fn add_track(
    state: State<'_, AppState>,
    playlist_id: String,
    track_id: String,
) -> Result<(), AppError> {
    let next_position = repository::next_position(&state.db, &playlist_id).await?;
    repository::add_track(&state.db, &playlist_id, &track_id, next_position).await?;

    mark_changed(&state, &playlist_id).await
}

pub(crate) async fn remove_track(
    state: State<'_, AppState>,
    playlist_id: String,
    track_id: String,
) -> Result<(), AppError> {
    repository::remove_track(&state.db, &playlist_id, &track_id).await?;

    mark_changed(&state, &playlist_id).await
}

pub(crate) async fn reorder(
    state: State<'_, AppState>,
    playlist_id: String,
    track_id: String,
    new_index: i64,
) -> Result<(), AppError> {
    let mut ids = repository::track_ids_ordered(&state.db, &playlist_id).await?;

    let current_index = ids
        .iter()
        .position(|id| id == &track_id)
        .ok_or_else(|| AppError::Msg("track not in playlist".to_string()))?;
    ids.remove(current_index);
    let target = new_index.clamp(0, ids.len() as i64) as usize;
    ids.insert(target, track_id);

    repository::apply_order(&state.db, &playlist_id, &ids).await?;

    mark_changed(&state, &playlist_id).await
}

pub(crate) async fn delete(
    state: State<'_, AppState>,
    playlist_id: String,
) -> Result<(), AppError> {
    let device = device_id(&state.db).await;
    repository::tombstone(&state.db, &playlist_id, &device).await?;
    outbox::enqueue(&state.db, outbox::PLAYLIST, &playlist_id).await;
    state.sync.nudge();
    Ok(())
}

pub(crate) async fn rename(
    state: State<'_, AppState>,
    playlist_id: String,
    name: String,
) -> Result<Playlist, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Msg("playlist name cannot be empty".to_string()));
    }
    repository::rename(&state.db, &playlist_id, name).await?;
    mark_changed(&state, &playlist_id).await?;

    repository::get(&state.db, &playlist_id).await
}

/// Returns the path to store on the row.
pub(crate) async fn store_cover(
    root: &std::path::Path,
    playlist_id: &str,
    jpeg: &[u8],
) -> Option<String> {
    let dest = media_paths::playlist_cover_path(root, playlist_id, Utc::now().timestamp_millis());
    if let Some(parent) = dest.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    if let Err(err) = tokio::fs::write(&dest, jpeg).await {
        eprintln!("playlists: could not save the cover of {playlist_id}: {err}");
        return None;
    }
    drop_covers(root, playlist_id, Some(&dest)).await;
    Some(dest.to_string_lossy().to_string())
}

pub(crate) async fn drop_covers(
    root: &std::path::Path,
    playlist_id: &str,
    keep: Option<&std::path::Path>,
) {
    let prefix = format!("{playlist_id}-");
    let Ok(mut entries) = tokio::fs::read_dir(media_paths::playlist_covers_dir(root)).await else {
        return;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with(&prefix) && Some(path.as_path()) != keep {
            let _ = tokio::fs::remove_file(&path).await;
        }
    }
}

/// Re-encoded rather than copied: a 12 MP photograph would travel to Telegram
/// on every sync, and an unreadable file is refused before anything is written.
pub(crate) async fn set_cover(
    state: State<'_, AppState>,
    app: AppHandle,
    playlist_id: String,
    source_path: String,
) -> Result<Playlist, AppError> {
    let picture = tokio::fs::read(&source_path)
        .await
        .map_err(|err| AppError::Msg(format!("reading {source_path}: {err}")))?;
    let jpeg = media::covers::encode_cover(picture)
        .await
        .map_err(|err| AppError::Msg(format!("{err:#}")))?;

    let root = media_paths::media_root(&app, &state.db).await?;
    let stored = store_cover(&root, &playlist_id, &jpeg)
        .await
        .ok_or_else(|| AppError::Msg("could not save the cover".to_string()))?;

    repository::set_cover_path(&state.db, &playlist_id, Some(&stored)).await?;
    mark_changed(&state, &playlist_id).await?;
    let _ = app.emit("library-changed", ());
    repository::get(&state.db, &playlist_id).await
}

pub(crate) async fn clear_cover(
    state: State<'_, AppState>,
    app: AppHandle,
    playlist_id: String,
) -> Result<Playlist, AppError> {
    if let Ok(root) = media_paths::media_root(&app, &state.db).await {
        drop_covers(&root, &playlist_id, None).await;
    }
    repository::set_cover_path(&state.db, &playlist_id, None).await?;
    mark_changed(&state, &playlist_id).await?;
    let _ = app.emit("library-changed", ());
    repository::get(&state.db, &playlist_id).await
}

/// See `repository::cover_sources`.
pub(crate) async fn cover_sources(
    state: State<'_, AppState>,
) -> Result<HashMap<String, Vec<String>>, AppError> {
    let rows = repository::cover_sources(&state.db).await?;
    let mut sources: HashMap<String, Vec<String>> = HashMap::new();
    for (playlist_id, track_id) in rows {
        sources.entry(playlist_id).or_default().push(track_id);
    }
    Ok(sources)
}
