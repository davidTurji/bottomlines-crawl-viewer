import {test,expect} from '@playwright/test';
import {installFakeApi,TOKEN} from './fakeApi';
import {segaReport, verificationReport} from '../src/lib/mockSellers';

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
    const group=page.getByTestId('seller-info');
    const unknown=page.getByTestId('seller-info-unreachable');
    await expect(unknown).not.toBeVisible();
    await group.locator(':scope > button').click();
    await expect(unknown.locator(':scope > button')).toContainText('Unreachable files');
    await expect(page.getByText('Needs checking', {exact:true})).toHaveCount(0);
    await expect(page.getByText('Not seen', {exact:true}).locator('..')).toContainText('0');
    await unknown.locator(':scope > button').click();
    await expect(unknown.getByText('From your file: BOTH',{exact:false})).toBeVisible();
    if(recovered) await expect(unknown.getByText('Sega',{exact:true})).toHaveCount(0);
    else {
      await expect(unknown.getByText('From your file: PUBLISHER',{exact:false})).toBeVisible();
      await expect(unknown).toContainText('no removal recommendation');
      await expect(unknown).toContainText('This does not mean the seller is missing');
    }
    await expect(page.getByTestId('seller-info-checks')).toHaveCount(0);
    await expect(page.getByText('File checks',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('heading',{name:/Not seen, check first/})).toHaveCount(0);
  });
}


test('full viewer distinguishes read outcomes from seller fixes', async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('pf_report_walkthrough_v1',JSON.stringify({status:'completed',stepId:null,open:false})));
  await installFakeApi(page,{sellers:'page'});
  await page.route('**/api/v1/viewer/*/sellers-fix',route=>route.fulfill({json:verificationReport()}));
  await page.goto(`/crawl-report/${TOKEN}/sellers`);
  const group=page.getByTestId('seller-info');
  const info=page.getByTestId('seller-info-unreachable');
  await expect(info).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Download file',exact:true})).toHaveCount(2);
  await group.locator(':scope > button').click();
  await info.locator(':scope > button').click();
  await expect(info).toContainText('Fogharbor News');
  await expect(info).toContainText('Bramblemist TV');
  await expect(info).toContainText('Cloudwillow Media');
  await expect(info).toContainText('Ferncloud Audio');
  await expect(info.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByTestId('seller-info-checks')).toHaveCount(0);
  await expect(page.getByText('File checks',{exact:true})).toHaveCount(0);
  await expect(page.getByText(/HTTP \d{3}/)).toHaveCount(0);
  await page.getByRole('link',{name:'Overview',exact:true}).click();
  await expect(page).not.toHaveURL(/sellers$/);
});


test('successful checks do not create an empty customer Info section', async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('pf_report_walkthrough_v1',JSON.stringify({status:'completed',stepId:null,open:false})));
  await installFakeApi(page,{sellers:'page'});
  const payload=segaReport(true);
  payload.file.sellers=payload.file.sellers.filter(s=>s.seller_id === '10360');
  payload.file_checks=payload.file_checks.filter(c=>c.seller_ids.includes('10360'));
  await page.route('**/api/v1/viewer/*/sellers-fix',route=>route.fulfill({json:payload}));
  await page.goto(`/crawl-report/${TOKEN}/sellers`);
  await expect(page.getByRole('heading',{name:'Sellers.json',exact:true})).toBeVisible();
  await expect(page.getByTestId('seller-info')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:/Not seen, check first/})).toHaveCount(0);
});
