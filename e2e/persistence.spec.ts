import { test, expect } from '@playwright/test';

test.describe('Session Persistence', () => {
  test('Session state restores after simulated application reload', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, '__TAURI_INTERNALS__', {
        value: {
          invoke: async (cmd: string) => {
            if (cmd === 'get_auth_status') return { isAuthenticated: true, account: { login: 'e2e' } };
            if (cmd === 'get_viewer_repositories') return [{ id: 'r1', nameWithOwner: 'e2e/repo1' }];
            if (cmd === 'get_recent_repositories') return [];
            if (cmd === 'get_unassigned_issues') return [];
            if (cmd === 'get_review_requested_pull_requests') return [];
            return null;
          }
        }
      });
    });

    await page.goto('/');
    
    // Open some tabs
    await page.click('text=Account');
    await page.click('text=Repositories');
    
    // Wait for the tab to appear
    await page.waitForSelector('div.workspace-tab:has-text("Account")');
    await page.waitForSelector('div.workspace-tab:has-text("Repositories")');
    
    const initialTabs = await page.locator('.workspace-tab').allInnerTexts();
    expect(initialTabs.length).toBeGreaterThanOrEqual(2);
    
    // Simulate restart
    await page.reload();
    
    // Check if the tabs are restored in the exact same order
    await page.waitForSelector('div.workspace-tab:has-text("Account")');
    await page.waitForSelector('div.workspace-tab:has-text("Repositories")');
    const restoredTabs = await page.locator('.workspace-tab').allInnerTexts();
    
    expect(restoredTabs).toEqual(initialTabs);
  });
});
