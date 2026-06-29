use crate::auth::secure_store::get_token;
use reqwest::Client;
use serde_json::json;
use std::error::Error;
use std::collections::HashSet;

const GRAPHQL_URL: &str = "https://api.github.com/graphql";
const VIEWER_REPOSITORIES_QUERY: &str = r#"
    query($cursor: String) {
        viewer {
            login
            organizations(first: 100) { nodes { login } }
            repositories(first: 100, after: $cursor, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: {field: UPDATED_AT, direction: DESC}) {
                pageInfo { hasNextPage endCursor }
                nodes {
                    id nameWithOwner description updatedAt url isPrivate isFork isArchived isEmpty isTemplate viewerPermission
                    defaultBranchRef { name }
                    owner { __typename login }
                }
            }
        }
    }
"#;

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
            }
            authoredPullRequests: search(query: "is:open is:pr author:@me", type: ISSUE, first: 0) { issueCount }
            assignedIssues: search(query: "is:open is:issue assignee:@me", type: ISSUE, first: 0) { issueCount }
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

    let mut profile = json_res["data"]["viewer"].clone();
    profile["pullRequests"] = json!({ "totalCount": json_res["data"]["authoredPullRequests"]["issueCount"] });
    profile["issues"] = json!({ "totalCount": json_res["data"]["assignedIssues"]["issueCount"] });
    let login = profile["login"].as_str().unwrap_or_default();
    profile["organizations"] = match fetch_active_organization_memberships(&client, &token).await {
        Ok(memberships) => {
            let public = fetch_public_organizations(&client, login).await.unwrap_or_default();
            if memberships.is_empty() && !public.is_empty() { organization_restricted_summary(&public) } else { organization_summary(&memberships, &public) }
        }
        Err(error) => organization_unavailable_summary(&error.to_string()),
    };
    Ok(profile)
}

fn organization_restricted_summary(public: &[serde_json::Value]) -> serde_json::Value {
    let nodes: Vec<serde_json::Value> = public.iter().filter_map(|organization| {
        let login = organization["login"].as_str()?;
        Some(json!({
            "id": organization["id"],
            "login": login,
            "avatarUrl": organization["avatar_url"],
            "url": organization["html_url"],
            "role": "member",
            "state": "active",
            "visibility": "public"
        }))
    }).collect();
    json!({
        "totalCount": nodes.len(),
        "publicCount": nodes.len(),
        "privateCount": 0,
        "nodes": nodes,
        "source": "public_profile_fallback",
        "status": "partial",
        "errorCode": "organization_access_restricted",
        "message": "GitHub returned no authenticated memberships for this OAuth app. Public memberships are shown; authorize the OAuth app for your organizations to include private memberships."
    })
}

fn organization_summary(memberships: &[serde_json::Value], public: &[serde_json::Value]) -> serde_json::Value {
    let public_logins: HashSet<String> = public.iter().filter_map(|organization| organization["login"].as_str().map(|value| value.to_ascii_lowercase())).collect();
    let nodes: Vec<serde_json::Value> = memberships.iter().filter(|membership| membership["state"] == "active").filter_map(|membership| {
        let organization = membership.get("organization")?;
        let org_login = organization["login"].as_str().unwrap_or_default();
        Some(json!({
            "id": organization["id"],
            "login": org_login,
            "avatarUrl": organization["avatar_url"],
            "url": organization["html_url"],
            "role": membership["role"],
            "state": membership["state"],
            "visibility": if public_logins.contains(&org_login.to_ascii_lowercase()) { "public" } else { "private" }
        }))
    }).collect();
    let public_count = nodes.iter().filter(|organization| organization["visibility"] == "public").count();
    json!({
        "totalCount": nodes.len(),
        "publicCount": public_count,
        "privateCount": nodes.len().saturating_sub(public_count),
        "nodes": nodes,
        "source": "authenticated_active_memberships",
        "status": "ready",
        "errorCode": null
    })
}

