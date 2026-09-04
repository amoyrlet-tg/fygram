//! The queue of things changed locally that Telegram has not been told about yet.

use chrono::{DateTime, Utc};
use sqlx::SqlitePool;

pub(crate) const PLAYLIST: &str = "playlist";
pub(crate) const CHANNELS: &str = "channels";
pub(crate) const CHANNELS_ID: &str = "";

#[derive(Debug, Clone, sqlx::FromRow)]
pub(crate) struct Job {
    pub(crate) entity: String,
    pub(crate) entity_id: String,
}

pub(crate) async fn enqueue(db: &SqlitePool, entity: &str, entity_id: &str) {
    let result = sqlx::query(
        "INSERT INTO sync_outbox (entity, entity_id, queued_at, attempts, last_error) \
         VALUES (?, ?, CURRENT_TIMESTAMP, 0, NULL) \
         ON CONFLICT(entity, entity_id) DO UPDATE SET \
            queued_at = CURRENT_TIMESTAMP, attempts = 0, last_error = NULL",
    )
    .bind(entity)
    .bind(entity_id)
    .execute(db)
    .await;
    if let Err(err) = result {
        eprintln!("sync: could not queue {entity}/{entity_id}: {err}");
    }
}

pub(crate) async fn enqueue_channels(db: &SqlitePool) {
    enqueue(db, CHANNELS, CHANNELS_ID).await;
}

pub(crate) async fn list(db: &SqlitePool) -> Vec<Job> {
    sqlx::query_as::<_, Job>("SELECT entity, entity_id FROM sync_outbox ORDER BY queued_at, rowid")
        .fetch_all(db)
        .await
        .unwrap_or_default()
}

pub(crate) async fn remove(db: &SqlitePool, entity: &str, entity_id: &str) {
    let _ = sqlx::query("DELETE FROM sync_outbox WHERE entity = ? AND entity_id = ?")
        .bind(entity)
        .bind(entity_id)
        .execute(db)
        .await;
}

pub(crate) async fn fail(db: &SqlitePool, entity: &str, entity_id: &str, error: &str) {
    let _ = sqlx::query(
        "UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? \
         WHERE entity = ? AND entity_id = ?",
    )
    .bind(error)
    .bind(entity)
    .bind(entity_id)
    .execute(db)
    .await;
}

pub(crate) async fn pending_count(db: &SqlitePool) -> i64 {
    sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM sync_outbox")
        .fetch_one(db)
        .await
        .map(|(n,)| n)
        .unwrap_or(0)
}

pub(crate) async fn oldest_queued_at(db: &SqlitePool) -> Option<DateTime<Utc>> {
    sqlx::query_as::<_, (Option<DateTime<Utc>>,)>("SELECT MIN(queued_at) FROM sync_outbox")
        .fetch_optional(db)
        .await
        .ok()
        .flatten()
        .and_then(|(t,)| t)
}

pub(crate) async fn forget(db: &SqlitePool, entity: &str, entity_id: &str) {
    remove(db, entity, entity_id).await;
}
