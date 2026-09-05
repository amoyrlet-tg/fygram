//! fygram: a music library built out of Telegram channels.
//!
//! The shared state, the plugin wiring, and the table of what the frontend may
//! call - which is the backend's entire public surface. Conventions: STYLE.md.

/// The backend's only way of writing to the console.
///
/// Compiles to nothing in a release build: a shipped app should not narrate what
/// it is doing to anyone watching the process, and the format strings go with
/// it. `cfg!` rather than `#[cfg]` so the arguments still count as used and the
/// line still has to typecheck either way.
#[macro_export]
macro_rules! log {
    ($($arg:tt)*) => {{
        if cfg!(not(release_build)) {
            eprintln!($($arg)*);
        }
    }};
}

#[cfg(target_os = "android")]
mod android;
mod bootstrap;
mod features;
mod shared;
mod shutdown;

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

#[cfg(desktop)]
use tauri::Manager;

use features::playback::audio::PlayerHandle;
use features::sync::SyncHandle;
use shared::telegram::TelegramState;

use features::auth::commands as auth_commands;
use features::broadcast::commands as broadcast_commands;
use features::docs as docs_commands;
use features::ducking::commands as ducking_commands;
use features::host as host_commands;
use features::library::cache::commands as cache_commands;
use features::library::channels::commands as channel_commands;
use features::library::tracks::commands as track_commands;
use features::playback::commands as playback_commands;
use features::playlists::commands as playlist_commands;
use features::profile::commands as profile_commands;
use features::storage::commands as storage_commands;
use features::sync::commands as sync_commands;

pub(crate) struct AppState {
    pub db: sqlx::SqlitePool,
    pub telegram: TelegramState,
    pub player: PlayerHandle,
    pub sync: Arc<SyncHandle>,
    pub profile_sync_lock: tokio::sync::Mutex<()>,
    pub sync_cancel_flags: tokio::sync::Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub download_locks: tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    pub shutdown: tokio_util::sync::CancellationToken,
    pub tasks: tokio_util::task::TaskTracker,
}

#[cfg(desktop)]
fn stagger_if_racing() {
    let Some(data_dir) = dirs::data_dir() else {
        return;
    };
    let dir = data_dir.join("com.amoyrlet.fygram");
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let Ok(file) = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(dir.join(".instance.lock"))
    else {
        return;
    };
    let mut lock = fd_lock::RwLock::new(file);
    if lock.try_write().is_err() {
        std::thread::sleep(std::time::Duration::from_millis(700));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    stagger_if_racing();

    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }
    builder = builder.plugin(tauri_plugin_opener::init());
    builder = builder.plugin(tauri_plugin_dialog::init());
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));
    }

    builder
        .setup(bootstrap::setup)
        .invoke_handler(tauri::generate_handler![
            auth_commands::telegram_request_login_code,
            auth_commands::telegram_submit_code,
            auth_commands::telegram_submit_password,
            auth_commands::has_telegram_credentials,
            auth_commands::get_telegram_credentials,
            auth_commands::save_telegram_credentials,
            auth_commands::telegram_is_authorized,
            auth_commands::telegram_session_state,
            auth_commands::get_current_user,
            auth_commands::read_image_as_data_url,
            auth_commands::logout,
            broadcast_commands::get_broadcast_config,
            broadcast_commands::set_broadcast_config,
            broadcast_commands::check_broadcast_target,
            broadcast_commands::broadcast_now_playing,
            broadcast_commands::broadcast_stop,
            cache_commands::get_cache_stats,
            cache_commands::cleanup_cache,
            cache_commands::preview_cache_cleanup,
            cache_commands::apply_cache_cleanup,
            channel_commands::list_channels,
            channel_commands::add_channel_by_link,
            channel_commands::sync_channel,
            channel_commands::refresh_channel_rights,
            channel_commands::cancel_sync,
            channel_commands::download_channel,
            channel_commands::delete_channel,
            docs_commands::open_docs_window,
            ducking_commands::get_ducking_config,
            ducking_commands::set_ducking_config,
            host_commands::host_info,
            playback_commands::play_track,
            playback_commands::prefetch_track,
            playback_commands::pause_playback,
            playback_commands::resume_playback,
            playback_commands::stop_playback,
            playback_commands::set_volume,
            playback_commands::seek_playback,
            playback_commands::get_playback_position,
            playlist_commands::list_playlists,
            playlist_commands::create_playlist,
            playlist_commands::download_playlist,
            playlist_commands::list_playlist_tracks,
            playlist_commands::add_track_to_playlist,
            playlist_commands::remove_track_from_playlist,
            playlist_commands::reorder_playlist_track,
            playlist_commands::delete_playlist,
            playlist_commands::rename_playlist,
            playlist_commands::set_playlist_cover,
            playlist_commands::clear_playlist_cover,
            playlist_commands::playlist_cover_sources,
            profile_commands::get_profile_sync_enabled,
            profile_commands::set_profile_sync_enabled,
            profile_commands::set_now_playing_track,
            profile_commands::get_autostart_enabled,
            profile_commands::set_autostart_enabled,
            profile_commands::get_fullscreen_enabled,
            profile_commands::set_fullscreen_enabled,
            profile_commands::toggle_fullscreen,
            profile_commands::detect_language,
            storage_commands::get_media_root,
            storage_commands::set_media_root,
            sync_commands::get_sync_status,
            sync_commands::sync_now,
            track_commands::list_tracks,
            track_commands::retag_tracks,
            track_commands::track_cover,
            track_commands::track_cover_paths,
            track_commands::update_track,
            track_commands::repost_track,
            track_commands::search_tracks,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(shutdown::on_run_event);
}
