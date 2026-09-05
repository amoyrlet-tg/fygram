//! Turning a channel id into something the protocol will accept, and remembering the answer.

use anyhow::{anyhow, Result};
use grammers_client::peer::Peer;
use grammers_client::tl;
use grammers_session::types::PeerRef;
use tauri::State;

use crate::AppState;

use super::TelegramState;

fn to_string_err(err: impl std::fmt::Display) -> String {
    err.to_string()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct ChannelInfo {
    pub(crate) id: i64,
    pub(crate) title: String,
    pub(crate) username: Option<String>,

    pub(crate) access_hash: i64,

    /// None when this was rebuilt from our own row and nobody has asked yet.
    pub(crate) can_edit: Option<bool>,

    /// Separate from `can_edit`: Telegram grants the two independently, and a
    /// forwarded track can only be fixed by this one.
    pub(crate) can_repost: Option<bool>,
}

/// What this account may do to the messages of one channel.
///
/// Deliberately conservative: a wrong no costs a resync, a wrong yes costs a
/// download, a tag write and an upload before Telegram refuses anyway.
#[derive(Debug, Clone, Copy)]
struct Rights {
    edit: bool,
    repost: bool,
}

impl Rights {
    const NONE: Self = Self {
        edit: false,
        repost: false,
    };

    fn of(creator: bool, left: bool, admin: Option<&tl::enums::ChatAdminRights>) -> Self {
        if left {
            return Self::NONE;
        }
        if creator {
            return Self {
                edit: true,
                repost: true,
            };
        }
        match admin {
            Some(tl::enums::ChatAdminRights::Rights(rights)) => Self {
                edit: rights.edit_messages,
                // a delete and a post, granted separately from editing
                repost: rights.delete_messages && rights.post_messages,
            },
            None => Self::NONE,
        }
    }
}

fn info_from_channel(raw: &tl::types::Channel) -> ChannelInfo {
    let rights = channel_rights_of(raw);
    ChannelInfo {
        id: raw.id,
        title: raw.title.clone(),
        username: raw.username.clone(),
        access_hash: raw.access_hash.unwrap_or(0),
        can_edit: Some(rights.edit),
        can_repost: Some(rights.repost),
    }
}

fn channel_rights_of(raw: &tl::types::Channel) -> Rights {
    Rights::of(raw.creator, raw.left, raw.admin_rights.as_ref())
}

fn group_rights_of(raw: &tl::enums::Chat) -> Rights {
    match raw {
        tl::enums::Chat::Channel(channel) => channel_rights_of(channel),
        tl::enums::Chat::Chat(chat) => {
            Rights::of(chat.creator, chat.left, chat.admin_rights.as_ref())
        }
        // an empty or forbidden chat is one we cannot even read
        _ => Rights::NONE,
    }
}

impl TelegramState {
    pub(crate) async fn resolve_channel_by_username(&self, username: &str) -> Result<ChannelInfo> {
        let client = self.client().await?;
        let peer = client
            .resolve_username(username.trim_start_matches('@'))
            .await?
            .ok_or_else(|| anyhow!("no Telegram peer found for @{username}"))?;

        match peer {
            Peer::Channel(channel) => Ok(info_from_channel(&channel.raw)),
            Peer::Group(group) => {
                let id = group
                    .id()
                    .bare_id()
                    .ok_or_else(|| anyhow!("@{username} resolved to an unusable peer"))?;
                let title = group
                    .title()
                    .filter(|t| !t.is_empty())
                    .ok_or_else(|| anyhow!("@{username} has no accessible title"))?;
                let rights = group_rights_of(&group.raw);
                Ok(ChannelInfo {
                    id,
                    title: title.to_string(),
                    username: group.username().map(str::to_string),
                    access_hash: 0,
                    can_edit: Some(rights.edit),
                    can_repost: Some(rights.repost),
                })
            }
            Peer::User(_) => Err(anyhow!(
                "@{username} is a private chat, not a channel or group"
            )),
        }
    }

    pub(crate) async fn resolve_channel_info_by_id(&self, channel_id: i64) -> Result<ChannelInfo> {
        let client = self.client().await?;
        let mut dialogs = client.iter_dialogs();
        while let Some(dialog) = dialogs.next().await? {
            match dialog.peer() {
                Peer::Channel(channel) if channel.id().bare_id() == Some(channel_id) => {
                    return Ok(info_from_channel(&channel.raw));
                }
                Peer::Group(group) if group.id().bare_id() == Some(channel_id) => {
                    let title = group.title().filter(|t| !t.is_empty()).unwrap_or("Group");
                    let rights = group_rights_of(&group.raw);
                    return Ok(ChannelInfo {
                        id: channel_id,
                        title: title.to_string(),
                        username: group.username().map(str::to_string),
                        access_hash: 0,
                        can_edit: Some(rights.edit),
                        can_repost: Some(rights.repost),
                    });
                }
                _ => {}
            }
        }
        Err(anyhow!(
            "не нашёл канал/группу {channel_id} среди диалогов - если он архивирован, сначала разархивируй"
        ))
    }

    /// The "minimal resync": one `channels.getChannels` when the access hash is
    /// stored. Only a channel never resolved falls back to the dialog scan.
    pub(crate) async fn channel_rights(
        &self,
        channel_id: i64,
        username: Option<&str>,
        access_hash: i64,
    ) -> Result<ChannelInfo> {
        if access_hash != 0 {
            match self.channel_rights_direct(channel_id, access_hash).await {
                Ok(info) => return Ok(info),
                // a rotated hash, or we were thrown out; the slower paths may
                // still know
                Err(err) => crate::log!("telegram: direct rights lookup for {channel_id}: {err}"),
            }
        }

        if let Some(username) = username {
            let info = self.resolve_channel_by_username(username).await?;
            // a username can move to another channel; the id is what we asked about
            if info.id == channel_id {
                return Ok(info);
            }
        }

        self.resolve_channel_info_by_id(channel_id).await
    }

    async fn channel_rights_direct(
        &self,
        channel_id: i64,
        access_hash: i64,
    ) -> Result<ChannelInfo> {
        let client = self.client().await?;
        let chats = client
            .invoke(&tl::functions::channels::GetChannels {
                id: vec![tl::enums::InputChannel::Channel(tl::types::InputChannel {
                    channel_id,
                    access_hash,
                })],
            })
            .await?;

        chats
            .chats()
            .iter()
            .find_map(|chat| match chat {
                tl::enums::Chat::Channel(raw) if raw.id == channel_id => {
                    let mut info = info_from_channel(raw);
                    if info.access_hash == 0 {
                        info.access_hash = access_hash;
                    }
                    Some(info)
                }
                _ => None,
            })
            .ok_or_else(|| anyhow!("telegram returned no channel {channel_id}"))
    }

    pub(crate) async fn resolve_channel_peer(
        &self,
        channel_id: i64,
        username: Option<&str>,
        fallback_access_hash: i64,
    ) -> Result<PeerRef> {
        if let Some(peer) = self.peer_cache.lock().await.get(&channel_id).copied() {
            return Ok(peer);
        }

        match self
            .resolve_channel_peer_uncached(channel_id, username)
            .await
        {
            Ok(peer) => {
                self.peer_cache.lock().await.insert(channel_id, peer);
                Ok(peer)
            }
            Err(_err) if fallback_access_hash != 0 => {
                Ok(PeerRef::from(tl::types::InputPeerChannel {
                    channel_id,
                    access_hash: fallback_access_hash,
                }))
            }
            Err(err) => Err(err),
        }
    }

    pub(crate) async fn invalidate_channel_peer(&self, channel_id: i64) {
        self.peer_cache.lock().await.remove(&channel_id);
    }

    async fn resolve_channel_peer_uncached(
        &self,
        channel_id: i64,
        username: Option<&str>,
    ) -> Result<PeerRef> {
        let client = self.client().await?;

        if let Some(username) = username {
            match client
                .resolve_username(username.trim_start_matches('@'))
                .await?
            {
                Some(Peer::Channel(channel)) => {
                    if let Some(peer_ref) =
                        channel.to_ref().await.map_err(|e| anyhow!(e.to_string()))?
                    {
                        return Ok(peer_ref);
                    }
                }
                Some(Peer::Group(group)) => {
                    if let Some(peer_ref) =
                        group.to_ref().await.map_err(|e| anyhow!(e.to_string()))?
                    {
                        return Ok(peer_ref);
                    }
                }
                _ => {}
            }
        }

        let mut dialogs = client.iter_dialogs();
        while let Some(dialog) = dialogs.next().await? {
            match dialog.peer() {
                Peer::Channel(channel) if channel.id().bare_id() == Some(channel_id) => {
                    if let Some(peer_ref) =
                        channel.to_ref().await.map_err(|e| anyhow!(e.to_string()))?
                    {
                        return Ok(peer_ref);
                    }
                }
                Peer::Group(group) if group.id().bare_id() == Some(channel_id) => {
                    if let Some(peer_ref) =
                        group.to_ref().await.map_err(|e| anyhow!(e.to_string()))?
                    {
                        return Ok(peer_ref);
                    }
                }
                _ => {}
            }
        }

        Err(anyhow!(
            "could not resolve channel/group {channel_id} anymore (left it, or it's gone private?)"
        ))
    }
}

pub(crate) async fn resolve_channel_peer_for(
    state: &State<'_, AppState>,
    channel_id: &str,
) -> Result<PeerRef, String> {
    let channel_numeric_id: i64 = channel_id.parse().map_err(to_string_err)?;
    let row: Option<(Option<String>, i64)> =
        sqlx::query_as("SELECT username, access_hash FROM channels WHERE id = ?")
            .bind(channel_id)
            .fetch_optional(&state.db)
            .await
            .map_err(to_string_err)?;
    let (username, access_hash) = row.unwrap_or((None, 0));

    state
        .telegram
        .resolve_channel_peer(channel_numeric_id, username.as_deref(), access_hash)
        .await
        .map_err(to_string_err)
}
