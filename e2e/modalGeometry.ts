import { expect, type Locator, type Page } from '@playwright/test';

export async function expectReportCentered(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect.poll(async () => {
    const viewport = page.viewportSize()!;
    const area = viewport.width >= 768
      ? await page.locator('[data-report-main]').boundingBox()
      : { x: 0, y: 0, width: viewport.width, height: viewport.height };
    const box = await dialog.boundingBox();
    if (!area || !box) return Infinity;
    return Math.max(Math.abs(box.x + box.width / 2 - area.x - area.width / 2),
      Math.abs(box.y + box.height / 2 - area.y - area.height / 2));
  }).toBeLessThan(1);
  const viewport = page.viewportSize()!;
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(15);
  expect(box.y).toBeGreaterThanOrEqual(15);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 15);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 15);
}
