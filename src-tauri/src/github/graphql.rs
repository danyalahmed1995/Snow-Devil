use super::models::{RepoInfo, ViewerInfo};
use crate::github::http::GithubRequestExt;
use reqwest::Client;
use serde_json::json;
use std::error::Error;

const GRAPHQL_URL: &str = "https://api.github.com/graphql";

pub async fn get_viewer(token: &str) -> Result<ViewerInfo, Box<dyn Error + Send + Sync>> {
    let client = Client::new();
    let query = r#"
        query {
            viewer {
                id
                login
                name
                avatarUrl
                url
            }
        }
    "#;

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query }))
        .send_retrying()
        .await?;

    let json_res: serde_json::Value = res.json().await?;

    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    let viewer = &json_res["data"]["viewer"];
    Ok(ViewerInfo {
        id: viewer["id"].as_str().unwrap_or("").to_string(),
        login: viewer["login"].as_str().unwrap_or("").to_string(),
        name: viewer["name"].as_str().map(|s| s.to_string()),
        avatar_url: viewer["avatarUrl"].as_str().unwrap_or("").to_string(),
        url: viewer["url"].as_str().unwrap_or("").to_string(),
    })
}

pub async fn get_viewer_repos(
    token: &str,
    limit: i32,
) -> Result<Vec<RepoInfo>, Box<dyn Error + Send + Sync>> {
    let client = Client::new();
    let query = crate::github::queries::VIEWER_REPOS_QUERY;

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({
            "query": query,
            "variables": {
                "first": limit
            }
        }))
        .send_retrying()
        .await?;

    let json_res: serde_json::Value = res.json().await?;

    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    let mut repos = Vec::new();
    if let Some(nodes) = json_res["data"]["viewer"]["repositories"]["nodes"].as_array() {
        for node in nodes {
            repos.push(RepoInfo {
                id: node["id"].as_str().unwrap_or("").to_string(),
                name_with_owner: node["nameWithOwner"].as_str().unwrap_or("").to_string(),
                owner: node["owner"]["login"].as_str().map(|s| s.to_string()),
                url: node["url"].as_str().unwrap_or("").to_string(),
                is_private: node["isPrivate"].as_bool().unwrap_or(false),
                description: node["description"].as_str().map(|s| s.to_string()),
                primary_language: node["primaryLanguage"]["name"]
                    .as_str()
                    .map(|s| s.to_string()),
                updated_at: node["updatedAt"].as_str().unwrap_or("").to_string(),
            });
        }
    }

    Ok(repos)
}
