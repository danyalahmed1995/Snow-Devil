use crate::auth::secure_store::get_token;
use reqwest::{header, Client, StatusCode};
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPollResponse {
    pub status: u16,
    pub body: Value,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub poll_interval_seconds: u64,
    pub rate_remaining: Option<u64>,
    pub rate_reset: Option<u64>,
}

fn header_string(response: &reqwest::Response, name: header::HeaderName) -> Option<String> {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}

fn poll_interval(response: &reqwest::Response) -> u64 {
    response
        .headers()
        .get("x-poll-interval")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
        .unwrap_or(60)
        .clamp(60, 3600)
}

#[tauri::command]
pub async fn poll_github_notifications(
    etag: Option<String>,
    last_modified: Option<String>,
) -> Result<NotificationPollResponse, String> {
    let token = get_token()
        .map_err(|_| "notification_authentication_failed".to_string())?
        .ok_or("notification_authentication_failed")?;
    let client = Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "notification_client_unavailable".to_string())?;
    let mut request = client
        .get("https://api.github.com/notifications?all=true&participating=false&per_page=100")
        .bearer_auth(token)
        .header(header::USER_AGENT, "snow-devil-notifications")
        .header(header::ACCEPT, "application/vnd.github+json");
    if let Some(value) = etag.filter(|value| !value.contains(['\r', '\n'])) {
        request = request.header(header::IF_NONE_MATCH, value);
    }
    if let Some(value) = last_modified.filter(|value| !value.contains(['\r', '\n'])) {
        request = request.header(header::IF_MODIFIED_SINCE, value);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "notification_network_failed".to_string())?;
    let status = response.status();
    let etag = header_string(&response, header::ETAG);
    let last_modified = header_string(&response, header::LAST_MODIFIED);
    let interval = poll_interval(&response);
    let rate_remaining = response
        .headers()
        .get("x-ratelimit-remaining")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok());
    let rate_reset = response
        .headers()
        .get("x-ratelimit-reset")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok());
    let body = if status == StatusCode::NOT_MODIFIED || !status.is_success() {
        Value::Null
    } else {
        response
            .json::<Value>()
            .await
            .map_err(|_| "notification_response_invalid".to_string())?
    };
    Ok(NotificationPollResponse {
        status: status.as_u16(),
        body,
        etag,
        last_modified,
        poll_interval_seconds: interval,
        rate_remaining,
        rate_reset,
    })
}

#[tauri::command]
pub async fn mark_github_notification_read(thread_id: String) -> Result<(), String> {
    if thread_id.is_empty()
        || thread_id.len() > 32
        || !thread_id.bytes().all(|value| value.is_ascii_digit())
    {
        return Err("invalid_notification_thread".into());
    }
    let token = get_token()
        .map_err(|_| "notification_authentication_failed".to_string())?
        .ok_or("notification_authentication_failed")?;
    let response = Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "notification_client_unavailable".to_string())?
        .patch(format!(
            "https://api.github.com/notifications/threads/{thread_id}"
        ))
        .bearer_auth(token)
        .header(header::USER_AGENT, "snow-devil-notifications")
        .header(header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|_| "notification_network_failed".to_string())?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "notification_mark_read_failed_{}",
            response.status().as_u16()
        ))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn conditional_validators_reject_header_injection() {
        let valid = Some("W/\"etag\"".to_string()).filter(|value| !value.contains(['\r', '\n']));
        let hostile = Some("etag\r\nAuthorization: secret".to_string())
            .filter(|value| !value.contains(['\r', '\n']));
        assert!(valid.is_some());
        assert!(hostile.is_none());
    }

    #[test]
    fn notification_thread_ids_are_strictly_numeric_and_bounded() {
        let valid = "123456";
        let hostile = "1/../../token";
        assert!(valid.bytes().all(|value| value.is_ascii_digit()));
        assert!(!hostile.bytes().all(|value| value.is_ascii_digit()));
    }
}
