import { test } from '@playwright/test';
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

  // 3. Populated Demo Home at 1280x800
  await page.screenshot({ path: resolve(process.cwd(), 'screenshots/demo-home-1280x800.png') });

  // 4. Populated Demo Home at 1920x1080
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: resolve(process.cwd(), 'screenshots/demo-home-1920x1080.png') });
});
