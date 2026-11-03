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
  await expect(added.locator('[data-line-dates]')).toContainText(', found in ads.txt + app-ads.txt');
  // A line still in the file is found in it; only a removed one was removed from it.
  await expect(added.locator('[data-line-dates]')).not.toContainText('removed from');
  await expect(added.locator('[data-line-source] a')).toHaveCount(2);
  await expect(added.locator('[data-line-source] a').first()).toHaveAttribute('href', /\/ads\.txt#/);
  await expect(added.locator('[data-line-source] a').last()).toHaveAttribute('href', /\/app-ads\.txt#/);
  const removed = page.locator('[data-line-tone="removed"] .line-entry').first();
  // A removed line names the file it was removed from (David, 2026-11-02).
  await expect(removed.locator('[data-line-source]')).toHaveText(', removed from ads.txt');
  await expect(removed.locator('[data-line-source] a')).toHaveAttribute('href', /^https:\/\/[^#]+\/ads\.txt$/);
});

test('a line removed from both files counts 2, in the Change column and its window alike, listed once', async ({ page }) => {
  // SmartLine TV, report 2a804514 (David, 2026-11-02): one seat gone from
  // ads.txt and app-ads.txt is 2 removed lines, one per file; the window
  // lists it once, naming both files it was removed from, and says the same 2.
  await page.addInitScript(doneTour);
  await installFakeApi(page, {});
  await page.route('**/matched-developers?*', async route => {
    const data = structuredClone(mockMatchedDevelopers(1));
    const row = data.rows[0];
    const line = { ...row.removed_lines![0], found_in: 'both' };
    row.added_lines = [];
    row.cert_changed_lines = [];
    row.removed_lines = [line];
    row.lines_added = 0;
    row.lines_cert_changed = 0;
    row.lines_removed = 2;
    await route.fulfill({ json: data });
  });
  await page.goto(BASE);
  const card = page.locator('.report-row').first();
  await expect(card.getByText('-2', { exact: true })).toBeVisible();
  await card.locator('.report-expand-control').click();
  const window = card.locator('section').filter({ has: page.locator('[data-line-tone="removed"]') });
  await expect(window.locator('[data-window-count]')).toHaveText('2');
  await expect(window.locator('.line-entry')).toHaveCount(1);
  await expect(window.locator('[data-line-source]')).toHaveText(', removed from ads.txt + app-ads.txt');
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

// ── EVERY LINE, ONE CLICK AWAY (David, 2026-11-02) ─────────────────────────
// A window opens on its first 5 lines; "Show all" opens every line inside
// the window, which scrolls on its own. Never "Plus N more".

const removedLine = (i: number, found_in = 'ads.txt') => ({
  ssp_domain: 'ssp.madeupmedia.com', publisher_id: `p${i}`, relationship: 'DIRECT', found_in,
  last_seen_at: '2026-10-20T17:32:00Z', not_found_at: '2026-11-01T19:12:00Z', date_source: 'fetch' as const,
});

async function openRemoved(page: import('@playwright/test').Page, lines: ReturnType<typeof removedLine>[], removed: number, routes?: () => Promise<unknown>) {
  await page.addInitScript(doneTour);
  await installFakeApi(page, {});
  if (routes) await routes();
  let developerId = 0;
  await page.route('**/matched-developers?*', async route => {
    const data = structuredClone(mockMatchedDevelopers(1));
    const row = data.rows[0];
    developerId = row.developer_id;
    row.added_lines = [];
    row.cert_changed_lines = [];
    row.removed_lines = lines;
    row.lines_added = 0;
    row.lines_cert_changed = 0;
    row.lines_removed = removed;
    await route.fulfill({ json: data });
  });
  await page.goto(BASE);
  const card = page.locator('.report-row').first();
  await card.locator('.report-expand-control').click();
  const window = card.locator('section').filter({ has: page.locator('[data-line-tone="removed"]') });
  await expect(window).toBeVisible();
  return { window, developerId: () => developerId };
}

test('a window of 7 lines or fewer shows every line, with nothing to open', async ({ page }) => {
  const { window } = await openRemoved(page, Array.from({ length: 7 }, (_, i) => removedLine(i)), 7);
  await expect(window.locator('.line-entry')).toHaveCount(7);
  await expect(window.locator('[data-window-toggle]')).toHaveCount(0);
  await expect(window).not.toContainText('more.');
});

test('a longer window opens on its first 5 lines; Show all opens every one in its own scroll, and folds back', async ({ page }) => {
  const lines = Array.from({ length: 22 }, (_, i) => removedLine(i, i % 5 === 1 ? 'both' : 'ads.txt'));
  const { window } = await openRemoved(page, lines, 27);
  await expect(window.locator('[data-window-count]')).toHaveText('27');
  await expect(window.locator('.line-entry')).toHaveCount(5);
  const toggle = window.locator('[data-window-toggle]');
  await expect(toggle).toHaveText('Show all 22 lines');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(window.locator('.line-entry')).toHaveCount(22);
  await expect(toggle).toHaveText('Show the first 5');
  expect(await window.locator('[data-window-lines]').evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
  // The last line is reachable by scrolling the window.
  await window.locator('.line-entry').last().scrollIntoViewIfNeeded();
  await expect(window.locator('.line-entry').last()).toBeInViewport();
  await toggle.click();
  await expect(window.locator('.line-entry')).toHaveCount(5);
});

test('450 lines frozen whole: every one is drawn as the window scrolls, nothing more is asked for', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', r => { if (r.url().includes('/line-events')) asked.push(r.url()); });
  const { window } = await openRemoved(page, Array.from({ length: 450 }, (_, i) => removedLine(i)), 450);
  const toggle = window.locator('[data-window-toggle]');
  await expect(toggle).toHaveText('Show all 450 lines');
  await toggle.click();
  await expect(window.locator('.line-entry')).toHaveCount(200);
  await expect(window.locator('[data-window-more]')).toHaveText('Showing 200 of 450 lines, scroll for more');
  const lines = window.locator('[data-window-lines]');
  for (let i = 0; i < 5 && (await window.locator('.line-entry').count()) < 450; i++) {
    await lines.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(150);
  }
  await expect(window.locator('.line-entry')).toHaveCount(450);
  await expect(window.locator('[data-window-more]')).toHaveCount(0);
  await expect(window.locator('.line-entry').last()).toContainText('p449');
  expect(asked).toEqual([]);
});

test('a report frozen before every line was kept (exactly 200): Show all reads the rest from its line events', async ({ page }) => {
  const kept = Array.from({ length: 200 }, (_, i) => removedLine(i));
  // 300 seats removed this week: 280 from ads.txt, 20 from both files = 320.
  const events = Array.from({ length: 300 }, (_, i) => ({
    developer_id: 0, event: 'removed', ssp_domain: 'ssp.madeupmedia.com', publisher_id: `p${i}`, relationship: 'DIRECT',
    file_kind: 'ads_txt', host: null, matched_seat: true, last_seen_at: '2026-10-20T17:32:00Z', not_found_at: '2026-11-01T19:12:00Z',
  }));
  for (let i = 280; i < 300; i++) events.push({ ...events[i], file_kind: 'app_ads_txt' });
  const asked: URL[] = [];
  const { window, developerId } = await openRemoved(page, kept, 320, () => page.route('**/line-events?*', async route => {
    const url = new URL(route.request().url());
    asked.push(url);
    const p = Number(url.searchParams.get('page') ?? 1);
    const size = Number(url.searchParams.get('page_size') ?? 50);
    await route.fulfill({ json: { page: p, page_size: size, total: events.length, rows: events.slice((p - 1) * size, p * size) } });
  }));
  const toggle = window.locator('[data-window-toggle]');
  await expect(toggle).toHaveText('Show all lines');
  await toggle.click();
  await expect(toggle).toHaveText('Show the first 5');
  await expect(window.locator('[data-window-more]')).toHaveText('Showing 200 of 300 lines, scroll for more');
  await window.locator('[data-window-lines]').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(window.locator('.line-entry')).toHaveCount(300);
  await expect(window.locator('.line-entry').last()).toContainText('removed from ads.txt + app-ads.txt');
  expect(asked.length).toBeGreaterThan(0);
  expect(asked.every(u => u.searchParams.get('event') === 'removed' && u.searchParams.get('developer_id') === String(developerId()))).toBe(true);
});

const oldEvents = () => {
  const events: Record<string, unknown>[] = Array.from({ length: 300 }, (_, i) => ({
    developer_id: 0, event: 'removed', ssp_domain: 'ssp.madeupmedia.com', publisher_id: `p${i}`, relationship: 'DIRECT',
    file_kind: 'ads_txt', host: null, matched_seat: true, last_seen_at: '2026-10-20T17:32:00Z', not_found_at: '2026-11-01T19:12:00Z',
  }));
  for (let i = 280; i < 300; i++) events.push({ ...events[i], file_kind: 'app_ads_txt' });
  return events;
};

const serveEvents = (page: import('@playwright/test').Page, events: Record<string, unknown>[], failFirst = false) => {
  let calls = 0;
  return () => page.route('**/line-events?*', async route => {
    calls++;
    if (failFirst && calls === 1) return route.fulfill({ status: 500, body: 'boom' });
    const url = new URL(route.request().url());
    const p = Number(url.searchParams.get('page') ?? 1);
    const size = Number(url.searchParams.get('page_size') ?? 50);
    await route.fulfill({ json: { page: p, page_size: size, total: events.length, rows: events.slice((p - 1) * size, p * size) } });
  });
};

test("an old report whose partners' copies came after the 200 cut is still read whole", async ({ page }) => {
  const partners = Array.from({ length: 3 }, (_, i) => ({ ...removedLine(900 + i), match_type: 'ipd', ipd_partner: `partner${i}.madeupmedia.com` }));
  const kept = [...Array.from({ length: 200 }, (_, i) => removedLine(i)), ...partners] as ReturnType<typeof removedLine>[];
  const events = oldEvents();
  for (const l of partners) events.push({ ...events[0], publisher_id: l.publisher_id, match_type: 'ipd', ipd_partner: l.ipd_partner });
  const { window } = await openRemoved(page, kept, 323, serveEvents(page, events));
  const toggle = window.locator('[data-window-toggle]');
  await expect(toggle).toHaveText('Show all lines');
  await toggle.click();
  await expect(window.locator('[data-window-more]')).toHaveText('Showing 200 of 303 lines, scroll for more');
  await window.locator('[data-window-lines]').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(window.locator('.line-entry')).toHaveCount(303);
});

test('a failed read of the rest says so, and opening the list again tries again', async ({ page }) => {
  const kept = Array.from({ length: 200 }, (_, i) => removedLine(i));
  const { window } = await openRemoved(page, kept, 320, serveEvents(page, oldEvents(), true));
  const toggle = window.locator('[data-window-toggle]');
  await toggle.click();
  await expect(window.locator('[data-window-load-failed]')).toContainText('Could not load the lines past the first 200');
  await expect(window.locator('.line-entry')).toHaveCount(200);
  await toggle.click();
  await expect(toggle).toHaveText('Show all lines');
  await toggle.click();
  await expect(window.locator('[data-window-load-failed]')).toHaveCount(0);
  await window.locator('[data-window-lines]').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(window.locator('.line-entry')).toHaveCount(300);
});
