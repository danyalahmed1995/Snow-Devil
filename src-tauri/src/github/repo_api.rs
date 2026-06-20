use crate::auth::secure_store::get_token;
use reqwest::Client;
use serde_json::json;
use std::error::Error;

const GRAPHQL_URL: &str = "https://api.github.com/graphql";
const REST_URL: &str = "https://api.github.com";

pub async fn fetch_repo_overview(
    owner: &str,
    name: &str,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let query = r#"
        query($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
                id
                name
                nameWithOwner
                description
                stargazerCount
                forkCount
                primaryLanguage { name }
                updatedAt
                defaultBranchRef {
                    name
                }
                object(expression: "HEAD:README.md") {
                    ... on Blob {
                        text
                    }
                }
            }
        }
    "#;

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({
            "query": query,
            "variables": {
                "owner": owner,
                "name": name
            }
        }))
        .send()
        .await?;

    let mut json_res: serde_json::Value = res.json().await?;

    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    // Also try to fetch README.md if expression "HEAD:README.md" returned null, maybe it's lowercase or just README
    if json_res["data"]["repository"]["object"].is_null() {
        let query2 = r#"
            query($owner: String!, $name: String!) {
                repository(owner: $owner, name: $name) {
                    object(expression: "HEAD:README") {
                        ... on Blob { text }
                    }
                }
            }
        "#;
        let res2 = client
            .post(GRAPHQL_URL)
            .bearer_auth(&token)
            .header("User-Agent", "github-graph-browser")
            .json(&json!({ "query": query2, "variables": { "owner": owner, "name": name } }))
            .send()
            .await?;
        let json_res2: serde_json::Value = res2.json().await?;
        if let Some(obj) = json_res2
            .get("data")
            .and_then(|d| d.get("repository"))
            .and_then(|r| r.get("object"))
        {
            json_res["data"]["repository"]["object"] = obj.clone();
        }
    }

    Ok(json_res["data"]["repository"].clone())
}

pub async fn fetch_repo_tree(
    owner: &str,
    name: &str,
    expression: &str,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let query = r#"
        query($owner: String!, $name: String!, $expression: String!) {
            repository(owner: $owner, name: $name) {
                object(expression: $expression) {
                    ... on Tree {
                        entries {
                            name
                            type
                            path
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
        .json(&json!({
            "query": query,
            "variables": {
                "owner": owner,
                "name": name,
                "expression": expression
            }
        }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    Ok(json_res["data"]["repository"]["object"].clone())
}

pub async fn fetch_repo_file(
    owner: &str,
    name: &str,
    expression: &str,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let query = r#"
        query($owner: String!, $name: String!, $expression: String!) {
            repository(owner: $owner, name: $name) {
                object(expression: $expression) {
                    ... on Blob {
                        text
                        byteSize
                    }
                }
            }
        }
    "#;

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({
            "query": query,
            "variables": {
                "owner": owner,
                "name": name,
                "expression": expression
            }
        }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    Ok(json_res["data"]["repository"]["object"].clone())
}

pub async fn fetch_repo_prs(
    owner: &str,
    name: &str,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let query = r#"
        query($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
                pullRequests(first: 20, states: [OPEN], orderBy: {field: UPDATED_AT, direction: DESC}) {
                    nodes {
                        id
                        number
                        title
                        state
                        updatedAt
                        author { login }
                    }
                }
            }
        }
    "#;

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query, "variables": { "owner": owner, "name": name } }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }
    Ok(json_res["data"]["repository"]["pullRequests"]["nodes"].clone())
}

pub async fn fetch_repo_issues(
    owner: &str,
    name: &str,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let query = r#"
        query($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
                issues(first: 20, states: [OPEN], orderBy: {field: UPDATED_AT, direction: DESC}) {
                    nodes {
                        id
                        number
                        title
                        state
                        updatedAt
                        author { login }
                    }
                }
            }
        }
    "#;

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query, "variables": { "owner": owner, "name": name } }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }
    Ok(json_res["data"]["repository"]["issues"]["nodes"].clone())
}

pub async fn fetch_pr_details(
    owner: &str,
    name: &str,
    number: i64,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    // Fetch basic details, timeline, and checks
    let query = r#"
        query($owner: String!, $name: String!, $number: Int!) {
            repository(owner: $owner, name: $name) {
                pullRequest(number: $number) {
                    title
                    body
                    state
                    author { login }
                    createdAt
                    reviewDecision
                    commits(last: 1) {
                        nodes {
                            commit {
                                statusCheckRollup {
                                    state
                                }
                            }
                        }
                    }
                    comments(first: 50) {
                        nodes {
                            author { login }
                            body
                            createdAt
                        }
                    }
                }
            }
        }
    "#;

    let res = client.post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query, "variables": { "owner": owner, "name": name, "number": number } }))
        .send().await?;

    let json_res: serde_json::Value = res.json().await?;
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    let mut pr_data = json_res["data"]["repository"]["pullRequest"].clone();

    // Fetch diff via REST API
    let rest_url = format!("{}/repos/{}/{}/pulls/{}", REST_URL, owner, name, number);
    let diff_res = client
        .get(&rest_url)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .header("Accept", "application/vnd.github.v3.diff")
        .send()
        .await?;

    if diff_res.status().is_success() {
        if let Ok(diff_text) = diff_res.text().await {
            pr_data["diff"] = json!(diff_text);
        }
    }

    Ok(pr_data)
}

pub async fn fetch_issue_details(
    owner: &str,
    name: &str,
    number: i64,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let query = r#"
        query($owner: String!, $name: String!, $number: Int!) {
            repository(owner: $owner, name: $name) {
                issue(number: $number) {
                    title
                    body
                    state
                    author { login }
                    createdAt
                    labels(first: 10) { nodes { name color } }
                    assignees(first: 5) { nodes { login } }
                    comments(first: 50) {
                        nodes {
                            author { login }
                            body
                            createdAt
                        }
                    }
                }
            }
        }
    "#;

    let res = client.post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query, "variables": { "owner": owner, "name": name, "number": number } }))
        .send().await?;

    let json_res: serde_json::Value = res.json().await?;
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    Ok(json_res["data"]["repository"]["issue"].clone())
}
