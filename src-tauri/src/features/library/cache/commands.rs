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
    plan: service::CachePlan,
) -> Result<service::CachePreview, String> {
    Box::pin(async move {
        service::preview(state, app, plan)
            .await
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub(crate) async fn apply_cache_cleanup(
    state: State<'_, AppState>,
    app: AppHandle,
    plan: service::CachePlan,
) -> Result<CacheCleanupResult, String> {
    Box::pin(async move { service::apply(state, app, plan).await.map_err(String::from) }).await
}
