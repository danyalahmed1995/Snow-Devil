use crate::auth::secure_store::get_token;
use base64::Engine;
use reqwest::Client;
use serde_json::json;
use std::error::Error;

const GRAPHQL_URL: &str = "https://api.github.com/graphql";
const REST_URL: &str = "https://api.github.com";

pub(crate) fn get_github_client() -> Result<Client, reqwest::Error> {
    let policy = reqwest::redirect::Policy::custom(|attempt| {
        if attempt.url().host_str() != Some("api.github.com") {
            attempt.stop()
        } else {
            attempt.follow()
        }
    });
    Client::builder().redirect(policy).build()
}

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
                        isBinary
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

pub async fn fetch_repo_file_content(
    owner: &str,
    name: &str,
    expression: &str,
    path: &str,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let mut value = fetch_repo_file(owner, name, expression).await?;
    value["path"] = json!(path);
    let extension = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    let mime_type = match extension.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "svg" => Some("image/svg+xml"),
        "webp" => Some("image/webp"),
        _ => None,
    };
    value["mimeType"] = json!(mime_type);
    let byte_size = value
        .get("byteSize")
        .and_then(|item| item.as_u64())
        .unwrap_or(0);
    if mime_type.is_none() || extension == "svg" || byte_size > 5_000_000 {
        return Ok(value);
    }

    let token = get_token()?.ok_or("No token")?;
    let encoded_path = path
        .split('/')
        .map(|segment| url::form_urlencoded::byte_serialize(segment.as_bytes()).collect::<String>())
        .collect::<Vec<_>>()
        .join("/");
    let branch = expression
        .split_once(':')
        .map(|(reference, _)| reference)
        .unwrap_or("HEAD");
    let response = Client::new()
        .get(format!(
            "{}/repos/{}/{}/contents/{}?ref={}",
            REST_URL,
            owner,
            name,
            encoded_path,
            url::form_urlencoded::byte_serialize(branch.as_bytes()).collect::<String>()
        ))
        .bearer_auth(&token)
        .header("User-Agent", "snow-devil")
        .header("Accept", "application/vnd.github.raw+json")
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(format!("GitHub image request failed ({})", response.status()).into());
    }
    let bytes = response.bytes().await?;
    if bytes.len() > 5_000_000 {
        return Ok(value);
    }
    value["contentBase64"] = json!(base64::engine::general_purpose::STANDARD.encode(bytes));
    Ok(value)
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

pub async fn fetch_commit_details(
    owner: &str,
    name: &str,
    sha: &str,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let rest_url = format!("{}/repos/{}/{}/commits/{}", REST_URL, owner, name, sha);

    // 1. Fetch JSON metadata
    let json_res = client
        .get(&rest_url)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await?;

    if !json_res.status().is_success() {
        return Err(format!("Failed to fetch commit metadata: {}", json_res.status()).into());
    }

    let mut commit_data: serde_json::Value = json_res.json().await?;

    // 2. Fetch raw diff
    let diff_res = client
        .get(&rest_url)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .header("Accept", "application/vnd.github.diff")
        .send()
        .await?;

    if diff_res.status().is_success() {
        if let Ok(diff_text) = diff_res.text().await {
            commit_data["diff"] = json!(diff_text);
        }
    }

    Ok(commit_data)
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
                    baseRefName
                    headRefName
                    baseRefOid
                    headRefOid
                    additions
                    deletions
                    changedFiles
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
    } else if diff_res.status() == reqwest::StatusCode::NOT_ACCEPTABLE {
        pr_data["diffTruncated"] = json!(true);
        let mut all_files = Vec::new();
        let mut page = 1;
        loop {
            let files_url = format!("{}/repos/{}/{}/pulls/{}/files?per_page=100&page={}", REST_URL, owner, name, number, page);
            let files_res = client
                .get(&files_url)
                .bearer_auth(&token)
                .header("User-Agent", "github-graph-browser")
                .header("Accept", "application/vnd.github.v3+json")
                .send()
                .await;
            
            match files_res {
                Ok(res) if res.status().is_success() => {
                    if let Ok(files_array) = res.json::<Vec<serde_json::Value>>().await {
                        let len = files_array.len();
                        all_files.extend(files_array);
                        if len < 100 { break; }
                        page += 1;
                    } else {
                        break;
                    }
                }
                _ => break,
            }
        }
        pr_data["fallbackFiles"] = json!(all_files);
    }

    Ok(pr_data)
}

