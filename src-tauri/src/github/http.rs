//! Shared HTTP helpers for GitHub requests.
//!
//! GitHub returns transient failures under two conditions this app regularly
//! hits during larger syncs: rate limits (primary `x-ratelimit-remaining: 0`
//! and secondary `retry-after`) and occasional 5xx responses. Previously every
//! request was a single `.send().await?` with no retry, so a rate-limit window
//! surfaced to the user as a hard sync failure. This module adds bounded
//! exponential backoff that honours GitHub's own timing headers.

use reqwest::header::HeaderMap;
use reqwest::{RequestBuilder, Response, StatusCode};
use std::future::Future;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Maximum number of automatic retries for transient GitHub failures.
const MAX_RETRIES: u32 = 4;
/// Upper bound on any single backoff wait, so the UI never blocks for an
/// unbounded amount of time on a distant rate-limit reset.
const MAX_BACKOFF_SECS: u64 = 60;

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

/// Parse the numeric value of a header, when present and valid.
fn header_u64(headers: &HeaderMap, name: &str) -> Option<u64> {
    headers.get(name)?.to_str().ok()?.trim().parse::<u64>().ok()
}

/// Decide whether a response should be retried and, if so, how long to wait.
///
/// Returns `Some(delay)` for transient GitHub failures that are safe to retry
/// (primary/secondary rate limits or 5xx), and `None` when the caller should
/// surface the response as-is. Kept free of I/O so the timing rules are unit
/// testable without a network.
pub fn retry_delay_for(
    status: StatusCode,
    headers: &HeaderMap,
    attempt: u32,
    now_unix: u64,
) -> Option<Duration> {
    if attempt >= MAX_RETRIES {
        return None;
    }

    if !is_rate_limited(status, headers) && !status.is_server_error() {
        return None;
    }

    // Prefer explicit server guidance (`retry-after`), then the rate-limit
    // reset window, then deterministic exponential backoff.
    let secs = retry_after_secs(headers)
        .or_else(|| rate_limit_reset_secs(headers, now_unix))
        .unwrap_or_else(|| backoff_secs(attempt));

    Some(Duration::from_secs(secs.clamp(1, MAX_BACKOFF_SECS)))
}

/// GitHub signals primary rate limits with `x-ratelimit-remaining: 0` and
/// secondary rate limits with a `retry-after` header, both under 403 or 429.
fn is_rate_limited(status: StatusCode, headers: &HeaderMap) -> bool {
    if status == StatusCode::TOO_MANY_REQUESTS {
        return true;
    }
    if status == StatusCode::FORBIDDEN {
        let exhausted = header_u64(headers, "x-ratelimit-remaining") == Some(0);
        return exhausted || headers.contains_key("retry-after");
    }
    false
}

fn retry_after_secs(headers: &HeaderMap) -> Option<u64> {
    header_u64(headers, "retry-after")
}

fn rate_limit_reset_secs(headers: &HeaderMap, now_unix: u64) -> Option<u64> {
    let reset = header_u64(headers, "x-ratelimit-reset")?;
    Some(reset.saturating_sub(now_unix))
}

fn backoff_secs(attempt: u32) -> u64 {
    // 1s, 2s, 4s, 8s, 16s ...
    1u64 << attempt.min(6)
}

/// Send a request with automatic retry/backoff for transient GitHub failures.
///
/// The builder is cloned per attempt; a request with a non-clonable (streaming)
/// body is sent once without retry.
pub async fn send_with_retry(builder: RequestBuilder) -> reqwest::Result<Response> {
    let mut attempt = 0u32;
    loop {
        let Some(attempt_builder) = builder.try_clone() else {
            return builder.send().await;
        };
        match attempt_builder.send().await {
            Ok(response) => {
                match retry_delay_for(response.status(), response.headers(), attempt, now_unix()) {
                    Some(delay) => {
                        tokio::time::sleep(delay).await;
                        attempt += 1;
                    }
                    None => return Ok(response),
                }
            }
            Err(error) => {
                if (error.is_timeout() || error.is_connect()) && attempt < MAX_RETRIES {
                    tokio::time::sleep(Duration::from_secs(backoff_secs(attempt))).await;
                    attempt += 1;
                } else {
                    return Err(error);
                }
            }
        }
    }
}

/// Ergonomic entry point: `builder.send_retrying().await` in place of
/// `builder.send().await`. The returned future is explicitly `Send` so it
/// composes inside Tauri's multi-threaded async command handlers.
pub trait GithubRequestExt {
    fn send_retrying(self) -> impl Future<Output = reqwest::Result<Response>> + Send;
}

impl GithubRequestExt for RequestBuilder {
    fn send_retrying(self) -> impl Future<Output = reqwest::Result<Response>> + Send {
        send_with_retry(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderName, HeaderValue};

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.insert(
                HeaderName::from_bytes(name.as_bytes()).unwrap(),
                HeaderValue::from_str(value).unwrap(),
            );
        }
        map
    }

    #[test]
    fn honours_retry_after_on_secondary_rate_limit() {
        let delay = retry_delay_for(
            StatusCode::TOO_MANY_REQUESTS,
            &headers(&[("retry-after", "5")]),
            0,
            1_000,
        );
        assert_eq!(delay, Some(Duration::from_secs(5)));
    }

    #[test]
    fn uses_reset_window_on_primary_rate_limit() {
        let delay = retry_delay_for(
            StatusCode::FORBIDDEN,
            &headers(&[
                ("x-ratelimit-remaining", "0"),
                ("x-ratelimit-reset", "1030"),
            ]),
            0,
            1_000,
        );
        assert_eq!(delay, Some(Duration::from_secs(30)));
    }

    #[test]
    fn does_not_retry_plain_permission_forbidden() {
        let delay = retry_delay_for(StatusCode::FORBIDDEN, &HeaderMap::new(), 0, 1_000);
        assert_eq!(delay, None);
    }

    #[test]
    fn retries_server_errors_with_exponential_backoff() {
        assert_eq!(
            retry_delay_for(StatusCode::INTERNAL_SERVER_ERROR, &HeaderMap::new(), 0, 0),
            Some(Duration::from_secs(1))
        );
        assert_eq!(
            retry_delay_for(StatusCode::BAD_GATEWAY, &HeaderMap::new(), 2, 0),
            Some(Duration::from_secs(4))
        );
    }

    #[test]
    fn stops_after_max_retries() {
        let delay = retry_delay_for(
            StatusCode::TOO_MANY_REQUESTS,
            &headers(&[("retry-after", "5")]),
            MAX_RETRIES,
            1_000,
        );
        assert_eq!(delay, None);
    }

    #[test]
    fn clamps_delay_bounds() {
        // A reset already in the past clamps up to the 1s floor.
        assert_eq!(
            retry_delay_for(
                StatusCode::FORBIDDEN,
                &headers(&[("x-ratelimit-remaining", "0"), ("x-ratelimit-reset", "10")]),
                0,
                1_000,
            ),
            Some(Duration::from_secs(1))
        );
        // A very large retry-after clamps down to the ceiling.
        assert_eq!(
            retry_delay_for(
                StatusCode::TOO_MANY_REQUESTS,
                &headers(&[("retry-after", "999")]),
                0,
                1_000,
            ),
            Some(Duration::from_secs(MAX_BACKOFF_SECS))
        );
    }

    #[test]
    fn does_not_retry_success() {
        assert_eq!(
            retry_delay_for(StatusCode::OK, &HeaderMap::new(), 0, 0),
            None
        );
    }
}
