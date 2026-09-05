//! The IPC surface of the broadcast target: reading it, changing it, and testing it.

use tauri::State;

use crate::shared::models::Track;
use crate::AppState;

use super::service::{self, BroadcastConfig};

#[tauri::command]
pub(crate) async fn get_broadcast_config(
    state: State<'_, AppState>,
) -> Result<BroadcastConfig, String> {
    Box::pin(async move { service::load_config(&state.db).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn set_broadcast_config(
    state: State<'_, AppState>,
    enabled: bool,
    url: String,
    token: Option<String>,
) -> Result<BroadcastConfig, String> {
    Box::pin(async move {
        let config = service::save_config(&state.db, enabled, &url, token.as_deref())
            .await
            .map_err(String::from)?;

        if !enabled {
            let _ = service::stop(&state.db).await;
        }

        Ok(config)
    })
    .await
}

#[tauri::command]
pub(crate) async fn check_broadcast_target(url: String, token: String) -> Result<String, String> {
    Box::pin(async move { service::check(&url, &token).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn broadcast_now_playing(
    state: State<'_, AppState>,
    track_id: String,
    position: f64,
    playing: bool,
) -> Result<(), String> {
    Box::pin(async move {
        let track: Option<Track> = sqlx::query_as("SELECT * FROM tracks WHERE id = ?")
            .bind(&track_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| e.to_string())?;

        let Some(track) = track else {
            return Ok(());
        };

        service::heartbeat(
            &state.db,
            &track.channel_id,
            track.tg_message_id,
            track.title.as_deref().unwrap_or("unknown"),
            track.artist.as_deref().unwrap_or(""),
            track.duration_sec.unwrap_or(0) as f64,
            position,
            playing,
        )
        .await
        .map_err(String::from)?;

        let db = state.db.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(err) = service::flush_pending(&db).await {
                crate::log!("broadcast: flushing pending uploads failed: {err}");
            }
        });

        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn broadcast_stop(state: State<'_, AppState>) -> Result<(), String> {
    Box::pin(async move { service::stop(&state.db).await.map_err(String::from) }).await
}
