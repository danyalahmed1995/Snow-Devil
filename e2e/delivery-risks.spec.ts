import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('snow-devil-mode', JSON.stringify({ state: { mode: 'demo' }, version: 0 }));
    localStorage.setItem('github-graph-browser-tabs', JSON.stringify({ state: { tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: 1, lastActivatedAt: 1 }], activeTabId: 'native:home', navigationGeneration: 1 }, version: 4 }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { invoke: async () => null, transformCallback: () => 1 } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Delivery Risks', exact: true }).click();
});

test('Active Risks ranks exact blockers, drives Inspector, and restores muted work', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Delivery Risks' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Active Risks' })).toBeVisible();
  await expect(page.getByLabel('Risk sort')).toHaveText('Priority');
  await expect(page.getByText(/classified items? hidden by the current view/)).toBeVisible();

  const blocked = page.locator('button.analytics-metric').filter({ hasText: 'Blocked' });
  await blocked.click();
  const rows = page.locator('.delivery-risk-table tbody tr');
  await expect(rows.first()).toBeVisible();
  await rows.first().click();
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible();
  await expect(page.getByText('Primary risk')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open CI Activity', exact: true })).toBeVisible();

  const firstMute = rows.first().locator('button[data-tooltip="Mute item"]');
  await firstMute.click();
  await page.getByLabel('Saved Delivery Risks views').click();
  await page.getByRole('option', { name: 'Muted Items' }).click();
  await expect(page.getByRole('button', { name: /^Restore / }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Restore / }).first().click();
});

test('built-in backlog views and a custom default survive reload', async ({ page }) => {
  await page.getByLabel('Saved Delivery Risks views').click();
  await page.getByRole('option', { name: 'Bot Backlog' }).click();
  await expect(page.getByRole('heading', { name: 'Bot Backlog' })).toBeVisible();
  await page.getByLabel('Saved view name').fill('My bot triage');
  await page.getByRole('button', { name: 'Save new' }).click();
  await page.getByRole('button', { name: 'Set default' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Delivery Risks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delivery Risks' })).toBeVisible();
  await expect(page.getByLabel('Saved Delivery Risks views')).toHaveText('My bot triage');
  await expect(page.getByRole('heading', { name: 'Bot Backlog' })).toBeVisible();
});
