//! URL normalization and GitHub-aware tab identity.
//!
//! This module lets the frontend ask "which tab should this URL open in?" and
//! get a deterministic answer based on the URL structure.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use url::Url;

// ---------------------------------------------------------------------------
// Tab identity
// ---------------------------------------------------------------------------

/// Logical identity of a browser tab so that duplicate-tab prevention works.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TabIdentity {
    /// A well-known singleton page (e.g. `"github:profile"`).
    Singleton(String),
    /// A repository page – one tab per repo.
    Repository { owner: String, name: String },
    /// A specific pull-request.
    PullRequest {
        owner: String,
        name: String,
        number: u64,
    },
    /// A specific issue.
    Issue {
        owner: String,
        name: String,
        number: u64,
    },
    /// Fallback: hash of the normalized URL.
    Url(String),
}

// ---------------------------------------------------------------------------
// Page kind
// ---------------------------------------------------------------------------

/// Coarse classification of a GitHub URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BrowserTabKind {
    Profile,
    Organizations,
    Repositories,
    PullRequests,
    Issues,
    Notifications,
    Repository,
    PullRequest,
    Issue,
    Search,
    GithubPage,
}

// ---------------------------------------------------------------------------
// URL normalization
// ---------------------------------------------------------------------------

/// Parse a loose user input into a fully-qualified GitHub URL.
///
/// Accepted formats:
/// - `https://github.com/owner/repo`
/// - `http://github.com/owner/repo`   (upgraded to https)
/// - `github.com/owner/repo`          (scheme prepended)
/// - `owner/repo`                     (expanded)
/// - `owner/repo#123`                 (expanded to issue URL)
pub fn normalize_github_url(input: &str) -> Result<Url, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("URL is empty".into());
    }

    // Already a full URL?
    if let Ok(parsed) = Url::parse(trimmed) {
        return match parsed.scheme() {
            "https" => Ok(parsed),
            "http" => {
                // Upgrade to HTTPS
                let upgraded = trimmed.replacen("http://", "https://", 1);
                Url::parse(&upgraded).map_err(|e| e.to_string())
            }
            other => Err(format!("Unsupported scheme: {other}")),
        };
    }

    // github.com/… without scheme
    if trimmed.starts_with("github.com/") || trimmed.starts_with("www.github.com/") {
        let full = format!("https://{trimmed}");
        return Url::parse(&full).map_err(|e| e.to_string());
    }

    // owner/repo or owner/repo#123
    if let Some((owner_repo, fragment)) = trimmed.split_once('#') {
        // owner/repo#123 → issue
        if let Some((owner, repo)) = owner_repo.split_once('/') {
            if !owner.is_empty() && !repo.is_empty() && repo.chars().all(|c| c != '/') {
                if let Ok(num) = fragment.parse::<u64>() {
                    let full = format!("https://github.com/{owner}/{repo}/issues/{num}");
                    return Url::parse(&full).map_err(|e| e.to_string());
                }
            }
        }
    }

    // owner/repo
    if let Some((owner, repo)) = trimmed.split_once('/') {
        if !owner.is_empty()
            && !repo.is_empty()
            && !repo.contains('/')
            && owner
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
            && repo
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        {
            let full = format!("https://github.com/{owner}/{repo}");
            return Url::parse(&full).map_err(|e| e.to_string());
        }
    }

    Err(format!("Cannot parse as GitHub URL: {trimmed}"))
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/// Classify a GitHub URL by its path structure.
pub fn classify_github_url(url: &Url) -> BrowserTabKind {
    let segments: Vec<&str> = url.path_segments().map(|s| s.collect()).unwrap_or_default();

    // Filter out empty trailing segments
    let segments: Vec<&str> = segments.into_iter().filter(|s| !s.is_empty()).collect();

    match segments.as_slice() {
        // Root or dashboard
        [] => BrowserTabKind::Profile,

        // Top-level singleton pages
        ["notifications"] => BrowserTabKind::Notifications,
        ["pulls"] => BrowserTabKind::PullRequests,
        ["issues"] => BrowserTabKind::Issues,
        ["organizations"] | ["settings", "organizations"] => BrowserTabKind::Organizations,
        ["search", ..] => BrowserTabKind::Search,

        // /:owner/:repo/pull/:number
        [_owner, _repo, "pull", num] if num.parse::<u64>().is_ok() => BrowserTabKind::PullRequest,

        // /:owner/:repo/issues/:number
        [_owner, _repo, "issues", num] if num.parse::<u64>().is_ok() => BrowserTabKind::Issue,

        // /:owner/:repo  or  /:owner/:repo/…
        [_owner, _repo, ..] => BrowserTabKind::Repository,

        // /:user (profile page or org page)
        [_user] => BrowserTabKind::Profile,
    }
}

