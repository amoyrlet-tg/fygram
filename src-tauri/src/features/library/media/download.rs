//! Getting a track's bytes onto disk: the batch above, one track below. The
//! wire itself is `transport`.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};
use futures_util::stream::{self, StreamExt};
use grammers_client::media::Media;
use lofty::file::TaggedFileExt;
use lofty::tag::Accessor;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use crate::shared::media_paths;
use crate::shared::models::Track;
use crate::shared::telegram::TelegramState;

use super::covers;
use super::repository;
use super::transport;

const MAX_CONCURRENT_TRACK_DOWNLOADS: usize = 4;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DownloadStats {
    pub(crate) downloaded: u32,
    pub(crate) failed: u32,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DownloadProgress {
    pub(crate) channel_id: String,
    pub(crate) processed: usize,
    pub(crate) total: usize,
    pub(crate) downloaded: u32,

    pub(crate) done: bool,
}

#[allow(clippy::too_many_arguments)]
async fn run_track_downloads(
    db: &SqlitePool,
    telegram: &TelegramState,
    media_dir: &Path,
    progress_id: &str,
    tracks: Vec<Track>,
    cancel: Arc<AtomicBool>,
    locks: &tokio::sync::Mutex<std::collections::HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    log_label: &str,
    mut on_progress: impl FnMut(DownloadProgress),
) -> DownloadStats {
    let total = tracks.len();
    let mut downloaded = 0u32;
    let mut failed = 0u32;
    let mut processed = 0usize;

    let mut results = stream::iter(tracks)
        .map(|track| async move {
            let res =
                ensure_track_downloaded(db, telegram, media_dir, &track, locks, |_, _| {}).await;
            (track, res)
        })
        .buffer_unordered(MAX_CONCURRENT_TRACK_DOWNLOADS);

    while let Some((track, res)) = results.next().await {
        match res {
            Ok(_) => downloaded += 1,
            Err(err) => {
                eprintln!("{log_label}: track {} failed: {err:#}", track.id);
                failed += 1;
            }
        }
        processed += 1;
        on_progress(DownloadProgress {
            channel_id: progress_id.to_string(),
            processed,
            total,
            downloaded,
            done: false,
        });

        if cancel.load(Ordering::Relaxed) {
            break;
        }
    }

    on_progress(DownloadProgress {
        channel_id: progress_id.to_string(),
        processed: total,
        total,
        downloaded,
        done: true,
    });

    DownloadStats { downloaded, failed }
}

pub(crate) async fn download_channel_tracks(
    db: &SqlitePool,
    telegram: &TelegramState,
    media_dir: &Path,
    channel_id: &str,
    cancel: Arc<AtomicBool>,
    locks: &tokio::sync::Mutex<std::collections::HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    on_progress: impl FnMut(DownloadProgress),
) -> Result<DownloadStats> {
    let tracks = repository::tracks_needing_download_in_channel(db, channel_id).await?;
    Ok(run_track_downloads(
        db,
        telegram,
        media_dir,
        channel_id,
        tracks,
        cancel,
        locks,
        "download_channel_tracks",
        on_progress,
    )
    .await)
}

pub(crate) async fn download_playlist_tracks(
    db: &SqlitePool,
    telegram: &TelegramState,
    media_dir: &Path,
    playlist_id: &str,
    cancel: Arc<AtomicBool>,
    locks: &tokio::sync::Mutex<std::collections::HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    on_progress: impl FnMut(DownloadProgress),
) -> Result<DownloadStats> {
    let tracks = repository::tracks_needing_download_in_playlist(db, playlist_id).await?;
    Ok(run_track_downloads(
        db,
        telegram,
        media_dir,
        playlist_id,
        tracks,
        cancel,
        locks,
        "download_playlist_tracks",
        on_progress,
    )
    .await)
}

pub(crate) async fn ensure_track_downloaded(
    db: &SqlitePool,
    telegram: &TelegramState,
    media_dir: &Path,
    track: &Track,
    locks: &tokio::sync::Mutex<std::collections::HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    on_progress: impl FnMut(usize, usize),
) -> Result<String> {
    let lock = {
        let mut locks_map = locks.lock().await;
        locks_map
            .entry(track.id.clone())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone()
    };

    let result = {
        let _guard = lock.lock().await;
        download_track_locked(db, telegram, media_dir, track, on_progress).await
    };

    {
        let mut locks_map = locks.lock().await;
        if Arc::strong_count(&lock) <= 2 {
            locks_map.remove(&track.id);
        }
    }

    result
}

async fn download_track_locked(
    db: &SqlitePool,
    telegram: &TelegramState,
    media_dir: &Path,
    track: &Track,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<String> {
    let track = &repository::reload_track(db, &track.id)
        .await
        .context("reloading track after acquiring download lock")?;

    let file_exists =
        !track.file_path.is_empty() && tokio::fs::metadata(&track.file_path).await.is_ok();
    if file_exists {
        return Ok(track.file_path.clone());
    }

    let channel = repository::load_channel(db, &track.channel_id)
        .await
        .context("loading track's channel")?;
    let channel_numeric_id: i64 = channel
        .id
        .parse()
        .context("channel id is not a valid Telegram id")?;
    let peer = telegram
        .resolve_channel_peer(
            channel_numeric_id,
            channel.username.as_deref(),
            channel.access_hash,
        )
        .await?;
    let client = telegram.client().await?;

    let message = client
        .get_messages_by_id(peer, &[track.tg_message_id as i32])
        .await
        .context("fetching track's message")?
        .into_iter()
        .next()
        .flatten()
        .with_context(|| format!("message {} no longer exists", track.tg_message_id))?;
    let Some(Media::Document(document)) = message.media() else {
        anyhow::bail!(
            "message {} has no audio document anymore",
            track.tg_message_id
        );
    };

    let incoming = media_paths::incoming_dir(media_dir, &track.channel_id);
    tokio::fs::create_dir_all(&incoming).await?;

    if !track.file_path.is_empty() {
        let tmp_path = incoming.join(format!("{}.part", track.tg_message_id));
        transport::download_with_retries(&client, &document, &tmp_path, &mut on_progress)
            .await
            .context("downloading audio")?;
        // a file that vanished keeps the path the library already knows
        store_audio(&tmp_path, Path::new(&track.file_path)).await?;
        return Ok(track.file_path.clone());
    }

    let tmp_path = incoming.join(format!("{}.part", track.tg_message_id));
    transport::download_with_retries(&client, &document, &tmp_path, &mut on_progress)
        .await
        .context("downloading audio")?;
    let hash = sha256_file(&tmp_path).await?;

    let final_path =
        if let Some(existing_path) = repository::find_existing_by_hash(db, &hash).await? {
            tokio::fs::remove_file(&tmp_path).await.ok();
            existing_path
        } else {
            let ext = sniff_extension(&tmp_path).await;
            let path = media_paths::track_path(media_dir, &track.channel_id, &hash, ext);
            if let Some(parent) = path.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }
            store_audio(&tmp_path, &path).await?;
            path.to_string_lossy().to_string()
        };

    let final_path_for_tags = final_path.clone();
    let album = tokio::task::spawn_blocking(move || {
        covers::read_tags(Path::new(&final_path_for_tags))
            .ok()
            .and_then(|f| {
                f.primary_tag()
                    .and_then(|t| t.album())
                    .map(|c| c.into_owned())
            })
    })
    .await
    .unwrap_or(None);

    repository::finalize_download(db, &track.id, &final_path, &hash, &album).await?;

    if let Some(doc_id) = track.tg_document_id {
        repository::backfill_document(db, doc_id, &final_path, &hash).await?;
    }

    Ok(final_path)
}

/// Sniffed from the first bytes: the mime Telegram attaches is routinely wrong
/// on forwarded files. Cosmetic - playback opens files by content, not name.
fn extension_from_head(head: &[u8]) -> &'static str {
    if head.len() < 12 {
        return "bin";
    }
    if head.starts_with(b"ID3") {
        return "mp3";
    }
    if head[0] == 0xFF && head[1] & 0xE0 == 0xE0 {
        // mp3 and adts aac share the sync word; layer bits 00 are reserved in
        // mpeg audio, so they mean aac
        return if head[1] & 0x06 == 0 { "aac" } else { "mp3" };
    }
    if head.starts_with(b"fLaC") {
        return "flac";
    }
    if head.starts_with(b"RIFF") && &head[8..12] == b"WAVE" {
        return "wav";
    }
    if &head[4..8] == b"ftyp" {
        return "m4a";
    }
    if head.starts_with(b"OggS") {
        return if head.windows(8).any(|w| w == b"OpusHead") {
            "opus"
        } else {
            "ogg"
        };
    }
    if head.starts_with(b"\x30\x26\xB2\x75") {
        return "wma";
    }
    if head.starts_with(b"MAC ") {
        return "ape";
    }
    "bin"
}

