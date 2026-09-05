//! The login flow, and the questions the app asks about the session it already has.

use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::shared::error::AppError;
use crate::shared::telegram::{CurrentUser, LoginOutcome, TelegramState};
use crate::AppState;

use super::repository;
use super::session_store;

pub(crate) async fn request_login_code(
    state: State<'_, AppState>,
    app: AppHandle,
    phone: String,
) -> Result<(), AppError> {
    let api_hash = repository::require_api_hash(&state.db).await?;
    match state.telegram.request_login_code(&phone, &api_hash).await {
        Ok(()) => Ok(()),
        Err(err) if format!("{err:#}").contains("AUTH_RESTART") => {
            // the key belongs to another api_id, so telegram refuses to send a
            // code until the authorization starts over
            let app_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| AppError::Msg(e.to_string()))?;
            let session_path = app_dir.join("telegram.session");
            session_store::forget(&session_path);

            let api_id = repository::read_api_id(&state.db).await?.ok_or_else(|| {
                AppError::Msg("Telegram API credentials aren't set up yet".into())
            })?;
            state.telegram.connect(session_path, api_id).await?;
            repository::remember_authorized(&state.db, false).await;
            state.telegram.request_login_code(&phone, &api_hash).await?;
            Ok(())
        }
        Err(err) => Err(err.into()),
    }
}

pub(crate) async fn submit_code(
    state: State<'_, AppState>,
    app: AppHandle,
    code: String,
) -> Result<&'static str, AppError> {
    match state.telegram.submit_code(&code).await? {
        LoginOutcome::Success => {
            mark_signed_in(&state).await;
            crate::features::cloud::restore::spawn_cloud_restore(app);
            Ok("success")
        }
        LoginOutcome::PasswordRequired => Ok("password_required"),
    }
}

pub(crate) async fn submit_password(
    state: State<'_, AppState>,
    app: AppHandle,
    password: String,
) -> Result<(), AppError> {
    state.telegram.submit_password(&password).await?;
    mark_signed_in(&state).await;
    crate::features::cloud::restore::spawn_cloud_restore(app);
    Ok(())
}

pub(crate) async fn has_credentials(state: State<'_, AppState>) -> Result<bool, AppError> {
    repository::has_api_id(&state.db).await
}

#[derive(Debug, Clone, serde::Serialize)]
pub(crate) struct Credentials {
    pub(crate) api_id: i32,
    pub(crate) api_hash: String,
}

/// The keys the setup screen starts filled with.
pub(crate) async fn read_credentials(
    state: State<'_, AppState>,
) -> Result<Option<Credentials>, AppError> {
    let api_id = repository::read_api_id(&state.db).await?;
    let api_hash = repository::read_api_hash(&state.db).await?;
    Ok(match (api_id, api_hash) {
        (Some(api_id), Some(api_hash)) if !api_hash.is_empty() => {
            Some(Credentials { api_id, api_hash })
        }
        _ => None,
    })
}

pub(crate) async fn save_credentials(
    state: State<'_, AppState>,
    app: AppHandle,
    api_id: i32,
    api_hash: String,
) -> Result<(), AppError> {
    let session_owner = repository::read_session_api_id(&state.db).await;
    repository::save_credentials(&state.db, api_id, &api_hash).await?;

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Msg(e.to_string()))?;

    if let Err(err) = crate::shared::db::save_api_credentials(&app_dir, api_id, &api_hash).await {
        crate::log!("save_telegram_credentials: failed to write api_credentials.json: {err:#}");
    }

    let session_path = app_dir.join("telegram.session");
    // an unknown owner is left alone: dropping a working session costs a
    // full re-login for nothing
    if session_owner.is_some_and(|owner| owner != api_id) {
        session_store::forget(&session_path);
        repository::remember_authorized(&state.db, false).await;
    }
    state.telegram.connect(session_path, api_id).await?;
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize)]
pub(crate) struct SessionState {
    pub(crate) authorized: bool,
    pub(crate) session_invalid: bool,
    pub(crate) has_local_library: bool,
}

