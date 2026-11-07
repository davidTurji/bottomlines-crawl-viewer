import { expect, test, type Page } from '@playwright/test';
import { mockAskStatus } from '../src/lib/mockData';
import { installFakeApi, TOKEN } from './fakeApi';

async function openReport(page: Page) {
  await installFakeApi(page);
  // Settle the separate delayed walkthrough before measuring modal focus.
  const declineTour = page.getByRole('button', { name: 'No thanks', exact: true });
  await page.removeLocatorHandler(declineTour);
  await page.route(`**/api/v1/viewer/${TOKEN}/ask/status`, route => route.fulfill({ json: mockAskStatus() }));
  await page.goto(`/crawl-report/${TOKEN}`);
  await expect(page.getByRole('heading', { name: 'Your weekly report' })).toBeVisible();
  await declineTour.click({ timeout: 15_000 });
}

test('desktop overlay never moves the report or replays its entrance after resizing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openReport(page);
  const main = page.locator('[data-report-main]');
  const before = await main.boundingBox();
  const launcher = page.getByRole('button', { name: 'Ask AI', exact: true });
  await expect(launcher).toHaveCSS('animation-name', 'report-open-reveal');
  await launcher.click();
  const panel = page.getByRole('complementary', { name: 'Ask AI', exact: true });
  await expect(panel.getByRole('textbox', { name: 'Message Ask AI' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Bottomlines.ai', exact: true })).toBeVisible();
  await expect.poll(() => panel.evaluate(el => el.getAnimations().every(a => a.playState === 'finished'))).toBe(true);
  expect(await main.boundingBox()).toEqual(before);
  const start = await panel.evaluate(el => el.getAnimations()[0]?.startTime);
  const edge = await page.getByRole('separator', { name: 'Resize Ask AI' }).boundingBox();
  await page.mouse.move(edge!.x + 2, edge!.y + 100);
  await page.mouse.down();
  await page.mouse.move(edge!.x - 80, edge!.y + 100, { steps: 8 });
  await page.mouse.up();
  expect(await panel.evaluate(el => el.getAnimations()[0]?.startTime)).toBe(start);
  expect(await main.boundingBox()).toEqual(before);
  // Closing during a drag must not leave a stale resize active on reopen.
  const resizedEdge = await page.getByRole('separator', { name: 'Resize Ask AI' }).boundingBox();
  await page.mouse.move(resizedEdge!.x + 2, resizedEdge!.y + 100);
  await page.mouse.down();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
  await expect.poll(() => panel.evaluate(el => el.getAnimations().every(a => a.playState === 'finished'))).toBe(true);
  const reopened = await panel.boundingBox();
  const reopenedEdge = await page.getByRole('separator', { name: 'Resize Ask AI' }).boundingBox();
  await page.mouse.move(reopenedEdge!.x + 6, reopenedEdge!.y + 100);
  expect((await panel.boundingBox())!.width).toBe(reopened!.width);
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(launcher).toBeFocused();
  await expect(launcher).toHaveCSS('animation-name', 'none');
});

for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
  test.describe(`touch ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });
    test('fullscreen chat isolates the background and restores it on close', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openReport(page);
      await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
      const panel = page.getByRole('dialog', { name: 'Ask AI', exact: true });
      await expect(panel.getByRole('textbox', { name: 'Message Ask AI' })).toBeVisible();
      await expect(panel).toHaveCSS('animation-name', 'none');
      expect(await panel.boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
      await expect(page.locator('#root')).toHaveAttribute('inert', '');
      await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
      const composer = panel.getByRole('textbox', { name: 'Message Ask AI' });
      await composer.fill('Check my report.\nInclude only verified information.\nKeep the answer brief.');
      const input = await composer.boundingBox();
      expect(input!.y).toBeGreaterThanOrEqual(0);
      expect(input!.y + input!.height).toBeLessThanOrEqual(viewport.height);
      await panel.getByRole('link', { name: 'AI usage policy', exact: true }).last().press('Tab');
      await expect(panel.locator('summary')).toBeFocused();
      await panel.getByRole('button', { name: 'Close', exact: true }).press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(page.locator('#root')).not.toHaveAttribute('inert');
      await expect(page.getByRole('button', { name: 'Ask AI', exact: true })).toBeFocused();
      await expect(page.getByRole('heading', { name: 'Your weekly report' })).toBeVisible();
    });
  });
}

test('a failed chat chunk leaves the report usable', async ({ page }) => {
  await page.route('**/assets/AskAIPanel-*.js', route => route.abort());
  await openReport(page);
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
  await expect(page.getByText('Ask AI could not open. Refresh the page to try again.')).toBeVisible();
  await page.getByRole('button', { name: 'Close Ask AI', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your weekly report' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask AI', exact: true })).toBeFocused();
});

test('copies completed answers and refusals with aligned quota labels', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const replies = [
    { answer: 'Your lines carry **42 publishers**.', answerable: true, local: true, counted: false, used_pct: 0 },
    { answer: 'That information is outside this report.', answerable: false, local: false, counted: true, used_pct: 3 },
  ];
  await openReport(page);
  let index = 0;
  await page.route(`**/api/v1/viewer/${TOKEN}/ask`, (route) => route.fulfill({
    json: { ...replies[index++], allowance_left_pct: 97, budget_exhausted: false },
  }));
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'Message Ask AI' });
  const copy = page.getByRole('button', { name: 'Copy answer', exact: true });
  for (const [i, question] of ['How many publishers carry my lines?', 'What is outside my report?'].entries()) {
    await composer.fill(question);
    await composer.press('Enter');
    await expect(copy).toHaveCount(i + 1);
    await copy.nth(i).focus();
    await expect(copy.nth(i).locator('..')).toHaveCSS('opacity', '1');
    await copy.nth(i).press('Enter');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(replies[i].answer);
  }

  const free = await page.getByText('From the report, no quota used', { exact: true }).boundingBox();
  const counted = await page.getByText('Used 3% of quota', { exact: true }).boundingBox();
  expect(free?.x).toBeDefined();
  expect(free?.x).toBe(counted?.x);
});
