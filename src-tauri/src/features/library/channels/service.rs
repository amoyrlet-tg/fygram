//! Adding a channel, keeping it in step with Telegram, and taking it away again.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, State};

use super::links::{parse_telegram_link, TelegramLink};
use crate::features::library::ingest::{sync_channel, SyncDepth, SyncStats};
use crate::features::library::media;
use crate::shared::error::AppError;
use crate::shared::media_paths;
use crate::shared::models::Channel;
use crate::shared::telegram::{ChannelInfo, TelegramState};
use crate::AppState;

use super::repository::{self, ChannelStamp};

pub(crate) async fn list(state: State<'_, AppState>) -> Result<Vec<Channel>, AppError> {
    repository::list_active(&state.db).await
}

pub(crate) async fn resolve_channel_info(
    state: &State<'_, AppState>,
    parsed: TelegramLink,
) -> Result<ChannelInfo, AppError> {
    match parsed {
        TelegramLink::Username(username) => Ok(state
            .telegram
            .resolve_channel_by_username(&username)
            .await?),
        TelegramLink::ChannelId(id) => {
            match repository::existing_channel_by_id(&state.db, id).await? {
                Some(known) => Ok(known),
                None => Ok(state.telegram.resolve_channel_info_by_id(id).await?),
            }
        }
    }
}

/// Sent when a channel's editing right turns out to differ from what the
/// interface was showing.
#[derive(Clone, serde::Serialize)]
pub(crate) struct RightsChanged {
    pub(crate) channel_id: String,
    pub(crate) title: String,
    pub(crate) can_edit: bool,
    /// True when Telegram had just refused an edit, rather than a routine
    /// refresh.
    pub(crate) after_refusal: bool,
}

/// Asks Telegram what we may do here and writes the answer down. One call, no
/// message walk.
pub(crate) async fn refresh_rights(
    state: &AppState,
    app: &AppHandle,
    channel_id: &str,
) -> Result<bool, AppError> {
    let numeric: i64 = channel_id
        .parse()
        .map_err(|_| AppError::Msg(format!("{channel_id} is not a Telegram id")))?;

    let stored = repository::edit_right(&state.db, channel_id)
        .await?
        .ok_or_else(|| AppError::Msg("channel not found".to_string()))?;

    let info = state
        .telegram
        .channel_rights(numeric, stored.username.as_deref(), stored.access_hash)
        .await?;
    let can_edit = info.can_edit.unwrap_or(false);

    repository::set_edit_right(&state.db, channel_id, can_edit, info.can_repost).await?;

    // a first answer is not a change: nobody was shown the old one
    if stored.can_edit.is_some_and(|was| was != can_edit) {
        let _ = app.emit(
            "channel-rights-changed",
            RightsChanged {
                channel_id: channel_id.to_string(),
                title: stored.title,
                can_edit,
                after_refusal: false,
            },
        );
        let _ = app.emit("library-changed", ());
    }

    Ok(can_edit)
}

async fn queue_channels_sync(state: &AppState) {
    crate::features::sync::outbox::enqueue_channels(&state.db).await;
    state.sync.nudge();
}

pub(crate) async fn delete(
    state: State<'_, AppState>,
    app: AppHandle,
    channel_id: String,
) -> Result<(), AppError> {
    let device = crate::features::sync::stamp::device_id(&state.db).await;
    let orphan_files = repository::tombstone(
        &state.db,
        &channel_id,
        ChannelStamp::Local { device: &device },
    )
    .await?;

    let current_playing = state.player.current_path();
    for path in orphan_files {
        media::files::prune_unused_file(&state.db, &path, current_playing.as_deref()).await;
    }

    queue_channels_sync(&state).await;
    let _ = app.emit("library-changed", ());
    Ok(())
}

pub(crate) async fn add_by_link(
    state: State<'_, AppState>,
    app: AppHandle,
    link: String,
) -> Result<Channel, AppError> {
    let parsed = parse_telegram_link(&link).ok_or_else(|| {
        AppError::Msg(
            "Не похоже на ссылку/юзернейм Telegram-канала (t.me/... или @username)".to_string(),
        )
    })?;
    let info = resolve_channel_info(&state, parsed).await?;
    let device = crate::features::sync::stamp::device_id(&state.db).await;
    let channel = repository::upsert_manual(&state.db, info, &device).await?;
    queue_channels_sync(&state).await;

    spawn_channel_full_sync(app, channel.id.clone());
    Ok(channel)
}

pub(crate) async fn sync(
    state: State<'_, AppState>,
    app: AppHandle,
    channel_id: String,
    depth: SyncDepth,
) -> Result<SyncStats, AppError> {
    run_channel_sync(&state, app, channel_id, depth).await
}

pub(crate) const SYNC_COOLDOWN: chrono::Duration = chrono::Duration::minutes(30);

pub(crate) const QUICK_SYNC_COOLDOWN: chrono::Duration = chrono::Duration::minutes(3);