async fn mark_signed_in(state: &State<'_, AppState>) {
    state.telegram.mark_session_alive();
    if let Ok(Some(api_id)) = repository::read_api_id(&state.db).await {
        repository::remember_session_api_id(&state.db, api_id).await;
    }
    repository::remember_authorized(&state.db, true).await;
    repository::remember_session_invalid(&state.db, false).await;
}

async fn probe_authorized(
    telegram: &TelegramState,
    db: &sqlx::SqlitePool,
) -> Result<bool, AppError> {
    match tokio::time::timeout(Duration::from_secs(4), telegram.is_authorized()).await {
        Ok(Ok(true)) => {
            telegram.mark_session_alive();
            repository::remember_authorized(db, true).await;
            repository::remember_session_invalid(db, false).await;
            Ok(true)
        }
        Ok(Ok(false)) => {
            telegram.mark_session_invalid();
            repository::remember_authorized(db, false).await;
            repository::remember_session_invalid(db, true).await;
            Ok(false)
        }
        Ok(Err(err)) => {
            telegram.note_failure(&err);
            repository::read_authorized_flag(db).await
        }
        Err(_elapsed) => repository::read_authorized_flag(db).await,
    }
}

pub(crate) async fn is_authorized(state: State<'_, AppState>) -> Result<bool, AppError> {
    probe_authorized(&state.telegram, &state.db).await
}

pub(crate) async fn session_state(state: State<'_, AppState>) -> Result<SessionState, AppError> {
    let authorized = probe_authorized(&state.telegram, &state.db).await?;
    let session_invalid = !authorized
        && (state.telegram.session_invalid()
            || repository::read_session_invalid(&state.db).await?);
    Ok(SessionState {
        authorized,
        session_invalid,
        has_local_library: repository::has_local_library(&state.db).await?,
    })
}

pub(crate) async fn read_image_as_data_url(path: String) -> Result<String, AppError> {
    use base64::Engine;
    let bytes = tokio::fs::read(&path).await?;
    let mime = match std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase)
        .as_deref()
    {
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "image/jpeg",
    };
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

pub(crate) async fn current_user(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CurrentUser, AppError> {
    let avatar_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Msg(e.to_string()))?;
    match tokio::time::timeout(Duration::from_secs(6), state.telegram.get_me(&avatar_dir)).await {
        Ok(Ok(me)) => {
            if let Ok(json) = serde_json::to_string(&me) {
                repository::cache_current_user(&state.db, &json).await;
            }
            Ok(me)
        }
        _ => repository::read_cached_current_user(&state.db)
            .await?
            .and_then(|json| serde_json::from_str(&json).ok())
            .ok_or_else(|| AppError::Msg("offline and no cached profile yet".to_string())),
    }
}

pub(crate) async fn logout(state: State<'_, AppState>, app: AppHandle) -> Result<(), AppError> {
    state.player.stop_now();

    state.telegram.disconnect().await;
    state.telegram.mark_session_alive();

    repository::wipe_database(&state.db).await;

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Msg(e.to_string()))?;

    if let Err(err) = tokio::fs::remove_file(app_dir.join("telegram.session")).await {
        if err.kind() != std::io::ErrorKind::NotFound {
            crate::log!("logout: failed to remove session: {err}");
        }
    }
    if let Err(err) = tokio::fs::remove_dir_all(app_dir.join("media")).await {
        if err.kind() != std::io::ErrorKind::NotFound {
            crate::log!("logout: failed to remove media dir: {err}");
        }
    }
    if let Ok(mut entries) = tokio::fs::read_dir(&app_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("avatar_") {
                let _ = tokio::fs::remove_file(entry.path()).await;
            }
        }
    }

    crate::shared::db::remove_api_credentials(&app_dir).await;

    let _ = app.emit("logged-out", ());
    Ok(())
}
