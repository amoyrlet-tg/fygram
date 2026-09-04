//! The file paths the database holds, and repointing them after a move.

use sqlx::SqlitePool;

use crate::shared::error::AppError;

#[derive(sqlx::FromRow)]
pub(crate) struct FileRow {
    pub(crate) channel_id: String,
    pub(crate) file_path: String,
    pub(crate) file_hash: String,
}

pub(crate) async fn tracks_with_files(db: &SqlitePool) -> Result<Vec<FileRow>, AppError> {
    Ok(sqlx::query_as::<_, FileRow>(
        "SELECT channel_id, file_path, file_hash FROM tracks WHERE file_path != '' \
         GROUP BY file_path",
    )
    .fetch_all(db)
    .await?)
}

pub(crate) async fn repoint_file(db: &SqlitePool, from: &str, to: &str) -> Result<(), AppError> {
    sqlx::query("UPDATE tracks SET file_path = ? WHERE file_path = ?")
        .bind(to)
        .bind(from)
        .execute(db)
        .await?;
    Ok(())
}
