import { expect, test, type Page } from '@playwright/test';
import { CUSTOMER_SEATS } from '../src/lib/mockData';
import { lineKey, parseLinesParam } from '../src/lib/lineFilter';
import { installFakeApi, TOKEN } from './fakeApi';

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pf_report_walkthrough_v1', JSON.stringify({ status: 'completed', stepId: null, open: false })));
  await installFakeApi(page, {});
  await page.goto(`/crawl-report/${TOKEN}`);
  await page.getByRole('button', { name: 'Filter by seat line', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search seat lines', exact: true })).toBeFocused();
}

for (const width of [1440, 390, 320]) {
  test(`${width}px: searching preserves hidden selections; only Apply filters the report`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page);
    const search = page.getByRole('textbox', { name: 'Search seat lines', exact: true });
    const choices = page.getByRole('group', { name: 'Seat lines', exact: true }).getByRole('menuitemcheckbox');
    const apply = page.getByRole('menuitem', { name: 'Apply', exact: true });
    const initialUrl = page.url();
    await search.fill('MAGNITE 14991 RESELLER');
    await expect(choices).toHaveCount(1);
    await expect(choices.first()).toHaveAttribute('aria-checked', 'true');
    await expect(apply).toBeDisabled();
    expect(page.url()).toBe(initialUrl);
    // All lines retains its global meaning even while the search shows one row.
    await page.getByRole('menuitem', { name: /^All lines/ }).click();
    await choices.first().click();
    await search.fill('openx.com');
    await expect(choices).toHaveCount(1);
    await expect(choices.first()).toHaveAttribute('aria-checked', 'false');
    await choices.first().click();
    await page.getByRole('button', { name: 'Clear line search', exact: true }).click();
    await expect(search).toBeFocused();
    await expect(choices).toHaveCount(CUSTOMER_SEATS.length);
    await expect(choices.filter({ has: page.locator('[aria-hidden]') }).first()).toBeVisible();
    expect(await choices.evaluateAll(items => items.filter(el => el.getAttribute('aria-checked') === 'true').length)).toBe(2);
    await search.fill('no-match-for-this-line');
    await expect(page.getByText('No matching lines. Try a domain or seller ID.', { exact: true })).toBeVisible();
    await expect(apply).toBeEnabled();
    const bounds = await page.getByRole('menu').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await apply.click();
    const selected = parseLinesParam(new URL(page.url()).searchParams.get('lines'));
    expect(selected.sort()).toEqual([lineKey(CUSTOMER_SEATS[0]), lineKey(CUSTOMER_SEATS[2])].sort());
    await page.getByRole('button', { name: 'Filter by seat line', exact: true }).click();
    await expect(search).toHaveValue('');
    expect(await choices.evaluateAll(items => items.filter(el => el.getAttribute('aria-checked') === 'true').length)).toBe(2);
    await search.press('Escape');
    await expect(search).toHaveCount(0);
  });
}

test('search typing, arrows and Escape preserve normal keyboard selection and cancel the draft', async ({ page }) => {
  await open(page);
  const search = page.getByRole('textbox', { name: 'Search seat lines', exact: true });
  const initialUrl = page.url();
  await page.getByRole('menuitem', { name: /^All lines/ }).click();
  await search.pressSequentially('magnite 14991');
  await expect(search).toHaveValue('magnite 14991');
  await expect(search).toBeFocused();
  const choice = page.getByRole('menuitemcheckbox').first();
  await search.press('ArrowDown');
  await expect(choice).toBeFocused();
  await choice.press('Space');
  await expect(choice).toHaveAttribute('aria-checked', 'true');
  await choice.press('ArrowUp');
  await expect(search).toBeFocused();
  await search.press('Escape');
  expect(page.url()).toBe(initialUrl);
  await page.getByRole('button', { name: 'Filter by seat line', exact: true }).click();
  await expect(search).toHaveValue('');
  const choices = page.getByRole('menuitemcheckbox');
  expect(await choices.evaluateAll(items => items.every(el => el.getAttribute('aria-checked') === 'true'))).toBe(true);
});
