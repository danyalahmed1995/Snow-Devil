//! Pure-logic bookkeeping for the bounded resident browser webview pool.

use std::collections::HashMap;
use url::Url;

/// State for a resident browser webview.
#[derive(Debug, Clone)]
pub struct BrowserWebviewRecord {
    pub tab_id: String,
    pub webview_label: String,
    pub current_url: Url,
    pub visible: bool,
    pub pinned: bool,
    pub created_at: i64,
    pub last_activated_at: i64,
}

/// In-memory registry of resident browser webviews.
pub struct BrowserWebviewManager {
    pub records: HashMap<String, BrowserWebviewRecord>,
    pub active_tab_id: Option<String>,
    pub activation_generation: u64,
    pub max_resident: usize,
}

impl BrowserWebviewManager {
    pub fn new() -> Self {
        Self {
            records: HashMap::new(),
            active_tab_id: None,
            activation_generation: 0,
            max_resident: 6, // Default as per requirements
        }
    }
}

impl Default for BrowserWebviewManager {
    fn default() -> Self {
        Self::new()
    }
}
