//! Every SQL statement the ingest pass runs.

use chrono::{DateTime, Utc};
use sqlx::SqlitePool;

use crate::shared::models::{Channel, Track};

pub(crate) async fn get_track(db: &SqlitePool, id: &str) -> Result<Option<Track>, sqlx::Error> {
    sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(id)
        .fetch_optional(db)
        .await
}

pub(crate) async fn mark_synced(
    db: &SqlitePool,
    channel_id: &str,
    full: bool,
) -> Result<(), sqlx::Error> {
    let now = Utc::now();
    sqlx::query(
        "UPDATE channels \
         SET last_synced_at = ?, \
             last_full_synced_at = CASE WHEN ? THEN ? ELSE last_full_synced_at END \
         WHERE id = ?",
    )
    .bind(now)
    .bind(full)
    .bind(now)
    .bind(channel_id)
    .execute(db)
    .await?;
    Ok(())
}

pub(crate) async fn refresh_access_hash(
    db: &SqlitePool,
    channel_id: &str,
    access_hash: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE channels SET access_hash = ? WHERE id = ?")
        .bind(access_hash)
        .bind(channel_id)
        .execute(db)
        .await?;
    Ok(())
}

pub(crate) async fn local_tracks(
    db: &SqlitePool,
    channel_id: &str,
) -> Result<Vec<(String, i64, String)>, sqlx::Error> {
    sqlx::query_as("SELECT id, tg_message_id, file_path FROM tracks WHERE channel_id = ?")
        .bind(channel_id)
        .fetch_all(db)
        .await
}

pub(crate) async fn playlists_of_track(
    db: &SqlitePool,
    track_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT playlist_id FROM playlist_tracks WHERE track_id = ?")
        .bind(track_id)
        .fetch_all(db)
        .await
}

pub(crate) async fn delete_track_and_links(db: &SqlitePool, track_id: &str) {
    let _ = sqlx::query("DELETE FROM playlist_tracks WHERE track_id = ?")
        .bind(track_id)
        .execute(db)
        .await;
    let _ = sqlx::query("DELETE FROM tracks WHERE id = ?")
        .bind(track_id)
        .execute(db)
        .await;
}

pub(crate) async fn existing_track(
    db: &SqlitePool,
    channel_id: &str,
    message_id: i64,
) -> Result<Option<(String, Option<i64>, String)>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, tg_document_id, file_path \
         FROM tracks WHERE channel_id = ? AND tg_message_id = ?",
    )
    .bind(channel_id)
    .bind(message_id)
    .fetch_optional(db)
    .await
}

pub(crate) async fn replace_document(
    db: &SqlitePool,
    track_id: &str,
    document_id: i64,
    duration_sec: Option<i64>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE tracks \
         SET tg_document_id = ?, \
             file_path = '', \
             file_hash = '', \
             duration_sec = COALESCE(?, duration_sec) \
         WHERE id = ?",
    )
    .bind(document_id)
    .bind(duration_sec)
    .bind(track_id)
    .execute(db)
    .await?;
    Ok(())
}

pub(crate) async fn set_document_id(
    db: &SqlitePool,
    track_id: &str,
    document_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE tracks SET tg_document_id = ? WHERE id = ?")
        .bind(document_id)
        .bind(track_id)
        .execute(db)
        .await?;
    Ok(())
}

/// Written on every pass: a track whose message we replaced is no longer
/// forwarded, and the row has to stop saying it is.
pub(crate) async fn set_forward_info(
    db: &SqlitePool,
    track_id: &str,
    forward: Option<&Forward>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE tracks SET forwarded = ?, forwarded_from = ?, forwarded_at = ? WHERE id = ?",
    )
    .bind(forward.is_some())
    .bind(forward.and_then(|f| f.from.clone()))
    .bind(forward.map(|f| f.at))
    .bind(track_id)
    .execute(db)
    .await?;
    Ok(())
}

/// `from` is None when the original author hid their account.
pub(crate) struct Forward {
    pub(crate) from: Option<String>,
    pub(crate) at: DateTime<Utc>,
}

pub(crate) async fn backfill_published_at(
    db: &SqlitePool,
    track_id: &str,
    published_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE tracks SET published_at = COALESCE(published_at, ?) WHERE id = ?")
        .bind(published_at)
        .bind(track_id)
        .execute(db)
        .await?;
    Ok(())
}

pub(crate) async fn current_artist(
    db: &SqlitePool,
    track_id: &str,
) -> Result<Option<(Option<String>,)>, sqlx::Error> {
    sqlx::query_as("SELECT artist FROM tracks WHERE id = ?")
        .bind(track_id)
        .fetch_optional(db)
        .await
}

pub(crate) async fn set_artist(
    db: &SqlitePool,
    track_id: &str,
    artist: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE tracks SET artist = ? WHERE id = ?")
        .bind(artist)
        .bind(track_id)
        .execute(db)
        .await?;
    Ok(())
}

type KnownTrackRow = (
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<i64>,
);

pub(crate) async fn known_document(
    db: &SqlitePool,
    document_id: i64,
) -> Result<Option<KnownTrackRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT file_path, file_hash, title, artist, album, duration_sec \
         FROM tracks WHERE tg_document_id = ? LIMIT 1",
    )
    .bind(document_id)
    .fetch_optional(db)
    .await
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn insert_track_row(
    db: &SqlitePool,
    channel: &Channel,
    message_id: i64,
    document_id: Option<i64>,
    file_path: &str,
    file_hash: &str,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration_sec: Option<i64>,
    published_at: Option<DateTime<Utc>>,
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO tracks (id, channel_id, tg_message_id, tg_document_id, file_path, file_hash, title, artist, album, duration_sec, published_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&channel.id)
    .bind(message_id)
    .bind(document_id)
    .bind(file_path)
    .bind(file_hash)
    .bind(title)
    .bind(artist)
    .bind(album)
    .bind(duration_sec)
    .bind(published_at)
    .execute(db)
    .await?;
    Ok(id)
}
