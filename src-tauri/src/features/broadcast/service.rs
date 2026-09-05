//! Talking to whatever endpoint the user pointed the broadcast at.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashSet;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use crate::shared::error::AppError;
use crate::shared::settings;

const KEY_ENABLED: &str = "broadcast_enabled";
const KEY_URL: &str = "broadcast_url";
const KEY_TOKEN: &str = "broadcast_token";

const HTTP_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct BroadcastConfig {
    pub(crate) enabled: bool,
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) has_token: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct PendingUpload {
    channel_id: i64,
    message_id: i64,
}

struct Target {
    url: String,
    token: String,
}

fn client() -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .timeout(HTTP_TIMEOUT)
        .build()
        .map_err(|e| AppError::Msg(format!("building broadcast http client: {e}")))
}

fn normalize_url(url: &str) -> &str {
    url.trim().trim_end_matches('/')
}

pub(crate) async fn load_config(db: &SqlitePool) -> Result<BroadcastConfig, AppError> {
    Ok(BroadcastConfig {
        enabled: settings::get(db, KEY_ENABLED).await?.as_deref() == Some("1"),
        url: settings::get(db, KEY_URL).await?.unwrap_or_default(),
        has_token: settings::get(db, KEY_TOKEN)
            .await?
            .is_some_and(|t| !t.is_empty()),
    })
}

pub(crate) async fn save_config(
    db: &SqlitePool,
    enabled: bool,
    url: &str,
    token: Option<&str>,
) -> Result<BroadcastConfig, AppError> {
    settings::set(db, KEY_ENABLED, if enabled { "1" } else { "0" }).await?;
    settings::set(db, KEY_URL, normalize_url(url)).await?;

    if let Some(token) = token {
        settings::set(db, KEY_TOKEN, token.trim()).await?;
    }

    load_config(db).await
}

async fn target(db: &SqlitePool) -> Result<Option<Target>, AppError> {
    if settings::get(db, KEY_ENABLED).await?.as_deref() != Some("1") {
        return Ok(None);
    }

    let url = settings::get(db, KEY_URL).await?.unwrap_or_default();
    if url.is_empty() {
        return Ok(None);
    }

    Ok(Some(Target {
        url,
        token: settings::get(db, KEY_TOKEN).await?.unwrap_or_default(),
    }))
}

pub(crate) async fn check(url: &str, token: &str) -> Result<String, AppError> {
    let url = normalize_url(url);
    let client = client()?;

    let health = client
        .get(format!("{url}/api/health"))
        .send()
        .await
        .map_err(|e| AppError::Msg(format!("server did not answer: {e}")))?;

    if !health.status().is_success() {
        return Err(AppError::Msg(format!(
            "server answered {} on /api/health",
            health.status()
        )));
    }

    let auth = client
        .get(format!("{url}/api/audio/pending"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| AppError::Msg(format!("checking the token: {e}")))?;

    if auth.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(AppError::Msg(
            "reachable, but the token was rejected".into(),
        ));
    }

    Ok("reachable, token accepted".into())
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn heartbeat(
    db: &SqlitePool,
    channel_id: &str,
    message_id: i64,
    title: &str,
    artist: &str,
    duration: f64,
    position: f64,
    playing: bool,
) -> Result<(), AppError> {
    let Some(target) = target(db).await? else {
        return Ok(());
    };

    let channel_num: i64 = channel_id
        .parse()
        .map_err(|_| AppError::Msg(format!("channel id {channel_id} is not numeric")))?;

    client()?
        .post(format!("{}/api/music", target.url))
        .bearer_auth(&target.token)
        .json(&serde_json::json!({
            "channel_id": channel_num,
            "message_id": message_id,
            "title": title,
            "artist": artist,
            "duration": duration,
            "position": position,
            "playing": playing,
        }))
        .send()
        .await
        .map_err(|e| AppError::Msg(format!("posting now-playing: {e}")))?
        .error_for_status()
        .map_err(|e| AppError::Msg(format!("server rejected the now-playing update: {e}")))?;

    Ok(())
}

fn in_flight() -> &'static Mutex<HashSet<(i64, i64)>> {
    static IN_FLIGHT: OnceLock<Mutex<HashSet<(i64, i64)>>> = OnceLock::new();
    IN_FLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

fn refused() -> &'static Mutex<HashSet<(i64, i64)>> {
    static REFUSED: OnceLock<Mutex<HashSet<(i64, i64)>>> = OnceLock::new();
    REFUSED.get_or_init(|| Mutex::new(HashSet::new()))
}

