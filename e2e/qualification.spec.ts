import { expect,test } from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('snow-devil-mode',JSON.stringify({state:{mode:'demo'},version:0}));
    localStorage.setItem('github-graph-browser-tabs',JSON.stringify({state:{tabs:[{id:'native:home',family:'native',kind:'home',title:'Home',pinned:true,closable:false,createdAt:1,lastActivatedAt:1}],activeTabId:'native:home',navigationGeneration:1},version:4}));
    Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{invoke:async()=>null,transformCallback:()=>1}});
  });
  await page.goto('/');
});

test('notification PR routing is native and unread counters stay consistent',async({page})=>{
  await page.getByRole('button',{name:/Notifications/}).click();
  await expect(page.getByText('Improve repository explorer performance')).toBeVisible();
  const top=page.getByRole('button',{name:/Open notifications/});
  await expect(top).toHaveAccessibleName(/2 unread/);
  await page.getByText('Improve repository explorer performance').click();
  await expect(page.locator('.workspace-tab--active .workspace-tab__title')).toHaveText('PR #42');
  await expect(page.getByText('2 changed files')).toBeVisible();
});

test('evidence graph opens as a bounded native surface',async({page})=>{
  await expect(page.getByRole('heading',{name:'Home'})).toBeVisible();
  await page.keyboard.press('Control+K');
  const palette=page.getByRole('dialog',{name:'Search and commands'});
  await palette.getByRole('textbox').fill('lifecycle evidence graph');
  await palette.getByRole('option').click();
  await expect(page.getByRole('heading',{name:'Lifecycle evidence'})).toBeVisible();
  const label=await page.locator('.graph-workspace svg[role="img"]').getAttribute('aria-label');
  const count=Number(label?.match(/^(\d+)/)?.[1]??999);
  expect(count).toBeLessThanOrEqual(120);
});

test('saved view survives reload, pins safely, and keeps a singleton tab',async({page})=>{
  await page.getByRole('button',{name:'Flow',exact:true}).click();
  const savedViewsTrigger=page.locator('button.saved-views__trigger');
  await savedViewsTrigger.click();
  await page.getByRole('textbox',{name:'Saved view name'}).fill('Qualification view');
  await page.getByRole('button',{name:'Save current'}).click();
  await expect(page.locator('.workspace-tab--active .workspace-tab__title')).toHaveText('Qualification view');
  await page.locator('button.saved-views__trigger:visible').click();
  await page.getByRole('button',{name:'Pin Qualification view'}).click();
  await page.keyboard.press('Escape');
  await page.reload();
  const pinned=page.getByRole('button',{name:'Qualification view',exact:true});
  await expect(pinned).toBeVisible();
  await pinned.click();await pinned.click();
  await expect(page.locator('.workspace-tab__title',{hasText:'Qualification view'})).toHaveCount(1);
  await savedViewsTrigger.click();
  await page.getByRole('button',{name:'Delete Qualification view'}).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Qualification view',exact:true})).toHaveCount(0);
});
