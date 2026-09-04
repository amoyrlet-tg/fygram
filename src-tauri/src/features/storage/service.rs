//! Moving the library to a new root without losing track of a file.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::shared::error::AppError;
use crate::shared::media_paths;
use crate::shared::settings;
use crate::AppState;

use super::repository;

#[derive(Debug, Serialize)]
pub(crate) struct MediaRootInfo {
    pub(crate) path: String,
    pub(crate) is_default: bool,
    pub(crate) file_count: u32,
    pub(crate) total_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct RelocateProgress {
    pub(crate) moved: usize,
    pub(crate) total: usize,
    pub(crate) done: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct RelocateResult {
    pub(crate) moved: u32,
    pub(crate) failed: u32,
    pub(crate) root: String,
}

pub(crate) async fn info(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<MediaRootInfo, AppError> {
    let root = media_paths::media_root(&app, &state.db)
        .await
        .map_err(|err| AppError::Msg(err.to_string()))?;
    let default =
        media_paths::default_media_root(&app).map_err(|err| AppError::Msg(err.to_string()))?;

    let mut file_count = 0u32;
    let mut total_bytes = 0u64;
    for path in media_paths::walk_audio_files(&root).await {
        if let Ok(meta) = tokio::fs::metadata(&path).await {
            total_bytes += meta.len();
            file_count += 1;
        }
    }

    Ok(MediaRootInfo {
        path: root.to_string_lossy().to_string(),
        is_default: root == default,
        file_count,
        total_bytes,
    })
}

pub(crate) async fn set_root(
    state: State<'_, AppState>,
    app: AppHandle,
    path: String,
    move_existing: bool,
) -> Result<RelocateResult, AppError> {
    let target = PathBuf::from(path.trim());
    if target.as_os_str().is_empty() {
        return Err(AppError::Msg("choose a folder first".to_string()));
    }
    tokio::fs::create_dir_all(&target)
        .await
        .map_err(|err| AppError::Msg(format!("cannot use {target:?}: {err}")))?;
    ensure_writable(&target).await?;

    let current = media_paths::media_root(&app, &state.db)
        .await
        .map_err(|err| AppError::Msg(err.to_string()))?;

    let result = if move_existing && current != target {
        relocate(&state.db, &app, &target).await?
    } else {
        RelocateResult {
            moved: 0,
            failed: 0,
            root: target.to_string_lossy().to_string(),
        }
    };

    settings::set(
        &state.db,
        media_paths::MEDIA_ROOT_KEY,
        &target.to_string_lossy(),
    )
    .await?;
    media_paths::prune_empty_dirs(&current).await;
    let _ = app.emit("library-changed", ());

    Ok(result)
}

const LAYOUT_VERSION: &str = "2";
const LAYOUT_VERSION_KEY: &str = "media_layout_version";

pub(crate) async fn ensure_layout(app: &AppHandle, db: &sqlx::SqlitePool) {
    match settings::get(db, LAYOUT_VERSION_KEY).await {
        Ok(Some(version)) if version == LAYOUT_VERSION => return,
        Err(err) => {
            eprintln!("storage: could not read the layout version: {err}");
            return;
        }
        _ => {}
    }

    let Ok(root) = media_paths::media_root(app, db).await else {
        return;
    };
    match relocate(db, app, &root).await {
        Ok(result) => {
            if result.moved > 0 {
                eprintln!(
                    "storage: moved {} file(s) into the sharded tree",
                    result.moved
                );
            }
            media_paths::prune_empty_dirs(&root).await;
            if let Err(err) = settings::set(db, LAYOUT_VERSION_KEY, LAYOUT_VERSION).await {
                eprintln!("storage: could not record the layout version: {err}");
            }
        }
        Err(err) => eprintln!("storage: could not rearrange the media folder: {err}"),
    }
}

async fn relocate(
    db: &sqlx::SqlitePool,
    app: &AppHandle,
    to_root: &Path,
) -> Result<RelocateResult, AppError> {
    let tracks = repository::tracks_with_files(db).await?;
    let total = tracks.len();
    let mut moved = 0u32;
    let mut failed = 0u32;

    for (index, row) in tracks.into_iter().enumerate() {
        let source = PathBuf::from(&row.file_path);
        if tokio::fs::metadata(&source).await.is_err() {
            continue;
        }

        let hash = if row.file_hash.is_empty() {
            source
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default()
        } else {
            row.file_hash.clone()
        };
        let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("mp3");
        let destination = media_paths::track_path(to_root, &row.channel_id, &hash, ext);

        if destination == source {
            continue;
        }
        match media_paths::move_file(&source, &destination).await {
            Ok(()) => {
                let path = destination.to_string_lossy().to_string();
                repository::repoint_file(db, &row.file_path, &path).await?;
                moved += 1;
            }
            Err(err) => {
                eprintln!("storage: could not move {source:?}: {err:#}");
                failed += 1;
            }
        }

        if index % 16 == 0 || index + 1 == total {
            let _ = app.emit(
                "storage-progress",
                RelocateProgress {
                    moved: index + 1,
                    total,
                    done: false,
                },
            );
        }
    }

    let _ = app.emit(
        "storage-progress",
        RelocateProgress {
            moved: total,
            total,
            done: true,
        },
    );

    Ok(RelocateResult {
        moved,
        failed,
        root: to_root.to_string_lossy().to_string(),
    })
}

async fn ensure_writable(dir: &Path) -> Result<(), AppError> {
    let probe = dir.join(".fygram-write-test");
    tokio::fs::write(&probe, b"ok")
        .await
        .map_err(|err| AppError::Msg(format!("cannot write to {dir:?}: {err}")))?;
    let _ = tokio::fs::remove_file(&probe).await;
    Ok(())
}