pub async fn fetch_compare_diff(
    owner: &str,
    name: &str,
    base: &str,
    head: &str,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let rest_url = format!(
        "{}/repos/{}/{}/compare/{}...{}",
        REST_URL, owner, name, base, head
    );
    let diff_res = client
        .get(&rest_url)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .header("Accept", "application/vnd.github.v3.diff")
        .send()
        .await?;

    if diff_res.status().is_success() {
        if let Ok(diff_text) = diff_res.text().await {
            return Ok(json!(diff_text));
        }
    } else {
        let err_text = diff_res.text().await.unwrap_or_default();
        return Err(format!("Failed to fetch compare diff: {}", err_text).into());
    }

    Ok(json!(""))
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

pub async fn execute_graphql(
    query: &str,
    variables: serde_json::Value,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let client = Client::new();

    let res = client
        .post(GRAPHQL_URL)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .json(&json!({
            "query": query,
            "variables": variables
        }))
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    if let Some(errors) = json_res.get("errors") {
        return Err(format!("GraphQL errors: {}", errors).into());
    }

    Ok(json_res)
}

pub fn build_github_api_url(endpoint: &str) -> Result<url::Url, String> {
    let base_url = url::Url::parse("https://api.github.com").unwrap();
    let target_url = base_url.join(endpoint).map_err(|e| e.to_string())?;

    if target_url.scheme() != "https" {
        return Err("URL scheme must be https".into());
    }
    if target_url.host_str() != Some("api.github.com") {
        return Err("Host must be api.github.com".into());
    }
    if !target_url.username().is_empty() || target_url.password().is_some() {
        return Err("Userinfo is not permitted".into());
    }
    if let Some(port) = target_url.port() {
        if port != 443 {
            return Err("Custom ports are not permitted".into());
        }
    }
    Ok(target_url)
}

pub async fn execute_rest(
    endpoint: &str,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let target_url = build_github_api_url(endpoint)?;
    let token = get_token()?.ok_or("No token")?;
    let client = get_github_client()?;

    let res = client
        .get(target_url)
        .bearer_auth(&token)
        .header("User-Agent", "github-graph-browser")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await?;

    let json_res: serde_json::Value = res.json().await?;
    Ok(json_res)
}

pub async fn search_repository(
    owner: &str,
    name: &str,
    query: &str,
    page: u32,
    per_page: u32,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let token = get_token()?.ok_or("No token")?;
    let bounded_page = page.max(1);
    let bounded_per_page = per_page.clamp(1, 100);
    let repository_qualifier = format!("repo:{}/{}", owner, name);
    let effective_query = if query.contains(&repository_qualifier) {
        query.to_string()
    } else {
        format!("{} {}", query, repository_qualifier)
    };
    let mut url = url::Url::parse(&format!("{}/search/code", REST_URL))?;
    url.query_pairs_mut()
        .append_pair("q", &effective_query)
        .append_pair("page", &bounded_page.to_string())
        .append_pair("per_page", &bounded_per_page.to_string());
    let response = Client::new()
        .get(url)
        .bearer_auth(&token)
        .header("User-Agent", "snow-devil")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?;
    let status = response.status();
    if !status.is_success() {
        let message = response.text().await.unwrap_or_default();
        return Err(format!("GitHub repository search failed ({}): {}", status, message).into());
    }
    Ok(response.json().await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_github_api_url_valid() {
        let url = build_github_api_url("/user/repos").unwrap();
        assert_eq!(url.as_str(), "https://api.github.com/user/repos");

        let url = build_github_api_url("/repos/owner/name/pulls?state=open").unwrap();
        assert_eq!(
            url.as_str(),
            "https://api.github.com/repos/owner/name/pulls?state=open"
        );
    }

    #[test]
    fn test_build_github_api_url_invalid_host() {
        assert!(build_github_api_url("https://attacker.example/path").is_err());
        assert!(build_github_api_url("//attacker.example/path").is_err());
        assert!(build_github_api_url("http://api.github.com/path").is_err()); // HTTP not allowed
    }

    #[test]
    fn test_build_github_api_url_userinfo() {
        assert!(build_github_api_url("https://attacker:password@api.github.com/path").is_err());
        assert!(build_github_api_url("@attacker.example/path").is_ok()); // This evaluates to a valid path: https://api.github.com/@attacker.example/path
    }

    #[test]
    fn test_build_github_api_url_backslash_and_dots() {
        // Backslash authority confusion is rejected by url crate or our host check
        assert!(build_github_api_url("/\\attacker.example/path").is_err());
        assert!(build_github_api_url("\\/attacker.example/path").is_err());
        assert!(build_github_api_url("\\\\attacker.example/path").is_err());

        // Dot segments are resolved safely by the url crate
        let url = build_github_api_url("/repos/owner/name/../../actions").unwrap();
        assert_eq!(url.as_str(), "https://api.github.com/repos/actions");
    }

    #[test]
    fn test_build_github_api_url_fragments_and_crlf() {
        // Fragments are allowed but safely parsed
        let url = build_github_api_url("/path#fragment").unwrap();
        assert_eq!(url.as_str(), "https://api.github.com/path#fragment");

        // Control characters / CRLF will result in URL parsing error or literal encoding by the URL crate.
        // We ensure they do not result in SSRF to another domain.
        let url = build_github_api_url("/path\r\n/extra").unwrap();
        // url crate strips newlines! Wait, WHATWG URL standard strips tabs and newlines during parsing.
        // So \r\n will be stripped, resulting in "/path/extra".
        assert_eq!(url.as_str(), "https://api.github.com/path/extra");
    }
}
