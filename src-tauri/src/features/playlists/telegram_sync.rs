//! Playlists as documents in Saved Messages.
//!
//! No server arbitrates between two machines, so every change carries a device
//! stamp and a revision, and a delete leaves a tombstone rather than a gap.

use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::path::Path;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::features::sync::outbox;
use crate::features::sync::stamp::Stamp;
use crate::shared::telegram::TelegramState;

pub(crate) const HASHTAG: &str = "#playlistfygram";

pub(crate) const TOMBSTONE_TTL: chrono::Duration = chrono::Duration::days(90);

fn default_rev() -> i64 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SyncTrack {
    pub(crate) channel_id: String,
    pub(crate) tg_message_id: i64,
    pub(crate) title: Option<String>,
    pub(crate) artist: Option<String>,
    pub(crate) album: Option<String>,
    pub(crate) duration_sec: Option<i64>,
    pub(crate) position: i64,
    pub(crate) added_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct SyncDoc {
    pub(crate) hashtag: String,
    pub(crate) playlist_id: String,
    pub(crate) name: String,
    pub(crate) is_smart: bool,
    pub(crate) smart_rule: Option<String>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
    #[serde(default)]
    pub(crate) rev: i64,
    #[serde(default)]
    pub(crate) device_id: String,
    #[serde(default)]
    pub(crate) deleted: bool,
    #[serde(default)]
    pub(crate) deleted_at: Option<DateTime<Utc>>,
    pub(crate) tracks: Vec<SyncTrack>,
}

impl SyncDoc {
    fn stamp(&self) -> Stamp {
        if self.rev <= 0 {
            return Stamp::legacy();
        }
        Stamp {
            rev: self.rev,
            updated_at: self.updated_at,
            device: self.device_id.clone(),
        }
    }
}

#[derive(sqlx::FromRow)]
struct PlaylistRow {
    name: String,
    is_smart: bool,
    smart_rule: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    rev: i64,
    origin_device: String,
    deleted: bool,
    deleted_at: Option<DateTime<Utc>>,
    telegram_sync_message_id: Option<i64>,
    cover_path: Option<String>,
}

impl PlaylistRow {
    fn stamp(&self) -> Stamp {
        Stamp {
            rev: self.rev,
            updated_at: self.updated_at,
            device: self.origin_device.clone(),
        }
    }
}

#[derive(sqlx::FromRow)]
struct TrackRow {
    channel_id: String,
    tg_message_id: i64,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration_sec: Option<i64>,
    position: i64,
    added_at: DateTime<Utc>,
}

impl From<TrackRow> for SyncTrack {
    fn from(r: TrackRow) -> Self {
        SyncTrack {
            channel_id: r.channel_id,
            tg_message_id: r.tg_message_id,
            title: r.title,
            artist: r.artist,
            album: r.album,
            duration_sec: r.duration_sec,
            position: r.position,
            added_at: r.added_at,
        }
    }
}

/// A zip holding `playlist.json` and, when there is one, `cover.jpg`. It used
/// to be the bare json and `unpack` still reads that; nothing writes it.
const DOC_ENTRY: &str = "playlist.json";
const COVER_ENTRY: &str = "cover.jpg";
const ZIP_MAGIC: &[u8; 4] = b"PK\x03\x04";

fn pack(doc: &SyncDoc, cover: Option<&[u8]>) -> Result<Vec<u8>> {
    use std::io::Write;

    let json = serde_json::to_vec_pretty(doc).context("serializing playlist json")?;
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options: zip::write::FileOptions<'_, ()> =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file(DOC_ENTRY, options)
        .context("starting the playlist entry")?;
    zip.write_all(&json).context("writing the playlist entry")?;

    if let Some(cover) = cover {
        // already a JPEG: deflate would spend time to save nothing
        let stored: zip::write::FileOptions<'_, ()> =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Stored);
        zip.start_file(COVER_ENTRY, stored)
            .context("starting the cover entry")?;
        zip.write_all(cover).context("writing the cover entry")?;
    }

    Ok(zip.finish().context("finishing the snapshot")?.into_inner())
}

fn unpack(bytes: &[u8]) -> Result<(SyncDoc, Option<Vec<u8>>)> {
    use std::io::Read;

    if !bytes.starts_with(ZIP_MAGIC) {
        // a snapshot written before playlists could carry a picture
        return Ok((
            serde_json::from_slice(bytes).context("reading a bare playlist snapshot")?,
            None,
        ));
    }

    let mut zip =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).context("opening the snapshot")?;

    let mut json = Vec::new();
    zip.by_name(DOC_ENTRY)
        .context("this snapshot holds no playlist")?
        .read_to_end(&mut json)
        .context("reading the playlist entry")?;
    let doc = serde_json::from_slice(&json).context("reading the playlist entry")?;

    let mut cover = Vec::new();
    let found = zip
        .by_name(COVER_ENTRY)
        .ok()
        .map(|mut entry| entry.read_to_end(&mut cover))
        .transpose()
        .context("reading the cover entry")?
        .is_some();

    Ok((doc, found.then_some(cover)))
}

fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_'))
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "playlist".to_string()
    } else {
        trimmed.to_string()
    }
}

async fn load_row(db: &SqlitePool, playlist_id: &str) -> Result<Option<PlaylistRow>> {
    sqlx::query_as::<_, PlaylistRow>(
        "SELECT name, is_smart, smart_rule, created_at, updated_at, rev, origin_device, \
                deleted, deleted_at, telegram_sync_message_id, cover_path \
         FROM playlists WHERE id = ?",
    )
    .bind(playlist_id)
    .fetch_optional(db)
    .await
    .context("loading playlist")
}

async fn collect_tracks(db: &SqlitePool, playlist_id: &str) -> Result<Vec<SyncTrack>> {
    let mut tracks: Vec<SyncTrack> = sqlx::query_as::<_, TrackRow>(
        "SELECT tracks.channel_id, tracks.tg_message_id, tracks.title, tracks.artist, \
                tracks.album, tracks.duration_sec, playlist_tracks.position, playlist_tracks.added_at \
         FROM playlist_tracks \
         JOIN tracks ON tracks.id = playlist_tracks.track_id \
         WHERE playlist_tracks.playlist_id = ?",
    )
    .bind(playlist_id)
    .fetch_all(db)
    .await
    .context("loading playlist tracks")?
    .into_iter()
    .map(SyncTrack::from)
    .collect();

    let pending: Vec<SyncTrack> = sqlx::query_as::<_, TrackRow>(
        "SELECT channel_id, tg_message_id, title, artist, album, duration_sec, position, added_at \
         FROM playlist_pending_tracks WHERE playlist_id = ?",
    )
    .bind(playlist_id)
    .fetch_all(db)
    .await
    .context("loading pending playlist tracks")?
    .into_iter()
    .map(SyncTrack::from)
    .collect();

    tracks.extend(pending);
    tracks.sort_by(|a, b| {
        a.position
            .cmp(&b.position)
            .then_with(|| a.channel_id.cmp(&b.channel_id))
            .then_with(|| a.tg_message_id.cmp(&b.tg_message_id))
    });
    Ok(tracks)
}

pub(crate) async fn push_playlist(
    db: &SqlitePool,
    telegram: &TelegramState,
    playlist_id: &str,
) -> Result<()> {
    let Some(row) = load_row(db, playlist_id).await? else {
        return Ok(());
    };

    if row.deleted && tombstone_expired(row.deleted_at) {
        return drop_tombstone(db, telegram, playlist_id, row.telegram_sync_message_id).await;
    }

    let tracks = if row.deleted {
        Vec::new()
    } else {
        collect_tracks(db, playlist_id).await?
    };

    let doc = SyncDoc {
        hashtag: HASHTAG.to_string(),
        playlist_id: playlist_id.to_string(),
        name: row.name.clone(),
        is_smart: row.is_smart,
        smart_rule: row.smart_rule,
        created_at: row.created_at,
        updated_at: row.updated_at,
        rev: row.rev.max(default_rev()),
        device_id: row.origin_device,
        deleted: row.deleted,
        deleted_at: row.deleted_at,
        tracks,
    };

    let cover = match row.cover_path.as_deref().filter(|_| !row.deleted) {
        Some(path) => tokio::fs::read(path).await.ok(),
        None => None,
    };
    let bundle = pack(&doc, cover.as_deref())?;
    let marker = format!("id: {playlist_id}");
    let headline = if row.deleted {
        format!("{} (deleted)", doc.name)
    } else {
        doc.name.clone()
    };
    let caption = format!("{HASHTAG}\n{headline}\n{marker}");
    let file_name = format!("{}.zip", sanitize_file_name(&doc.name));

    let tmp_path =
        std::env::temp_dir().join(format!("fygram-playlist-{}.zip", uuid::Uuid::new_v4()));
    tokio::fs::write(&tmp_path, &bundle)
        .await
        .context("writing the playlist snapshot to a temp file")?;

    let result = telegram
        .sync_saved_document(
            row.telegram_sync_message_id.map(|id| id as i32),
            HASHTAG,
            &marker,
            &caption,
            &file_name,
            &tmp_path,
        )
        .await;
    let _ = tokio::fs::remove_file(&tmp_path).await;
    let message_id = result.context("pushing playlist snapshot to Saved Messages")?;

    sqlx::query("UPDATE playlists SET telegram_sync_message_id = ? WHERE id = ?")
        .bind(message_id as i64)
        .bind(playlist_id)
        .execute(db)
        .await
        .context("saving telegram_sync_message_id")?;

    Ok(())
}

