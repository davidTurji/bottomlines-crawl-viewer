import {expect,test} from '@playwright/test';
import {installFakeApi,TOKEN} from './fakeApi';
import {chooseFilter} from './filterChoice';
import {mockDeclarations, mockDiscoveredLinePlacements} from '../src/lib/mockData';
const BASE=`/crawl-report/${TOKEN}`;
const quietTour=()=>localStorage.setItem('pf_report_walkthrough_v1',JSON.stringify({status:'completed',stepId:null,open:false}));

for(const width of [1440,390]){
  test(`${width}px: closing a short IPD list preserves scroll position and KPI location`,async({page})=>{
    await page.setViewportSize({width,height:600});await page.addInitScript(quietTour);
    await installFakeApi(page,{matchType:true});await page.goto(BASE);
    await chooseFilter(page,'match-type','IPD');
    const header=page.locator('button[aria-label*="the seat lines of"]').first();
    await header.click({position:{x:20,y:20}});await expect(header).toHaveAttribute('aria-expanded','true');
    await page.waitForTimeout(300);
    await header.evaluate(el=>{const main=el.closest('[data-report-main]')!;main.scrollTop=main.scrollHeight;});
    // Capture after the browser's own click auto-scroll, immediately before React runs.
    await header.evaluate(el=>el.addEventListener('click',()=>{
      const main=el.closest<HTMLElement>('[data-report-main]')!;
      main.dataset.beforeScroll=String(main.scrollTop);
      main.dataset.beforeKpi=String(document.querySelector('[data-kpi-comparison]')!.getBoundingClientRect().top);
    },{capture:true,once:true}));
    await header.click({position:{x:20,y:20}});await expect(header).toHaveAttribute('aria-expanded','false');
    const shifts=await page.locator('[data-report-main]').evaluate(async main=>{
      const before=Number((main as HTMLElement).dataset.beforeScroll),kpi=Number((main as HTMLElement).dataset.beforeKpi);
      const values:number[]=[];const start=performance.now();
      while(performance.now()-start<350){await new Promise(requestAnimationFrame);values.push(Math.abs(main.scrollTop-before),Math.abs(document.querySelector('[data-kpi-comparison]')!.getBoundingClientRect().top-kpi));}
      return values;
    });
    expect(Math.max(...shifts)).toBeLessThanOrEqual(2);
  });

  test(`${width}px: publisher/app swaps retain the viewport even when the replacement has fewer rows`,async({page})=>{
    await page.setViewportSize({width,height:600});await page.addInitScript(quietTour);
    await installFakeApi(page,{matchType:true});await page.goto(BASE);
    await chooseFilter(page,'match-type','IPD');
    for(const label of [/Matched apps/,/Matched publishers/]){
      const tile=page.getByRole('button',{name:label}).first();
      await tile.evaluate(el=>el.addEventListener('click',()=>{
        const main=el.closest<HTMLElement>('[data-report-main]')!;main.dataset.swapTop=String(main.scrollTop);
      },{capture:true,once:true}));
      await tile.click();
      await expect(page.getByRole('heading',{name:label})).toBeVisible();
      await page.waitForTimeout(350);
      expect(await page.locator('[data-report-main]').evaluate(el=>Math.abs(el.scrollTop-Number((el as HTMLElement).dataset.swapTop)))).toBeLessThanOrEqual(2);
    }
  });

  test(`${width}px: Discovery Show fewer returns to the first three files after paging and preserves export access`,async({page})=>{
    await page.setViewportSize({width,height:844});await page.addInitScript(quietTour);
    const calls=await installFakeApi(page,{discovery:true});await page.goto(BASE+'/discovery');
    const card=page.locator('[data-discovered-line]').first();await card.locator(':scope > button').click();
    await expect(card.locator('.discovery-placement')).toHaveCount(3);
    await card.getByRole('button',{name:/^Show \d+ more$/}).click();
    await expect(card.locator('.discovery-placement')).toHaveCount(25);
    await card.getByRole('navigation',{name:'Pages'}).first().getByRole('button',{name:'Next page',exact:true}).click();
    await expect.poll(()=>calls.some(call=>call.path.endsWith('/placements')&&call.query.includes('page=2'))).toBe(true);
    await expect(card.locator('.discovery-placement')).toHaveCount(25);
    await card.getByRole('button',{name:'Show fewer',exact:true}).click();
    await expect(card.locator('.discovery-placement')).toHaveCount(3);
    await expect(card.getByRole('button',{name:/^Show \d+ more$/})).toBeVisible();
    await expect(card.getByRole('button',{name:'Export every publisher source file carrying this line as CSV'})).toBeEnabled();
  });

  test(`${width}px: older declaration reports never offer an unsupported filter that hides the controls`,async({page})=>{
    await page.setViewportSize({width,height:844});await page.addInitScript(quietTour);
    await installFakeApi(page,{});
    await page.route(`**/api/v1/viewer/${TOKEN}/declarations`,route=>route.fulfill({json:mockDeclarations}));
    await page.goto(BASE+'/declarations');
    const section=page.locator('[data-declaration-section]').first();
    const filter=section.getByRole('button',{name:'Which declarations to show'});
    await expect(filter).toBeAttached();
    if(!await filter.isVisible())await section.getByRole('button',{name:'List filters'}).click();
    await filter.click();await expect(page.getByRole('menuitem',{name:'Manager domains',exact:true})).toHaveCount(0);
    await page.getByRole('menuitem',{name:'Owner domains',exact:true}).click();
    await expect(page.locator('[data-declaration-section="owner domain"]')).toBeVisible();
    await expect(page.getByPlaceholder('Filter by domain, named or naming')).toHaveCount(1);
  });
}

test('Discovery ignores out-of-order roster search responses',async({page})=>{
  await page.addInitScript(quietTour);await installFakeApi(page,{discovery:true});
  let release!:()=>void;const delayed=new Promise<void>(resolve=>release=resolve);
  await page.route('**/discovered-lines/placements?*',async route=>{
    const q=new URL(route.request().url()).searchParams;
    const query=q.get('q');if(!query)return route.fallback();
    if(query==='slow')await delayed;
    const original=mockDiscoveredLinePlacements({ssp_domain:q.get('ssp_domain')!,publisher_id:q.get('publisher_id')!,relationship:q.get('relationship')!,cert_id:q.get('cert_id')??''},{page:1,page_size:25});
    await route.fulfill({json:{...original,total:1,rows:[{...original.rows[0],developer_domain:`${query}.test`,developer_name:`${query} result`}]}});
  });
  await page.goto(BASE+'/discovery');const card=page.locator('[data-discovered-line]').first();await card.locator(':scope > button').click();
  const search=card.getByRole('textbox',{name:'Search publishers carrying this line'});
  await expect(card.locator('.discovery-placement')).toHaveCount(3);
  await Promise.all([page.waitForRequest(req=>req.url().includes('/placements?')&&req.url().includes('q=slow')),search.fill('slow')]);
  await search.fill('fresh');await expect(card.locator('.discovery-placement')).toContainText('fresh result');
  release();await page.waitForTimeout(250);
  await expect(card.locator('.discovery-placement')).toContainText('fresh result');
  await expect(card.locator('.discovery-placement')).not.toContainText('slow result');
});
