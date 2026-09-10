use tauri::{AppHandle, Emitter, State};

use crate::features::library::channels::repository as channels_repository;
use crate::features::library::channels::service::{self as channels_service, RightsChanged};
use crate::shared::error::AppError;
use crate::AppState;

fn no_rights_message(title: &str) -> String {
    format!(
        "Нет прав редактировать сообщения в «{title}». \
         Если права появились — обнови их синхронизацией канала."
    )
}

pub(super) async fn ensure_may_edit(
    state: &State<'_, AppState>,
    app: &AppHandle,
    channel_id: &str,
) -> Result<(), AppError> {
    let stored = channels_repository::edit_right(&state.db, channel_id)
        .await?
        .ok_or_else(|| AppError::Msg("channel not found".to_string()))?;

    let can_edit = match stored.can_edit {
        Some(known) => known,
        None => match channels_service::refresh_rights(state, app, channel_id).await {
            Ok(fresh) => fresh,
            Err(err) => {
                crate::log!("update_track: could not check the rights for {channel_id}: {err}");
                return Ok(());
            }
        },
    };

    if can_edit {
        return Ok(());
    }
    Err(AppError::Msg(no_rights_message(&stored.title)))
}

pub(super) async fn refusal(
    state: &State<'_, AppState>,
    app: &AppHandle,
    channel_id: &str,
    err: &anyhow::Error,
) -> AppError {
    if !crate::shared::telegram::is_edit_forbidden(err) {
        return AppError::Msg(format!("Telegram не принял правку: {err}"));
    }

    let title = match channels_repository::edit_right(&state.db, channel_id).await {
        Ok(Some(stored)) => stored.title,
        _ => channel_id.to_string(),
    };

    if let Err(write_err) =
        channels_repository::set_edit_right(&state.db, channel_id, false, None).await
    {
        crate::log!("update_track: could not store the refusal for {channel_id}: {write_err}");
    }

    let _ = app.emit(
        "channel-rights-changed",
        RightsChanged {
            channel_id: channel_id.to_string(),
            title: title.clone(),
            can_edit: false,
            after_refusal: true,
        },
    );
    let _ = app.emit("library-changed", ());

    AppError::Msg(no_rights_message(&title))
}

pub(super) async fn ensure_may_repost(
    state: &State<'_, AppState>,
    app: &AppHandle,
    channel_id: &str,
) -> Result<(), AppError> {
    let stored = channels_repository::edit_right(&state.db, channel_id)
        .await?
        .ok_or_else(|| AppError::Msg("channel not found".to_string()))?;

    if stored.can_repost.is_none() {
        if let Err(err) = channels_service::refresh_rights(state, app, channel_id).await {
            crate::log!("repost_track: could not check the rights for {channel_id}: {err}");
            return Ok(());
        }
    }

    let fresh = channels_repository::edit_right(&state.db, channel_id).await?;
    if fresh.and_then(|r| r.can_repost) == Some(false) {
        return Err(AppError::Msg(format!(
            "Нет прав удалять и публиковать сообщения в «{}». \
             Если права появились - обнови их синхронизацией канала.",
            stored.title
        )));
    }
    Ok(())
}
