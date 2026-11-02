import { expect, test } from '@playwright/test';
import { installFakeApi, TOKEN } from './fakeApi';
import { chooseFilter } from './filterChoice';

for (const width of [1440, 1280, 960, 390, 320]) {
  test(`${width}px: shared toolbar contains every control and keeps paging functional`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem('pf_report_walkthrough_v1', JSON.stringify({status:'completed',stepId:null,open:false})));
    const calls = await installFakeApi(page, {discovery:true,matchType:true,foundIn:true,appPlatform:true,sellers:'page',inactive:'ok'});
    for (const view of ['publishers','apps','discovery']) {
      if (view === 'publishers') await page.goto(`/crawl-report/${TOKEN}`);
      if (view === 'apps') await page.getByRole('button',{name:/Matched apps/}).first().click();
      if (view === 'discovery') await page.goto(`/crawl-report/${TOKEN}/discovery`);
      const search = page.getByRole('textbox',{name: view === 'discovery' ? 'Search seller IDs or publishers' : `Search matched ${view}`});
      const toolbar = page.locator('[data-list-toolbar]').filter({has:search});
      await expect(toolbar.getByRole('navigation',{name:'Pages'})).toBeVisible();
      await expect(toolbar.locator('.list-toolbar-query').getByRole('textbox')).toBeVisible();
      await search.scrollIntoViewIfNeeded();
      const filters = toolbar.getByRole('button',{name:'List filters',exact:true});
      if (await filters.isVisible()) {
        await filters.click();
        await expect(filters).toHaveAttribute('aria-expanded','true');
        await search.click();
        await expect(filters).toHaveAttribute('aria-expanded','false');
        await filters.click();
        await filters.press('Escape');
        await expect(filters).toHaveAttribute('aria-expanded','false');
      }
      const bounds = await toolbar.evaluate(root => {
        const outer=root.getBoundingClientRect();
        const controls=[...root.querySelectorAll('input,button,p')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect());
        return { inside:controls.every(e=>e.left>=outer.left-1&&e.right<=outer.right+1), centers:controls.map(e=>e.top+e.height/2) };
      });
      expect(bounds.inside,view).toBe(true);
      if (width >= 640) expect(Math.max(...bounds.centers)-Math.min(...bounds.centers),view).toBeLessThan(3);
      else expect(await search.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(width - 155);
      await toolbar.getByRole('button',{name:'Next page',exact:true}).click();
      await expect(toolbar.getByRole('button',{name: width >= 1280 ? 'Page 2' : /^Page 2 of/ ,exact:width>=1280})).toBeVisible();
      if (width < 1280) {
        await toolbar.getByRole('button',{name:/^Page 2 of/}).click();
        const jump = toolbar.getByRole('textbox',{name:/Go to page/});
        await jump.fill('1');
        await jump.press('Enter');
        await expect(toolbar.getByRole('button',{name:/^Page 1 of/})).toBeVisible();
      }
      if(view!=='discovery') {
        await chooseFilter(page,'match-type','IPD');
        await expect.poll(()=>calls.some(c=>c.query.includes('match_type=ipd'))).toBe(true);
        await chooseFilter(page,'match-type','All');
        if (await page.getByLabel('List filters',{exact:true}).isVisible()) await page.getByLabel('List filters',{exact:true}).click();
      }
    }
  });
}
