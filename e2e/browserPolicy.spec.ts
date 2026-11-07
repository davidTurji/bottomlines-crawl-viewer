import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { buildXlsxBlob } from '../src/lib/xlsx';
import { storageDownloadFixture } from './storageDownloadFixture';
import { installFakeApi, TOKEN } from './fakeApi';

// These requests use only local fixtures. Never run against a live report.
test.skip(Boolean(process.env.VIEWER_SMOKE_BASE), 'Browser policy checks use local fixtures only.');
const template = readFileSync('nginx.conf.template', 'utf8');
const rawPolicy = template.match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1];
if (!rawPolicy) throw new Error('Missing enforced browser policy');
const policy = rawPolicy.replace('$viewer_frame_ancestors', "'none'");
const exportHeaders = {
  'Content-Security-Policy': rawPolicy.replace('$viewer_frame_ancestors', "'self'"),
  'X-Frame-Options': 'SAMEORIGIN', 'X-Content-Type-Options': 'nosniff',
};
const reportPath = `/crawl-report/${TOKEN}`;

async function applyPolicy(page: Page) {
  await page.route(url => url.pathname === reportPath || url.pathname.startsWith(reportPath + "/"), async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: {
      ...response.headers(),
      'Content-Security-Policy': policy,
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
    } });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pf_report_walkthrough_v1', JSON.stringify({status:'completed',stepId:null,open:false})));
  await installFakeApi(page, {});
  await applyPolicy(page);
});

test('enforced browser policy allows the report and blocks injected inline script', async ({ page }) => {
  await page.goto(reportPath);
  await expect(page.getByRole('heading', { name: 'Your weekly report' })).toBeVisible();
  const executed = await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__syntheticPolicyProbe = true';
    document.body.append(script);
    return (window as Window & { __syntheticPolicyProbe?: boolean }).__syntheticPolicyProbe;
  });
  expect(executed).toBeUndefined();
});

test('a page cannot frame the protected report', async ({ page }) => {
  await page.route('**/synthetic-frame-test', (route) => route.fulfill({
    contentType: 'text/html', body: `<iframe src="${reportPath}" title="synthetic"></iframe>`,
  }));
  const violation = page.waitForEvent('console', {
    predicate: (message) => /frame-ancestors|X-Frame-Options/.test(message.text()), timeout: 10_000,
  });
  await page.goto('/synthetic-frame-test');
  await violation;
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Your weekly report' })).toHaveCount(0);
});


const workbook = async () => Buffer.from(await buildXlsxBlob([{ name: 'Summary', rows: [['Fixture', 'Rows'], ['Synthetic', 2]] }]).arrayBuffer());

test('enforced policy permits one native workbook download without leaving the report', async ({ page }) => {
  const bytes = await workbook(); let requests = 0, cookie = '';
  await page.context().addCookies([{ name: 'synthetic_session', value: 'same-origin-cookie', url: 'http://localhost:4179', httpOnly: true, sameSite: 'Lax' }]);
  await page.route('**/export.xlsx', async route => { requests++; cookie = (await route.request().allHeaders()).cookie ?? ''; return route.fulfill({ body: bytes, headers: {
    ...exportHeaders, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="policy-fixture.xlsx"',
  } }); });
  await page.goto(reportPath);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full report', exact: true }).click();
  const download = await pending;
  expect(await readFile((await download.path())!)).toEqual(bytes);
  expect(requests).toBe(1);
  expect(cookie).toContain('synthetic_session=same-origin-cookie');
  await expect(page).toHaveURL(reportPath);
});

