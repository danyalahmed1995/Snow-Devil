use crate::auth::secure_store::get_token;
use reqwest::Client;
use serde_json::json;
use std::error::Error;

const GRAPHQL_URL: &str = "https://api.github.com/graphql";

pub async fn fetch_viewer_profile() -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let query = r#"
        query {
            viewer {
                login
                name
                avatarUrl
                bio
                url
                repositories(first: 0) { totalCount }
                organizations(first: 0) { totalCount }
                pullRequests(first: 0, states: [OPEN]) { totalCount }
                issues(first: 0, states: [OPEN], filterBy: { assignee: "*" }) { totalCount }
            }
        }
    "#;

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    Ok(json_res["data"]["viewer"].clone())
}

pub async fn fetch_viewer_repositories() -> Result<serde_json::Value, Box<dyn Error + Send + Sync>>
{
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let query = r#"
        query {
            viewer {
                repositories(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
                    nodes {
                        id
                        nameWithOwner
                        description
                        updatedAt
                        url
                    }
                }
            }
        }
    "#;

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    Ok(json_res["data"]["viewer"]["repositories"]["nodes"].clone())
}

pub async fn fetch_viewer_pull_requests() -> Result<serde_json::Value, Box<dyn Error + Send + Sync>>
{
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let query = r#"
        query {
            viewer {
                pullRequests(first: 50, states: [OPEN], orderBy: {field: UPDATED_AT, direction: DESC}) {
                    nodes {
                        id
                        title
                        url
                        createdAt
                        repository { nameWithOwner }
                        number
                    }
                }
            }
        }
    "#;

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    Ok(json_res["data"]["viewer"]["pullRequests"]["nodes"].clone())
}

pub async fn fetch_viewer_issues() -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let query = r#"
        query {
            viewer {
                issues(first: 50, states: [OPEN], filterBy: {assignee: "*"}, orderBy: {field: UPDATED_AT, direction: DESC}) {
                    nodes {
                        id
                        title
                        url
                        createdAt
                        repository { nameWithOwner }
                        number
                    }
                }
            }
        }
    "#;

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    Ok(json_res["data"]["viewer"]["issues"]["nodes"].clone())
}
