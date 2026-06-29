use crate::db::AppState;
use serde_json::{json, Value};
use tauri::State;

const COUNT_TABLES: &[&str] = &[
    "accounts", "nodes", "edges", "notifications", "timeline_events",
    "simulator_entities", "simulator_events", "analytics_records",
];

#[tauri::command]
pub fn get_safe_diagnostics(state: State<'_, AppState>) -> Result<Value, String> {
    let guard = state.db_conn.lock().map_err(|_| "diagnostic database lock failed".to_string())?;
    let connection = guard.as_ref().ok_or_else(|| "diagnostic database unavailable".to_string())?;
    let schema_version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0)).unwrap_or(0);
    let mut counts = serde_json::Map::new();
    for table in COUNT_TABLES {
        let sql = format!("SELECT COUNT(*) FROM {}", table);
        let count: i64 = connection.query_row(&sql, [], |row| row.get(0)).unwrap_or(0);
        counts.insert((*table).to_string(), json!(count));
    }
    Ok(json!({
        "format": "snow-devil-safe-diagnostics-v1",
        "app": { "version": env!("CARGO_PKG_VERSION"), "tauriMajor": 2 },
        "platform": { "os": std::env::consts::OS, "arch": std::env::consts::ARCH },
        "database": { "schemaVersion": schema_version, "recordCounts": counts },
        "privacy": {
            "containsToken": false,
            "containsCookies": false,
            "containsRepositoryNames": false,
            "containsFileContent": false,
            "containsApiPayloads": false
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostic_contract_has_no_sensitive_fields() {
        let serialized = serde_json::to_string(COUNT_TABLES).unwrap();
        for forbidden in ["token", "cookie", "body", "content", "repository_name", "email"] {
            assert!(!serialized.to_lowercase().contains(forbidden));
        }
    }
}
