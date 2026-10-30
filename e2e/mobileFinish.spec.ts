import { expect, test, type Page } from '@playwright/test';
import { installFakeApi, TOKEN } from './fakeApi';
import { mockMatchedDevelopers } from '../src/lib/mockData';
const BASE = `/crawl-report/${TOKEN}`;
const doneTour = () => localStorage.setItem('pf_report_walkthrough_v1', JSON.stringify({status:'completed',stepId:null,open:false}));
const scenario = { discovery:true, matchType:true, foundIn:true, appPlatform:true, watchTabs:true, appChange:true, inactive:'ok', sellers:'page', schain:'ok' } as const;
async function fit(page:Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const offenders = await page.locator('[data-report-main]').evaluate(root => [...root.querySelectorAll('input,select,button,a')].filter(el=>el.getClientRects().length && !el.closest('[aria-hidden="true"]')).filter(el=>{
    // Code panes intentionally scroll horizontally; page controls must fit.
    for(let parent=el.parentElement;parent&&parent!==root;parent=parent.parentElement){
      if(/auto|scroll/.test(getComputedStyle(parent).overflowX)&&parent.scrollWidth>parent.clientWidth+1)return false;
    }
    const r=el.getBoundingClientRect();return r.width>0 && (r.left < -1 || r.right > innerWidth+1);
  }).map(el=>el.textContent?.trim().slice(0,60)));
  expect(offenders).toEqual([]);
}
for(const width of [320,390,430]) {
  test(`${width}px: phone-first controls fit every report page and status reaches backend`,async({page})=>{
    await page.setViewportSize({width,height:844}); await page.addInitScript(doneTour);
    const calls=await installFakeApi(page,scenario);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(BASE);
    const status=page.getByRole('combobox',{name:'Matched status'});
    await expect(status).toBeVisible();
    for(const [value,wire] of [['started','started_watching'],['stopped','stopped_watching']] as const){
      await status.selectOption(value);
      await expect.poll(()=>calls.some(c=>c.path.endsWith('/matched-developers')&&c.query.includes(`change=${wire}`))).toBe(true);
    }
    await status.selectOption('all');
    const search=page.getByRole('textbox',{name:'Search matched publishers'});
    await search.scrollIntoViewIfNeeded();
    const geometry=await page.locator('[data-list-toolbar]').filter({has:search}).evaluate(root=>{
      const q=root.querySelector('.list-toolbar-query')!.getBoundingClientRect();
      const action=root.querySelector('.list-toolbar-options')!.getBoundingClientRect();
      return {width:q.width,toolbar:root.getBoundingClientRect().width,below:action.top>=q.bottom+5};
    });
    expect(geometry.width).toBeCloseTo(geometry.toolbar,0); expect(geometry.below).toBe(true);
    await fit(page);
    for(const path of ['/discovery','/declarations','/sellers','/schain']){
      await page.goto(BASE+path);await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();
      await expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(0);
      if(path==='/discovery'){
        await page.locator('[data-discovered-line]').first().locator(':scope > button').click();
        const placement=page.locator('.discovery-placement').first();await expect(placement).toBeVisible();
        expect(await placement.locator('.discovery-placement-name').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
        const exportButton=page.getByRole('button',{name:'Export every publisher source file carrying this line as CSV'});
        expect(await exportButton.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(10);
      }
      await fit(page);
    }
    expect(errors).toEqual([]);
  });
}
test('Declarations KPIs focus the matching neutral section and preserve the source roster',async({page})=>{
  await page.addInitScript(doneTour);await installFakeApi(page,scenario);await page.goto(BASE+'/declarations');
  const owner=page.getByRole('button',{name:/Owner domains/}).first();await expect(owner).toBeVisible();await owner.click();
  const section=page.locator('[data-declaration-section="owner domain"]');
  await expect(section).toHaveAttribute('data-focused','true');await expect(section).toBeFocused();
  await expect(section.locator('.declaration-card').first()).toBeVisible();
  expect(await section.locator('.declaration-card').first().evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
});
test('every Overview line window has dates and an explicit file note, including legacy unknown files',async({page})=>{
  await page.addInitScript(doneTour);await installFakeApi(page,{});
  await page.route('**/matched-developers?*',route=>{
    const data=structuredClone(mockMatchedDevelopers(1)); delete data.rows[0].added_lines![0].found_in;
    return route.fulfill({json:data});
  });
  await page.goto(BASE);await page.locator('.report-expand-control').first().click();
  for(const tone of ['added','removed','cert']){
    const rows=page.locator(`[data-line-tone="${tone}"] .line-entry`);expect(await rows.count()).toBeGreaterThan(0);
    for(const row of await rows.all()) {await expect(row.locator('[data-line-dates]')).not.toBeEmpty(); await expect(row.locator('[data-line-source]')).not.toBeEmpty();}
  }
  await expect(page.locator('[data-line-tone="added"] .line-entry').first()).toContainText('source file not recorded');
});
test('phone file chooser fits, opens both sources only after the explicit action, and restores focus',async({page})=>{
  await page.setViewportSize({width:320,height:700});await page.addInitScript(doneTour);await installFakeApi(page,{});
  await page.route('**/matched-developers?*',route=>{const data=structuredClone(mockMatchedDevelopers(1));data.rows[0].added_lines![0].found_in='both';return route.fulfill({json:data});});
  await page.context().route('https://**/*',route=>route.fulfill({body:'local source fixture',contentType:'text/plain'}));
  await page.goto(BASE);await page.locator('.report-expand-control').first().click();
  const open=page.locator('[data-line-actions] .line-control-source');await open.click();
  const dialog=page.getByRole('dialog',{name:'Open source file'});await expect(dialog).toBeVisible();
  const rect=await dialog.boundingBox();expect(rect!.x).toBeGreaterThanOrEqual(15);expect(rect!.x+rect!.width).toBeLessThanOrEqual(305);
  const popups:Page[]=[];page.on('popup',popup=>popups.push(popup));
  await dialog.getByRole('button',{name:'Open both files'}).click();await expect.poll(()=>popups.length).toBe(2);
  for(const popup of popups)await popup.close();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(open).toBeFocused();
});

for (const width of [320, 390, 1440]) {
  test(`${width}px: welcome answers share geometry and stay on one line`,async({page})=>{
    await page.setViewportSize({width,height:width===320?568:900});await page.emulateMedia({reducedMotion:'reduce'});await installFakeApi(page,{});
    await page.removeLocatorHandler(page.getByRole('button',{name:'No thanks',exact:true}));
    await page.goto(BASE);
    const prompt=page.getByRole('dialog',{name:'Want a quick walkthrough?'});
    await expect(prompt).toBeVisible({timeout:10000});
    const yes=prompt.getByRole('button',{name:width<640?'Start tour':'Show me around',exact:true});
    const no=prompt.getByRole('button',{name:'No thanks',exact:true});
    const geometry = async (button:typeof yes) => button.evaluate(el=>{
      const style=getComputedStyle(el);
      return {width:(el as HTMLElement).offsetWidth,height:(el as HTMLElement).offsetHeight,radius:style.borderRadius,font:[style.fontFamily,style.fontSize,style.fontWeight],
        border:style.borderWidth,whiteSpace:style.whiteSpace,fits:el.scrollHeight<=el.clientHeight&&el.scrollWidth<=el.clientWidth};
    });
    const positive=await geometry(yes),negative=await geometry(no);
    expect(positive).toEqual(negative);expect(positive.fits).toBe(true);
    expect(positive.height).toBeGreaterThanOrEqual(width<640?44:36);
    const box=(await prompt.locator('.walkthrough-prompt').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(16);expect(box.x+box.width).toBeLessThanOrEqual(width-16);
    expect(box.y+box.height).toBeLessThanOrEqual(width===320?568:900);
    await page.screenshot({path:`outputs/pathfinder-release-20261030/welcome-${width}.png`});
    if(width===390){
      await yes.click();await expect(prompt).toHaveCount(0);
      const tour=page.getByRole('dialog',{name:'Report walkthrough',exact:true});
      await expect(tour).toBeVisible();await tour.getByRole('button',{name:'Close Report walkthrough',exact:true}).click();
      await expect(tour).toHaveCount(0);
    }else{
      await no.click();await expect(prompt).toHaveCount(0);
    }
  });
}

test('a delayed welcome waits until the source-file dialog is closed',async({page})=>{
  await page.clock.install();await page.setViewportSize({width:390,height:844});await installFakeApi(page,{});
  await page.removeLocatorHandler(page.getByRole('button',{name:'No thanks',exact:true}));
  await page.route('**/matched-developers?*',route=>{const data=structuredClone(mockMatchedDevelopers(1));data.rows[0].added_lines![0].found_in='both';return route.fulfill({json:data});});
  await page.goto(BASE);await page.locator('.report-expand-control').first().click();
  await page.locator('[data-line-actions] .line-control-source').click();
  const file=page.getByRole('dialog',{name:'Open source file'});await expect(file).toBeVisible();
  await page.clock.fastForward(10000);await page.clock.fastForward(6500);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog',{name:'Want a quick walkthrough?'})).toHaveCount(0);
  await file.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.clock.fastForward(500);
  await expect(page.getByRole('dialog',{name:'Want a quick walkthrough?'})).toBeVisible();
  await page.getByRole('button',{name:'No thanks',exact:true}).click();
});

test('the mobile welcome waits while the user is working in the filter panel',async({page})=>{
  await page.clock.install();await page.setViewportSize({width:390,height:844});await installFakeApi(page,{matchType:true,foundIn:true});
  await page.removeLocatorHandler(page.getByRole('button',{name:'No thanks',exact:true}));
  await page.goto(BASE);const filters=page.getByRole('button',{name:'List filters',exact:true});
  await filters.click();await expect(page.getByTestId('found-in')).toBeVisible();
  await page.clock.fastForward(10000);await page.clock.fastForward(6500);
  await expect(page.getByRole('dialog',{name:'Want a quick walkthrough?'})).toHaveCount(0);
  await filters.click();await page.clock.fastForward(500);
  await expect(page.getByRole('dialog',{name:'Want a quick walkthrough?'})).toBeVisible();
  await page.getByRole('button',{name:'No thanks',exact:true}).click();
});