pub(crate) async fn flush_pending(db: &SqlitePool) -> Result<usize, AppError> {
    let Some(target) = target(db).await? else {
        return Ok(0);
    };

    let client = client()?;

    let pending: Vec<PendingUpload> = client
        .get(format!("{}/api/audio/pending", target.url))
        .bearer_auth(&target.token)
        .send()
        .await
        .map_err(|e| AppError::Msg(format!("asking what the server is missing: {e}")))?
        .error_for_status()
        .map_err(|e| AppError::Msg(format!("server rejected the pending query: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Msg(format!("parsing the pending list: {e}")))?;

    let mut sent = 0;

    for want in pending {
        if refused()
            .lock()
            .unwrap()
            .contains(&(want.channel_id, want.message_id))
        {
            continue;
        }

        {
            let mut busy = in_flight().lock().unwrap();
            if !busy.insert((want.channel_id, want.message_id)) {
                continue;
            }
        }

        let done = |()| {
            in_flight()
                .lock()
                .unwrap()
                .remove(&(want.channel_id, want.message_id));
        };

        let row: Option<(String,)> = sqlx::query_as(
            "SELECT file_path FROM tracks WHERE channel_id = ? AND tg_message_id = ?",
        )
        .bind(want.channel_id.to_string())
        .bind(want.message_id)
        .fetch_optional(db)
        .await?;

        let Some((file_path,)) = row else {
            done(());
            continue;
        };

        if file_path.is_empty() || !Path::new(&file_path).is_file() {
            done(());
            continue;
        }

        let bytes = match tokio::fs::read(&file_path).await {
            Ok(bytes) => bytes,
            Err(err) => {
                crate::log!("broadcast: cannot read {file_path}: {err}");
                done(());
                continue;
            }
        };

        let response = client
            .put(format!(
                "{}/api/audio/{}/{}",
                target.url, want.channel_id, want.message_id
            ))
            .bearer_auth(&target.token)
            .body(bytes)
            .send()
            .await;

        match response {
            Ok(response) if response.status().is_success() => sent += 1,
            Ok(response) if response.status() == reqwest::StatusCode::PAYLOAD_TOO_LARGE => {
                refused()
                    .lock()
                    .unwrap()
                    .insert((want.channel_id, want.message_id));
                crate::log!(
                    "broadcast: {} is larger than the server accepts — not retrying it",
                    file_path
                );
            }
            Ok(response) => crate::log!("broadcast: upload rejected with {}", response.status()),
            Err(err) => crate::log!("broadcast: upload failed: {err}"),
        }

        done(());
    }

    Ok(sent)
}

pub(crate) async fn stop(db: &SqlitePool) -> Result<(), AppError> {
    let Some(target) = target(db).await? else {
        return Ok(());
    };

    client()?
        .post(format!("{}/api/music/stop", target.url))
        .bearer_auth(&target.token)
        .send()
        .await
        .map_err(|e| AppError::Msg(format!("posting stop: {e}")))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_db() -> SqlitePool {
        let db = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            .execute(&db)
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE tracks (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, \
             tg_message_id INTEGER NOT NULL, file_path TEXT NOT NULL)",
        )
        .execute(&db)
        .await
        .unwrap();

        db
    }

    #[tokio::test]
    async fn config_round_trips_and_never_leaks_the_token() {
        let db = test_db().await;

        let saved = save_config(&db, true, "https://example.test", Some("secret"))
            .await
            .unwrap();
        assert!(saved.enabled);
        assert_eq!(saved.url, "https://example.test");
        assert!(saved.has_token, "should report that a token exists");

        let json = serde_json::to_string(&saved).unwrap();
        assert!(
            !json.contains("secret"),
            "token must never reach the frontend: {json}"
        );
    }

    #[tokio::test]
    async fn trailing_slashes_are_trimmed() {
        let db = test_db().await;

        let saved = save_config(&db, true, "https://x.test/", None)
            .await
            .unwrap();
        assert_eq!(saved.url, "https://x.test");
    }

    #[tokio::test]
    async fn editing_the_url_keeps_the_stored_token() {
        let db = test_db().await;

        save_config(&db, true, "https://a.test", Some("keepme"))
            .await
            .unwrap();
        let after = save_config(&db, true, "https://b.test", None)
            .await
            .unwrap();

        assert_eq!(after.url, "https://b.test");
        assert!(after.has_token, "a None token must not wipe the stored one");
        assert_eq!(
            settings::get(&db, KEY_TOKEN).await.unwrap().as_deref(),
            Some("keepme")
        );
    }

    #[tokio::test]
    async fn nothing_is_sent_while_disabled_or_unconfigured() {
        let db = test_db().await;

        assert!(
            target(&db).await.unwrap().is_none(),
            "unconfigured must not broadcast"
        );

        save_config(&db, true, "", Some("t")).await.unwrap();
        assert!(
            target(&db).await.unwrap().is_none(),
            "an empty URL must not broadcast"
        );

        save_config(&db, false, "https://x.test", None)
            .await
            .unwrap();
        assert!(
            target(&db).await.unwrap().is_none(),
            "a disabled toggle must not broadcast"
        );

        heartbeat(&db, "-100", 1, "t", "a", 10.0, 1.0, true)
            .await
            .unwrap();
        assert_eq!(flush_pending(&db).await.unwrap(), 0);
        stop(&db).await.unwrap();
    }

    #[tokio::test]
    #[ignore = "needs a running bio-server"]
    async fn live_heartbeat_and_upload() {
        let url = std::env::var("BIO_TEST_URL").expect("BIO_TEST_URL");
        let token = std::env::var("BIO_TEST_TOKEN").expect("BIO_TEST_TOKEN");
        let audio = std::env::var("BIO_TEST_AUDIO").expect("BIO_TEST_AUDIO");

        let db = test_db().await;
        save_config(&db, true, &url, Some(&token)).await.unwrap();

        println!("check: {}", check(&url, &token).await.unwrap());

        let (channel, message) = (-1009999999999i64, 7001i64);

        sqlx::query(
            "INSERT INTO tracks (id, channel_id, tg_message_id, file_path) VALUES (?,?,?,?)",
        )
        .bind("t-live")
        .bind(channel.to_string())
        .bind(message)
        .bind(&audio)
        .execute(&db)
        .await
        .unwrap();

        heartbeat(
            &db,
            &channel.to_string(),
            message,
            "Live Test",
            "fygram",
            300.0,
            42.0,
            true,
        )
        .await
        .expect("heartbeat");
        println!("heartbeat sent");

        let client = client().unwrap();
        let probe = client
            .get(format!("{url}/api/audio/{channel}/{message}"))
            .send()
            .await
            .unwrap();
        println!("site asked for audio -> {}", probe.status());

        let sent = flush_pending(&db).await.expect("flush");
        println!("uploaded {sent} file(s)");
        assert_eq!(sent, 1, "the requested track should have been uploaded");

        let after = client
            .get(format!("{url}/api/audio/{channel}/{message}"))
            .send()
            .await
            .unwrap();
        assert!(
            after.status().is_success(),
            "audio should stream after upload: {}",
            after.status()
        );
        println!(
            "audio streams back: {} bytes",
            after.bytes().await.unwrap().len()
        );

        stop(&db).await.unwrap();
        println!("stop sent");
    }
}
