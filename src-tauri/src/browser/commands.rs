//! Tauri `#[command]` handlers for managing the bounded resident browser child webview pool.

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};
use tauri::webview::WebviewBuilder;
use tauri::{Emitter, WebviewUrl};
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

fn generate_webview_label(tab_id: &str) -> String {
    let label = tab_id.replace(":", "-").replace("/", "-").replace("?", "-").replace("=", "-");
    format!("browser-{}", label)
}

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

    let label = generate_webview_label(&request.tab_id);

    if app.get_webview(&label).is_some() {
        return Ok(());
    }

    {
        let mut mgr = state.lock().map_err(|e| e.to_string())?;
        enforce_pool_limits(&app, &mut mgr);
    }

    let main_window = get_main_window(&app)?;
    let app_clone = app.clone();
    let tab_id_clone = request.tab_id.clone();
    let label_clone = label.clone();

    let webview_builder = WebviewBuilder::new(
        &label,
        WebviewUrl::External(parsed_url.clone()),
    )
    .on_navigation(move |nav_url| {
        let decision = security::classify_navigation(nav_url);
        if decision != NavigationDecision::Allow {
            return false;
        }

        let _ = app_clone.emit(
            "browser:navigation",
            BrowserNavigationEvent {
                tab_id: tab_id_clone.clone(),
                webview_label: label_clone.clone(),
                url: nav_url.to_string(),
            },
        );

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