async fn sniff_extension(path: &Path) -> &'static str {
    use tokio::io::AsyncReadExt;

    let Ok(mut file) = tokio::fs::File::open(path).await else {
        return "bin";
    };
    let mut buffer = [0u8; 64];
    let read = file.read(&mut buffer).await.unwrap_or(0);
    extension_from_head(&buffer[..read])
}

/// Untouched: the player decodes every container through ffmpeg, so the bytes
/// Telegram served are the bytes kept.
async fn store_audio(src: &Path, dst: &Path) -> Result<()> {
    if tokio::fs::rename(src, dst).await.is_ok() {
        return Ok(());
    }
    tokio::fs::copy(src, dst)
        .await
        .context("moving the downloaded audio into place")?;
    tokio::fs::remove_file(src).await.ok();
    Ok(())
}

async fn sha256_file(path: &Path) -> Result<String> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || -> Result<String> {
        let mut file = std::fs::File::open(&path).context("opening downloaded file for hashing")?;
        let mut hasher = Sha256::new();
        std::io::copy(&mut file, &mut hasher).context("hashing downloaded file")?;
        Ok(format!("{:x}", hasher.finalize()))
    })
    .await
    .context("hashing downloaded file")?
}

#[cfg(test)]
mod tests {
    use super::*;

