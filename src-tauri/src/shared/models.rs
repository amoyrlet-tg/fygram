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

    pub(crate) can_edit: Option<bool>,
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

    pub(crate) cover_path: Option<String>,
}
