/**
 * Browser URL utilities for the Snow Devil browser-core pivot.
 *
 * Handles classification, normalization, tab-ID generation,
 * semantic titling, and address-bar input parsing for GitHub URLs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The sub-kinds a browser tab can represent. */
export type BrowserTabKind =
  | "profile"
  | "organizations"
  | "repositories"
  | "pullRequests"
  | "issues"
  | "notifications"
  | "repository"
  | "pullRequest"
  | "issue"
  | "search"
  | "githubPage";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Quick SHA-256-ish hash for deterministic IDs. Uses djb2 for speed. */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

const GITHUB_HOST_RE = /^(?:https?:\/\/)?(?:www\.)?github\.com/i;

// ---------------------------------------------------------------------------
// URL safety
// ---------------------------------------------------------------------------

/** Allowed URL schemes for navigation. Rejects javascript:, data:, file:, etc. */
export function isSafeScheme(url: string): boolean {
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("vbscript:")
  ) {
    return false;
  }
  // Allow http(s) and bare domains
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    !lower.includes(":")
  ) {
    return true;
  }
  // Block everything else (custom schemes)
  return false;
}

// ---------------------------------------------------------------------------
// Normalisation & detection
// ---------------------------------------------------------------------------

/**
 * Normalise a loose GitHub reference to a canonical `https://github.com/…`
 * URL, or return `null` when the input is not a recognisable GitHub URL.
 *
 * Accepted inputs:
 * - `https://github.com/owner/repo`
 * - `http://github.com/owner/repo`
 * - `github.com/owner/repo`
 * - `owner/repo`          → `https://github.com/owner/repo`
 * - `owner/repo#123`      → `https://github.com/owner/repo/issues/123`
 */
export function normalizeGithubUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Full URL with scheme
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.hostname === "github.com" || u.hostname === "www.github.com") {
        // Normalise to https, strip www
        return `https://github.com${u.pathname}${u.search}${u.hash}`;
      }
    } catch {
      // invalid URL
    }
    return null;
  }

  // Bare github.com/…
  if (/^(?:www\.)?github\.com\//i.test(trimmed)) {
    return normalizeGithubUrl(`https://${trimmed}`);
  }

  // owner/repo shorthand (letters, digits, hyphens, dots, underscores)
  const ownerRepoMatch = trimmed.match(
    /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:#(\d+))?$/
  );
  if (ownerRepoMatch) {
    const [, owner, repo, num] = ownerRepoMatch;
    if (num) {
      return `https://github.com/${owner}/${repo}/issues/${num}`;
    }
    return `https://github.com/${owner}/${repo}`;
  }

  return null;
}

/** Returns `true` when the string looks like a GitHub URL. */
export function isGithubUrl(url: string): boolean {
  return GITHUB_HOST_RE.test(url.trim());
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classify a GitHub URL into a `BrowserTabKind`.
 * Assumes the URL has already been normalised.
 */
export function classifyGithubUrl(url: string): BrowserTabKind {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.replace(/\/+$/, "");
  } catch {
    return "githubPage";
  }

  const segments = pathname.split("/").filter(Boolean);

  // Root pages
  if (segments.length === 0) return "githubPage";

  // /pulls, /issues, /notifications, /settings/organizations
  if (segments[0] === "pulls") return "pullRequests";
  if (segments[0] === "issues" && segments.length === 1) return "issues";
  if (segments[0] === "notifications") return "notifications";
  if (
    segments[0] === "settings" &&
    segments[1] === "organizations"
  ) {
    return "organizations";
  }
  if (segments[0] === "search") return "search";

  // /owner – could be profile or org; treat as profile
  if (segments.length === 1) return "profile";

  // /owner?tab=repositories — handled by query param, but URL still has 1 segment
  // We'll check query separately
  try {
    const u = new URL(url);
    if (segments.length === 1 && u.searchParams.get("tab") === "repositories") {
      return "repositories";
    }
  } catch {
    // ignore
  }

  // /owner/repo
  if (segments.length === 2) return "repository";

  // /owner/repo/pull/123
  if (segments.length >= 4 && segments[2] === "pull") return "pullRequest";

  // /owner/repo/issues/123
  if (segments.length >= 4 && segments[2] === "issues") return "issue";

  return "githubPage";
}

// ---------------------------------------------------------------------------
// Tab IDs
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic tab ID for a URL.
 *
 * Singleton pages produce fixed IDs (`github:profile`, `github:organizations`, …).
 * Entity pages produce entity-scoped IDs (`github:repo:owner/name`, …).
 * Everything else falls back to a hash-based ID.
 */
