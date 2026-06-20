use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ViewerInfo {
    pub id: String,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
    pub url: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct RepoInfo {
    pub id: String,
    pub name_with_owner: String,
    pub owner: Option<String>,
    pub url: String,
    pub is_private: bool,
    pub description: Option<String>,
    pub primary_language: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PullRequestInfo {
    pub id: String,
    pub number: i64,
    pub title: String,
    pub state: String,
    pub url: String,
    pub updated_at: String,
    pub repository: String,
    pub author: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct IssueInfo {
    pub id: String,
    pub number: i64,
    pub title: String,
    pub state: String,
    pub url: String,
    pub updated_at: String,
    pub repository: String,
    pub author: Option<String>,
}
