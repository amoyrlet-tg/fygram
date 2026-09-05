//! Who changed something and when, so two machines editing the same row can be ordered.

use std::cmp::Ordering;

use chrono::{DateTime, TimeZone, Utc};
use sqlx::SqlitePool;
use tokio::sync::OnceCell;

use crate::shared::settings;

const DEVICE_ID_KEY: &str = "device_id";

static DEVICE_ID: OnceCell<String> = OnceCell::const_new();

pub(crate) async fn device_id(db: &SqlitePool) -> String {
    DEVICE_ID
        .get_or_init(|| async {
            if let Ok(Some(existing)) = settings::get(db, DEVICE_ID_KEY).await {
                if !existing.is_empty() {
                    return existing;
                }
            }
            let fresh = uuid::Uuid::new_v4().to_string();
            if let Err(err) = settings::set(db, DEVICE_ID_KEY, &fresh).await {
                crate::log!("sync: could not persist device_id: {err}");
            }
            fresh
        })
        .await
        .clone()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Stamp {
    pub(crate) rev: i64,
    pub(crate) updated_at: DateTime<Utc>,
    pub(crate) device: String,
}

impl Stamp {
    pub(crate) fn legacy() -> Self {
        Self {
            rev: 0,
            updated_at: Utc.timestamp_opt(0, 0).single().unwrap_or_default(),
            device: String::new(),
        }
    }
}

impl Ord for Stamp {
    fn cmp(&self, other: &Self) -> Ordering {
        self.rev
            .cmp(&other.rev)
            .then_with(|| self.updated_at.cmp(&other.updated_at))
            .then_with(|| self.device.cmp(&other.device))
    }
}

impl PartialOrd for Stamp {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).single().unwrap()
    }

    fn stamp(rev: i64, secs: i64, device: &str) -> Stamp {
        Stamp {
            rev,
            updated_at: at(secs),
            device: device.to_string(),
        }
    }

    #[test]
    fn a_later_rev_beats_an_earlier_one_even_with_a_wrong_clock() {
        assert!(stamp(5, 0, "a") > stamp(4, 99_999_999, "b"));
    }

    #[test]
    fn concurrent_edits_fall_back_to_the_wall_clock() {
        assert!(stamp(4, 200, "a") > stamp(4, 100, "b"));
    }

    #[test]
    fn an_exact_tie_resolves_the_same_way_on_both_devices() {
        assert!(stamp(4, 100, "b") > stamp(4, 100, "a"));
    }

    #[test]
    fn anything_stamped_beats_a_pre_stamp_document() {
        assert!(stamp(1, 0, "") > Stamp::legacy());
    }
}
