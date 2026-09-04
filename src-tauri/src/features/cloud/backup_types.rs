//! The shape of the documents kept in Saved Messages, and how to read the ones written by an older version.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::features::sync::stamp::Stamp;

pub(crate) const CHANNELS_HASHTAG: &str = "#channelsfygram";

pub(crate) const TOMBSTONE_TTL: chrono::Duration = chrono::Duration::days(90);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct SyncChannel {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) username: Option<String>,
    pub(crate) access_hash: i64,
    pub(crate) source_type: String,
    #[serde(default)]
    pub(crate) rev: i64,
    #[serde(default)]
    pub(crate) updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub(crate) device_id: String,
    #[serde(default)]
    pub(crate) deleted: bool,
    #[serde(default)]
    pub(crate) deleted_at: Option<DateTime<Utc>>,
}

impl SyncChannel {
    pub(crate) fn stamp(&self) -> Stamp {
        match (self.rev, self.updated_at) {
            (rev, Some(updated_at)) if rev > 0 => Stamp {
                rev,
                updated_at,
                device: self.device_id.clone(),
            },
            _ => Stamp::legacy(),
        }
    }

    pub(crate) fn is_expired_tombstone(&self, now: DateTime<Utc>) -> bool {
        if !self.deleted {
            return false;
        }
        match self.deleted_at {
            Some(at) => now - at > TOMBSTONE_TTL,
            None => true,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct ChannelsDoc {
    pub(crate) hashtag: String,
    pub(crate) updated_at: DateTime<Utc>,
    pub(crate) channels: Vec<SyncChannel>,
}
