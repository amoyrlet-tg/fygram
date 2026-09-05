//! Putting what is playing at the top of the profile, and the per-platform settings that go with it.

use tauri::{AppHandle, Manager, State};

use crate::shared::error::AppError;
use crate::shared::models::Track;
use crate::shared::settings;
use crate::shared::telegram::resolve_channel_peer_for;
use crate::AppState;

async fn resolve_track_document(
    state: &State<'_, AppState>,
    channel_id: &str,
    message_id: i32,
) -> Result<grammers_client::tl::enums::InputDocument, AppError> {
    let peer = resolve_channel_peer_for(state, channel_id)
        .await
        .map_err(AppError::Msg)?;
    if let Ok(doc) = state
        .telegram
        .resolve_music_document(peer, message_id)
        .await
    {
        return Ok(doc);
    }

    let channel_numeric_id: i64 = channel_id
        .parse()
        .map_err(|e: std::num::ParseIntError| AppError::Msg(e.to_string()))?;
    state
        .telegram
        .invalidate_channel_peer(channel_numeric_id)
        .await;
    let peer = resolve_channel_peer_for(state, channel_id)
        .await
        .map_err(AppError::Msg)?;
    Ok(state
        .telegram
        .resolve_music_document(peer, message_id)
        .await?)
}

pub(crate) async fn detect_language() -> String {
    let fallback = "en".to_string();
    let Ok(resp) = reqwest::get("https://cloudflare.com/cdn-cgi/trace").await else {
        return fallback;
    };
    let Ok(body) = resp.text().await else {
        return fallback;
    };
    let country = body.lines().find_map(|line| line.strip_prefix("loc="));
    match country {
        Some("RU") => "ru",
        Some("UA") => "uk",
        Some("BY") => "be",
        Some("KZ") => "kk",
        _ => "en",
    }
    .to_string()
}

#[cfg(target_os = "windows")]
mod windows_autostart {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    const RUN_KEY: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run";
    const APP_NAME: &str = "fygram";

    pub(crate) fn is_enabled() -> bool {
        RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags(RUN_KEY, KEY_READ)
            .and_then(|key| key.get_value::<String, _>(APP_NAME))
            .is_ok()
    }

    pub(crate) fn set_enabled(enabled: bool) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu.create_subkey(RUN_KEY).map_err(|e| e.to_string())?;
        if enabled {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            key.set_value(APP_NAME, &format!("\"{}\"", exe.display()))
                .map_err(|e| e.to_string())
        } else {
            match key.delete_value(APP_NAME) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(e.to_string()),
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn autostart_enabled(_app: &AppHandle) -> Result<bool, AppError> {
    Ok(windows_autostart::is_enabled())
}

#[cfg(target_os = "windows")]
pub(crate) fn set_autostart_enabled(_app: &AppHandle, enabled: bool) -> Result<(), AppError> {
    windows_autostart::set_enabled(enabled).map_err(AppError::Msg)
}

#[cfg(all(desktop, not(target_os = "windows")))]
pub(crate) fn autostart_enabled(app: &AppHandle) -> Result<bool, AppError> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| AppError::Msg(e.to_string()))
}

#[cfg(not(desktop))]
pub(crate) fn autostart_enabled(_app: &AppHandle) -> Result<bool, AppError> {
    Ok(false)
}

#[cfg(all(desktop, not(target_os = "windows")))]
pub(crate) fn set_autostart_enabled(app: &AppHandle, enabled: bool) -> Result<(), AppError> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|e| AppError::Msg(e.to_string()))
}

#[cfg(not(desktop))]
pub(crate) fn set_autostart_enabled(_app: &AppHandle, _enabled: bool) -> Result<(), AppError> {
    Ok(())
}

pub(crate) async fn fullscreen_enabled(state: State<'_, AppState>) -> Result<bool, AppError> {
    Ok(settings::get(&state.db, "always_fullscreen")
        .await?
        .as_deref()
        == Some("1"))
}

pub(crate) async fn set_fullscreen_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), AppError> {
    settings::set(
        &state.db,
        "always_fullscreen",
        if enabled { "1" } else { "0" },
    )
    .await?;
    Ok(())
}

/// The list belongs to the user: borrowed for a track, never emptied.
const HOISTED_TRACK: &str = "profile_music_track_id";
const HOISTED_WAS_SAVED: &str = "profile_music_was_saved";
const HOISTED_AFTER: &str = "profile_music_after";

/// Beyond this the position is not worth the round trips.
const SAVED_MUSIC_SCAN: usize = 300;

async fn forget_hoisted(db: &sqlx::SqlitePool) {
    let _ = settings::delete(db, HOISTED_TRACK).await;
    let _ = settings::delete(db, HOISTED_WAS_SAVED).await;
    let _ = settings::delete(db, HOISTED_AFTER).await;
}

/// None means the top; the flag says whether the user had it at all. Separate
/// from the network so the rule can be tested.
fn plan_hoist(saved: &[i64], document: Option<i64>) -> (bool, Option<i64>) {
    let Some(document) = document else {
        return (false, None);
    };
    match saved.iter().position(|id| *id == document) {
        Some(0) => (true, None),
        Some(index) => (true, Some(saved[index - 1])),
        None => (false, None),
    }
}

