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

async function revealOffscreen(page: import('@playwright/test').Page, input: { event: string; key: string; panel: 'active' | 'ci' | 'completed' }) {
  const panel = input.panel === 'ci'
    ? page.getByRole('region', { name: 'CI activity by selected date' })
    : page.locator('.simulator-entities').filter({ has: page.getByRole('heading', { name: input.panel === 'active' ? /Active on selected date/ : /Completed by selected date/ }) });
  const scroller = panel.locator('.simulator-panel__scroll');
  const target = page.locator(`[data-history-target-key="${input.key}"]`);
  const canvas = page.locator('.history-canvas');
  await canvas.evaluate(element => { element.scrollTop = element.scrollHeight; });
  if (await target.count()) {
    await scroller.evaluate((element, key) => {
      const row = element.querySelector<HTMLElement>(`[data-history-target-key="${key}"]`);
      element.scrollTop = row && row.getBoundingClientRect().top < element.getBoundingClientRect().top + element.clientHeight / 2 ? element.scrollHeight : 0;
    }, input.key);
    await expect(target).not.toBeInViewport();
  }
  const listBefore = await scroller.evaluate(element => element.scrollTop);
  const canvasBefore = await canvas.evaluate(element => element.scrollTop);
  await page.locator('.simulator-event-row', { hasText: input.event }).click();
  await expect(target).toHaveClass(/is-revealed/);
  await expect(target).toBeFocused();
  await expect.poll(() => scroller.evaluate((element, key) => {
    const row = element.querySelector<HTMLElement>(`[data-history-target-key="${key}"]`)!;
    const rowBox = row.getBoundingClientRect();
    const listBox = element.getBoundingClientRect();
    const rowTopInContent = element.scrollTop + rowBox.top - listBox.top;
    const centered = rowTopInContent - Math.max(0, (element.clientHeight - rowBox.height) / 2);
    const expected = Math.min(Math.max(0, centered), element.scrollHeight - element.clientHeight);
    return Math.abs(element.scrollTop - expected);
  }, input.key)).toBeLessThan(2);
  expect(await scroller.evaluate((element, key) => {
    const row = element.querySelector<HTMLElement>(`[data-history-target-key="${key}"]`)!;
    const rowBox = row.getBoundingClientRect();
    const listBox = element.getBoundingClientRect();
    return rowBox.bottom > listBox.top && rowBox.top < listBox.bottom;
  }, input.key)).toBe(true);
  expect(await scroller.evaluate(element => element.scrollTop)).not.toBe(listBefore);
  expect(await canvas.evaluate(element => element.scrollTop)).toBe(canvasBefore);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
}

test('Activity reveals off-screen Active issue, Active PR, Completed PR, release, and CI rows', async ({ page }) => {
  test.setTimeout(60_000);
  await page.getByRole('button', { name: 'Account History', exact: true }).click();
  await revealOffscreen(page, { event: 'Opened: #92', key: 'issue:nova-labs/snow-devil:92', panel: 'active' });
  await revealOffscreen(page, { event: 'Approved: PR #184', key: 'pull-request:nova-labs/snow-devil:184', panel: 'active' });
  await revealOffscreen(page, { event: 'Merged: PR #179', key: 'pull-request:nova-labs/snow-devil:179', panel: 'completed' });
  await revealOffscreen(page, { event: 'Released: Northern Lights', key: 'release:nova-labs/snow-devil:v2.4.0', panel: 'completed' });
  await revealOffscreen(page, { event: 'Workflow succeeded: History regression #236', key: 'workflow-run:nova-labs/snow-devil:7996', panel: 'ci' });
});

test('rapid Activity selection leaves only the newest canonical row revealed', async ({ page }) => {
  await page.getByRole('button', { name: 'Account History', exact: true }).click();
  const first = page.locator('.simulator-event-row', { hasText: 'Merged: PR #179' });
  const last = page.locator('.simulator-event-row', { hasText: 'Released: Northern Lights' });
  await first.dispatchEvent('click');
  await last.dispatchEvent('click');
  const finalTarget = page.locator('[data-history-target-key="release:nova-labs/snow-devil:v2.4.0"]');
  await expect(finalTarget).toBeFocused();
  await expect(finalTarget).toHaveClass(/is-revealed/);
  await expect(page.locator('[data-history-target-key="pull-request:nova-labs/snow-devil:179"]')).not.toHaveClass(/is-revealed/);
});

