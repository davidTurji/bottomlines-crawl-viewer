import { expect, test } from '@playwright/test';
import { installFakeApi, TOKEN } from './fakeApi';

for (const width of [1440, 390]) {
  test(`${width}px: opening a publisher and switching rows keeps the clicked header in place`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installFakeApi(page, {});
    await page.goto(`/crawl-report/${TOKEN}`);
    const toggles = page.locator('button[aria-label*="the seat lines of"]');
    const first = toggles.first();
    await first.scrollIntoViewIfNeeded();
    const firstY = await first.evaluate(el => el.getBoundingClientRect().top);
    const box = await first.boundingBox();
    await first.click({ position: { x: (box?.width ?? 100) - 30, y: 24 } });
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(350);
    expect(Math.abs(await first.evaluate(el => el.getBoundingClientRect().top) - firstY)).toBeLessThanOrEqual(2);
    const second = toggles.nth(1);
    await second.scrollIntoViewIfNeeded();
    await second.evaluate(el => {
      const scroller = el.closest('[data-report-main]')!;
      scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 150;
    });
    const secondY = await second.evaluate(el => el.getBoundingClientRect().top);
    const next = await second.boundingBox();
    await second.click({ position: { x: (next?.width ?? 100) - 30, y: 24 } });
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(350);
    expect(Math.abs(await second.evaluate(el => el.getBoundingClientRect().top) - secondY)).toBeLessThanOrEqual(2);
  });
}

test('tablet navigation stays full width; mobile drawer closes without losing the report', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await installFakeApi(page, { discovery: true });
  await page.goto(`/crawl-report/${TOKEN}`);
  await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeHidden();
  await expect(page.locator('[data-sidebar="sidebar"]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Close navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(page.locator('[data-mobile="true"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your weekly crawl' })).toBeVisible();
});

test('Discovery connects search, filters, export and pagination with inline comparisons', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installFakeApi(page, { discovery: true });
  await page.goto(`/crawl-report/${TOKEN}/discovery`);
  const search = page.getByRole('textbox', { name: 'Search seller IDs or publishers' });
  const pager = page.locator('.list-toolbar-pager').first();
  await expect(search).toBeVisible();
  await expect(pager).toBeVisible();
  const s = (await search.boundingBox())!;
  const p = (await pager.boundingBox())!;
  const toolbar = page.locator('[data-list-toolbar]').filter({ has: search });
  await expect(toolbar.getByRole('button', { name: 'Show which lines' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Export CSV' })).toBeVisible();
  await expect(toolbar.locator('.list-toolbar-pager')).toBeVisible();
  expect(Math.abs((s.y + s.height / 2) - (p.y + p.height / 2))).toBeLessThan(3);
  for (const delta of await page.locator('.report-kpi-discovery .report-delta').all()) {
    const amount = (await delta.locator(':scope > span').first().boundingBox())!;
    const period = (await delta.locator('.report-delta-period').boundingBox())!;
    expect(period.x).toBeGreaterThan(amount.x + amount.width);
    expect(Math.abs(period.y - amount.y)).toBeLessThan(5);
  }
});

for (const width of [390, 320]) {
test(`${width}px phone Discovery status, publisher count and new label do not overlap`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await installFakeApi(page, { discovery: true, sellers: 'page' });
  await page.goto(`/crawl-report/${TOKEN}/discovery`);
  const rows = page.locator('[data-discovered-line]');
  await expect(rows.first()).toBeVisible();
  const clean = await rows.evaluateAll(items => items.every(row => {
    const meta = row.querySelector('.discovery-line-meta')!;
    const bounds = meta.getBoundingClientRect();
    const children = [...meta.children].filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect());
    return children.every((a, i) => a.left >= bounds.left - 1 && a.right <= bounds.right + 1 && children.every((b, j) =>
      i === j || Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 || Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1));
  }));
  expect(clean).toBe(true);
});

}
