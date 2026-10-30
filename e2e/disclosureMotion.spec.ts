import {expect,test,type Locator,type Page} from '@playwright/test';
import {installFakeApi,TOKEN} from './fakeApi';
import {verificationReport} from '../src/lib/mockSellers';
import {selectStatus} from './statusChoice';
const BASE=`/crawl-report/${TOKEN}`;
const quiet=()=>localStorage.setItem('pf_report_walkthrough_v1',JSON.stringify({status:'completed',stepId:null,open:false}));
async function panelFor(page:Page,button:Locator){
  const id=await button.getAttribute('aria-controls');
  return id?page.locator(`[id="${id}"]`):button.locator('..').locator(':scope > .report-expansion');
}
async function exercise(page:Page,button:Locator,panel:Locator,reduced:boolean){
  await page.locator('[data-motion-probe]').evaluateAll(items=>items.forEach(el=>el.removeAttribute('data-motion-probe')));
  await page.locator('[data-panel-motion-probe]').evaluateAll(items=>items.forEach(el=>el.removeAttribute('data-panel-motion-probe')));
  await panel.evaluate(el=>el.setAttribute('data-panel-motion-probe','active'));
  panel=page.locator('[data-panel-motion-probe="active"]');
  await button.evaluate(el=>el.setAttribute('data-motion-probe','active'));
  button=page.locator('[data-motion-probe="active"]');
  await button.scrollIntoViewIfNeeded();await button.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded','true');
  const heights=await panel.evaluate(async el=>{const values:number[]=[];const until=performance.now()+320;do{await new Promise(requestAnimationFrame);values.push(el.getBoundingClientRect().height);}while(performance.now()<until);return values;});
  expect(heights.at(-1)!).toBeGreaterThan(0);
  expect(await panel.evaluate(el=>(el as HTMLElement).inert)).toBe(false);
  expect(await panel.evaluate(el=>getComputedStyle(el).transitionDuration)).toBe(reduced?'0s':'0.2s, 0.14s');
  if(!reduced)expect(heights.some(h=>h>0&&h<heights.at(-1)!-1)).toBe(true);
  await button.press('Enter');await expect(button).toHaveAttribute('aria-expanded','false');
  expect(await panel.evaluate(el=>(el as HTMLElement).inert)).toBe(true);
  const closing=await panel.evaluate(async el=>{const values:number[]=[];const until=performance.now()+320;do{await new Promise(requestAnimationFrame);values.push(el.getBoundingClientRect().height);}while(performance.now()<until);return values;});
  expect(closing.at(-1)).toBe(0);
  if(!reduced)expect(closing.some(h=>h>0&&h<heights.at(-1)!)).toBe(true);
}
for(const width of [1440,390])for(const reduced of [false,true]){
  const label=`${width}px ${reduced?'reduced':'normal'} motion`;
  test(`${label}: Added, Removed and Changed use Discovery's accordion`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await page.addInitScript(quiet);
    await installFakeApi(page,{matchType:true,appChange:true});await page.goto(BASE);
    for(const status of ['Added','Removed','Changed']){
      await selectStatus(page,status);
      const button=page.locator('button[aria-label*="the seat lines of"]').first();
      const panel=button.locator('xpath=../..').locator(':scope > .report-expansion');
      await exercise(page,button,panel,reduced);
    }
  });
  test(`${label}: IPD evidence and nested seller information animate both ways`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await page.addInitScript(quiet);
    await installFakeApi(page,{matchType:true,sellers:'page'});await page.goto(BASE);
    const ipd=page.locator('[data-ipd-inconclusive-note]').first().getByRole('button',{name:'Show them',exact:true});
    await exercise(page,ipd,await panelFor(page,ipd),reduced);
    await page.route('**/api/v1/viewer/*/sellers-fix',route=>route.fulfill({json:verificationReport()}));await page.goto(BASE+'/sellers');
    const info=page.getByTestId('seller-info').locator(':scope > button');
    await info.press('Enter');
    const nested=page.getByTestId('seller-info-unreachable').locator(':scope > button');
    await exercise(page,nested,await panelFor(page,nested),reduced);
    await info.press('Enter');await expect(await panelFor(page,info)).toHaveAttribute('aria-hidden','true');
  });
  test(`${label}: seller Show all rolls additional rows in and out`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await page.addInitScript(quiet);
    await installFakeApi(page,{sellers:'page'});await page.goto(BASE+'/sellers');
    const button=page.getByRole('button',{name:/^Show all \d+$/}).first();
    const panel=button.locator('..').locator(':scope > div > .report-expansion');
    await exercise(page,button,panel,reduced);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
  test(`${label}: Schain publisher/app rows and FAQs share the same motion`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await page.addInitScript(quiet);
    await installFakeApi(page,{schain:'ok'});
    const sdk='localsdk.test',seat='exchange.test|123|DIRECT',stamp='2026-08-25T12:00:00Z';
    await page.route('**/api/**/schain**',route=>{
      const url=new URL(route.request().url()),tail=url.pathname.split('/schain')[1];
      if(!tail)return route.fulfill({json:{status:'ok',reseller_domain:'madeupmedia.com',sdks:[{domain:sdk,name:'Local SDK',seller_ids:['42']}],seat_lines:[{ssp_domain:'exchange.test',publisher_id:'123',relationship:'DIRECT'}],downloads:{used:0,limit:3,selections:[]},crawled_at:stamp}});
      if(tail==='/sdk')return route.fulfill({json:{ok:true,domain:sdk,url:`https://${sdk}/sellers.json`,read_at:stamp,sellers_count:1,source:'report'}});
      if(tail==='/seat-counts')return route.fulfill({json:[{seat,publishers:1,apps:1}]});
      if(tail==='/preview')return route.fulfill({json:{funnel:{seat_publishers:1,with_sdk_direct:1,owned_by_them:1,reseller_authorised:1},totals:{publishers:1,apps:1,valid_ids:1,ids_checked:1},page:1,page_size:25,total:1,rows:[url.searchParams.get('view')==='apps'?{app_name:'Example App',publisher_domain:'publisher.test',bundle_id:'example.app',store:'android',sid1:'7',asi1:sdk,sid2:'42',asi2:'madeupmedia.com'}:{publisher_domain:'publisher.test',apps:1,valid_ids:['7'],ids_checked:1,seat_written:'exchange.test, 123, DIRECT',reseller_written:'madeupmedia.com, 42, RESELLER',direct_written:['localsdk.test, 7, DIRECT'],file_url:'https://publisher.test/app-ads.txt'}]}});
      return route.fallback();
    });
    await page.goto(BASE+'/schain');await page.getByRole('button',{name:/Local SDK.*localsdk.test/}).click();await page.getByRole('button',{name:/exchange.test, 123, DIRECT/}).click();await page.getByRole('button',{name:'Run report',exact:true}).click();
    const result=page.locator('[data-tour="schain-result"]');
    for(const view of ['Publishers close the chain','Apps close the chain']){
      if(view.startsWith('Apps'))await result.getByRole('button',{name:new RegExp(view)}).click();
      const card=result.locator('.report-row').first(),button=card.locator(':scope > button');
      await exercise(page,button,card.locator(':scope > .report-expansion'),reduced);
    }
    await page.getByRole('button',{name:'How it works',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'How Schain works'}),faq=dialog.getByRole('button',{name:'What is an schain file?',exact:true});
    await exercise(page,faq,await panelFor(page,faq),reduced);
    await page.screenshot({path:`outputs/pathfinder-contract-audit-20261030/shared-motion-${width}-${reduced?'reduced':'normal'}.png`,animations:'disabled'});
  });
}
