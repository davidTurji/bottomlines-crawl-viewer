import { expect, test } from "@playwright/test";
import { installFakeApi, TOKEN } from "./fakeApi";
import { mockMatchedDevelopers, mockPreviousSummary } from "../src/lib/mockData";

for (const width of [1440, 390]) {
  test(`${width}px: line text, copying and source navigation are separate`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await installFakeApi(page, {});
    await page.goto(`/crawl-report/${TOKEN}`);
    const toggle = page.getByRole("button", { name: /^Show the seat lines of/ }).first();
    const box = await toggle.boundingBox();
    await toggle.click({ position: { x: (box?.width ?? 100) - 35, y: 24 } });
    const group = page.locator('.line-action-group').first();
    const row = group.locator('.line-entry:has([data-line-text])').first();
    const text = row.locator('[data-line-text]').first();
    await expect(text).toBeVisible();
    const line = (await text.innerText()).trim();
    const source = row.locator('[data-line-actions] a');
    await expect(row.locator('[data-line-actions]')).toHaveCount(1);
    await expect(page.locator('[data-line-actions]')).toHaveCount(1);
    const tabs = page.context().pages().length;
    await page.evaluate(() => navigator.clipboard.writeText('clipboard unchanged'));
    await text.click();
    await expect(row.locator('[data-line-actions]')).toHaveCount(1);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('clipboard unchanged');
    expect(page.context().pages().length).toBe(tabs);
    await group.getByRole('button', { name: /^Copy / }).click();
    await expect(group.getByText('Copied', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(line);
    expect(page.context().pages().length).toBe(tabs);
    await expect(source).toHaveAttribute('target', '_blank');
    await expect(source).toHaveText('Open file');
    const href = await source.getAttribute('href');
    await expect(source).toHaveAttribute('href', /^https:\/\/[^#]+\/(app-)?ads\.txt/);
    // Keep source reads local to the test: never request a real publisher.
    await page.context().route('https://**/*', route => route.fulfill({ contentType: 'text/plain', body: line }));
    await page.evaluate(() => navigator.clipboard.writeText('keep before opening file'));
    const popup = page.waitForEvent('popup');
    await source.click();
    const opened = await popup;
    await opened.waitForLoadState();
    expect(opened.url()).toBe(href);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('keep before opening file');
    await opened.close();
    const geometry = await group.locator('[data-line-actions]').evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const row = el.closest('.line-entry')!.getBoundingClientRect();
      if (bounds.left < row.left || bounds.right > row.right) return false;
      return [...el.querySelectorAll('button,a')].every(item => {
        const r = item.getBoundingClientRect();
        return r.left >= bounds.left && r.right <= bounds.right && r.height >= 29;
      });
    });
    expect(geometry).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('a choice of source files opens a menu without copying', async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await installFakeApi(page, {});
  await page.route('**/matched-developers?*', async route => {
    const body = structuredClone(mockMatchedDevelopers(1));
    const patch = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(patch);
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if ('ssp_domain' in record && 'publisher_id' in record) record.found_in = 'both';
        Object.values(record).forEach(patch);
      }
    };
    patch(body);
    await route.fulfill({ json: body });
  });
  await page.goto(`/crawl-report/${TOKEN}`);
  await page.getByRole('button', { name: /^Show the seat lines of/ }).first().click();
  await page.locator('.line-action-group .line-entry [data-line-text]').first().click();
  const choose = page.locator('[data-line-actions]').getByRole('button', { name: /^Open .*choose/ }).first();
  await expect(choose).toBeVisible();
  await page.evaluate(() => navigator.clipboard.writeText('keep during choice'));
  await choose.click();
  await expect(page.getByRole('link', { name: 'ads.txt', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'app-ads.txt', exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('keep during choice');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

// Percentage growth from zero is undefined, not zero percent.
test('KPI comparisons from zero show the amount without an invented percentage', async ({ page }) => {
  await installFakeApi(page, {});
  await page.route('**/summary?crawl_id=*', route => {
    const previous = structuredClone(mockPreviousSummary);
    previous.hero_diff.line_totals.added = 0;
    previous.hero_diff.line_totals.removed = 0;
    return route.fulfill({ json: previous });
  });
  await page.goto(`/crawl-report/${TOKEN}`);
  for (const label of ['Lines added', 'Lines removed']) {
    const delta = page.getByRole('button', { name: new RegExp(label) }).locator('.report-delta');
    await expect(delta).toContainText('vs 0 last week');
    await expect(delta).not.toContainText('%');
  }
});

for (const width of [1440, 390]) {
  test(`${width}px: actions appear only in the clicked line and switching rows stays stable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await installFakeApi(page, {});
    await page.goto(`/crawl-report/${TOKEN}`);
    const toggle = page.getByRole('button', { name: /^Show the seat lines of/ }).first();
    const box = await toggle.boundingBox();
    await toggle.click({ position: { x: (box?.width ?? 100) - 30, y: 24 } });
    const group = page.locator('.line-action-group').first();
    // Measure line-selection stability after the parent opening has settled.
    await expect(group.locator('xpath=ancestor::div[contains(@class,"report-expansion")][1]')).toHaveAttribute('data-expanded', 'true');
    await expect.poll(() => group.evaluate(el => el.closest('.report-expansion')?.getAnimations({subtree:true}).filter(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity).length ?? 0)).toBe(0);
    const rows = group.locator('.line-entry');
    await expect(rows.nth(1)).toBeVisible();
    await expect(group.getByRole('toolbar')).toHaveCount(1);
    await expect(page.locator('[data-line-actions]')).toHaveCount(1);
    await rows.first().locator('[data-line-text]').click();
    await expect(rows.first().getByRole('toolbar')).toHaveCount(1);
    const last = rows.last();
    const text = last.locator('[data-line-text]');
    await text.scrollIntoViewIfNeeded();
    // Playwright may scroll again to make the text actionable (font/layout
    // differs on Linux). Only movement caused by selection is a UI jump.
    await last.evaluate(el => el.addEventListener('click', () => el.setAttribute('data-click-y', String(el.getBoundingClientRect().top)), { capture: true, once: true }));
    await text.click();
    const clickedY = Number(await last.getAttribute('data-click-y'));
    expect(Math.abs(await last.evaluate(el => el.getBoundingClientRect().top) - clickedY)).toBeLessThanOrEqual(2);
    await expect(rows.first().getByRole('toolbar')).toHaveCount(0);
    await expect(last.getByRole('toolbar')).toHaveCount(1);
    await expect(last).toHaveClass(/line-entry-selected/);
    await expect(rows.first()).not.toHaveClass(/line-entry-selected/);
    const toolbar = group.getByRole('toolbar');
    const copy = toolbar.getByRole('button', { name: /^Copy / });
    // The new toolbar may be below the viewport on Linux. Measure from
    // pointer-down, after Playwright's own scroll-to-click, so the check
    // catches focus/copy jumps rather than the test bringing it into view.
    await copy.evaluate(el => el.addEventListener('pointerdown', () => {
      el.setAttribute('data-copy-scroll', String(el.closest('[data-report-main]')?.scrollTop));
    }, { capture: true, once: true }));
    await copy.click();
    const recordedScroll = await copy.getAttribute('data-copy-scroll');
    expect(recordedScroll).not.toBeNull();
    const before = Number(recordedScroll);
    expect(Number.isFinite(before)).toBe(true);
    await expect(toolbar.getByText('Copied', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe((await text.innerText()).trim());
    const after = await page.locator('[data-report-main]').evaluate(el => el.scrollTop);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  });
}