export function tabIdForUrl(url: string, login?: string): string {
  const kind = classifyGithubUrl(url);

  let pathname: string;
  try {
    pathname = new URL(url).pathname.replace(/\/+$/, "");
  } catch {
    return `github:url:${djb2Hash(url)}`;
  }
  const segments = pathname.split("/").filter(Boolean);

  switch (kind) {
    case "profile": {
      // Only singleton if it's the logged-in user
      if (login && segments.length === 1 && segments[0].toLowerCase() === login.toLowerCase()) {
        return "github:profile";
      }
      return `github:user:${segments[0] ?? djb2Hash(url)}`;
    }
    case "organizations":
      return "github:organizations";
    case "repositories": {
      if (login && segments.length === 1 && segments[0].toLowerCase() === login.toLowerCase()) {
        return "github:repositories";
      }
      return `github:repos:${segments[0] ?? djb2Hash(url)}`;
    }
    case "pullRequests":
      return "github:pull-requests";
    case "issues":
      return "github:issues";
    case "notifications":
      return "github:notifications";
    case "repository":
      return `github:repo:${segments[0]}/${segments[1]}`;
    case "pullRequest":
      return `github:pr:${segments[0]}/${segments[1]}:${segments[3]}`;
    case "issue":
      return `github:issue:${segments[0]}/${segments[1]}:${segments[3]}`;
    case "search":
      return `github:search:${djb2Hash(url)}`;
    default:
      return `github:url:${djb2Hash(url)}`;
  }
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

/** Derive a human-readable title from a GitHub URL. */
export function titleForGithubUrl(url: string): string {
  const kind = classifyGithubUrl(url);

  let pathname: string;
  try {
    pathname = new URL(url).pathname.replace(/\/+$/, "");
  } catch {
    return url;
  }
  const segments = pathname.split("/").filter(Boolean);

  switch (kind) {
    case "profile":
      return segments[0] ?? "Profile";
    case "organizations":
      return "Organizations";
    case "repositories":
      return "Repositories";
    case "pullRequests":
      return "Pull Requests";
    case "issues":
      return "Issues";
    case "notifications":
      return "Notifications";
    case "repository":
      return `${segments[0]}/${segments[1]}`;
    case "pullRequest":
      return `PR #${segments[3]} · ${segments[0]}/${segments[1]}`;
    case "issue":
      return `Issue #${segments[3]} · ${segments[0]}/${segments[1]}`;
    case "search": {
      try {
        const q = new URL(url).searchParams.get("q");
        return q ? `Search: ${q}` : "Search";
      } catch {
        return "Search";
      }
    }
    default:
      return url;
  }
}

// ---------------------------------------------------------------------------
// Address-bar parsing
// ---------------------------------------------------------------------------

export type AddressBarResult =
  | { type: "github-url"; url: string }
  | { type: "repo-shorthand"; url: string }
  | { type: "pr-shorthand"; url: string }
  | { type: "search"; url: string };

/**
 * Parse raw address-bar input and return a resolved URL + classification.
 *
 * Handles:
 * - Full GitHub URLs → `github-url`
 * - `owner/repo` → `repo-shorthand`
 * - `owner/repo#123` → `pr-shorthand` (issue/PR shorthand)
 * - Anything else → `search` (GitHub search query)
 */
export function parseAddressBarInput(input: string): AddressBarResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { type: "search", url: "https://github.com/search" };
  }

  // Full URL
  if (/^https?:\/\//i.test(trimmed) || /^(?:www\.)?github\.com\//i.test(trimmed)) {
    const normalised = normalizeGithubUrl(trimmed);
    if (normalised) {
      return { type: "github-url", url: normalised };
    }
  }

  // owner/repo#123 shorthand
  const prMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)#(\d+)$/);
  if (prMatch) {
    const [, owner, repo, num] = prMatch;
    return {
      type: "pr-shorthand",
      url: `https://github.com/${owner}/${repo}/issues/${num}`,
    };
  }

  // owner/repo shorthand
  const repoMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (repoMatch) {
    const [, owner, repo] = repoMatch;
    return {
      type: "repo-shorthand",
      url: `https://github.com/${owner}/${repo}`,
    };
  }

  // Fallback → search
  return {
    type: "search",
    url: `https://github.com/search?q=${encodeURIComponent(trimmed)}&type=repositories`,
  };
}
