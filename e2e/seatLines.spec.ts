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
  page.locator("button[aria-expanded='true']").first().locator("xpath=ancestor::div[contains(@class,'rounded-3xl')][1]");

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

test.describe("the seat line reads in full on a phone (David, 2026-10-27)", () => {
  // At 390 px the partners at the right margin cut the line to "st...":
  // on a phone they go on a line of their own under it, at the line's left
  // edge, the number still on the first line; a long line wraps. Wider,
  // nothing moves.
  /** Opens rows until one lists a line with partners; its lines' geometry. */
  const partnerRows = async (page: Page) => {
    const all = page.locator('button[aria-label^="Show the seat lines of"], button[aria-label^="Hide the seat lines of"]');
    await expect(all.first()).toBeVisible();
    for (let i = 0; i < (await all.count()); i++) {
      const row = all.nth(i);
      if ((await row.getAttribute("aria-expanded")) !== "true") {
        const box = await row.boundingBox();
        await row.click({ position: { x: (box?.width ?? 100) - 24, y: 20 } });
      }
      await expect(openCard(page).locator("[data-line-text]").first()).toBeVisible();
      const withVia = openCard(page).locator("li:has([data-line-via])");
      if (await withVia.count()) return withVia;
    }
    throw new Error("no row with partners on the first page");
  };
  const geometry = (lis: Locator) =>
    lis.evaluateAll((els) =>
      els.map((li) => {
        const text = li.querySelector("[data-line-text]") as HTMLElement;
        const via = li.querySelector("[data-line-via]") as HTMLElement;
        const no = li.querySelector("[data-line-no]") as HTMLElement;
        const t = text.getBoundingClientRect();
        const v = via.getBoundingClientRect();
        const n = no.getBoundingClientRect();
        const lineH = parseFloat(getComputedStyle(text).lineHeight);
        return {
          clipped: text.scrollWidth > text.clientWidth + 1 || getComputedStyle(text).textOverflow === "ellipsis" && text.scrollWidth > text.clientWidth,
          ellipsis: getComputedStyle(text).textOverflow,
          viaBelow: v.top >= t.bottom - 1,
          sameLine: Math.abs(v.top - t.top) <= 2,
          dx: Math.abs(v.left - t.left),
          noOnFirstLine: Math.abs(n.top - t.top) <= 1 && n.height <= lineH + 1,
          inside: v.right <= li.getBoundingClientRect().right + 1,
        };
      }),
    );

  test("390 px: the whole line, the partners under it at its left edge", async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, { matchType: true, realShapes: true });
    const lis = await partnerRows(page);
    const out = await geometry(lis);
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) {
      expect(r.clipped, "line text clipped").toBe(false);
      expect(r.ellipsis).not.toBe("ellipsis");
      expect(r.viaBelow, "partners under the line").toBe(true);
      expect(r.dx, "partners at the line's left edge").toBeLessThanOrEqual(1);
      expect(r.noOnFirstLine, "number on the first line").toBe(true);
      expect(r.inside, "partners inside the row").toBe(true);
    }
    expect(errors).toEqual([]);
  });

  test("desktop: unchanged, the partners at the right margin of the line", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { matchType: true, realShapes: true });
    const out = await geometry(await partnerRows(page));
    for (const r of out) {
      expect(r.sameLine, "partners on the line's own row").toBe(true);
      expect(r.ellipsis).toBe("ellipsis");
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
    await expect(seg.getByTestId("seller-roles-read")).toHaveText(
      // The workbook's own words (run_export.sellers_reads_text), from the
      // same record: same N of M, same reasons, same date.
      "For 2 of 3 exchanges your seats name (as of 2026-10-18 11:29 UTC). Not read: example-exchange.tv (refused us, HTTP 403). Not read again because this report's 600 s limit was reached, an earlier read is used: madeupmedia.com.",
    );
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
