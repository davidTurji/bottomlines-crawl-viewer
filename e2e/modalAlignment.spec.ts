import { test, expect } from '@playwright/test';
import { installFakeApi, TOKEN } from './fakeApi';
import { expectReportCentered } from './modalGeometry';

for (const width of [1440, 800, 390, 320]) {
  test(`${width}px: help and contact dialogs align with the report and stay within the screen`, async ({ page }) => {
    await page.setViewportSize({width, height: 844});
    await page.addInitScript(() => localStorage.setItem('pf_report_walkthrough_v1', JSON.stringify({status:'completed',stepId:null,open:false})));
    await installFakeApi(page, {schain:'ok', trial:true});
    await page.goto(`/crawl-report/${TOKEN}/schain`);
    await page.getByRole('button', {name:'How it works', exact:true}).click();
    const help = page.getByRole('dialog', {name:'How Schain works'});
    await expectReportCentered(page, help);
    await help.getByRole('button', {name:'Close', exact:true}).click();
    await page.goto(`/crawl-report/${TOKEN}`);
    await page.getByRole('button', {name:'Unlock Now', exact:true}).first().click();
    const contact = page.getByRole('dialog', {name:'Want the whole picture for your domain?'});
    await expectReportCentered(page, contact);
    await expect(contact.getByRole('link', {name:'david@bottomlines.ai'})).toHaveAttribute('href', 'mailto:david@bottomlines.ai');
    await contact.getByRole('button', {name:'Close', exact:true}).click();
  });
}
