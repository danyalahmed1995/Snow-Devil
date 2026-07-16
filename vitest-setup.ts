import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd) => {
    if (cmd === 'get_auth_status') {
      return {
        isAuthenticated: true,
        token_preview: 'gho_***',
        account: {
          id: 'u1',
          login: 'testuser',
          name: 'Test User',
          avatarUrl: '',
          profileUrl: '',
          repositories: { totalCount: 10 },
          organizations: { totalCount: 2 },
          pullRequests: { totalCount: 5 },
          issues: { totalCount: 3 }
        }
      };
    }
    if (cmd === 'get_viewer_repositories') {
      return [{ id: 'r1', nameWithOwner: 'testuser/repo1', description: 'desc' }];
    }
    if (cmd === 'get_viewer_pull_requests') {
      return [{ id: 'pr1', number: 1, title: 'Fix bug', repository: { nameWithOwner: 'testuser/repo1' } }];
    }
    if (cmd === 'get_viewer_issues') {
      return [{ id: 'i1', number: 2, title: 'Bug found', repository: { nameWithOwner: 'testuser/repo1' } }];
    }
    if (cmd === 'get_recent_repositories') {
      return [];
    }
    // Browser commands – return successfully (no-op in tests)
    if (cmd === 'browser_create') return undefined;
    if (cmd === 'browser_activate') return undefined;
    if (cmd === 'browser_hide_all') return undefined;
    if (cmd === 'browser_close') return undefined;
    if (cmd === 'browser_navigate') return undefined;
    if (cmd === 'browser_back') return undefined;
    if (cmd === 'browser_forward') return undefined;
    if (cmd === 'browser_reload') return undefined;
    if (cmd === 'browser_resize') return undefined;
    if (cmd === 'browser_suspend') return undefined;
    if (cmd === 'browser_clear_data') return undefined;
    if (cmd === 'browser_get_state') {
      return {
        tab_id: '',
        url: '',
        title: '',
        can_go_back: false,
        can_go_forward: false,
        is_loading: false,
      };
    }
    return null;
  })
}));

// Mock Tauri event system
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => {
    // Return an unlisten function
    return () => {};
  }),
}));
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(async () => undefined),
}));
