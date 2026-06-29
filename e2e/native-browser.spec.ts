import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('snow-devil-mode', JSON.stringify({ state: { mode: 'demo' }, version: 0 }));
    localStorage.setItem('github-graph-browser-tabs', JSON.stringify({ state: { tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: 1, lastActivatedAt: 1 }], activeTabId: 'native:home', navigationGeneration: 1 }, version: 4 }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { invoke: async () => null, transformCallback: () => 1 } });
  });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Address bar' })).toBeVisible();
});

test('keyboard palette opens repository, file, and diff views without GitHub traffic', async ({ page }) => {
  let githubRequests = 0;
  page.on('request', request => { if (request.url().includes('api.github.com')) githubRequests++; });

  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Search and commands' });
  await expect(palette).toBeVisible();
  await palette.getByRole('textbox').fill('type:repo snow');
  await palette.getByRole('option').click();
  await expect(page.getByRole('heading', { name: 'nova-labs/snow-devil' })).toBeVisible();

  await page.getByRole('treeitem', { name: 'src' }).click();
  await page.getByRole('treeitem', { name: 'app' }).click();
  await page.getByRole('treeitem', { name: 'App.tsx' }).click();
  await page.getByRole('textbox', { name: 'Search in file' }).fill('Layout');
  await expect(page.locator('.code-preview tr.is-match')).toHaveCount(2);

  await page.keyboard.press('Control+K');
  await palette.getByRole('textbox').fill('type:pr native');
  await palette.getByRole('option').click();
  await expect(page.getByText('2 changed files')).toBeVisible();
  await page.getByRole('button', { name: 'Split' }).click();
  await expect(page.locator('.diff-split')).toHaveCount(2);
  expect(githubRequests).toBe(0);
});

test('1280 by 800 keeps the explorer contained', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Search and commands' });
  await palette.getByRole('textbox').fill('type:repo snow');
  await palette.getByRole('option').click();
  const dimensions = await page.locator('.repo-explorer').evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  expect(dimensions.scrollHeight).toBe(dimensions.clientHeight);
});
