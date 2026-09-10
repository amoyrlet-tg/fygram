use tauri::{AppHandle, Manager, State};

use crate::shared::error::AppError;
use crate::shared::models::Track;
use crate::shared::settings;
use crate::shared::telegram::resolve_channel_peer_for;
use crate::AppState;

pub(crate) async fn track_document(
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

#[cfg(not(target_os = "windows"))]
pub(crate) fn autostart_enabled(app: &AppHandle) -> Result<bool, AppError> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| AppError::Msg(e.to_string()))
}

#[cfg(not(target_os = "windows"))]
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

const PROFILE_TRACK: &str = "profile_music_track_id";

const SAVED_MUSIC_SCAN: usize = 300;

pub(crate) async fn clear_profile_music(
    telegram: &crate::shared::telegram::TelegramState,
) -> Result<usize, AppError> {
    let saved = telegram.saved_music(SAVED_MUSIC_SCAN).await?;
    let mut removed = 0;
    for entry in &saved {
        match telegram.set_saved_music(entry.input.clone(), true).await {
            Ok(()) => removed += 1,
            Err(err) => crate::log!("profile: could not remove saved music: {err}"),
        }
    }
    Ok(removed)
}

pub(crate) async fn reset_profile_music(
    db: &sqlx::SqlitePool,
    telegram: &crate::shared::telegram::TelegramState,
) -> Result<(), AppError> {
    clear_profile_music(telegram).await?;
    let _ = settings::delete(db, PROFILE_TRACK).await;
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
    if let Err(err) = clear_profile_music(&state.telegram).await {
        crate::log!("profile: could not clear the profile music: {err}");
    }
    let _ = settings::delete(&state.db, PROFILE_TRACK).await;

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

    let placed = settings::get(&state.db, PROFILE_TRACK).await?;
    if placed.as_deref() == track_id.as_deref() {
        return Ok(());
    }

    clear_profile_music(&state.telegram).await?;
    let _ = settings::delete(&state.db, PROFILE_TRACK).await;

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

    let input = track_document(state, &track.channel_id, track.tg_message_id as i32).await?;
    state.telegram.place_saved_music(input, None).await?;
    settings::set(&state.db, PROFILE_TRACK, &track.id).await?;
    Ok(())
}
