import { test, expect } from '@playwright/test';

test.describe('Navigation and Tab Handling', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Tauri invoke for E2E tests
    await page.addInitScript(() => {
      Object.defineProperty(window, '__TAURI_INTERNALS__', {
        value: {
          invoke: async (cmd: string, args: any) => {
            if (cmd === 'get_auth_status') {
              return {
                isAuthenticated: true,
                account: {
                  id: 'u1', login: 'e2euser', name: 'E2E User',
                  repositories: { totalCount: 2 }, organizations: { totalCount: 2, status: 'ready', source: 'authenticated_active_memberships', nodes: [{ id: 1, login: 'agentrust-io', role: 'member', visibility: 'public', url: 'https://github.com/agentrust-io' }, { id: 2, login: 'Sonicallysquad', role: 'member', visibility: 'private', url: 'https://github.com/Sonicallysquad' }] },
                  pullRequests: { totalCount: 0 }, issues: { totalCount: 1 }
                }
              };
            }
            if (cmd === 'get_viewer_repositories') {
              return [{ id: 'r1', nameWithOwner: 'e2e/repo1', ownership: 'personal', accessKind: 'maintained' }, { id: 'r2', nameWithOwner: 'Sonicallysquad/App', ownership: 'organization', accessKind: 'maintained' }];
            }
            if (cmd === 'get_recent_repositories') {
              return [];
            }
            if (cmd === 'get_source_page') {
              const sourceType = args?.req?.sourceType;
              return { search: { issueCount: sourceType === 'assigned_issues' ? 1 : 0, pageInfo: { hasNextPage: false, endCursor: null }, nodes: sourceType === 'assigned_issues' ? [{ __typename: 'Issue', id: 'org-issue-4', number: 4, title: 'Organization assigned issue', url: 'https://github.com/Sonicallysquad/App/issues/4', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-27T00:00:00Z', state: 'OPEN', author: { __typename: 'User', login: 'author' }, repository: { id: 'r2', name: 'App', nameWithOwner: 'Sonicallysquad/App', owner: { login: 'Sonicallysquad' }, viewerPermission: 'ADMIN', isFork: false }, labels: { nodes: [] }, assignees: { nodes: [{ login: 'e2euser' }] }, comments: { totalCount: 0 } }] : [] } };
            }
            if (cmd === 'get_unassigned_issues') {
              return [];
            }
            if (cmd === 'get_review_requested_pull_requests') {
              return [];
            }
            return null;
          }
        }
      });
    });
    
    await page.goto('/');
  });

  test('Navigator opens singleton system tabs', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER:', msg.text()));
    
    // Check if we are stuck on auth
    const content = await page.content();
    console.log('CONTENT:', content.substring(0, 500));
    
    // Click the singleton Repositories destination
    await page.locator('.navigator').getByText('Repositories', { exact: true }).click();
    await expect(page.locator('.workspace-tab--active .workspace-tab__title')).toHaveText('Repositories', { timeout: 10000 });
    
    // Tab should be added
    let tabs = await page.locator('.workspace-tab').count();
    expect(tabs).toBeGreaterThanOrEqual(2);
    
    // Click Repositories again
    await page.locator('.navigator').getByText('Repositories', { exact: true }).click();
    let tabsAfter = await page.locator('.workspace-tab').count();
    expect(tabsAfter).toBe(tabs); // No duplicate
  });

  test('Repeated tab selection does not remove tabs', async ({ page }) => {
    await page.locator('.navigator').getByText('Flow', { exact: true }).click();
    await page.locator('.navigator').getByText('Repositories', { exact: true }).click();
    
    let tabs = await page.locator('.workspace-tab').count();
    expect(tabs).toBeGreaterThanOrEqual(3);
    
    // Switch between them
    for (let i = 0; i < 5; i++) {
      await page.click('div.workspace-tab:has-text("Flow")');
      await page.click('div.workspace-tab:has-text("Repositories")');
    }
    
    let tabsAfter = await page.locator('.workspace-tab').count();
    expect(tabsAfter).toBe(tabs);
  });

  test('organization badge, page, and repository selector share authenticated account context', async ({ page }) => {
    const organizations = page.getByRole('button', { name: /Organizations 2/ });
    await expect(organizations).toBeVisible();
    await organizations.click();
    await expect(page.locator('.workspace-tab--active .workspace-tab__title')).toHaveText('Organizations');
    await expect(page.getByText('agentrust-io')).toBeVisible();
    await expect(page.getByText('Sonicallysquad')).toBeVisible();

    await page.getByRole('button', { name: 'Repository History', exact: true }).click();
    await page.getByRole('combobox', { name: 'Repository' }).click();
    await expect(page.getByRole('option', { name: 'Sonicallysquad/App' })).toBeVisible();
  });

  test('assigned organization issue appears in account Flow', async ({ page }) => {
    await page.getByRole('button', { name: 'Flow', exact: true }).click();
    await expect(page.locator('.flow-card-title', { hasText: 'Organization assigned issue' })).toBeVisible();
    await expect(page.getByText(/Assigned to you/).first()).toBeVisible();
  });
});
