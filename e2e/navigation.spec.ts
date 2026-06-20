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
                  repositories: { totalCount: 1 }, organizations: { totalCount: 0 },
                  pullRequests: { totalCount: 0 }, issues: { totalCount: 0 }
                }
              };
            }
            if (cmd === 'get_viewer_repositories') {
              return [{ id: 'r1', nameWithOwner: 'e2e/repo1' }];
            }
            if (cmd === 'get_recent_repositories') {
              return [];
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
    
    // Click Account
    await page.click('text=Account');
    await expect(page.locator('.workspace-tab--active .workspace-tab__title')).toHaveText('Account', { timeout: 10000 });
    
    // Tab should be added
    let tabs = await page.locator('.workspace-tab').count();
    expect(tabs).toBeGreaterThanOrEqual(2);
    
    // Click Account again
    await page.click('text=Account');
    let tabsAfter = await page.locator('.workspace-tab').count();
    expect(tabsAfter).toBe(tabs); // No duplicate
  });

  test('Repeated tab selection does not remove tabs', async ({ page }) => {
    await page.click('text=Account');
    await page.click('text=Repositories');
    
    let tabs = await page.locator('.workspace-tab').count();
    expect(tabs).toBeGreaterThanOrEqual(3);
    
    // Switch between them
    for (let i = 0; i < 5; i++) {
      await page.click('div.workspace-tab:has-text("Account")');
      await page.click('div.workspace-tab:has-text("Repositories")');
    }
    
    let tabsAfter = await page.locator('.workspace-tab').count();
    expect(tabsAfter).toBe(tabs);
  });
});
