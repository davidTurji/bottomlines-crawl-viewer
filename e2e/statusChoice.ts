import { expect, type Page } from '@playwright/test';

export async function revealStatuses(page: Page) {
  // The native phone selector already contains every supported status.
  if (await page.getByRole('combobox', {name:'Matched status'}).isVisible()) return;
  const more = page.getByTestId('status-toggle');
  await expect(more).toBeVisible();
  if (await more.getAttribute('aria-expanded') !== 'true') await more.click();
}
export async function selectStatus(page: Page, label: string) {
  const native = page.getByRole('combobox', { name: 'Matched status' });
  if (await native.isVisible()) {
    await native.selectOption({ label });
  } else {
    if (!['All matched', 'Added', 'Removed', 'Changed'].includes(label)) await revealStatuses(page);
    await page.getByRole('tab', { name: label, exact: true }).click();
  }
}
