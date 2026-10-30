import { test, expect } from '@playwright/test';
import { installFakeApi, TOKEN } from './fakeApi';
import { expectReportCentered } from './modalGeometry';

const BASE = `/crawl-report/${TOKEN}`;
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
    const exportButton = card.getByRole('button', {name:'Export CSV',exact:true});
    const exportBox = (await exportButton.boundingBox())!;
    expect(exportBox.height).toBeLessThanOrEqual(width < 640 ? 36 : 32);
    await expect.poll(() => card.evaluate(el => {
      const toolbar = el.querySelector('.declaration-detail > div')!;
      const count = toolbar.querySelector('span')!.getBoundingClientRect();
      const button = toolbar.querySelector('button')!.getBoundingClientRect();
      return button.x - count.right <= 16 && Math.abs(button.y + button.height / 2 - count.y - count.height / 2) < 1;
    })).toBe(true);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(card.getByRole('button', { name: 'Export CSV', exact: true })).not.toBeVisible();
    await expect.poll(() => card.evaluate(el => {
      const style = getComputedStyle(el);
      return style.borderBottomWidth === style.borderTopWidth && style.borderBottomColor === style.borderTopColor;
    })).toBe(true);
    await toggle.click();
    await expect(card.getByRole('button', { name: 'Export CSV', exact: true })).toBeVisible();
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
