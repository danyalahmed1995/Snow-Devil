pub mod auth;
pub mod browser;
pub mod commands;
pub mod db;
pub mod github;
pub mod sync;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            use tauri::Manager;
            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            std::fs::create_dir_all(&app_dir).unwrap_or_default();

            let conn = db::init_db(app_dir).expect("Failed to initialize database");

            app.manage(db::AppState {
                db_conn: std::sync::Mutex::new(Some(conn)),
            });

            // Browser webview manager state
            app.manage(std::sync::Mutex::new(
                browser::manager::BrowserWebviewManager::new(),
            ));

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Existing commands
            commands::auth::start_github_device_flow,
            commands::auth::poll_github_device_flow,
            commands::auth::disconnect_github_account,
            commands::auth::get_auth_status,
            commands::sync::start_sync,
            commands::db::get_graph_data,
            commands::db::get_recent_repositories,
            commands::repo::get_repo_overview,
            commands::repo::get_repo_tree,
            commands::repo::get_repo_file,
            commands::repo::get_repo_prs,
            commands::repo::get_repo_issues,
            commands::repo::get_pr_details,
            commands::repo::get_issue_details,
            commands::repo::get_viewer_repositories,
            commands::repo::get_viewer_pull_requests,
            commands::repo::get_viewer_issues,
            // Browser commands
            browser::commands::browser_create,
            browser::commands::browser_activate,
            browser::commands::browser_hide_all,
            browser::commands::browser_close,
            browser::commands::browser_navigate,
            browser::commands::browser_back,
            browser::commands::browser_forward,
            browser::commands::browser_reload,
            browser::commands::browser_focus,
            browser::commands::browser_resize,
            browser::commands::browser_suspend,
            browser::commands::browser_clear_data,
            browser::commands::browser_get_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

