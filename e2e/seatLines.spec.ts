/**
 * SEAT LINES, ONE LOOK (David, 2026-10-27).
 *
 *   - Every list of matched seat lines numbers its rows like a code
 *     editor: 1, 2, 3 ... in a quiet gutter, restarting per list and
 *     running on across the pages of one list.
 *   - A card on the Changes page opens exactly like a row on the
 *     Overview: the same body, heading, skeleton and rows.
 *   - Seller roles live on the Sellers.json page only, as a segment of
 *     plain rows, and only on a report whose build read the sellers.json
 *     files first (crawler #364); otherwise one quiet line.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { mockLineEvents } from "../src/lib/mockData";
import { pageChangeGroups } from "../src/lib/changeGroups";
import type { LineEvent } from "../src/lib/api";
import { installFakeApi, SELLERS_READS, TOKEN, type Scenario } from "./fakeApi";

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

const changeCards = (page: Page) =>
  page.locator("button[aria-expanded]").filter({ has: page.locator("code") });

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

  test("a Changes card numbers its publishers, and page 2 of the roster starts at 51", async ({ page }) => {
    const errors = watchErrors(page);
    // One line added on 120 publishers: one card, a roster of three pages.
    const seed = mockLineEvents({ page_size: 1 }).rows[0];
    const all: LineEvent[] = Array.from({ length: 120 }, (_, i) => ({
      ...seed,
      event: "added",
      developer_id: 9000 + i,
      developer_domain: `publisher${i}.example`,
      developer_name: `Publisher ${i}`,
    }));
    await open(page, {}, "/changes", () =>
      page.route("**/change-groups**", (route) => {
        const url = new URL(route.request().url());
        const p = Number(url.searchParams.get("page") ?? 1);
        const size = Number(url.searchParams.get("page_size") ?? 25);
        if (!url.pathname.endsWith("/publishers"))
          return route.fulfill({ json: pageChangeGroups(all, { page: p, page_size: size }) });
        return route.fulfill({ json: { page: p, page_size: size, total: 120, rows: all.slice((p - 1) * size, p * size) } });
      }),
    );
    const card = changeCards(page).first();
    await card.click();
    const body = card.locator("..");
    const list = body.locator("[data-seat-lines]");
    await expect(list.locator(":scope > li")).toHaveCount(50);
    expect(await numbers(list)).toEqual(oneToN(50));
    await body.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(body.getByRole("link", { name: "publisher50.example", exact: true })).toBeVisible();
    expect(await numbers(list)).toEqual(oneToN(50, 51));
    expect(errors).toEqual([]);
  });
});

test.describe("a Changes card opens like an Overview row", () => {
  test("the same body, heading and rows; the same skeleton while its publishers load", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, {});
    await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
    const overviewList = await openSteadyRow(page);
    const look = (l: Locator) =>
      l.evaluate((el) => {
        const body = el.closest("[class*='border-t']") as HTMLElement;
        const row = el.querySelector(":scope > li") as HTMLElement;
        const text = row.querySelector("[data-line-text]") as HTMLElement;
        const cs = (e: HTMLElement) => getComputedStyle(e);
        return {
          bodyBg: cs(body).backgroundColor,
          listClass: el.className,
          rowPad: `${cs(row).paddingTop} ${cs(row).paddingLeft}`,
          textFont: `${cs(text).fontFamily} ${cs(text).fontSize}`,
          gutter: cs(row.querySelector("[data-line-no]") as HTMLElement).color,
        };
      });
    const overview = await look(overviewList);

    await page.goto(`${BASE}/changes`);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route("**/change-groups/*/publishers?*", async (route) => {
      await gate;
      await route.fallback();
    });
    const card = changeCards(page).first();
    await card.click();
    // While the publishers load: the seat lines skeleton, never a word.
    await expect(page.locator("[data-seat-lines-skeleton]")).toBeVisible();
    await expect(page.getByText("Loading publishers…")).toHaveCount(0);
    release();
    const changesList = card.locator("..").locator("[data-seat-lines]");
    await expect(changesList.locator(":scope > li").first()).toBeVisible();
    await expect(page.locator("[data-seat-lines-skeleton]")).toHaveCount(0);
    expect(await look(changesList)).toEqual(overview);
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
      `Read from the sellers.json files of ${SELLERS_READS.wanted} exchanges when this report was built. Not read this time: example-exchange.tv.`,
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
