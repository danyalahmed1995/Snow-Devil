use crate::github::flow_api::{
    fetch_account_home_summary, fetch_item_timeline, fetch_source_page, SourcePageRequest,
};
use serde_json::Value;

#[tauri::command]
pub async fn get_account_home_summary() -> Result<Value, String> {
    fetch_account_home_summary()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_source_page(req: SourcePageRequest) -> Result<Value, String> {
    fetch_source_page(req).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_item_timeline(
    owner: String,
    name: String,
    number: i64,
    is_pr: bool,
    cursor: Option<String>,
) -> Result<Value, String> {
    fetch_item_timeline(&owner, &name, number, is_pr, cursor)
        .await
        .map_err(|e| e.to_string())
}
