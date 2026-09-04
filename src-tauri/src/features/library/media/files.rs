//! Removing audio the library no longer points at.

use std::path::Path;

use sqlx::SqlitePool;

pub(crate) async fn prune_unused_file(
    db: &SqlitePool,
    file_path: &str,
    current_playing: Option<&Path>,
) {
    if file_path.is_empty() {
        return;
    }
    if current_playing.is_some_and(|p| p.as_os_str() == std::ffi::OsStr::new(file_path)) {
        return;
    }
    let (still_used,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM tracks WHERE file_path = ?")
        .bind(file_path)
        .fetch_one(db)
        .await
        .unwrap_or((0,));
    if still_used == 0 {
        let _ = tokio::fs::remove_file(file_path).await;
    }
}
