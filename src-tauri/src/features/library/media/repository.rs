//! Every SQL statement the media subsystem runs.

use sqlx::SqlitePool;

use crate::shared::models::{Channel, Track};

pub(crate) async fn reload_track(db: &SqlitePool, id: &str) -> Result<Track, sqlx::Error> {
    sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(id)
        .fetch_one(db)
        .await
}

pub(crate) async fn load_channel(
    db: &SqlitePool,
    channel_id: &str,
) -> Result<Channel, sqlx::Error> {
    sqlx::query_as::<_, Channel>("SELECT * FROM channels WHERE id = ?")
        .bind(channel_id)
        .fetch_one(db)
        .await
}

pub(crate) async fn find_existing_by_hash(
    db: &SqlitePool,
    hash: &str,
) -> Result<Option<String>, sqlx::Error> {
    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT file_path FROM tracks WHERE file_hash = ? AND file_path != '' LIMIT 1",
    )
    .bind(hash)
    .fetch_optional(db)
    .await?;
    Ok(existing.map(|(p,)| p))
}

pub(crate) async fn finalize_download(
    db: &SqlitePool,
    id: &str,
    final_path: &str,
    hash: &str,
    album: &Option<String>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE tracks SET file_path = ?, file_hash = ?, album = COALESCE(album, ?) WHERE id = ?",
    )
    .bind(final_path)
    .bind(hash)
    .bind(album)
    .bind(id)
    .execute(db)
    .await?;
    Ok(())
}

pub(crate) async fn backfill_document(
    db: &SqlitePool,
    document_id: i64,
    final_path: &str,
    hash: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE tracks SET file_path = ?, file_hash = ? WHERE tg_document_id = ? AND file_path = ''",
    )
    .bind(final_path)
    .bind(hash)
    .bind(document_id)
    .execute(db)
    .await?;
    Ok(())
}

pub(crate) async fn tracks_needing_download_in_channel(
    db: &SqlitePool,
    channel_id: &str,
) -> Result<Vec<Track>, sqlx::Error> {
    sqlx::query_as("SELECT * FROM tracks WHERE channel_id = ? AND file_path = ''")
        .bind(channel_id)
        .fetch_all(db)
        .await
}

pub(crate) async fn tracks_needing_download_in_playlist(
    db: &SqlitePool,
    playlist_id: &str,
) -> Result<Vec<Track>, sqlx::Error> {
    sqlx::query_as(
        "SELECT tracks.* FROM playlist_tracks \
         JOIN tracks ON tracks.id = playlist_tracks.track_id \
         WHERE playlist_tracks.playlist_id = ? AND tracks.file_path = '' \
         ORDER BY playlist_tracks.position",
    )
    .bind(playlist_id)
    .fetch_all(db)
    .await
}
