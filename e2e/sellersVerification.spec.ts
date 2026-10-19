import {test,expect} from '@playwright/test';
import {installFakeApi,TOKEN} from './fakeApi';
import {segaReport} from '../src/lib/mockSellers';

for(const recovered of [true,false]) {
  test(`SEGA ${recovered?'recovered through proxy':'unverified'} is never offered for removal`,async({page})=>{
    await page.addInitScript(()=>localStorage.setItem('pf_report_walkthrough_v1',JSON.stringify({status:'completed',stepId:null,open:false})));
    await installFakeApi(page,{sellers:'page'});
    await page.route('**/api/v1/viewer/*/sellers-fix',route=>route.fulfill({json:segaReport(recovered)}));
    await page.goto(`/crawl-report/${TOKEN}/sellers`);
    await expect(page.getByRole('heading',{name:'Sellers.json',exact:true})).toBeVisible();
    await expect(page.getByRole('checkbox',{name:'Remove from file',exact:true})).toHaveCount(0);
    const unknown=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Couldn’t verify'})});
    await unknown.locator('summary').click();
    await expect(unknown.getByText('From your file: BOTH',{exact:false})).toBeVisible();
    if(recovered) await expect(unknown.getByText('Sega',{exact:true})).toHaveCount(0);
    else await expect(unknown.getByText('From your file: PUBLISHER',{exact:false})).toBeVisible();
    const checks=page.locator('details').filter({has:page.locator('summary').filter({hasText:'File checks'})});
    await checks.locator('summary').click();
    const app=checks.locator('div.flex').filter({has:page.getByRole('link',{name:'sega.com/app-ads.txt',exact:true})});
    await expect(app).toContainText(recovered?'Read · proxy retry · HTTP 200':'Couldn’t verify · proxy retry · HTTP 429');
    await expect(page.getByRole('heading',{name:/Not seen, check first/})).toHaveCount(0);
  });
}
