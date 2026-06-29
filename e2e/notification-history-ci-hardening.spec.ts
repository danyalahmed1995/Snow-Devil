import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore Demo' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
});

test('development arrivals aggregate and ignore text controls', async ({ page }) => {
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(page.getByRole('status')).toContainText('2 new GitHub notifications');
  await expect(page.locator('[aria-label^="Open notifications"]')).toHaveAttribute('aria-label', /2 newly arrived/);

  await page.locator('[aria-label^="Open notifications"]').click();
  await expect(page.locator('.notifications-list article.is-test')).toHaveCount(2);
  await page.getByRole('button', { name: 'Repository History', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search active on selected date' }).press('Space');
  await page.locator('[aria-label^="Open notifications"]').click();
  await expect(page.locator('.notifications-list article.is-test')).toHaveCount(2);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Shift+Space');
  await expect(page.locator('.notifications-list article.is-test')).toHaveCount(0);
  await expect(page.locator('.notifications-list article')).toHaveCount(3);
});

test('history events reveal the exact canonical entity without page scrolling', async ({ page }) => {
  await page.getByRole('button', { name: 'Repository History', exact: true }).click();
  const pageScrollBefore = await page.evaluate(() => window.scrollY);
  await page.locator('.simulator-event-row', { hasText: 'Merged: PR #179' }).click();
  const target = page.locator('[data-entity-id="pull-request:nova-labs/snow-devil:179"]');
  await expect(target).toHaveClass(/is-revealed/);
  await expect(target).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);
});

test('repository switching isolates CI and history scopes', async ({ page }) => {
  await page.getByRole('button', { name: 'Repository History', exact: true }).click();
  await expect(page.getByRole('region', { name: 'CI Watcher for nova-labs/snow-devil' })).toContainText('Desktop CI');
  await page.getByRole('combobox', { name: 'Repository' }).click();
  await page.getByRole('option', { name: 'nova-labs/ext' }).click();
  const extCi = page.getByRole('region', { name: 'CI Watcher for nova-labs/ext' });
  await expect(extCi).toContainText('No recent workflow runs');
  await expect(extCi).not.toContainText('nova-labs/snow-devil');
  await expect(page.locator('.simulator-entity-row', { hasText: 'PR #41' })).toBeVisible();
  await expect(page.locator('.simulator-entity-row', { hasText: 'PR #184' })).toHaveCount(0);
});

test('shared tooltips support hover, focus, and Escape', async ({ page }) => {
  const home = page.getByRole('button', { name: 'Home', exact: true });
  await home.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page.getByRole('tooltip')).toContainText('Open or activate this Snow Devil workspace');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByRole('button', { name: 'CI Health', exact: true }).focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
});
