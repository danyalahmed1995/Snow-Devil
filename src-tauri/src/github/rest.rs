use crate::github::http::GithubRequestExt;
use reqwest::Client;
use serde_json::Value;
use std::error::Error;

const REST_URL: &str = "https://api.github.com";

pub async fn get_notifications(token: &str) -> Result<Vec<Value>, Box<dyn Error + Send + Sync>> {
    let client = Client::new();
    let res = client
        .get(format!("{}/notifications", REST_URL))
        .bearer_auth(token)
        .header("User-Agent", "github-graph-browser")
        .header("Accept", "application/vnd.github.v3+json")
        .send_retrying()
        .await?;

    if !res.status().is_success() {
        return Err(format!("Failed to fetch notifications: {}", res.status()).into());
    }

    let items: Vec<Value> = res.json().await?;
    Ok(items)
}
