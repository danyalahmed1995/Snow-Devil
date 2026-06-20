//! Navigation policy – decides what happens when a browser webview tries to
//! navigate to a URL.
//!
//! Design principles:
//! - Only HTTPS GitHub domains are rendered in-app.
//! - HTTP/HTTPS to other domains are opened externally.
//! - Dangerous schemes (javascript:, data:, file:, blob:) are blocked outright.

use url::Url;

/// Result of classifying a navigation request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NavigationDecision {
    /// Render inside the child webview.
    Allow,
    /// Open in the user's default browser.
    OpenExternal,
    /// Silently block (dangerous scheme).
    Block,
}

/// Returns `true` if `url` points to an allowed GitHub domain over HTTPS.
pub fn is_allowed_github_domain(url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    match url.host_str() {
        Some(host) => {
            let host_lower = host.to_ascii_lowercase();
            host_lower == "github.com"
                || host_lower == "www.github.com"
                || host_lower == "gist.github.com"
                || host_lower.ends_with(".github.com")
        }
        None => false,
    }
}

/// Classify a navigation URL into allow / open-external / block.
pub fn classify_navigation(url: &Url) -> NavigationDecision {
    match url.scheme() {
        "https" => {
            if is_allowed_github_domain(url) {
                NavigationDecision::Allow
            } else {
                NavigationDecision::OpenExternal
            }
        }
        "http" => NavigationDecision::OpenExternal,
        // Block everything else: javascript, data, file, blob, custom …
        _ => NavigationDecision::Block,
    }
}

/// Returns `true` when a URL is safe to hand off to the OS's default browser.
pub fn is_safe_external_url(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
}

/// Convert an arbitrary `tab_id` into a webview-label-safe string.
///
/// Rules:
/// - Prefix with `browser-` so capabilities never match.
/// - Replace any character that is not ASCII alphanumeric, `-`, or `_` with `_`.
/// - Truncate to 128 chars total.
pub fn sanitize_webview_label(tab_id: &str) -> String {
    let mut label = String::with_capacity(8 + tab_id.len());
    label.push_str("browser-");
    for ch in tab_id.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            label.push(ch);
        } else {
            label.push('_');
        }
    }
    label.truncate(128);
    label
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- is_allowed_github_domain ------------------------------------------

    #[test]
    fn allows_github_com() {
        let url = Url::parse("https://github.com/tauri-apps/tauri").unwrap();
        assert!(is_allowed_github_domain(&url));
    }

    #[test]
    fn allows_www_github_com() {
        let url = Url::parse("https://www.github.com/").unwrap();
        assert!(is_allowed_github_domain(&url));
    }

    #[test]
    fn allows_gist_github_com() {
        let url = Url::parse("https://gist.github.com/user/abc123").unwrap();
        assert!(is_allowed_github_domain(&url));
    }

    #[test]
    fn allows_subdomain_github_com() {
        let url = Url::parse("https://docs.github.com/en/get-started").unwrap();
        assert!(is_allowed_github_domain(&url));
    }

    #[test]
    fn rejects_http_github() {
        let url = Url::parse("http://github.com/tauri-apps/tauri").unwrap();
        assert!(!is_allowed_github_domain(&url));
    }

    #[test]
    fn rejects_non_github() {
        let url = Url::parse("https://evil.com").unwrap();
        assert!(!is_allowed_github_domain(&url));
    }

    #[test]
    fn rejects_github_lookalike() {
        let url = Url::parse("https://notgithub.com/foo").unwrap();
        assert!(!is_allowed_github_domain(&url));
    }

    // -- classify_navigation -----------------------------------------------

    #[test]
    fn classify_github_https_allowed() {
        let url = Url::parse("https://github.com/owner/repo").unwrap();
        assert_eq!(classify_navigation(&url), NavigationDecision::Allow);
    }

    #[test]
    fn classify_external_https_opens_externally() {
        let url = Url::parse("https://stackoverflow.com").unwrap();
        assert_eq!(classify_navigation(&url), NavigationDecision::OpenExternal);
    }

    #[test]
    fn classify_http_opens_externally() {
        let url = Url::parse("http://example.com").unwrap();
        assert_eq!(classify_navigation(&url), NavigationDecision::OpenExternal);
    }

    #[test]
    fn classify_javascript_blocked() {
        let url = Url::parse("javascript:alert(1)").unwrap();
        assert_eq!(classify_navigation(&url), NavigationDecision::Block);
    }

    #[test]
    fn classify_data_blocked() {
        let url = Url::parse("data:text/html,<h1>hi</h1>").unwrap();
        assert_eq!(classify_navigation(&url), NavigationDecision::Block);
    }

    #[test]
    fn classify_file_blocked() {
        let url = Url::parse("file:///etc/passwd").unwrap();
        assert_eq!(classify_navigation(&url), NavigationDecision::Block);
    }

    #[test]
    fn classify_blob_blocked() {
        let url = Url::parse("blob:https://github.com/abc").unwrap();
        assert_eq!(classify_navigation(&url), NavigationDecision::Block);
    }

    // -- is_safe_external_url ----------------------------------------------

    #[test]
    fn safe_external_http() {
        let url = Url::parse("http://example.com").unwrap();
        assert!(is_safe_external_url(&url));
    }

    #[test]
    fn safe_external_https() {
        let url = Url::parse("https://example.com").unwrap();
        assert!(is_safe_external_url(&url));
    }

    #[test]
    fn unsafe_external_javascript() {
        let url = Url::parse("javascript:void(0)").unwrap();
        assert!(!is_safe_external_url(&url));
    }

    // -- sanitize_webview_label --------------------------------------------

    #[test]
    fn label_prefixed() {
        assert!(sanitize_webview_label("tab1").starts_with("browser-"));
    }

    #[test]
    fn label_replaces_special_chars() {
        let label = sanitize_webview_label("tab/1 @foo");
        assert_eq!(label, "browser-tab_1__foo");
    }

    #[test]
    fn label_preserves_safe_chars() {
        let label = sanitize_webview_label("my-tab_2");
        assert_eq!(label, "browser-my-tab_2");
    }

    #[test]
    fn label_truncated() {
        let long = "a".repeat(200);
        let label = sanitize_webview_label(&long);
        assert!(label.len() <= 128);
    }
}
