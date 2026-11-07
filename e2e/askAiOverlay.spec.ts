import { expect, test, type Page, type Route } from '@playwright/test';
import { mockAskStatus } from '../src/lib/mockData';
import { installFakeApi, TOKEN } from './fakeApi';

async function openReport(
  page: Page,
  askStatus: (route: Route) => Promise<void> = route => route.fulfill({ json: mockAskStatus() }),
) {
  await installFakeApi(page);
  // Settle the separate delayed walkthrough before measuring modal focus.
  const declineTour = page.getByRole('button', { name: 'No thanks', exact: true });
  await page.removeLocatorHandler(declineTour);
  await page.route(`**/api/v1/viewer/${TOKEN}/ask/status`, askStatus);
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
      const quota = panel.getByRole('button', { name: /AI quota:/ });
      const explanation = panel.getByText('AI quota: 100% remaining', { exact: true });
      await quota.click();
      const popup = await explanation.locator('..').boundingBox();
      expect(popup?.width).toBeGreaterThanOrEqual(200);
      expect(popup!.x).toBeGreaterThanOrEqual(0);
      expect(popup!.x + popup!.width).toBeLessThanOrEqual(viewport.width);
      await panel.getByRole('heading', { name: 'Bottomlines.ai' }).click();
      await expect(explanation).toHaveCount(0);
      await quota.click();
      await quota.press('Escape');
      await expect(explanation).toHaveCount(0);
      await expect(panel).toBeVisible();
      const composer = panel.getByRole('textbox', { name: 'Message Ask AI' });
      await composer.fill('Check my report.\nInclude only verified information.\nKeep the answer brief.');
      const input = await composer.boundingBox();
      expect(input!.y).toBeGreaterThanOrEqual(0);
      expect(input!.y + input!.height).toBeLessThanOrEqual(viewport.height);
      await panel.getByRole('link', { name: 'AI usage policy', exact: true }).last().press('Tab');
      await expect(panel.getByRole('button', { name: /AI quota:/ })).toBeFocused();
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

test('a long reply scrolls the transcript without moving the drawer controls', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openReport(page);
  await page.route(`**/api/v1/viewer/${TOKEN}/ask`, (route) => route.fulfill({
    json: {
      answer: 'These results describe which publishers carry your lines. '.repeat(25),
      answerable: true,
      local: true,
      counted: false,
      used_pct: 0,
      allowance_left_pct: 100,
      budget_exhausted: false,
    },
  }));
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Ask AI', exact: true });
  const header = panel.getByRole('heading', { name: 'Bottomlines.ai', exact: true });
  const composer = panel.getByRole('textbox', { name: 'Message Ask AI' });
  const initialHeaderTop = (await header.boundingBox())!.y;
  const initialComposer = await composer.boundingBox();
  const copy = panel.getByRole('button', { name: 'Copy answer', exact: true });
  const transcript = panel.locator('.ask-font > .overflow-y-auto');
  const bottomGap = () => transcript.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop);
  for (const [index, question] of ['Summarize this weekly report.', 'Describe the weekly publisher results.'].entries()) {
    await composer.fill(question);
    await composer.press('Enter');
    await expect(copy).toHaveCount(index + 1);
    await expect.poll(bottomGap).toBeLessThan(2);
  }
  await expect.poll(() => transcript.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await copy.last().focus();
  await composer.focus();
  expect(await panel.evaluate(el => el.scrollHeight - el.clientHeight)).toBe(0);
  expect((await header.boundingBox())!.y).toBe(initialHeaderTop);
  expect(await composer.boundingBox()).toEqual(initialComposer);

  // A height change (such as a browser zoom or a resized window) must keep
  // the bottom controls within the drawer, while the transcript stays long.
  await page.setViewportSize({ width: 800, height: 320 });
  await expect.poll(() => panel.evaluate(el => {
    const footer = el.querySelector('form')!.parentElement!;
    return Math.abs(footer.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom);
  })).toBeLessThan(1);
  expect(await panel.evaluate(el => el.scrollTop)).toBe(0);
  await expect.poll(bottomGap).toBeLessThan(2);
});

test('only open chat polls for quota and a throttle leaves the conversation open', async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let reads = 0;
  let httpStatus = 200;
  let status: ReturnType<typeof mockAskStatus> = { ...mockAskStatus(), allowance_left_pct: 74 };
  await openReport(page, route => {
    reads++;
    return route.fulfill({ status: httpStatus, json: status });
  });
  const launcher = page.getByRole('button', { name: 'Ask AI', exact: true });
  await expect(launcher).toBeVisible();
  expect(reads).toBe(1);
  await page.clock.fastForward(120_000);
  expect(reads).toBe(1);

  httpStatus = 429;
  const throttled = page.waitForResponse(response => response.url().endsWith('/ask/status') && response.status() === 429);
  await launcher.click();
  await throttled;
  const panel = page.getByRole('complementary', { name: 'Ask AI', exact: true });
  await expect(panel.getByRole('button', { name: 'AI quota: 74% remaining' })).toBeVisible();

  httpStatus = 200;
  status = { ...status, allowance_left_pct: null };
  await page.clock.fastForward(60_000);
  const unavailable = panel.getByRole('button', { name: 'AI quota unavailable' });
  await expect(unavailable).toBeVisible();
  await unavailable.click();
  await expect(panel.getByText('The latest quota could not be loaded.', { exact: false })).toBeVisible();

  status = { ...status, enabled: false };
  await page.clock.fastForward(5_000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(panel).toHaveCount(0);
  await expect(launcher).toHaveCount(0);
});

test('an older status response cannot restore quota after the current answer', async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let pendingStatus: Route | undefined;
  let reads = 0;
  await openReport(page, async route => {
    if (++reads === 1) await route.fulfill({ json: mockAskStatus() });
    else pendingStatus = route;
  });
  await page.route(`**/api/v1/viewer/${TOKEN}/ask`, route => route.fulfill({
    json: {
      answer: 'Answer from this report.', answerable: true, local: false, counted: true,
      used_pct: 3, allowance_left_pct: 0, budget_exhausted: true,
    },
  }));
  await page.clock.fastForward(5_000);
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
  await expect.poll(() => !!pendingStatus).toBe(true);
  const composer = page.getByRole('textbox', { name: 'Message Ask AI' });
  await composer.fill('Which publisher carries the most of my lines?');
  await composer.press('Enter');
  const exhausted = page.getByRole('button', { name: 'AI quota: 0% remaining', exact: true });
  await expect(exhausted).toBeVisible();

  const stale = page.waitForResponse(response => response.url().endsWith('/ask/status'));
  await pendingStatus!.fulfill({ json: mockAskStatus() });
  await (await stale).finished();
  await exhausted.click();
  await expect(page.getByText('Model answers are off for this report.', { exact: false })).toBeVisible();
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

  const free = await page.getByText('From your report, no quota used', { exact: true }).boundingBox();
  const counted = await page.getByText('Used 3% of quota', { exact: true }).boundingBox();
  expect(free?.x).toBeDefined();
  expect(free?.x).toBe(counted?.x);
});
