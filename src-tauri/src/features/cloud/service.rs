//! Reconciling the local channel list against the one in the cloud.

use std::collections::btree_map::Entry;
use std::collections::BTreeMap;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};

use super::backup_types::{ChannelsDoc, SyncChannel, CHANNELS_HASHTAG};
use crate::features::library::channels::repository::{self as channels_repo, ChannelStamp};
use crate::features::library::media;
use crate::shared::settings;
use crate::shared::telegram::TelegramState;
use crate::AppState;

fn notify_library_changed(app: &AppHandle) {
    let _ = app.emit("library-changed", ());
}

#[derive(Debug, Clone, serde::Serialize)]
struct IndexingBatch {
    active: bool,
    total: usize,
    completed: usize,
}

fn notify_batch(app: &AppHandle, active: bool, total: usize, completed: usize) {
    let _ = app.emit(
        "indexing-batch",
        IndexingBatch {
            active,
            total,
            completed,
        },
    );
}

pub(crate) async fn ensure_library_owner(
    db: &SqlitePool,
    telegram: &TelegramState,
    app_dir: &Path,
    media_dir: &Path,
    app: &AppHandle,
) -> Result<()> {
    let me = telegram
        .get_me(app_dir)
        .await
        .context("fetching current account for ownership check")?;

    let stored = settings::get(db, "library_owner_user_id")
        .await
        .context("reading library_owner_user_id")?;
    let stored_id = stored.and_then(|v| v.parse::<i64>().ok());

    if stored_id.is_some_and(|id| id != me.id) {
        crate::log!(
            "cloud_sync: local library belongs to a different account than the one now logged \
             in - wiping local library before restore"
        );
        for table in [
            "playlist_tracks",
            "playlist_pending_tracks",
            "playlists",
            "tracks",
            "channels",
            "sync_outbox",
        ] {
            let _ = sqlx::query(&format!("DELETE FROM {table}"))
                .execute(db)
                .await;
        }
        let _ = settings::delete(db, "channels_sync_message_id").await;
        let _ = tokio::fs::remove_dir_all(media_dir).await;
        let _ = tokio::fs::create_dir_all(media_dir).await;
        notify_library_changed(app);
    }

    settings::set(db, "library_owner_user_id", &me.id.to_string())
        .await
        .context("saving library_owner_user_id")?;

    Ok(())
}

#[derive(sqlx::FromRow)]
struct LocalChannel {
    id: String,
    title: String,
    username: Option<String>,
    access_hash: i64,
    source_type: String,
    rev: i64,
    updated_at: DateTime<Utc>,
    origin_device: String,
    deleted: bool,
    deleted_at: Option<DateTime<Utc>>,
}

impl From<&LocalChannel> for SyncChannel {
    fn from(row: &LocalChannel) -> Self {
        SyncChannel {
            id: row.id.clone(),
            title: row.title.clone(),
            username: row.username.clone(),
            access_hash: row.access_hash,
            source_type: row.source_type.clone(),
            rev: row.rev.max(1),
            updated_at: Some(row.updated_at),
            device_id: row.origin_device.clone(),
            deleted: row.deleted,
            deleted_at: row.deleted_at,
        }
    }
}

#[derive(Debug, Default)]
pub(crate) struct ChannelsMerge {
    pub(crate) changed_locally: bool,
    pub(crate) added: Vec<String>,
    pub(crate) removed: Vec<String>,
}

pub(crate) async fn reconcile_channels(
    db: &SqlitePool,
    telegram: &TelegramState,
    current_playing: Option<&Path>,
) -> Result<ChannelsMerge> {
    let now = Utc::now();
    let (remote_message_id, remote_entries) = load_remote_channels(telegram).await?;

    let locals: Vec<LocalChannel> = sqlx::query_as::<_, LocalChannel>(
        "SELECT id, title, username, access_hash, source_type, rev, updated_at, \
                origin_device, deleted, deleted_at \
         FROM channels \
         WHERE deleted = 0 OR deleted_at IS NOT NULL",
    )
    .fetch_all(db)
    .await
    .context("loading channels")?;

    let local_stamps: BTreeMap<String, SyncChannel> = locals
        .iter()
        .map(|row| (row.id.clone(), SyncChannel::from(row)))
        .collect();
    let mut merged = local_stamps.clone();

    for entry in remote_entries.iter() {
        match merged.entry(entry.id.clone()) {
            Entry::Occupied(mut slot) => {
                if entry.stamp() > slot.get().stamp() {
                    slot.insert(entry.clone());
                }
            }
            Entry::Vacant(slot) => {
                slot.insert(entry.clone());
            }
        }
    }

    let expired: Vec<String> = merged
        .values()
        .filter(|c| c.is_expired_tombstone(now))
        .map(|c| c.id.clone())
        .collect();
    for id in &expired {
        merged.remove(id);
        let _ = sqlx::query("DELETE FROM channels WHERE id = ? AND deleted = 1")
            .bind(id)
            .execute(db)
            .await;
    }

    let mut merge = ChannelsMerge::default();
    for entry in merged.values() {
        let local = local_stamps.get(&entry.id);
        let is_new_here = local.is_none();
        if let Some(local) = local {
            if entry.stamp() <= local.stamp() {
                continue;
            }
        }

        if entry.deleted {
            if is_new_here {
                insert_remote_channel(db, entry).await?;
            } else {
                let orphans = channels_repo::tombstone(
                    db,
                    &entry.id,
                    ChannelStamp::Remote {
                        rev: entry.rev,
                        updated_at: entry.updated_at.unwrap_or(now),
                        device: &entry.device_id,
                        deleted_at: entry.deleted_at,
                    },
                )
                .await
                .context("applying a remote channel delete")?;
                for path in orphans {
                    media::files::prune_unused_file(db, &path, current_playing).await;
                }
                merge.removed.push(entry.id.clone());
            }
            merge.changed_locally = true;
            continue;
        }

        let was_missing_or_deleted = local.map(|l| l.deleted).unwrap_or(true);
        insert_remote_channel(db, entry).await?;
        merge.changed_locally = true;
        if was_missing_or_deleted {
            merge.added.push(entry.id.clone());
        }
    }

    let merged_entries: Vec<SyncChannel> = merged.into_values().collect();
    if merged_entries != remote_entries {
        push_channels(db, telegram, remote_message_id, &merged_entries).await?;
    }

    Ok(merge)
}

