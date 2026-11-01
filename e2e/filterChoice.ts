import { expect, type Page } from "@playwright/test";
export async function chooseFilter(page: Page, id: string, name: string) {
  const trigger = page.getByTestId(id);
  await expect(trigger).toBeAttached();
  if (!(await trigger.isVisible())) await page.getByLabel('List filters', {exact:true}).click();
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  const exact = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`);
  // A tick box (Found in, 2026-11-01) is a menuitemcheckbox, and its menu
  // stays open for another tick: closed here, as a reader would.
  const tick = page.getByRole("menuitemcheckbox", { name: exact });
  if (await tick.count()) {
    await tick.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    return;
  }
  await page.getByRole("menuitem", { name: exact }).click();
}
