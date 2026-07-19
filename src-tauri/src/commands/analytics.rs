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

#[derive(Debug, Serialize, Deserialize)]
pub struct JobLogResponse {
    pub status: u16,
    pub text: Option<String>,
    pub truncated: bool,
    pub error_kind: Option<String>,
}

#[tauri::command]
pub async fn analytics_fetch_job_log(
    repository: String,
    job_id: u64,
) -> Result<JobLogResponse, String> {
    let token = get_token()
        .map_err(|e| e.to_string())?
        .ok_or("authentication_expired")?;

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    let target_url = build_job_log_url(&repository, job_id)?;

    let response = client
        .get(target_url)
        .bearer_auth(&token)
        .header("User-Agent", "snow-devil-analytics")
        .header("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();

    if status.is_success() {
        let log_text = response.text().await.map_err(|e| e.to_string())?;
        return Ok(JobLogResponse {
            status: status.as_u16(),
            text: Some(log_text),
            truncated: false,
            error_kind: None,
        });
    }

    if status.is_redirection() {
        if let Some(location) = response.headers().get(reqwest::header::LOCATION) {
            let loc_str = location.to_str().map_err(|_| "Invalid location header")?;

            if !loc_str.starts_with("https://") {
                return Ok(JobLogResponse {
                    status: status.as_u16(),
                    text: None,
                    truncated: false,
                    error_kind: Some("invalid_redirect".to_string()),
                });
            }

            let dl_client = reqwest::Client::builder()
                .build()
                .map_err(|e| e.to_string())?;

            let mut dl_response = dl_client
                .get(loc_str)
                .timeout(std::time::Duration::from_secs(30))
                .send()
                .await
                .map_err(|e| e.to_string())?;

            let dl_status = dl_response.status();
            if !dl_status.is_success() {
                return Ok(JobLogResponse {
                    status: dl_status.as_u16(),
                    text: None,
                    truncated: false,
                    error_kind: Some("download_failed".to_string()),
                });
            }

            let mut log_text = String::new();
            let mut size = 0;
            let max_size = 5 * 1024 * 1024; // 5 MB

            while let Some(chunk) = dl_response.chunk().await.map_err(|e| e.to_string())? {
                size += chunk.len();
                let text_chunk = String::from_utf8_lossy(&chunk);
                log_text.push_str(&text_chunk);
                if size > max_size {
                    return Ok(JobLogResponse {
                        status: 200,
                        text: Some(log_text),
                        truncated: true,
                        error_kind: None,
                    });
                }
            }

            return Ok(JobLogResponse {
                status: 200,
                text: Some(log_text),
                truncated: false,
                error_kind: None,
            });
        }
    }

    Ok(JobLogResponse {
        status: status.as_u16(),
        text: None,
        truncated: false,
        error_kind: Some("no_redirect".to_string()),
    })
}

#[tauri::command]
pub async fn save_log_file(content: String, default_filename: String) -> Result<bool, String> {
    let file_path = rfd::AsyncFileDialog::new()
        .set_title("Save Log File")
        .set_file_name(&default_filename)
        .add_filter("Text Files", &["txt"])
        .save_file()
        .await;

    if let Some(file) = file_path {
        let path = file.path();
        std::fs::write(path, content).map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn build_job_log_url(repository: &str, job_id: u64) -> Result<url::Url, String> {
    let parts: Vec<&str> = repository.split('/').collect();
    if parts.len() != 2 {
        return Err("Repository must be in owner/name format".into());
    }
    let owner = parts[0];
    let name = parts[1];

    let is_valid = |s: &str| {
        !s.is_empty()
            && s != "."
            && s != ".."
            && !s.contains('\\')
            && !s.chars().any(|c| c.is_control())
    };

    if !is_valid(owner) || !is_valid(name) {
        return Err("Invalid repository format".into());
    }

    let mut url = url::Url::parse("https://api.github.com").unwrap();
    url.path_segments_mut()
        .map_err(|_| "Invalid base URL")?
        .extend(&[
            "repos",
            owner,
            name,
            "actions",
            "jobs",
            &job_id.to_string(),
            "logs",
        ]);

    Ok(url)
}

#[cfg(test)]
mod test_analytics {
    use super::*;

    #[test]
    fn test_build_job_log_url_valid() {
        let url = build_job_log_url("danyalahmed1995/Snow-Devil", 12345).unwrap();
        assert_eq!(
            url.as_str(),
            "https://api.github.com/repos/danyalahmed1995/Snow-Devil/actions/jobs/12345/logs"
        );
    }

    #[test]
    fn test_build_job_log_url_valid_chars() {
        let url = build_job_log_url("my_user.name/my-repo_12.3", 1).unwrap();
        assert_eq!(
            url.as_str(),
            "https://api.github.com/repos/my_user.name/my-repo_12.3/actions/jobs/1/logs"
        );
    }

    #[test]
    fn test_build_job_log_url_invalid_format() {
        assert!(build_job_log_url("owner_only", 1).is_err());
        assert!(build_job_log_url("owner/name/extra", 1).is_err());
    }

    #[test]
    fn test_build_job_log_url_path_traversal() {
        assert!(build_job_log_url("../repo", 1).is_err());
        assert!(build_job_log_url("owner/..", 1).is_err());
        assert!(build_job_log_url("owner/.", 1).is_err());
        assert!(build_job_log_url("owner/repo\\name", 1).is_err());
    }

    #[test]
    fn test_build_job_log_url_empty_components() {
        assert!(build_job_log_url("/repo", 1).is_err());
        assert!(build_job_log_url("owner/", 1).is_err());
        assert!(build_job_log_url("/", 1).is_err());
    }

    #[test]
    fn test_build_job_log_url_control_chars_and_crlf() {
        assert!(build_job_log_url("owner\r/name", 1).is_err());
        assert!(build_job_log_url("owner/name\n", 1).is_err());
        assert!(build_job_log_url("owner\t/name", 1).is_err());
    }
}
