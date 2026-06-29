use crate::db::init_db;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct DbNode {
    pub id: String,
    pub node_type: String,
    pub title: String,
    pub url: String,
}

#[derive(Serialize)]
pub struct DbEdge {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub edge_type: String,
}

#[derive(Serialize)]
pub struct GraphData {
    pub nodes: Vec<DbNode>,
    pub edges: Vec<DbEdge>,
}

#[tauri::command]
pub fn get_evidence_graph(
    state: tauri::State<'_, crate::db::AppState>,
    root_id: Option<String>,
    limit: Option<usize>,
) -> Result<GraphData, String> {
    let guard = state
        .db_conn
        .lock()
        .map_err(|_| "graph database lock failed".to_string())?;
    let conn = guard
        .as_ref()
        .ok_or_else(|| "graph database unavailable".to_string())?;
    let bounded = limit.unwrap_or(120).clamp(1, 200) as i64;
    let mut nodes = Vec::new();
    if let Some(root) = root_id.filter(|value| !value.is_empty()) {
        let mut statement = conn.prepare("WITH RECURSIVE connected(id,depth) AS (SELECT ?1,0 UNION SELECT CASE WHEN e.source_node_id=c.id THEN e.target_node_id ELSE e.source_node_id END,c.depth+1 FROM edges e JOIN connected c ON (e.source_node_id=c.id OR e.target_node_id=c.id) WHERE c.depth<3) SELECT DISTINCT n.id,n.node_type,n.title,COALESCE(n.url,'') FROM nodes n JOIN connected c ON c.id=n.id LIMIT ?2").map_err(|error| error.to_string())?;
        let values = statement
            .query_map(rusqlite::params![root, bounded], |row| {
                Ok(DbNode {
                    id: row.get(0)?,
                    node_type: row.get(1)?,
                    title: row.get(2)?,
                    url: row.get(3)?,
                })
            })
            .map_err(|error| error.to_string())?;
        for value in values {
            nodes.push(value.map_err(|error| error.to_string())?);
        }
    } else {
        let mut statement=conn.prepare("SELECT id,node_type,title,COALESCE(url,'') FROM nodes ORDER BY rowid DESC LIMIT ?1").map_err(|error|error.to_string())?;
        let values = statement
            .query_map([bounded], |row| {
                Ok(DbNode {
                    id: row.get(0)?,
                    node_type: row.get(1)?,
                    title: row.get(2)?,
                    url: row.get(3)?,
                })
            })
            .map_err(|error| error.to_string())?;
        for value in values {
            nodes.push(value.map_err(|error| error.to_string())?);
        }
    }
    let ids: std::collections::HashSet<&str> = nodes.iter().map(|node| node.id.as_str()).collect();
    let mut statement = conn
        .prepare("SELECT id,source_node_id,target_node_id,edge_type FROM edges LIMIT 2000")
        .map_err(|error| error.to_string())?;
    let values = statement
        .query_map([], |row| {
            Ok(DbEdge {
                id: row.get(0)?,
                source_id: row.get(1)?,
                target_id: row.get(2)?,
                edge_type: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut edges = Vec::new();
    for value in values {
        let edge = value.map_err(|error| error.to_string())?;
        if ids.contains(edge.source_id.as_str()) && ids.contains(edge.target_id.as_str()) {
            edges.push(edge);
        }
    }
    Ok(GraphData { nodes, edges })
}

#[tauri::command]
pub async fn get_graph_data(app: AppHandle) -> Result<GraphData, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let conn = init_db(app_dir).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, node_type, title, url FROM nodes")
        .map_err(|e| e.to_string())?;
    let node_iter = stmt
        .query_map([], |row| {
            Ok(DbNode {
                id: row.get(0)?,
                node_type: row.get(1)?,
                title: row.get(2)?,
                url: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut nodes = Vec::new();
    for node in node_iter {
        nodes.push(node.map_err(|e| e.to_string())?);
    }

    let mut stmt_edges = conn
        .prepare("SELECT id, source_node_id, target_node_id, edge_type FROM edges")
        .map_err(|e| e.to_string())?;
    let edge_iter = stmt_edges
        .query_map([], |row| {
            Ok(DbEdge {
                id: row.get(0)?,
                source_id: row.get(1)?,
                target_id: row.get(2)?,
                edge_type: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut edges = Vec::new();
    for edge in edge_iter {
        edges.push(edge.map_err(|e| e.to_string())?);
    }

    Ok(GraphData { nodes, edges })
}

#[derive(Serialize)]
pub struct RepoCard {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub updated_at: String,
    pub url: String,
}

#[tauri::command]
pub async fn get_recent_repositories(app: AppHandle) -> Result<Vec<RepoCard>, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let conn = init_db(app_dir).map_err(|e| e.to_string())?;

    // Query recent repositories
    let mut stmt = conn.prepare(
        "SELECT id, title, subtitle, updated_at, url FROM nodes WHERE node_type = 'repository' ORDER BY updated_at DESC LIMIT 20"
    ).map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([], |row| {
            Ok(RepoCard {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2).unwrap_or(None),
                updated_at: row.get(3)?,
                url: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut repos = Vec::new();
    for repo in iter {
        repos.push(repo.map_err(|e| e.to_string())?);
    }

    Ok(repos)
}

#[tauri::command]
pub async fn get_all_repositories(app: AppHandle) -> Result<Vec<RepoCard>, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let conn = init_db(app_dir).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, title, subtitle, updated_at, url FROM nodes WHERE node_type = 'repository' ORDER BY updated_at DESC"
    ).map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([], |row| {
            Ok(RepoCard {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2).unwrap_or(None),
                updated_at: row.get(3)?,
                url: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut repos = Vec::new();
    for repo in iter {
        repos.push(repo.map_err(|e| e.to_string())?);
    }

    Ok(repos)
}
