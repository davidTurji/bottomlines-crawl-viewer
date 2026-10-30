import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chooseFilter } from './filterChoice';
import { readFile } from 'node:fs/promises';
import { buildXlsxBlob } from '../src/lib/xlsx';
import { installFakeApi, TOKEN } from './fakeApi';
import { revealStatuses, selectStatus } from './statusChoice';

const BASE = `/crawl-report/${TOKEN}`;
const quietTour = () => localStorage.setItem('pf_report_walkthrough_v1', JSON.stringify({status:'completed',stepId:null,open:false}));
const sheets = [{name:'Summary',rows:[['Customer','Matched publishers'],['Local QA',8412]]},
  {name:'Matched publishers',rows:[['Publisher domain','Lines'],['example.test',3]]}];

for (const width of [1440,390,320]) {
  test(`${width}px: secondary statuses, inactive view ownership and IPD match explanations`, async ({page}) => {
    await page.setViewportSize({width,height:900});await page.addInitScript(quietTour);
    const calls = await installFakeApi(page,{matchType:true,appChange:true,watchTabs:true,inactive:'ok'});
    await page.goto(BASE);
    if(width>640) {
      await expect(page.getByRole('tab',{name:'All matched',exact:true})).toBeVisible();
      await expect(page.getByRole('tab',{name:'Inactive',exact:true})).not.toBeVisible();
      await expect(page.getByTestId('status-toggle')).toHaveText('+4 statuses');
      await revealStatuses(page);
      await expect(page.getByRole('tab',{name:'Started watching',exact:true})).toBeVisible();
    }
    await selectStatus(page,'Inactive');
    await expect(page.getByRole('heading',{name:'Inactive publishers',exact:true})).toBeVisible();
    await expect(page.getByRole('tablist',{name:'Inactive lists'})).toHaveCount(0);
    await expect(page.getByPlaceholder('Search inactive publishers')).toBeVisible();
    await page.getByRole('button',{name:/Matched apps/}).first().click();
    await expect(page.getByRole('heading',{name:'Inactive apps',exact:true})).toBeVisible();
    await expect(page.getByPlaceholder('Search inactive apps')).toBeVisible();
    await expect.poll(()=>calls.some(c=>c.path.endsWith('/inactive') && c.query.includes('kind=apps'))).toBe(true);
    await selectStatus(page,'Started watching');
    await expect.poll(()=>calls.some(c=>c.path.endsWith('/matched-apps') && c.query.includes('change=started_watching'))).toBe(true);
    await page.getByRole('button',{name:/Matched publishers/}).first().click();
    await selectStatus(page,'All matched');
    await chooseFilter(page,'match-type','IPD');
    const samsung = page.locator('.report-row').filter({hasText:'Samsung TV Plus'}).first();
    await samsung.locator('.report-expand-control').click();
    await expect(samsung.locator('[data-ipd-where]')).toContainText('Via failarmy.tv');
    await expect(samsung.locator('[data-ipd-explanation]')).toHaveCount(0);
    await expect(samsung.locator('[data-line-actions] .line-control-source').first()).toHaveAttribute('href',/^https:\/\/failarmy.tv\/ads.txt/);
    if(width<640) expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await samsung.scrollIntoViewIfNeeded();
    await page.screenshot({path:`outputs/pathfinder-release-20261030/ipd-${width}.png`,animations:"disabled"});
  });

  test(`${width}px: full Excel downloads as a valid workbook without leaving the report`, async ({page}) => {
    await page.setViewportSize({width,height:900});await page.addInitScript(quietTour);
    await installFakeApi(page,{});
    const bytes = Buffer.from(await buildXlsxBlob(sheets).arrayBuffer());
    let requests=0;
    await page.route('**/export.xlsx',async route=>{requests++;await route.fulfill({status:200,body:bytes,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="local-qa.xlsx"'}});});
    await page.goto(BASE);
    const button=page.getByRole('button',{name:'Download full report',exact:true});
    if(width<640){const bounds=await button.boundingBox();expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width-8);expect(bounds!.height).toBeGreaterThanOrEqual(40);expect(await button.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);}
    const pending=page.waitForEvent('download');
    await page.getByRole('button',{name:'Download full report',exact:true}).click();
    const download=await pending;
    expect(download.suggestedFilename()).toBe('local-qa.xlsx');
    const saved=await readFile((await download.path())!);
    expect(saved.equals(bytes)).toBe(true);
    expect(saved.subarray(0,2).toString()).toBe('PK');
    for(const entry of ['[Content_Types].xml','xl/workbook.xml','xl/worksheets/sheet1.xml','Matched publishers'])expect(saved.includes(Buffer.from(entry))).toBe(true);
    expect(requests).toBe(1);
    await expect(page).toHaveURL(BASE);
    await expect(page.getByRole('heading',{name:'Your weekly crawl'})).toBeVisible();
  });
}

test('download API refusal stays readable on the report, never retries itself, and a deliberate retry works',async({page})=>{
  await page.addInitScript(quietTour);await installFakeApi(page,{});
  let requests=0;
  const bytes=Buffer.from(await buildXlsxBlob(sheets).arrayBuffer());
  await page.route('**/export.xlsx',async route=>{
    requests++;
    if(requests===1)return route.fulfill({status:503,json:{detail:'The report is still preparing. Please try again shortly.'}});
    return route.fulfill({body:bytes,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="retry.xlsx"'}});
  });
  await page.goto(BASE);await page.getByRole('button',{name:'Download full report',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('The report is still preparing');
  await expect(page).toHaveURL(BASE);expect(requests).toBe(1);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download full report',exact:true}).click();
  expect((await pending).suggestedFilename()).toBe('retry.xlsx');expect(requests).toBe(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for(const [status,detail] of [[429,'This link has reached its ten-download limit. Ask your admin for a fresh link.'],[401,'Sign in to download this report.']] as const){
  test(`download ${status} keeps report navigation and shows the server explanation`,async({page})=>{
    await page.addInitScript(quietTour);await installFakeApi(page,{});let requests=0;
    await page.route('**/export.xlsx',async route=>{requests++;await route.fulfill({status,json:{detail}});});
    await page.goto(BASE);await page.getByRole('button',{name:'Download full report',exact:true}).click();
    await expect(page.getByRole('alert')).toHaveText(detail);await expect(page).toHaveURL(BASE);expect(requests).toBe(1);
  });
}

test('selected-lines export preserves its filter through a signed redirect and downloads once',async({page})=>{
  await page.addInitScript(quietTour);await installFakeApi(page,{});
  const bytes=Buffer.from(await buildXlsxBlob(sheets).arrayBuffer());let query='';let requests=0;
  // Redirect requests bypass Playwright's route handler. Serve a real
  // loopback attachment to prove the browser follows it across origins.
  const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="selected.xlsx"'});res.end(bytes);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const port=(server.address() as AddressInfo).port;
    await page.route('**/export.xlsx?*',async route=>{requests++;query=new URL(route.request().url()).searchParams.get('lines')||'';await route.fulfill({status:307,headers:{Location:`http://127.0.0.1:${port}/frozen-selected.xlsx`}});});
    await page.goto(`${BASE}?lines=madeupssp.com%7C1%7CDIRECT`);
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export selected lines',exact:true}).click();
    const download=await pending;expect(download.suggestedFilename()).toBe('selected.xlsx');
    expect((await readFile((await download.path())!)).equals(bytes)).toBe(true);
    expect(query).toBe('madeupssp.com|1|DIRECT');expect(requests).toBe(1);await expect(page).toHaveURL(/lines=/);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }

});

test('historical link without export-info downloads the whole workbook and never mislabels it as selected',async({page})=>{
  await page.addInitScript(quietTour);await installFakeApi(page,{exportInfo:'none',inactive:'legacy',matchType:false});
  let query:string|null=null;const bytes=Buffer.from(await buildXlsxBlob(sheets).arrayBuffer());
  await page.route('**/export.xlsx*',async route=>{query=new URL(route.request().url()).search;await route.fulfill({body:bytes,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="historical.xlsx"'}});});
  await page.goto(`${BASE}/changes/old-line?lines=madeupssp.com%7C1%7CDIRECT`);
  await expect(page).toHaveURL(/crawl-report\/e2e-token\?lines=/);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download full report',exact:true}).click();
  expect((await pending).suggestedFilename()).toBe('historical.xlsx');expect(query).toBe('');
});

for(const readable of [false,true]){
  test(`${readable?'readable':'token'} historical links keep the report scope and selected lines through redirects, refresh and back`,async({page})=>{
    await page.addInitScript(quietTour);const calls=await installFakeApi(page,{discovery:true,inactive:'legacy',exportInfo:'none'});
    if(readable)await page.route('**/v1/viewer/resolve?*',route=>route.fulfill({json:{token:TOKEN}}));
    const prefix=readable?'/local-qa/0825-1218':BASE;
    const selection='?lines=madeupssp.com%7C1%7CDIRECT';
    for(const alias of ['discovered','changes/old-line','results']){
      await page.goto(`${prefix}/${alias}${selection}`);
      await expect(page).toHaveURL(`${prefix}${alias==='discovered'?'/discovery':''}${selection}`);
      if(alias==='discovered')await expect(page.getByRole('heading',{name:'Discovery',exact:true})).toBeVisible();
      else await expect(page.getByRole('heading',{name:'Your weekly crawl'})).toBeVisible();
      await page.reload();await expect(page).toHaveURL(new RegExp(`^.*${prefix}.*lines=`));
      expect(calls.filter(c=>c.path.includes('/summary')).every(c=>c.path.includes(TOKEN))).toBe(true);
    }
    await page.getByRole('link',{name:'Declarations',exact:true}).click();
    await expect(page).toHaveURL(`${prefix}/declarations`);
    await page.goBack();await expect(page).toHaveURL(`${prefix}${selection}`);
    await expect(page.getByRole('heading',{name:'Your weekly crawl'})).toBeVisible();
  });
}

test('an unavailable baked file says why the full-report action is missing without starting a paid export',async({page})=>{
  await page.addInitScript(quietTour);const calls=await installFakeApi(page,{});
  await page.route('**/export-info',route=>route.fulfill({json:{format:'none',line_export:false}}));
  await page.goto(BASE);await expect(page.getByText('The report download is not ready yet. Please refresh shortly.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Download full report',exact:true})).toHaveCount(0);
  expect(calls.some(c=>c.path.endsWith('/export.xlsx'))).toBe(false);
});

test('large-app report downloads the signed Excel-plus-CSV ZIP intact, with no workbook-only fallback',async({page})=>{
  await page.addInitScript(quietTour);await installFakeApi(page,{});
  const bytes=await readFile(new URL('./fixtures/customer-report.zip',import.meta.url));
  let requests=0;
  const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="customer-report.zip"'});res.end(bytes);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const port=(server.address() as AddressInfo).port;
    await page.route('**/export-info',route=>route.fulfill({json:{format:'zip',line_export:true,apps_rows:1200000,excel_row_limit:1048576}}));
    await page.route('**/export.xlsx',async route=>{requests++;await route.fulfill({status:307,headers:{Location:`http://127.0.0.1:${port}/customer-report.zip`}});});
    await page.goto(BASE);const button=page.getByRole('button',{name:'Download full report',exact:true});
    await expect(button).toHaveAttribute('title',/zip.*CSV/);
    const pending=page.waitForEvent('download');await button.click();const download=await pending;
    expect(download.suggestedFilename()).toBe('customer-report.zip');
    const saved=await readFile((await download.path())!);expect(saved.equals(bytes)).toBe(true);
    for(const entry of ['report.xlsx','matched-apps.csv'])expect(saved.includes(Buffer.from(entry))).toBe(true);
    expect(requests).toBe(1);await expect(page).toHaveURL(BASE);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

for(const width of [1440,960]){
  test(`${width}px: the status arrow reveals choices sideways in a single scrollable track`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.addInitScript(quietTour);
    await installFakeApi(page,{watchTabs:true,appChange:true,inactive:'ok'});await page.goto(BASE);
    const arrow=page.getByTestId('status-toggle');
    await expect(arrow).toHaveText('+4 statuses');await expect(arrow).toHaveAttribute('aria-expanded','false');
    await revealStatuses(page);await expect(page.getByRole('tab',{name:'Started watching',exact:true})).toBeVisible();
    const tops=await page.getByRole('tab').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().top));
    expect(Math.max(...tops)-Math.min(...tops)).toBeLessThanOrEqual(1);
    await arrow.click();await expect(page.getByRole('tab',{name:'Inactive',exact:true})).not.toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}

for(const width of [1440,390]){
  test(`${width}px: Discovery shows publisher identity and plain source files without application badges`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.addInitScript(quietTour);
    await installFakeApi(page,{discovery:true});await page.goto(`${BASE}/discovery`);
    await page.locator('[data-discovered-line] > button').first().click();
    const roster=page.locator('.discovery-placement');await expect(roster.first()).toBeVisible();
    await expect(roster.locator('.store-badge')).toHaveCount(0);
    expect((await roster.locator('.discovery-placement-meta').allTextContents()).join(' ')).not.toContain('Found in');
    await expect(roster.first().locator('.discovery-placement-source')).toHaveText(/^(ads.txt|app-ads.txt|ads.txt \+ app-ads.txt)$/);
    await expect(roster.first().locator('[data-line-actions] .line-control-source')).toBeVisible();
    expect(await roster.first().evaluate(el=>getComputedStyle(el).boxShadow)).toBe('none');
    await roster.first().scrollIntoViewIfNeeded();await page.screenshot({path:`outputs/pathfinder-release-20261030/discovery-publishers-${width}.png`,animations:'disabled'});
  });
}

for(const width of [1440,390]){
  test(`${width}px: Overview and Discovery reuse the same pager, including the lower source-list pager`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.addInitScript(quietTour);await installFakeApi(page,{discovery:true});
    await page.goto(BASE);
    const style=async()=>page.locator('.report-pager-nav').first().evaluate(el=>{const c=getComputedStyle(el);return {height:c.height,radius:c.borderRadius,border:c.borderColor,background:c.backgroundColor,numbers:[...el.querySelectorAll('[data-page-number]')].filter(n=>n.getClientRects().length).length,compact:!!el.querySelector('.list-toolbar-page-position')?.getClientRects().length};});
    const overview=await style();if(width<640)await page.getByRole('button',{name:'Toggle Sidebar',exact:true}).click();await page.getByRole('link',{name:'Discovery',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Discovery',exact:true})).toBeVisible();
    await expect(page.locator('.report-pager-nav').first()).toBeVisible();
    const discovery=await style();expect({...discovery,numbers:0}).toEqual({...overview,numbers:0});
    if(width<640){expect(discovery.compact).toBe(true);expect(discovery.numbers).toBe(0);}
    const bottom=page.locator('[data-pager-placement="bottom"] .report-pager-nav').last();
    expect(await bottom.evaluate(el=>getComputedStyle(el).borderRadius)).toBe(discovery.radius);
  });
}

test('phone line tools stay compact, readable and functional in Overview and Discovery',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);await page.setViewportSize({width:390,height:844});await page.addInitScript(quietTour);
  await installFakeApi(page,{discovery:true});
  for(const path of ['', '/discovery']){
    await page.goto(`${BASE}${path}`);
    await page.locator(path?'[data-discovered-line] > button':'.report-expand-control').first().click();
    const tools=page.locator('[data-line-actions]').first();await expect(tools).toBeVisible();
    for(const button of await tools.locator('.line-control').all()){
      const box=await button.boundingBox();expect(box!.height).toBeLessThanOrEqual(34);expect(box!.height).toBeGreaterThanOrEqual(32);
      expect(await button.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    }
    await tools.getByRole('button',{name:/^Copy /}).click();await expect(tools).toContainText('Copied');
    expect(await page.evaluate(()=>navigator.clipboard.readText())).toMatch(/, .+, (DIRECT|RESELLER)/);
    await page.screenshot({path:`outputs/pathfinder-release-20261030/compact-actions-${path?'discovery':'overview'}.png`,animations:'disabled'});
  }
});
