import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('snow-devil-mode', JSON.stringify({ state: { mode: 'demo' }, version: 0 }));
    localStorage.setItem('snow-devil-analytics-settings', JSON.stringify({ state: { settings: { businessTimezone: 'Asia/Karachi', reducedMotion: false } }, version: 2 }));
    localStorage.removeItem('snow-devil-history-views');
    localStorage.setItem('github-graph-browser-tabs', JSON.stringify({ state: { tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: 1, lastActivatedAt: 1 }], activeTabId: 'native:home', navigationGeneration: 1 }, version: 4 }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { invoke: async () => null, transformCallback: () => 1 } });
  });
  await page.goto('/');
});

test('History disclosures toggle cleanly and playback controls never overlap', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Account History', exact: true }).click();
  const date = page.getByLabel('Selected history date');
  await expect(date).toBeVisible();
  await date.fill('2026-01-31');
  const selected = await date.inputValue();
  const sourceToggle = page.getByRole('button', { name: /Source details/ }).first();
  await sourceToggle.click();
  const sourcePanel = page.getByRole('region', { name: /Source details/ });
  await expect(sourcePanel).toBeVisible();
  await sourcePanel.getByRole('button', { name: 'Close source details' }).click();
  await expect(sourcePanel).toBeHidden();
  await expect(sourceToggle).toBeFocused();
  await sourceToggle.click();
  await sourcePanel.focus();
  await sourcePanel.press('Escape');
  await expect(sourcePanel).toBeHidden();
  await expect(sourceToggle).toBeFocused();

  await page.getByRole('button', { name: 'Animate history', exact: true }).click();
  const playback = page.locator('.history-playback-row');
  await expect(playback).toBeVisible();
  const speed = playback.locator('.history-playback-speed');
  const timeline = playback.locator('.history-playback-timeline');
  const speedBox = (await speed.boundingBox())!;
  const timelineBox = (await timeline.boundingBox())!;
  expect(speedBox.x + speedBox.width <= timelineBox.x || speedBox.y + speedBox.height <= timelineBox.y).toBeTruthy();
  await page.getByRole('button', { name: 'Hide animation controls', exact: true }).click();
  await expect(playback).toBeHidden();
  await expect(date).toHaveValue(selected);
});

test('fixed Home tab reactivates its mounted instance with scroll and no duplicate', async ({ page }) => {
  let historyRequests = 0;
  page.on('request', request => { if (request.url().includes('/demo-data/simulator/account-history.json')) historyRequests += 1; });
  const home = page.locator('.home-command-center');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(home).toBeVisible();
  await home.evaluate(element => { element.scrollTop = 240; element.dispatchEvent(new Event('scroll')); });
  const before = await home.evaluate(element => ({ top: element.scrollTop, max: element.scrollHeight - element.clientHeight }));
  expect(before.top).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Account History', exact: true }).click();
  await expect(page.getByLabel('Selected history date')).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).first().click();
  await expect(home).toBeVisible();
  await expect.poll(() => home.evaluate(element => {
    const max = element.scrollHeight - element.clientHeight;
    return max > 0 ? element.scrollTop / max : 0;
  })).toBeCloseTo(before.top / before.max, 1);
  await expect(page.locator('.workspace-tab').filter({ hasText: /^Home$/ })).toHaveCount(1);
  await expect(page.getByRole('status', { name: 'Loading your GitHub workspace' })).toHaveCount(0);
  const requestsAfterFirstOpen = historyRequests;
  await page.getByRole('button', { name: 'Account History', exact: true }).click();
  await expect(page.getByLabel('Selected history date')).toBeVisible();
  expect(historyRequests).toBe(requestsAfterFirstOpen);
  await expect(page.locator('.workspace-tab').filter({ hasText: /^Account History$/ })).toHaveCount(1);
});

test('focused Flow owns vertical scrolling and preserves it through append, inspector, and tab return', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('.home-stage__header').filter({ hasText: 'Issues' }).click();
  const scroller = page.locator('.flow-lane-scroller--focused');
  await expect(scroller).toBeVisible();
  await page.getByRole('button', { name: /Show 1 more/ }).click();
  await scroller.hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await scroller.focus();
  await scroller.press('End');
  const finalCard = scroller.locator('[data-flow-item-id]').last();
  await expect(finalCard).toBeInViewport();
  await finalCard.click();
  await expect(page.locator('.layout-inspector-close')).toBeVisible();
  await page.locator('.layout-inspector-close').click();
  expect(await scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(finalCard).toBeInViewport();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Flow', exact: true }).click();
  await expect(page.locator('.flow-lane-scroller--focused')).toBeVisible();
  expect(await page.locator('.flow-lane-scroller--focused').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
});

test('Account History cutoff excludes future completion and Today restores latest state', async ({ page }) => {
  await page.getByRole('button', { name: 'Account History', exact: true }).click();
  const date = page.getByLabel('Selected history date');
  await date.fill('2026-01-31');
  const completed = page.locator('.history-entity-grid .simulator-panel').filter({ has: page.getByRole('heading', { name: /Completed by selected date/ }) });
  await expect(completed.getByText('PR #179')).toHaveCount(0);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(completed.getByText('PR #179')).toBeVisible();
  await expect(page.getByText(/Historical evidence only|Authoritative current assertions included/)).toBeVisible();
});

test('Repository History excludes future PRs and restores current active and merged work', async ({ page }) => {
  await page.getByRole('button', { name: 'Repository History', exact: true }).click();
  const date = page.getByLabel('Selected history date');
  await date.fill('2026-01-25');
  await expect(page.getByText('PR #184')).toHaveCount(0);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  const active = page.locator('.history-entity-grid .simulator-panel').filter({ has: page.getByRole('heading', { name: /Active on selected date/ }) });
  const completed = page.locator('.history-entity-grid .simulator-panel').filter({ has: page.getByRole('heading', { name: /Completed by selected date/ }) });
  await expect(active.getByText('PR #184')).toBeVisible();
  await expect(completed.getByText('PR #179')).toBeVisible();
  await expect(page.locator('.history-metric').filter({ hasText: 'Active PRs' }).locator('strong')).not.toHaveText('0');
  await expect(page.locator('.history-metric').filter({ hasText: 'PRs merged' }).locator('strong')).not.toHaveText('0');
});

test('Cumulative Flow plot expands when the inspector closes and responds to live resize', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.getByRole('button', { name: 'Flow Analytics', exact: true }).click();
  const plot = page.locator('.analytics-area-plot');
  await expect(plot).toBeVisible();
  if (await page.locator('.layout-inspector-close').isVisible()) await page.locator('.layout-inspector-close').click();
  await page.waitForTimeout(100);
  const closedWidth = (await plot.boundingBox())!.width;
  await page.locator('.analytics-area-hit').last().dispatchEvent('click');
  await expect(page.locator('.layout-inspector-close')).toBeVisible();
  await expect.poll(async () => (await plot.boundingBox())!.width).toBeLessThan(closedWidth - 100);
  const openWidth = (await plot.boundingBox())!.width;
  await page.locator('.layout-inspector-close').click();
  await expect.poll(async () => (await plot.boundingBox())!.width).toBeGreaterThan(openWidth + 100);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(async () => Number(await plot.getAttribute('data-plot-width'))).toBeLessThan(closedWidth);
});
