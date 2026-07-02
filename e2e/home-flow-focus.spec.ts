import { expect, test } from '@playwright/test';

type ScrollSample = { active: boolean; height: number; time: number; top: number };
type ScrollCall = { active: boolean; behavior?: ScrollBehavior; height: number; top?: number };

test.use({ video: process.env.CAPTURE_FLOW_VIDEO ? 'on' : 'off' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('snow-devil-mode', JSON.stringify({ state: { mode: 'demo' }, version: 0 }));
    localStorage.setItem('snow-devil-analytics-settings', JSON.stringify({ state: { settings: { businessTimezone: 'Asia/Karachi', reducedMotion: false } }, version: 2 }));
    localStorage.setItem('github-graph-browser-tabs', JSON.stringify({ state: { tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: 1, lastActivatedAt: 1 }], activeTabId: 'native:home', navigationGeneration: 1 }, version: 4 }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { invoke: async () => null, transformCallback: () => 1, unregisterListener: () => undefined } });
    Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', { value: { unregisterListener: () => undefined } });

    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    const samples: ScrollSample[] = [];
    const scrollCalls: ScrollCall[] = [];
    Object.defineProperty(window, 'flowFocusScrollSamples', { value: samples });
    Object.defineProperty(window, 'flowFocusScrollCalls', { value: scrollCalls });
    if (descriptor?.get && descriptor.set) {
      Object.defineProperty(Element.prototype, 'scrollTop', {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value: number) {
          if (this instanceof HTMLElement && this.classList.contains('flow-lane-scroller--focused')) {
            samples.push({
              active: !this.closest('.workspace-native-surface')?.hasAttribute('hidden'),
              height: this.clientHeight,
              time: performance.now(),
              top: value,
            });
          }
          descriptor.set!.call(this, value);
        },
      });
    }
    const originalScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (...args: Parameters<Element['scrollTo']>) {
      if (this instanceof HTMLElement && this.classList.contains('flow-lane-scroller--focused')) {
        const options = typeof args[0] === 'object' ? args[0] : undefined;
        scrollCalls.push({
          active: !this.closest('.workspace-native-surface')?.hasAttribute('hidden'),
          behavior: options?.behavior,
          height: this.clientHeight,
          top: options?.top,
        });
      }
      return originalScrollTo.apply(this, args);
    };
  });
  await page.route('**/demo-data/account/home-pipeline.json', async route => {
    const response = await route.fetch();
    const data = await response.json();
    const template = data.items.find((item: { id: string }) => item.id === 'demo-pr-179');
    data.items.push(...Array.from({ length: 48 }, (_, index) => ({
      ...template,
      id: `demo-generated-merged-${index}`,
      number: 300 + index,
      title: `Generated merged item ${index}`,
      url: `demo://nova-labs/snow-devil/pull/${300 + index}`,
      updatedAt: `2026-02-10T${String(23 - index % 24).padStart(2, '0')}:${String(index).padStart(2, '0')}:00Z`,
      mergedAt: `2026-01-${String(31 - index % 20).padStart(2, '0')}T12:00:00Z`,
    })));
    await route.fulfill({ response, json: data });
  });
  await page.goto('/');
});

test('Home item focus waits for active stable Flow layout and scrolls in one continuous pass', async ({ context, page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const openInFlow = page.getByRole('button', { name: 'Open feat: dark-mode colour palette refresh and CSS variable normalisation in Flow', exact: true });
  await expect(openInFlow).toBeVisible();

  const devtools = process.env.CAPTURE_FLOW_TRACE ? await context.newCDPSession(page) : undefined;
  const tracingComplete = devtools ? new Promise<{ stream: string }>(resolve => devtools.once('Tracing.tracingComplete', resolve)) : undefined;
  if (devtools) {
    await devtools.send('Tracing.start', {
      categories: 'blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,v8.execute',
      options: 'sampling-frequency=10000',
      transferMode: 'ReturnAsStream',
    });
  }
  await openInFlow.click();

  const scroller = page.locator('.flow-lane-scroller--focused');
  const target = scroller.locator('[data-flow-item-id="demo-pr-176"]');
  await expect(scroller).toBeVisible();
  await expect(target).toBeInViewport();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { flowFocusScrollSamples: ScrollSample[] }).flowFocusScrollSamples.length)).toBeGreaterThan(0);

  const samples = await page.evaluate(() => (window as typeof window & { flowFocusScrollSamples: ScrollSample[] }).flowFocusScrollSamples);
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.some(s => s.active)).toBe(true);

  const settledTop = await scroller.evaluate(element => element.scrollTop);
  expect(settledTop).toBeGreaterThan(500);

  if (devtools && tracingComplete) {
    await devtools.send('Tracing.end');
    const { stream } = await tracingComplete;
    const chunks: Buffer[] = [];
    while (true) {
      const chunk = await devtools.send('IO.read', { handle: stream });
      chunks.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8'));
      if (chunk.eof) break;
    }
    await devtools.send('IO.close', { handle: stream });
    const trace = Buffer.concat(chunks);
    if (process.env.CAPTURE_FLOW_TRACE_PATH) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { dirname } = await import('node:path');
      await mkdir(dirname(process.env.CAPTURE_FLOW_TRACE_PATH), { recursive: true });
      await writeFile(process.env.CAPTURE_FLOW_TRACE_PATH, trace);
    }
    await testInfo.attach('devtools-performance-trace', { body: trace, contentType: 'application/json' });
  }
});

test('stage-level Home navigation scrolls the focused outer container when the pointer is over a card', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const mergedStage = page.locator('.home-stage__header').filter({ hasText: 'Merged' });
  await expect(mergedStage).toBeVisible();
  await mergedStage.click();

  const scroller = page.locator('.flow-lane-scroller--focused');
  const card = scroller.locator('[data-flow-item-id="demo-pr-179"]');
  await expect(scroller).toBeVisible();
  await expect(card).toBeVisible();
  expect(await scroller.evaluate(element => element.scrollTop)).toBe(0);
  expect(await scroller.locator('.flow-stage-content').evaluate(element => getComputedStyle(element).overscrollBehaviorY)).toBe('auto');

  await card.hover();
  await page.mouse.wheel(0, 900);
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
});
