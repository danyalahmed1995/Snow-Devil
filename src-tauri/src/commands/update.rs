//! In-app auto-update commands backed by `tauri-plugin-updater`.
//!
//! Update artifacts are signed with the project's minisign key (public half in
//! `tauri.conf.json`); the plugin verifies that signature before installing, so
//! a tampered or unsigned package is rejected. These are the app's own commands
//! (invoked from Settings), so no extra capability grant is required.

use serde::Serialize;
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSummary {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
}

/// Check the configured endpoint for a newer signed release.
/// Returns `None` when the app is already up to date.
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Result<Option<UpdateSummary>, String> {
    let updater = app.updater().map_err(|error| error.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => Ok(Some(UpdateSummary {
            version: update.version.clone(),
            current_version: update.current_version.clone(),
            notes: update.body.clone(),
        })),
        Ok(None) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

/// Download, verify, and install the available update, then relaunch.
/// Re-checks so the install always applies the currently advertised release.
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|error| error.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No update is currently available.".to_string())?;

    update
        .download_and_install(|_downloaded, _total| {}, || {})
        .await
        .map_err(|error| error.to_string())?;

    // `restart` diverges (`-> !`), which satisfies the `Result` return type.
    app.restart()
}
