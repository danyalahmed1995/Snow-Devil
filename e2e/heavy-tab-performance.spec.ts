import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('snow-devil-mode', JSON.stringify({ state: { mode: 'demo' }, version: 0 }));
    localStorage.setItem('github-graph-browser-tabs', JSON.stringify({ state: { tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: 1, lastActivatedAt: 1 }], activeTabId: 'native:home', navigationGeneration: 1 }, version: 6 }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { invoke: async () => null, transformCallback: () => 1 } });
  });
  await page.goto('/');
});

test('Delivery Risks paints a loader before content and stays warm', async ({ page }, testInfo) => {
  const measureActivation = async () => {
    await page.evaluate(() => {
      (window as unknown as { __activation?: Record<string, number> }).__activation = {};
      let start = 0;
      document.addEventListener('click', event => {
        const target = (event.target as Element | null)?.closest('button');
        if (target?.textContent?.trim() === 'Delivery Risks') start = performance.now();
      }, { capture: true, once: true });
      const observer = new MutationObserver(() => {
        if (!start) return;
        const text = document.body.textContent ?? '';
        const result = (window as unknown as { __activation: Record<string, number> }).__activation;
        if (!result.loader && text.includes('Loading Delivery Risks')) result.loader = performance.now() - start;
        if (!result.usable && text.includes('Active Risks')) { result.usable = performance.now() - start; observer.disconnect(); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    await page.getByRole('button', { name: 'Delivery Risks', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Active Risks' })).toBeVisible();
    return page.evaluate(() => (window as unknown as { __activation: Record<string, number> }).__activation);
  };

  const cold = await measureActivation();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  const warm = await measureActivation();
  console.info('Delivery Risks activation metrics', JSON.stringify({ cold, warm }));
  await testInfo.attach('delivery-risks-activation.json', { body: JSON.stringify({ cold, warm }, null, 2), contentType: 'application/json' });
  expect(cold.loader).toBeLessThan(100);
  expect(cold.usable).toBeLessThan(1000);
  expect(warm.usable).toBeLessThan(150);
});
