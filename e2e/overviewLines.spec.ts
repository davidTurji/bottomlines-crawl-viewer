/**
 * THE OVERVIEW, 2026-10-27 (David):
 *
 *   - The Changes page is the Overview's third view, Lines. No menu entry;
 *     /changes and anything under it land on it, the line filter kept. The
 *     tab survives a switch between Publishers, Apps and Lines.
 *   - "Popular": one click sets the list to a view readers ask for; only
 *     choices whose list has rows, each with its count; the active one is
 *     highlighted, a second press or a filter changed by hand clears it.
 *   - A quiet tab says what is quiet ("No publishers lost a line this
 *     week."), never "on this report".
 *   - One row per distinct seat line, the partners it came through beside
 *     it, each a link to THAT partner's ads.txt.
 */
import { expect, test, type Page } from "@playwright/test";

import { installFakeApi, TOKEN, type Scenario } from "./fakeApi";

const BASE = `/crawl-report/${TOKEN}`;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page, scenario: Scenario, path = "", routes?: () => Promise<unknown>) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false }));
    } catch {
      /* the tour may show; the page still renders */
    }
  });
  await installFakeApi(page, scenario);
  if (routes) await routes();
  await page.goto(`${BASE}${path}`);
  await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
}

const view = (page: Page, name: "Publishers" | "Apps" | "Lines") =>
  page.getByTestId("list-view").getByRole("button", { name, exact: true });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const lineCards = (page: Page) => page.locator("main button[aria-expanded]").filter({ has: page.locator("code") });
const FULL: Scenario = { matchType: true, appChange: true };

test.describe("the Lines view (the Changes page, folded in)", () => {
  test("no menu entry; /changes and anything under it open the Lines view, the line filter kept", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, FULL, "/changes?lines=madeupssp.com%7C1%7CDIRECT");
    await expect(view(page, "Lines")).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/[?&]view=lines/);
    await expect(page).toHaveURL(/[?&]lines=/);
    await expect(page).not.toHaveURL(/\/changes/);
    await expect(page.getByRole("heading", { name: "Line changes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Changes", exact: true })).toHaveCount(0);
    // The Changes page's own KPI cards are gone: the Overview's say the week.
    await expect(page.getByText("Where they landed")).toHaveCount(0);
    await expect(page.getByText("This week's changes")).toHaveCount(1);

    await page.goto(`${BASE}/changes/anything`);
    await expect(view(page, "Lines")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "Filter by SSP domain" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("everything the page had: tabs, SSP search, cards with their publishers, export, paging", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, FULL, "?view=lines");
    for (const t of ["All", "Added", "Removed", "Cert changes"]) await expect(tab(page, t)).toBeVisible();
    await expect(lineCards(page).first()).toBeVisible();
    await lineCards(page).first().click();
    const body = lineCards(page).first().locator("..");
    await expect(body.locator("[data-seat-lines] > li").first()).toBeVisible();
    await expect(body.getByRole("button", { name: "Export", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Filter by SSP domain" }).fill("zz-no-such-ssp");
    await expect(page.locator("[data-empty-list]")).toHaveText('No line changes match "zz-no-such-ssp".');
    expect(errors).toEqual([]);
  });

  test("the tab survives a switch between Publishers, Apps and Lines", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, FULL);
    await tab(page, "Removed").click();
    await view(page, "Lines").click();
    await expect(tab(page, "Removed")).toHaveAttribute("aria-selected", "true");
    await tab(page, "Cert changes").click();
    await view(page, "Apps").click();
    await expect(tab(page, "Changed")).toHaveAttribute("aria-selected", "true");
    await view(page, "Publishers").click();
    await expect(tab(page, "Changed")).toHaveAttribute("aria-selected", "true");
    await expect(page).not.toHaveURL(/view=/);
    expect(errors).toEqual([]);
  });
});

