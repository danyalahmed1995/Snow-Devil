use rusqlite::{Connection, Result};

pub fn run_migrations(conn: &mut Connection) -> Result<()> {
    let tx = conn.transaction()?;

    // Create a simple table to track migration version
    tx.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)",
        [],
    )?;

    let current_version: i32 = tx.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        [],
        |row| row.get(0),
    )?;

    if current_version < 1 {
        // V1 Schema
        tx.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                github_user_id INTEGER,
                login TEXT NOT NULL,
                name TEXT,
                avatar_url TEXT,
                profile_url TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_synced_at TEXT
            );

            CREATE TABLE IF NOT EXISTS nodes (
                id TEXT PRIMARY KEY,
                github_node_id TEXT,
                node_type TEXT NOT NULL,
                title TEXT NOT NULL,
                subtitle TEXT,
                state TEXT,
                url TEXT,
                owner_login TEXT,
                repository_name TEXT,
                number INTEGER,
                payload_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                synced_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS edges (
                id TEXT PRIMARY KEY,
                source_node_id TEXT NOT NULL,
                target_node_id TEXT NOT NULL,
                edge_type TEXT NOT NULL,
                payload_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                github_notification_id TEXT NOT NULL,
                reason TEXT NOT NULL,
                subject_type TEXT NOT NULL,
                subject_title TEXT NOT NULL,
                subject_url TEXT,
                repository_full_name TEXT NOT NULL,
                is_unread INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL,
                last_read_at TEXT,
                payload_json TEXT
            );

            CREATE TABLE IF NOT EXISTS timeline_events (
                id TEXT PRIMARY KEY,
                subject_node_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                actor_node_id TEXT,
                body TEXT,
                created_at TEXT NOT NULL,
                payload_json TEXT
            );

            CREATE TABLE IF NOT EXISTS sync_state (
                scope TEXT PRIMARY KEY,
                cursor TEXT,
                etag TEXT,
                last_modified TEXT,
                last_success_at TEXT,
                last_error TEXT
            );

            CREATE TABLE IF NOT EXISTS tabs (
                id TEXT PRIMARY KEY,
                entity_node_id TEXT,
                title TEXT NOT NULL,
                position INTEGER NOT NULL,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS navigation_history (
                id TEXT PRIMARY KEY,
                node_id TEXT NOT NULL,
                visited_at TEXT NOT NULL,
                history_index INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS saved_views (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                filter_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            -- Indexes
            CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(node_type);
            CREATE INDEX IF NOT EXISTS idx_nodes_github_id ON nodes(github_node_id);
            CREATE INDEX IF NOT EXISTS idx_nodes_repo ON nodes(repository_name);
            CREATE INDEX IF NOT EXISTS idx_nodes_owner ON nodes(owner_login);
            CREATE INDEX IF NOT EXISTS idx_nodes_updated ON nodes(updated_at);
            
            CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_node_id);
            CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_node_id);
            CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(edge_type);
            
            CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_unread);
            ",
        )?;

        tx.execute("INSERT INTO schema_version (version) VALUES (1)", [])?;
    }
    if current_version < 2 {
        // V2 Schema - Simulator
        tx.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS simulator_entities (
                id TEXT PRIMARY KEY,
                repository_id TEXT NOT NULL,
                subject_id TEXT NOT NULL,
                subject_type TEXT NOT NULL,
                title TEXT NOT NULL,
                number INTEGER,
                payload_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS simulator_events (
                id TEXT PRIMARY KEY,
                repository_id TEXT NOT NULL,
                subject_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                actor_json TEXT,
                metadata_json TEXT,
                source TEXT NOT NULL,
                completeness TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS simulator_sync_state (
                id TEXT PRIMARY KEY,
                scope TEXT NOT NULL,
                cursor TEXT,
                last_synced_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_simulator_events_repo ON simulator_events(repository_id);
            CREATE INDEX IF NOT EXISTS idx_simulator_events_subject ON simulator_events(subject_id);
            CREATE INDEX IF NOT EXISTS idx_simulator_events_timestamp ON simulator_events(timestamp);
            ",
        )?;

        tx.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (2)", [])?;
    }
    if current_version < 3 {
        tx.execute_batch(
            "
            ALTER TABLE simulator_events ADD COLUMN repository_name TEXT;
            ALTER TABLE simulator_events ADD COLUMN repository_owner TEXT;
            ALTER TABLE simulator_events ADD COLUMN subject_type TEXT;
            ALTER TABLE simulator_events ADD COLUMN subject_number INTEGER;
            ALTER TABLE simulator_events ADD COLUMN subject_title TEXT;
            ALTER TABLE simulator_events ADD COLUMN inclusion_reason TEXT;
            ",
        )?;

        tx.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (3)", [])?;
    }

    tx.commit()?;
    Ok(())
}
