//! Profile pictures, cached next to the app rather than fetched again for every render.

use std::path::Path;

use anyhow::Result;
use grammers_client::tl;
use grammers_client::Client;
use grammers_session::types::PeerRef;

use super::TelegramState;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct CurrentUser {
    pub(crate) id: i64,
    pub(crate) first_name: String,
    pub(crate) last_name: Option<String>,
    pub(crate) username: Option<String>,
    pub(crate) avatar_path: Option<String>,
    pub(crate) emoji_status: Option<super::emoji_status::EmojiStatus>,
}

impl TelegramState {
    pub(crate) async fn get_me(&self, avatar_dir: &Path) -> Result<CurrentUser> {
        let client = self.client().await?;
        let me = client.get_me().await?;
        let user_id = me.id().bare_id().unwrap_or_default();
        let avatar_path = refresh_user_avatar(&client, avatar_dir, user_id).await;

        let mut emoji_status = None;
        if let Some(document_id) = super::emoji_status::status_document_id(&me.raw) {
            match super::emoji_status::fetch(&client, avatar_dir, document_id).await {
                Ok(status) => emoji_status = Some(status),
                Err(err) => eprintln!("emoji status {document_id}: {err:#}"),
            }
        }

        Ok(CurrentUser {
            id: user_id,
            first_name: me.first_name().unwrap_or_default().to_string(),
            last_name: me.last_name().map(str::to_string),
            username: me.username().map(str::to_string),
            avatar_path,
            emoji_status,
        })
    }

    pub(crate) async fn refresh_channel_avatar(
        &self,
        peer: PeerRef,
        dir: &Path,
        channel_id: &str,
    ) -> Option<String> {
        let client = self.client().await.ok()?;
        let prefix = format!("avatar_channel_{channel_id}_");
        let legacy = format!("avatar_channel_{channel_id}.jpg");

        let photo = match current_channel_photo(&client, peer).await {
            Ok(photo) => photo,
            Err(err) => {
                eprintln!("avatar: fetching channel {channel_id} photo failed: {err:#}");
                return cached_avatar_fallback(dir, &prefix, Some(&legacy)).await;
            }
        };
        refresh_avatar(&client, dir, &prefix, Some(&legacy), photo).await
    }
}

struct PhotoVideoLocation {
    id: i64,
    access_hash: i64,
    file_reference: Vec<u8>,
    thumb_size: String,
    byte_size: usize,
}

impl grammers_client::media::Downloadable for PhotoVideoLocation {
    fn to_raw_input_location(&self) -> Option<tl::enums::InputFileLocation> {
        Some(
            tl::types::InputPhotoFileLocation {
                id: self.id,
                access_hash: self.access_hash,
                file_reference: self.file_reference.clone(),
                thumb_size: self.thumb_size.clone(),
            }
            .into(),
        )
    }

    fn size(&self) -> Option<usize> {
        Some(self.byte_size)
    }
}

async fn cleanup_avatar_files(dir: &Path, prefix: &str, legacy: Option<&str>, keep: Option<&str>) {
    let Ok(mut entries) = tokio::fs::read_dir(dir).await else {
        return;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name();
        let name = name.to_string_lossy().to_string();
        let matches = name.starts_with(prefix) || Some(name.as_str()) == legacy;
        if matches && Some(name.as_str()) != keep {
            let _ = tokio::fs::remove_file(entry.path()).await;
        }
    }
}

async fn cached_avatar_fallback(dir: &Path, prefix: &str, legacy: Option<&str>) -> Option<String> {
    if let Some(path) = latest_cached_avatar(dir, prefix).await {
        return Some(path);
    }
    let legacy_path = dir.join(legacy?);
    tokio::fs::metadata(&legacy_path)
        .await
        .is_ok()
        .then(|| legacy_path.to_string_lossy().to_string())
}

async fn latest_cached_avatar(dir: &Path, prefix: &str) -> Option<String> {
    let mut entries = tokio::fs::read_dir(dir).await.ok()?;
    let mut newest: Option<(std::time::SystemTime, String)> = None;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with(prefix) {
            continue;
        }
        let modified = entry
            .metadata()
            .await
            .ok()
            .and_then(|m| m.modified().ok())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        let path = entry.path().to_string_lossy().to_string();
        if newest.as_ref().is_none_or(|(t, _)| modified > *t) {
            newest = Some((modified, path));
        }
    }
    newest.map(|(_, p)| p)
}