fn organization_unavailable_summary(error: &str) -> serde_json::Value {
    let error_code = if error.contains("organization_sso_required") {
        "sso_required"
    } else if error.contains("organization_membership_scope_missing") {
        "missing_read_org"
    } else {
        "unavailable"
    };
    let message = match error_code {
        "sso_required" => "GitHub organization access requires SSO authorization for this token.",
        "missing_read_org" => "GitHub organization memberships require the read:org scope. Reconnect GitHub to grant it.",
        _ => "GitHub organization memberships are temporarily unavailable.",
    };
    json!({
        "totalCount": 0,
        "publicCount": 0,
        "privateCount": 0,
        "nodes": [],
        "source": "authenticated_active_memberships",
        "status": "unavailable",
        "errorCode": error_code,
        "message": message
    })
}

async fn fetch_active_organization_memberships(client: &Client, token: &str) -> Result<Vec<serde_json::Value>, Box<dyn Error + Send + Sync>> {
    let mut memberships = Vec::new();
    for page in 1..=10 {
        let response = client
            .get(format!("https://api.github.com/user/memberships/orgs?state=active&per_page=100&page={page}"))
            .bearer_auth(token)
            .header("User-Agent", "github-graph-browser")
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await?;
        if response.status() == reqwest::StatusCode::FORBIDDEN {
            let sso_required = response.headers().get("x-github-sso").is_some();
            return Err(if sso_required { "organization_sso_required" } else { "organization_membership_scope_missing" }.into());
        }
        if !response.status().is_success() {
            return Err(format!("GitHub organization memberships failed with status {}", response.status()).into());
        }
        let page_items: Vec<serde_json::Value> = response.json().await?;
        let count = page_items.len();
        memberships.extend(page_items.into_iter().filter(|membership| membership["state"] == "active"));
        if count < 100 { break; }
    }
    Ok(memberships)
}

async fn fetch_public_organizations(client: &Client, login: &str) -> Result<Vec<serde_json::Value>, Box<dyn Error + Send + Sync>> {
    let mut organizations = Vec::new();
    for page in 1..=10 {
        let response = client
            .get(format!("https://api.github.com/users/{login}/orgs?per_page=100&page={page}"))
            .header("User-Agent", "github-graph-browser")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await?;
        if !response.status().is_success() { break; }
        let page_items: Vec<serde_json::Value> = response.json().await?;
        let count = page_items.len();
        organizations.extend(page_items);
        if count < 100 { break; }
    }
    Ok(organizations)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_authenticated_memberships_include_private_organizations() {
        let memberships = vec![
            json!({"state":"active","role":"member","organization":{"id":1,"login":"public-org","avatar_url":"","html_url":"https://github.com/public-org"}}),
            json!({"state":"active","role":"member","organization":{"id":2,"login":"private-org","avatar_url":"","html_url":"https://github.com/private-org"}}),
            json!({"state":"pending","role":"member","organization":{"id":3,"login":"pending-org"}}),
        ];
        let summary = organization_summary(&memberships, &[json!({"login":"public-org"})]);
        assert_eq!(summary["totalCount"], 2);
        assert_eq!(summary["publicCount"], 1);
        assert_eq!(summary["privateCount"], 1);
    }

    #[test]
    fn organization_scope_and_sso_failures_remain_explicit_without_breaking_auth() {
        assert_eq!(organization_unavailable_summary("organization_membership_scope_missing")["errorCode"], "missing_read_org");
        assert_eq!(organization_unavailable_summary("organization_sso_required")["errorCode"], "sso_required");
    }

    #[test]
    fn restricted_oauth_memberships_fall_back_to_disclosed_public_organizations() {
        let summary = organization_restricted_summary(&[json!({"id":1,"login":"public-org","avatar_url":"","html_url":"https://github.com/public-org"})]);
        assert_eq!(summary["status"], "partial");
        assert_eq!(summary["totalCount"], 1);
        assert_eq!(summary["nodes"][0]["login"], "public-org");
        assert_eq!(summary["errorCode"], "organization_access_restricted");
    }

    #[test]
    fn repository_access_classification_distinguishes_org_maintain_and_read_only() {
        let organizations = HashSet::from(["acme".to_string()]);
        let mut maintained = json!({"owner":{"login":"acme","__typename":"Organization"},"viewerPermission":"MAINTAIN"});
        classify_repository(&mut maintained, "viewer", &organizations);
        assert_eq!(maintained["ownership"], "organization");
        assert_eq!(maintained["accessKind"], "maintained");
        assert_eq!(maintained["maintainedByViewer"], true);

        let mut read_only = json!({"owner":{"login":"acme","__typename":"Organization"},"viewerPermission":"READ"});
        classify_repository(&mut read_only, "viewer", &organizations);
        assert_eq!(read_only["accessKind"], "read_only");
        assert_eq!(read_only["maintainedByViewer"], false);
    }

    #[test]
    fn repository_discovery_requests_org_affiliation_and_cursor_pagination() {
        assert!(VIEWER_REPOSITORIES_QUERY.contains("ORGANIZATION_MEMBER"));
        assert!(VIEWER_REPOSITORIES_QUERY.contains("after: $cursor"));
        assert!(VIEWER_REPOSITORIES_QUERY.contains("pageInfo { hasNextPage endCursor }"));
    }
}

