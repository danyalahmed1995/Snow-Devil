import { test, expect } from '@playwright/test';

test.describe('Flow Layout', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Tauri invoke for E2E tests
    await page.addInitScript(() => {
      Object.defineProperty(window, '__TAURI_INTERNALS__', {
        value: {
          invoke: async (cmd: string, args: any) => {
            if (cmd === 'get_auth_status') {
              return { isAuthenticated: true, account: { id: 'u1', login: 'e2euser' } };
            }
            if (cmd === 'get_viewer_repositories') return [];
            if (cmd === 'get_recent_repositories') return [];
            
            // Mock a lot of items so the pipeline is populated
            if (cmd === 'get_account_flow' || cmd.startsWith('get_')) {
              if (args.sourceType && args.sourceType !== 'releases') {
                return {
                  pages: [{
                    search: {
                      issueCount: 10,
                      nodes: Array.from({ length: 10 }).map((_, i) => ({
                        id: `item-${cmd}-${i}`,
                        title: `Mock Item ${i}`,
                        number: i + 1,
                        state: 'OPEN',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        repository: { id: 'r1', nameWithOwner: 'e2e/repo' }
                      }))
                    }
                  }]
                };
              }
            }
            return null;
          }
        }
      });
    });

    // Navigate to the app
    await page.goto('/');
    
    // Select Flow by clicking the navigator item
    await page.click('text=Flow');
    
    // Wait for flow-lane-scroller
    await page.waitForSelector('[data-testid="flow-lane-scroller"]');
  });

  test('lane spacing and horizontal scroll', async ({ page }) => {
    // Wait for the pipeline and lanes
    const scroller = page.locator('[data-testid="flow-lane-scroller"]');
    const pipeline = page.locator('[data-testid="flow-pipeline"]');
    
    const lanes = pipeline.locator('.flow-workbench-lane');
    await expect(lanes).toHaveCount(8);

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
    for (let i = 0; i < 7; i++) {
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

    // Verify the Released lane becomes fully visible at maximum scroll
    const releasedLane = lanes.nth(7);
    const releasedBox = await releasedLane.boundingBox();
    
    // The right edge of the released lane should be visible within the page
    const scrollerBox = await scroller.boundingBox();
    expect(releasedBox!.x + releasedBox!.width).toBeLessThanOrEqual(scrollerBox!.x + scrollerBox!.width + 5); // Allow 5px tolerance
  });
});
