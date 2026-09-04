//! Saved Messages, used as the user's own storage.

use std::path::Path;

use anyhow::Result;
use grammers_client::media::{Attribute, Media};
use grammers_client::message::InputMessage;
use grammers_client::tl;
use grammers_session::types::PeerRef;

use super::TelegramState;

pub(crate) struct SavedMusic {
    pub(crate) document_id: i64,
    pub(crate) input: tl::enums::InputDocument,
}

impl TelegramState {
    /// Newest first, first pages only - past a few hundred entries the
    /// position is not worth the round trips.
    pub(crate) async fn saved_music(&self, max: usize) -> Result<Vec<SavedMusic>> {
        let client = self.client().await?;
        let mut out = Vec::new();
        let mut offset = 0i32;

        while out.len() < max {
            let tl::enums::users::SavedMusic::Music(page) = client
                .invoke(&tl::functions::users::GetSavedMusic {
                    id: tl::enums::InputUser::UserSelf,
                    offset,
                    limit: 100,
                    hash: 0,
                })
                .await?
            else {
                break;
            };
            if page.documents.is_empty() {
                break;
            }
            let page_len = page.documents.len();
            for doc in page.documents {
                let tl::enums::Document::Document(d) = doc else {
                    continue;
                };
                out.push(SavedMusic {
                    document_id: d.id,
                    input: tl::enums::InputDocument::Document(tl::types::InputDocument {
                        id: d.id,
                        access_hash: d.access_hash,
                        file_reference: d.file_reference,
                    }),
                });
            }
            offset += page_len as i32;
            if page_len < 100 {
                break;
            }
        }
        Ok(out)
    }

    /// After `after`, or first when None. Re-saving something already there
    /// moves it rather than duplicating it.
    pub(crate) async fn place_saved_music(
        &self,
        id: tl::enums::InputDocument,
        after: Option<tl::enums::InputDocument>,
    ) -> Result<()> {
        let client = self.client().await?;
        client
            .invoke(&tl::functions::account::SaveMusic {
                unsave: false,
                id,
                after_id: after,
            })
            .await?;
        Ok(())
    }

    pub(crate) async fn set_saved_music(
        &self,
        id: tl::enums::InputDocument,
        unsave: bool,
    ) -> Result<()> {
        let client = self.client().await?;
        client
            .invoke(&tl::functions::account::SaveMusic {
                unsave,
                id,
                after_id: None,
            })
            .await?;
        Ok(())
    }

    pub(crate) async fn find_saved_json_message(
        &self,
        hashtag: &str,
        marker: &str,
    ) -> Result<Option<i32>> {
        let client = self.client().await?;
        let peer = PeerRef::from(tl::enums::InputPeer::PeerSelf);
        let mut results = client.search_messages(peer).query(hashtag);
        while let Some(message) = results.next().await? {
            if message.text().contains(marker) {
                return Ok(Some(message.id()));
            }
        }
        Ok(None)
    }

    pub(crate) async fn download_saved_documents(
        &self,
        hashtag: &str,
    ) -> Result<Vec<(i32, Vec<u8>)>> {
        let client = self.client().await?;
        let peer = PeerRef::from(tl::enums::InputPeer::PeerSelf);
        let mut results = client.search_messages(peer).query(hashtag);
        let mut out = Vec::new();
        while let Some(message) = results.next().await? {
            let Some(Media::Document(document)) = message.media() else {
                continue;
            };
            let tmp_path =
                std::env::temp_dir().join(format!("fygram-restore-{}.bin", uuid::Uuid::new_v4()));
            if client.download_media(&document, &tmp_path).await.is_ok() {
                if let Ok(bytes) = tokio::fs::read(&tmp_path).await {
                    out.push((message.id(), bytes));
                }
            }
            let _ = tokio::fs::remove_file(&tmp_path).await;
        }
        Ok(out)
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) async fn sync_saved_document(
        &self,
        cached_message_id: Option<i32>,
        hashtag: &str,
        marker: &str,
        caption: &str,
        file_name: &str,
        json_path: &Path,
    ) -> Result<i32> {
        let client = self.client().await?;
        let peer = PeerRef::from(tl::enums::InputPeer::PeerSelf);

        let uploaded = client.upload_file(json_path).await?;
        let input_message = InputMessage::new()
            .text(caption)
            .mime_type("application/json")
            .document(uploaded)
            .attribute(Attribute::FileName(file_name.to_string()));

        if let Some(message_id) = cached_message_id {
            if client
                .edit_message(peer, message_id, input_message.clone())
                .await
                .is_ok()
            {
                return Ok(message_id);
            }
        }

        if let Some(message_id) = self.find_saved_json_message(hashtag, marker).await? {
            client.edit_message(peer, message_id, input_message).await?;
            return Ok(message_id);
        }

        let sent = client.send_message(peer, input_message).await?;
        Ok(sent.id())
    }

    pub(crate) async fn delete_saved_message(&self, message_id: i32) -> Result<()> {
        let client = self.client().await?;
        let peer = PeerRef::from(tl::enums::InputPeer::PeerSelf);
        client.delete_messages(peer, &[message_id]).await?;
        Ok(())
    }
}
