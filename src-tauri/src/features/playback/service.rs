use tauri::{AppHandle, Emitter, Manager, State};

use crate::features::library::media;
use crate::shared::error::AppError;
use crate::shared::media_paths;
use crate::shared::models::Track;
use crate::shared::settings;
use crate::AppState;

pub(crate) const OUTPUT_DEVICE_KEY: &str = "audio_output_device";

#[derive(Debug, Clone, serde::Serialize)]
pub(crate) struct AudioOutputs {
    pub(crate) devices: Vec<String>,
    pub(crate) selected: Option<String>,
}

pub(crate) async fn audio_outputs(state: State<'_, AppState>) -> Result<AudioOutputs, AppError> {
    let selected = settings::get(&state.db, OUTPUT_DEVICE_KEY)
        .await?
        .filter(|name| !name.is_empty());
    let devices = tokio::task::spawn_blocking(super::audio::output_devices)
        .await
        .unwrap_or_default();
    Ok(AudioOutputs { devices, selected })
}

pub(crate) async fn set_audio_output(
    state: State<'_, AppState>,
    device: Option<String>,
) -> Result<(), AppError> {
    let device = device.filter(|name| !name.is_empty());
    settings::set(
        &state.db,
        OUTPUT_DEVICE_KEY,
        device.as_deref().unwrap_or_default(),
    )
    .await?;
    state.player.set_device(device);
    Ok(())
}

pub(crate) async fn restore_audio_output(
    db: &sqlx::SqlitePool,
    player: &super::audio::PlayerHandle,
) {
    let saved = settings::get(db, OUTPUT_DEVICE_KEY)
        .await
        .ok()
        .flatten()
        .filter(|name| !name.is_empty());
    if saved.is_some() {
        player.set_device(saved);
    }
}

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
