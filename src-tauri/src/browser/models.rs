//! Data types exchanged between the frontend shell and the browser commands.

use serde::{Deserialize, Serialize};

/// Pixel bounds for positioning a browser webview inside the main window.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Payload sent by the frontend to create a new browser tab.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserCreateRequest {
    pub tab_id: String,
    pub label: String,
    pub url: String,
    pub bounds: BrowserBounds,
}

/// Snapshot of a browser tab's current state (returned to the frontend).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserState {
    pub tab_id: String,
    pub current_url: String,
    pub can_go_back: Option<bool>,
    pub can_go_forward: Option<bool>,
    pub loading: bool,
}

/// Emitted when a browser tab navigates to a new URL.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserNavigationEvent {
    pub tab_id: String,
    pub webview_label: String,
    pub url: String,
}

/// Emitted when a browser tab's document title changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserTitleEvent {
    pub tab_id: String,
    pub title: String,
}

/// Emitted when a browser tab encounters an error.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserErrorEvent {
    pub tab_id: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserTabEvent {
    pub tab_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserDownloadEvent {
    pub tab_id: String,
    pub url: String,
    pub status: String,
}
