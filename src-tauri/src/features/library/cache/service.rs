//! Measuring the library on disk and deciding what a cleanup takes with it.

use tauri::{AppHandle, Emitter, State};

use crate::shared::error::AppError;
use crate::shared::media_paths;
use crate::AppState;

use super::repository;

const PART_FILE_GRACE: std::time::Duration = std::time::Duration::from_secs(600);

async fn scan_media_files(
    root: &std::path::Path,
    active_channel_ids: &std::collections::HashSet<String>,
) -> Vec<std::path::PathBuf> {
    let mut out = media_paths::walk_audio_files(root).await;
    for path in media_paths::stale_incoming_files(root, PART_FILE_GRACE).await {
        let channel = path
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if !active_channel_ids.contains(&channel) {
            out.push(path);
        }
    }
    out
}

#[derive(serde::Serialize)]
pub(crate) struct CacheStats {
    pub(crate) total_bytes: u64,
    pub(crate) track_count: u32,

    pub(crate) orphaned_bytes: u64,
    pub(crate) orphaned_files: u32,
}

pub(crate) async fn stats(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CacheStats, AppError> {
    let dir = media_paths::media_root(&app, &state.db)
        .await
        .map_err(|err| AppError::Msg(err.to_string()))?;
    let tracked = repository::tracked_file_paths(&state.db).await?;

    let mut total_bytes = 0u64;
    let mut track_count = 0u32;
    for path in &tracked {
        if let Ok(meta) = tokio::fs::metadata(path).await {
            total_bytes += meta.len();
            track_count += 1;
        }
    }

    let active_channel_ids: std::collections::HashSet<String> = state
        .sync_cancel_flags
        .lock()
        .await
        .keys()
        .cloned()
        .collect();
    let mut orphaned_bytes = 0u64;
    let mut orphaned_files = 0u32;
    for path in scan_media_files(&dir, &active_channel_ids).await {
        if tracked.contains(&path.to_string_lossy().to_string()) {
            continue;
        }
        if let Ok(meta) = tokio::fs::metadata(&path).await {
            orphaned_bytes += meta.len();
            orphaned_files += 1;
        }
    }

    Ok(CacheStats {
        total_bytes,
        track_count,
        orphaned_bytes,
        orphaned_files,
    })
}

#[derive(serde::Serialize)]
pub(crate) struct CacheCleanupResult {
    pub(crate) freed_bytes: u64,
    pub(crate) deleted_orphan_files: u32,
    pub(crate) evicted_tracks: u32,
}

pub(crate) async fn cleanup(
    state: State<'_, AppState>,
    app: AppHandle,
    target_bytes: u64,
) -> Result<CacheCleanupResult, AppError> {
    let dir = media_paths::media_root(&app, &state.db)
        .await
        .map_err(|err| AppError::Msg(err.to_string()))?;
    let tracked = repository::tracked_file_paths(&state.db).await?;

    let active_channel_ids: std::collections::HashSet<String> = state
        .sync_cancel_flags
        .lock()
        .await
        .keys()
        .cloned()
        .collect();
    let mut freed_bytes = 0u64;
    let mut deleted_orphan_files = 0u32;

    for path in scan_media_files(&dir, &active_channel_ids).await {
        if tracked.contains(&path.to_string_lossy().to_string()) {
            continue;
        }
        if let Ok(meta) = tokio::fs::metadata(&path).await {
            if tokio::fs::remove_file(&path).await.is_ok() {
                freed_bytes += meta.len();
                deleted_orphan_files += 1;
            }
        }
    }

    let mut evicted_tracks = 0u32;

    if freed_bytes < target_bytes {
        let remaining = target_bytes - freed_bytes;
        let rows = repository::eviction_candidates(&state.db).await?;
        let current_playing = state.player.current_path();

        let mut freed_from_tracks = 0u64;
        for row in rows {
            if freed_from_tracks >= remaining {
                break;
            }
            if current_playing
                .as_deref()
                .is_some_and(|p| p.as_os_str() == std::ffi::OsStr::new(&row.file_path))
            {
                continue;
            }
            let Ok(meta) = tokio::fs::metadata(&row.file_path).await else {
                continue;
            };
            let size = meta.len();

            evicted_tracks += repository::evict_file(&state.db, &row.file_path).await? as u32;

            if tokio::fs::remove_file(&row.file_path).await.is_ok() {
                freed_from_tracks += size;
                freed_bytes += size;
            }
        }
    }

    let _ = app.emit("library-changed", ());

    Ok(CacheCleanupResult {
        freed_bytes,
        deleted_orphan_files,
        evicted_tracks,
    })
}

#[derive(Debug, Clone, serde::Deserialize)]
pub(crate) struct CachePlan {
    #[serde(default)]
    pub(crate) keep_playlist_ids: Vec<String>,
    #[serde(default)]
    pub(crate) keep_channel_ids: Vec<String>,
    #[serde(default)]
    pub(crate) drop_orphans: bool,
}

#[derive(Debug, Default, serde::Serialize)]
pub(crate) struct CachePreview {
    pub(crate) keep_bytes: u64,
    pub(crate) keep_tracks: u32,
    pub(crate) free_bytes: u64,
    pub(crate) free_tracks: u32,
    pub(crate) orphan_bytes: u64,
    pub(crate) orphan_files: u32,
}

async fn size_of(path: &str) -> Option<u64> {
    tokio::fs::metadata(path).await.ok().map(|m| m.len())
}

pub(crate) async fn preview(
    state: State<'_, AppState>,
    app: AppHandle,
    plan: CachePlan,
) -> Result<CachePreview, AppError> {
    let root = media_paths::media_root(&app, &state.db)
        .await
        .map_err(|err| AppError::Msg(err.to_string()))?;
    let (protected, removable) = repository::partition_by_keep_lists(
        &state.db,
        &plan.keep_playlist_ids,
        &plan.keep_channel_ids,
    )
    .await?;

    let mut preview = CachePreview::default();
    for path in &protected {
        if let Some(size) = size_of(path).await {
            preview.keep_bytes += size;
            preview.keep_tracks += 1;
        }
    }
    for path in &removable {
        if let Some(size) = size_of(path).await {
            preview.free_bytes += size;
            preview.free_tracks += 1;
        }
    }

    let tracked = repository::tracked_file_paths(&state.db).await?;
    let active: std::collections::HashSet<String> = state
        .sync_cancel_flags
        .lock()
        .await
        .keys()
        .cloned()
        .collect();
    for path in scan_media_files(&root, &active).await {
        if tracked.contains(&path.to_string_lossy().to_string()) {
            continue;
        }
        if let Ok(meta) = tokio::fs::metadata(&path).await {
            preview.orphan_bytes += meta.len();
            preview.orphan_files += 1;
        }
    }

    Ok(preview)
}

pub(crate) async fn apply(
    state: State<'_, AppState>,
    app: AppHandle,
    plan: CachePlan,
) -> Result<CacheCleanupResult, AppError> {
    let root = media_paths::media_root(&app, &state.db)
        .await
        .map_err(|err| AppError::Msg(err.to_string()))?;
    let (_, removable) = repository::partition_by_keep_lists(
        &state.db,
        &plan.keep_playlist_ids,
        &plan.keep_channel_ids,
    )
    .await?;

    let current_playing = state.player.current_path();
    let mut freed_bytes = 0u64;
    let mut evicted_tracks = 0u32;

    for path in removable {
        if current_playing
            .as_deref()
            .is_some_and(|p| p.as_os_str() == std::ffi::OsStr::new(&path))
        {
            continue;
        }
        let size = size_of(&path).await.unwrap_or(0);
        evicted_tracks += repository::evict_file(&state.db, &path).await? as u32;
        if tokio::fs::remove_file(&path).await.is_ok() {
            freed_bytes += size;
        }
    }

    let mut deleted_orphan_files = 0u32;
    if plan.drop_orphans {
        let tracked = repository::tracked_file_paths(&state.db).await?;
        let active: std::collections::HashSet<String> = state
            .sync_cancel_flags
            .lock()
            .await
            .keys()
            .cloned()
            .collect();
        for path in scan_media_files(&root, &active).await {
            if tracked.contains(&path.to_string_lossy().to_string()) {
                continue;
            }
            if let Ok(meta) = tokio::fs::metadata(&path).await {
                if tokio::fs::remove_file(&path).await.is_ok() {
                    freed_bytes += meta.len();
                    deleted_orphan_files += 1;
                }
            }
        }
    }

    media_paths::prune_empty_dirs(&root).await;

    let _ = app.emit("library-changed", ());

    Ok(CacheCleanupResult {
        freed_bytes,
        deleted_orphan_files,
        evicted_tracks,
    })
}
