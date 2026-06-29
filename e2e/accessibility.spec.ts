import { expect, test } from '@playwright/test';

test('keyboard, overlays, reduced motion, and inspector controls remain operable',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await page.getByText('Explore Demo').click();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog',{name:'Search and commands'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Search and commands'})).toHaveCount(0);
  const inspector=page.getByRole('button',{name:'Open Inspector'});
  if(await inspector.count())await inspector.click();
  await expect(page.getByRole('banner').getByRole('button',{name:'Close Inspector'})).toBeVisible();
  await page.getByRole('button',{name:'Flow',exact:true}).click();
  await expect(page.getByRole('button',{name:'Saved views'})).toBeVisible();
  await page.getByRole('button',{name:'Saved views'}).click();
  await expect(page.getByRole('dialog',{name:'Personal saved views'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Personal saved views'})).toHaveCount(0);
  await page.keyboard.press('Tab');
  const focused=await page.evaluate(()=>({tag:document.activeElement?.tagName,name:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.trim().slice(0,40)}));
  expect(focused.tag).toBeTruthy();
});
