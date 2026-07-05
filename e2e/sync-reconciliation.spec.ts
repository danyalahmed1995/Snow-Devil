import { expect, test } from '@playwright/test';

test('CI Health keeps the previous snapshot visible while a refresh job runs', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('snow-devil-mode', JSON.stringify({ state: { mode: 'live' }, version: 0 }));
    localStorage.setItem('github-graph-browser-tabs', JSON.stringify({ state: { tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: 1, lastActivatedAt: 1 }], activeTabId: 'native:home', navigationGeneration: 1 }, version: 4 }));
    const syncState = {
      account_login: 'e2euser', status: 'syncing', current_stage: 'checks', current_repository: 'Sonicallysquad/App',
      completed_repositories_json: JSON.stringify(['e2e/repo1', 'Sonicallysquad/App']), failed_repositories_json: '[]',
      continuation_json: JSON.stringify({ currentJob: { completedRepositories: 1, failedRepositories: 0, totalRepositories: 3, normalizedRecords: 25 } }),
      last_attempted_at: '2026-06-28T12:00:00Z', last_successful_at: '2026-06-27T12:00:00Z', retention_start: '2026-03-01T00:00:00Z', coverage_start: '2026-03-01T00:00:00Z', coverage_end: '2026-06-27T12:00:00Z',
      counts_json: JSON.stringify({ accessible_repositories: 3, included_repositories: 3, eligible_repositories: 3, repositories: 3, pull_requests: 12, issues: 8 }), rate_limit_json: null, error: null, settings_fingerprint: 'e2e',
    };
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { transformCallback: () => 1, invoke: async (cmd: string) => {
      if (cmd === 'get_auth_status') return { isAuthenticated: true, account: { login: 'e2euser', name: 'E2E User', avatarUrl: '', repositories: { totalCount: 3 }, organizations: { totalCount: 2, status: 'ready', nodes: [] }, pullRequests: { totalCount: 12 }, issues: { totalCount: 8 } } };
      if (cmd === 'get_analytics_sync_state') return syncState;
      if (cmd === 'get_viewer_repositories') return [];
      if (cmd === 'load_analytics_records') return [];
      return null;
    } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'CI Activity', exact: true }).click();
  const sync = page.getByRole('region', { name: 'Analytics synchronization and coverage' });
  await expect(sync.getByText('Displaying previous snapshot while refresh runs')).toBeVisible();
  await expect(sync.getByText(/3 accessible · 3 included · 3 eligible · 2 synchronized · 0 failed/)).toBeVisible();
  await expect(sync.getByText(/Current job: repository 2 of 3 · Sonicallysquad\/App/)).toBeVisible();
});
