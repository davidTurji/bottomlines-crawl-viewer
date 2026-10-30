import {expect,test} from '@playwright/test';
import {installFakeApi,TOKEN} from './fakeApi';
const BASE=`/crawl-report/${TOKEN}`;
const quiet=()=>localStorage.setItem('pf_report_walkthrough_v1',JSON.stringify({status:'completed',stepId:null,open:false}));
test('production never exposes the demo-only chat without a backend',async({page})=>{
  await page.addInitScript(quiet);
  const calls=await installFakeApi(page);await page.goto(BASE);
  await expect(page.getByRole('heading',{name:'Matched publishers',exact:true})).toBeVisible();
  await expect(page.getByPlaceholder('Ask about your crawl')).toHaveCount(0);
  expect(calls.some(call=>call.path.endsWith('/chat'))).toBe(false);
});
test('declaration choices with spaces keep their accessible explanations',async({page})=>{
  await page.addInitScript(quiet);await installFakeApi(page);
  await page.goto(BASE+'/declarations');
  const section=page.locator('.declaration-section').first();
  const filter=section.getByRole('button',{name:'Which declarations to show',exact:true});
  if(!await filter.isVisible())await section.getByRole('button',{name:'List filters',exact:true}).click();
  await filter.click();
  await expect(page.getByRole('menuitem',{name:'Inventory partners',exact:true})).toHaveAccessibleDescription('Publishers naming a domain as their inventory partner.');
  await expect(page.getByRole('menuitem',{name:'Manager domains',exact:true})).toHaveAccessibleDescription('Publishers naming a domain as their sales manager.');
});
for(const width of [1440,960,390,320]){
  test(`${width}px: grouped filters explain choices and preserve server selection`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.addInitScript(quiet);
    const calls=await installFakeApi(page,{discovery:true,sellers:'page',matchType:true,foundIn:true,appPlatform:true});
    await page.goto(BASE+'/discovery');
    const trigger=page.getByRole('button',{name:'Show which lines',exact:true});
    if(!await trigger.isVisible())await page.getByRole('button',{name:'List filters',exact:true}).click();
    await trigger.click();
    const menu=page.locator('.filter-select-menu');await expect(menu).toBeVisible();
    for(const label of ['Line types','Weekly changes','Sellers.json'])await expect(menu.getByRole('group',{name:label,exact:true})).toBeVisible();
    for(const choice of await menu.getByRole('menuitem').all()){
      await expect(choice).toHaveAttribute('aria-describedby',/.+/);
      await expect(choice.locator('.filter-option-description')).not.toBeEmpty();
    }
    const box=(await menu.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(15);expect(box.x+box.width).toBeLessThanOrEqual(width-15);
    expect(await menu.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.screenshot({path:`outputs/pathfinder-contract-audit-20261030/filter-${width}.png`,animations:'disabled'});
    await menu.getByRole('menuitem',{name:'RESELLER lines',exact:true}).click();
    await expect.poll(()=>calls.some(call=>call.path.endsWith('/discovered-lines')&&call.query.includes('show=reseller'))).toBe(true);
    const sort=page.getByRole('button',{name:'Sort discovered lines',exact:true});
    if(!await sort.isVisible())await page.getByRole('button',{name:'List filters',exact:true}).click();
    await sort.click();
    await expect(menu.getByRole('group',{name:'Current page',exact:true})).toContainText('Rank the current page');
    await menu.getByRole('menuitem',{name:'SSP domain (A-Z)',exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.goto(BASE);
    const match=page.getByTestId('match-type');if(!await match.isVisible())await page.getByRole('button',{name:'List filters',exact:true}).click();
    await match.click();await expect(menu.getByRole('menuitem',{name:'IPD',exact:true})).toHaveAccessibleDescription('Via a declared inventory partner');
    await menu.getByRole('menuitem',{name:'IPD',exact:true}).click();
    await expect.poll(()=>calls.some(call=>call.path.endsWith('/matched-developers')&&call.query.includes('match_type=ipd'))).toBe(true);
  });
}
for(const width of [1440,960]){
  test(`${width}px: the status close control stays visible at the end of the expanded track`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.addInitScript(quiet);
    await installFakeApi(page,{watchTabs:true,inactive:'ok'});await page.goto(BASE);
    const toggle=page.getByTestId('status-toggle');await expect(toggle).toHaveText('+4 statuses');
    await toggle.click();await expect(toggle).toHaveText('Fewer');await expect(toggle).toHaveAccessibleName('Hide additional statuses');
    const bounds=await toggle.evaluate(el=>{const box=el.getBoundingClientRect(),parent=el.parentElement!.getBoundingClientRect();return{left:box.left,right:box.right,min:parent.left,max:parent.right};});
    expect(bounds.left).toBeGreaterThanOrEqual(bounds.min);expect(bounds.right).toBeLessThanOrEqual(bounds.max+1);
    await page.getByRole('tab',{name:'Inactive',exact:true}).click();await expect(page.getByRole('heading',{name:'Inactive publishers',exact:true})).toBeVisible();
    await toggle.click();await expect(toggle).toHaveText('+4 statuses');await expect(page.getByRole('tab',{name:'Inactive',exact:true})).not.toBeVisible();
    await page.screenshot({path:`outputs/pathfinder-contract-audit-20261030/status-${width}.png`,animations:'disabled'});
  });
}
for(const reducedMotion of ['no-preference','reduce'] as const){
  test(`description Show more and Show less roll smoothly and respect ${reducedMotion}`,async({page})=>{
    await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion});await page.addInitScript(quiet);
    await installFakeApi(page,{discovery:true});await page.goto(BASE+'/discovery');
    const toggle=page.getByRole('button',{name:'Show more about Discovery',exact:true});await expect(toggle).toHaveText('Show more');
    const panel=page.locator('.report-description-reveal').first();
    expect(await panel.evaluate(el=>(el as HTMLElement).inert)).toBe(true);
    expect(await panel.evaluate(el=>el.getBoundingClientRect().height)).toBe(0);
    await toggle.click();
    const heights=await panel.evaluate(async el=>{const values:number[]=[];for(let i=0;i<20;i++){await new Promise(requestAnimationFrame);values.push(el.getBoundingClientRect().height);}return values;});
    expect(heights.at(-1)!).toBeGreaterThan(20);
    if(reducedMotion==='no-preference')expect(heights.some(height=>height>0&&height<heights.at(-1)!-1)).toBe(true);
    else expect(await panel.evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
    await expect(page.getByRole('button',{name:'Show less about Discovery',exact:true})).toHaveText('Show less');
    expect(await panel.evaluate(el=>(el as HTMLElement).inert)).toBe(false);
    await page.getByRole('button',{name:'Show less about Discovery',exact:true}).click();
    await expect.poll(()=>panel.evaluate(el=>el.getBoundingClientRect().height)).toBe(0);
    expect(await panel.evaluate(el=>(el as HTMLElement).inert)).toBe(true);
  });
}
