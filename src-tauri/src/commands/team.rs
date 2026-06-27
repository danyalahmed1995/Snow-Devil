use crate::github::team_api::{fetch_member_activity, fetch_org_activity, fetch_viewer_organizations};
use serde_json::Value;

#[tauri::command]
pub async fn get_viewer_organizations() -> Result<Value, String> {
    fetch_viewer_organizations().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_member_activity(login: String) -> Result<Value, String> {
    fetch_member_activity(&login).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_org_activity(org_login: String) -> Result<Value, String> {
    fetch_org_activity(&org_login).await.map_err(|e| e.to_string())
}
