pub mod migrations;

use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub db_conn: Mutex<Option<Connection>>,
}

pub fn init_db(app_dir: PathBuf) -> Result<Connection> {
    let db_path = app_dir.join("app.db");
    let mut conn = Connection::open(&db_path)?;

    // Setup pragmas for performance
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA cache_size = -64000;", // 64MB cache
    )?;

    migrations::run_migrations(&mut conn)?;

    Ok(conn)
}
