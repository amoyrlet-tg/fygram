use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tauri::State;

use crate::shared::error::AppError;
use crate::shared::models::Track;
use crate::AppState;

const API: &str = "https://fr331yryc5.gg/api/";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct Lyric {
    pub(crate) time: Option<f64>,
    pub(crate) lyric: String,
}

pub(super) async fn for_track(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<Option<Vec<Lyric>>, AppError> {
    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(&track_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::Msg("track not found".to_string()))?;
    let Some(title) = track
        .title
        .as_deref()
        .filter(|title| !title.trim().is_empty())
    else {
        return Ok(None);
    };
    let key = cache_key(title, track.duration_sec);

    if let Some(cached) = cached(&state.db, &key).await? {
        return Ok(cached);
    }

    let result = fetch_from_custom_api(&track, title).await;
    if result.is_none() {
        return Ok(None);
    }
    save(&state.db, &key, title, track.duration_sec, result.as_ref()).await?;
    Ok(result.map(|(_, lyrics)| lyrics))
}

async fn cached(db: &SqlitePool, key: &str) -> Result<Option<Option<Vec<Lyric>>>, AppError> {
    let row = sqlx::query("SELECT found, lyrics_json FROM lyrics_cache WHERE cache_key = ?")
        .bind(key)
        .fetch_optional(db)
        .await?;
    let Some(row) = row else { return Ok(None) };
    if !row.get::<bool, _>("found") {
        return Ok(Some(None));
    }
    let raw: String = row.get("lyrics_json");
    let lyrics = serde_json::from_str(&raw)
        .map_err(|err| AppError::Msg(format!("reading cached lyrics: {err}")))?;
    Ok(Some(Some(lyrics)))
}

async fn save(
    db: &SqlitePool,
    key: &str,
    title: &str,
    duration: Option<i64>,
    result: Option<&(i64, Vec<Lyric>)>,
) -> Result<(), AppError> {
    let (found, source_id, lyrics_json) = match result {
        Some((id, lyrics)) => (
            true,
            Some(*id),
            Some(
                serde_json::to_string(lyrics)
                    .map_err(|err| AppError::Msg(format!("serializing lyrics: {err}")))?,
            ),
        ),
        None => (false, None, None),
    };
    sqlx::query(
        "INSERT INTO lyrics_cache (cache_key, title, duration_sec, found, lyrics_json, source_id) \
         VALUES (?, ?, ?, ?, ?, ?) \
         ON CONFLICT(cache_key) DO UPDATE SET found = excluded.found, lyrics_json = excluded.lyrics_json, \
         source_id = excluded.source_id, searched_at = CURRENT_TIMESTAMP",
    )
    .bind(key)
    .bind(title)
    .bind(duration)
    .bind(found)
    .bind(lyrics_json)
    .bind(source_id)
    .execute(db)
    .await?;
    Ok(())
}

async fn fetch_from_custom_api(_track: &Track, _title: &str) -> Option<(i64, Vec<Lyric>)> {
    let _base_url = API;
    None
}

fn cache_key(title: &str, duration: Option<i64>) -> String {
    format!("custom-api:{}:{}", normalise(title), duration.unwrap_or(-1))
}

fn normalise(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_duration_key_is_stable() {
        assert_eq!(
            cache_key("Withoutu!", Some(227)),
            cache_key("withoutu", Some(227))
        );
    }
}
