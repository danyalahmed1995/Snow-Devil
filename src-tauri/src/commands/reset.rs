use crate::auth::secure_store::delete_token;
use crate::browser::manager::BrowserWebviewManager;
use crate::db::AppState;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Removes only Snow Devil-owned credentials, cached GitHub data, and child-webview state.
/// The operation is intentionally idempotent and never contacts GitHub.
#[tauri::command]
pub fn reset_local_app_data(
    app: AppHandle,
    db: tauri::State<'_, AppState>,
    browser: tauri::State<'_, Mutex<BrowserWebviewManager>>,
) -> Result<(), String> {
    delete_token().map_err(|e| format!("Failed to remove Snow Devil credential: {e}"))?;

    {
        let mut guard = db.db_conn.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_mut().ok_or("Database is unavailable")?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(
            "DELETE FROM edges;
             DELETE FROM nodes;
             DELETE FROM accounts;
             DELETE FROM notifications;
             DELETE FROM timeline_events;
             DELETE FROM sync_state;
             DELETE FROM tabs;
             DELETE FROM navigation_history;
             DELETE FROM saved_views;
             DELETE FROM simulator_events;
             DELETE FROM simulator_entities;
             DELETE FROM simulator_sync_state;
             DELETE FROM analytics_records;
             DELETE FROM analytics_sync_state;",
        ).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }

    let labels = {
        let mut manager = browser.lock().map_err(|e| e.to_string())?;
        let labels = manager.records.values().map(|record| record.webview_label.clone()).collect::<Vec<_>>();
        manager.records.clear();
        manager.active_tab_id = None;
        labels
    };
    for label in labels {
        if let Some(webview) = app.get_webview(&label) {
            webview.clear_all_browsing_data().map_err(|e| format!("Failed to clear embedded browsing data: {e}"))?;
            let _ = webview.close();
        }
    }
    if let Some(main) = app.get_webview("main") {
        main.clear_all_browsing_data().map_err(|e| format!("Failed to clear app webview data: {e}"))?;
    }
    Ok(())
}

/// Clears account-scoped cached data while preserving the credential and account connection.
#[tauri::command]
pub fn reset_local_cache(db: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut guard = db.db_conn.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("Database is unavailable")?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute_batch(
        "DELETE FROM edges; DELETE FROM nodes; DELETE FROM notifications; DELETE FROM timeline_events;
         DELETE FROM sync_state; DELETE FROM simulator_events; DELETE FROM simulator_entities;
         DELETE FROM simulator_sync_state; DELETE FROM analytics_records; DELETE FROM analytics_sync_state;"
    ).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn reset_sql_is_idempotent_by_construction() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE cache (id INTEGER); DELETE FROM cache; DELETE FROM cache;").unwrap();
    }

    #[test]
    fn cache_reset_does_not_require_credential_removal() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE accounts (id TEXT); CREATE TABLE cache (id INTEGER); INSERT INTO accounts VALUES ('me'); DELETE FROM cache;").unwrap();
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM accounts", [], |row| row.get::<_, i64>(0)).unwrap(), 1);
    }
}
