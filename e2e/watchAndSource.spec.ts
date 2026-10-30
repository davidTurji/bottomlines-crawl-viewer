import { revealStatuses } from "./statusChoice";
import { selectStatus } from "./statusChoice";
import { expect, test } from '@playwright/test';
import { mockMatchedApps, mockMatchedDevelopers, mockWatchView } from '../src/lib/mockData';
import { installFakeApi, TOKEN } from './fakeApi';

const BASE = `/crawl-report/${TOKEN}`;
const doneTour = () => localStorage.setItem('pf_report_walkthrough_v1', JSON.stringify({ status: 'completed', stepId: null, open: false }));

test('local preview watch counts, filters and page sizes agree with its existing line events', () => {
  const read = (page: number) => mockMatchedDevelopers(page, '', [], 'all');
  const all = mockWatchView(read, 1, 500, undefined);
  expect(all.change_counts?.started_watching).toBeGreaterThan(0);
  expect(all.change_counts?.stopped_watching).toBeGreaterThan(0);
  for (const kind of ['started_watching', 'stopped_watching', 'unconfirmed'] as const) {
    const filtered = mockWatchView(read, 1, 500, kind);
    expect(filtered.change).toBe(kind);
    expect(filtered.total).toBe(all.change_counts?.[kind]);
    expect(filtered.rows.length).toBe(filtered.total);
    const first = mockWatchView(read, 1, 2, kind);
    const second = mockWatchView(read, 2, 2, kind);
    expect(first.page_size).toBe(2);
    expect([...first.rows, ...second.rows].map(row => row.developer_id)).toEqual(filtered.rows.slice(0, 4).map(row => row.developer_id));
  }
});

test('supported Started and Stopped watching tabs remain visible when there are zero results', async ({ page }) => {
  await page.addInitScript(doneTour);
  await installFakeApi(page, { watchTabs: true, appChange: true });
  for (const endpoint of ['matched-developers', 'matched-apps']) {
    await page.route(`**/${endpoint}?*`, async route => {
      const body = endpoint === "matched-apps" ? mockMatchedApps(1) : mockMatchedDevelopers(1);
      const change = new URL(route.request().url()).searchParams.get('change');
      await route.fulfill({ json: { ...body, change_counts: { started_watching: 0, stopped_watching: 0, unconfirmed: 0 }, ...(change ? { change, total: 0, rows: [] } : {}) } });
    });
  }
  await page.goto(BASE);
  for (const view of ['publishers', 'apps']) {
    if (view === 'apps') await page.getByRole('button', { name: /Matched apps/ }).click();
    await revealStatuses(page);
    const started = page.getByRole('tab', { name: 'Started watching', exact: true });
    const stopped = page.getByRole('tab', { name: 'Stopped watching', exact: true });
    await expect(started).toBeVisible();
    await expect(stopped).toBeVisible();
    await stopped.click();
    await expect(stopped).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.report-expand-control')).toHaveCount(0);
    await expect(started).toBeVisible();
  }
});

test('Overview places source filenames beside dates, including both files and removed sources', async ({ page }) => {
  await page.addInitScript(doneTour);
  await installFakeApi(page, {});
  await page.route('**/matched-developers?*', async route => {
    const data = structuredClone(mockMatchedDevelopers(1));
    data.rows[0].added_lines![0].found_in = 'both';
    data.rows[0].removed_lines![0].found_in = 'ads.txt';
    await route.fulfill({ json: data });
  });
  await page.goto(BASE);
  await page.locator('.report-expand-control').first().click();
  const added = page.locator('[data-line-tone="added"] .line-entry').first();
  await expect(added.locator('[data-line-dates]')).toContainText('found in ads.txt + app-ads.txt');
  await expect(added.locator('[data-line-source] a')).toHaveCount(2);
  await expect(added.locator('[data-line-source] a').first()).toHaveAttribute('href', /\/ads\.txt#/);
  await expect(added.locator('[data-line-source] a').last()).toHaveAttribute('href', /\/app-ads\.txt#/);
  const removed = page.locator('[data-line-tone="removed"] .line-entry').first();
  await expect(removed.locator('[data-line-source]')).toContainText('found in ads.txt');
  await expect(removed.locator('[data-line-source] a')).toHaveAttribute('href', /^https:\/\/[^#]+\/ads\.txt$/);
});

for (const width of [1440, 390]) {
  test(`${width}px: watch statuses stay available when Apps mounts directly on Inactive`, async ({ page }) => {
    await page.setViewportSize({width,height:900});await page.addInitScript(doneTour);
    const calls=await installFakeApi(page,{watchTabs:true,appChange:true,inactive:'ok'});
    await page.goto(BASE);
    if(width<640)await page.getByRole('combobox',{name:'Matched status'}).selectOption('inactive');
    else await selectStatus(page, "Inactive");
    await page.getByRole('button',{name:/Matched apps/}).first().click();
    if(width<640){
      const status=page.getByRole('combobox',{name:'Matched status'});
      await expect(status.locator('option[value="started"]')).toHaveCount(1);
      await expect(status.locator('option[value="stopped"]')).toHaveCount(1);
      await status.selectOption('started');
    } else {
      await expect(page.getByRole('tab',{name:'Started watching',exact:true})).toBeVisible();
      await expect(page.getByRole('tab',{name:'Stopped watching',exact:true})).toBeVisible();
      await selectStatus(page, "Started watching");
    }
    await expect.poll(()=>calls.some(call=>call.path.endsWith('/matched-apps')&&call.query.includes('change=started_watching'))).toBe(true);
  });
}