/// Derive a tab identity from a URL so the shell can decide whether to reuse
/// an existing tab or open a new one.
pub fn tab_identity_for_url(url: &Url, login: Option<&str>) -> TabIdentity {
    let segments: Vec<&str> = url
        .path_segments()
        .map(|s| s.filter(|seg| !seg.is_empty()).collect())
        .unwrap_or_default();

    match segments.as_slice() {
        [] => {
            if let Some(user) = login {
                TabIdentity::Singleton(format!("github:profile:{user}"))
            } else {
                TabIdentity::Singleton("github:dashboard".into())
            }
        }
        ["notifications"] => TabIdentity::Singleton("github:notifications".into()),
        ["pulls"] => TabIdentity::Singleton("github:pulls".into()),
        ["issues"] => TabIdentity::Singleton("github:issues".into()),

        [owner, repo, "pull", num] => {
            if let Ok(n) = num.parse::<u64>() {
                TabIdentity::PullRequest {
                    owner: owner.to_string(),
                    name: repo.to_string(),
                    number: n,
                }
            } else {
                hash_url_identity(url)
            }
        }

        [owner, repo, "issues", num] => {
            if let Ok(n) = num.parse::<u64>() {
                TabIdentity::Issue {
                    owner: owner.to_string(),
                    name: repo.to_string(),
                    number: n,
                }
            } else {
                hash_url_identity(url)
            }
        }

        [owner, repo] => TabIdentity::Repository {
            owner: owner.to_string(),
            name: repo.to_string(),
        },

        // Sub-pages of a repo still map to the repo identity
        [owner, repo, ..] => TabIdentity::Repository {
            owner: owner.to_string(),
            name: repo.to_string(),
        },

        _ => hash_url_identity(url),
    }
}

