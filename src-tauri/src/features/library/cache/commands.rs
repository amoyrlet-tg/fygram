use tauri::{AppHandle, State};

use crate::AppState;

use super::service::{self, CacheCleanupResult, CacheStats};

#[tauri::command]
pub(crate) async fn get_cache_stats(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CacheStats, String> {
    Box::pin(async move { service::stats(state, app).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn storage_breakdown(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<service::StorageSlice>, String> {
    Box::pin(async move { service::breakdown(state, app).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn storage_file_sizes(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, u64>, String> {
    Box::pin(async move { service::file_sizes(state).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn cleanup_cache(
    state: State<'_, AppState>,
    app: AppHandle,
    target_bytes: u64,
) -> Result<CacheCleanupResult, String> {
    Box::pin(async move {
        service::cleanup(state, app, target_bytes)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn preview_cache_cleanup(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<service::CachePreview, String> {
    Box::pin(async move { service::preview(state, app).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn apply_cache_cleanup(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CacheCleanupResult, String> {
    Box::pin(async move { service::apply(state, app).await.map_err(String::from) }).await
}

#[tauri::command]
pub(crate) async fn get_cache_max_age(state: State<'_, AppState>) -> Result<i64, String> {
    service::cache_max_age_days(&state.db)
        .await
        .map_err(String::from)
}

#[tauri::command]
pub(crate) async fn set_cache_max_age(state: State<'_, AppState>, days: i64) -> Result<(), String> {
    service::set_cache_max_age(&state.db, days)
        .await
        .map_err(String::from)
}
