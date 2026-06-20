use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;

const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Deserialize)]
pub struct AccessTokenResponse {
    pub access_token: Option<String>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
    pub interval: Option<u64>,
}

pub async fn start_device_flow(
    client_id: &str,
) -> Result<DeviceCodeResponse, Box<dyn Error + Send + Sync>> {
    let client = Client::new();
    let res = client
        .post(DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id),
            ("scope", "repo read:org read:user user:email notifications"),
        ])
        .send()
        .await?;

    let data: DeviceCodeResponse = res.json().await?;
    Ok(data)
}

pub async fn poll_for_token(
    client_id: &str,
    device_code: &str,
) -> Result<Option<String>, Box<dyn Error + Send + Sync>> {
    let client = Client::new();
    let res = client
        .post(ACCESS_TOKEN_URL)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await?;

    let data: AccessTokenResponse = res.json().await?;

    if let Some(token) = data.access_token {
        Ok(Some(token))
    } else if let Some(err) = data.error {
        if err == "authorization_pending" {
            Ok(None)
        } else if err == "slow_down" {
            let new_interval = data.interval.unwrap_or(5);
            Err(format!("slow_down:{}", new_interval).into())
        } else {
            Err(format!("OAuth error: {} - {:?}", err, data.error_description).into())
        }
    } else {
        Err("Unknown response from GitHub".into())
    }
}
