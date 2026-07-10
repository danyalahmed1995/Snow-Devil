use crate::{auth::secure_store::get_token, db::AppState};
use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use tauri::State;

const MAX_PAYLOAD_BYTES: usize = 8 * 1024 * 1024;
const SNAPSHOTS_PER_REPOSITORY: i64 = 3;
const IMPACTS_PER_PULL_REQUEST: i64 = 5;
const MAX_TREE_ENTRIES: usize = 30_000;
const MAX_CONTENT_FILES: usize = 360;
const CONTENT_BATCH_SIZE: usize = 60;
const MAX_SOURCE_BYTES: u64 = 512_000;
const EXCLUDED_PREFIXES: &[&str] = &[
    "node_modules/",
    "vendor/",
    "dist/",
    "build/",
    "target/",
    "coverage/",
    ".next/",
    "out/",
    "bin/",
    "obj/",
    "generated/",
    "third_party/",
    "external/",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchitectureTreeFile {
    pub path: String,
    pub size: Option<u64>,
    pub sha: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryArchitectureInput {
    pub repository_id: String,
    pub base_commit_sha: String,
    pub truncated: bool,
    pub files: Vec<ArchitectureTreeFile>,
    pub contents: HashMap<String, String>,
    pub config: Option<Value>,
    pub config_hash: Option<String>,
    pub request_count: usize,
    pub excluded_paths: Vec<String>,
    pub warnings: Vec<String>,
    pub stages: Vec<&'static str>,
}

fn is_excluded(path: &str) -> bool {
    EXCLUDED_PREFIXES
        .iter()
        .any(|prefix| path == &prefix[..prefix.len() - 1] || path.starts_with(prefix))
}

fn is_structural(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    matches!(
        name,
        ".snowdevil-architecture.yml"
            | "architecture.yml"
            | "package.json"
            | "pnpm-workspace.yaml"
            | "Cargo.toml"
            | "pyproject.toml"
            | "setup.py"
            | "setup.cfg"
            | "go.mod"
            | "go.work"
            | "pom.xml"
            | "settings.gradle"
            | "settings.gradle.kts"
            | "build.gradle"
            | "build.gradle.kts"
            | "CMakeLists.txt"
            | "Makefile"
            | "meson.build"
            | "BUILD"
            | "BUILD.bazel"
            | "CODEOWNERS"
    ) || path == ".snowdevil/architecture.yml"
        || name.ends_with(".csproj")
        || name.ends_with(".sln")
        || name.ends_with(".cmake")
}

fn is_dependency_source(path: &str) -> bool {
    let extension = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "ts" | "tsx"
            | "js"
            | "jsx"
            | "rs"
            | "py"
            | "go"
            | "java"
            | "kt"
            | "kts"
            | "c"
            | "cc"
            | "cpp"
            | "cxx"
            | "h"
            | "hh"
            | "hpp"
            | "hxx"
    )
}

fn content_candidates(files: &[ArchitectureTreeFile]) -> Vec<String> {
    let mut structural = files
        .iter()
        .filter(|file| is_structural(&file.path))
        .map(|file| file.path.clone())
        .collect::<Vec<_>>();
    structural.sort();
    let mut sources = files
        .iter()
        .filter(|file| {
            is_dependency_source(&file.path) && file.size.unwrap_or(0) <= MAX_SOURCE_BYTES
        })
        .map(|file| file.path.clone())
        .collect::<Vec<_>>();
    sources.sort_by_key(|path| {
        let cpp_priority = matches!(
            path.rsplit('.').next().unwrap_or(""),
            "c" | "cc" | "cpp" | "cxx" | "h" | "hh" | "hpp" | "hxx"
        );
        (!cpp_priority, path.clone())
    });
    let mut seen = HashSet::new();
    structural
        .into_iter()
        .chain(sources)
        .filter(|path| seen.insert(path.clone()))
        .take(MAX_CONTENT_FILES)
        .collect()
}

async fn fetch_content_batch(
    client: &Client,
    token: &str,
    owner: &str,
    name: &str,
    commit_sha: &str,
    paths: &[String],
) -> Result<HashMap<String, String>, String> {
    let declarations = (0..paths.len())
        .map(|index| format!("$e{index}: String!"))
        .collect::<Vec<_>>()
        .join(",");
    let fields = (0..paths.len())
        .map(|index| format!("f{index}: object(expression: $e{index}) {{ ... on Blob {{ text byteSize isBinary }} }}"))
        .collect::<Vec<_>>()
        .join("\n");
    let query = format!("query($owner:String!,$name:String!,{declarations}){{repository(owner:$owner,name:$name){{{fields}}}}}");
    let mut variables = serde_json::Map::new();
    variables.insert("owner".into(), json!(owner));
    variables.insert("name".into(), json!(name));
    for (index, path) in paths.iter().enumerate() {
        variables.insert(format!("e{index}"), json!(format!("{commit_sha}:{path}")));
    }
    let response = client
        .post("https://api.github.com/graphql")
        .bearer_auth(token)
        .header("User-Agent", "snow-devil-architecture")
        .json(&json!({"query": query, "variables": variables}))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    let body: Value = response.json().await.map_err(|error| error.to_string())?;
    if !status.is_success() || body.get("errors").is_some() {
        return Err(format!(
            "GitHub content batch failed ({status}): {}",
            body.get("errors").unwrap_or(&Value::Null)
        ));
    }
    let repository = &body["data"]["repository"];
    let mut result = HashMap::new();
    for (index, path) in paths.iter().enumerate() {
        if repository[format!("f{index}")]["isBinary"].as_bool() == Some(true) {
            continue;
        }
        if let Some(text) = repository[format!("f{index}")]["text"].as_str() {
            result.insert(path.clone(), text.to_string());
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn fetch_repository_architecture_input(
    repository_id: String,
    base_commit_sha: String,
) -> Result<RepositoryArchitectureInput, String> {
    let (owner, name) = repository_id
        .split_once('/')
        .ok_or("Repository identity must use owner/name")?;
    if base_commit_sha.trim().is_empty() || base_commit_sha.contains('/') {
        return Err("A valid base commit SHA is required".into());
    }
    let token = get_token()
        .map_err(|error| error.to_string())?
        .ok_or("authentication_expired")?;
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|error| error.to_string())?;
    let url = format!(
        "https://api.github.com/repos/{owner}/{name}/git/trees/{base_commit_sha}?recursive=1"
    );
    let response = client
        .get(url)
        .bearer_auth(&token)
        .header("User-Agent", "snow-devil-architecture")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    let body: Value = response.json().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("GitHub repository tree failed ({status}): {body}"));
    }
    let github_truncated = body["truncated"].as_bool().unwrap_or(false);
    let mut excluded_paths = Vec::new();
    let mut files = Vec::new();
    for entry in body["tree"].as_array().into_iter().flatten() {
        if entry["type"].as_str() != Some("blob") {
            continue;
        }
        let Some(path) = entry["path"].as_str() else {
            continue;
        };
        if is_excluded(path) {
            if excluded_paths.len() < 100 {
                excluded_paths.push(path.to_string());
            }
            continue;
        }
        files.push(ArchitectureTreeFile {
            path: path.to_string(),
            size: entry["size"].as_u64(),
            sha: entry["sha"].as_str().map(str::to_string),
        });
        if files.len() >= MAX_TREE_ENTRIES {
            break;
        }
    }
    let capped = files.len() >= MAX_TREE_ENTRIES;
    let candidates = content_candidates(&files);
    let mut contents = HashMap::new();
    let mut warnings = Vec::new();
    let mut request_count = 1;
    for batch in candidates.chunks(CONTENT_BATCH_SIZE) {
        request_count += 1;
        match fetch_content_batch(&client, &token, owner, name, &base_commit_sha, batch).await {
            Ok(values) => contents.extend(values),
            Err(error) => warnings.push(error),
        }
    }
    if github_truncated {
        warnings
            .push("GitHub returned a truncated recursive tree; the snapshot is incomplete.".into());
    }
    if capped {
        warnings.push(format!(
            "Repository tree exceeded the {MAX_TREE_ENTRIES} file safety cap."
        ));
    }
    if candidates.len() == MAX_CONTENT_FILES {
        warnings.push(format!(
            "Dependency enrichment was capped at {MAX_CONTENT_FILES} source and structural files."
        ));
    }
    let config_text = contents.get(".snowdevil/architecture.yml");
    let (config, config_hash) = if let Some(text) = config_text {
        match serde_yaml::from_str::<serde_yaml::Value>(text) {
            Ok(value) => (
                serde_json::to_value(value).ok(),
                Some(format!("{:x}", stable_hash(text.as_bytes()))),
            ),
            Err(error) => {
                warnings.push(format!("Invalid .snowdevil/architecture.yml: {error}"));
                (
                    None,
                    Some(format!("invalid-{:x}", stable_hash(text.as_bytes()))),
                )
            }
        }
    } else {
        (None, None)
    };
    Ok(RepositoryArchitectureInput {
        repository_id,
        base_commit_sha,
        truncated: github_truncated || capped,
        files,
        contents,
        config,
        config_hash,
        request_count,
        excluded_paths,
        warnings,
        stages: vec![
            "Fetching repository tree",
            "Discovering project boundaries",
            "Mapping files to components",
            "Analyzing dependencies",
            "Resolving ownership",
        ],
    })
}

fn stable_hash(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn validate_payload(payload: &Value) -> Result<String, String> {
    let json = serde_json::to_string(payload).map_err(|error| error.to_string())?;
    if json.len() > MAX_PAYLOAD_BYTES {
        return Err("Architecture cache payload exceeds the 8 MB safety limit".into());
    }
    Ok(json)
}

#[tauri::command]
pub fn save_architecture_snapshot(
    state: State<'_, AppState>,
    repository_id: String,
    base_commit_sha: String,
    algorithm_version: i64,
    config_hash: Option<String>,
    status: String,
    generated_at: String,
    payload: Value,
) -> Result<(), String> {
    let payload_json = validate_payload(&payload)?;
    let now = Utc::now().to_rfc3339();
    let mut guard = state.db_conn.lock().map_err(|error| error.to_string())?;
    let connection = guard.as_mut().ok_or("Database unavailable")?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction.execute(
        "INSERT OR REPLACE INTO architecture_snapshots (repository_id, base_commit_sha, algorithm_version, config_hash, status, generated_at, last_accessed_at, payload_json, payload_bytes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![repository_id, base_commit_sha, algorithm_version, config_hash.unwrap_or_default(), status, generated_at, now, payload_json, payload_json.len() as i64],
    ).map_err(|error| error.to_string())?;
    transaction.execute(
        "DELETE FROM architecture_snapshots WHERE rowid IN (SELECT rowid FROM architecture_snapshots WHERE repository_id = ?1 ORDER BY last_accessed_at DESC LIMIT -1 OFFSET ?2)",
        rusqlite::params![repository_id, SNAPSHOTS_PER_REPOSITORY],
    ).map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_architecture_snapshot(
    state: State<'_, AppState>,
    repository_id: String,
    base_commit_sha: String,
    algorithm_version: i64,
    config_hash: Option<String>,
) -> Result<Option<Value>, String> {
    let now = Utc::now().to_rfc3339();
    let mut guard = state.db_conn.lock().map_err(|error| error.to_string())?;
    let connection = guard.as_mut().ok_or("Database unavailable")?;
    let value = if let Some(hash) = config_hash.as_deref() {
        connection.query_row(
            "SELECT payload_json FROM architecture_snapshots WHERE repository_id = ?1 AND base_commit_sha = ?2 AND algorithm_version = ?3 AND config_hash = ?4",
            rusqlite::params![repository_id, base_commit_sha, algorithm_version, hash],
            |row| row.get::<_, String>(0),
        ).optional()
    } else {
        connection.query_row(
            "SELECT payload_json FROM architecture_snapshots WHERE repository_id = ?1 AND base_commit_sha = ?2 AND algorithm_version = ?3 ORDER BY last_accessed_at DESC LIMIT 1",
            rusqlite::params![repository_id, base_commit_sha, algorithm_version],
            |row| row.get::<_, String>(0),
        ).optional()
    }.map_err(|error| error.to_string())?;
    if value.is_some() {
        if let Some(hash) = config_hash.as_deref() {
            connection.execute("UPDATE architecture_snapshots SET last_accessed_at = ?5 WHERE repository_id = ?1 AND base_commit_sha = ?2 AND algorithm_version = ?3 AND config_hash = ?4", rusqlite::params![repository_id, base_commit_sha, algorithm_version, hash, now]).map_err(|error| error.to_string())?;
        } else {
            connection.execute("UPDATE architecture_snapshots SET last_accessed_at = ?4 WHERE repository_id = ?1 AND base_commit_sha = ?2 AND algorithm_version = ?3", rusqlite::params![repository_id, base_commit_sha, algorithm_version, now]).map_err(|error| error.to_string())?;
        }
    }
    value
        .map(|json| serde_json::from_str(&json).map_err(|error| error.to_string()))
        .transpose()
}

#[tauri::command]
pub fn delete_architecture_snapshot(
    state: State<'_, AppState>,
    repository_id: String,
    base_commit_sha: String,
    algorithm_version: i64,
) -> Result<(), String> {
    let mut guard = state.db_conn.lock().map_err(|error| error.to_string())?;
    let connection = guard.as_mut().ok_or("Database unavailable")?;
    connection
        .execute(
            "DELETE FROM architecture_snapshots WHERE repository_id = ?1 AND base_commit_sha = ?2 AND algorithm_version = ?3",
            rusqlite::params![repository_id, base_commit_sha, algorithm_version],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_pr_architecture_impact(
    state: State<'_, AppState>,
    repository_id: String,
    pull_request_number: i64,
    base_sha: String,
    head_sha: String,
    snapshot_sha: String,
    algorithm_version: i64,
    generated_at: String,
    payload: Value,
) -> Result<(), String> {
    let payload_json = validate_payload(&payload)?;
    let now = Utc::now().to_rfc3339();
    let mut guard = state.db_conn.lock().map_err(|error| error.to_string())?;
    let connection = guard.as_mut().ok_or("Database unavailable")?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction.execute(
        "INSERT OR REPLACE INTO pr_architecture_impacts (repository_id, pull_request_number, base_sha, head_sha, snapshot_sha, algorithm_version, generated_at, last_accessed_at, payload_json, payload_bytes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![repository_id, pull_request_number, base_sha, head_sha, snapshot_sha, algorithm_version, generated_at, now, payload_json, payload_json.len() as i64],
    ).map_err(|error| error.to_string())?;
    transaction.execute(
        "DELETE FROM pr_architecture_impacts WHERE rowid IN (SELECT rowid FROM pr_architecture_impacts WHERE repository_id = ?1 AND pull_request_number = ?2 ORDER BY last_accessed_at DESC LIMIT -1 OFFSET ?3)",
        rusqlite::params![repository_id, pull_request_number, IMPACTS_PER_PULL_REQUEST],
    ).map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

use rusqlite::OptionalExtension;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exclusions_are_path_bounded() {
        assert!(is_excluded("vendor/lib.c"));
        assert!(is_excluded("node_modules/pkg/index.js"));
        assert!(!is_excluded("src/vendor_adapter.rs"));
    }

    #[test]
    fn content_selection_includes_manifests_codeowners_and_cpp() {
        let files = vec![
            ArchitectureTreeFile {
                path: "CMakeLists.txt".into(),
                size: Some(20),
                sha: None,
            },
            ArchitectureTreeFile {
                path: ".github/CODEOWNERS".into(),
                size: Some(20),
                sha: None,
            },
            ArchitectureTreeFile {
                path: "tests/fuzzer.c".into(),
                size: Some(200),
                sha: None,
            },
            ArchitectureTreeFile {
                path: "assets/image.png".into(),
                size: Some(20),
                sha: None,
            },
        ];
        let selected = content_candidates(&files);
        assert!(selected.contains(&"CMakeLists.txt".to_string()));
        assert!(selected.contains(&".github/CODEOWNERS".to_string()));
        assert!(selected.contains(&"tests/fuzzer.c".to_string()));
        assert!(!selected.contains(&"assets/image.png".to_string()));
    }

    #[test]
    fn stable_hash_is_deterministic_and_content_sensitive() {
        assert_eq!(stable_hash(b"version: 1"), stable_hash(b"version: 1"));
        assert_ne!(stable_hash(b"version: 1"), stable_hash(b"version: 2"));
    }

    #[test]
    fn architecture_input_serializes_camel_case_contract() {
        let value = serde_json::to_value(RepositoryArchitectureInput {
            repository_id: "acme/repo".into(),
            base_commit_sha: "abc".into(),
            truncated: false,
            files: vec![ArchitectureTreeFile {
                path: "雪/core.cpp".into(),
                size: Some(4),
                sha: None,
            }],
            contents: HashMap::new(),
            config: None,
            config_hash: None,
            request_count: 2,
            excluded_paths: vec![],
            warnings: vec![],
            stages: vec!["Ready"],
        })
        .unwrap();
        assert_eq!(value["repositoryId"], "acme/repo");
        assert_eq!(value["baseCommitSha"], "abc");
        assert_eq!(value["requestCount"], 2);
        assert_eq!(value["files"][0]["path"], "雪/core.cpp");
    }

    #[test]
    fn yaml_configuration_accepts_comments_and_normal_lists() {
        let value: serde_yaml::Value = serde_yaml::from_str("version: 1\n# repository boundaries\ncomponents:\n  - id: core\n    name: Core\n    paths:\n      - lib/**\n").unwrap();
        let json = serde_json::to_value(value).unwrap();
        assert_eq!(json["version"], 1);
        assert_eq!(json["components"][0]["id"], "core");
    }
}