test('sequential History reveals preserve native scrolling and stable scrollbar metrics', async ({ page }) => {
  test.setTimeout(45_000);
  await page.evaluate(() => {
    const telemetry = { scrollToCalls: 0, activeInputListeners: 0 };
    (window as typeof window & { historyRevealTelemetry?: typeof telemetry }).historyRevealTelemetry = telemetry;
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = function (...args) {
      if (this.classList.contains('simulator-panel__scroll')) telemetry.scrollToCalls += 1;
      return originalScrollTo.apply(this, args as [ScrollToOptions]);
    };
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const revealInputs = new Set(['wheel', 'pointerdown', 'touchstart', 'keydown']);
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (this instanceof HTMLElement && this.classList.contains('simulator-panel__scroll') && revealInputs.has(type)) telemetry.activeInputListeners += 1;
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      if (this instanceof HTMLElement && this.classList.contains('simulator-panel__scroll') && revealInputs.has(type)) telemetry.activeInputListeners -= 1;
      return originalRemove.call(this, type, listener, options);
    };
  });
  await page.getByRole('button', { name: 'Account History', exact: true }).click();
  const canvas = page.locator('.history-canvas');
  await canvas.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const panels = page.locator('.workspace-native-surface:not([hidden]) .history-entity-grid .simulator-panel__scroll');
  const active = panels.nth(0);
  const ci = panels.nth(1);
  const completed = panels.nth(2);
  const ciBefore = await ci.evaluate(element => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  await expect(page.locator('.workspace-native-surface:not([hidden]) .history-reveal-spacer')).toHaveCount(0);

  for (const event of ['Opened: #92', 'Approved: PR #184', 'Opened: #92', 'Merged: PR #179', 'Workflow succeeded: History regression #236', 'Released: Northern Lights']) {
    await page.locator('.simulator-event-row', { hasText: event }).dispatchEvent('click');
    await page.waitForTimeout(35);
  }
  const finalTarget = page.locator('[data-history-target-key="release:nova-labs/snow-devil:v2.4.0"]');
  await expect(finalTarget).toBeFocused();
  await page.waitForTimeout(400);

  expect(await page.evaluate(() => (window as typeof window & { historyRevealTelemetry: { scrollToCalls: number; activeInputListeners: number } }).historyRevealTelemetry)).toEqual({ scrollToCalls: 0, activeInputListeners: 0 });
  const ciAfter = await ci.evaluate(element => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop }));
  await page.waitForTimeout(300);
  expect(await ci.evaluate(element => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop }))).toEqual(ciAfter);
  expect(ciAfter.clientHeight).toBe(ciBefore.clientHeight);
  expect(ciAfter.scrollHeight).toBeGreaterThan(ciBefore.scrollHeight);
  expect(ciAfter.scrollHeight).toBeGreaterThan(ciAfter.clientHeight);

  for (const scroller of [active, ci, completed]) {
    await scroller.evaluate(element => { element.scrollTop = 0; });
    await scroller.hover();
    await page.mouse.wheel(0, 120);
    await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  }
  const canvasBeforeKeyboard = await canvas.evaluate(element => element.scrollTop);
  await completed.evaluate(element => { element.scrollTop = 0; });
  await finalTarget.focus();
  await page.keyboard.press('End');
  await expect.poll(() => completed.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await canvas.evaluate(element => element.scrollTop)).toBe(canvasBeforeKeyboard);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('user scrolling cancels an in-flight reveal without stale scroll writes', async ({ page }) => {
  await page.getByRole('button', { name: 'Account History', exact: true }).click();
  const root = page.locator('.workspace-native-surface:not([hidden])');
  const canvas = root.locator('.history-canvas');
  const completed = root.locator('.history-entity-grid .simulator-panel__scroll').nth(2);
  await canvas.evaluate(element => {
    const scroller = element.querySelector<HTMLElement>('.history-entity-grid .simulator-panel__scroll');
    if (!scroller) return;
    element.scrollTop += scroller.getBoundingClientRect().top - (element.getBoundingClientRect().top + 80);
  });
  await completed.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const canvasBefore = await canvas.evaluate(element => element.scrollTop);
  await page.locator('.simulator-event-row', { hasText: 'Released: Northern Lights' }).dispatchEvent('click');
  await page.waitForTimeout(30);
  const box = await completed.boundingBox();
  if (!box) throw new Error('Completed History list is unavailable');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const beforeWheel = await completed.evaluate(element => element.scrollTop);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => completed.evaluate(element => element.scrollTop)).toBeGreaterThan(beforeWheel);
  const afterWheel = await completed.evaluate(element => element.scrollTop);
  await page.waitForTimeout(400);
  expect(await completed.evaluate(element => element.scrollTop)).toBe(afterWheel);
  expect(await canvas.evaluate(element => element.scrollTop)).toBe(canvasBefore);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('History reveal writers clean up on date, mode, tab, and unmount changes', async ({ page }) => {
  await page.evaluate(() => {
    const telemetry = { activeInputListeners: 0 };
    (window as typeof window & { historyRevealCleanup?: typeof telemetry }).historyRevealCleanup = telemetry;
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const revealInputs = new Set(['wheel', 'pointerdown', 'touchstart', 'keydown']);
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (this instanceof HTMLElement && this.classList.contains('simulator-panel__scroll') && revealInputs.has(type)) telemetry.activeInputListeners += 1;
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      if (this instanceof HTMLElement && this.classList.contains('simulator-panel__scroll') && revealInputs.has(type)) telemetry.activeInputListeners -= 1;
      return originalRemove.call(this, type, listener, options);
    };
  });
  const listenerCount = () => page.evaluate(() => (window as typeof window & { historyRevealCleanup: { activeInputListeners: number } }).historyRevealCleanup.activeInputListeners);
  await page.getByRole('button', { name: 'Account History', exact: true }).click();
  await page.locator('.simulator-event-row', { hasText: 'Opened: #92' }).dispatchEvent('click');
  await page.getByRole('textbox', { name: 'Selected history date' }).fill('2026-02-07');
  await expect.poll(listenerCount).toBe(0);
  await page.getByRole('textbox', { name: 'Selected history date' }).fill('2026-02-15');
  await page.locator('.simulator-event-row', { hasText: 'Merged: PR #179' }).dispatchEvent('click');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect.poll(listenerCount).toBe(0);
  await page.evaluate(async () => (await import('/src/stores/mode-store.ts')).useModeStore.setState({ mode: 'live' }));
  await expect.poll(listenerCount).toBe(0);
  await page.evaluate(async () => {
    const store = (await import('/src/stores/mode-store.ts')).useModeStore;
    store.setState({ mode: 'demo' });
    store.getState().resetDemo();
  });
  await expect.poll(listenerCount).toBe(0);
});

