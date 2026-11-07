import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installFakeApi, TOKEN } from './fakeApi';

// These requests use only local fixtures. Never run against a live report.
test.skip(Boolean(process.env.VIEWER_SMOKE_BASE), 'Browser policy checks use local fixtures only.');
const policy = readFileSync('nginx.conf.template', 'utf8').match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1];
if (!policy) throw new Error('Missing enforced browser policy');
const reportPath = `/crawl-report/${TOKEN}`;

test.beforeEach(async ({ page }) => {
  await installFakeApi(page, {});
  await page.route(`**${reportPath}`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: {
      ...response.headers(),
      'Content-Security-Policy': policy,
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
    } });
  });
});

test('enforced browser policy allows the report and blocks injected inline script', async ({ page }) => {
  await page.goto(reportPath);
  await expect(page.getByRole('heading', { name: 'Your weekly crawl' })).toBeVisible();
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
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Your weekly crawl' })).toHaveCount(0);
});
