use crate::sync::engine::start_initial_sync;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn start_sync(app: AppHandle) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    tauri::async_runtime::spawn(async move {
        let _ = start_initial_sync(app, app_dir).await;
    });

    Ok(())
}
