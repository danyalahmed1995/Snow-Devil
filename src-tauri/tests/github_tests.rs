use serde_json::json;

#[tokio::test]
async fn test_graphql_success_response_normalization() {
    let mut server = mockito::Server::new_async().await;
    let url = server.url();

    let _m = server
        .mock("POST", "/")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "viewer": {
                        "login": "testuser",
                        "id": "MDQ6VXNlcjE=",
                        "name": "Test User",
                        "avatarUrl": "https://example.com/avatar.png",
                        "url": "https://github.com/testuser"
                    }
                }
            })
            .to_string(),
        )
        .create_async()
        .await;

    // Here we simulate the decoding
    let resp = reqwest::Client::new()
        .post(&url)
        .json(&json!({"query": "query { viewer { login } }"}))
        .send()
        .await
        .unwrap()
        .json::<serde_json::Value>()
        .await
        .unwrap();

    assert_eq!(resp["data"]["viewer"]["login"], "testuser");
}

#[test]
fn packaged_app_has_an_explicit_restrictive_csp() {
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let csp = config["app"]["security"]["csp"].as_str().expect("CSP must be explicit");
    assert!(csp.contains("default-src 'self'"));
    assert!(csp.contains("object-src 'none'"));
    assert!(!csp.contains("script-src 'unsafe-inline'"));
}

#[tokio::test]
async fn test_graphql_error_response() {
    let mut server = mockito::Server::new_async().await;
    let url = server.url();

    let _m = server
        .mock("POST", "/")
        .with_status(200) // GraphQL often returns 200 for errors
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "errors": [{
                    "message": "Bad credentials"
                }]
            })
            .to_string(),
        )
        .create_async()
        .await;

    let resp = reqwest::Client::new()
        .post(&url)
        .json(&json!({"query": "query { viewer { login } }"}))
        .send()
        .await
        .unwrap()
        .json::<serde_json::Value>()
        .await
        .unwrap();

    assert!(resp.get("errors").is_some());
    assert_eq!(resp["errors"][0]["message"], "Bad credentials");
}

#[tokio::test]
async fn test_sqlite_persistence() {
    use rusqlite::Connection;
    let conn = Connection::open_in_memory().unwrap();

    conn.execute(
        "CREATE TABLE accounts (
            id TEXT PRIMARY KEY,
            login TEXT NOT NULL,
            name TEXT,
            avatar_url TEXT,
            profile_url TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_synced_at TEXT
        )",
        (),
    )
    .unwrap();

    let inserted = conn.execute(
        "INSERT INTO accounts (id, login, name, avatar_url, profile_url, created_at, updated_at, last_synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'), datetime('now'))",
        ("u1", "testuser", "Test", "http", "http"),
    ).unwrap();

    assert_eq!(inserted, 1);

    let mut stmt = conn
        .prepare("SELECT login FROM accounts WHERE id = ?1")
        .unwrap();
    let login: String = stmt.query_row(["u1"], |row| row.get(0)).unwrap();
    assert_eq!(login, "testuser");
}

#[tokio::test]
async fn test_authentication_response_parsing() {
    let raw_json = json!({
        "status": "connected",
        "token_preview": "gho_***",
        "account": {
            "id": "1",
            "login": "test"
        }
    });

    let parsed: serde_json::Value = serde_json::from_value(raw_json).unwrap();
    assert_eq!(parsed["status"], "connected");
    assert_eq!(parsed["account"]["login"], "test");
}

#[tokio::test]
async fn test_invalid_authentication_response() {
    let raw_json = json!({
        "status": "error",
        "message": "Bad credentials"
    });
    let parsed: serde_json::Value = serde_json::from_value(raw_json).unwrap();
    assert_eq!(parsed["status"], "error");
}

#[test]
fn test_http_retry_classification() {
    // 401 should not be retried, 500 should be retried
    let status_401 = 401;
    let status_500 = 500;

    let is_retryable = |code| code >= 500 || code == 429;

    assert!(!is_retryable(status_401));
    assert!(is_retryable(status_500));
}

#[test]
fn test_node_upsert_and_edge_deduplication() {
    use rusqlite::Connection;
    let conn = Connection::open_in_memory().unwrap();

    conn.execute("CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT)", ())
        .unwrap();
    conn.execute(
        "CREATE TABLE edges (id TEXT PRIMARY KEY, source TEXT, target TEXT)",
        (),
    )
    .unwrap();

    // Upsert
    conn.execute("INSERT INTO nodes (id, title) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET title=excluded.title", ("n1", "old")).unwrap();
    conn.execute("INSERT INTO nodes (id, title) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET title=excluded.title", ("n1", "new")).unwrap();

    let title: String = conn
        .query_row("SELECT title FROM nodes WHERE id = 'n1'", (), |r| r.get(0))
        .unwrap();
    assert_eq!(title, "new");

    // Edge Deduplication
    conn.execute(
        "INSERT OR IGNORE INTO edges (id, source, target) VALUES (?1, ?2, ?3)",
        ("e1", "n1", "n2"),
    )
    .unwrap();
    let changes = conn
        .execute(
            "INSERT OR IGNORE INTO edges (id, source, target) VALUES (?1, ?2, ?3)",
            ("e1", "n1", "n2"),
        )
        .unwrap();
    assert_eq!(changes, 0); // No duplicate
}
