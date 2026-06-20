import { describe, it, expect } from 'vitest';
import {
  normalizeGithubUrl,
  isGithubUrl,
  classifyGithubUrl,
  tabIdForUrl,
  titleForGithubUrl,
  parseAddressBarInput,
  isSafeScheme,
} from './browser-url';

// ---------------------------------------------------------------------------
// isSafeScheme
// ---------------------------------------------------------------------------

describe('isSafeScheme', () => {
  it('allows https URLs', () => {
    expect(isSafeScheme('https://github.com')).toBe(true);
  });

  it('allows http URLs', () => {
    expect(isSafeScheme('http://github.com')).toBe(true);
  });

  it('allows bare domains (no scheme)', () => {
    expect(isSafeScheme('github.com/foo')).toBe(true);
  });

  it('blocks javascript: scheme', () => {
    expect(isSafeScheme('javascript:alert(1)')).toBe(false);
  });

  it('blocks data: scheme', () => {
    expect(isSafeScheme('data:text/html,<h1>hi</h1>')).toBe(false);
  });

  it('blocks file: scheme', () => {
    expect(isSafeScheme('file:///etc/passwd')).toBe(false);
  });

  it('blocks blob: scheme', () => {
    expect(isSafeScheme('blob:http://example.com/abc')).toBe(false);
  });

  it('blocks vbscript: scheme', () => {
    expect(isSafeScheme('vbscript:MsgBox("hi")')).toBe(false);
  });

  it('blocks unknown custom schemes', () => {
    expect(isSafeScheme('myapp://callback')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeGithubUrl
// ---------------------------------------------------------------------------

describe('normalizeGithubUrl', () => {
  it('normalises https URL', () => {
    expect(normalizeGithubUrl('https://github.com/owner/repo')).toBe(
      'https://github.com/owner/repo',
    );
  });

  it('normalises http to https', () => {
    expect(normalizeGithubUrl('http://github.com/owner/repo')).toBe(
      'https://github.com/owner/repo',
    );
  });

  it('handles www prefix', () => {
    expect(normalizeGithubUrl('https://www.github.com/owner/repo')).toBe(
      'https://github.com/owner/repo',
    );
  });

  it('handles bare github.com', () => {
    expect(normalizeGithubUrl('github.com/owner/repo')).toBe(
      'https://github.com/owner/repo',
    );
  });

  it('handles owner/repo shorthand', () => {
    expect(normalizeGithubUrl('facebook/react')).toBe(
      'https://github.com/facebook/react',
    );
  });

  it('handles owner/repo#123 shorthand', () => {
    expect(normalizeGithubUrl('facebook/react#456')).toBe(
      'https://github.com/facebook/react/issues/456',
    );
  });

  it('returns null for non-GitHub URL', () => {
    expect(normalizeGithubUrl('https://gitlab.com/foo')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(normalizeGithubUrl('')).toBeNull();
  });

  it('returns null for random text', () => {
    expect(normalizeGithubUrl('hello world')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isGithubUrl
// ---------------------------------------------------------------------------

describe('isGithubUrl', () => {
  it('returns true for https://github.com/…', () => {
    expect(isGithubUrl('https://github.com/owner/repo')).toBe(true);
  });

  it('returns true for http://github.com/…', () => {
    expect(isGithubUrl('http://github.com/issues')).toBe(true);
  });

  it('returns true for bare github.com', () => {
    expect(isGithubUrl('github.com/pulls')).toBe(true);
  });

  it('returns false for non-GitHub URLs', () => {
    expect(isGithubUrl('https://gitlab.com')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyGithubUrl
// ---------------------------------------------------------------------------

describe('classifyGithubUrl', () => {
  it('classifies /pulls as pullRequests', () => {
    expect(classifyGithubUrl('https://github.com/pulls')).toBe('pullRequests');
  });

  it('classifies /issues as issues', () => {
    expect(classifyGithubUrl('https://github.com/issues')).toBe('issues');
  });

  it('classifies /notifications as notifications', () => {
    expect(classifyGithubUrl('https://github.com/notifications')).toBe('notifications');
  });

  it('classifies /settings/organizations as organizations', () => {
    expect(classifyGithubUrl('https://github.com/settings/organizations')).toBe('organizations');
  });

  it('classifies /search as search', () => {
    expect(classifyGithubUrl('https://github.com/search?q=react')).toBe('search');
  });

  it('classifies /owner as profile', () => {
    expect(classifyGithubUrl('https://github.com/octocat')).toBe('profile');
  });

  it('classifies /owner/repo as repository', () => {
    expect(classifyGithubUrl('https://github.com/facebook/react')).toBe('repository');
  });

  it('classifies /owner/repo/pull/123 as pullRequest', () => {
    expect(classifyGithubUrl('https://github.com/facebook/react/pull/123')).toBe('pullRequest');
  });

  it('classifies /owner/repo/issues/456 as issue', () => {
    expect(classifyGithubUrl('https://github.com/facebook/react/issues/456')).toBe('issue');
  });

  it('classifies deep paths as githubPage', () => {
    expect(classifyGithubUrl('https://github.com/facebook/react/tree/main/src')).toBe('githubPage');
  });
});

// ---------------------------------------------------------------------------
// tabIdForUrl
// ---------------------------------------------------------------------------

describe('tabIdForUrl', () => {
  it('generates singleton ID for logged-in user profile', () => {
    expect(tabIdForUrl('https://github.com/octocat', 'octocat')).toBe('github:profile');
  });

  it('generates user-scoped ID for other profiles', () => {
    expect(tabIdForUrl('https://github.com/someuser', 'octocat')).toBe('github:user:someuser');
  });

  it('generates singleton ID for /pulls', () => {
    expect(tabIdForUrl('https://github.com/pulls')).toBe('github:pull-requests');
  });

  it('generates singleton ID for /issues', () => {
    expect(tabIdForUrl('https://github.com/issues')).toBe('github:issues');
  });

  it('generates singleton ID for /notifications', () => {
    expect(tabIdForUrl('https://github.com/notifications')).toBe('github:notifications');
  });

  it('generates entity ID for repos', () => {
    expect(tabIdForUrl('https://github.com/facebook/react')).toBe('github:repo:facebook/react');
  });

  it('generates entity ID for PRs', () => {
    expect(tabIdForUrl('https://github.com/facebook/react/pull/123')).toBe('github:pr:facebook/react:123');
  });

  it('generates entity ID for issues', () => {
    expect(tabIdForUrl('https://github.com/facebook/react/issues/456')).toBe('github:issue:facebook/react:456');
  });

  it('generates hash-based ID for generic pages', () => {
    const id = tabIdForUrl('https://github.com/facebook/react/tree/main/src');
    expect(id).toMatch(/^github:url:/);
  });
});

// ---------------------------------------------------------------------------
// titleForGithubUrl
// ---------------------------------------------------------------------------

describe('titleForGithubUrl', () => {
  it('returns owner for profile', () => {
    expect(titleForGithubUrl('https://github.com/octocat')).toBe('octocat');
  });

  it('returns Organizations for org settings', () => {
    expect(titleForGithubUrl('https://github.com/settings/organizations')).toBe('Organizations');
  });

  it('returns repo name for repository', () => {
    expect(titleForGithubUrl('https://github.com/facebook/react')).toBe('facebook/react');
  });

  it('returns PR title for pull request', () => {
    expect(titleForGithubUrl('https://github.com/facebook/react/pull/123')).toBe(
      'PR #123 · facebook/react',
    );
  });

  it('returns issue title for issue', () => {
    expect(titleForGithubUrl('https://github.com/facebook/react/issues/456')).toBe(
      'Issue #456 · facebook/react',
    );
  });

  it('returns search query for search', () => {
    expect(titleForGithubUrl('https://github.com/search?q=zustand')).toBe('Search: zustand');
  });
});

// ---------------------------------------------------------------------------
// parseAddressBarInput
// ---------------------------------------------------------------------------

describe('parseAddressBarInput', () => {
  it('parses full GitHub URL', () => {
    const result = parseAddressBarInput('https://github.com/facebook/react');
    expect(result.type).toBe('github-url');
    expect(result.url).toBe('https://github.com/facebook/react');
  });

  it('parses bare github.com URL', () => {
    const result = parseAddressBarInput('github.com/pulls');
    expect(result.type).toBe('github-url');
    expect(result.url).toBe('https://github.com/pulls');
  });

  it('parses owner/repo shorthand', () => {
    const result = parseAddressBarInput('facebook/react');
    expect(result.type).toBe('repo-shorthand');
    expect(result.url).toBe('https://github.com/facebook/react');
  });

  it('parses owner/repo#123 shorthand', () => {
    const result = parseAddressBarInput('facebook/react#42');
    expect(result.type).toBe('pr-shorthand');
    expect(result.url).toBe('https://github.com/facebook/react/issues/42');
  });

  it('falls back to search for unknown text', () => {
    const result = parseAddressBarInput('zustand state management');
    expect(result.type).toBe('search');
    expect(result.url).toContain('github.com/search');
    expect(result.url).toContain('zustand');
  });

  it('returns search for empty input', () => {
    const result = parseAddressBarInput('');
    expect(result.type).toBe('search');
  });
});
