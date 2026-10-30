/**
 * SEAT LINES, ONE LOOK (David, 2026-10-27).
 *
 *   - Every list of matched seat lines numbers its rows like a code
 *     editor: 1, 2, 3 ... in a quiet gutter, restarting per list and
 *     running on across the pages of one list.
 *   - The gutter sits on its line's baseline, in one fixed column.
 *   - Seller roles live on the Sellers.json page only, as a segment of
 *     plain rows, and only on a report whose build read the sellers.json
 *     files first (crawler #364); otherwise one quiet line.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { installFakeApi, TOKEN, type Scenario } from "./fakeApi";

const BASE = `/crawl-report/${TOKEN}`;
/** Word for word (SellerRoles.ROLES_LATER; that module reads the API at
 *  import, so the test does not import it). */
const ROLES_LATER = "Seller roles will appear here from the next report.";

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page, scenario: Scenario, path = "", routes?: () => Promise<unknown>) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        "pf_report_walkthrough_v1",
        JSON.stringify({ status: "completed", stepId: null, open: false }),
      );
    } catch {
      /* the tour may show; the page still renders */
    }
  });
  await installFakeApi(page, scenario);
  // A test's own routes go after the fake API's, so they answer first.
  if (routes) await routes();
  await page.goto(`${BASE}${path}`);
}

/** The gutter numbers of one list, as numbers. */
async function numbers(list: Locator): Promise<number[]> {
  return (await list.locator("[data-line-no]").allTextContents()).map(Number);
}
const oneToN = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);

/** The open row's card on the Overview. */
const openCard = (page: Page) =>
  page.locator("button[aria-expanded='true']").first().locator("xpath=ancestor::div[contains(@class,'report-row')][1]");

/** Opens Overview rows in turn until one shows the flat "Matched seat
 *  lines" list (a row that moved shows change windows instead). */
async function openSteadyRow(page: Page): Promise<Locator> {
  const rows = page.locator('button[aria-label^="Show the seat lines of"], button[aria-label^="Hide the seat lines of"]');
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
    const list = openCard(page).locator("[data-seat-lines]");
    await expect(openCard(page).locator("[data-line-no]").first()).toBeVisible();
    if (await list.count()) return list.first();
  }
  throw new Error("no steady row on the first page");
}


test.describe("line numbers", () => {
  test("an expanded publisher row and an app row number their lines 1, 2, 3, per list", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, {});
    await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
    await page.locator('button[aria-label^="Show the seat lines of"]').first().click();
    await expect(openCard(page).locator("[data-line-no]").first()).toBeVisible();
    const lists = openCard(page).locator("[data-seat-lines], section ul");
    // Every list on the open row restarts at 1 and counts its own rows.
    for (const list of await lists.all()) {
      const rows = await list.locator(":scope > li").count();
      if (!rows) continue;
      expect(await numbers(list)).toEqual(oneToN(rows));
    }
    // Quiet: mono, muted, right-aligned, and never read out.
    const no = page.locator("[data-line-no]").first();
    await expect(no).toHaveAttribute("aria-hidden", "true");
    await expect(no).toHaveClass(/font-mono/);
    await expect(no).toHaveClass(/text-right/);

    await page.getByRole("button", { name: /Matched apps/ }).click();
    await expect(page.getByRole("heading", { name: "Matched apps" })).toBeVisible();
    await page.locator('button[aria-label^="Show the seat lines of"]').first().click();
    const appList = openCard(page).locator("[data-seat-lines], section ul").first();
    await expect(appList.locator("[data-line-no]").first()).toBeVisible();
    const rows = await appList.locator(":scope > li").count();
    expect(await numbers(appList)).toEqual(oneToN(rows));
    expect(errors).toEqual([]);
  });

  test("the gutter sits on the line's baseline, in one fixed column, on every list", async ({ page }) => {
    // David, 2026-10-27: the numbers sat off their line, worst on a row
    // with a "first seen" line under it. Every row, every kind of list: the
    // number's baseline within 1px of the line text's, and every line text
    // starting at one x.
    const errors = watchErrors(page);
    await open(page, {});
    await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
    const check = async (where: string) => {
      const rows = page.locator("li:has([data-line-no])");
      await expect(rows.first(), where).toBeVisible();
      const out = await rows.evaluateAll((lis) => {
        const baseline = (el: Element) => {
          const m = document.createElement("span");
          m.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
          el.insertBefore(m, el.firstChild);
          const y = m.getBoundingClientRect().top;
          m.remove();
          return y;
        };
        return lis.map((li) => {
          const no = li.querySelector("[data-line-no]")!;
          const text = li.querySelector("[data-line-text]")!;
          return { dy: Math.abs(baseline(no) - baseline(text)), x: Math.round(text.getBoundingClientRect().left), w: Math.round(no.getBoundingClientRect().width) };
        });
      });
      for (const r of out) expect(r.dy, `${where}: baseline gap`).toBeLessThanOrEqual(1);
      expect(new Set(out.map((r) => r.x)).size, `${where}: one start x`).toBe(1);
      expect(new Set(out.map((r) => r.w)).size, `${where}: one gutter width`).toBe(1);
    };
    // A steady row, then a row on Added (each line with its dates under it).
    await openSteadyRow(page);
    await check("matched seat lines");
    await page.getByRole("tab", { name: "Added", exact: true }).click();
    await page.locator('button[aria-label^="Show the seat lines of"]').first().click();
    await expect(openCard(page).locator("[data-line-dates]").first()).toBeVisible();
    await check("added window");
    expect(errors).toEqual([]);
  });
});

