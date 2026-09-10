use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::shared::error::AppError;
use crate::shared::models::Track;
use crate::AppState;

const SCAN: usize = 200;

const CHANGED: &str = "profile-music-changed";

#[derive(Debug, Serialize)]
pub(crate) struct ProfileTrack {
    pub(crate) document_id: String,
    pub(crate) title: String,
    pub(crate) artist: Option<String>,
    pub(crate) duration_sec: Option<i64>,
    pub(crate) track_id: Option<String>,
}

pub(crate) async fn list(state: State<'_, AppState>) -> Result<Vec<ProfileTrack>, AppError> {
    let saved = state.telegram.saved_music(SCAN).await?;
    let mut out = Vec::with_capacity(saved.len());
    for entry in saved {
        let known =
            sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE tg_document_id = ? LIMIT 1")
                .bind(entry.document_id)
                .fetch_optional(&state.db)
                .await?;

        let title = known
            .as_ref()
            .and_then(|t| t.title.clone())
            .or_else(|| entry.title.clone())
            .unwrap_or_else(|| "Без названия".to_string());
        let artist = known
            .as_ref()
            .and_then(|t| t.artist.clone())
            .or_else(|| entry.performer.clone());

        out.push(ProfileTrack {
            document_id: entry.document_id.to_string(),
            title,
            artist,
            duration_sec: known
                .as_ref()
                .and_then(|t| t.duration_sec)
                .or(entry.duration_sec.map(i64::from)),
            track_id: known.map(|t| t.id),
        });
    }
    Ok(out)
}

pub(crate) async fn add(
    state: State<'_, AppState>,
    app: AppHandle,
    track_id: String,
) -> Result<(), AppError> {
    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(&track_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::Msg("Трека нет в библиотеке.".to_string()))?;

    let input =
        super::service::track_document(&state, &track.channel_id, track.tg_message_id as i32)
            .await?;
    state.telegram.place_saved_music(input, None).await?;
    let _ = app.emit(CHANGED, ());
    Ok(())
}

pub(crate) async fn toggle(
    state: State<'_, AppState>,
    app: AppHandle,
    track_id: String,
) -> Result<bool, AppError> {
    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(&track_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::Msg("Трека нет в библиотеке.".to_string()))?;

    let input =
        super::service::track_document(&state, &track.channel_id, track.tg_message_id as i32)
            .await?;
    let grammers_client::tl::enums::InputDocument::Document(wanted) = &input else {
        return Err(AppError::Msg("У трека нет файла в Telegram.".to_string()));
    };
    let document_id = wanted.id;

    let already = state
        .telegram
        .saved_music(SCAN)
        .await?
        .into_iter()
        .find(|entry| entry.document_id == document_id);

    let now_in = match already {
        Some(entry) => {
            state.telegram.set_saved_music(entry.input, true).await?;
            false
        }
        None => {
            state.telegram.place_saved_music(input, None).await?;
            true
        }
    };
    let _ = app.emit(CHANGED, ());
    Ok(now_in)
}

pub(crate) async fn remove(
    state: State<'_, AppState>,
    app: AppHandle,
    document_id: String,
) -> Result<(), AppError> {
    let wanted = parse_id(&document_id)?;
    let entry = find(&state, wanted).await?;
    state.telegram.set_saved_music(entry, true).await?;
    let _ = app.emit(CHANGED, ());
    Ok(())
}

pub(crate) async fn reorder(
    state: State<'_, AppState>,
    app: AppHandle,
    document_id: String,
    after_document_id: Option<String>,
) -> Result<(), AppError> {
    let moved = find(&state, parse_id(&document_id)?).await?;
    let after = match after_document_id {
        Some(id) => Some(find(&state, parse_id(&id)?).await?),
        None => None,
    };
    state.telegram.place_saved_music(moved, after).await?;
    let _ = app.emit(CHANGED, ());
    Ok(())
}

fn parse_id(document_id: &str) -> Result<i64, AppError> {
    document_id
        .parse()
        .map_err(|_| AppError::Msg(format!("{document_id} is not a document id")))
}

async fn find(
    state: &State<'_, AppState>,
    document_id: i64,
) -> Result<grammers_client::tl::enums::InputDocument, AppError> {
    state
        .telegram
        .saved_music(SCAN)
        .await?
        .into_iter()
        .find(|entry| entry.document_id == document_id)
        .map(|entry| entry.input)
        .ok_or_else(|| AppError::Msg("Этой музыки уже нет в профиле.".to_string()))
}
