import { expect, test } from '@playwright/test';
import { installFakeApi, TOKEN } from './fakeApi';

for (const width of [1440, 390]) {
  test(`${width}px: recommendations stay hidden and the simple brand fits the navigation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('pf_report_walkthrough_v1', JSON.stringify({ status: 'completed', stepId: null, open: false })));
    await installFakeApi(page, { matchType: true, watchTabs: true, appChange: true });
    await page.goto(`/crawl-report/${TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Matched publishers', exact: true })).toBeVisible();
    await expect(page.getByTestId('popular')).toHaveCount(0);
    if (width === 390) await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
    await expect(page.locator('.pathfinder-brand-wordmark')).toHaveText('Pathfinder');
    const fits = await page.locator('.pathfinder-brand-header').evaluate(header => {
      const box = header.getBoundingClientRect();
      const mark = header.querySelector('.pathfinder-brand-symbol')!.getBoundingClientRect();
      const word = header.querySelector('.pathfinder-brand-wordmark')!.getBoundingClientRect();
      return mark.left >= box.left + 8 && mark.top >= box.top + 3 && mark.bottom <= box.bottom - 3 && word.left > mark.right && word.right <= box.right - 8;
    });
    expect(fits).toBe(true);
    if (width === 390) await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
