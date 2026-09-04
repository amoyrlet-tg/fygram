//! Every SQL statement the playlists feature runs.

use chrono::Utc;
use sqlx::SqlitePool;

use crate::features::sync::outbox;
use crate::shared::error::AppError;
use crate::shared::models::{Playlist, Track};

// four tiles, but a track without artwork does not fill one
const COVER_SOURCE_LIMIT: i64 = 6;

pub(crate) async fn list(db: &SqlitePool) -> Result<Vec<Playlist>, AppError> {
    Ok(sqlx::query_as::<_, Playlist>(
        "SELECT * FROM playlists WHERE deleted = 0 ORDER BY created_at",
    )
    .fetch_all(db)
    .await?)
}

pub(crate) async fn insert(
    db: &SqlitePool,
    id: &str,
    name: &str,
    device: &str,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO playlists (id, name, updated_at, rev, origin_device) VALUES (?, ?, ?, 1, ?)",
    )
    .bind(id)
    .bind(name)
    .bind(Utc::now())
    .bind(device)
    .execute(db)
    .await?;
    Ok(())
}

pub(crate) async fn get(db: &SqlitePool, id: &str) -> Result<Playlist, AppError> {
    Ok(
        sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = ?")
            .bind(id)
            .fetch_one(db)
            .await?,
    )
}

pub(crate) async fn list_tracks(
    db: &SqlitePool,
    playlist_id: &str,
) -> Result<Vec<Track>, AppError> {
    Ok(sqlx::query_as::<_, Track>(
        "SELECT tracks.* FROM playlist_tracks \
         JOIN tracks ON tracks.id = playlist_tracks.track_id \
         WHERE playlist_tracks.playlist_id = ? \
         ORDER BY playlist_tracks.position",
    )
    .bind(playlist_id)
    .fetch_all(db)
    .await?)
}

pub(crate) async fn next_position(db: &SqlitePool, playlist_id: &str) -> Result<i64, AppError> {
    let (next_position,): (i64,) = sqlx::query_as(
        "SELECT MAX(taken) + 1 FROM ( \
            SELECT COALESCE(MAX(position), -1) AS taken FROM playlist_tracks WHERE playlist_id = ? \
            UNION ALL \
            SELECT COALESCE(MAX(position), -1) FROM playlist_pending_tracks WHERE playlist_id = ? \
         )",
    )
    .bind(playlist_id)
    .bind(playlist_id)
    .fetch_one(db)
    .await?;
    Ok(next_position)
}

pub(crate) async fn add_track(
    db: &SqlitePool,
    playlist_id: &str,
    track_id: &str,
    position: i64,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
    )
    .bind(playlist_id)
    .bind(track_id)
    .bind(position)
    .execute(db)
    .await?;
    Ok(())
}

pub(crate) async fn remove_track(
    db: &SqlitePool,
    playlist_id: &str,
    track_id: &str,
) -> Result<(), AppError> {
    sqlx::query("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?")
        .bind(playlist_id)
        .bind(track_id)
        .execute(db)
        .await?;
    Ok(())
}

pub(crate) async fn track_ids_ordered(
    db: &SqlitePool,
    playlist_id: &str,
) -> Result<Vec<String>, AppError> {
    Ok(sqlx::query_scalar(
        "SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position",
    )
    .bind(playlist_id)
    .fetch_all(db)
    .await?)
}

pub(crate) async fn apply_order(
    db: &SqlitePool,
    playlist_id: &str,
    ids: &[String],
) -> Result<(), AppError> {
    let mut tx = db.begin().await?;
    for (position, id) in ids.iter().enumerate() {
        sqlx::query(
            "UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?",
        )
        .bind(position as i64)
        .bind(playlist_id)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn rename(db: &SqlitePool, playlist_id: &str, name: &str) -> Result<(), AppError> {
    sqlx::query("UPDATE playlists SET name = ? WHERE id = ? AND deleted = 0")
        .bind(name)
        .bind(playlist_id)
        .execute(db)
        .await?;
    Ok(())
}

pub(crate) async fn tombstone(
    db: &SqlitePool,
    playlist_id: &str,
    device: &str,
) -> Result<(), AppError> {
    let now = Utc::now();
    let mut tx = db.begin().await?;
    sqlx::query("DELETE FROM playlist_tracks WHERE playlist_id = ?")
        .bind(playlist_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM playlist_pending_tracks WHERE playlist_id = ?")
        .bind(playlist_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE playlists SET deleted = 1, deleted_at = ?, rev = rev + 1, \
            updated_at = ?, origin_device = ? WHERE id = ?",
    )
    .bind(now)
    .bind(now)
    .bind(device)
    .bind(playlist_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn touch_and_queue(
    db: &SqlitePool,
    playlist_id: &str,
    device: &str,
) -> Result<(), AppError> {
    sqlx::query(
        "UPDATE playlists SET rev = rev + 1, updated_at = ?, origin_device = ? WHERE id = ?",
    )
    .bind(Utc::now())
    .bind(device)
    .bind(playlist_id)
    .execute(db)
    .await?;
    outbox::enqueue(db, outbox::PLAYLIST, playlist_id).await;
    Ok(())
}

pub(crate) async fn set_cover_path(
    db: &SqlitePool,
    playlist_id: &str,
    cover_path: Option<&str>,
) -> Result<(), AppError> {
    sqlx::query("UPDATE playlists SET cover_path = ? WHERE id = ?")
        .bind(cover_path)
        .bind(playlist_id)
        .execute(db)
        .await?;
    Ok(())
}

/// The first few tracks of every playlist, for its fallback mosaic. One query
/// rather than one per playlist: a sidebar draws them all at once.
pub(crate) async fn cover_sources(db: &SqlitePool) -> Result<Vec<(String, String)>, AppError> {
    Ok(sqlx::query_as::<_, (String, String)>(
        "SELECT playlist_id, track_id FROM ( \
            SELECT playlist_id, track_id, \
                   ROW_NUMBER() OVER (PARTITION BY playlist_id ORDER BY position) AS rn \
            FROM playlist_tracks \
         ) WHERE rn <= ? ORDER BY playlist_id, rn",
    )
    .bind(COVER_SOURCE_LIMIT)
    .fetch_all(db)
    .await?)
}
