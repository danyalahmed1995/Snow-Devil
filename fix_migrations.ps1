$content = Get-Content -Path src-tauri\src\db\migrations.rs -Raw
$content = $content -replace "    tx\.commit\(\)\?\;", "    if current_version < 7 {
        tx.execute_batch("
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
        ")?;
        tx.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (7)",
            [],
        )?;
    }

    tx.commit()?;"
Set-Content -Path src-tauri\src\db\migrations.rs -Value $content
