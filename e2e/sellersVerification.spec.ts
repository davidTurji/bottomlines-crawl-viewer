import {test,expect} from '@playwright/test';
import {installFakeApi,TOKEN} from './fakeApi';
import {segaReport} from '../src/lib/mockSellers';

for(const scenario of ["browser", "proxy", "gb", "blocked"] as const) {
  const recovered = scenario !== "blocked";
  test(`SEGA ${scenario} is never offered for removal`,async({page})=>{
    await page.addInitScript(()=>localStorage.setItem('pf_report_walkthrough_v1',JSON.stringify({status:'completed',stepId:null,open:false})));
    await installFakeApi(page,{sellers:'page'});
    const payload = segaReport(recovered);
    payload.file_checks[1].via = scenario === "browser" ? "browser" : "proxy";
    payload.file_checks[1].proxy_country = scenario === "gb" ? "gb" : null;
    await page.route('**/api/v1/viewer/*/sellers-fix',route=>route.fulfill({json:payload}));
    await page.goto(`/crawl-report/${TOKEN}/sellers`);
    await expect(page.getByRole('heading',{name:'Sellers.json',exact:true})).toBeVisible();
    await expect(page.getByRole('checkbox',{name:'Remove from file',exact:true})).toHaveCount(0);
    const unknown=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Unreachable files'})});
    await expect(unknown.locator('summary')).toContainText('Info');
    await expect(page.getByText('Needs checking', {exact:true})).toHaveCount(0);
    await expect(page.getByText('Not seen in checked files', {exact:true}).locator('..')).toContainText('0');
    await unknown.locator('summary').click();
    await expect(unknown.getByText('From your file: BOTH',{exact:false})).toBeVisible();
    if(recovered) await expect(unknown.getByText('Sega',{exact:true})).toHaveCount(0);
    else {
      await expect(unknown.getByText('From your file: PUBLISHER',{exact:false})).toBeVisible();
      await expect(unknown).toContainText('no removal recommendation');
      await expect(unknown).toContainText('This does not mean the seller is missing');
    }
    const checks=page.locator('details').filter({has:page.locator('summary').filter({hasText:'File checks'})});
    await checks.locator('summary').click();
    const app=checks.locator('div.flex').filter({has:page.getByRole('link',{name:'sega.com/app-ads.txt',exact:true})});
    await expect(app).toContainText(recovered?`Read · ${scenario === 'browser' ? 'browser retry' : scenario === 'gb' ? 'proxy retry (GB)' : 'proxy retry'} · HTTP 200`:'Couldn’t fetch · proxy retry · HTTP 429');
    await expect(page.getByRole('heading',{name:/Not seen, check first/})).toHaveCount(0);
  });
}