for (const status of [401, 429, 503]) test(`enforced policy preserves readable ${status} workbook refusal and deliberate retry`, async ({ page }) => {
  const bytes = await workbook(); let requests = 0;
  const message = `Synthetic ${status}: please retry deliberately`;
  await page.route('**/export.xlsx', route => {
    requests++;
    return requests === 1
      ? route.fulfill({ status, json: { detail: message }, headers: exportHeaders })
      : route.fulfill({ body: bytes, headers: { ...exportHeaders, 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="retry.xlsx"' } });
  });
  await page.goto(reportPath);
  await page.getByRole('button', { name: 'Download full report', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(message);
  expect(requests).toBe(1);
  await expect(page).toHaveURL(reportPath);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full report', exact: true }).click();
  expect(await readFile((await (await pending).path())!)).toEqual(bytes);
  expect(requests).toBe(2);
});

test('enforced policy follows the exact signed-storage origin once, with selected-line query intact', async ({ browser }) => {
  const bytes = await workbook();
  const fixture = await storageDownloadFixture(bytes);
  const context = await browser.newContext({ proxy: fixture.proxy, ignoreHTTPSErrors: true, baseURL: 'http://localhost:4179' });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('pf_report_walkthrough_v1', JSON.stringify({status:'completed',stepId:null,open:false})));
    await installFakeApi(page, {}); await applyPolicy(page);
    let requests = 0, selected = '';
    await page.route('**/export.xlsx?*', route => {
      requests++; selected = new URL(route.request().url()).searchParams.get('lines') ?? '';
      return route.fulfill({ status: 307, headers: { ...exportHeaders, Location: 'https://storage.googleapis.com/synthetic-bucket/report.xlsx?signature=synthetic' } });
    });
    const response = await page.goto(reportPath + '?lines=madeupssp.com%7C1%7CDIRECT');
    expect(response?.headers()['content-security-policy']).toBe(policy);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export selected lines', exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('signed-fixture.xlsx');
    expect(await readFile((await download.path())!)).toEqual(bytes);
    expect(selected).toBe('madeupssp.com|1|DIRECT'); expect(requests).toBe(1);
    expect(fixture.requests).toEqual(['/synthetic-bucket/report.xlsx?signature=synthetic']);
    await expect(page).toHaveURL(/lines=/);
  } finally { await context.close(); await fixture.close(); }
});


test('enforced policy rejects an unrelated child-frame origin', async ({ page }) => {
  await page.goto(reportPath);
  const violation = await page.evaluate(() => new Promise<{ directive: string; blocked: string }>(resolve => {
    document.addEventListener('securitypolicyviolation', event => resolve({ directive: event.effectiveDirective, blocked: event.blockedURI }), { once: true });
    const frame = document.createElement('iframe'); frame.src = 'https://unapproved.invalid/synthetic'; document.body.appendChild(frame);
  }));
  expect(violation.directive).toBe('frame-src'); expect(violation.blocked).toContain('unapproved.invalid');
});

test('enforced policy preserves reusable sign-in links and deep report navigation', async ({ page }) => {
  const calls = await installFakeApi(page, { signedOut: true, sellers: 'page', discovery: true });
  const signin = Buffer.from('synthetic-reader:synthetic-password').toString('base64url');
  const response = await page.goto(reportPath + '#signin=' + signin);
  expect(response?.headers()['content-security-policy']).toBe(policy);
  await expect(page.locator('input[autocomplete="username"]')).toHaveValue('synthetic-reader');
  await expect(page.locator('input[autocomplete="current-password"]')).toHaveValue('synthetic-password');
  expect(new URL(page.url()).hash).toBe('');
  expect(calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your weekly report' })).toBeVisible();
  expect(calls.filter(call => call.path.endsWith('/auth'))).toHaveLength(1);
  await page.goto(reportPath + '/discovery');
  await expect(page.getByRole('heading', { name: 'Discovery', exact: true })).toBeVisible();
});

test('enforced policy preserves historical report full-workbook fallback', async ({ page }) => {
  await installFakeApi(page, { exportInfo: 'none', inactive: 'legacy', matchType: false });
  const bytes = await workbook(); let query = 'not requested';
  await page.route('**/export.xlsx*', route => {
    query = new URL(route.request().url()).search;
    return route.fulfill({ body: bytes, headers: { ...exportHeaders, 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="old-frozen.xlsx"' } });
  });
  await page.goto(reportPath + '?lines=madeupssp.com%7C1%7CDIRECT');
  await expect(page.getByRole('button', { name: 'Export selected lines', exact: true })).toHaveCount(0);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full report', exact: true }).click();
  expect(await readFile((await (await pending).path())!)).toEqual(bytes);
  expect(query).toBe('');
});
