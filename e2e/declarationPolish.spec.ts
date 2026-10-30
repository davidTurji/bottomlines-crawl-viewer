import { test, expect, type Locator } from '@playwright/test';
import { installFakeApi, TOKEN } from './fakeApi';

const BASE = `/crawl-report/${TOKEN}`;
async function centered(target: Locator, width: number, height: number) {
  await expect(target).toBeVisible();
  await expect.poll(async () => {
    const box = await target.boundingBox();
    return box ? Math.max(Math.abs(box.x + box.width / 2 - width / 2), Math.abs(box.y + box.height / 2 - height / 2)) : Infinity;
  }).toBeLessThan(1);
}

for (const width of [1440, 390, 320]) {
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
    await centered(page.getByRole('dialog', { name: 'Open source file' }), width, height);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: /^(How this works|Guide)$/ }).click();
    await centered(page.locator('.walkthrough-prompt'), width, height);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.screenshot({ path: `outputs/pathfinder-contract-audit-20261030/declarations-polished-${width}.png` });
    await page.goto(`${BASE}/sellers`);
    const grid = page.locator('.report-kpi-grid');
    await expect(grid.locator('.report-stat')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `outputs/pathfinder-contract-audit-20261030/sellers-kpis-${width}.png` });
  });
}
