import { expect, test, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expectReportCentered } from './modalGeometry';
import { installFakeApi, TOKEN } from './fakeApi';
import { mockDeclarationRows } from '../src/lib/mockData';
import { normalizeDeclarations, subjectCsv } from '../src/lib/declarations';
const BASE = `/crawl-report/${TOKEN}`;
const quietTour = () => localStorage.setItem('pf_report_walkthrough_v1',JSON.stringify({status:'completed',stepId:null,open:false}));
const green = async (button:Locator) => {
  await expect(button).toHaveClass(/report-download-action/);
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(21, 81, 53)');
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
};
for(const width of [1440,390,320]) {
  test(`${width}px: declarations keep their cards, count publishers, export exact CSVs and share source-file dialogs`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.addInitScript(quietTour);
    await page.context().route('https://**/*',route=>route.fulfill({contentType:'text/plain',body:'local source fixture'}));
    const calls=await installFakeApi(page,{});await page.goto(`${BASE}/declarations`);
    await expect(page.locator('.declaration-card').first()).toBeVisible();
    const data=normalizeDeclarations(mockDeclarationRows);
    for(const section of data.sections){
      const root=page.locator(`[data-declaration-section="${section.kind}"]`);
      for(const subject of section.subjects){
        const card=root.locator('.declaration-card').filter({has:page.locator('code').filter({hasText:subject.domain})}).first();
        const toggle=card.locator(':scope > button');
        if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
        const rows=card.locator('.declaration-publisher');await expect(rows).toHaveCount(subject.declarers.length);
        await expect(rows.first().locator('.declaration-match-number')).toHaveText('1');
        await expect(rows.locator('.line-control-source')).toHaveCount(subject.declarers.length);
        const button=card.getByRole('button',{name:'Export CSV',exact:true});await green(button);
        const ready=page.waitForEvent('download');await button.click();const download=await ready;
        expect(download.suggestedFilename()).toContain(subject.kind.replace(/ /g,'-'));
        expect(await readFile((await download.path())!,'utf8')).toBe('\uFEFF'+subjectCsv(subject));
        const bothIndex=subject.declarers.findIndex(row=>row.files.length>1);
        if(bothIndex>=0){
          const first=rows.nth(bothIndex).locator('.line-control-source');await first.click();
          const domain=subject.declarers[bothIndex].domain;
          const dialog=page.getByRole('dialog',{name:'Open source file'});await expect(dialog).toBeVisible();
          await expect(dialog.getByRole('link',{name:'ads.txt',exact:true})).toHaveAttribute('href',`https://${domain}/ads.txt`);
          await expect(dialog.getByRole('link',{name:'app-ads.txt',exact:true})).toHaveAttribute('href',`https://${domain}/app-ads.txt`);
          await expect(dialog.getByRole('button',{name:'Open both files'})).toBeVisible();
          const box=(await dialog.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(15);expect(box.x+box.width).toBeLessThanOrEqual(width-15);
          await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(first).toBeFocused();
        }
        const single=rows.filter({hasText:'1 file · ads.txt'}).first();
        if(await single.count())await expect(single.locator('.line-control-source')).toHaveAttribute('href',/\/ads\.txt$/);
        expect(await card.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
        expect(await card.locator('.declaration-detail').evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 255, 255)');
      }
      await page.getByRole('button',{name:new RegExp(section.kind==='inventory partner'?'Inventory partners':section.kind==='owner domain'?'Owner domains':'Manager domains')}).first().click();
      await expect(root).toBeFocused();expect(await root.evaluate(el=>getComputedStyle(el).boxShadow)).toBe('none');
    }
    expect(calls.some(c=>c.path.endsWith('/declarations'))).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('[data-declaration-section="manager domain"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:`outputs/pathfinder-final-audit-20261030/declarations-${width}.png`,animations:'disabled'});
  });
}
for(const width of [1440,390]){
  test(`${width}px: Discovery introduction expands and every CSV action is green and downloads its full scope`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.addInitScript(quietTour);
    const calls=await installFakeApi(page,{discovery:true});await page.goto(`${BASE}/discovery`);
    const intro=page.locator('[data-tour="discovery-header"] .report-description');
    const more=intro.getByRole('button',{name:'Show more about Discovery'});await expect(more).toHaveAttribute('aria-expanded','false');
    await more.click();await expect(intro.getByText('madeupmedia.com,',{exact:false}).first()).toBeVisible();
    await intro.getByRole('button',{name:'Show less about Discovery'}).click();await expect(more).toHaveAttribute('aria-expanded','false');
    const top=page.getByRole('button',{name:'Export CSV',exact:true});await green(top);
    let ready=page.waitForEvent('download');await top.click();let download=await ready;
    let text=await readFile((await download.path())!,'utf8');expect(text).toContain('in_your_sellers_json');expect(text.trim().split(/\r?\n/).length).toBe(175);
    await page.locator('[data-discovered-line] > button').first().click();
    const nested=page.getByRole('button',{name:'Export every publisher source file carrying this line as CSV'});await green(nested);
    ready=page.waitForEvent('download');await nested.click();download=await ready;
    text=await readFile((await download.path())!,'utf8');expect(text).toContain('"file_host"');expect(text.trim().split(/\r?\n/).length).toBeGreaterThan(100);
    expect(calls.some(c=>c.path.endsWith('/discovered-lines/placements'))).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await nested.scrollIntoViewIfNeeded();await page.screenshot({path:`outputs/pathfinder-final-audit-20261030/discovery-${width}.png`,animations:'disabled'});
  });
}

for(const [path,endpoint] of [['','summary'],['/discovery','discovered-lines'],['/declarations','declarations'],['/sellers','sellers-fix'],['/schain','schain']]){
  test(`phone ${path||'Overview'}: loading uses the shared skeleton, respects reduced motion and settles`,async({page})=>{
    await page.setViewportSize({width:390,height:844});await page.addInitScript(quietTour);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await installFakeApi(page,{sellers:'page',schain:'ok'});
    let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
    await page.route(url=>url.pathname===`/api/v1/viewer/${TOKEN}/${endpoint}`,async route=>{await gate;await route.fallback();});
    try{
      await page.goto(BASE+path);
      const loading=page.locator('[role="status"][aria-busy="true"]').first();await expect(loading).toBeVisible();
      const block=loading.locator('.bl-skeleton').first();await expect(block).toBeVisible();
      expect(await block.evaluate(el=>getComputedStyle(el).animationName)).toBe('bl-sweep');
      await page.emulateMedia({reducedMotion:'reduce'});
      expect(await block.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }finally{release();}
    await expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('phone Schain builder wires SDK, counts, preview and both export formats to the API',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.addInitScript(quietTour);
  await installFakeApi(page,{schain:'ok'});
  const sdk='localsdk.test',seat='exchange.test|123|DIRECT',sid2='42',stamp='2026-08-25T12:00:00Z';
  const calls:{path:string;query:string;body:unknown}[]=[];
  const csv=Buffer.from('publisher_domain,app_name\r\npublisher.test,Example App\r\n');
  const {buildXlsxBlob}=await import('../src/lib/xlsx');
  const xlsx=Buffer.from(await (await buildXlsxBlob([{name:'Apps',rows:[['Publisher','App'],['publisher.test','Example App']]}])).arrayBuffer());
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/api/**/schain**',async route=>{
    const request=route.request(),url=new URL(request.url()),tail=url.pathname.split('/schain')[1];
    calls.push({path:tail,query:url.search,body:request.method()==='POST'?request.postDataJSON():null});
    if(!tail)return route.fulfill({json:{status:'ok',customer_name:'Local QA',reseller_domain:'madeupmedia.com',sellers_json_url:'https://madeupmedia.com/sellers.json',sellers_json_read_at:stamp,crawled_at:stamp,sdks:[{domain:sdk,name:'Local SDK',seller_type:'INTERMEDIARY',seller_ids:[sid2]}],sdk_catalog_size:1,seat_lines:[{ssp_domain:'exchange.test',publisher_id:'123',relationship:'DIRECT'}],downloads:{used:0,limit:3,selections:[]}}});
    if(tail==='/sdk')return route.fulfill({json:{ok:true,domain:sdk,url:`https://${sdk}/sellers.json`,read_at:stamp,sellers_count:1,source:'report'}});
    if(tail==='/seat-counts')return route.fulfill({json:[{seat,publishers:1,apps:1}]});
    if(tail==='/preview'){
      await gate;
      const publisher={publisher_domain:'publisher.test',apps:1,valid_ids:['7'],ids_checked:1,seat_written:'exchange.test, 123, DIRECT',reseller_written:'madeupmedia.com, 42, RESELLER',direct_written:['localsdk.test, 7, DIRECT'],file_url:'https://publisher.test/app-ads.txt',found_in:'app-ads.txt'};
      return route.fulfill({json:{funnel:{seat_publishers:1,with_sdk_direct:1,owned_by_them:1,reseller_authorised:1},totals:{publishers:1,apps:1,valid_ids:1,ids_checked:1},page:1,page_size:25,total:1,rows:[publisher]}});
    }
    if(tail.startsWith('/export.')){
      const isCsv=tail.endsWith('.csv');return route.fulfill({body:isCsv?csv:xlsx,headers:{'Content-Type':isCsv?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="schain.${isCsv?'csv':'xlsx'}"`,'X-Schain-Downloads-Used':'1','X-Schain-Downloads-Limit':'3'}});
    }
    return route.fallback();
  });
  await page.goto(BASE+'/schain');
  await page.getByRole('button',{name:/Local SDK.*localsdk.test/}).click();
  const seatButton=page.getByRole('button',{name:/exchange.test, 123, DIRECT/});await expect(seatButton).toBeEnabled();await seatButton.click();
  try{
    await page.getByRole('button',{name:'Run report',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Loading schain preview'})).toBeVisible();
  }finally{release();}
  const result=page.locator('[data-tour="schain-result"]');await expect(result).toContainText('publisher.test');
  expect(calls.find(c=>c.path==='/sdk')?.body).toEqual({sdk,refresh:false});
  for(const path of ['/seat-counts','/preview'])expect(calls.some(c=>c.path===path&&new URLSearchParams(c.query).get('sdk')===sdk)).toBe(true);
  for(const format of ['csv','xlsx']){
    await result.getByRole('button',{name:'Export',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Download this schain file?'});await expectReportCentered(page, dialog);
    await page.setViewportSize({width:1440,height:844});await expectReportCentered(page, dialog);
    await page.setViewportSize({width:390,height:844});await expectReportCentered(page, dialog);
    await dialog.getByRole('radio',{name:format==='csv'?/CSV/:/Excel/}).click();
    const download=dialog.getByRole('button',{name:'Download',exact:true});await expect(download).toBeDisabled();
    await dialog.getByRole('checkbox').check();await expect(download).toBeEnabled();
    const geometry=await dialog.getByRole('button',{name:'Cancel',exact:true}).evaluate(el=>({height:el.getBoundingClientRect().height,radius:getComputedStyle(el).borderRadius}));
    const other=await download.evaluate(el=>({height:el.getBoundingClientRect().height,radius:getComputedStyle(el).borderRadius}));
    expect(other.height).toBeCloseTo(geometry.height,0);expect(other.radius).toBe(geometry.radius);
    const ready=page.waitForEvent('download');await download.click();const saved=await ready;
    expect(saved.suggestedFilename()).toBe(`schain.${format}`);expect((await readFile((await saved.path())!)).equals(format==='csv'?csv:xlsx)).toBe(true);
    await expect(dialog).toHaveCount(0);
    const request=calls.find(c=>c.path===`/export.${format}`)!;const query=new URLSearchParams(request.query);
    expect([query.get('sdk'),query.get('seat'),query.get('sid2')]).toEqual([sdk,seat,sid2]);
  }
  await expect(result).toContainText('Downloaded before, free again');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
