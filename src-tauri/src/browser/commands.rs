//! Tauri `#[command]` handlers for managing the bounded resident browser child webview pool.

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{Emitter, WebviewUrl};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use super::manager::{BrowserWebviewManager, BrowserWebviewRecord};
use super::models::*;
use super::security::{self, NavigationDecision};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn get_main_window(
    app: &AppHandle,
) -> Result<tauri::Window, String> {
    app.get_window("main")
        .ok_or_else(|| "Main window not found".to_string())
}

// We use security::sanitize_webview_label for labels

fn current_time_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

fn enforce_pool_limits(app: &AppHandle, state: &mut BrowserWebviewManager) {
    if state.records.len() <= state.max_resident {
        return;
    }
    
    // Find the LRU inactive tab
    let mut best_evict: Option<String> = None;
    let mut best_time = i64::MAX;
    
    let mut oldest_id: Option<String> = None;
    let mut oldest_time = i64::MAX;
    
    for (id, record) in &state.records {
        if Some(id.clone()) == state.active_tab_id {
            continue; // Never evict active
        }
        
        if record.last_activated_at < oldest_time {
            oldest_time = record.last_activated_at;
            oldest_id = Some(id.clone());
        }
        
        if !record.pinned && record.last_activated_at < best_time {
            best_time = record.last_activated_at;
            best_evict = Some(id.clone());
        }
    }
    
    let target = best_evict.or(oldest_id);
    
    if let Some(evict_id) = target {
        if let Some(record) = state.records.remove(&evict_id) {
            if let Some(wv) = app.get_webview(&record.webview_label) {
                let _ = wv.close();
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn browser_create(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
    request: BrowserCreateRequest,
) -> Result<(), String> {
    let parsed_url = Url::parse(&request.url).map_err(|e| format!("Invalid URL: {e}"))?;

    let decision = security::classify_navigation(&parsed_url);
    if decision != NavigationDecision::Allow {
        return Err(format!("URL is not allowed in-app: {}", parsed_url.as_str()));
    }

    let label = security::sanitize_webview_label(&request.tab_id);

    if app.get_webview(&label).is_some() {
        return Ok(());
    }

    {
        let mut mgr = state.lock().map_err(|e| e.to_string())?;
        enforce_pool_limits(&app, &mut mgr);
    }

    let main_window = get_main_window(&app)?;
    let navigation_app = app.clone();
    let navigation_tab_id = request.tab_id.clone();
    let navigation_label = label.clone();
    let new_window_app = app.clone();
    let new_window_tab_id = request.tab_id.clone();
    let new_window_label = label.clone();
    let title_app = app.clone();
    let title_tab_id = request.tab_id.clone();
    let load_app = app.clone();
    let load_tab_id = request.tab_id.clone();
    let download_app = app.clone();
    let download_tab_id = request.tab_id.clone();

    let webview_builder = WebviewBuilder::new(
        &label,
        WebviewUrl::External(parsed_url.clone()),
    )
    .on_navigation(move |nav_url| {
        let decision = security::classify_navigation(nav_url);
        match decision {
            NavigationDecision::OpenExternal => {
                let _ = navigation_app.opener().open_url(nav_url.as_str(), None::<String>);
                return false;
            }
            NavigationDecision::Block => {
                let _ = navigation_app.emit("browser:error", BrowserErrorEvent { tab_id: navigation_tab_id.clone(), error: format!("Unsupported or unsafe protocol blocked: {}", nav_url.scheme()) });
                return false;
            }
            NavigationDecision::Allow => {}
        }

        if let Ok(mut manager) = navigation_app.state::<Mutex<BrowserWebviewManager>>().lock() {
            if let Some(record) = manager.records.get_mut(&navigation_tab_id) { record.current_url = nav_url.clone(); }
        }
        let _ = navigation_app.emit(
            "browser:navigation",
            BrowserNavigationEvent {
                tab_id: navigation_tab_id.clone(),
                webview_label: navigation_label.clone(),
                url: nav_url.to_string(),
            },
        );

        true
    })
    .on_new_window(move |url, _features| {
        match security::classify_navigation(&url) {
            NavigationDecision::Allow => {
                let _ = new_window_app.emit("browser:open-entity", BrowserNavigationEvent { tab_id: new_window_tab_id.clone(), webview_label: new_window_label.clone(), url: url.to_string() });
            }
            NavigationDecision::OpenExternal => { let _ = new_window_app.opener().open_url(url.as_str(), None::<String>); }
            NavigationDecision::Block => { let _ = new_window_app.emit("browser:error", BrowserErrorEvent { tab_id: new_window_tab_id.clone(), error: format!("Unsupported or unsafe protocol blocked: {}", url.scheme()) }); }
        }
        NewWindowResponse::Deny
    })
    .on_document_title_changed(move |_webview, title| {
        let _ = title_app.emit("browser:title-changed", BrowserTitleEvent { tab_id: title_tab_id.clone(), title });
    })
    .on_page_load(move |_webview, payload| {
        let event = match payload.event() { PageLoadEvent::Started => "browser:load-started", PageLoadEvent::Finished => "browser:load-finished" };
        let _ = load_app.emit(event, BrowserTabEvent { tab_id: load_tab_id.clone() });
    })
    .on_download(move |_webview, event| {
        let (url, status) = match event {
            DownloadEvent::Requested { url, .. } => (url.to_string(), "requested".to_string()),
            DownloadEvent::Finished { url, success, .. } => (url.to_string(), if success { "finished" } else { "failed" }.to_string()),
            _ => return true,
        };
        let _ = download_app.emit("browser:download", BrowserDownloadEvent { tab_id: download_tab_id.clone(), url, status });
        true
    });

    let position = tauri::LogicalPosition::new(request.bounds.x, request.bounds.y);
    let size = tauri::LogicalSize::new(request.bounds.width, request.bounds.height);

    main_window
        .add_child(webview_builder, position, size)
        .map_err(|e| format!("Failed to create browser webview: {e}"))?;

    {
        let mut mgr = state.lock().map_err(|e| e.to_string())?;
        let now = current_time_ms();
        mgr.records.insert(request.tab_id.clone(), BrowserWebviewRecord {
            tab_id: request.tab_id.clone(),
            webview_label: label,
            current_url: parsed_url,
            visible: false,
            pinned: false,
            created_at: now,
            last_activated_at: now,
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn browser_activate(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
    tab_id: String,
    bounds: BrowserBounds,
) -> Result<(), String> {
    let current_generation = {
        let mut mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.activation_generation += 1;
        mgr.activation_generation
    };

    let label = {
        let mgr = state.lock().map_err(|e| e.to_string())?;
        if let Some(record) = mgr.records.get(&tab_id) {
            record.webview_label.clone()
        } else {
            return Err(format!("Webview for tab {} not found", tab_id));
        }
    };

    if let Some(wv) = app.get_webview(&label) {
        let scale_factor = wv.window().scale_factor().unwrap_or(1.0);
        let physical_x = (bounds.x as f64 * scale_factor).round() as i32;
        let physical_y = (bounds.y as f64 * scale_factor).round() as i32;
        let physical_w = (bounds.width as f64 * scale_factor).round() as u32;
        let physical_h = (bounds.height as f64 * scale_factor).round() as u32;

        let _ = wv.set_position(tauri::PhysicalPosition::new(physical_x, physical_y));
        let _ = wv.set_size(tauri::PhysicalSize::new(physical_w, physical_h));
    }

    let other_labels: Vec<String> = {
        let mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.records.iter()
            .filter(|(k, _)| **k != tab_id)
            .map(|(_, v)| v.webview_label.clone())
            .collect()
    };

    for other_label in other_labels {
        if let Some(wv) = app.get_webview(&other_label) {
            let _ = wv.hide();
        }
    }

    {
        let mgr = state.lock().map_err(|e| e.to_string())?;
        if mgr.activation_generation != current_generation {
            return Err("Activation generation stale".to_string());
        }
    }

    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.show();
        let _ = wv.set_focus();
    }

    {
        let mut mgr = state.lock().map_err(|e| e.to_string())?;
        for (k, record) in mgr.records.iter_mut() {
            record.visible = *k == tab_id;
            if *k == tab_id {
                record.last_activated_at = current_time_ms();
            }
        }
        mgr.active_tab_id = Some(tab_id.clone());
        
        let visible_count = mgr.records.values().filter(|v| v.visible).count();
        if visible_count > 1 {
            eprintln!("ASSERTION FAILED: More than 1 webview marked visible!");
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn browser_hide_all(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
) -> Result<(), String> {
    let labels: Vec<String> = {
        let mut mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.active_tab_id = None;
        for (_, record) in mgr.records.iter_mut() {
            record.visible = false;
        }
        mgr.records.values().map(|v| v.webview_label.clone()).collect()
    };

    for label in labels {
        if let Some(wv) = app.get_webview(&label) {
            let _ = wv.hide();
        }
    }
    
    Ok(())
}

#[tauri::command]
pub async fn browser_close(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
    tab_id: String,
) -> Result<(), String> {
    let label = {
        let mut mgr = state.lock().map_err(|e| e.to_string())?;
        if let Some(record) = mgr.records.remove(&tab_id) {
            if mgr.active_tab_id == Some(tab_id.clone()) {
                mgr.active_tab_id = None;
            }
            record.webview_label
        } else {
            return Ok(()); // Already gone
        }
    };

    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.close();
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_navigate(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
    tab_id: String,
    url: String,
) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;

    if security::classify_navigation(&parsed) != NavigationDecision::Allow {
        return Err(format!("URL not allowed in-app: {url}"));
    }

    let label = {
        let mut mgr = state.lock().map_err(|e| e.to_string())?;
        if let Some(record) = mgr.records.get_mut(&tab_id) {
            record.current_url = parsed.clone();
            record.webview_label.clone()
        } else {
            return Err(format!("Webview not found for tab: {}", tab_id));
        }
    };

    if let Some(wv) = app.get_webview(&label) {
        wv.navigate(parsed.clone())
            .map_err(|e| format!("Failed to navigate: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn browser_back(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
    tab_id: String,
) -> Result<(), String> {
    let label = {
        let mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.records.get(&tab_id).map(|r| r.webview_label.clone())
    };
    if let Some(l) = label {
        if let Some(wv) = app.get_webview(&l) {
            wv.eval("history.back()").map_err(|e| format!("Failed to go back: {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_forward(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
    tab_id: String,
) -> Result<(), String> {
    let label = {
        let mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.records.get(&tab_id).map(|r| r.webview_label.clone())
    };
    if let Some(l) = label {
        if let Some(wv) = app.get_webview(&l) {
            wv.eval("history.forward()").map_err(|e| format!("Failed to go forward: {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_reload(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
    tab_id: String,
) -> Result<(), String> {
    let label = {
        let mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.records.get(&tab_id).map(|r| r.webview_label.clone())
    };
    if let Some(l) = label {
        if let Some(wv) = app.get_webview(&l) {
            wv.eval("location.reload()").map_err(|e| format!("Failed to reload: {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_stop(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
    tab_id: String,
) -> Result<(), String> {
    let label = {
        let mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.records.get(&tab_id).map(|record| record.webview_label.clone())
    };
    if let Some(label) = label {
        if let Some(webview) = app.get_webview(&label) {
            webview.eval("window.stop()").map_err(|e| format!("Failed to stop loading: {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_focus(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
    tab_id: String,
) -> Result<(), String> {
    let label = {
        let mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.records.get(&tab_id).map(|r| r.webview_label.clone())
    };
    if let Some(l) = label {
        if let Some(wv) = app.get_webview(&l) {
            let _ = wv.set_focus();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_resize(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
    tab_id: String,
    bounds: BrowserBounds,
) -> Result<(), String> {
    let label = {
        let mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.records.get(&tab_id).map(|r| r.webview_label.clone())
    };
    if let Some(l) = label {
        if let Some(wv) = app.get_webview(&l) {
            let scale_factor = wv.window().scale_factor().unwrap_or(1.0);
            let physical_x = (bounds.x as f64 * scale_factor).round() as i32;
            let physical_y = (bounds.y as f64 * scale_factor).round() as i32;
            let physical_w = (bounds.width as f64 * scale_factor).round() as u32;
            let physical_h = (bounds.height as f64 * scale_factor).round() as u32;

            let _ = wv.set_position(tauri::PhysicalPosition::new(physical_x, physical_y));
            let _ = wv.set_size(tauri::PhysicalSize::new(physical_w, physical_h));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_suspend(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
    tab_id: String,
) -> Result<(), String> {
    let label = {
        let mut mgr = state.lock().map_err(|e| e.to_string())?;
        if let Some(record) = mgr.records.remove(&tab_id) {
            if mgr.active_tab_id == Some(tab_id.clone()) {
                mgr.active_tab_id = None;
            }
            record.webview_label
        } else {
            return Ok(());
        }
    };

    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.close();
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_clear_data(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
    tab_id: String,
) -> Result<(), String> {
    let label = {
        let mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.records.get(&tab_id).map(|r| r.webview_label.clone())
    };
    if let Some(l) = label {
        if let Some(wv) = app.get_webview(&l) {
            wv.eval("location.reload(true)").map_err(|e| format!("Failed to clear data: {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_get_state(
    app: AppHandle,
    state: tauri::State<'_, Mutex<BrowserWebviewManager>>,
    tab_id: String,
) -> Result<BrowserState, String> {
    let (label, mut current_url) = {
        let mgr = state.lock().map_err(|e| e.to_string())?;
        if let Some(record) = mgr.records.get(&tab_id) {
            (record.webview_label.clone(), record.current_url.to_string())
        } else {
            return Err(format!("Tab {} not resident", tab_id));
        }
    };

    if let Some(wv) = app.get_webview(&label) {
        if let Ok(url) = wv.url() {
            current_url = url.to_string();
            if let Ok(mut mgr) = state.lock() {
                if let Some(record) = mgr.records.get_mut(&tab_id) {
                    record.current_url = url;
                }
            }
        }
    }

    Ok(BrowserState {
        tab_id,
        current_url,
        can_go_back: None,
        can_go_forward: None,
        loading: false,
    })
}