async fn load_remote_channels(telegram: &TelegramState) -> Result<(Option<i32>, Vec<SyncChannel>)> {
    let raw = telegram
        .download_saved_documents(CHANNELS_HASHTAG)
        .await
        .context("listing channel snapshots")?;

    let mut docs: Vec<(i32, ChannelsDoc)> = raw
        .into_iter()
        .filter_map(|(message_id, bytes)| match serde_json::from_slice(&bytes) {
            Ok(doc) => Some((message_id, doc)),
            Err(err) => {
                crate::log!("cloud_sync: skipping malformed channel snapshot {message_id}: {err}");
                None
            }
        })
        .collect();
    docs.sort_by_key(|(_, doc)| doc.updated_at);

    let Some((message_id, doc)) = docs.pop() else {
        return Ok((None, Vec::new()));
    };
    for (stale_id, _) in docs {
        if let Err(err) = telegram.delete_saved_message(stale_id).await {
            crate::log!("cloud_sync: could not delete duplicate channel snapshot: {err:#}");
        }
    }

    let mut entries = doc.channels;
    entries.sort_by(|a, b| a.id.cmp(&b.id));
    Ok((Some(message_id), entries))
}

async fn insert_remote_channel(db: &SqlitePool, entry: &SyncChannel) -> Result<()> {
    sqlx::query(
        "INSERT INTO channels \
            (id, username, title, access_hash, source_type, is_active, deleted, deleted_at, \
             rev, updated_at, origin_device) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
            title = excluded.title, username = excluded.username, \
            access_hash = excluded.access_hash, is_active = excluded.is_active, \
            deleted = excluded.deleted, deleted_at = excluded.deleted_at, \
            rev = excluded.rev, updated_at = excluded.updated_at, \
            origin_device = excluded.origin_device",
    )
    .bind(&entry.id)
    .bind(&entry.username)
    .bind(&entry.title)
    .bind(entry.access_hash)
    .bind(&entry.source_type)
    .bind(!entry.deleted)
    .bind(entry.deleted)
    .bind(entry.deleted_at)
    .bind(entry.rev.max(1))
    .bind(entry.updated_at.unwrap_or_else(Utc::now))
    .bind(&entry.device_id)
    .execute(db)
    .await
    .context("writing merged channel row")?;
    Ok(())
}

async fn push_channels(
    db: &SqlitePool,
    telegram: &TelegramState,
    remote_message_id: Option<i32>,
    entries: &[SyncChannel],
) -> Result<()> {
    let doc = ChannelsDoc {
        hashtag: CHANNELS_HASHTAG.to_string(),
        updated_at: Utc::now(),
        channels: entries.to_vec(),
    };
    let json = serde_json::to_vec_pretty(&doc).context("serializing channels json")?;
    let live = entries.iter().filter(|c| !c.deleted).count();
    let caption = format!("{CHANNELS_HASHTAG}\nСписок каналов fygram · {live}");

    let tmp_path =
        std::env::temp_dir().join(format!("fygram-channels-{}.json", uuid::Uuid::new_v4()));
    tokio::fs::write(&tmp_path, &json)
        .await
        .context("writing channels json to temp file")?;

    let cached_message_id = match remote_message_id {
        Some(id) => Some(id),
        None => settings::get(db, "channels_sync_message_id")
            .await
            .context("reading cached channels sync message id")?
            .and_then(|v| v.parse::<i32>().ok()),
    };

    let result = telegram
        .sync_saved_document(
            cached_message_id,
            CHANNELS_HASHTAG,
            CHANNELS_HASHTAG,
            &caption,
            "channels.json",
            &tmp_path,
        )
        .await;
    let _ = tokio::fs::remove_file(&tmp_path).await;
    let message_id = result.context("pushing channels snapshot to Saved Messages")?;

    settings::set(db, "channels_sync_message_id", &message_id.to_string())
        .await
        .context("saving channels_sync_message_id")?;

    Ok(())
}

