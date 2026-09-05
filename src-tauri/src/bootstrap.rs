//! Everything that has to happen once, before the window exists.
//!
//! The only place allowed to block the main thread, and the only one where
//! failing to start is the right answer to an error.

use std::collections::HashMap;
use std::time::Duration;

use tauri::Manager;

use crate::features::cloud::restore;
use crate::features::ducking;
use crate::features::playback::audio::PlayerHandle;
use crate::features::profile::service as profile;
use crate::features::storage::service as storage;
use crate::features::sync::{engine as sync_engine, stamp, SyncHandle};
use crate::shared::media_paths;
use crate::shared::telegram::TelegramState;
use crate::shared::{db, settings};
use crate::shutdown;
use crate::AppState;

pub(crate) fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_dir = app.path().app_data_dir().expect("resolve app data dir");
    let db_path = app_dir.join("library.db");

    let db = tauri::async_runtime::block_on(db::connect(&db_path))
        .expect("failed to open library database");
    if let Err(err) =
        tauri::async_runtime::block_on(db::restore_api_credentials_if_missing(&db, &app_dir))
    {
        crate::log!("db: failed to restore api credentials: {err:#}");
    }

    let telegram = TelegramState::new();
    let mut auto_connected = false;
    tauri::async_runtime::block_on(async {
        let api_id: Option<(String,)> =
            sqlx::query_as("SELECT value FROM settings WHERE key = 'telegram_api_id'")
                .fetch_optional(&db)
                .await
                .expect("querying settings");

        if let Some((api_id,)) = api_id {
            if let Ok(api_id) = api_id.parse::<i32>() {
                let session_path = app_dir.join("telegram.session");
                match telegram.connect(session_path, api_id).await {
                    Ok(()) => auto_connected = true,
                    Err(err) => crate::log!("telegram: failed to auto-connect: {err:#}"),
                }
            }
        }
    });

    tauri::async_runtime::block_on(async {
        let sync_enabled = settings::get(&db, "profile_sync_enabled")
            .await
            .ok()
            .flatten()
            .as_deref()
            == Some("1");
        if sync_enabled && auto_connected {
            // the previous run left a track hoisted; put it back
            let _ = tokio::time::timeout(
                Duration::from_secs(5),
                profile::restore_hoisted(&db, &telegram),
            )
            .await;
        }
    });

    let always_fullscreen = tauri::async_runtime::block_on(settings::get(&db, "always_fullscreen"))
        .ok()
        .flatten()
        .as_deref()
        == Some("1");

    tauri::async_runtime::block_on(stamp::device_id(&db));

    // tauri.conf.json's static scope only knows the default location
    tauri::async_runtime::block_on(async {
        if let Ok(root) = media_paths::media_root(&app.handle().clone(), &db).await {
            let _ = app.asset_protocol_scope().allow_directory(&root, true);
        }
    });

    app.manage(AppState {
        db,
        telegram,
        player: PlayerHandle::spawn(),
        sync: SyncHandle::new(),
        profile_sync_lock: tokio::sync::Mutex::new(()),
        sync_cancel_flags: tokio::sync::Mutex::new(HashMap::new()),
        download_locks: tokio::sync::Mutex::new(HashMap::new()),
        shutdown: tokio_util::sync::CancellationToken::new(),
        tasks: tokio_util::task::TaskTracker::new(),
    });

    #[cfg(target_os = "android")]
    crate::android::remember_app(app.handle().clone());

    if auto_connected {
        restore::spawn_cloud_restore(app.handle().clone());
    }
    sync_engine::spawn(app.handle().clone());

    ducking::spawn(app.handle().clone());

    {
        let handle = app.handle().clone();
        shutdown::spawn_tracked(&handle.clone(), async move {
            let db = handle.state::<AppState>().db.clone();
            storage::ensure_layout(&handle, &db).await;
        });
    }

    #[cfg(desktop)]
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../icons/128x128.png")) {
            let _ = window.set_icon(icon);
        }

        if always_fullscreen {
            let _ = window.set_fullscreen(true);
        }
    }
    #[cfg(not(desktop))]
    let _ = always_fullscreen;

    Ok(())
}
