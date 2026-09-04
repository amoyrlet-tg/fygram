//! Where every file the library owns lives on disk. One place decides the whole
//! layout, so a path is never built by hand anywhere else.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

use crate::shared::settings;

pub(crate) const MEDIA_ROOT_KEY: &str = "media_root";

const SHARD_LEN: usize = 2;

const COVERS_DIR: &str = "covers";
const INCOMING_DIR: &str = ".incoming";
const PLAYLISTS_DIR: &str = "playlists";

pub(crate) fn default_media_root(app: &AppHandle) -> Result<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .context("resolving app data dir")?
        .join("media"))
}

pub(crate) async fn media_root(app: &AppHandle, db: &SqlitePool) -> Result<PathBuf> {
    if let Ok(Some(configured)) = settings::get(db, MEDIA_ROOT_KEY).await {
        let path = PathBuf::from(configured);
        if !path.as_os_str().is_empty() {
            return Ok(path);
        }
    }
    default_media_root(app)
}

pub(crate) fn track_path(root: &Path, channel_id: &str, hash: &str, ext: &str) -> PathBuf {
    channel_dir(root, channel_id)
        .join(shard_of(hash))
        .join(format!("{hash}.{ext}"))
}

/// Named after the same hash as the audio, so a move carries both.
pub(crate) fn cover_path(root: &Path, channel_id: &str, hash: &str) -> PathBuf {
    channel_dir(root, channel_id)
        .join(COVERS_DIR)
        .join(shard_of(hash))
        .join(format!("{hash}.img"))
}

/// Left beside a track with no picture, so its tags are not re-read on every
/// scroll.
pub(crate) fn no_cover_path(root: &Path, channel_id: &str, hash: &str) -> PathBuf {
    cover_path(root, channel_id, hash).with_extension("none")
}

/// Away from the channel shards: these belong to no channel.
pub(crate) fn playlist_covers_dir(root: &Path) -> PathBuf {
    root.join(PLAYLISTS_DIR)
}

/// The stamp is in the name on purpose: a stable path keeps its URL, and the
/// webview would go on showing the copy it had cached.
pub(crate) fn playlist_cover_path(root: &Path, playlist_id: &str, stamp: i64) -> PathBuf {
    playlist_covers_dir(root).join(format!("{playlist_id}-{stamp}.jpg"))
}

pub(crate) fn channel_dir(root: &Path, channel_id: &str) -> PathBuf {
    root.join(channel_id)
}

pub(crate) fn incoming_dir(root: &Path, channel_id: &str) -> PathBuf {
    channel_dir(root, channel_id).join(INCOMING_DIR)
}

fn shard_of(hash: &str) -> String {
    if hash.len() < SHARD_LEN {
        return "00".to_string();
    }
    hash[..SHARD_LEN].to_lowercase()
}

pub(crate) async fn walk_audio_files(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(mut channels) = tokio::fs::read_dir(root).await else {
        return out;
    };
    while let Ok(Some(channel)) = channels.next_entry().await {
        if !is_dir(&channel).await {
            continue;
        }
        collect_within(&channel.path(), &mut out).await;
    }
    out
}

async fn collect_within(channel_dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(mut entries) = tokio::fs::read_dir(channel_dir).await else {
        return;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if is_dir(&entry).await {
            if entry.file_name() == INCOMING_DIR {
                continue;
            }
            let Ok(mut files) = tokio::fs::read_dir(&path).await else {
                continue;
            };
            while let Ok(Some(file)) = files.next_entry().await {
                if is_file(&file).await {
                    out.push(file.path());
                }
            }
            continue;
        }
        if is_file(&entry).await {
            out.push(path);
        }
    }
}

async fn is_dir(entry: &tokio::fs::DirEntry) -> bool {
    entry.file_type().await.map(|t| t.is_dir()).unwrap_or(false)
}

async fn is_file(entry: &tokio::fs::DirEntry) -> bool {
    entry
        .file_type()
        .await
        .map(|t| t.is_file())
        .unwrap_or(false)
}

pub(crate) async fn stale_incoming_files(root: &Path, grace: std::time::Duration) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(mut channels) = tokio::fs::read_dir(root).await else {
        return out;
    };
    while let Ok(Some(channel)) = channels.next_entry().await {
        if !is_dir(&channel).await {
            continue;
        }
        let incoming = channel.path().join(INCOMING_DIR);
        let Ok(mut files) = tokio::fs::read_dir(&incoming).await else {
            continue;
        };
        while let Ok(Some(file)) = files.next_entry().await {
            let recent = file
                .metadata()
                .await
                .and_then(|m| m.modified())
                .ok()
                .and_then(|m| m.elapsed().ok())
                .map(|age| age < grace)
                .unwrap_or(true);
            if !recent {
                out.push(file.path());
            }
        }
    }
    out
}

pub(crate) async fn move_file(from: &Path, to: &Path) -> Result<()> {
    if let Some(parent) = to.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }
    match tokio::fs::rename(from, to).await {
        Ok(()) => Ok(()),
        Err(_) => {
            tokio::fs::copy(from, to)
                .await
                .with_context(|| format!("copying {from:?} to {to:?}"))?;
            tokio::fs::remove_file(from).await.ok();
            Ok(())
        }
    }
}

pub(crate) async fn prune_empty_dirs(root: &Path) {
    let Ok(mut channels) = tokio::fs::read_dir(root).await else {
        return;
    };
    let mut channel_paths = Vec::new();
    while let Ok(Some(channel)) = channels.next_entry().await {
        if is_dir(&channel).await {
            channel_paths.push(channel.path());
        }
    }
    for channel in channel_paths {
        let Ok(mut entries) = tokio::fs::read_dir(&channel).await else {
            continue;
        };
        let mut shards = Vec::new();
        while let Ok(Some(entry)) = entries.next_entry().await {
            if is_dir(&entry).await {
                shards.push(entry.path());
            }
        }
        for shard in shards {
            let _ = tokio::fs::remove_dir(&shard).await;
        }
        let _ = tokio::fs::remove_dir(&channel).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_hash_lands_in_the_bucket_named_after_its_first_byte() {
        let root = Path::new("/media");
        assert_eq!(
            track_path(root, "123", "ab12cd34", "mp3"),
            Path::new("/media/123/ab/ab12cd34.mp3")
        );
    }

    #[test]
    fn buckets_are_case_insensitive_so_one_hash_never_gets_two_homes() {
        assert_eq!(shard_of("AB12"), shard_of("ab12"));
    }

    #[test]
    fn a_nonsense_hash_still_produces_a_path_instead_of_panicking() {
        assert_eq!(shard_of(""), "00");
        assert_eq!(shard_of("a"), "00");
    }
}
