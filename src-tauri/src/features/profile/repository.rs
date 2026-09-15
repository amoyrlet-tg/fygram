use sqlx::SqlitePool;

use crate::shared::error::AppError;
use crate::shared::models::Track;

pub(super) async fn track(db: &SqlitePool, track_id: &str) -> Result<Track, AppError> {
    sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(track_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::Msg("Трека нет в библиотеке.".to_string()))
}

pub(super) async fn track_for_document(
    db: &SqlitePool,
    document_id: i64,
) -> Result<Option<Track>, AppError> {
    Ok(
        sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE tg_document_id = ? LIMIT 1")
            .bind(document_id)
            .fetch_optional(db)
            .await?,
    )
}
