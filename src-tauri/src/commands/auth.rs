use crate::auth::device_flow::{poll_for_token, start_device_flow, DeviceCodeResponse};
use crate::auth::secure_store::{delete_token, get_token, save_token};

#[tauri::command]
pub async fn start_github_device_flow(client_id: String) -> Result<DeviceCodeResponse, String> {
    start_device_flow(&client_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn poll_github_device_flow(
    client_id: String,
    device_code: String,
) -> Result<Option<String>, String> {
    match poll_for_token(&client_id, &device_code).await {
        Ok(Some(token)) => {
            if let Err(e) = save_token(&token) {
                return Err(format!("Failed to save token securely: {}", e));
            }
            Ok(Some("Token saved securely".into()))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn disconnect_github_account() -> Result<(), String> {
    delete_token().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_auth_status() -> Result<serde_json::Value, String> {
    match get_token() {
        Ok(Some(_)) => {
            // Attempt to fetch user profile to confirm token is valid and return details
            match crate::github::user_api::fetch_viewer_profile().await {
                Ok(profile) => Ok(serde_json::json!({
                    "isAuthenticated": true,
                    "account": profile
                })),
                Err(e) => {
                    // Token exists but fetch failed (network or invalid token)
                    if e.to_string().contains("Bad credentials") || e.to_string().contains("401") {
                        // Invalid token
                        let _ = delete_token();
                        Ok(serde_json::json!({ "isAuthenticated": false }))
                    } else {
                        // Network error or other API error
                        Err(e.to_string())
                    }
                }
            }
        }
        Ok(None) => Ok(serde_json::json!({ "isAuthenticated": false })),
        Err(e) => Err(e.to_string()),
    }
}