pub(crate) async fn index_new_channels(app: &AppHandle, channel_ids: &[String]) {
    if channel_ids.is_empty() {
        return;
    }
    let state = app.state::<AppState>();
    notify_library_changed(app);

    let total = channel_ids.len();
    notify_batch(app, true, total, 0);

    let app_dir = app.path().app_data_dir().ok();
    for (position, id) in channel_ids.iter().enumerate() {
        let channel = match sqlx::query_as::<_, crate::shared::models::Channel>(
            "SELECT * FROM channels WHERE id = ? AND deleted = 0",
        )
        .bind(id)
        .fetch_optional(&state.db)
        .await
        {
            Ok(Some(channel)) => channel,
            Ok(None) => {
                notify_batch(app, true, total, position + 1);
                continue;
            }
            Err(err) => {
                crate::log!("cloud_sync: could not reload channel {id}: {err}");
                notify_batch(app, true, total, position + 1);
                continue;
            }
        };

        let never_cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let current_playing = state.player.current_path();
        if let Err(err) = crate::features::library::ingest::sync_channel(
            &state.db,
            &state.telegram,
            &channel,
            crate::features::library::ingest::SyncDepth::Full,
            never_cancel,
            current_playing.as_deref(),
            |progress| {
                let _ = app.emit("sync-progress", progress);
            },
        )
        .await
        {
            crate::log!(
                "cloud_sync: indexing channel {} failed: {err:#}",
                channel.id
            );
            notify_batch(app, true, total, position + 1);
            continue;
        }

        if let Err(err) =
            crate::features::playlists::telegram_sync::resolve_pending_tracks(&state.db, id).await
        {
            crate::log!("cloud_sync: resolving parked playlist tracks failed: {err:#}");
        }

        if let Some(app_dir) = &app_dir {
            fetch_and_store_channel_avatar(&state.db, &state.telegram, &channel, app_dir).await;
        }
        notify_batch(app, true, total, position + 1);
        notify_library_changed(app);
    }

    notify_batch(app, false, total, total);
}

pub(crate) async fn backfill_missing_channel_avatars(
    db: &SqlitePool,
    telegram: &TelegramState,
    app_dir: &Path,
    app: &AppHandle,
) {
    let channels: Vec<crate::shared::models::Channel> =
        sqlx::query_as("SELECT * FROM channels WHERE deleted = 0")
            .fetch_all(db)
            .await
            .unwrap_or_default();
    let mut changed_any = false;
    for channel in channels {
        let before = channel.avatar_path.clone();
        if fetch_and_store_channel_avatar(db, telegram, &channel, app_dir).await {
            let after: Option<(Option<String>,)> =
                sqlx::query_as("SELECT avatar_path FROM channels WHERE id = ?")
                    .bind(&channel.id)
                    .fetch_optional(db)
                    .await
                    .ok()
                    .flatten();
            if after.map(|(p,)| p) != Some(before) {
                changed_any = true;
            }
        }
    }
    if changed_any {
        notify_library_changed(app);
    }
}

pub(crate) async fn fetch_and_store_channel_avatar(
    db: &SqlitePool,
    telegram: &TelegramState,
    channel: &crate::shared::models::Channel,
    app_dir: &Path,
) -> bool {
    let Ok(channel_numeric_id) = channel.id.parse::<i64>() else {
        return false;
    };
    let Ok(peer) = telegram
        .resolve_channel_peer(
            channel_numeric_id,
            channel.username.as_deref(),
            channel.access_hash,
        )
        .await
    else {
        return false;
    };
    let Some(path) = telegram
        .refresh_channel_avatar(peer, app_dir, &channel.id)
        .await
    else {
        return false;
    };
    sqlx::query("UPDATE channels SET avatar_path = ? WHERE id = ?")
        .bind(&path)
        .bind(&channel.id)
        .execute(db)
        .await
        .is_ok()
}

pub(crate) async fn prune_channel(
    db: &SqlitePool,
    channel_id: &str,
    current_playing: Option<&Path>,
) {
    let orphan_filter = "channel_id = ? AND id NOT IN (SELECT track_id FROM playlist_tracks)";

    let orphan_files: Vec<(String,)> = sqlx::query_as(&format!(
        "SELECT DISTINCT file_path FROM tracks WHERE {orphan_filter} AND file_path != ''"
    ))
    .bind(channel_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    for query in [
        format!("DELETE FROM fingerprints WHERE track_id IN (SELECT id FROM tracks WHERE {orphan_filter})"),
        format!("DELETE FROM cluster_tracks WHERE track_id IN (SELECT id FROM tracks WHERE {orphan_filter})"),
        format!("DELETE FROM tracks WHERE {orphan_filter}"),
    ] {
        let _ = sqlx::query(&query).bind(channel_id).execute(db).await;
    }

    let _ = sqlx::query("UPDATE channels SET is_active = 0 WHERE id = ?")
        .bind(channel_id)
        .execute(db)
        .await;

    for (file_path,) in orphan_files {
        media::files::prune_unused_file(db, &file_path, current_playing).await;
    }
}