test('date and repository changes invalidate pending reveals', async ({ page }) => {
  await page.getByRole('button', { name: 'Repository History', exact: true }).click();
  await page.locator('.simulator-event-row', { hasText: 'Workflow succeeded: History regression #236' }).dispatchEvent('click');
  await page.getByRole('textbox', { name: 'Selected history date' }).fill('2026-02-07');
  await expect(page.locator('[data-history-target-key="workflow-run:nova-labs/snow-devil:7996"]')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Selected history date' }).fill('2026-02-15');
  await page.locator('.simulator-event-row', { hasText: 'Workflow succeeded: History regression #236' }).dispatchEvent('click');
  await page.getByRole('combobox', { name: 'Repository' }).click();
  await page.getByRole('option', { name: 'nova-labs/ext' }).click();
  await expect(page.locator('[data-history-target-key="workflow-run:nova-labs/snow-devil:7996"]')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Repository' })).toContainText('nova-labs/ext');
});

test('filter conflict clears only the local search and reveals the canonical row', async ({ page }) => {
  await page.getByRole('button', { name: 'Account History', exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Search active on selected date' });
  await search.fill('does-not-match');
  await page.locator('.simulator-event-row', { hasText: 'Opened: #92' }).click();
  await page.getByRole('button', { name: 'Reveal item' }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('[data-history-target-key="issue:nova-labs/snow-devil:92"]')).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Selected history date' })).toHaveValue('2026-02-15');
});

test('Reduced Motion keeps reveal focus and uses instant internal scrolling', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('snow-devil-analytics-settings', JSON.stringify({ state: { settings: { reducedMotion: true } }, version: 2 })));
  await page.reload();
  await page.evaluate(() => {
    const original = HTMLElement.prototype.scrollTo;
    (window as typeof window & { revealScrollBehaviors?: unknown[] }).revealScrollBehaviors = [];
    HTMLElement.prototype.scrollTo = function (...args) {
      const options = args[0];
      if (this.classList.contains('simulator-panel__scroll') && typeof options === 'object') (window as typeof window & { revealScrollBehaviors: unknown[] }).revealScrollBehaviors.push(options.behavior);
      return original.apply(this, args as [ScrollToOptions]);
    };
  });
  await page.getByRole('button', { name: 'Account History', exact: true }).click();
  await page.locator('.history-canvas').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.locator('.simulator-event-row', { hasText: 'Merged: PR #179' }).click();
  await expect(page.locator('[data-history-target-key="pull-request:nova-labs/snow-devil:179"]')).toBeFocused();
  expect(await page.evaluate(() => (window as typeof window & { revealScrollBehaviors: unknown[] }).revealScrollBehaviors)).toContain('auto');
});

test('repository switching isolates CI and history scopes', async ({ page }) => {
  await page.getByRole('button', { name: 'Repository History', exact: true }).click();
  await expect(page.getByRole('region', { name: 'CI activity by selected date' })).toContainText('Desktop CI');
  await page.getByRole('combobox', { name: 'Repository' }).click();
  await page.getByRole('option', { name: 'nova-labs/ext' }).click();
  const extCi = page.getByRole('region', { name: 'CI activity by selected date' });
  await expect(extCi).toContainText('No CI evidence by this date');
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

test('Home has no CI presentation and Pipeline Preview regains full width', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1600, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    const pipeline = page.locator('.home-pipeline');
    await expect(pipeline).toBeVisible();
    await expect(pipeline.getByRole('heading', { name: 'CI Watch' })).toHaveCount(0);
    await expect(pipeline.locator('.home-pipeline-ci,.home-pipeline-body,[data-testid="home-ci-watch"]')).toHaveCount(0);
    const widths = await pipeline.evaluate(element => ({ panel: element.clientWidth, groups: element.querySelector<HTMLElement>('.home-pipeline-groups')!.clientWidth }));
    expect(widths.groups).toBeGreaterThan(widths.panel * 0.95);
  }
});

test('Flow has no CI presentation or reserved lane height', async ({ page }) => {
  await page.getByRole('button', { name: 'Flow', exact: true }).click();
  await expect(page.locator('.flow-ci-watch,[data-testid="flow-ci-watch"]')).toHaveCount(0);
  await expect(page.getByTestId('flow-lane-scroller')).toBeVisible();
  const layout = await page.locator('.flow-content').evaluate(element => ({ content: element.clientHeight, lane: element.querySelector<HTMLElement>('[data-testid="flow-lane-scroller"]')!.clientHeight }));
  expect(layout.lane).toBeGreaterThan(layout.content * 0.5);
});

test('Home and Flow leave no dangling CI subscriptions', async ({ page }) => {
  await page.getByRole('button', { name: 'Repository History', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => Object.keys((await import('/src/stores/ci-watcher-store.ts')).useCIWatcherStore.getState().subscriptions).length)).toBe(1);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => Object.keys((await import('/src/stores/ci-watcher-store.ts')).useCIWatcherStore.getState().subscriptions).length)).toBe(0);
  await page.getByRole('button', { name: 'Flow', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => Object.keys((await import('/src/stores/ci-watcher-store.ts')).useCIWatcherStore.getState().subscriptions).length)).toBe(0);
});

test('Repository History exposes CI as the bounded middle historical column', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.getByRole('button', { name: 'Repository History', exact: true }).click();
  const wrapper = page.getByRole('region', { name: 'CI activity by selected date' });
  await expect(wrapper).toBeVisible();
  await expect(wrapper).toContainText('nova-labs/snow-devil');
  await expect(page.getByRole('region', { name: 'Repository workflow activity' })).toHaveCount(0);
  const box = await wrapper.boundingBox();
  expect(box?.height).toBeLessThanOrEqual(300);
  expect(box?.y).toBeLessThan(900);
});

test('singleton Home activation preserves its mounted scroll state', async ({ page }) => {
  const home = page.locator('.home-command-center');
  await home.evaluate(element => { element.scrollTop = 180; });
  const before = await home.evaluate(element => element.scrollTop);
  await page.getByRole('button', { name: 'Flow', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  expect(await home.evaluate(element => element.scrollTop)).toBe(before);
});
