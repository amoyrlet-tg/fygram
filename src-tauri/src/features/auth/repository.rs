//! The api id, api hash and session flags, as they sit in the settings table.

use sqlx::SqlitePool;

use crate::shared::error::AppError;
use crate::shared::settings;

pub(crate) async fn require_api_hash(db: &SqlitePool) -> Result<String, AppError> {
    let (api_hash,): (String,) =
        sqlx::query_as("SELECT value FROM settings WHERE key = 'telegram_api_hash'")
            .fetch_one(db)
            .await
            .map_err(|_| AppError::Msg("Telegram API credentials aren't set up yet".to_string()))?;
    Ok(api_hash)
}

pub(crate) async fn read_api_hash(db: &SqlitePool) -> Result<Option<String>, AppError> {
    settings::get(db, "telegram_api_hash").await
}

pub(crate) async fn has_api_id(db: &SqlitePool) -> Result<bool, AppError> {
    Ok(settings::get(db, "telegram_api_id").await?.is_some())
}

pub(crate) async fn read_api_id(db: &SqlitePool) -> Result<Option<i32>, AppError> {
    Ok(settings::get(db, "telegram_api_id")
        .await?
        .and_then(|value| value.parse().ok()))
}

pub(crate) async fn save_credentials(
    db: &SqlitePool,
    api_id: i32,
    api_hash: &str,
) -> Result<(), AppError> {
    settings::set(db, "telegram_api_id", &api_id.to_string()).await?;
    settings::set(db, "telegram_api_hash", api_hash).await?;
    Ok(())
}

/// Telegram ties an auth key to the api_id it was minted for, so a session made
/// under another one is worthless.
pub(crate) async fn remember_session_api_id(db: &SqlitePool, api_id: i32) {
    let _ = settings::set(db, "session_api_id", &api_id.to_string()).await;
}

pub(crate) async fn read_session_api_id(db: &SqlitePool) -> Option<i32> {
    settings::get(db, "session_api_id")
        .await
        .ok()
        .flatten()
        .and_then(|value| value.parse().ok())
}

pub(crate) async fn remember_authorized(db: &SqlitePool, authorized: bool) {
    let _ = settings::set(
        db,
        "telegram_authorized",
        if authorized { "1" } else { "0" },
    )
    .await;
}

pub(crate) async fn read_authorized_flag(db: &SqlitePool) -> Result<bool, AppError> {
    Ok(settings::get(db, "telegram_authorized").await?.as_deref() == Some("1"))
}

pub(crate) async fn remember_session_invalid(db: &SqlitePool, invalid: bool) {
    let _ = settings::set(
        db,
        "telegram_session_invalid",
        if invalid { "1" } else { "0" },
    )
    .await;
}

pub(crate) async fn read_session_invalid(db: &SqlitePool) -> Result<bool, AppError> {
    Ok(settings::get(db, "telegram_session_invalid")
        .await?
        .as_deref()
        == Some("1"))
}

pub(crate) async fn has_local_library(db: &SqlitePool) -> Result<bool, AppError> {
    let found: Option<(i64,)> = sqlx::query_as("SELECT 1 FROM tracks LIMIT 1")
        .fetch_optional(db)
        .await?;
    Ok(found.is_some())
}

pub(crate) async fn cache_current_user(db: &SqlitePool, json: &str) {
    let _ = settings::set(db, "cached_current_user", json).await;
}

pub(crate) async fn read_cached_current_user(db: &SqlitePool) -> Result<Option<String>, AppError> {
    settings::get(db, "cached_current_user").await
}

pub(crate) async fn wipe_database(db: &SqlitePool) {
    for table in [
        "playlist_tracks",
        "cluster_tracks",
        "fingerprints",
        "tracks",
        "clusters",
        "playlists",
        "channels",
        "settings",
    ] {
        if let Err(err) = sqlx::query(&format!("DELETE FROM {table}"))
            .execute(db)
            .await
        {
            eprintln!("logout: failed to clear {table}: {err}");
        }
    }
}
