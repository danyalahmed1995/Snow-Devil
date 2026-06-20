use crate::auth::secure_store::get_token;
use crate::db::init_db;
use crate::github::graphql::{get_viewer, get_viewer_repos};
use std::error::Error;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

pub async fn start_initial_sync(
    app: AppHandle,
    app_dir: PathBuf,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No GitHub token found")?;

    // 1. Fetch authenticated user (Viewer)
    let viewer = get_viewer(&token).await?;

    // 2. Fetch recent repositories
    let repos = get_viewer_repos(&token, 50).await?;

    // 3. Save to DB
    {
        let mut conn = init_db(app_dir)?;
        let tx = conn.transaction()?;

        {
            // Save viewer node
            let mut stmt = tx.prepare("
                INSERT INTO nodes (id, github_node_id, node_type, title, url, created_at, updated_at, synced_at)
                VALUES (?1, ?2, 'user', ?3, ?4, datetime('now'), datetime('now'), datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    url=excluded.url,
                    updated_at=excluded.updated_at,
                    synced_at=excluded.synced_at
            ")?;
            stmt.execute((&viewer.login, &viewer.id, &viewer.login, &viewer.url))?;

            // Link account
            let mut stmt_acc = tx.prepare("
                INSERT INTO accounts (id, login, name, avatar_url, profile_url, created_at, updated_at, last_synced_at)
                VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'), datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    avatar_url=excluded.avatar_url,
                    updated_at=excluded.updated_at,
                    last_synced_at=excluded.last_synced_at
            ")?;
            stmt_acc.execute((
                &viewer.id,
                &viewer.login,
                viewer.name.as_deref().unwrap_or(""),
                &viewer.avatar_url,
                &viewer.url,
            ))?;

            // Save repos
            let mut stmt_repo = tx.prepare("
                INSERT INTO nodes (id, github_node_id, node_type, title, url, created_at, updated_at, synced_at)
                VALUES (?1, ?2, 'repository', ?3, ?4, datetime('now'), ?5, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    url=excluded.url,
                    updated_at=excluded.updated_at,
                    synced_at=excluded.synced_at
            ")?;

            let mut stmt_edge = tx.prepare("
                INSERT INTO edges (id, source_node_id, target_node_id, edge_type, created_at, updated_at)
                VALUES (?1, ?2, ?3, 'OWNS', datetime('now'), datetime('now'))
                ON CONFLICT(id) DO NOTHING
            ")?;

            for repo in repos {
                stmt_repo.execute((
                    &repo.name_with_owner,
                    &repo.id,
                    &repo.name_with_owner,
                    &repo.url,
                    &repo.updated_at,
                ))?;

                let edge_id = format!("{}_OWNS_{}", viewer.login, repo.name_with_owner);
                stmt_edge.execute((&edge_id, &viewer.login, &repo.name_with_owner))?;
            }
        }

        tx.commit()?;
    }

    // Emit progress event
    let _ = app.emit("sync-complete", ());

    Ok(())
}