pub async fn fetch_viewer_repositories() -> Result<serde_json::Value, Box<dyn Error + Send + Sync>>
{
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let mut cursor: Option<String> = None;
    let mut repositories = Vec::new();
    for _ in 0..100 {
        let res = client
            .post(GRAPHQL_URL)
            .bearer_auth(&token)
            .header("User-Agent", "github-graph-browser")
            .json(&json!({ "query": VIEWER_REPOSITORIES_QUERY, "variables": { "cursor": cursor } }))
            .send()
            .await?;
        let json_res: serde_json::Value = res.json().await?;
        if let Some(errors) = json_res.get("errors") {
            return Err(format!("GraphQL errors: {}", errors).into());
        }
        let viewer = &json_res["data"]["viewer"];
        let viewer_login = viewer["login"].as_str().unwrap_or_default();
        let organizations: HashSet<String> = viewer["organizations"]["nodes"].as_array().into_iter().flatten()
            .filter_map(|organization| organization["login"].as_str().map(|value| value.to_ascii_lowercase())).collect();
        if let Some(nodes) = viewer["repositories"]["nodes"].as_array() {
            for node in nodes {
                let mut normalized = node.clone();
                classify_repository(&mut normalized, viewer_login, &organizations);
                repositories.push(normalized);
            }
        }
        let page_info = &viewer["repositories"]["pageInfo"];
        if !page_info["hasNextPage"].as_bool().unwrap_or(false) { break; }
        cursor = page_info["endCursor"].as_str().map(str::to_string);
        if cursor.is_none() { break; }
    }
    Ok(serde_json::Value::Array(repositories))
}

fn classify_repository(repository: &mut serde_json::Value, viewer_login: &str, organizations: &HashSet<String>) {
    let owner_login = repository["owner"]["login"].as_str().unwrap_or_default().to_string();
    let owner_type = repository["owner"]["__typename"].as_str().unwrap_or_default().to_string();
    let permission = repository["viewerPermission"].as_str().unwrap_or("UNKNOWN").to_string();
    let ownership = if owner_login.eq_ignore_ascii_case(viewer_login) {
        "personal"
    } else if owner_type == "Organization" || organizations.contains(&owner_login.to_ascii_lowercase()) {
        "organization"
    } else {
        "collaborator"
    };
    let maintained = matches!(permission.as_str(), "ADMIN" | "MAINTAIN" | "WRITE");
    let access_kind = if maintained { "maintained" } else if permission == "TRIAGE" { "triage" } else { "read_only" };
    repository["ownerLogin"] = json!(owner_login);
    repository["ownerType"] = json!(owner_type);
    repository["ownership"] = json!(ownership);
    repository["accessKind"] = json!(access_kind);
    repository["maintainedByViewer"] = json!(maintained);
    repository["defaultBranch"] = repository["defaultBranchRef"]["name"].clone();
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