async fn current_profile_photo(client: &Client) -> Result<Option<tl::enums::Photo>> {
    let tl::enums::users::UserFull::Full(full) = client
        .invoke(&tl::functions::users::GetFullUser {
            id: tl::enums::InputUser::UserSelf,
        })
        .await?;
    let tl::enums::UserFull::Full(full_user) = full.full_user;
    Ok(full_user.personal_photo.or(full_user.profile_photo))
}

async fn current_channel_photo(client: &Client, peer: PeerRef) -> Result<Option<tl::enums::Photo>> {
    let channel: tl::enums::InputChannel = peer.into();
    let tl::enums::messages::ChatFull::Full(full) = client
        .invoke(&tl::functions::channels::GetFullChannel { channel })
        .await?;
    Ok(match full.full_chat {
        tl::enums::ChatFull::ChannelFull(cf) => Some(cf.chat_photo),
        tl::enums::ChatFull::Full(cf) => cf.chat_photo,
    })
}

async fn refresh_user_avatar(client: &Client, dir: &Path, user_id: i64) -> Option<String> {
    let prefix = format!("avatar_{user_id}_");
    let legacy = format!("avatar_{user_id}.jpg");

    let photo = match current_profile_photo(client).await {
        Ok(photo) => photo,
        Err(err) => {
            eprintln!("avatar: fetching current profile photo failed: {err:#}");
            return cached_avatar_fallback(dir, &prefix, Some(&legacy)).await;
        }
    };
    refresh_avatar(client, dir, &prefix, Some(&legacy), photo).await
}

async fn refresh_avatar(
    client: &Client,
    dir: &Path,
    prefix: &str,
    legacy: Option<&str>,
    photo: Option<tl::enums::Photo>,
) -> Option<String> {
    let Some(photo_enum) = photo else {
        cleanup_avatar_files(dir, prefix, legacy, None).await;
        return None;
    };

    let raw = match &photo_enum {
        tl::enums::Photo::Photo(raw) => raw.clone(),
        tl::enums::Photo::Empty(_) => {
            cleanup_avatar_files(dir, prefix, legacy, None).await;
            return None;
        }
    };
    let photo = grammers_client::media::Photo::from_raw(photo_enum);
    let video = raw.video_sizes.as_ref().and_then(|sizes| {
        sizes
            .iter()
            .filter_map(|v| match v {
                tl::enums::VideoSize::Size(s) => Some(s),
                _ => None,
            })
            .max_by_key(|s| s.size)
            .cloned()
    });

    let ext = if video.is_some() { "mp4" } else { "jpg" };
    let file_name = format!("{prefix}{}.{ext}", raw.id);
    let dest = dir.join(&file_name);
    if tokio::fs::metadata(&dest).await.is_ok() {
        cleanup_avatar_files(dir, prefix, legacy, Some(&file_name)).await;
        return Some(dest.to_string_lossy().to_string());
    }

    tokio::fs::create_dir_all(dir).await.ok()?;
    let downloaded = match video {
        Some(video) => {
            let location = PhotoVideoLocation {
                id: raw.id,
                access_hash: raw.access_hash,
                file_reference: raw.file_reference.clone(),
                thumb_size: video.r#type.clone(),
                byte_size: video.size.max(0) as usize,
            };
            client
                .download_media(&location, &dest)
                .await
                .inspect_err(|err| eprintln!("avatar: video download failed: {err:#}"))
                .is_ok()
        }
        None => client
            .download_media(&photo, &dest)
            .await
            .inspect_err(|err| eprintln!("avatar: photo download failed: {err:#}"))
            .is_ok(),
    };
    if !downloaded {
        let _ = tokio::fs::remove_file(&dest).await;
        return cached_avatar_fallback(dir, prefix, legacy).await;
    }

    cleanup_avatar_files(dir, prefix, legacy, Some(&file_name)).await;
    Some(dest.to_string_lossy().to_string())
}
