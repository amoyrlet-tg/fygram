//! The animated emoji a user can wear next to their name.

use std::io::Read;
use std::path::Path;

use anyhow::{Context, Result};
use grammers_client::media::Document;
use grammers_client::{tl, Client};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum EmojiStatusKind {
    Lottie,
    Video,
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct EmojiStatus {
    pub(crate) path: String,
    pub(crate) kind: EmojiStatusKind,
}

pub(crate) fn status_document_id(user: &tl::enums::User) -> Option<i64> {
    let tl::enums::User::User(user) = user else {
        return None;
    };
    match user.emoji_status.as_ref()? {
        tl::enums::EmojiStatus::Status(status) => Some(status.document_id),
        tl::enums::EmojiStatus::Collectible(status) => Some(status.document_id),
        _ => None,
    }
}

pub(crate) async fn fetch(client: &Client, dir: &Path, document_id: i64) -> Result<EmojiStatus> {
    let documents = client
        .invoke(&tl::functions::messages::GetCustomEmojiDocuments {
            document_id: vec![document_id],
        })
        .await
        .context("asking Telegram for the emoji status document")?;

    let raw = documents
        .into_iter()
        .find(|d| matches!(d, tl::enums::Document::Document(_)))
        .context("Telegram returned no document for this emoji status")?;

    let mime = match &raw {
        tl::enums::Document::Document(d) => d.mime_type.clone(),
        tl::enums::Document::Empty(_) => String::new(),
    };
    let (kind, extension) = match mime.as_str() {
        "application/x-tgsticker" => (EmojiStatusKind::Lottie, "json"),
        "video/webm" => (EmojiStatusKind::Video, "webm"),
        _ => (EmojiStatusKind::Image, "webp"),
    };

    let path = dir.join(format!("avatar_status_{document_id}.{extension}"));
    if tokio::fs::try_exists(&path).await.unwrap_or(false) {
        return Ok(EmojiStatus {
            path: path.to_string_lossy().into_owned(),
            kind,
        });
    }

    let document = Document::from_raw_media(tl::types::MessageMediaDocument {
        nopremium: false,
        spoiler: false,
        video: false,
        round: false,
        voice: false,
        document: Some(raw),
        alt_documents: None,
        video_cover: None,
        video_timestamp: None,
        ttl_seconds: None,
    });

    let mut bytes = Vec::new();
    let mut download = client.iter_download(&document);
    while let Some(chunk) = download
        .next()
        .await
        .context("downloading the emoji status document")?
    {
        bytes.extend_from_slice(&chunk);
    }

    if matches!(kind, EmojiStatusKind::Lottie) {
        bytes = unpack_lottie(&bytes).context("unpacking the emoji status animation")?;
    }

    crate::shared::atomic_file::atomic_write_async(&path, &bytes)
        .await
        .context("writing the emoji status file")?;

    Ok(EmojiStatus {
        path: path.to_string_lossy().into_owned(),
        kind,
    })
}

fn unpack_lottie(gzipped: &[u8]) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    flate2::read::GzDecoder::new(gzipped).read_to_end(&mut out)?;
    Ok(out)
}
