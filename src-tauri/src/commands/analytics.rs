use crate::{auth::secure_store::get_token, db::AppState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalyticsRecord {
    pub account_login: String,
    pub repository_id: String,
    pub source_type: String,
    pub source_id: String,
    pub updated_at: String,
    pub payload_json: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalyticsSyncState {
    pub account_login: String,
    pub status: String,
    pub current_stage: Option<String>,
    pub current_repository: Option<String>,
    pub completed_repositories_json: String,
    pub failed_repositories_json: String,
    pub continuation_json: Option<String>,
    pub last_attempted_at: Option<String>,
    pub last_successful_at: Option<String>,
    pub retention_start: Option<String>,
    pub coverage_start: Option<String>,
    pub coverage_end: Option<String>,
    pub counts_json: String,
    pub rate_limit_json: Option<String>,
    pub error: Option<String>,
    pub settings_fingerprint: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AnalyticsApiResponse {
    pub status: u16,
    pub body: Value,
    pub next_page: Option<u32>,
    pub rate_remaining: Option<u64>,
    pub rate_reset: Option<u64>,
}

#[tauri::command]
pub async fn analytics_fetch_rest(endpoint: String) -> Result<AnalyticsApiResponse, String> {
    if !endpoint.starts_with('/') || endpoint.starts_with("//") {
        return Err("Analytics endpoint must be a GitHub REST path".into());
    }
    let token = get_token()
        .map_err(|e| e.to_string())?
        .ok_or("authentication_expired")?;
    let response = reqwest::Client::new()
        .get(format!("https://api.github.com{}", endpoint))
        .bearer_auth(token)
        .header("User-Agent", "snow-devil-analytics")
        .header("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let rate_remaining = response
        .headers()
        .get("x-ratelimit-remaining")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok());
    let rate_reset = response
        .headers()
        .get("x-ratelimit-reset")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok());
    let next_page = response
        .headers()
        .get("link")
        .and_then(|v| v.to_str().ok())
        .and_then(parse_next_page);
    let body = response.json::<Value>().await.unwrap_or(Value::Null);
    Ok(AnalyticsApiResponse {
        status,
        body,
        next_page,
        rate_remaining,
        rate_reset,
    })
}

fn parse_next_page(link: &str) -> Option<u32> {
    link.split(',')
        .find(|part| part.contains("rel=\"next\""))
        .and_then(|part| part.split('<').nth(1))
        .and_then(|part| part.split('>').next())
        .and_then(|value| url::Url::parse(value).ok())
        .and_then(|url| {
            url.query_pairs()
                .find(|(key, _)| key == "page")
                .and_then(|(_, value)| value.parse().ok())
        })
}

#[cfg(test)]
mod tests {
    use super::parse_next_page;

    #[test]
    fn parses_next_page_without_following_untrusted_urls() {
        assert_eq!(parse_next_page("<https://api.github.com/user/repos?per_page=100&page=3>; rel=\"next\", <https://api.github.com/user/repos?page=5>; rel=\"last\""), Some(3));
        assert_eq!(
            parse_next_page("<https://api.github.com/user/repos?page=1>; rel=\"prev\""),
            None
        );
    }
}

#[tauri::command]
pub fn save_analytics_records(
    state: State<'_, AppState>,
    records: Vec<AnalyticsRecord>,
) -> Result<(), String> {
    let mut guard = state.db_conn.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("Database connection not found")?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut statement = tx.prepare("INSERT INTO analytics_records (account_login, repository_id, source_type, source_id, updated_at, payload_json) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(account_login,source_type,source_id) DO UPDATE SET repository_id=excluded.repository_id, updated_at=excluded.updated_at, payload_json=excluded.payload_json").map_err(|e| e.to_string())?;
        for record in records {
            statement
                .execute(rusqlite::params![
                    record.account_login,
                    record.repository_id,
                    record.source_type,
                    record.source_id,
                    record.updated_at,
                    record.payload_json
                ])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_analytics_records(
    state: State<'_, AppState>,
    account_login: String,
) -> Result<Vec<AnalyticsRecord>, String> {
    let guard = state.db_conn.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database connection not found")?;
    let mut stmt = conn.prepare("SELECT account_login,repository_id,source_type,source_id,updated_at,payload_json FROM analytics_records WHERE account_login=?1 ORDER BY updated_at").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([account_login], |row| {
            Ok(AnalyticsRecord {
                account_login: row.get(0)?,
                repository_id: row.get(1)?,
                source_type: row.get(2)?,
                source_id: row.get(3)?,
                updated_at: row.get(4)?,
                payload_json: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_analytics_sync_state(
    state: State<'_, AppState>,
    value: AnalyticsSyncState,
) -> Result<(), String> {
    let mut guard = state.db_conn.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("Database connection not found")?;
    conn.execute("INSERT INTO analytics_sync_state VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16) ON CONFLICT(account_login) DO UPDATE SET status=excluded.status,current_stage=excluded.current_stage,current_repository=excluded.current_repository,completed_repositories_json=excluded.completed_repositories_json,failed_repositories_json=excluded.failed_repositories_json,continuation_json=excluded.continuation_json,last_attempted_at=excluded.last_attempted_at,last_successful_at=excluded.last_successful_at,retention_start=excluded.retention_start,coverage_start=excluded.coverage_start,coverage_end=excluded.coverage_end,counts_json=excluded.counts_json,rate_limit_json=excluded.rate_limit_json,error=excluded.error,settings_fingerprint=excluded.settings_fingerprint",
        rusqlite::params![value.account_login,value.status,value.current_stage,value.current_repository,value.completed_repositories_json,value.failed_repositories_json,value.continuation_json,value.last_attempted_at,value.last_successful_at,value.retention_start,value.coverage_start,value.coverage_end,value.counts_json,value.rate_limit_json,value.error,value.settings_fingerprint]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_analytics_sync_state(
    state: State<'_, AppState>,
    account_login: String,
) -> Result<Option<AnalyticsSyncState>, String> {
    let guard = state.db_conn.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database connection not found")?;
    let mut stmt = conn.prepare("SELECT account_login,status,current_stage,current_repository,completed_repositories_json,failed_repositories_json,continuation_json,last_attempted_at,last_successful_at,retention_start,coverage_start,coverage_end,counts_json,rate_limit_json,error,settings_fingerprint FROM analytics_sync_state WHERE account_login=?1").map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map([account_login], |row| {
            Ok(AnalyticsSyncState {
                account_login: row.get(0)?,
                status: row.get(1)?,
                current_stage: row.get(2)?,
                current_repository: row.get(3)?,
                completed_repositories_json: row.get(4)?,
                failed_repositories_json: row.get(5)?,
                continuation_json: row.get(6)?,
                last_attempted_at: row.get(7)?,
                last_successful_at: row.get(8)?,
                retention_start: row.get(9)?,
                coverage_start: row.get(10)?,
                coverage_end: row.get(11)?,
                counts_json: row.get(12)?,
                rate_limit_json: row.get(13)?,
                error: row.get(14)?,
                settings_fingerprint: row.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.next().transpose().map_err(|e| e.to_string())
}

