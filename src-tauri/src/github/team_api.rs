use crate::auth::secure_store::get_token;
use reqwest::Client;
use serde_json::json;
use std::error::Error;

const GRAPHQL_URL: &str = "https://api.github.com/graphql";

pub async fn fetch_viewer_organizations() -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let query = r#"
        query {
            viewer {
                organizations(first: 20) {
                    nodes {
                        id
                        login
                        name
                        avatarUrl
                        membersWithRole(first: 100) {
                            nodes { id login name avatarUrl }
                        }
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
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    Ok(json_res["data"].clone())
}

pub async fn fetch_member_activity(
    login: &str,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let query = r#"
        query($login: String!) {
            user(login: $login) {
                pullRequests(first: 20, states: [OPEN], orderBy: {field: UPDATED_AT, direction: DESC}) {
                    nodes {
                        id number title url state isDraft
                        repository { nameWithOwner }
                        author { login avatarUrl }
                        reviewRequests(first: 10) {
                            nodes { requestedReviewer { ... on User { login avatarUrl } } }
                        }
                        reviews(last: 10) {
                            nodes { author { login avatarUrl } state }
                        }
                        assignees(first: 5) { nodes { login avatarUrl } }
                    }
                }
                issues(first: 20, states: [OPEN], filterBy: { assignee: $login }, orderBy: {field: UPDATED_AT, direction: DESC}) {
                    nodes {
                        id number title url state
                        repository { nameWithOwner }
                        assignees(first: 5) { nodes { login avatarUrl } }
                    }
                }
            }
        }
    "#;

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query, "variables": { "login": login } }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    Ok(json_res["data"].clone())
}

pub async fn fetch_org_activity(
    org_login: &str,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let pr_query = format!("is:open is:pr org:{}", org_login);
    let issue_query = format!("is:open is:issue org:{}", org_login);

    let query = r#"
        query($query: String!, $issueQuery: String!) {
            search(query: $query, type: ISSUE, first: 50) {
                nodes {
                    ... on PullRequest {
                        id number title url state isDraft
                        repository { nameWithOwner }
                        author { login avatarUrl }
                        reviewRequests(first: 10) {
                            nodes { requestedReviewer { ... on User { login avatarUrl } } }
                        }
                        reviews(last: 10) {
                            nodes { author { login avatarUrl } state }
                        }
                        assignees(first: 5) { nodes { login avatarUrl } }
                    }
                }
            }
            issues: search(query: $issueQuery, type: ISSUE, first: 50) {
                nodes {
                    ... on Issue {
                        id number title url state
                        repository { nameWithOwner }
                        assignees(first: 5) { nodes { login avatarUrl } }
                    }
                }
            }
        }
    "#;

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query, "variables": { "query": pr_query, "issueQuery": issue_query } }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    Ok(json_res["data"].clone())
}
