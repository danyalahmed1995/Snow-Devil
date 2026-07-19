import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('snow-devil-mode', JSON.stringify({ state: { mode: 'demo' }, version: 0 }));
    localStorage.setItem('github-graph-browser-tabs', JSON.stringify({ state: { tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: 1, lastActivatedAt: 1 }], activeTabId: 'native:home', navigationGeneration: 1 }, version: 6 }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { invoke: async () => null, transformCallback: () => 1 } });
  });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Address bar' })).toBeVisible();
});

test('repository snapshot drives PR impact and graph icons remain bounded', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Search and commands' });
  await palette.getByRole('textbox').fill('type:pr native');
  await palette.getByRole('option').click();
  await page.getByRole('button', { name: 'Architecture Context' }).click();
  await expect(page.getByText('Repository snapshot ready')).toBeVisible();
  await expect(page.getByText(/repository files analyzed/)).toBeVisible();
  const icons = page.locator('.architecture-node__icon > svg');
  expect(await icons.count()).toBeGreaterThan(0);
  for (const icon of await icons.all()) {
    const metrics = await icon.evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, position: getComputedStyle(element).position, color: getComputedStyle(element).color }));
    expect(metrics).toMatchObject({ width: 13, height: 13, position: 'static' });
    expect(metrics.color).not.toBe('rgb(255, 255, 255)');
  }
  await expect(page.getByRole('tab', { name: 'Architecture' })).toBeVisible();
});

test('repository explorer exposes the reusable architecture index', async ({ page }) => {
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Search and commands' });
  await palette.getByRole('textbox').fill('type:repo snow');
  await palette.getByRole('option').click();
  await page.getByRole('button', { name: 'Architecture', exact: true }).click();
  await expect(page.getByText('No architectural changes')).toBeVisible();
});
