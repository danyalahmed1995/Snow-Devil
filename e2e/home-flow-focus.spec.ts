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

  const motion = await page.evaluate(() => new Promise<Array<{ time: number; top: number }>>(resolve => {
    const samples: Array<{ time: number; top: number }> = [];
    const startedAt = performance.now();
    const sample = (time: number) => {
      const target = document.querySelector<HTMLElement>('[data-flow-item-id="demo-pr-176"]');
      if (target) samples.push({ time, top: target.getBoundingClientRect().top });
      if (time - startedAt < 800) requestAnimationFrame(sample);
      else resolve(samples);
    };
    requestAnimationFrame(sample);
  }));

  const scroller = page.locator('.flow-lane-scroller--focused');
  const target = scroller.locator('[data-flow-item-id="demo-pr-176"]');
  await expect(scroller).toBeVisible();
  await expect(target).toBeInViewport();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { flowFocusScrollCalls: ScrollCall[] }).flowFocusScrollCalls.length)).toBe(1);

  const samples = await page.evaluate(() => (window as typeof window & { flowFocusScrollSamples: ScrollSample[] }).flowFocusScrollSamples);
  const scrollCalls = await page.evaluate(() => (window as typeof window & { flowFocusScrollCalls: ScrollCall[] }).flowFocusScrollCalls);
  expect(samples).toHaveLength(0);
  expect(scrollCalls).toEqual([expect.objectContaining({ active: true, behavior: 'smooth' })]);
  const movingFrames = motion.filter((sample, index) => index > 0 && Math.abs(sample.top - motion[index - 1].top) > 0.5);
  expect(movingFrames.length).toBeGreaterThan(8);
  for (let index = 1; index < motion.length; index += 1) expect(motion[index].top).toBeLessThanOrEqual(motion[index - 1].top + 0.5);

  const callsAtSettle = scrollCalls.length;
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as typeof window & { flowFocusScrollCalls: ScrollCall[] }).flowFocusScrollCalls.length)).toBe(callsAtSettle);

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

test('mixed-direction wheel input cancels focus motion and keeps native scrolling as the sole owner', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const openInFlow = page.getByRole('button', { name: 'Open feat: dark-mode colour palette refresh and CSS variable normalisation in Flow', exact: true });
  await expect(openInFlow).toBeVisible();
  await openInFlow.click();

  const scroller = page.locator('.flow-lane-scroller--focused');
  const card = scroller.locator('[data-flow-item-id="demo-pr-179"]');
  await expect(scroller).toBeVisible();
  await expect(card).toBeVisible();
  await page.waitForTimeout(100);

  const maximum = await scroller.evaluate(element => element.scrollHeight - element.clientHeight);
  await card.evaluate((element, deltas) => {
    for (const deltaY of deltas) element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY }));
  }, [500, -60, 400]);
  await page.waitForTimeout(20);
  const afterGesture = await scroller.evaluate(element => element.scrollTop);

  expect(await scroller.locator('.flow-workbench-pipeline').evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);

  const settledTop = afterGesture;
  await page.waitForTimeout(250);
  expect(await scroller.evaluate(element => element.scrollTop)).toBe(settledTop);
  const scrollCalls = await page.evaluate(() => (window as typeof window & { flowFocusScrollCalls: ScrollCall[] }).flowFocusScrollCalls);
  expect(scrollCalls).toHaveLength(2);
  expect(scrollCalls[0]).toEqual(expect.objectContaining({ behavior: 'smooth' }));
  expect(scrollCalls[1]).toEqual(expect.objectContaining({ behavior: 'auto' }));
  expect(afterGesture).toBeCloseTo(Math.min(maximum, scrollCalls[1].top! + 900), 0);
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
