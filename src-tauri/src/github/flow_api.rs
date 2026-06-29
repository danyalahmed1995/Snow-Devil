use crate::auth::secure_store::get_token;
use reqwest::Client;
use serde_json::json;
use std::error::Error;
use serde::Deserialize;

const GRAPHQL_URL: &str = "https://api.github.com/graphql";

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourcePageRequest {
    pub scope: String,
    pub source_type: String,
    pub repository_owner: Option<String>,
    pub repository_name: Option<String>,
    pub cursor: Option<String>,
    pub page_size: i32,
}

pub async fn fetch_account_home_summary() -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let query = r#"
        fragment ActorFields on Actor {
            __typename
            login
            avatarUrl
        }
        
        fragment IssueFields on Issue {
            id
            number
            title
            url
            createdAt
            updatedAt
            closedAt
            state
            author { ...ActorFields }
            repository { id name nameWithOwner owner { login } viewerPermission isFork }
            labels(first: 5) { nodes { name color } }
            assignees(first: 10) { nodes { login avatarUrl } }
            comments { totalCount }
        }

        fragment PullRequestFields on PullRequest {
            id
            number
            title
            url
            createdAt
            updatedAt
            closedAt
            mergedAt
            state
            isDraft
            author { ...ActorFields }
            repository { id name nameWithOwner owner { login } viewerPermission isFork }
            headRepository { nameWithOwner owner { login } isFork }
            labels(first: 5) { nodes { name color } }
            baseRefName
            headRefName
            assignees(first: 10) { nodes { login avatarUrl } }
            comments { totalCount }
            reviewDecision
            reviews(last: 10) { nodes { author { login } state } }
            reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } } } }
            commits(last: 1) { totalCount nodes { commit { statusCheckRollup { state } } } }
        }

        query($recentlyMerged: String!, $incoming: String!) {
            authoredPrs: search(query: "is:open is:pr author:@me", type: ISSUE, first: 50) {
                issueCount
                nodes {
                    ... on PullRequest { ...PullRequestFields }
                }
            }
            reviewRequestedPrs: search(query: "is:open is:pr review-requested:@me", type: ISSUE, first: 50) {
                issueCount
                nodes {
                    ... on PullRequest { ...PullRequestFields }
                }
            }
            assignedIssues: search(query: "is:open is:issue assignee:@me", type: ISSUE, first: 50) {
                issueCount
                nodes {
                    ... on Issue { ...IssueFields }
                }
            }
            mergedPrs: search(query: $recentlyMerged, type: ISSUE, first: 50) {
                issueCount
                nodes {
                    ... on PullRequest { ...PullRequestFields }
                }
            }
            incomingPrs: search(query: $incoming, type: ISSUE, first: 50) {
                issueCount
                nodes {
                    ... on PullRequest { ...PullRequestFields }
                }
            }
        }
    "#;

    let cutoff = (chrono::Utc::now() - chrono::Duration::days(7)).format("%Y-%m-%d").to_string();
    let variables = json!({
        "recentlyMerged": format!("is:pr is:merged author:@me merged:>={cutoff} sort:updated-desc"),
        "incoming": "is:open is:pr user:@me -author:@me sort:updated-desc"
    });

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query, "variables": variables }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    Ok(json_res["data"].clone())
}

