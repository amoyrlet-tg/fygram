//! The rows that cross the IPC boundary, exactly as both sides see them.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub(crate) struct Channel {
    pub(crate) id: String,
    pub(crate) username: Option<String>,
    pub(crate) title: String,
    pub(crate) access_hash: i64,
    pub(crate) source_type: String,
    pub(crate) avatar_path: Option<String>,
    pub(crate) last_synced_at: Option<DateTime<Utc>>,
    pub(crate) last_full_synced_at: Option<DateTime<Utc>>,
    pub(crate) is_active: bool,

    /// None means Telegram has never been asked - see migration 0013.
    pub(crate) can_edit: Option<bool>,
    /// What replacing a forwarded track needs.
    pub(crate) can_repost: Option<bool>,
    pub(crate) rights_checked_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub(crate) struct Track {
    pub(crate) id: String,
    pub(crate) channel_id: String,
    pub(crate) tg_message_id: i64,
    pub(crate) tg_document_id: Option<i64>,
    pub(crate) file_path: String,
    pub(crate) file_hash: String,
    pub(crate) title: Option<String>,
    pub(crate) artist: Option<String>,
    pub(crate) album: Option<String>,
    pub(crate) duration_sec: Option<i64>,
    pub(crate) added_at: DateTime<Utc>,
    pub(crate) play_count: i64,
    pub(crate) published_at: Option<DateTime<Utc>>,

    /// A forward cannot be edited, only replaced. None means no sync has
    /// looked yet - see migration 0014.
    pub(crate) forwarded: Option<bool>,
    pub(crate) forwarded_from: Option<String>,
    pub(crate) forwarded_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub(crate) struct Playlist {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) is_smart: bool,
    pub(crate) smart_rule: Option<String>,
    pub(crate) created_at: DateTime<Utc>,

    /// None means the interface builds one out of its tracks' covers.
    pub(crate) cover_path: Option<String>,
}
