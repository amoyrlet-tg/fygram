//! The IPC surface of sync: the status the UI shows, and the button that says now.

use tauri::State;

use crate::AppState;

use super::outbox;
use super::status::SyncStatus;

#[tauri::command]
pub(crate) async fn get_sync_status(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    Box::pin(async move { Ok(state.sync.snapshot().await) }).await
}

#[tauri::command]
pub(crate) async fn sync_now(state: State<'_, AppState>) -> Result<(), String> {
    Box::pin(async move {
        let ids: Vec<(String,)> = sqlx::query_as("SELECT id FROM playlists")
            .fetch_all(&state.db)
            .await
            .map_err(|err| err.to_string())?;
        for (id,) in ids {
            outbox::enqueue(&state.db, outbox::PLAYLIST, &id).await;
        }
        outbox::enqueue_channels(&state.db).await;
        state.sync.request_pull();
        Ok(())
    })
    .await
}
