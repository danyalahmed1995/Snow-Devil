import { expect, test } from '@playwright/test';

const enabled = process.env.RUN_SOAK === '1';
const minutes = Math.max(1, Number(process.env.SOAK_MINUTES ?? 20));

test('notification, history, tooltip, and tab runtime stays bounded', async ({ page }) => {
  test.skip(!enabled, 'Run explicitly with RUN_SOAK=1; the qualification soak is intentionally 20 minutes.');
  test.setTimeout((minutes * 60 + 120) * 1000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore Demo' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

  // Warm each permanently mounted singleton before taking the baseline.
  await page.getByRole('button', { name: 'Repository History', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Repository History/ })).toBeVisible();
  await page.locator('[aria-label^="Open notifications"]').click();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

  const sample = () => page.evaluate(() => ({
    heap: performance.memory?.usedJSHeapSize ?? 0,
    nodes: document.getElementsByTagName('*').length,
    tabs: document.querySelectorAll('.workspace-tab').length,
    tooltips: document.querySelectorAll('[role="tooltip"]').length,
    toasts: document.querySelectorAll('.notification-arrival-toast').length,
  }));
  const baseline = await sample();
  let peakHeap = baseline.heap;
  let peakNodes = baseline.nodes;
  let cycles = 0;
  const deadline = Date.now() + minutes * 60_000;

  while (Date.now() < deadline) {
    const phase = cycles % 4;
    if (phase === 0) {
      await page.getByRole('button', { name: 'Home', exact: true }).first().click();
      const home = page.getByRole('button', { name: 'Home', exact: true }).first();
      await home.hover();
      await expect(page.getByRole('tooltip')).toHaveCount(1);
      await page.keyboard.press('Escape');
    } else if (phase === 1) {
      await page.getByRole('button', { name: 'Repository History', exact: true }).click();
      await page.locator('.simulator-event-row').first().click();
    } else if (phase === 2) {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press('Space');
      await page.locator('[aria-label^="Open notifications"]').click();
    } else {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press('Shift+Space');
      await page.getByRole('button', { name: 'Home', exact: true }).first().click();
    }
    cycles += 1;
    if (cycles % 5 === 0) {
      const current = await sample();
      peakHeap = Math.max(peakHeap, current.heap);
      peakNodes = Math.max(peakNodes, current.nodes);
    }
    await page.waitForTimeout(3_000);
  }

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Shift+Space');
  await page.getByRole('button', { name: 'Home', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await page.waitForTimeout(1_000);
  const final = await sample();
  console.log(`SOAK minutes=${minutes} cycles=${cycles} heap-start=${baseline.heap} heap-end=${final.heap} heap-peak=${peakHeap} nodes-start=${baseline.nodes} nodes-end=${final.nodes} nodes-peak=${peakNodes} tabs=${final.tabs}`);
  expect(final.nodes).toBeLessThan(baseline.nodes + 500);
  expect(final.tabs).toBeLessThanOrEqual(4);
  expect(final.tooltips).toBeLessThanOrEqual(1);
  expect(final.toasts).toBeLessThanOrEqual(1);
  if (baseline.heap > 0) expect(final.heap).toBeLessThan(baseline.heap + 96 * 1024 * 1024);
});
