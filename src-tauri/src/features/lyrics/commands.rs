use tauri::State;

use crate::AppState;

use super::service::{self, Lyric};

#[tauri::command]
pub(crate) async fn track_lyrics(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<Option<Vec<Lyric>>, String> {
    Box::pin(async move {
        service::for_track(state, track_id)
            .await
            .map_err(String::from)
    })
    .await
}
