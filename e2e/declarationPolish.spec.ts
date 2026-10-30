import { test, expect } from '@playwright/test';
import { installFakeApi, TOKEN } from './fakeApi';
import { expectReportCentered } from './modalGeometry';
import { readFile } from 'node:fs/promises';

const BASE = `/crawl-report/${TOKEN}`;
test('declaration toolbar exports every matching domain across pages', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('pf_report_walkthrough_v1', JSON.stringify({status:'completed',stepId:null,open:false})));
  await installFakeApi(page);
  const rows = Array.from({length:27}, (_,i) => ({declaration:'inventory partner',declared_domain:`partner-${String(i).padStart(2,'0')}.example`,declared_by:`publisher-${i}.example`,country:'',found_in:'ads.txt'}));
  await page.route('**/api/v1/viewer/*/declarations', route => route.fulfill({json:{rows:[...rows,{...rows[0],declaration:'owner domain',declared_domain:'owner.example'}],total:28}}));
  await page.goto(`${BASE}/declarations`);
  const section=page.locator('[data-declaration-section="inventory partner"]');
  const toolbar=section.locator('[data-list-toolbar]');
  const button=toolbar.getByRole('button',{name:'Export CSV',exact:true});
  const download=async()=>{
    const event=page.waitForEvent('download');await button.click();
    return readFile((await(await event).path())!,'utf8');
  };
  await expect(section.locator('.declaration-card')).toHaveCount(25);
  const csv=await download();
  expect(csv.trim().split('\n')).toHaveLength(28);
  for(const row of rows) expect(csv).toContain(`"${row.declared_domain}","${row.declared_by}"`);
  expect(csv).not.toContain('owner.example');
  await toolbar.getByRole('button',{name:'Next page',exact:true}).click();
  await expect(section.locator('.declaration-card')).toHaveCount(2);
  expect(await download()).toBe(csv);
  await toolbar.getByRole('textbox').fill('publisher-26.example');
  await expect(section.locator('.declaration-card')).toHaveCount(1);
  const filtered=await download();
  expect(filtered.trim().split('\n')).toHaveLength(2);
  expect(filtered).toContain('"partner-26.example","publisher-26.example"');
  expect(filtered).not.toContain('partner-00.example');
  await toolbar.getByRole('textbox').fill('no-such-domain');
  await expect(button).toBeDisabled();
});
for (const width of [1440, 800, 390, 320]) {
  test(`${width}px: declarations collapse cleanly, dialogs center, and seller KPIs fit`, async ({ page }) => {
    const height = 844;
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => localStorage.setItem('pf_report_walkthrough_v1', JSON.stringify({ status: 'completed', stepId: null, open: false })));
    await installFakeApi(page, { sellers: 'page' });
    await page.goto(`${BASE}/declarations`);
    const section = page.locator('[data-declaration-section="inventory partner"]');
    await expect(section.getByText('1 domain', { exact: true })).toHaveCount(1);
    const card = section.locator('.declaration-card').first();
    const toggle = card.locator(':scope > button');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const exportButton = section.locator('[data-list-toolbar]').getByRole('button', {name:'Export CSV',exact:true});
    const exportBox = (await exportButton.boundingBox())!;
    expect(exportBox.height).toBeLessThanOrEqual(width < 640 ? 36 : 32);
    await expect(section.locator('[data-list-toolbar]').getByRole('textbox')).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(exportButton).toBeVisible();
    await expect.poll(() => card.evaluate(el => {
      const style = getComputedStyle(el);
      return style.borderBottomWidth === style.borderTopWidth && style.borderBottomColor === style.borderTopColor;
    })).toBe(true);
    await toggle.click();
    await expect(exportButton).toBeVisible();
    await card.getByRole('button', { name: /choose ads.txt or app-ads.txt/ }).first().click();
    await expectReportCentered(page, page.getByRole('dialog', { name: 'Open source file' }));
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: /^(How this works|Guide)$/ }).click();
    await expectReportCentered(page, page.locator('.walkthrough-prompt'));
    if (width === 1440) {
      for (const resized of [800, 390, 1440]) {
        await page.setViewportSize({ width: resized, height });
        await expectReportCentered(page, page.locator('.walkthrough-prompt'));
      }
    }
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.screenshot({ path: `outputs/pathfinder-contract-audit-20261030/declarations-polished-${width}.png` });
    await page.goto(`${BASE}/sellers`);
    const grid = page.locator('.report-kpi-grid');
    await expect(grid.locator('.report-stat')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `outputs/pathfinder-contract-audit-20261030/sellers-kpis-${width}.png` });
  });
}