pub async fn fetch_source_page(
    req: SourcePageRequest,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let (query_str, variables, is_repo_query) = if req.source_type == "releases" {
        (
            r#"
            query($owner: String!, $name: String!, $first: Int!, $cursor: String) {
                repository(owner: $owner, name: $name) {
                    releases(first: $first, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
                        totalCount
                        pageInfo { hasNextPage endCursor }
                        nodes {
                            id name tagName url createdAt publishedAt isDraft isPrerelease
                            description
                            author { login avatarUrl }
                            releaseAssets(first: 5) {
                                totalCount
                                nodes { id name downloadUrl size contentType }
                            }
                        }
                    }
                }
            }
            "#.to_string(),
            json!({
                "owner": req.repository_owner.unwrap_or_default(),
                "name": req.repository_name.unwrap_or_default(),
                "first": req.page_size,
                "cursor": req.cursor
            }),
            true
        )
    } else if req.scope == "repository" {
        let q = match req.source_type.as_str() {
            "open_prs" => r#"
            fragment ActorFields on Actor { __typename login avatarUrl }
            fragment PullRequestFields on PullRequest {
                __typename id number title url createdAt updatedAt closedAt mergedAt state isDraft
                author { ...ActorFields }
                repository { id name nameWithOwner owner { login } viewerPermission isFork }
                headRepository { nameWithOwner owner { login } isFork }
                labels(first: 5) { nodes { name color } }
                baseRefName headRefName
                assignees(first: 10) { nodes { login avatarUrl } }
                comments { totalCount }
                reviewDecision
                reviews(last: 10) { nodes { author { login } state } }
                reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } } } }
                commits(last: 1) { totalCount nodes { commit { statusCheckRollup { state } } } }
            }
            query($owner: String!, $name: String!, $first: Int!, $cursor: String) {
                repository(owner: $owner, name: $name) {
                    pullRequests(states: OPEN, first: $first, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
                        totalCount
                        pageInfo { hasNextPage endCursor }
                        nodes { ...PullRequestFields }
                    }
                }
            }
            "#.to_string(),
            "merged_prs" => r#"
            fragment ActorFields on Actor { __typename login avatarUrl }
            fragment PullRequestFields on PullRequest {
                __typename id number title url createdAt updatedAt closedAt mergedAt state isDraft
                author { ...ActorFields }
                repository { id name nameWithOwner owner { login } viewerPermission isFork }
                headRepository { nameWithOwner owner { login } isFork }
                labels(first: 5) { nodes { name color } }
                baseRefName headRefName
                assignees(first: 10) { nodes { login avatarUrl } }
                comments { totalCount }
                reviewDecision
                reviews(last: 10) { nodes { author { login } state } }
                reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } } } }
                commits(last: 1) { totalCount nodes { commit { statusCheckRollup { state } } } }
            }
            query($owner: String!, $name: String!, $first: Int!, $cursor: String) {
                repository(owner: $owner, name: $name) {
                    pullRequests(states: MERGED, first: $first, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
                        totalCount
                        pageInfo { hasNextPage endCursor }
                        nodes { ...PullRequestFields }
                    }
                }
            }
            "#.to_string(),
            "open_issues" => r#"
            fragment ActorFields on Actor { __typename login avatarUrl }
            fragment IssueFields on Issue {
                __typename id number title url createdAt updatedAt closedAt state
                author { ...ActorFields }
                repository { id name nameWithOwner owner { login } viewerPermission isFork }
                labels(first: 5) { nodes { name color } }
                assignees(first: 10) { nodes { login avatarUrl } }
                comments { totalCount }
            }
            query($owner: String!, $name: String!, $first: Int!, $cursor: String) {
                repository(owner: $owner, name: $name) {
                    issues(states: OPEN, first: $first, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
                        totalCount
                        pageInfo { hasNextPage endCursor }
                        nodes { ...IssueFields }
                    }
                }
            }
            "#.to_string(),
            _ => "".to_string(),
        };

        if q.is_empty() {
            return Ok(json!({}));
        }

        (
            q,
            json!({
                "owner": req.repository_owner.unwrap_or_default(),
                "name": req.repository_name.unwrap_or_default(),
                "first": req.page_size,
                "cursor": req.cursor
            }),
            true
        )
    } else {
        let search_query = match req.source_type.as_str() {
            "authored_prs" => "is:pr is:open author:@me".to_string(),
            "review_requested_prs" => "is:pr is:open user-review-requested:@me".to_string(),
            "reviewed_prs" => "is:pr is:open reviewed-by:@me".to_string(),
            "authored_issues" => "is:issue is:open author:@me".to_string(),
            "assigned_issues" => "is:issue is:open assignee:@me".to_string(),
            "merged_prs" => "is:pr is:merged author:@me sort:updated-desc".to_string(),
            _ => "".to_string()
        };

        if search_query.is_empty() {
            return Ok(json!({
                "search": {
                    "issueCount": 0,
                    "pageInfo": { "hasNextPage": false, "endCursor": null },
                    "nodes": []
                }
            }));
        }

        (
            r#"
            fragment ActorFields on Actor { __typename login avatarUrl }
            fragment IssueFields on Issue {
                __typename
                id number title url createdAt updatedAt closedAt state
                author { ...ActorFields }
                repository { id name nameWithOwner owner { login } viewerPermission isFork }
                labels(first: 5) { nodes { name color } }
                assignees(first: 10) { nodes { login avatarUrl } }
                comments { totalCount }
            }
            fragment PullRequestFields on PullRequest {
                __typename
                id number title url createdAt updatedAt closedAt mergedAt state isDraft
                author { ...ActorFields }
                repository { id name nameWithOwner owner { login } viewerPermission isFork }
                headRepository { nameWithOwner owner { login } isFork }
                labels(first: 5) { nodes { name color } }
                baseRefName headRefName
                assignees(first: 10) { nodes { login avatarUrl } }
                comments { totalCount }
                reviewDecision
                reviews(last: 10) { nodes { author { login } state } }
                reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } } } }
                commits(last: 1) { totalCount nodes { commit { statusCheckRollup { state } } } }
            }
            query($search: String!, $first: Int!, $cursor: String) {
                search(query: $search, type: ISSUE, first: $first, after: $cursor) {
                    issueCount
                    pageInfo { hasNextPage endCursor }
                    nodes {
                        ... on PullRequest { ...PullRequestFields }
                        ... on Issue { ...IssueFields }
                    }
                }
            }
            "#.to_string(),
            json!({
                "search": search_query,
                "first": req.page_size,
                "cursor": req.cursor
            }),
            false
        )
    };

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query_str, "variables": variables }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    if is_repo_query {
        Ok(json_res["data"]["repository"].clone())
    } else {
        Ok(json_res["data"].clone())
    }
}

