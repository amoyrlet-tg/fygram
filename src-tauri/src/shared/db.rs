//! Opening the database, and keeping the api credentials somewhere a reinstall cannot lose them.

use std::path::Path;
use std::time::Duration;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::SqlitePool;

pub(crate) async fn connect(path: &Path) -> Result<SqlitePool> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("creating db directory {parent:?}"))?;
    }

    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .context("connecting to library database")?;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .context("running database migrations")?;

    Ok(pool)
}

#[derive(Serialize, Deserialize)]
struct ApiCredentials {
    api_id: i32,
    api_hash: String,
}

fn api_credentials_path(app_dir: &Path) -> std::path::PathBuf {
    app_dir.join("api_credentials.json")
}

pub(crate) async fn save_api_credentials(
    app_dir: &Path,
    api_id: i32,
    api_hash: &str,
) -> Result<()> {
    let json = serde_json::to_vec(&ApiCredentials {
        api_id,
        api_hash: api_hash.to_string(),
    })
    .context("serializing api credentials")?;
    crate::shared::atomic_file::atomic_write_async(&api_credentials_path(app_dir), &json)
        .await
        .context("writing api_credentials.json")
}

pub(crate) async fn remove_api_credentials(app_dir: &Path) {
    if let Err(err) = tokio::fs::remove_file(api_credentials_path(app_dir)).await {
        if err.kind() != std::io::ErrorKind::NotFound {
            eprintln!("db: failed to remove api_credentials.json: {err}");
        }
    }
}

pub(crate) async fn restore_api_credentials_if_missing(
    pool: &SqlitePool,
    app_dir: &Path,
) -> Result<()> {
    let existing: Option<(String,)> =
        sqlx::query_as("SELECT value FROM settings WHERE key = 'telegram_api_id'")
            .fetch_optional(pool)
            .await
            .context("checking existing api credentials")?;
    if existing.is_some() {
        return Ok(());
    }

    let Ok(bytes) = tokio::fs::read(api_credentials_path(app_dir)).await else {
        return Ok(());
    };
    let Ok(creds) = serde_json::from_slice::<ApiCredentials>(&bytes) else {
        return Ok(());
    };

    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('telegram_api_id', ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(creds.api_id.to_string())
    .execute(pool)
    .await
    .context("restoring telegram_api_id")?;

    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('telegram_api_hash', ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(&creds.api_hash)
    .execute(pool)
    .await
    .context("restoring telegram_api_hash")?;

    Ok(())
}