    // first bytes of files ffmpeg actually produced, not what the specs say
    const MP3: &[u8] = &[
        0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x54, 0x53, 0x53, 0x45, 0x00,
        0x00, 0x00, 0x0f, 0x00, 0x00, 0x03, 0x4c, 0x61, 0x76, 0x66, 0x36, 0x32, 0x2e, 0x31, 0x32,
        0x2e, 0x31, 0x30, 0x32, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    const AAC: &[u8] = &[
        0xff, 0xf1, 0x50, 0x40, 0x21, 0x3f, 0xfc, 0xde, 0x02, 0x00, 0x4c, 0x61, 0x76, 0x63, 0x36,
        0x32, 0x2e, 0x32, 0x38, 0x2e, 0x31, 0x30, 0x32, 0x00, 0x02, 0x60, 0xac, 0x5b, 0xa9, 0x50,
        0x72, 0x26, 0xa5, 0x78, 0xf5, 0xe3, 0xf7, 0xae, 0xb8, 0x96,
    ];
    const M4A: &[u8] = &[
        0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, 0x00, 0x00, 0x02,
        0x00, 0x4d, 0x34, 0x41, 0x20, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, 0x00, 0x00,
        0x00, 0x08, 0x66, 0x72, 0x65, 0x65, 0x00, 0x00, 0x23, 0x21,
    ];
    const FLAC: &[u8] = &[
        0x66, 0x4c, 0x61, 0x43, 0x00, 0x00, 0x00, 0x22, 0x12, 0x00, 0x12, 0x00, 0x00, 0x02, 0xf2,
        0x00, 0x04, 0xf0, 0x0a, 0xc4, 0x40, 0xf0, 0x00, 0x00, 0xac, 0x44, 0xa4, 0x84, 0xb6, 0x60,
        0xd9, 0xe0, 0x33, 0xb0, 0x9b, 0xed, 0x9e, 0x68, 0x6a, 0x74,
    ];
    const WAV: &[u8] = &[
        0x52, 0x49, 0x46, 0x46, 0xce, 0x58, 0x01, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74,
        0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x44, 0xac, 0x00, 0x00, 0x88, 0x58,
        0x01, 0x00, 0x02, 0x00, 0x10, 0x00, 0x4c, 0x49, 0x53, 0x54,
    ];
    const OGG_VORBIS: &[u8] = &[
        0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x69,
        0x55, 0x23, 0x05, 0x00, 0x00, 0x00, 0x00, 0x30, 0x07, 0xa1, 0xc8, 0x01, 0x1e, 0x01, 0x76,
        0x6f, 0x72, 0x62, 0x69, 0x73, 0x00, 0x00, 0x00, 0x00, 0x01,
    ];
    const OGG_OPUS: &[u8] = &[
        0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xcd,
        0xc6, 0x4d, 0x48, 0x00, 0x00, 0x00, 0x00, 0x6d, 0x54, 0x9d, 0xa9, 0x01, 0x13, 0x4f, 0x70,
        0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 0x01, 0x01, 0x38, 0x01,
    ];

    #[test]
    fn names_each_container_after_what_it_is() {
        assert_eq!(extension_from_head(MP3), "mp3");
        assert_eq!(extension_from_head(AAC), "aac");
        assert_eq!(extension_from_head(M4A), "m4a");
        assert_eq!(extension_from_head(FLAC), "flac");
        assert_eq!(extension_from_head(WAV), "wav");
        assert_eq!(extension_from_head(OGG_VORBIS), "ogg");
        assert_eq!(extension_from_head(OGG_OPUS), "opus");
    }

    #[test]
    fn adts_aac_is_not_mistaken_for_mp3() {
        // an mp3 with no id3 tag: eleven sync bits shared with aac above, and
        // only the layer bits tell them apart
        let mpeg_frame = [0xFF, 0xFB, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0];
        assert_eq!(AAC[0], mpeg_frame[0]);
        assert_eq!(AAC[1] & 0xE0, mpeg_frame[1] & 0xE0);
        assert_eq!(extension_from_head(&mpeg_frame), "mp3");
        assert_eq!(extension_from_head(&AAC[..12]), "aac");
    }

    #[test]
    fn junk_gets_a_neutral_name_rather_than_a_wrong_one() {
        assert_eq!(extension_from_head(b""), "bin");
        assert_eq!(extension_from_head(b"not audio at all"), "bin");
    }
}
