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

        tx.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (2)",
            [],
        )?;
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

        tx.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (3)",
            [],
        )?;
    }
    if current_version < 4 {
        tx.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS analytics_records (
                account_login TEXT NOT NULL,
                repository_id TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_id TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                PRIMARY KEY (account_login, source_type, source_id)
            );
            CREATE TABLE IF NOT EXISTS analytics_sync_state (
                account_login TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                current_stage TEXT,
                current_repository TEXT,
                completed_repositories_json TEXT NOT NULL DEFAULT '[]',
                failed_repositories_json TEXT NOT NULL DEFAULT '[]',
                continuation_json TEXT,
                last_attempted_at TEXT,
                last_successful_at TEXT,
                retention_start TEXT,
                coverage_start TEXT,
                coverage_end TEXT,
                counts_json TEXT NOT NULL DEFAULT '{}',
                rate_limit_json TEXT,
                error TEXT,
                settings_fingerprint TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_analytics_records_repo ON analytics_records(account_login, repository_id);
            CREATE INDEX IF NOT EXISTS idx_analytics_records_updated ON analytics_records(account_login, updated_at);
            ",
        )?;
        tx.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (4)",
            [],
        )?;
    }
    if current_version < 5 {
        // Legacy repository-history records used number-only subject/event primary keys.
        // Same-number entities could already have overwritten one another, so those rows
        // cannot be migrated truthfully. Drop only ambiguous rows; the next scoped sync
        // rebuilds them with repository-qualified canonical identities.
        tx.execute_batch(
            "
            DELETE FROM simulator_events
            WHERE subject_id GLOB 'pull_request-[0-9]*'
               OR subject_id GLOB 'pr-[0-9]*'
               OR subject_id GLOB 'issue-[0-9]*';
            DELETE FROM simulator_entities
            WHERE subject_id GLOB 'pull_request-[0-9]*'
               OR subject_id GLOB 'pr-[0-9]*'
               OR subject_id GLOB 'issue-[0-9]*';
            ",
        )?;
        tx.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (5)",
            [],
        )?;
    }

    if current_version < 6 {
        tx.execute_batch(
            "
            INSERT OR REPLACE INTO analytics_records (account_login, repository_id, source_type, source_id, updated_at, payload_json)
            SELECT account_login, repository_id, source_type, repository_id || ':' || json_extract(payload_json, '$.id'), updated_at, payload_json
            FROM analytics_records
            WHERE source_type = 'workflow_run' AND source_id LIKE 'WFR_%';

            DELETE FROM analytics_records 
            WHERE source_type = 'workflow_run' AND source_id LIKE 'WFR_%';
            ",
        )?;
        tx.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (6)",
            [],
        )?;
    }
    if current_version < 7 {
        tx.execute_batch(
            "
            CREATE TEMP TABLE new_workflow_runs AS
            SELECT 
                account_login, 
                repository_id, 
                source_type,
                COALESCE(json_extract(payload_json, '$.repository.id'), LOWER(repository_id)) || ':' || json_extract(payload_json, '$.id') as canonical_id,
                updated_at,
                payload_json
            FROM analytics_records
            WHERE source_type = 'workflow_run' AND json_extract(payload_json, '$.id') IS NOT NULL
            ORDER BY updated_at ASC;

            DELETE FROM analytics_records WHERE source_type = 'workflow_run';

            INSERT OR REPLACE INTO analytics_records (account_login, repository_id, source_type, source_id, updated_at, payload_json)
            SELECT account_login, repository_id, source_type, canonical_id, updated_at, payload_json
            FROM new_workflow_runs;

            DROP TABLE new_workflow_runs;
            ",
        )?;
        tx.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (7)",
            [],
        )?;
    }
    if current_version < 8 {
        tx.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS architecture_snapshots (
                repository_id TEXT NOT NULL,
                base_commit_sha TEXT NOT NULL,
                algorithm_version INTEGER NOT NULL,
                config_hash TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL,
                generated_at TEXT NOT NULL,
                last_accessed_at TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                payload_bytes INTEGER NOT NULL,
                PRIMARY KEY (repository_id, base_commit_sha, algorithm_version, config_hash)
            );
            CREATE TABLE IF NOT EXISTS pr_architecture_impacts (
                repository_id TEXT NOT NULL,
                pull_request_number INTEGER NOT NULL,
                base_sha TEXT NOT NULL,
                head_sha TEXT NOT NULL,
                snapshot_sha TEXT NOT NULL,
                algorithm_version INTEGER NOT NULL,
                generated_at TEXT NOT NULL,
                last_accessed_at TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                payload_bytes INTEGER NOT NULL,
                PRIMARY KEY (repository_id, pull_request_number, base_sha, head_sha, snapshot_sha, algorithm_version)
            );
            CREATE INDEX IF NOT EXISTS idx_architecture_snapshots_access ON architecture_snapshots(repository_id, last_accessed_at DESC);
            CREATE INDEX IF NOT EXISTS idx_pr_architecture_impacts_access ON pr_architecture_impacts(repository_id, pull_request_number, last_accessed_at DESC);
            ",
        )?;
        tx.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (8)",
            [],
        )?;
    }

    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::run_migrations;
    use rusqlite::Connection;

    #[test]
    fn v5_drops_only_ambiguous_number_only_simulator_rows() {
        let mut connection = Connection::open_in_memory().unwrap();
        run_migrations(&mut connection).unwrap();
        connection
            .execute("DELETE FROM schema_version", [])
            .unwrap();
        connection
            .execute("INSERT INTO schema_version (version) VALUES (4)", [])
            .unwrap();
        for (id, subject_id) in [
            ("ambiguous", "pull_request-2"),
            ("canonical", "pull-request:owner/repo:2"),
        ] {
            connection.execute(
                "INSERT INTO simulator_entities (id, repository_id, subject_id, subject_type, title, number, created_at, updated_at) VALUES (?1, 'owner/repo', ?2, 'pull_request', ?1, 2, '2026-01-01', '2026-01-01')",
                (id, subject_id),
            ).unwrap();
            connection.execute(
                "INSERT INTO simulator_events (id, repository_id, subject_id, event_type, timestamp, source, completeness) VALUES (?1, 'owner/repo', ?2, 'opened', '2026-01-01', 'fixture', 'complete')",
                (format!("event-{id}"), subject_id),
            ).unwrap();
        }

        run_migrations(&mut connection).unwrap();
        let ambiguous: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM simulator_entities WHERE id = 'ambiguous'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let canonical: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM simulator_entities WHERE id = 'canonical'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let canonical_event: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM simulator_events WHERE id = 'event-canonical'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(ambiguous, 0);
        assert_eq!(canonical, 1);
        assert_eq!(canonical_event, 1);
    }

    #[test]
    fn v8_creates_versioned_architecture_caches() {
        let mut connection = Connection::open_in_memory().unwrap();
        run_migrations(&mut connection).unwrap();
        let snapshot_table: i64 = connection.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'architecture_snapshots'", [], |row| row.get(0)).unwrap();
        let impact_table: i64 = connection.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'pr_architecture_impacts'", [], |row| row.get(0)).unwrap();
        let version: i64 = connection
            .query_row("SELECT MAX(version) FROM schema_version", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!((snapshot_table, impact_table, version), (1, 1, 8));
    }
}
