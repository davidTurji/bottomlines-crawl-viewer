import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installFakeApi, TOKEN } from './fakeApi';
import { mockDiscoveredLinePlacements } from '../src/lib/mockData';

for (const incomplete of [false, true]) {
  test(`Discovery roster export respects search across server pages; incomplete=${incomplete}`, async ({ page }) => {
    await installFakeApi(page, { discovery: true });
    const exportPages: number[] = [];
    await page.route('**/discovered-lines/placements?*', async route => {
      const query = new URL(route.request().url()).searchParams;
      const number = Number(query.get('page') || 1);
      const size = Number(query.get('page_size') || 25);
      const base = mockDiscoveredLinePlacements({
        ssp_domain: query.get('ssp_domain')!, publisher_id: query.get('publisher_id')!,
        relationship: query.get('relationship')!, cert_id: query.get('cert_id') || '',
      }, { page: 1, page_size: 25 });
      if (!query.get('q')) {
        if (size === 1 && incomplete) return route.fulfill({ json: { ...base, total: base.total - 1, rows: base.rows.slice(0, 1) } });
        return route.fallback();
      }
      expect(query.get('q')).toBe('needle');
      if (size === 500) exportPages.push(number);
      return route.fulfill({ json: { ...base, page: number, page_size: 1, total: 2, rows: [{ ...base.rows[0], developer_domain: `needle-${number}.example`, developer_name: `Needle ${number}` }] } });
    });
    await page.goto(`/crawl-report/${TOKEN}/discovery`);
    const card = page.locator('[data-discovered-line]').first();
    await card.locator(':scope > button').click();
    await card.getByRole('textbox', { name: 'Search publishers carrying this line' }).fill('needle');
    await expect(card.locator('.discovery-placement')).toContainText('Needle 1');
    const button = card.getByRole('button', { name: 'Export matching publisher source files as CSV' });
    if (incomplete) {
      const downloads: string[] = []; page.on('download', d => downloads.push(d.suggestedFilename()));
      await button.click();
      await expect(card.getByRole('alert')).toContainText('incomplete source list');
      expect(exportPages).toEqual([]); expect(downloads).toEqual([]);
    } else {
      const download = page.waitForEvent('download'); await button.click();
      const csv = await readFile((await (await download).path())!, 'utf8');
      expect(exportPages).toEqual([1, 2]);
      expect(csv.trim().split('\n')).toHaveLength(3);
      expect(csv).toContain('needle-1.example'); expect(csv).toContain('needle-2.example');
    }
  });
}


test('a seller-ID search opens its sources without searching publisher names for that ID', async ({ page }) => {
  await installFakeApi(page, { discovery: true });
  await page.goto(`/crawl-report/${TOKEN}/discovery`);
  const first = page.locator('[data-discovered-line]').first();
  const label = await first.locator(':scope > button').innerText();
  const sellerId = label.split(',')[1].trim();
  await page.getByRole('textbox', { name: 'Search seller IDs or publishers' }).fill(sellerId);
  await expect(page.getByText('Loading discovered lines', { exact: true })).toHaveCount(0);
  const card = page.locator('[data-discovered-line]').first();
  await card.locator(':scope > button').click();
  await expect(card.getByRole('textbox', { name: 'Search publishers carrying this line' })).toHaveValue('');
  await expect(card.locator('.discovery-placement').first()).toBeVisible();
});
