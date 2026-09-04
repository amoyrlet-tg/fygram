//! Reading and rewriting a single message - which, for a track, is how an edit reaches the channel.

use std::path::Path;
use std::time::Duration;

use anyhow::{anyhow, Result};
use grammers_client::media::{Attribute, Media};
use grammers_client::message::InputMessage;
use grammers_client::{tl, Client};
use grammers_session::types::PeerRef;

use super::TelegramState;

/// One track as Telegram should hold it.
pub(crate) struct TrackUpload<'a> {
    pub(crate) file_path: &'a Path,
    pub(crate) title: &'a str,
    pub(crate) performer: &'a str,
    pub(crate) duration: Duration,

    /// None only when the file carries no usable picture.
    pub(crate) thumbnail: Option<Vec<u8>>,
}

pub(crate) struct MessageMeta {
    /// The caption already on the message; an edit keeps it.
    pub(crate) text: String,
    /// Set only for a forward, which cannot be edited at all - so this doubles
    /// as the flag.
    pub(crate) forwarded_at: Option<chrono::DateTime<chrono::Utc>>,
    pub(crate) forwarded_from: Option<String>,
}

impl MessageMeta {
    pub(crate) fn is_forward(&self) -> bool {
        self.forwarded_at.is_some()
    }
}

impl TelegramState {
    /// The caption is needed for the edit anyway, so the forward header comes
    /// free - and finding out later would mean finding out after the upload.
    pub(crate) async fn message_meta(&self, peer: PeerRef, message_id: i32) -> Result<MessageMeta> {
        let client = self.client().await?;
        let message = client
            .get_messages_by_id(peer, &[message_id])
            .await?
            .into_iter()
            .next()
            .flatten()
            .ok_or_else(|| anyhow!("message {message_id} no longer exists"))?;

        let header = message
            .forward_header()
            .map(|tl::enums::MessageFwdHeader::Header(header)| header);

        Ok(MessageMeta {
            text: message.text().to_string(),
            forwarded_at: header.as_ref().map(|h| {
                chrono::DateTime::from_timestamp(i64::from(h.date), 0)
                    .unwrap_or_else(chrono::Utc::now)
            }),
            forwarded_from: header.and_then(|h| {
                h.post_author
                    .or(h.from_name)
                    .filter(|name| !name.is_empty())
            }),
        })
    }

    /// The only way to fix a forwarded track: Telegram refuses to edit one.
    /// The new message goes up first, so a failure halfway leaves the channel
    /// with the track it already had.
    pub(crate) async fn repost_track(
        &self,
        peer: PeerRef,
        old_message_id: i32,
        track: TrackUpload<'_>,
        caption: &str,
        delete_original: bool,
    ) -> Result<i32> {
        let client = self.client().await?;
        let posted = send_file_as_message(&client, peer, track, caption).await?;

        if delete_original {
            if let Err(err) = client.delete_messages(peer, &[old_message_id]).await {
                // untidy but recoverable; losing the new one would not be
                eprintln!(
                    "repost_track: posted {posted} but could not delete {old_message_id}: {err}"
                );
            }
        }
        Ok(posted)
    }

    pub(crate) async fn resolve_music_document(
        &self,
        peer: PeerRef,
        message_id: i32,
    ) -> Result<tl::enums::InputDocument> {
        let client = self.client().await?;
        let message = client
            .get_messages_by_id(peer, &[message_id])
            .await?
            .into_iter()
            .next()
            .flatten()
            .ok_or_else(|| anyhow!("message {message_id} no longer exists"))?;

        let Some(Media::Document(document)) = message.media() else {
            return Err(anyhow!(
                "message {message_id} has no audio document anymore"
            ));
        };
        Ok(document.to_raw_input_media().id)
    }

    pub(crate) async fn rename_track(
        &self,
        peer: PeerRef,
        message_id: i32,
        track: TrackUpload<'_>,
        caption: &str,
    ) -> Result<()> {
        let client = self.client().await?;
        push_file_to_message(&client, peer, message_id, track, caption).await
    }
}

/// Labelling an m4a as mp3 makes clients guess, so the upload says what it is.
fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("m4a" | "mp4" | "aac") => "audio/mp4",
        Some("flac") => "audio/flac",
        Some("ogg" | "oga") => "audio/ogg",
        Some("opus") => "audio/opus",
        Some("wav") => "audio/wav",
        _ => "audio/mpeg",
    }
}

/// The message a track travels in.
async fn track_message(
    client: &Client,
    track: TrackUpload<'_>,
    caption: &str,
) -> Result<InputMessage> {
    let uploaded = client.upload_file(track.file_path).await?;
    let mut input_message = InputMessage::new()
        .text(caption)
        .mime_type(mime_for(track.file_path))
        .document(uploaded)
        .attribute(Attribute::Audio {
            duration: track.duration,
            title: Some(track.title.to_string()),
            performer: Some(track.performer.to_string()),
        });

    // a music message shows this file, not anything inside the audio, so an
    // edit without one leaves it bare. must follow `document`.
    if let Some(bytes) = track.thumbnail {
        let size = bytes.len();
        let thumb = client
            .upload_stream(&mut bytes.as_slice(), size, "cover.jpg".to_string())
            .await?;
        input_message = input_message.thumbnail(thumb);
    }
    Ok(input_message)
}

pub(crate) async fn push_file_to_message(
    client: &Client,
    peer: PeerRef,
    message_id: i32,
    track: TrackUpload<'_>,
    caption: &str,
) -> Result<()> {
    let input_message = track_message(client, track, caption).await?;
    client.edit_message(peer, message_id, input_message).await?;
    Ok(())
}

async fn send_file_as_message(
    client: &Client,
    peer: PeerRef,
    track: TrackUpload<'_>,
    caption: &str,
) -> Result<i32> {
    let input_message = track_message(client, track, caption).await?;
    Ok(client.send_message(peer, input_message).await?.id())
}
