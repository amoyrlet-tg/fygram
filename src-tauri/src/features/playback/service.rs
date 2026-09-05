//! Getting a track ready to play - which mostly means making sure its bytes are on disk first.

use tauri::{AppHandle, Emitter, Manager, State};

use crate::features::library::media;
use crate::shared::error::AppError;
use crate::shared::media_paths;
use crate::shared::models::Track;
use crate::AppState;

#[derive(Debug, Clone, serde::Serialize)]
pub(crate) struct TrackFetchProgress {
    pub(crate) track_id: String,
    pub(crate) downloaded: usize,
    pub(crate) total: usize,
}

pub(crate) async fn play(
    state: State<'_, AppState>,
    app: AppHandle,
    track_id: String,
    seq: u64,
) -> Result<(), AppError> {
    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(&track_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::Msg("track not found".to_string()))?;

    let needs_fetch =
        track.file_path.is_empty() || tokio::fs::metadata(&track.file_path).await.is_err();
    let file_path = if needs_fetch {
        state.player.stop_for_switch(seq);
        let dir = media_paths::media_root(&app, &state.db)
            .await
            .map_err(|err| AppError::Msg(err.to_string()))?;
        media::download::ensure_track_downloaded(
            &state.db,
            &state.telegram,
            &dir,
            &track,
            &state.download_locks,
            |downloaded, total| {
                let _ = app.emit(
                    "track-fetch-progress",
                    TrackFetchProgress {
                        track_id: track_id.clone(),
                        downloaded,
                        total,
                    },
                );
            },
        )
        .await?
    } else {
        track.file_path.clone()
    };

    let player = state.player.clone();
    let path: std::path::PathBuf = file_path.into();
    tokio::task::spawn_blocking(move || player.play(path, seq))
        .await
        .map_err(|e| AppError::Msg(e.to_string()))?
        .map_err(AppError::Msg)?;

    #[cfg(target_os = "android")]
    announce_to_the_shade(&state, &app, &track).await;

    sqlx::query("UPDATE tracks SET play_count = play_count + 1 WHERE id = ?")
        .bind(&track_id)
        .execute(&state.db)
        .await?;
    Ok(())
}

pub(crate) fn spawn_prefetch(app: AppHandle, track_id: String) {
    let handle = app.clone();
    crate::shutdown::spawn_tracked(&handle, async move {
        let state = app.state::<AppState>();
        let track = match sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
            .bind(&track_id)
            .fetch_optional(&state.db)
            .await
        {
            Ok(Some(t)) => t,
            _ => return,
        };
        if !track.file_path.is_empty() && tokio::fs::metadata(&track.file_path).await.is_ok() {
            return;
        }
        let Ok(dir) = media_paths::media_root(&app, &state.db).await else {
            return;
        };
        if let Err(err) = media::download::ensure_track_downloaded(
            &state.db,
            &state.telegram,
            &dir,
            &track,
            &state.download_locks,
            |_, _| {},
        )
        .await
        {
            crate::log!("prefetch_track({track_id}) failed: {err:#}");
        }
    });
}

/// Feeds the card in the notification shade and on the lock screen.
#[cfg(target_os = "android")]
async fn announce_to_the_shade(state: &State<'_, AppState>, app: &AppHandle, track: &Track) {
    let cover = match media_paths::media_root(app, &state.db).await {
        Ok(dir) => media::covers::ensure_cover(&state.db, &dir, &track.id)
            .await
            .ok()
            .flatten()
            .map(|cover| cover.path),
        Err(_) => None,
    };
    crate::android::now_playing(
        track.title.as_deref().unwrap_or("fygram"),
        track.artist.as_deref().unwrap_or(""),
        cover.as_deref(),
        track.duration_sec.unwrap_or(0).max(0) * 1000,
        0,
        true,
    );
}
