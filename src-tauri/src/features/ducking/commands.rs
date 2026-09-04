//! The IPC surface of ducking: whether it is on.

use tauri::{Manager, State};

use crate::shared::settings;
use crate::AppState;

use super::service::ENABLED_KEY;

#[derive(serde::Serialize)]
pub(crate) struct DuckingConfig {
    pub(crate) enabled: bool,
    pub(crate) supported: bool,
}

#[tauri::command]
pub(crate) async fn get_ducking_config(
    state: State<'_, AppState>,
) -> Result<DuckingConfig, String> {
    Box::pin(async move {
        let enabled = settings::get(&state.db, ENABLED_KEY)
            .await
            .map_err(String::from)?
            .as_deref()
            == Some("1");
        Ok(DuckingConfig {
            enabled,
            supported: cfg!(any(target_os = "windows", target_os = "linux")),
        })
    })
    .await
}

#[tauri::command]
pub(crate) async fn set_ducking_config(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    Box::pin(async move {
        settings::set(&state.db, ENABLED_KEY, if enabled { "1" } else { "0" })
            .await
            .map_err(String::from)?;

        if enabled {
            super::spawn(app.app_handle().clone());
        }
        Ok(())
    })
    .await
}
