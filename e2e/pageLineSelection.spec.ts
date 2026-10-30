import { expect, test, type Page } from '@playwright/test';
import { installFakeApi, TOKEN } from './fakeApi';

async function setup(page: Page, width: number, discovery = false) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem('pf_report_walkthrough_v1', JSON.stringify({ status: 'completed', stepId: null, open: false })));
  await installFakeApi(page, { discovery });
  await page.goto(`/crawl-report/${TOKEN}${discovery ? '/discovery' : ''}`);
}

for (const width of [1440, 390]) {
  test(`${width}px: one preselected line across change windows, with meaning-specific accents`, async ({ page }) => {
    await setup(page, width);
    await page.locator('.report-expand-control').first().click();
    const first = page.locator('[data-line-tone="added"] .line-entry').first();
    await expect(first).toHaveClass(/line-entry-selected/);
    await expect(page.locator('[data-line-actions]')).toHaveCount(1);
    for (const tone of ['removed', 'cert', 'added']) {
      const window = page.locator(`[data-line-tone="${tone}"]`).first();
      const row = window.locator('.line-entry').last();
      await row.locator('[data-line-text]').click();
      await expect(row).toHaveClass(/line-entry-selected/);
      await expect(page.locator('.line-entry-selected')).toHaveCount(1);
      await expect(page.locator('[data-line-actions]')).toHaveCount(1);
      const bg = await row.evaluate(el => getComputedStyle(el).backgroundColor.match(/\d+/g)!.slice(0,3).map(Number));
      if (tone === 'removed') expect(bg[0]).toBeGreaterThan(Math.max(bg[1], bg[2]));
      if (tone === 'added') expect(bg[1]).toBeGreaterThan(Math.max(bg[0], bg[2]));
      if (tone === 'cert') { expect(bg[0]).toBeGreaterThan(bg[2]); expect(bg[1]).toBeGreaterThan(bg[2]); }
      const source = row.locator('[data-line-actions] .line-control-source');
      await expect(source).toBeVisible();
      if (await source.evaluate(el => el.tagName === 'A')) {
        await expect(source).toHaveAttribute('href', /^https:\/\/.*\/(app-)?ads\.txt/);
      } else {
        await source.click();
        await expect(page.getByRole('link', { name: 'ads.txt', exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: 'app-ads.txt', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
      }
    }
    await page.locator('.report-expand-control').nth(1).click();
    await expect(page.locator('.line-entry-selected')).toHaveCount(1);
    await expect(page.locator('.line-action-group').first().locator('.line-entry').first()).toHaveClass(/line-entry-selected/);
    await page.locator('.report-expand-control').nth(1).click();
    await expect(page.locator('[data-line-actions]')).toHaveCount(0);
  });
}

test('Discovery: newly opened groups preselect their first record without leaving two selections on the page', async ({ page }) => {
  await setup(page, 1440, true);
  const cards = page.locator('[data-discovered-line]');
  await cards.first().locator(':scope > button').click();
  await expect(cards.first().locator('.line-entry-selected')).toHaveCount(1);
  const green = await cards.first().locator('.line-entry-selected').evaluate(el => getComputedStyle(el).backgroundColor.match(/\d+/g)!.slice(0,3).map(Number));
  expect(green[1]).toBeGreaterThan(Math.max(green[0], green[2]));
  await expect(page.locator('[data-line-actions]')).toHaveCount(1);
  await cards.nth(1).locator(':scope > button').click();
  await expect(cards.nth(1).locator('.line-entry-selected')).toHaveCount(1);
  await expect(cards.first().locator('.line-entry-selected')).toHaveCount(0);
  await expect(page.locator('[data-line-actions]')).toHaveCount(1);
  await cards.first().locator('.line-entry [data-line-text]').last().click();
  await expect(cards.first().locator('.line-entry-selected')).toHaveCount(1);
  await expect(cards.nth(1).locator('.line-entry-selected')).toHaveCount(0);
  await expect(page.locator('[data-line-actions]')).toHaveCount(1);
});
