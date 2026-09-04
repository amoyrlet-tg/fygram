//! Every SQL statement the tracks feature runs.

use sqlx::SqlitePool;

use crate::shared::error::AppError;
use crate::shared::models::Track;

pub(super) async fn get(db: &SqlitePool, id: &str) -> Result<Option<Track>, AppError> {
    Ok(
        sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
            .bind(id)
            .fetch_optional(db)
            .await?,
    )
}

pub(super) async fn get_one(db: &SqlitePool, id: &str) -> Result<Track, AppError> {
    Ok(
        sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
            .bind(id)
            .fetch_one(db)
            .await?,
    )
}

/// Newest first by publication date; the added date stands in for rows that
/// never carried one.
pub(super) async fn list_ordered(db: &SqlitePool) -> Result<Vec<Track>, AppError> {
    Ok(sqlx::query_as::<_, Track>(
        "SELECT * FROM tracks ORDER BY COALESCE(published_at, added_at) DESC",
    )
    .fetch_all(db)
    .await?)
}

pub(super) async fn all(db: &SqlitePool) -> Result<Vec<Track>, AppError> {
    Ok(sqlx::query_as::<_, Track>("SELECT * FROM tracks")
        .fetch_all(db)
        .await?)
}

/// The date is the one thing a replacement cannot recover on its own.
pub(super) async fn mark_forwarded(
    db: &SqlitePool,
    track_id: &str,
    meta: &crate::shared::telegram::MessageMeta,
) -> Result<(), AppError> {
    sqlx::query(
        "UPDATE tracks SET forwarded = 1, forwarded_at = ?, forwarded_from = ? WHERE id = ?",
    )
    .bind(meta.forwarded_at)
    .bind(&meta.forwarded_from)
    .bind(track_id)
    .execute(db)
    .await?;
    Ok(())
}

pub(super) async fn mark_not_forwarded(db: &SqlitePool, track_id: &str) -> Result<(), AppError> {
    sqlx::query("UPDATE tracks SET forwarded = 0 WHERE id = ?")
        .bind(track_id)
        .execute(db)
        .await?;
    Ok(())
}

pub(super) async fn replace_message(
    db: &SqlitePool,
    track_id: &str,
    message_id: i64,
) -> Result<(), AppError> {
    sqlx::query(
        "UPDATE tracks SET tg_message_id = ?, tg_document_id = NULL, forwarded = 0 WHERE id = ?",
    )
    .bind(message_id)
    .bind(track_id)
    .execute(db)
    .await?;
    Ok(())
}

pub(super) async fn update_tags(
    db: &SqlitePool,
    track_id: &str,
    title: &Option<String>,
    artist: &Option<String>,
    album: &Option<String>,
) -> Result<(), AppError> {
    sqlx::query("UPDATE tracks SET title = ?, artist = ?, album = ? WHERE id = ?")
        .bind(title)
        .bind(artist)
        .bind(album)
        .bind(track_id)
        .execute(db)
        .await?;
    Ok(())
}

/// One transaction: a half-applied pass leaves the library disagreeing with
/// itself about who an artist is.
pub(super) async fn update_title_artist_batch(
    db: &SqlitePool,
    rows: &[(String, Option<String>, Option<String>)],
) -> Result<(), AppError> {
    let mut tx = db.begin().await?;
    for (id, title, artist) in rows {
        sqlx::query("UPDATE tracks SET title = ?, artist = ? WHERE id = ?")
            .bind(title)
            .bind(artist)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub(super) async fn playlist_ids_of_track(
    db: &SqlitePool,
    track_id: &str,
) -> Result<Vec<String>, AppError> {
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT playlist_id FROM playlist_tracks WHERE track_id = ?")
            .bind(track_id)
            .fetch_all(db)
            .await?;
    Ok(rows.into_iter().map(|(p,)| p).collect())
}

pub(super) async fn distinct_playlists_for_tracks(
    db: &SqlitePool,
    track_ids: &[String],
) -> Result<Vec<String>, AppError> {
    let placeholders = std::iter::repeat_n("?", track_ids.len())
        .collect::<Vec<_>>()
        .join(",");
    let query = format!(
        "SELECT DISTINCT playlist_id FROM playlist_tracks WHERE track_id IN ({placeholders})"
    );
    let mut q = sqlx::query_as::<_, (String,)>(&query);
    for id in track_ids {
        q = q.bind(id);
    }
    let rows = q.fetch_all(db).await?;
    Ok(rows.into_iter().map(|(p,)| p).collect())
}