test.describe("Popular", () => {
  test("only choices with rows, each with its count; a press sets the list, a second press clears it", async ({ page }) => {
    const errors = watchErrors(page);
    // Nothing was removed from any app this week: that choice must not show.
    await open(page, FULL, "", () =>
      page.route("**/matched-apps?*change=removed*", (route) =>
        route.fulfill({ json: { page: 1, page_size: 25, total: 0, rows: [], change: "removed", match_type_counts: { all: 0, own: 0, ipd: 0 } } }),
      ),
    );
    const bar = page.getByTestId("popular");
    await expect(bar.locator("[data-popular]").first()).toBeVisible();
    await expect(bar.locator('[data-popular="apps-removed"]')).toHaveCount(0);
    const added = bar.locator('[data-popular="apps-added"]');
    await expect(added).toContainText("All added apps");
    await expect(added).toContainText(/\d/);

    await added.click();
    await expect(added).toHaveAttribute("aria-pressed", "true");
    await expect(view(page, "Apps")).toHaveAttribute("aria-pressed", "true");
    await expect(tab(page, "Added")).toHaveAttribute("aria-selected", "true");
    // A second press clears it, the list back to All.
    await added.click();
    await expect(added).toHaveAttribute("aria-pressed", "false");
    await expect(tab(page, "All matched")).toHaveAttribute("aria-selected", "true");

    // A filter changed by hand clears the highlight too.
    const ipd = bar.locator('[data-popular="ipd"]');
    await ipd.click();
    await expect(page.getByTestId("match-type").getByRole("button", { name: "IPD", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(ipd).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("match-type").getByRole("button", { name: "Own", exact: true }).click();
    await expect(ipd).toHaveAttribute("aria-pressed", "false");

    // A Lines choice opens the Lines view on its tab.
    const linesRemoved = bar.locator('[data-popular="lines-removed"]');
    await linesRemoved.click();
    await expect(view(page, "Lines")).toHaveAttribute("aria-pressed", "true");
    await expect(tab(page, "Removed")).toHaveAttribute("aria-selected", "true");
    expect(errors).toEqual([]);
  });

  test("a carousel: the arrow keys walk the choices; on a phone it scrolls inside itself, never the page", async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, FULL);
    const chips = page.getByTestId("popular").locator("[data-popular]");
    await expect(chips.first()).toBeVisible();
    await chips.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(chips.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(chips.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(chips.first()).toBeFocused();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(wide).toBe(false);
    expect(errors).toEqual([]);
  });
});

test.describe("a quiet tab says what is quiet", () => {
  test("Removed, Added and Changed with no rows: their own words, never 'on this report'", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, FULL, "", async () => {
      await page.route("**/developer-events?*", (route) =>
        route.fulfill({ json: { page: 1, page_size: 25, total: 0, rows: [], match_type_counts: { all: 0, own: 0, ipd: 0 } } }),
      );
      await page.route("**/matched-apps?*change=*", (route) =>
        route.fulfill({
          json: {
            page: 1,
            page_size: 25,
            total: 0,
            rows: [],
            change: new URL(route.request().url()).searchParams.get("change"),
            match_type_counts: { all: 0, own: 0, ipd: 0 },
          },
        }),
      );
    });
    const empty = page.locator("[data-empty-list]");
    await tab(page, "Removed").click();
    await expect(empty).toHaveText("No publishers lost a line this week.");
    await tab(page, "Added").click();
    await expect(empty).toHaveText("No publishers gained a line this week.");
    await tab(page, "Changed").click();
    await expect(empty).toHaveText("No cert changes this week.");
    await view(page, "Apps").click();
    await expect(empty).toHaveText("No cert changes this week.");
    await tab(page, "Removed").click();
    await expect(empty).toHaveText("No apps lost a line this week.");
    await expect(page.getByText(/on this report/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("one row per distinct seat line", () => {
  test("the copies fold into one row with its partners; each partner opens its own ads.txt", async ({ page }) => {
    const errors = watchErrors(page);
    // Real shapes: every other row lists each line once per partner.
    await open(page, { ...FULL, realShapes: true });
    const card = page
      .locator("button[aria-expanded='true']")
      .first()
      .locator("xpath=ancestor::div[contains(@class,'rounded-3xl')][1]");
    // The first row whose lines came through three partners.
    const all = page.locator('button[aria-label^="Show the seat lines of"], button[aria-label^="Hide the seat lines of"]');
    await expect(all.first()).toBeVisible();
    let found = false;
    for (let i = 0; i < (await all.count()) && !found; i++) {
      const row = all.nth(i);
      if ((await row.getAttribute("aria-expanded")) !== "true") {
        const box = await row.boundingBox();
        await row.click({ position: { x: (box?.width ?? 100) - 24, y: 20 } });
      }
      await expect(card.locator("[data-line-text]").first()).toBeVisible();
      found = (await card.locator("[data-line-via-more]").count()) > 0;
    }
    expect(found).toBe(true);
    const list = card.locator("ul:has([data-line-via-more])").first();
    const rows = list.locator(":scope > li");
    const texts = await rows.locator("[data-line-text]").allInnerTexts();
    expect(texts.length).toBeGreaterThan(0);
    expect(new Set(texts).size).toBe(texts.length);
    // The numbers count the distinct rows.
    expect((await rows.locator("[data-line-no]").allInnerTexts()).map(Number)).toEqual(texts.map((_, i) => i + 1));
    const via = list.locator("[data-line-via]").filter({ has: page.locator("[data-line-via-more]") }).first();
    await expect(via).toContainText("via northfold-tv.com, failarmy.tv");
    for (const p of ["northfold-tv.com", "failarmy.tv"])
      await expect(via.locator(`a[href^="https://${p}/ads.txt"]`)).toHaveCount(1);
    // The third partner behind "+1", shown on a press.
    await via.locator("[data-line-via-more]").click();
    await expect(list.locator('[data-line-via] a[href^="https://example-partner.tv/ads.txt"]').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
