import { expect, test } from '@playwright/test';
import { resolve } from 'path';

test('capture screenshots', async ({ page }) => {
  // Wait for the dev server
  await page.goto('/');
  await page.waitForTimeout(1000); // let UI settle

  // 1. Unauthenticated Home baseline
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: resolve(process.cwd(), 'screenshots/home-baseline.png') });

  // 2. Click Explore Demo
  await page.getByText('Explore Demo').click();
  await page.waitForTimeout(1000); // Let demo data settle

  const sizes = [[1280,720],[1280,800],[1440,900],[1600,900],[1920,1080],[2560,1440]] as const;
  for (const [width,height] of sizes) {
    await page.setViewportSize({width,height});
    await expect(page.locator('.layout-root')).toHaveCSS('overflow','hidden');
    const box=await page.locator('.layout-root').boundingBox();
    expect(box?.width).toBeLessThanOrEqual(width);expect(box?.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: resolve(process.cwd(), `screenshots/demo-home-${width}x${height}.png`) });
  }
  await page.setViewportSize({width:1920,height:1080});
  await page.locator('.home-flow-preview-card').first().click();
  await expect(page.getByRole('tab',{name:'Details'})).toBeVisible();
  await page.screenshot({path:resolve(process.cwd(),'screenshots/demo-home-inspector-1920x1080.png')});

  for (const scale of [1.25,1.5,2]) {
    await page.setViewportSize({width:1920,height:1080});
    await page.evaluate(value=>{document.documentElement.style.zoom=String(value)},scale);
    await expect(page.getByRole('button',{name:'Toggle Navigator'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Open Flow Workbench'})).toBeVisible();
    await page.screenshot({path:resolve(process.cwd(),`screenshots/demo-home-scale-${Math.round(scale*100)}.png`)});
  }
  await page.evaluate(()=>{document.documentElement.style.zoom=''});
});
