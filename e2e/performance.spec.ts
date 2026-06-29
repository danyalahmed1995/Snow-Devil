import { expect, test } from '@playwright/test';

const median=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];

test('warm native tab and menu interactions stay within desktop budgets',async({page})=>{
  await page.goto('/');
  await page.getByText('Explore Demo').click();
  await page.getByRole('button',{name:'Flow',exact:true}).click();
  await expect(page.locator('.workspace-tab--active .workspace-tab__title')).toHaveText('Flow');
  const measured=await page.evaluate(async()=>{
    const waitFor=(test:()=>boolean)=>new Promise<void>(resolve=>{if(test()){resolve();return}const observer=new MutationObserver(()=>{if(test()){observer.disconnect();resolve()}});observer.observe(document.body,{attributes:true,childList:true,subtree:true})});
    const switches:number[]=[];
    for(let index=0;index<7;index++){
      const name=index%2?'Flow':'Home';const button=[...document.querySelectorAll('button')].find(item=>item.textContent?.trim()===name) as HTMLButtonElement;const start=performance.now();button.click();await waitFor(()=>document.querySelector('.workspace-tab--active .workspace-tab__title')?.textContent===name);switches.push(performance.now()-start);
    }
    const menuTimes:number[]=[];
    const overflow=document.querySelector('[aria-label="Tab overflow menu"]') as HTMLButtonElement;
    for(let index=0;index<5;index++){const start=performance.now();overflow.click();await waitFor(()=>Boolean(document.querySelector('[role="menu"]')));menuTimes.push(performance.now()-start);window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await waitFor(()=>!document.querySelector('[role="menu"]'))}
    return{switches,menuTimes};
  });
  const switches=measured.switches,menuTimes=measured.menuTimes;
  console.log(`PERF warm-tab-median=${median(switches)}ms menu-median=${median(menuTimes)}ms`);
  expect(median(switches)).toBeLessThan(100);expect(median(menuTimes)).toBeLessThan(100);
});
