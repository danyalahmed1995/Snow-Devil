import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('snow-devil-mode', JSON.stringify({ state: { mode: 'demo' }, version: 0 }));
    localStorage.setItem('github-graph-browser-tabs', JSON.stringify({ state: { tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: 1, lastActivatedAt: 1 }], activeTabId: 'native:home', navigationGeneration: 1 }, version: 4 }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { invoke: async () => null, transformCallback: () => 1 } });
  });
  await page.goto('/');
});

test('Home evidence opens Flow with visible source context', async ({ page }) => {
  const homeAttention = page.getByRole('button', { name: /^Needs Attention:/ });
  await expect.poll(async () => Number(await homeAttention.locator('strong').textContent())).toBeGreaterThan(0);
  const sourceCount = Number(await homeAttention.locator('strong').textContent());
  await homeAttention.click();
  await expect(page.locator('.workspace-tab--active .workspace-tab__title')).toHaveText('Flow');
  await expect(page.getByRole('button', { name: /Opened from Home: Needs attention/i })).toBeVisible();
  await expect(page.getByLabel('Flow view')).toHaveText('Needs attention');
  await expect(page.locator('.flow-supporting > div').filter({ hasText: 'Visible' }).locator('strong')).toHaveText(String(sourceCount));
});

test('Home Issues opens a full-height vertically scrolling focused stage', async ({ page }) => {
  await page.locator('.home-stage__header').filter({ hasText: 'Issues' }).click();
  await expect(page.getByLabel('Flow stage filter')).toHaveText('Issues');
  const focused = page.locator('.flow-lane-scroller--focused');
  await expect(focused).toBeVisible();
  const cards = focused.locator('[data-flow-item-id]');
  await expect(cards.first()).toBeVisible();
  const geometry = await focused.evaluate(element => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  const firstCard = await cards.first().boundingBox();
  expect(firstCard?.height ?? 0).toBeGreaterThan(70);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 2);
  expect(geometry.clientHeight).toBeGreaterThan(150);
});

test('analytics surfaces use responsibility and maintained-repository defaults', async ({ page }) => {
  await page.getByRole('button', { name: 'Personal Focus', exact: true }).click();
  await expect(page.getByLabel('Focus involvement')).toHaveText('Direct responsibility');
  await expect(page.getByLabel('Focus actor')).toHaveText('Humans only');
  await expect(page.getByRole('heading', { name: 'Do now' })).toBeVisible();
  await expect(page.getByText('Bump vite from 7.3.4 to 7.3.5')).toHaveCount(0);

  await page.getByRole('button', { name: 'Delivery Risks', exact: true }).click();
  await expect(page.getByLabel('Delivery Risks repository scope')).toHaveText('Repositories I maintain');
  await expect(page.getByLabel('Saved Delivery Risks views')).toHaveText('Active Risks');

});

test('Account History latest date reconciles a current Flow item', async ({ page }) => {
  await page.getByRole('button', { name: 'Flow', exact: true }).click();
  await expect(page.locator('[data-stage-id="review"] [data-flow-item-id="demo-pr-184"]')).toBeVisible();
  await page.getByRole('button', { name: 'Account History', exact: true }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('.history-entity-grid .simulator-panel').filter({ has: page.getByRole('heading', { name: /Active on selected date/ }) }).getByText('PR #184')).toBeVisible();
});

test('Repository History active PR metric matches the selected-date entity list', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole('button', { name: 'Repository History', exact: true }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  const activePanel = page.locator('.history-entity-grid .simulator-panel').filter({ has: page.getByRole('heading', { name: /Active on selected date/ }) });
  const listedActive = await activePanel.locator('.simulator-entity-row').evaluateAll(rows => rows.filter(row => row.textContent?.includes('Pull request')).length);
  await expect(page.locator('.history-metric').filter({ hasText: 'Active PRs' }).locator('strong')).toHaveText(String(listedActive));
});

test('Personal Focus total equals the exclusive visible section union', async ({ page }) => {
  await page.getByRole('button', { name: 'Personal Focus', exact: true }).click();
  const total = Number(await page.locator('.analytics-metric').filter({ hasText: 'Active responsibilities' }).locator('strong').textContent());
  const sectionTotal = await page.locator('.analytics-focus-grid').evaluate(grid => Array.from(grid.querySelectorAll(':scope > .analytics-card')).filter(section => ['Do now', 'Waiting on others', 'Getting stale'].includes(section.querySelector('h2')?.textContent?.trim() ?? '')).reduce((sum, section) => sum + section.querySelectorAll('.analytics-list > button').length, 0));
  expect(total).toBe(sectionTotal);
});
