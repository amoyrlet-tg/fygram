//! Pulling the library back down on a machine that does not have one yet.

use tauri::{AppHandle, Manager};

use crate::shared::media_paths;
use crate::AppState;

pub(crate) fn spawn_cloud_restore(app: AppHandle) {
    let handle = app.clone();
    crate::shutdown::spawn_tracked(&handle, async move {
        let state = app.state::<AppState>();
        let Ok(media_dir) = media_paths::media_root(&app, &state.db).await else {
            return;
        };
        let Ok(app_dir) = app.path().app_data_dir() else {
            return;
        };

        let probe = tokio::time::timeout(
            std::time::Duration::from_secs(6),
            state.telegram.is_authorized(),
        )
        .await;
        if !matches!(probe, Ok(Ok(true))) {
            eprintln!("cloud_sync: offline or not authorized - the sync engine will retry");
            return;
        }

        if let Err(err) = crate::features::cloud::service::ensure_library_owner(
            &state.db,
            &state.telegram,
            &app_dir,
            &media_dir,
            &app,
        )
        .await
        {
            eprintln!("cloud_sync::ensure_library_owner failed: {err:#}");
            return;
        }

        state.sync.request_pull();

        crate::features::cloud::service::backfill_missing_channel_avatars(
            &state.db,
            &state.telegram,
            &app_dir,
            &app,
        )
        .await;
    });
}
