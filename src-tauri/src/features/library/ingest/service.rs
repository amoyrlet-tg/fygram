//! Walking a channel's messages and turning the audio ones into rows.
//!
//! Not just an append: messages get deleted and edited upstream too.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};
use grammers_client::media::Media;
use grammers_client::message::Message;
use grammers_client::tl;
use grammers_client::tl::enums::MessagesFilter;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use super::repository;
use crate::features::library::media;
use crate::features::library::tags::artist_parser::Parser;
use crate::features::library::tags::metadata::split_collab_names;
use crate::features::playlists::service as playlists_service;
use crate::shared::models::{Channel, Track};
use crate::shared::telegram::TelegramState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SyncDepth {
    Full,
    #[default]
    NewOnly,
}

const KNOWN_RUN_TO_STOP: u32 = 60;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct SyncStats {
    pub(crate) new_tracks: u32,
    pub(crate) skipped_duplicates: u32,
    pub(crate) removed_tracks: u32,
    pub(crate) updated_tracks: u32,
    pub(crate) stopped_early: bool,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct SyncProgress {
    pub(crate) channel_id: String,
    pub(crate) processed: usize,
    pub(crate) total: usize,
    pub(crate) new_tracks: u32,

    pub(crate) latest_track: Option<Track>,

    pub(crate) done: bool,
}

pub(crate) async fn sync_channel(
    db: &SqlitePool,
    telegram: &TelegramState,
    channel: &Channel,
    depth: SyncDepth,
    cancel: Arc<AtomicBool>,
    current_playing: Option<&std::path::Path>,
    mut on_progress: impl FnMut(SyncProgress),
) -> Result<SyncStats> {
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
    let resolved_hash = peer.auth.hash();
    if resolved_hash != 0 && resolved_hash != channel.access_hash {
        if let Err(err) = repository::refresh_access_hash(db, &channel.id, resolved_hash).await {
            eprintln!(
                "sync: could not store the fresh access_hash for {}: {err}",
                channel.id
            );
        }
    }
    let client = telegram.client().await?;

    let mut messages = client
        .search_messages(peer)
        .filter(MessagesFilter::InputMessagesFilterMusic);
    let total = messages.total().await.unwrap_or(0);

    let parser = Parser::fit(db).await?;

    let mut new_tracks = 0u32;
    let mut skipped_duplicates = 0u32;
    let mut updated_tracks = 0u32;
    let mut processed = 0usize;
    let mut known_run = 0u32;
    let mut stopped_early = false;

    let mut seen_message_ids: std::collections::HashSet<i64> = std::collections::HashSet::new();

    let mut hard_error: Option<anyhow::Error> = None;
    loop {
        let message = match messages.next().await {
            Ok(Some(m)) => m,
            Ok(None) => break,
            Err(err) => {
                hard_error = Some(err.into());
                break;
            }
        };
        if cancel.load(Ordering::Relaxed) {
            break;
        }

        processed += 1;
        seen_message_ids.insert(message.id() as i64);

        let outcome = ingest_message(db, channel, &message, &parser, depth, current_playing).await;
        let mut latest_track = None;
        match &outcome {
            Ok(IngestOutcome::Inserted(track_id) | IngestOutcome::Linked(track_id)) => {
                new_tracks += 1;
                known_run = 0;
                latest_track = repository::get_track(db, track_id).await.ok().flatten();
            }
            Ok(IngestOutcome::Replaced(track_id)) => {
                updated_tracks += 1;
                known_run = 0;
                latest_track = repository::get_track(db, track_id).await.ok().flatten();
            }
            Ok(IngestOutcome::NoOp) => {
                skipped_duplicates += 1;
                known_run += 1;
            }
            Ok(IngestOutcome::NotAudio) => {}
            Err(err) => {
                eprintln!("ingest: skipping message {}: {err:#}", message.id());
            }
        }

        on_progress(SyncProgress {
            channel_id: channel.id.clone(),
            processed,
            total,
            new_tracks,
            latest_track,
            done: false,
        });

        if depth == SyncDepth::NewOnly && known_run >= KNOWN_RUN_TO_STOP {
            stopped_early = true;
            break;
        }
    }

    on_progress(SyncProgress {
        channel_id: channel.id.clone(),
        processed,
        total,
        new_tracks,
        latest_track: None,
        done: true,
    });
    if let Some(err) = hard_error {
        return Err(err);
    }

    let was_cancelled = cancel.load(Ordering::Relaxed);
    let mut removed_tracks = 0u32;
    let walked_everything = depth == SyncDepth::Full && !was_cancelled && !stopped_early;
    if walked_everything && !seen_message_ids.is_empty() {
        removed_tracks =
            prune_removed_tracks(db, &channel.id, &seen_message_ids, current_playing).await;
    }

    repository::mark_synced(db, &channel.id, walked_everything).await?;

    Ok(SyncStats {
        new_tracks,
        skipped_duplicates,
        removed_tracks,
        updated_tracks,
        stopped_early,
    })
}

async fn prune_removed_tracks(
    db: &SqlitePool,
    channel_id: &str,
    seen_message_ids: &std::collections::HashSet<i64>,
    current_playing: Option<&std::path::Path>,
) -> u32 {
    let local_tracks = repository::local_tracks(db, channel_id)
        .await
        .unwrap_or_default();

    let gone: Vec<(String, String)> = local_tracks
        .into_iter()
        .filter(|(_, msg_id, _)| !seen_message_ids.contains(msg_id))
        .map(|(id, _, file_path)| (id, file_path))
        .collect();
    if gone.is_empty() {
        return 0;
    }

    let mut affected_playlists: std::collections::HashSet<String> =
        std::collections::HashSet::new();
    for (track_id, _) in &gone {
        let playlists = repository::playlists_of_track(db, track_id)
            .await
            .unwrap_or_default();
        affected_playlists.extend(playlists);

        repository::delete_track_and_links(db, track_id).await;
    }

    for (_, file_path) in &gone {
        media::files::prune_unused_file(db, file_path, current_playing).await;
    }

    for playlist_id in affected_playlists {
        playlists_service::queue_playlist(db, &playlist_id).await;
    }

    gone.len() as u32
}

#[derive(Debug, Clone, Serialize)]
enum IngestOutcome {
    NotAudio,

    NoOp,

    Linked(String),

    Inserted(String),

    Replaced(String),
}

async fn ingest_message(
    db: &SqlitePool,
    channel: &Channel,
    message: &Message,
    parser: &Parser,
    depth: SyncDepth,
    current_playing: Option<&std::path::Path>,
) -> Result<IngestOutcome> {
    let Some(Media::Document(document)) = message.media() else {
        return Ok(IngestOutcome::NotAudio);
    };

    let is_audio = document
        .mime_type()
        .is_some_and(|mime| mime.starts_with("audio/"));
    if !is_audio {
        return Ok(IngestOutcome::NotAudio);
    }

    let message_id = message.id() as i64;
    let forward = forward_of(message);

    let already_ingested = repository::existing_track(db, &channel.id, message_id).await?;
    if let Some((track_id, tg_document_id, file_path)) = already_ingested {
        if depth == SyncDepth::Full && tg_document_id.is_some_and(|old| old != document.id()) {
            repository::replace_document(
                db,
                &track_id,
                document.id(),
                document.duration().map(|d| d as i64),
            )
            .await?;
            media::files::prune_unused_file(db, &file_path, current_playing).await;
            return Ok(IngestOutcome::Replaced(track_id));
        }

        if tg_document_id.is_none() {
            repository::set_document_id(db, &track_id, document.id()).await?;
        }

        repository::backfill_published_at(db, &track_id, message.date()).await?;
        repository::set_forward_info(db, &track_id, forward.as_ref()).await?;

        if document.audio_title().is_some() {
            let parsed = parser.parse(document.performer(), document.audio_title());
            if let Some(derived) = parsed.artists {
                let current = repository::current_artist(db, &track_id).await?;
                if let Some((current_artist,)) = current {
                    let mut members: Vec<String> = current_artist
                        .as_deref()
                        .map(split_collab_names)
                        .unwrap_or_default();
                    let mut seen: std::collections::HashSet<String> =
                        members.iter().map(|m| m.to_lowercase()).collect();
                    let mut added = false;
                    for candidate in derived {
                        if seen.insert(candidate.to_lowercase()) {
                            members.push(candidate);
                            added = true;
                        }
                    }
                    if added {
                        repository::set_artist(db, &track_id, &members.join(" & ")).await?;
                    }
                }
            }
        }

        return Ok(IngestOutcome::NoOp);
    }

    let document_id = document.id();
    let known_document = repository::known_document(db, document_id).await?;
    if let Some((file_path, file_hash, title, artist, album, duration_sec)) = known_document {
        let track_id = repository::insert_track_row(
            db,
            channel,
            message_id,
            Some(document_id),
            &file_path,
            &file_hash,
            title,
            artist,
            album,
            duration_sec,
            Some(message.date()),
        )
        .await?;
        repository::set_forward_info(db, &track_id, forward.as_ref()).await?;
        return Ok(IngestOutcome::Linked(track_id));
    }

    let title = document
        .audio_title()
        .map(str::to_string)
        .or_else(|| document.name().map(str::to_string));
    let artist = document.performer().map(str::to_string);
    let duration_sec = document.duration().map(|d| d as i64);

    let track_id = repository::insert_track_row(
        db,
        channel,
        message_id,
        Some(document_id),
        "",
        "",
        title,
        artist,
        None,
        duration_sec,
        Some(message.date()),
    )
    .await?;
    repository::set_forward_info(db, &track_id, forward.as_ref()).await?;

    Ok(IngestOutcome::Inserted(track_id))
}

/// Whether the message is a forward, and when the original was posted. The date
/// is lost by replacing it, so it goes into the new caption.
fn forward_of(message: &Message) -> Option<repository::Forward> {
    let tl::enums::MessageFwdHeader::Header(header) = message.forward_header()?;
    Some(repository::Forward {
        from: header
            .post_author
            .or(header.from_name)
            .filter(|name| !name.is_empty()),
        at: chrono::DateTime::from_timestamp(i64::from(header.date), 0)
            .unwrap_or_else(chrono::Utc::now),
    })
}
