import {expect,test} from '@playwright/test';
import {installFakeApi,TOKEN} from './fakeApi';

for(const width of [1440,390])for(const discovery of [false,true])for(const reducedMotion of ['no-preference','reduce'] as const){
  test(`${width}px ${discovery?'Discovery':'Overview'}: one open row, smooth switching, ${reducedMotion}`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion});
    await page.addInitScript(()=>localStorage.setItem('pf_report_walkthrough_v1',JSON.stringify({status:'completed',stepId:null,open:false})));
    const calls=await installFakeApi(page,{discovery:true});
    await page.goto(`/crawl-report/${TOKEN}${discovery?'/discovery':''}`);
    const headers=page.locator(discovery?'[data-discovered-line] > button':'button[aria-label*="the seat lines of"]');
    const first=headers.nth(0),second=headers.nth(1);
    const clickHeader=async(header:typeof first)=>{const box=(await header.boundingBox())!;await header.click({position:{x:box.width-24,y:20}});};
    await first.scrollIntoViewIfNeeded();await clickHeader(first);
    const firstPanel=discovery?page.locator('[data-discovered-line]').first().locator('.report-expansion'):first.locator('xpath=../..').locator(':scope > .report-expansion');
    await expect(first).toHaveAttribute('aria-expanded','true');
    const heights=await firstPanel.evaluate(async el=>{const values:number[]=[];for(let i=0;i<18;i++){await new Promise(requestAnimationFrame);values.push(el.getBoundingClientRect().height);}return values;});
    expect(heights.at(-1)!).toBeGreaterThan(0);
    if(reducedMotion==='no-preference')expect(heights.some(h=>h>0&&h<heights.at(-1)!-1)).toBe(true);
    else expect(await firstPanel.evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
    await second.scrollIntoViewIfNeeded();
    await second.evaluate(el=>{const scroll=el.closest('[data-report-main]')!;scroll.scrollTop+=el.getBoundingClientRect().top-scroll.getBoundingClientRect().top-150;});
    const before=await second.evaluate(el=>el.getBoundingClientRect().top);
    await second.evaluate(el=>el.addEventListener('click',()=>el.setAttribute('data-click-y',String(el.getBoundingClientRect().top)),{capture:true,once:true}));
    await clickHeader(second);
    await expect(second).toHaveAttribute('aria-expanded','true');await expect(first).toHaveAttribute('aria-expanded','false');
    await expect(firstPanel).toHaveAttribute('aria-hidden','true');
    expect(await firstPanel.evaluate(el=>(el as HTMLElement).inert)).toBe(true);
    const positions=await second.evaluate(async el=>{const values:number[]=[];for(let i=0;i<22;i++){await new Promise(requestAnimationFrame);values.push(el.getBoundingClientRect().top);}return values;});
    const clickedY=Number(await second.getAttribute('data-click-y'));
    expect(Math.max(...positions.map(y=>Math.abs(y-clickedY))),JSON.stringify({before,clickedY,positions})).toBeLessThanOrEqual(3);
    await expect(firstPanel.locator(':scope > div > *')).toHaveCount(0);
    expect(await headers.evaluateAll(items=>items.filter(el=>el.getAttribute('aria-expanded')==='true').length)).toBe(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(discovery)expect(calls.filter(c=>c.path.endsWith('/discovered-lines/placements')).length).toBeGreaterThanOrEqual(2);
    await clickHeader(second);await expect(second).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('.report-expansion[data-expanded="true"]')).toHaveCount(0);
  });
}
