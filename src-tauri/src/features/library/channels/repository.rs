//! Every SQL statement the channels feature runs.

use chrono::{DateTime, Utc};
use sqlx::SqlitePool;

use crate::shared::error::AppError;
use crate::shared::models::Channel;
use crate::shared::telegram::ChannelInfo;

pub(crate) async fn list_active(db: &SqlitePool) -> Result<Vec<Channel>, AppError> {
    Ok(sqlx::query_as::<_, Channel>(
        "SELECT * FROM channels WHERE deleted = 0 AND is_active = 1 ORDER BY title",
    )
    .fetch_all(db)
    .await?)
}

pub(crate) async fn get(db: &SqlitePool, channel_id: &str) -> Result<Channel, AppError> {
    Ok(
        sqlx::query_as::<_, Channel>("SELECT * FROM channels WHERE id = ?")
            .bind(channel_id)
            .fetch_one(db)
            .await?,
    )
}

/// What we already know about a channel, without asking Telegram. `can_edit`
/// stays whatever was last learned, so None for a row nobody has asked about.
pub(crate) async fn existing_channel_by_id(
    db: &SqlitePool,
    id: i64,
) -> Result<Option<ChannelInfo>, AppError> {
    let row: Option<StoredChannel> = sqlx::query_as(
        "SELECT title, username, access_hash, can_edit, can_repost FROM channels WHERE id = ?",
    )
    .bind(id.to_string())
    .fetch_optional(db)
    .await?;

    Ok(row.map(|row| ChannelInfo {
        id,
        title: row.title,
        username: row.username,
        access_hash: row.access_hash,
        can_edit: row.can_edit,
        can_repost: row.can_repost,
    }))
}

#[derive(sqlx::FromRow)]
struct StoredChannel {
    title: String,
    username: Option<String>,
    access_hash: i64,
    can_edit: Option<bool>,
    can_repost: Option<bool>,
}

pub(crate) async fn upsert_manual(
    db: &SqlitePool,
    info: ChannelInfo,
    device: &str,
) -> Result<Channel, AppError> {
    sqlx::query(
        "INSERT INTO channels \
            (id, username, title, access_hash, source_type, is_active, deleted, \
             rev, updated_at, origin_device, deleted_at, can_edit, can_repost, \
             rights_checked_at) \
         VALUES (?, ?, ?, ?, 'manual', 1, 0, 1, ?, ?, NULL, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
            title = excluded.title, username = excluded.username, \
            access_hash = excluded.access_hash, deleted = 0, is_active = 1, \
            deleted_at = NULL, rev = channels.rev + 1, \
            updated_at = excluded.updated_at, origin_device = excluded.origin_device, \
            can_edit = COALESCE(excluded.can_edit, channels.can_edit), \
            can_repost = COALESCE(excluded.can_repost, channels.can_repost), \
            rights_checked_at = COALESCE(excluded.rights_checked_at, channels.rights_checked_at)",
    )
    .bind(info.id.to_string())
    .bind(&info.username)
    .bind(&info.title)
    .bind(info.access_hash)
    .bind(Utc::now())
    .bind(device)
    .bind(info.can_edit)
    .bind(info.can_repost)
    // stamped only when Telegram actually answered
    .bind(info.can_edit.map(|_| Utc::now()))
    .execute(db)
    .await?;

    Ok(
        sqlx::query_as::<_, Channel>("SELECT * FROM channels WHERE id = ?")
            .bind(info.id.to_string())
            .fetch_one(db)
            .await?,
    )
}

/// Records what Telegram last said about editing here. No `rev` bump: a right
/// belongs to this account on this device, and never travels.
pub(crate) async fn set_edit_right(
    db: &SqlitePool,
    channel_id: &str,
    can_edit: bool,
    can_repost: Option<bool>,
) -> Result<(), AppError> {
    sqlx::query(
        "UPDATE channels SET can_edit = ?, \
                can_repost = COALESCE(?, can_repost), rights_checked_at = ? \
         WHERE id = ?",
    )
    .bind(can_edit)
    .bind(can_repost)
    .bind(Utc::now())
    .bind(channel_id)
    .execute(db)
    .await?;
    Ok(())
}

/// None when the row is gone.
pub(crate) async fn edit_right(
    db: &SqlitePool,
    channel_id: &str,
) -> Result<Option<EditRight>, AppError> {
    Ok(sqlx::query_as::<_, EditRight>(
        "SELECT title, username, access_hash, can_edit, can_repost FROM channels WHERE id = ?",
    )
    .bind(channel_id)
    .fetch_optional(db)
    .await?)
}

#[derive(sqlx::FromRow)]
pub(crate) struct EditRight {
    pub(crate) title: String,
    pub(crate) username: Option<String>,
    pub(crate) access_hash: i64,
    pub(crate) can_edit: Option<bool>,
    pub(crate) can_repost: Option<bool>,
}

pub(crate) async fn tombstone(
    db: &SqlitePool,
    channel_id: &str,
    stamp: ChannelStamp<'_>,
) -> Result<Vec<String>, AppError> {
    let orphan_filter = "channel_id = ? AND id NOT IN (SELECT track_id FROM playlist_tracks)";

    let orphan_files: Vec<(String,)> = sqlx::query_as(&format!(
        "SELECT DISTINCT file_path FROM tracks WHERE {orphan_filter} AND file_path != ''"
    ))
    .bind(channel_id)
    .fetch_all(db)
    .await?;

    for query in [
        format!("DELETE FROM fingerprints WHERE track_id IN (SELECT id FROM tracks WHERE {orphan_filter})"),
        format!("DELETE FROM cluster_tracks WHERE track_id IN (SELECT id FROM tracks WHERE {orphan_filter})"),
        format!("DELETE FROM tracks WHERE {orphan_filter}"),
    ] {
        sqlx::query(&query)
            .bind(channel_id)
            .execute(db)
            .await?;
    }

    match stamp {
        ChannelStamp::Local { device } => sqlx::query(
            "UPDATE channels SET deleted = 1, is_active = 0, deleted_at = ?, \
                    rev = rev + 1, updated_at = ?, origin_device = ? WHERE id = ?",
        )
        .bind(Utc::now())
        .bind(Utc::now())
        .bind(device)
        .bind(channel_id),
        ChannelStamp::Remote {
            rev,
            updated_at,
            device,
            deleted_at,
        } => sqlx::query(
            "UPDATE channels SET deleted = 1, is_active = 0, deleted_at = ?, \
                rev = ?, updated_at = ?, origin_device = ? WHERE id = ?",
        )
        .bind(deleted_at)
        .bind(rev)
        .bind(updated_at)
        .bind(device)
        .bind(channel_id),
    }
    .execute(db)
    .await?;

    Ok(orphan_files.into_iter().map(|(p,)| p).collect())
}

pub(crate) enum ChannelStamp<'a> {
    Local {
        device: &'a str,
    },
    Remote {
        rev: i64,
        updated_at: DateTime<Utc>,
        device: &'a str,
        deleted_at: Option<DateTime<Utc>>,
    },
}
