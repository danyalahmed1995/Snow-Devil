import { expect, test } from '@playwright/test';

test('restored browser tabs stay dormant at startup and activate on selection', async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now();
    const home = { id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: now, lastActivatedAt: now };
    const browserTabs = Array.from({ length: 5 }, (_, index) => ({
      id: `browser:restored:${index}`,
      family: 'browser',
      kind: 'pullRequest',
      title: index === 0 ? 'Pull requests' : `Restored PR ${index}`,
      canonicalUrl: `https://github.com/acme/repo/pull/${index + 1}`,
      currentUrl: `https://github.com/acme/repo/pull/${index + 1}`,
      history: [`https://github.com/acme/repo/pull/${index + 1}`],
      historyIndex: 0,
      lifecycle: 'resident',
      pinned: false,
      closable: true,
      createdAt: now + index + 1,
      lastActivatedAt: now + index + 1,
    }));
    localStorage.setItem('snow-devil-mode', JSON.stringify({ state: { mode: 'demo' }, version: 0 }));
    localStorage.setItem('github-graph-browser-tabs', JSON.stringify({ state: { tabs: [home, ...browserTabs], activeTabId: browserTabs[0].id, navigationGeneration: 1 }, version: 6 }));
    const commands: string[] = [];
    Object.defineProperty(window, '__snowDevilStartupCommands', { value: commands });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      invoke: async (command: string) => {
        commands.push(command);
        if (command === 'get_auth_status') return { isAuthenticated: false };
        return null;
      },
      transformCallback: () => 1,
    } });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __snowDevilStartupCommands: string[] }).__snowDevilStartupCommands.filter(command => command === 'browser_create'))).toEqual([]);

  await page.getByRole('tab', { name: 'Browser tab: Pull requests' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __snowDevilStartupCommands: string[] }).__snowDevilStartupCommands)).toContain('browser_create');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __snowDevilStartupCommands: string[] }).__snowDevilStartupCommands)).toContain('browser_activate');
});
