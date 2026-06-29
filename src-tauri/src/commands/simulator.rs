use crate::db::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct SimulatorEntity {
    pub id: String,
    pub repository_id: String,
    pub subject_id: String,
    pub subject_type: String,
    pub title: String,
    pub number: Option<i64>,
    pub payload_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SimulatorEvent {
    pub id: String,
    pub repository_id: String,
    pub repository_name: Option<String>,
    pub repository_owner: Option<String>,
    pub subject_id: String,
    pub subject_type: Option<String>,
    pub subject_number: Option<i64>,
    pub subject_title: Option<String>,
    pub event_type: String,
    pub timestamp: String,
    pub actor_json: Option<String>,
    pub metadata_json: Option<String>,
    pub source: String,
    pub completeness: String,
    pub inclusion_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncState {
    pub id: String,
    pub scope: String,
    pub cursor: Option<String>,
    pub last_synced_at: String,
}

#[tauri::command]
pub fn save_simulator_entities(
    state: State<'_, AppState>,
    entities: Vec<SimulatorEntity>,
) -> Result<(), String> {
    let mut conn_guard = state.db_conn.lock().unwrap();
    let conn = conn_guard.as_mut().ok_or("Database connection not found")?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO simulator_entities (id, repository_id, subject_id, subject_type, title, number, payload_json, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                payload_json = excluded.payload_json,
                updated_at = excluded.updated_at
            "
        ).map_err(|e| e.to_string())?;

        for e in entities {
            stmt.execute(rusqlite::params![
                e.id,
                e.repository_id,
                e.subject_id,
                e.subject_type,
                e.title,
                e.number,
                e.payload_json,
                e.created_at,
                e.updated_at
            ])
            .map_err(|err| err.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn save_simulator_events(
    state: State<'_, AppState>,
    events: Vec<SimulatorEvent>,
) -> Result<(), String> {
    let mut conn_guard = state.db_conn.lock().unwrap();
    let conn = conn_guard.as_mut().ok_or("Database connection not found")?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO simulator_events (id, repository_id, repository_name, repository_owner, subject_id, subject_type, subject_number, subject_title, event_type, timestamp, actor_json, metadata_json, source, completeness, inclusion_reason) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
             ON CONFLICT(id) DO UPDATE SET
                repository_name = excluded.repository_name,
                repository_owner = excluded.repository_owner,
                subject_type = excluded.subject_type,
                subject_number = excluded.subject_number,
                subject_title = excluded.subject_title,
                timestamp = excluded.timestamp,
                actor_json = excluded.actor_json,
                metadata_json = excluded.metadata_json,
                completeness = excluded.completeness,
                inclusion_reason = excluded.inclusion_reason
            "
        ).map_err(|e| e.to_string())?;

        for e in events {
            stmt.execute(rusqlite::params![
                e.id,
                e.repository_id,
                e.repository_name,
                e.repository_owner,
                e.subject_id,
                e.subject_type,
                e.subject_number,
                e.subject_title,
                e.event_type,
                e.timestamp,
                e.actor_json,
                e.metadata_json,
                e.source,
                e.completeness,
                e.inclusion_reason
            ])
            .map_err(|err| err.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_simulator_events(
    state: State<'_, AppState>,
    repository_id: Option<String>,
) -> Result<Vec<SimulatorEvent>, String> {
    let mut conn_guard = state.db_conn.lock().unwrap();
    let conn = conn_guard.as_mut().ok_or("Database connection not found")?;

    let mut query = String::from("SELECT id, repository_id, repository_name, repository_owner, subject_id, subject_type, subject_number, subject_title, event_type, timestamp, actor_json, metadata_json, source, completeness, inclusion_reason FROM simulator_events");
    let mut params: Vec<String> = vec![];

    if let Some(repo_id) = repository_id {
        query.push_str(" WHERE repository_id = ?1");
        params.push(repo_id);
    }
    query.push_str(" ORDER BY timestamp ASC");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let mut events = Vec::new();
    if !params.is_empty() {
        let rows = stmt
            .query_map(rusqlite::params![params[0]], |row| {
                Ok(SimulatorEvent {
                    id: row.get(0)?,
                    repository_id: row.get(1)?,
                    repository_name: row.get(2)?,
                    repository_owner: row.get(3)?,
                    subject_id: row.get(4)?,
                    subject_type: row.get(5)?,
                    subject_number: row.get(6)?,
                    subject_title: row.get(7)?,
                    event_type: row.get(8)?,
                    timestamp: row.get(9)?,
                    actor_json: row.get(10)?,
                    metadata_json: row.get(11)?,
                    source: row.get(12)?,
                    completeness: row.get(13)?,
                    inclusion_reason: row.get(14)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            events.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        let rows = stmt
            .query_map([], |row| {
                Ok(SimulatorEvent {
                    id: row.get(0)?,
                    repository_id: row.get(1)?,
                    repository_name: row.get(2)?,
                    repository_owner: row.get(3)?,
                    subject_id: row.get(4)?,
                    subject_type: row.get(5)?,
                    subject_number: row.get(6)?,
                    subject_title: row.get(7)?,
                    event_type: row.get(8)?,
                    timestamp: row.get(9)?,
                    actor_json: row.get(10)?,
                    metadata_json: row.get(11)?,
                    source: row.get(12)?,
                    completeness: row.get(13)?,
                    inclusion_reason: row.get(14)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            events.push(row.map_err(|e| e.to_string())?);
        }
    };

    Ok(events)
}

#[tauri::command]
pub fn get_simulator_entities(
    state: State<'_, AppState>,
    repository_id: Option<String>,
) -> Result<Vec<SimulatorEntity>, String> {
    let mut conn_guard = state.db_conn.lock().unwrap();
    let mut query = String::from("SELECT id, repository_id, subject_id, subject_type, title, number, payload_json, created_at, updated_at FROM simulator_entities");
    let mut params: Vec<String> = vec![];

    if let Some(repo_id) = repository_id {
        query.push_str(" WHERE repository_id = ?1");
        params.push(repo_id);
    }

    let conn = conn_guard.as_mut().ok_or("Database connection not found")?;
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let mut entities = Vec::new();
    if !params.is_empty() {
        let rows = stmt
            .query_map(rusqlite::params![params[0]], |row| {
                Ok(SimulatorEntity {
                    id: row.get(0)?,
                    repository_id: row.get(1)?,
                    subject_id: row.get(2)?,
                    subject_type: row.get(3)?,
                    title: row.get(4)?,
                    number: row.get(5)?,
                    payload_json: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            entities.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        let rows = stmt
            .query_map([], |row| {
                Ok(SimulatorEntity {
                    id: row.get(0)?,
                    repository_id: row.get(1)?,
                    subject_id: row.get(2)?,
                    subject_type: row.get(3)?,
                    title: row.get(4)?,
                    number: row.get(5)?,
                    payload_json: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            entities.push(row.map_err(|e| e.to_string())?);
        }
    };

    Ok(entities)
}

#[tauri::command]
pub fn get_simulator_sync_state(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<SyncState>, String> {
    let mut conn_guard = state.db_conn.lock().unwrap();
    let conn = conn_guard.as_mut().ok_or("Database connection not found")?;

    let mut stmt = conn
        .prepare("SELECT id, scope, cursor, last_synced_at FROM simulator_sync_state WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map(rusqlite::params![id], |row| {
            Ok(SyncState {
                id: row.get(0)?,
                scope: row.get(1)?,
                cursor: row.get(2)?,
                last_synced_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next() {
        Ok(Some(row.map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn save_simulator_sync_state(
    state: State<'_, AppState>,
    id: String,
    scope: String,
    cursor: Option<String>,
    last_synced_at: String,
) -> Result<(), String> {
    let mut conn_guard = state.db_conn.lock().unwrap();
    let conn = conn_guard.as_mut().ok_or("Database connection not found")?;

    conn.execute(
        "INSERT INTO simulator_sync_state (id, scope, cursor, last_synced_at) 
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET
            cursor = excluded.cursor,
            last_synced_at = excluded.last_synced_at
        ",
        rusqlite::params![id, scope, cursor, last_synced_at],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