fn tombstone_expired(deleted_at: Option<DateTime<Utc>>) -> bool {
    deleted_at.is_some_and(|at| Utc::now() - at > TOMBSTONE_TTL)
}

async fn drop_tombstone(
    db: &SqlitePool,
    telegram: &TelegramState,
    playlist_id: &str,
    message_id: Option<i64>,
) -> Result<()> {
    if let Some(message_id) = message_id {
        if let Err(err) = telegram.delete_saved_message(message_id as i32).await {
            crate::log!("sync: could not delete the expired tombstone of {playlist_id}: {err:#}");
        }
    }
    let _ = sqlx::query("DELETE FROM playlist_pending_tracks WHERE playlist_id = ?")
        .bind(playlist_id)
        .execute(db)
        .await;
    sqlx::query("DELETE FROM playlists WHERE id = ?")
        .bind(playlist_id)
        .execute(db)
        .await
        .context("removing expired playlist tombstone")?;
    outbox::forget(db, outbox::PLAYLIST, playlist_id).await;
    Ok(())
}

pub(crate) async fn pull_playlists(
    db: &SqlitePool,
    telegram: &TelegramState,
    media_root: &Path,
) -> Result<bool> {
    let raw = telegram
        .download_saved_documents(HASHTAG)
        .await
        .context("listing playlist snapshots")?;

    let mut newest: HashMap<String, (i32, SyncDoc, Option<Vec<u8>>)> = HashMap::new();
    let mut stale_messages: Vec<i32> = Vec::new();
    for (message_id, bytes) in raw {
        let (doc, cover) = match unpack(&bytes) {
            Ok(unpacked) => unpacked,
            Err(err) => {
                crate::log!("sync: skipping malformed playlist snapshot {message_id}: {err:#}");
                continue;
            }
        };
        match newest.entry(doc.playlist_id.clone()) {
            Entry::Occupied(mut slot) => {
                if doc.stamp() > slot.get().1.stamp() {
                    stale_messages.push(slot.get().0);
                    slot.insert((message_id, doc, cover));
                } else {
                    stale_messages.push(message_id);
                }
            }
            Entry::Vacant(slot) => {
                slot.insert((message_id, doc, cover));
            }
        }
    }
    for message_id in stale_messages {
        if let Err(err) = telegram.delete_saved_message(message_id).await {
            crate::log!("sync: could not delete duplicate snapshot {message_id}: {err:#}");
        }
    }

    let mut changed = false;
    for (message_id, doc, cover) in newest.into_values() {
        match apply_remote_playlist(db, media_root, message_id, &doc, cover.as_deref()).await {
            Ok(applied) => changed |= applied,
            Err(err) => crate::log!("sync: could not apply {}: {err:#}", doc.playlist_id),
        }
    }
    Ok(changed)
}

/// Returns the path to store on the row.
async fn land_cover(media_root: &Path, playlist_id: &str, cover: Option<&[u8]>) -> Option<String> {
    let Some(bytes) = cover else {
        super::service::drop_covers(media_root, playlist_id, None).await;
        return None;
    };
    super::service::store_cover(media_root, playlist_id, bytes).await
}

async fn apply_remote_playlist(
    db: &SqlitePool,
    media_root: &Path,
    message_id: i32,
    doc: &SyncDoc,
    cover: Option<&[u8]>,
) -> Result<bool> {
    let local = load_row(db, &doc.playlist_id).await?;

    if let Some(row) = &local {
        if row.telegram_sync_message_id != Some(message_id as i64) {
            let _ = sqlx::query("UPDATE playlists SET telegram_sync_message_id = ? WHERE id = ?")
                .bind(message_id as i64)
                .bind(&doc.playlist_id)
                .execute(db)
                .await;
        }
        let local_stamp = row.stamp();
        if local_stamp >= doc.stamp() {
            if local_stamp > doc.stamp() {
                outbox::enqueue(db, outbox::PLAYLIST, &doc.playlist_id).await;
            }
            return Ok(false);
        }
    } else if doc.deleted && tombstone_expired(doc.deleted_at) {
        return Ok(false);
    }

    let cover_path = land_cover(media_root, &doc.playlist_id, cover).await;
    write_remote_playlist(db, message_id, doc, cover_path.as_deref()).await?;
    Ok(true)
}

