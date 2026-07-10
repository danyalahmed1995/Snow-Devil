import { test, expect } from '@playwright/test';

test.describe('Worktree Environments', () => {
  test.beforeEach(async ({ page }) => {
    // Start at home in demo mode
    await page.goto('/');
    
    // Wait for the app to initialize
    await page.waitForSelector('.dashboard-view');
  });

  test('can open worktrees tab', async ({ page }) => {
    // Navigate via command palette or sidebar if available, or direct navigation if we add a button.
    // For now we will mock the invocation to open the tab since we don't have a stable UI hook.
    await page.evaluate(() => {
      // @ts-ignore
      window.__useTabsStore?.getState().openNativeTab('native:worktrees', 'worktreeEnvironments', 'Local Workspaces', false, true, { type: 'worktreeEnvironments', repositoryRootPath: 'C:\\Projects\\MyRepo' });
    });

    const title = page.locator('.wt-page-title');
    await expect(title).toHaveText('Worktree Environments');
  });

  test('PR checking status shows workspace creation flow', async ({ page }) => {
    // Open a PR tab
    await page.evaluate(() => {
      // @ts-ignore
      window.__useTabsStore?.getState().openNativeTab('native:pr', 'pullRequest', 'PR #123', false, true, { type: 'pullRequest', repository: 'owner/repo', number: 123 });
    });

    // The PR view should render LocalWorkspaceStatus
    // Since mapping is not setup, it will show "No local checkout connected"
    await expect(page.locator('text=No local checkout connected')).toBeVisible();

    // Click connect
    await page.locator('button:has-text("Connect")').click();

    // This opens repository explorer
    await expect(page.locator('.repository-view h1')).toHaveText('owner/repo');
    
    // The mapping section should be visible
    await expect(page.locator('text=Local Checkouts')).toBeVisible();
    await expect(page.locator('text=Connect a local clone')).toBeVisible();

    // Setup mapping
    await page.locator('input[placeholder="e.g. C:\\Projects\\owner\\repo"]').fill('C:\\Projects\\owner\\repo');
    await page.locator('button:has-text("Connect")').click();

    // Go back to the PR tab
    await page.evaluate(() => {
      // @ts-ignore
      window.__useTabsStore?.getState().setActiveTab('native:pr');
    });

    // Now it should show "Local Workspace available"
    await expect(page.locator('text=Local Workspace available')).toBeVisible();

    // Click "Create workspace"
    await page.locator('button:has-text("Create workspace")').click();

    // It should navigate to Worktree Environments and open the create dialog
    await expect(page.locator('.wt-page-title')).toHaveText('Worktree Environments');
    await expect(page.locator('.wt-dialog')).toBeVisible();

    // The branch should be pre-filled
    await expect(page.locator('input[value="pr/123"]')).toBeVisible();
  });
});
