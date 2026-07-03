use crate::db::AppState;
use serde_json::{json, Value};
use std::io::{Read, Seek, SeekFrom};
use tauri::{Manager, State};

/// Hard ceiling on how much of the log file the problem reporter may read, so a
/// large rotated log can never balloon the bundle or memory.
const MAX_LOG_TAIL_BYTES: u64 = 256 * 1024;

const COUNT_TABLES: &[&str] = &[
    "accounts",
    "nodes",
    "edges",
    "notifications",
    "timeline_events",
    "simulator_entities",
    "simulator_events",
    "analytics_records",
];

#[tauri::command]
pub fn get_safe_diagnostics(state: State<'_, AppState>) -> Result<Value, String> {
    let guard = state
        .db_conn
        .lock()
        .map_err(|_| "diagnostic database lock failed".to_string())?;
    let connection = guard
        .as_ref()
        .ok_or_else(|| "diagnostic database unavailable".to_string())?;
    let schema_version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap_or(0);
    let mut counts = serde_json::Map::new();
    for table in COUNT_TABLES {
        let sql = format!("SELECT COUNT(*) FROM {}", table);
        let count: i64 = connection
            .query_row(&sql, [], |row| row.get(0))
            .unwrap_or(0);
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

/// Return the tail of the application log for the "Report a problem" bundle.
///
/// The log is written by `tauri-plugin-log` to the OS app-log dir as
/// `snow-devil.log` and captures panics via the hook installed in `run()`.
/// Only the last `MAX_LOG_TAIL_BYTES` are returned; a missing log (e.g. a
/// clean first run) yields an empty string rather than an error.
#[tauri::command]
pub fn read_recent_log_tail(app: tauri::AppHandle) -> Result<String, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|error| format!("log directory unavailable: {error}"))?;
    let path = log_dir.join("snow-devil.log");

    let mut file = match std::fs::File::open(&path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(String::new()),
        Err(error) => return Err(format!("could not open log: {error}")),
    };

    let len = file.metadata().map_err(|error| error.to_string())?.len();
    if len > MAX_LOG_TAIL_BYTES {
        file.seek(SeekFrom::Start(len - MAX_LOG_TAIL_BYTES))
            .map_err(|error| error.to_string())?;
    }

    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostic_contract_has_no_sensitive_fields() {
        let serialized = serde_json::to_string(COUNT_TABLES).unwrap();
        for forbidden in [
            "token",
            "cookie",
            "body",
            "content",
            "repository_name",
            "email",
        ] {
            assert!(!serialized.to_lowercase().contains(forbidden));
        }
    }
}