/// Back to its old place, or out of the list if we were the ones who added it.
pub(crate) async fn restore_hoisted(
    db: &sqlx::SqlitePool,
    telegram: &crate::shared::telegram::TelegramState,
) -> Result<(), AppError> {
    let Some(track_id) = settings::get(db, HOISTED_TRACK).await? else {
        return Ok(());
    };

    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(&track_id)
        .fetch_optional(db)
        .await?;
    let Some(document_id) = track.and_then(|t| t.tg_document_id) else {
        forget_hoisted(db).await;
        return Ok(());
    };

    let saved = telegram.saved_music(SAVED_MUSIC_SCAN).await?;
    let Some(entry) = saved.iter().find(|e| e.document_id == document_id) else {
        forget_hoisted(db).await;
        return Ok(());
    };

    let was_saved = settings::get(db, HOISTED_WAS_SAVED).await?.as_deref() == Some("1");
    if !was_saved {
        telegram.set_saved_music(entry.input.clone(), true).await?;
    } else {
        let anchor_id: Option<i64> = settings::get(db, HOISTED_AFTER)
            .await?
            .and_then(|value| value.parse().ok());
        match anchor_id {
            None => {
                telegram
                    .place_saved_music(entry.input.clone(), None)
                    .await?
            }
            // whatever it sat behind is gone; the top beats a guess
            Some(anchor_id) => {
                if let Some(anchor) = saved.iter().find(|e| e.document_id == anchor_id) {
                    telegram
                        .place_saved_music(entry.input.clone(), Some(anchor.input.clone()))
                        .await?;
                }
            }
        }
    }

    forget_hoisted(db).await;
    Ok(())
}

/// Remembers where it was, so the next track can put it back.
async fn hoist_track(state: &State<'_, AppState>, track: &Track) -> Result<(), AppError> {
    let saved = state.telegram.saved_music(SAVED_MUSIC_SCAN).await?;
    let ids: Vec<i64> = saved.iter().map(|e| e.document_id).collect();
    let (was_saved, anchor) = plan_hoist(&ids, track.tg_document_id);
    let position = track
        .tg_document_id
        .and_then(|id| saved.iter().position(|e| e.document_id == id));

    let input = match position {
        Some(index) => saved[index].input.clone(),
        None => {
            resolve_track_document(state, &track.channel_id, track.tg_message_id as i32).await?
        }
    };

    state.telegram.place_saved_music(input, None).await?;

    settings::set(&state.db, HOISTED_TRACK, &track.id).await?;
    settings::set(
        &state.db,
        HOISTED_WAS_SAVED,
        if was_saved { "1" } else { "0" },
    )
    .await?;
    settings::set(
        &state.db,
        HOISTED_AFTER,
        &anchor.map(|id| id.to_string()).unwrap_or_default(),
    )
    .await?;
    Ok(())
}

pub(crate) async fn sync_enabled(state: State<'_, AppState>) -> Result<bool, AppError> {
    Ok(settings::get(&state.db, "profile_sync_enabled")
        .await?
        .as_deref()
        == Some("1"))
}

pub(crate) async fn set_sync_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), AppError> {
    if !enabled {
        if let Err(err) = restore_hoisted(&state.db, &state.telegram).await {
            crate::log!("profile: could not restore the profile music: {err}");
        }
    }

    settings::set(
        &state.db,
        "profile_sync_enabled",
        if enabled { "1" } else { "0" },
    )
    .await?;
    Ok(())
}

pub(crate) fn spawn_set_now_playing(app: AppHandle, track_id: Option<String>) {
    let handle = app.clone();
    crate::shutdown::spawn_tracked(&handle, async move {
        let state = app.state::<AppState>();

        let Ok(_guard) = state.profile_sync_lock.try_lock() else {
            return;
        };

        if let Err(err) = set_now_playing_inner(&state, track_id.clone()).await {
            crate::log!("set_now_playing_track({track_id:?}) failed: {err}");
        }
    });
}

async fn set_now_playing_inner(
    state: &State<'_, AppState>,
    track_id: Option<String>,
) -> Result<(), AppError> {
    let enabled = settings::get(&state.db, "profile_sync_enabled")
        .await?
        .as_deref()
        == Some("1");
    if !enabled {
        return Ok(());
    }

    let hoisted = settings::get(&state.db, HOISTED_TRACK).await?;
    if hoisted.as_deref() == track_id.as_deref() {
        return Ok(());
    }

    restore_hoisted(&state.db, &state.telegram).await?;

    let Some(track_id) = track_id else {
        return Ok(());
    };
    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(&track_id)
        .fetch_optional(&state.db)
        .await?;
    let Some(track) = track else {
        return Ok(());
    };

    hoist_track(state, &track).await
}

#[cfg(test)]
mod tests {
    use super::plan_hoist;

    // the profile's music, newest first, by document id
    const PROFILE: &[i64] = &[10, 20, 30, 40];

    #[test]
    fn a_track_the_user_never_saved_is_ours_to_remove_later() {
        let (was_saved, anchor) = plan_hoist(PROFILE, Some(99));
        assert!(!was_saved);
        assert_eq!(anchor, None);
    }

    #[test]
    fn a_track_already_on_top_goes_back_on_top() {
        let (was_saved, anchor) = plan_hoist(PROFILE, Some(10));
        assert!(was_saved);
        assert_eq!(anchor, None);
    }

    #[test]
    fn a_track_further_down_remembers_what_it_sat_behind() {
        let (was_saved, anchor) = plan_hoist(PROFILE, Some(30));
        assert!(was_saved);
        assert_eq!(anchor, Some(20));
    }

    #[test]
    fn a_track_with_no_document_is_treated_as_new() {
        let (was_saved, anchor) = plan_hoist(PROFILE, None);
        assert!(!was_saved);
        assert_eq!(anchor, None);
    }

    #[test]
    fn an_empty_profile_leaves_nothing_to_restore() {
        let (was_saved, anchor) = plan_hoist(&[], Some(10));
        assert!(!was_saved);
        assert_eq!(anchor, None);
    }
}