test.describe("IPD stays on the parent card; seat lines stay readable", () => {
  for (const width of [1440, 390]) test(`${width}px: IPD summary and exact partner source remain available without repeated line badges`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = watchErrors(page);
    await open(page, { matchType: true, realShapes: true });
    await chooseFilter(page, 'match-type', 'IPD');
    const card = page.locator('.report-row').filter({hasText:'Samsung TV Plus'}).first();
    await card.locator('.report-expand-control').click();
    await expect(card.locator('[data-ipd-chip]')).toBeVisible();
    await expect(card.locator('[data-ipd-where]')).toContainText('failarmy.tv');
    await expect(card.locator('li [data-ipd-explanation], li [data-line-via], li .line-ipd-badge')).toHaveCount(0);
    await card.locator('[data-line-actions] .line-control-source').first().click();
    const dialog=page.getByRole('dialog',{name:'Open source file'});
    for(const partner of ['northfold-tv.com','failarmy.tv'])await expect(dialog.getByRole('link',{name:`${partner}/ads.txt`,exact:true})).toBeVisible();
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    if (width < 640) {
      const geometry = await card.locator('[data-line-text]').evaluateAll(nodes => nodes.map(node => ({
        clipped: node.scrollWidth > node.clientWidth + 1,
        inside: node.getBoundingClientRect().right <= node.closest('li')!.getBoundingClientRect().right + 1,
      })));
      expect(geometry.every(item => !item.clipped && item.inside)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
});

test.describe("seller roles live on the Sellers.json page", () => {
  test("a report built before the sellers.json read: one quiet line, nothing else", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { sellers: "page", matchType: true }, "/sellers");
    await expect(page.getByTestId("seller-roles-later")).toHaveText(ROLES_LATER);
    await expect(page.getByTestId("seller-roles")).toHaveCount(0);
    await expect(page.getByText(/Seller role:|Managed by:/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a report that read sellers.json: role and managed by as plain rows, searchable; no alerts, no partner inventory", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { sellers: "page", matchType: true, sellersReads: true }, "/sellers");
    const seg = page.getByTestId("seller-roles");
    await expect(seg.getByRole("heading", { name: "Seller roles" })).toBeVisible();
    await expect(page.getByTestId("seller-roles-later")).toHaveCount(0);
    // Crawler #364's tallies, in the workbook's words; a failed read
    // gives no reason in this shape, so none is printed.
    await expect(seg.getByTestId("seller-roles-read")).toHaveText("For 2 of 3 exchanges your seats name. Not read: example-exchange.tv.");
    await expect(seg.locator("[data-seller-role-row]").first()).toBeVisible();
    await seg.getByRole("textbox", { name: "Search seller roles" }).fill("Northfold");
    const row = seg.locator("[data-seller-role-row]");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Seller role:Reseller");
    await expect(row).toContainText("Managed by:copperline-media.tv (GB)");
    // The row carries two alerts and a partner inventory list in the
    // fixtures: neither is shown, here or anywhere (David, 2026-10-27).
    await expect(page.getByText(/sellers\.json names|Two managers|Partner inventory on|Tidewick TV/)).toHaveCount(0);
    await expect(page.locator("[data-seller-role-alert], [data-row-alert]")).toHaveCount(0);
    // The numbers in the gutter, like every list of the report.
    await expect(row.locator("[data-line-no]")).toHaveText("1");
    expect(errors).toEqual([]);
  });

  test("the read sentence: #370's own, #364's tallies, or nothing", async ({ page }) => {
    const errors = watchErrors(page);
    const said = () => page.getByTestId("seller-roles").getByTestId("seller-roles-read");
    // #370: the Excel Summary's string, frozen, printed as is.
    const sentence =
      "For 11 of 14 exchanges your seats name (as of 2026-10-18 11:29 UTC). Not read: example-exchange.tv (refused us, HTTP 403).";
    await open(page, { sellers: "page", matchType: true, sellersReads: { wanted: 14, fresh: 3, read: 8, sentence } }, "/sellers");
    await expect(said()).toHaveText(sentence);
    // #364, every exchange left by the budget: each said with the
    // workbook's reason, and the full stop on "None".
    await open(
      page,
      { sellers: "page", matchType: true, sellersReads: { wanted: 2, fresh: 1, read: 0, failed_domains: [], over_budget_domains: ["late.example"], budget_s: 600 } },
      "/sellers",
    );
    await expect(said()).toHaveText(
      "For 1 of 2 exchanges your seats name. Not read: late.example (left unread: this report's 600 s limit for reading sellers.json was reached).",
    );
    await open(page, { sellers: "page", matchType: true, sellersReads: { wanted: 0 } }, "/sellers");
    await expect(said()).toHaveText("None: your seats name no exchange.");
    // A shape it cannot read: the segment, and no sentence at all.
    await open(page, { sellers: "page", matchType: true, sellersReads: { as_of: "2026-10-27" } }, "/sellers");
    await expect(page.getByTestId("seller-roles").getByRole("heading", { name: "Seller roles" })).toBeVisible();
    await expect(said()).toHaveCount(0);
    await expect(page.getByText(/None: your seats name/)).toHaveCount(0);
    await expect(page.getByText(/\(\)/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("the Overview never shows a seller fact, even on a report that has them", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { sellers: "page", matchType: true, sellersReads: true, realShapes: true });
    await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
    const rows = page.locator('button[aria-label^="Show the seat lines of"]');
    await expect(rows.first()).toBeVisible();
    for (let i = 0; i < Math.min(6, await rows.count()); i++) {
      await rows.nth(i).click();
      await expect(page.locator("[data-line-text]").first()).toBeVisible();
      await expect(page.getByText(/Seller role|Managed by|Partner inventory on|sellers\.json names/)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
});
import { chooseFilter } from './filterChoice';
