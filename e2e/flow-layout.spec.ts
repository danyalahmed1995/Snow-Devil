import { test, expect } from '@playwright/test';

test.describe('Flow Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('snow-devil-mode', JSON.stringify({ state: { mode: 'demo' }, version: 0 }));
      localStorage.setItem('github-graph-browser-tabs', JSON.stringify({ state: { tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: 1, lastActivatedAt: 1 }], activeTabId: 'native:home', navigationGeneration: 1 }, version: 4 }));
      Object.defineProperty(window, '__TAURI_INTERNALS__', {
        value: {
          invoke: async () => null,
          transformCallback: () => 1,
        }
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Flow', exact: true }).click();
    await expect(page.getByTestId('flow-lane-scroller')).toBeVisible();
  });

  test('lane spacing and horizontal scroll', async ({ page }) => {
    // Wait for the pipeline and lanes
    const scroller = page.locator('[data-testid="flow-lane-scroller"]');
    const pipeline = page.locator('[data-testid="flow-pipeline"]');
    
    const lanes = pipeline.locator('.flow-workbench-lane');
    await expect(lanes).toHaveCount(9);

    const issuesLane = lanes.nth(0);
    const codingLane = lanes.nth(1);

    const first = await issuesLane.boundingBox();
    const second = await codingLane.boundingBox();

    // Verify spacing between adjacent lanes (should be ~14px)
    expect(second!.x - (first!.x + first!.width)).toBeGreaterThanOrEqual(12);
    expect(second!.x - (first!.x + first!.width)).toBeLessThanOrEqual(18);

    // Verify lane width is at least 320px
    expect(first!.width).toBeGreaterThanOrEqual(320);

    // Verify all adjacent pairs
    for (let i = 0; i < 8; i++) {
      const left = await lanes.nth(i).boundingBox();
      const right = await lanes.nth(i + 1).boundingBox();
      const gap = right!.x - (left!.x + left!.width);
      expect(gap).toBeGreaterThanOrEqual(12);
      expect(gap).toBeLessThanOrEqual(18);
    }

    // Verify scrolling dimensions
    const dimensions = await scroller.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));

    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);

    // Verify manual scrolling
    await scroller.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });

    const scrollLeft = await scroller.evaluate(
      (element) => element.scrollLeft,
    );

    expect(scrollLeft).toBeGreaterThan(0);

    // Wait for query updates and confirm scrollLeft remains greater than zero
    await page.waitForTimeout(1000);
    const newScrollLeft = await scroller.evaluate(
      (element) => element.scrollLeft,
    );
    expect(newScrollLeft).toBe(scrollLeft);

    // Verify the final Deployed lane becomes fully visible at maximum scroll
    const deployedLane = lanes.nth(8);
    const deployedBox = await deployedLane.boundingBox();
    
    // The right edge of the released lane should be visible within the page
    const scrollerBox = await scroller.boundingBox();
    expect(deployedBox!.x + deployedBox!.width).toBeLessThanOrEqual(scrollerBox!.x + scrollerBox!.width + 5); // Allow 5px tolerance
  });
});