async fn write_remote_playlist(
    db: &SqlitePool,
    message_id: i32,
    doc: &SyncDoc,
    cover_path: Option<&str>,
) -> Result<()> {
    let mut tx = db.begin().await.context("opening playlist merge tx")?;

    sqlx::query(
        "INSERT INTO playlists \
            (id, name, is_smart, smart_rule, created_at, updated_at, rev, origin_device, \
             deleted, deleted_at, telegram_sync_message_id, cover_path) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
            name = excluded.name, is_smart = excluded.is_smart, \
            smart_rule = excluded.smart_rule, updated_at = excluded.updated_at, \
            rev = excluded.rev, origin_device = excluded.origin_device, \
            deleted = excluded.deleted, deleted_at = excluded.deleted_at, \
            telegram_sync_message_id = excluded.telegram_sync_message_id, \
            cover_path = excluded.cover_path",
    )
    .bind(&doc.playlist_id)
    .bind(&doc.name)
    .bind(doc.is_smart)
    .bind(&doc.smart_rule)
    .bind(doc.created_at)
    .bind(doc.updated_at)
    .bind(doc.rev.max(default_rev()))
    .bind(&doc.device_id)
    .bind(doc.deleted)
    .bind(doc.deleted_at)
    .bind(message_id as i64)
    .bind(cover_path)
    .execute(&mut *tx)
    .await
    .context("writing merged playlist row")?;

    sqlx::query("DELETE FROM playlist_tracks WHERE playlist_id = ?")
        .bind(&doc.playlist_id)
        .execute(&mut *tx)
        .await
        .context("clearing playlist tracks before merge")?;
    sqlx::query("DELETE FROM playlist_pending_tracks WHERE playlist_id = ?")
        .bind(&doc.playlist_id)
        .execute(&mut *tx)
        .await
        .context("clearing pending playlist tracks before merge")?;

    if !doc.deleted {
        for track in &doc.tracks {
            let resolved: Option<(String,)> =
                sqlx::query_as("SELECT id FROM tracks WHERE channel_id = ? AND tg_message_id = ?")
                    .bind(&track.channel_id)
                    .bind(track.tg_message_id)
                    .fetch_optional(&mut *tx)
                    .await
                    .context("resolving a merged playlist track")?;

            match resolved {
                Some((track_id,)) => {
                    sqlx::query(
                        "INSERT OR REPLACE INTO playlist_tracks \
                            (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?)",
                    )
                    .bind(&doc.playlist_id)
                    .bind(&track_id)
                    .bind(track.position)
                    .bind(track.added_at)
                    .execute(&mut *tx)
                    .await
                    .context("writing merged playlist track")?;
                }
                None => {
                    sqlx::query(
                        "INSERT OR REPLACE INTO playlist_pending_tracks \
                            (playlist_id, channel_id, tg_message_id, title, artist, album, \
                             duration_sec, position, added_at) \
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    )
                    .bind(&doc.playlist_id)
                    .bind(&track.channel_id)
                    .bind(track.tg_message_id)
                    .bind(&track.title)
                    .bind(&track.artist)
                    .bind(&track.album)
                    .bind(track.duration_sec)
                    .bind(track.position)
                    .bind(track.added_at)
                    .execute(&mut *tx)
                    .await
                    .context("parking an unresolved playlist track")?;
                }
            }
        }
    }

    tx.commit().await.context("committing playlist merge")?;
    Ok(())
}

pub(crate) async fn resolve_pending_tracks(db: &SqlitePool, channel_id: &str) -> Result<u32> {
    #[derive(sqlx::FromRow)]
    struct PendingRow {
        playlist_id: String,
        tg_message_id: i64,
        position: i64,
        added_at: DateTime<Utc>,
    }

    let pending = sqlx::query_as::<_, PendingRow>(
        "SELECT playlist_id, tg_message_id, position, added_at \
         FROM playlist_pending_tracks WHERE channel_id = ?",
    )
    .bind(channel_id)
    .fetch_all(db)
    .await
    .context("listing pending tracks for a channel")?;

    let mut resolved = 0u32;
    for row in pending {
        let track: Option<(String,)> =
            sqlx::query_as("SELECT id FROM tracks WHERE channel_id = ? AND tg_message_id = ?")
                .bind(channel_id)
                .bind(row.tg_message_id)
                .fetch_optional(db)
                .await
                .context("looking up a now-indexed pending track")?;
        let Some((track_id,)) = track else {
            continue;
        };

        sqlx::query(
            "INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_id, position, added_at) \
             VALUES (?, ?, ?, ?)",
        )
        .bind(&row.playlist_id)
        .bind(&track_id)
        .bind(row.position)
        .bind(row.added_at)
        .execute(db)
        .await
        .context("promoting a pending track")?;

        sqlx::query(
            "DELETE FROM playlist_pending_tracks \
             WHERE playlist_id = ? AND channel_id = ? AND tg_message_id = ?",
        )
        .bind(&row.playlist_id)
        .bind(channel_id)
        .bind(row.tg_message_id)
        .execute(db)
        .await
        .context("clearing a promoted pending track")?;

        resolved += 1;
    }
    Ok(resolved)
}

pub(crate) async fn gc_tombstones(db: &SqlitePool, telegram: &TelegramState) {
    let cutoff = Utc::now() - TOMBSTONE_TTL;
    let expired: Vec<(String, Option<i64>)> = sqlx::query_as(
        "SELECT id, telegram_sync_message_id FROM playlists \
         WHERE deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?",
    )
    .bind(cutoff)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    for (playlist_id, message_id) in expired {
        if let Err(err) = drop_tombstone(db, telegram, &playlist_id, message_id).await {
            crate::log!("sync: could not retire the tombstone of {playlist_id}: {err:#}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn db() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    async fn seed_track(pool: &SqlitePool, channel_id: &str, message_id: i64) -> String {
        sqlx::query(
            "INSERT OR IGNORE INTO channels (id, title, access_hash, source_type) \
             VALUES (?, 'ch', 0, 'manual')",
        )
        .bind(channel_id)
        .execute(pool)
        .await
        .unwrap();
        let track_id = format!("track-{channel_id}-{message_id}");
        sqlx::query(
            "INSERT INTO tracks (id, channel_id, tg_message_id, file_path, file_hash) \
             VALUES (?, ?, ?, '', '')",
        )
        .bind(&track_id)
        .bind(channel_id)
        .bind(message_id)
        .execute(pool)
        .await
        .unwrap();
        track_id
    }

    async fn seed_local_playlist(pool: &SqlitePool, id: &str, name: &str, rev: i64) {
        sqlx::query(
            "INSERT INTO playlists (id, name, updated_at, rev, origin_device) \
             VALUES (?, ?, ?, ?, 'here')",
        )
        .bind(id)
        .bind(name)
        .bind(Utc::now())
        .bind(rev)
        .execute(pool)
        .await
        .unwrap();
    }

    fn remote_doc(id: &str, name: &str, rev: i64, tracks: Vec<SyncTrack>) -> SyncDoc {
        SyncDoc {
            hashtag: HASHTAG.to_string(),
            playlist_id: id.to_string(),
            name: name.to_string(),
            is_smart: false,
            smart_rule: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            rev,
            device_id: "other".to_string(),
            deleted: false,
            deleted_at: None,
            tracks,
        }
    }

    fn track(channel_id: &str, message_id: i64, position: i64) -> SyncTrack {
        SyncTrack {
            channel_id: channel_id.to_string(),
            tg_message_id: message_id,
            title: Some("t".to_string()),
            artist: None,
            album: None,
            duration_sec: None,
            position,
            added_at: Utc::now(),
        }
    }

    async fn name_of(pool: &SqlitePool, id: &str) -> String {
        sqlx::query_as::<_, (String,)>("SELECT name FROM playlists WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await
            .unwrap()
            .0
    }

    /// Nothing is ever written into it.
    fn media_dir() -> std::path::PathBuf {
        std::env::temp_dir().join("fygram-playlist-tests")
    }

    fn doc_named(name: &str) -> SyncDoc {
        remote_doc("p", name, 1, vec![])
    }

    #[test]
    fn a_snapshot_carries_its_cover_there_and_back() {
        let packed = pack(&doc_named("mine"), Some(b"not really a jpeg")).unwrap();
        assert!(packed.starts_with(ZIP_MAGIC));

        let (doc, cover) = unpack(&packed).unwrap();
        assert_eq!(doc.name, "mine");
        assert_eq!(cover.as_deref(), Some(&b"not really a jpeg"[..]));
    }

    #[test]
    fn a_playlist_without_a_cover_packs_without_one() {
        let (doc, cover) = unpack(&pack(&doc_named("bare"), None).unwrap()).unwrap();
        assert_eq!(doc.name, "bare");
        assert!(cover.is_none());
    }

    #[test]
    fn snapshots_written_before_covers_are_still_read() {
        // exactly what older versions uploaded: the bare json, no zip around it
        let json = serde_json::to_vec(&doc_named("legacy")).unwrap();
        let (doc, cover) = unpack(&json).unwrap();
        assert_eq!(doc.name, "legacy");
        assert!(cover.is_none());
    }

    #[tokio::test]
    async fn a_newer_remote_version_replaces_the_local_one() {
        let pool = db().await;
        seed_local_playlist(&pool, "p", "old name", 1).await;

        let applied = apply_remote_playlist(
            &pool,
            &media_dir(),
            7,
            &remote_doc("p", "new name", 4, vec![]),
            None,
        )
        .await
        .unwrap();

        assert!(applied);
        assert_eq!(name_of(&pool, "p").await, "new name");
    }

    #[tokio::test]
    async fn an_older_remote_version_is_ignored_and_queued_for_correction() {
        let pool = db().await;
        seed_local_playlist(&pool, "p", "mine", 9).await;

        let applied = apply_remote_playlist(
            &pool,
            &media_dir(),
            7,
            &remote_doc("p", "theirs", 2, vec![]),
            None,
        )
        .await
        .unwrap();

        assert!(!applied);
        assert_eq!(name_of(&pool, "p").await, "mine");
        let queued: Vec<(String, String)> =
            sqlx::query_as("SELECT entity, entity_id FROM sync_outbox")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert!(queued.contains(&(outbox::PLAYLIST.to_string(), "p".to_string())));
    }

    #[tokio::test]
    async fn a_remote_delete_leaves_a_tombstone_rather_than_dropping_the_row() {
        let pool = db().await;
        seed_local_playlist(&pool, "p", "doomed", 1).await;
        let mut doc = remote_doc("p", "doomed", 5, vec![]);
        doc.deleted = true;
        doc.deleted_at = Some(Utc::now());

        assert!(apply_remote_playlist(&pool, &media_dir(), 7, &doc, None)
            .await
            .unwrap());

        let (deleted,): (bool,) = sqlx::query_as("SELECT deleted FROM playlists WHERE id = ?")
            .bind("p")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(
            deleted,
            "the row has to survive, or the other device re-adds it"
        );
        assert!(crate::features::playlists::repository::list(&pool)
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn a_track_from_an_unindexed_channel_is_parked_and_still_pushed_back() {
        let pool = db().await;
        seed_track(&pool, "known", 10).await;

        let doc = remote_doc(
            "p",
            "mixed",
            3,
            vec![track("known", 10, 0), track("unknown-here", 42, 1)],
        );
        assert!(apply_remote_playlist(&pool, &media_dir(), 7, &doc, None)
            .await
            .unwrap());

        let resolved: Vec<(String,)> =
            sqlx::query_as("SELECT track_id FROM playlist_tracks WHERE playlist_id = 'p'")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(resolved.len(), 1);

        let outgoing = collect_tracks(&pool, "p").await.unwrap();
        assert_eq!(outgoing.len(), 2);
        assert_eq!(outgoing[1].channel_id, "unknown-here");

        seed_track(&pool, "unknown-here", 42).await;
        assert_eq!(
            resolve_pending_tracks(&pool, "unknown-here").await.unwrap(),
            1
        );
        let resolved: Vec<(String,)> =
            sqlx::query_as("SELECT track_id FROM playlist_tracks WHERE playlist_id = 'p'")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(resolved.len(), 2);
        assert!(collect_tracks(&pool, "p").await.unwrap().len() == 2);
    }

    #[tokio::test]
    async fn a_snapshot_written_before_stamps_existed_never_beats_local_state() {
        let pool = db().await;
        seed_local_playlist(&pool, "p", "mine", 1).await;
        let mut legacy = remote_doc("p", "theirs", 1, vec![]);
        legacy.rev = 0;
        legacy.device_id = String::new();

        assert!(
            !apply_remote_playlist(&pool, &media_dir(), 7, &legacy, None)
                .await
                .unwrap()
        );
        assert_eq!(name_of(&pool, "p").await, "mine");
    }
}
