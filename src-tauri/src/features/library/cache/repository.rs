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

pub(crate) async fn eviction_candidates(db: &SqlitePool) -> Result<Vec<EvictionRow>, AppError> {
    Ok(sqlx::query_as(
        "SELECT file_path, SUM(play_count) as play_count FROM tracks \
         WHERE file_path != '' GROUP BY file_path ORDER BY play_count ASC",
    )
    .fetch_all(db)
    .await?)
}

pub(crate) async fn partition_by_keep_lists(
    db: &SqlitePool,
    keep_playlist_ids: &[String],
    keep_channel_ids: &[String],
    keep_track_ids: &[String],
) -> Result<(HashSet<String>, HashSet<String>), AppError> {
    let mut protected: HashSet<String> = HashSet::new();

    if !keep_channel_ids.is_empty() {
        let placeholders = placeholders(keep_channel_ids.len());
        let sql = format!(
            "SELECT DISTINCT file_path FROM tracks \
             WHERE file_path != '' AND channel_id IN ({placeholders})"
        );
        let mut query = sqlx::query_as::<_, (String,)>(&sql);
        for id in keep_channel_ids {
            query = query.bind(id);
        }
        protected.extend(query.fetch_all(db).await?.into_iter().map(|(p,)| p));
    }

    if !keep_playlist_ids.is_empty() {
        let placeholders = placeholders(keep_playlist_ids.len());
        let sql = format!(
            "SELECT DISTINCT tracks.file_path FROM tracks \
             JOIN playlist_tracks ON playlist_tracks.track_id = tracks.id \
             WHERE tracks.file_path != '' AND playlist_tracks.playlist_id IN ({placeholders})"
        );
        let mut query = sqlx::query_as::<_, (String,)>(&sql);
        for id in keep_playlist_ids {
            query = query.bind(id);
        }
        protected.extend(query.fetch_all(db).await?.into_iter().map(|(p,)| p));
    }

    let rows = sqlx::query_as::<_, (String, String)>(
        "SELECT id, file_path FROM tracks WHERE file_path != ''",
    )
    .fetch_all(db)
    .await?;

    if !keep_track_ids.is_empty() {
        let wanted: HashSet<&str> = keep_track_ids.iter().map(String::as_str).collect();
        protected.extend(
            rows.iter()
                .filter(|(id, _)| wanted.contains(id.as_str()))
                .map(|(_, path)| path.clone()),
        );
    }

    let all: HashSet<String> = rows.into_iter().map(|(_, path)| path).collect();
    let removable = all.difference(&protected).cloned().collect();
    Ok((protected, removable))
}

fn placeholders(count: usize) -> String {
    std::iter::repeat_n("?", count)
        .collect::<Vec<_>>()
        .join(", ")
}

pub(crate) async fn evict_file(db: &SqlitePool, file_path: &str) -> Result<u64, AppError> {
    let result = sqlx::query("UPDATE tracks SET file_path = '' WHERE file_path = ?")
        .bind(file_path)
        .execute(db)
        .await?;
    Ok(result.rows_affected())
}
