use std::collections::HashSet;

use sqlx::SqlitePool;

use crate::shared::error::AppError;

pub(crate) async fn tracked_file_paths(db: &SqlitePool) -> Result<HashSet<String>, AppError> {
    Ok(
        sqlx::query_as::<_, (String,)>("SELECT DISTINCT file_path FROM tracks")
            .fetch_all(db)
            .await?
            .into_iter()
            .map(|(p,)| p)
            .collect(),
    )
}

#[derive(sqlx::FromRow)]
pub(crate) struct OwnedFile {
    pub(crate) file_path: String,
    pub(crate) channel_id: String,
    pub(crate) title: String,
    pub(crate) avatar_path: Option<String>,
}

pub(crate) async fn files_by_channel(db: &SqlitePool) -> Result<Vec<OwnedFile>, AppError> {
    Ok(sqlx::query_as::<_, OwnedFile>(
        "SELECT t.file_path, t.channel_id, c.title, c.avatar_path \
         FROM tracks t JOIN channels c ON c.id = t.channel_id \
         WHERE t.file_path != '' AND c.deleted = 0 \
         ORDER BY c.title",
    )
    .fetch_all(db)
    .await?)
}

#[derive(sqlx::FromRow)]
pub(crate) struct EvictionRow {
    pub(crate) file_path: String,
    #[allow(dead_code)]
    pub(crate) play_count: i64,
}

pub(crate) async fn eviction_candidates(
    db: &SqlitePool,
    older_than: Option<&str>,
) -> Result<Vec<EvictionRow>, AppError> {
    if let Some(cutoff) = older_than {
        return Ok(sqlx::query_as(
            "SELECT file_path, SUM(play_count) as play_count FROM tracks \
             WHERE file_path != '' GROUP BY file_path \
             HAVING MAX(COALESCE(last_played_at, added_at)) < ? \
             ORDER BY play_count ASC",
        )
        .bind(cutoff)
        .fetch_all(db)
        .await?);
    }

    Ok(sqlx::query_as(
        "SELECT file_path, SUM(play_count) as play_count FROM tracks \
         WHERE file_path != '' GROUP BY file_path ORDER BY play_count ASC",
    )
    .fetch_all(db)
    .await?)
}

pub(crate) async fn evict_file(db: &SqlitePool, file_path: &str) -> Result<u64, AppError> {
    let result = sqlx::query("UPDATE tracks SET file_path = '' WHERE file_path = ?")
        .bind(file_path)
        .execute(db)
        .await?;
    Ok(result.rows_affected())
}
