use crate::github::repo_api::{fetch_repo_file, fetch_repo_overview, fetch_repo_tree};
use serde_json::Value;

#[tauri::command]
pub async fn get_repo_overview(owner: String, name: String) -> Result<Value, String> {
    fetch_repo_overview(&owner, &name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_repo_tree(
    owner: String,
    name: String,
    expression: String,
) -> Result<Value, String> {
    fetch_repo_tree(&owner, &name, &expression)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_repo_file(
    owner: String,
    name: String,
    expression: String,
) -> Result<Value, String> {
    fetch_repo_file(&owner, &name, &expression)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_repo_file_content(
    owner: String,
    name: String,
    expression: String,
    path: String,
) -> Result<Value, String> {
    crate::github::repo_api::fetch_repo_file_content(&owner, &name, &expression, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_repo_prs(owner: String, name: String) -> Result<Value, String> {
    crate::github::repo_api::fetch_repo_prs(&owner, &name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_repo_issues(owner: String, name: String) -> Result<Value, String> {
    crate::github::repo_api::fetch_repo_issues(&owner, &name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_commit_details(owner: String, name: String, sha: String) -> Result<Value, String> {
    crate::github::repo_api::fetch_commit_details(&owner, &name, &sha)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_pr_details(owner: String, name: String, number: i64) -> Result<Value, String> {
    crate::github::repo_api::fetch_pr_details(&owner, &name, number)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_issue_details(owner: String, name: String, number: i64) -> Result<Value, String> {
    crate::github::repo_api::fetch_issue_details(&owner, &name, number)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_viewer_repositories() -> Result<Value, String> {
    crate::github::user_api::fetch_viewer_repositories()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_viewer_pull_requests() -> Result<Value, String> {
    crate::github::user_api::fetch_viewer_pull_requests()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_viewer_issues() -> Result<Value, String> {
    crate::github::user_api::fetch_viewer_issues()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn execute_graphql(query: String, variables: Value) -> Result<Value, String> {
    crate::github::repo_api::execute_graphql(&query, variables)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn execute_rest(endpoint: String) -> Result<Value, String> {
    crate::github::repo_api::execute_rest(&endpoint)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_repository(
    owner: String,
    name: String,
    query: String,
    page: u32,
    per_page: u32,
) -> Result<Value, String> {
    crate::github::repo_api::search_repository(&owner, &name, &query, page, per_page)
        .await
        .map_err(|e| e.to_string())
}