/// Produce a human-readable title for a GitHub URL.
pub fn title_for_github_url(url: &Url) -> String {
    let segments: Vec<&str> = url
        .path_segments()
        .map(|s| s.filter(|seg| !seg.is_empty()).collect())
        .unwrap_or_default();

    match segments.as_slice() {
        [] => "GitHub".into(),
        ["notifications"] => "Notifications".into(),
        ["pulls"] => "Pull Requests".into(),
        ["issues"] => "Issues".into(),
        [owner, repo, "pull", num] => format!("{owner}/{repo}#{num}"),
        [owner, repo, "issues", num] => format!("{owner}/{repo}#{num}"),
        [owner, repo, ..] => format!("{owner}/{repo}"),
        [user] => user.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn hash_url_identity(url: &Url) -> TabIdentity {
    let mut hasher = DefaultHasher::new();
    url.as_str().hash(&mut hasher);
    TabIdentity::Url(format!("{:016x}", hasher.finish()))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- normalize_github_url ----------------------------------------------

    #[test]
    fn normalize_full_https() {
        let url = normalize_github_url("https://github.com/tauri-apps/tauri").unwrap();
        assert_eq!(url.as_str(), "https://github.com/tauri-apps/tauri");
    }

    #[test]
    fn normalize_upgrades_http() {
        let url = normalize_github_url("http://github.com/owner/repo").unwrap();
        assert_eq!(url.scheme(), "https");
    }

    #[test]
    fn normalize_prepends_scheme() {
        let url = normalize_github_url("github.com/owner/repo").unwrap();
        assert_eq!(url.as_str(), "https://github.com/owner/repo");
    }

    #[test]
    fn normalize_owner_repo_shorthand() {
        let url = normalize_github_url("tauri-apps/tauri").unwrap();
        assert_eq!(url.as_str(), "https://github.com/tauri-apps/tauri");
    }

    #[test]
    fn normalize_owner_repo_issue_shorthand() {
        let url = normalize_github_url("tauri-apps/tauri#1234").unwrap();
        assert_eq!(
            url.as_str(),
            "https://github.com/tauri-apps/tauri/issues/1234"
        );
    }

    #[test]
    fn normalize_empty_errors() {
        assert!(normalize_github_url("").is_err());
    }

    #[test]
    fn normalize_bad_scheme_errors() {
        assert!(normalize_github_url("ftp://github.com/x/y").is_err());
    }

    // -- classify_github_url -----------------------------------------------

    #[test]
    fn classify_root_as_profile() {
        let url = Url::parse("https://github.com/").unwrap();
        assert_eq!(classify_github_url(&url), BrowserTabKind::Profile);
    }

    #[test]
    fn classify_notifications() {
        let url = Url::parse("https://github.com/notifications").unwrap();
        assert_eq!(classify_github_url(&url), BrowserTabKind::Notifications);
    }

    #[test]
    fn classify_repo() {
        let url = Url::parse("https://github.com/owner/repo").unwrap();
        assert_eq!(classify_github_url(&url), BrowserTabKind::Repository);
    }

    #[test]
    fn classify_pr() {
        let url = Url::parse("https://github.com/owner/repo/pull/42").unwrap();
        assert_eq!(classify_github_url(&url), BrowserTabKind::PullRequest);
    }

    #[test]
    fn classify_issue() {
        let url = Url::parse("https://github.com/owner/repo/issues/7").unwrap();
        assert_eq!(classify_github_url(&url), BrowserTabKind::Issue);
    }

    #[test]
    fn classify_search() {
        let url = Url::parse("https://github.com/search?q=tauri").unwrap();
        assert_eq!(classify_github_url(&url), BrowserTabKind::Search);
    }

    #[test]
    fn classify_user_profile() {
        let url = Url::parse("https://github.com/octocat").unwrap();
        assert_eq!(classify_github_url(&url), BrowserTabKind::Profile);
    }

    // -- tab_identity_for_url ----------------------------------------------

    #[test]
    fn identity_singleton_notifications() {
        let url = Url::parse("https://github.com/notifications").unwrap();
        assert_eq!(
            tab_identity_for_url(&url, None),
            TabIdentity::Singleton("github:notifications".into())
        );
    }

    #[test]
    fn identity_repo() {
        let url = Url::parse("https://github.com/owner/repo").unwrap();
        assert_eq!(
            tab_identity_for_url(&url, None),
            TabIdentity::Repository {
                owner: "owner".into(),
                name: "repo".into(),
            }
        );
    }

    #[test]
    fn identity_pr() {
        let url = Url::parse("https://github.com/owner/repo/pull/99").unwrap();
        assert_eq!(
            tab_identity_for_url(&url, None),
            TabIdentity::PullRequest {
                owner: "owner".into(),
                name: "repo".into(),
                number: 99,
            }
        );
    }

    #[test]
    fn identity_issue() {
        let url = Url::parse("https://github.com/owner/repo/issues/5").unwrap();
        assert_eq!(
            tab_identity_for_url(&url, None),
            TabIdentity::Issue {
                owner: "owner".into(),
                name: "repo".into(),
                number: 5,
            }
        );
    }

    #[test]
    fn identity_repo_sub_pages_same_identity() {
        let repo = Url::parse("https://github.com/owner/repo").unwrap();
        let tree = Url::parse("https://github.com/owner/repo/tree/main/src").unwrap();
        assert_eq!(
            tab_identity_for_url(&repo, None),
            tab_identity_for_url(&tree, None),
        );
    }

    // -- title_for_github_url ----------------------------------------------

    #[test]
    fn title_root() {
        let url = Url::parse("https://github.com/").unwrap();
        assert_eq!(title_for_github_url(&url), "GitHub");
    }

    #[test]
    fn title_repo() {
        let url = Url::parse("https://github.com/owner/repo").unwrap();
        assert_eq!(title_for_github_url(&url), "owner/repo");
    }

    #[test]
    fn title_pr() {
        let url = Url::parse("https://github.com/owner/repo/pull/42").unwrap();
        assert_eq!(title_for_github_url(&url), "owner/repo#42");
    }
}
