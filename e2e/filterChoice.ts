import type { Page } from "@playwright/test";
export async function chooseFilter(page: Page, id: string, name: string) {
  const trigger = page.getByTestId(id);
  if (!(await trigger.isVisible())) await page.getByLabel('List filters', {exact:true}).click();
  await trigger.click();
  await page.getByRole("menuitem", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`) }).click();
}