pub async fn fetch_item_timeline(
    owner: &str,
    name: &str,
    number: i64,
    is_pr: bool,
    cursor: Option<String>,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let issue_query = r#"
        query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
            repository(owner: $owner, name: $name) {
                issue(number: $number) {
                    timelineItems(first: 100, after: $cursor) {
                        pageInfo { hasNextPage endCursor }
                        nodes {
                            __typename
                            ... on ClosedEvent { createdAt actor { login } }
                            ... on ReopenedEvent { createdAt actor { login } }
                            ... on LabeledEvent { createdAt actor { login } label { name } }
                            ... on UnlabeledEvent { createdAt actor { login } label { name } }
                            ... on AssignedEvent { createdAt actor { login } assignee { ... on User { login } } }
                        }
                    }
                }
            }
        }
    "#;

    let pr_query = r#"
        query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
            repository(owner: $owner, name: $name) {
                pullRequest(number: $number) {
                    timelineItems(first: 100, after: $cursor) {
                        pageInfo { hasNextPage endCursor }
                        nodes {
                            __typename
                            ... on ClosedEvent { createdAt actor { login } }
                            ... on ReopenedEvent { createdAt actor { login } }
                            ... on MergedEvent { createdAt actor { login } }
                            ... on LabeledEvent { createdAt actor { login } label { name } }
                            ... on ReviewRequestedEvent { createdAt actor { login } requestedReviewer { ... on User { login } } }
                            ... on PullRequestReview { state submittedAt author { login } }
                            ... on PullRequestCommit { commit { committedDate checkSuites(first: 10) { nodes { status conclusion updatedAt app { name } } } } }
                        }
                    }
                }
            }
        }
    "#;

    let query = if is_pr { pr_query } else { issue_query };

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({ "query": query, "variables": { "owner": owner, "name": name, "number": number, "cursor": cursor } }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    if is_pr {
        Ok(json_res["data"]["repository"]["pullRequest"]["timelineItems"].clone())
    } else {
        Ok(json_res["data"]["repository"]["issue"]["timelineItems"].clone())
    }
}
