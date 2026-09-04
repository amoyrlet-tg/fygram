//! The second window, holding the in-app documentation.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::shared::error::AppError;

const LABEL: &str = "docs";

#[tauri::command]
pub(crate) async fn open_docs_window(app: AppHandle, page: String) -> Result<(), String> {
    Box::pin(async move { open(app, page).map_err(String::from) }).await
}

fn open(app: AppHandle, page: String) -> Result<(), AppError> {
    let page = match page.as_str() {
        "broadcast" => "broadcast",
        _ => "broadcast",
    };

    if let Some(window) = app.get_webview_window(LABEL) {
        #[cfg(desktop)]
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        LABEL,
        WebviewUrl::App(format!("index.html#/docs/{page}").into()),
    )
    .title("fygram · docs")
    .inner_size(920.0, 780.0)
    .min_inner_size(420.0, 480.0)
    .zoom_hotkeys_enabled(false)
    .build()
    .map_err(|err| AppError::Msg(format!("opening the docs window: {err}")))?;

    Ok(())
}
