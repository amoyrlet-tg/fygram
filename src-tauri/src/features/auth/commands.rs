//! The IPC surface of signing in: the code, the password, and the api credentials both of them need first.

use tauri::{AppHandle, State};

use crate::shared::telegram::CurrentUser;
use crate::AppState;

use super::service::{self, SessionState};

#[tauri::command]
pub(crate) async fn telegram_request_login_code(
    state: State<'_, AppState>,
    app: AppHandle,
    phone: String,
) -> Result<(), String> {
    Box::pin(async move {
        service::request_login_code(state, app, phone)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn telegram_submit_code(
    state: State<'_, AppState>,
    app: AppHandle,
    code: String,
) -> Result<&'static str, String> {
    Box::pin(async move {
        service::submit_code(state, app, code)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn telegram_submit_password(
    state: State<'_, AppState>,
    app: AppHandle,
    password: String,
) -> Result<(), String> {
    Box::pin(async move {
        service::submit_password(state, app, password)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn has_telegram_credentials(state: State<'_, AppState>) -> Result<bool, String> {
    Box::pin(async move { service::has_credentials(state).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn get_telegram_credentials(
    state: State<'_, AppState>,
) -> Result<Option<service::Credentials>, String> {
    Box::pin(async move { service::read_credentials(state).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn save_telegram_credentials(
    state: State<'_, AppState>,
    app: AppHandle,
    api_id: i32,
    api_hash: String,
) -> Result<(), String> {
    Box::pin(async move {
        service::save_credentials(state, app, api_id, api_hash)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn telegram_is_authorized(state: State<'_, AppState>) -> Result<bool, String> {
    Box::pin(async move { service::is_authorized(state).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn telegram_session_state(
    state: State<'_, AppState>,
) -> Result<SessionState, String> {
    Box::pin(async move { service::session_state(state).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn read_image_as_data_url(path: String) -> Result<String, String> {
    Box::pin(async move {
        service::read_image_as_data_url(path)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn get_current_user(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CurrentUser, String> {
    Box::pin(async move {
        service::current_user(state, app)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn logout(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    Box::pin(async move { service::logout(state, app).await.map_err(String::from) }).await
}