fn cooldown_left(channel: &Channel, depth: SyncDepth) -> Option<chrono::Duration> {
    let (last, cooldown) = match depth {
        SyncDepth::Full => (channel.last_full_synced_at, SYNC_COOLDOWN),
        SyncDepth::NewOnly => (channel.last_synced_at, QUICK_SYNC_COOLDOWN),
    };
    let elapsed = chrono::Utc::now() - last?;
    (elapsed < cooldown).then(|| cooldown - elapsed)
}

fn channel_is_gone(telegram: &TelegramState, err: &anyhow::Error) -> bool {
    if telegram.session_invalid() {
        return false;
    }
    if crate::shared::telegram::is_dead_session(err) {
        telegram.mark_session_invalid();
        return false;
    }
    crate::shared::telegram::is_peer_gone(err)
}

async fn run_channel_sync(
    state: &State<'_, AppState>,
    app: AppHandle,
    channel_id: String,
    depth: SyncDepth,
) -> Result<SyncStats, AppError> {
    let channel = repository::get(&state.db, &channel_id).await?;

    if let Some(left) = cooldown_left(&channel, depth) {
        let minutes = left.num_minutes() + 1;
        return Err(AppError::Msg(match depth {
            SyncDepth::Full => format!(
                "Канал целиком проверяли недавно. Следующий раз можно через {minutes} мин. \
                 Быстрая синхронизация доступна."
            ),
            SyncDepth::NewOnly => format!(
                "Канал уже синхронизировался недавно. Следующий раз можно через {minutes} мин."
            ),
        }));
    }

    let cancel = Arc::new(AtomicBool::new(false));
    state
        .sync_cancel_flags
        .lock()
        .await
        .insert(channel_id.clone(), cancel.clone());

    let current_playing = state.player.current_path();
    let result = sync_channel(
        &state.db,
        &state.telegram,
        &channel,
        depth,
        cancel,
        current_playing.as_deref(),
        |progress| {
            let _ = app.emit("sync-progress", progress);
        },
    )
    .await;

    state.sync_cancel_flags.lock().await.remove(&channel_id);

    if let Err(err) = &result {
        crate::log!("sync_channel({channel_id}) failed: {err:#}");

        if channel_is_gone(&state.telegram, err) {
            crate::features::cloud::service::prune_channel(
                &state.db,
                &channel_id,
                current_playing.as_deref(),
            )
            .await;
        } else {
            crate::log!(
                "sync_channel({channel_id}): keeping every track and file - the failure was \
                 ours, not the channel's"
            );
        }
    } else {
        match crate::features::playlists::telegram_sync::resolve_pending_tracks(
            &state.db,
            &channel_id,
        )
        .await
        {
            Ok(resolved) if resolved > 0 => {
                let _ = app.emit("library-changed", ());
            }
            Err(err) => crate::log!("sync: resolving parked playlist tracks failed: {err:#}"),
            _ => {}
        }

        // already talking to the channel, so the cheapest moment to ask
        if let Err(err) = refresh_rights(state, &app, &channel_id).await {
            crate::log!("sync({channel_id}): could not refresh the edit rights: {err}");
        }

        if let Ok(app_dir) = app.path().app_data_dir() {
            if crate::features::cloud::service::fetch_and_store_channel_avatar(
                &state.db,
                &state.telegram,
                &channel,
                &app_dir,
            )
            .await
            {
                let _ = app.emit("library-changed", ());
            }
        }
    }

    result.map_err(AppError::from)
}

fn spawn_channel_full_sync(app: AppHandle, channel_id: String) {
    let handle = app.clone();
    crate::shutdown::spawn_tracked(&handle, async move {
        let state = app.state::<AppState>();
        if let Err(err) =
            run_channel_sync(&state, app.clone(), channel_id.clone(), SyncDepth::Full).await
        {
            crate::log!("spawn_channel_full_sync({channel_id}) failed: {err}");
        }
    });
}

pub(crate) async fn cancel(state: State<'_, AppState>, channel_id: String) -> Result<(), AppError> {
    if let Some(flag) = state.sync_cancel_flags.lock().await.get(&channel_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

pub(crate) async fn download(
    state: State<'_, AppState>,
    app: AppHandle,
    channel_id: String,
) -> Result<media::download::DownloadStats, AppError> {
    let cancel = Arc::new(AtomicBool::new(false));
    state
        .sync_cancel_flags
        .lock()
        .await
        .insert(channel_id.clone(), cancel.clone());

    let dir = media_paths::media_root(&app, &state.db)
        .await
        .map_err(|err| AppError::Msg(err.to_string()))?;

    let result = media::download::download_channel_tracks(
        &state.db,
        &state.telegram,
        &dir,
        &channel_id,
        cancel,
        &state.download_locks,
        |progress| {
            let _ = app.emit("download-progress", progress);
        },
    )
    .await;

    state.sync_cancel_flags.lock().await.remove(&channel_id);

    result.map_err(|err| {
        crate::log!("download_channel({channel_id}) failed: {err:#}");
        AppError::Telegram(err)
    })
}
