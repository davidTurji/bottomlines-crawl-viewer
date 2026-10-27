/**
 * THE OVERVIEW'S LISTS, 2026-10-27 (David):
 *
 *   - The Changes page is gone. Its statuses are tabs of the matched
 *     publishers and apps lists: All matched, Added, Removed, Changed,
 *     Started watching, Stopped watching, Unconfirmed, Inactive (a watch
 *     tab only on a week with such lines). /changes lands on the Overview.
 *     Changed shows each cert old to new; the line filter plus Added lists
 *     exactly the publishers that added the line.
 *   - "Export this list": a CSV of exactly the tab, filters and search,
 *     every page, never the metered full export.
 *   - Popular points at those tabs; only choices with rows.
 *   - Quiet tabs say what is quiet; one row per distinct seat line.
 *   - Rows roll in on every landing; less motion asked for, they appear.
 */
import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { mockDeveloperEvents, mockLineEvents, mockSummaryFor } from "../src/lib/mockData";
import { lineKey } from "../src/lib/lineFilter";
import { installFakeApi, TOKEN, type Calls, type Scenario } from "./fakeApi";

const BASE = `/crawl-report/${TOKEN}`;
const FULL: Scenario = { matchType: true, appChange: true };

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page, scenario: Scenario, path = "", routes?: () => Promise<unknown>): Promise<Calls> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false }));
    } catch {
      /* the tour may show; the page still renders */
    }
  });
  const calls = await installFakeApi(page, scenario);
  if (routes) await routes();
  await page.goto(`${BASE}${path}`);
  await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
  return calls;
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const rows = (page: Page) => page.locator('button[aria-label^="Show the seat lines of"], button[aria-label^="Hide the seat lines of"]');
const toApps = (page: Page) => page.getByRole("button", { name: /Matched apps/ }).first().click();
const toPublishers = (page: Page) => page.getByRole("button", { name: /Matched publishers/ }).first().click();
const settled = (page: Page) => expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(0);

test.describe("the Changes page's statuses, as tabs", () => {
  test("no Changes page: no menu entry, no view switch; /changes lands on the Overview, its line filter kept", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, FULL, "/changes/anything?lines=madeupssp.com%7C1%7CDIRECT");
    await expect(page).not.toHaveURL(/\/changes/);
    await expect(page).toHaveURL(/[?&]lines=/);
    await expect(page.getByRole("link", { name: "Changes", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("list-view")).toHaveCount(0);
    await expect(page.getByText("Where they landed")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("every status is a tab on both lists, a watch tab only with rows, and the tab survives the switch", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, FULL);
    const t = mockSummaryFor([]).hero_diff.line_totals;
    const want = ["All matched", "Added", "Removed", "Changed"];
    if ((t.newly_monitored ?? 0) > 0) want.push("Started watching");
    if ((t.monitoring_stopped ?? 0) > 0) want.push("Stopped watching");
    if ((t.unconfirmed ?? 0) > 0) want.push("Unconfirmed");
    want.push("Inactive");
    await expect(page.getByRole("tab")).toHaveText(want);
    expect(want).toContain("Started watching");
    await tab(page, "Started watching").click();
    await expect(page.locator("[data-scope-note]")).toContainText("Not counted as added");
    await toApps(page);
    await expect(tab(page, "Started watching")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab")).toHaveText(want);
    await toPublishers(page);
    await expect(tab(page, "Started watching")).toHaveAttribute("aria-selected", "true");
    expect(errors).toEqual([]);
  });

  test("a watch tab lists the publishers with such lines, each line with its reason", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { ...FULL, declaredHost: true });
    await tab(page, "Started watching").click();
    await settled(page);
    const expected = new Set(
      mockLineEvents({ event: "newly_monitored", page_size: 1_000_000 }).rows.map((e) => e.developer_id),
    ).size;
    await expect(page.locator("[data-list-count]")).toContainText(
      expected === 1 ? "1 publisher" : `${expected.toLocaleString()} publishers`,
    );
    await rows(page).first().click();
    const win = page.locator("[data-scope-window]");
    await expect(win).toContainText("Started watching");
    await expect(win.locator("[data-line-reason]").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Unconfirmed: each line says why, when it was last seen, read and verified", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, FULL);
    const u = tab(page, "Unconfirmed");
    test.skip((await u.count()) === 0, "this fixture week has no unconfirmed lines");
    await u.click();
    await expect(page.locator("[data-scope-note]")).toContainText("could not verify");
    await rows(page).first().click();
    const win = page.locator("[data-scope-window]");
    await expect(win.locator("[data-line-reason]").first()).toBeVisible();
    await expect(win.locator("[data-line-dates]").first()).toContainText("last seen");
    expect(errors).toEqual([]);
  });

  test("Changed: each cert change old to new", async ({ page }) => {
    const errors = watchErrors(page);
    const row = { ...mockDeveloperEvents("changed", 1).rows[0], developer_id: 777001 };
    const line = { ...(row.cert_changed_lines?.[0] ?? mockDeveloperEvents("changed", 1).rows[0].matched_lines![0]) };
    row.cert_changed_lines = [{ ...line, cert_id: "newcert77" }];
    const ev = {
      ...mockLineEvents({ event: "cert_changed", page_size: 1 }).rows[0],
      developer_id: 777001,
      ssp_domain: line.ssp_domain,
      publisher_id: line.publisher_id,
      relationship: line.relationship,
      old_cert_id: "oldcert77",
      new_cert_id: "newcert77",
    };
    await open(page, FULL, "", async () => {
      await page.route("**/developer-events?*event=changed*", (route) =>
        route.fulfill({ json: { page: 1, page_size: 25, total: 1, rows: [row], match_type_counts: { all: 1, own: 1, ipd: 0 } } }),
      );
      await page.route("**/line-events?*event=cert_changed*", (route) =>
        route.fulfill({ json: { page: 1, page_size: 500, total: 1, rows: [ev] } }),
      );
    });
    await tab(page, "Changed").click();
    await rows(page).first().click();
    await expect(page.locator("[data-cert-change]").first()).toHaveText("cert oldcert77 \u2192 newcert77");
    expect(errors).toEqual([]);
  });

  test("one seat line in the line filter plus Added lists exactly the publishers that added it", async ({ page }) => {
    const errors = watchErrors(page);
    // Three publishers added lines this week: two added L1, one L2. The
    // crawler keeps, under ?lines=L1, the publishers whose Added events are
    // on L1 (viewer_frozen.developer_events); the page must ask with the
    // line and show every one of them, nothing else.
    const base = mockDeveloperEvents("added", 1).rows[0];
    const l1 = { ssp_domain: "madeupssp.com", publisher_id: "L1-111", relationship: "DIRECT" };
    const l2 = { ssp_domain: "madeupssp.com", publisher_id: "L2-222", relationship: "DIRECT" };
    const pubs = [
      { ...base, developer_id: 881, developer_name: "Alder Media", developer_domain: "alder.example", added_lines: [l1] },
      { ...base, developer_id: 882, developer_name: "Birch Media", developer_domain: "birch.example", added_lines: [l1, l2] },
      { ...base, developer_id: 883, developer_name: "Cedar Media", developer_domain: "cedar.example", added_lines: [l2] },
    ];
    const key = lineKey(l1);
    const asked: string[] = [];
    await open(page, FULL, `?lines=${encodeURIComponent(key)}`, () =>
      page.route("**/developer-events?*event=added*", (route) => {
        const url = new URL(route.request().url());
        const sel = (url.searchParams.get("lines") ?? "").split(",").filter(Boolean).map(decodeURIComponent);
        asked.push(sel.join(","));
        const kept = sel.length ? pubs.filter((p) => p.added_lines.some((l) => sel.includes(lineKey(l)))) : pubs;
        return route.fulfill({ json: { page: 1, page_size: 25, total: kept.length, rows: kept, match_type_counts: { all: kept.length, own: kept.length, ipd: 0 } } });
      }),
    );
    await tab(page, "Added").click();
    await settled(page);
    const names = (await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""))).map((l) =>
      l.replace(/^(Show|Hide) the seat lines of /, ""),
    );
    expect(names.sort()).toEqual(["Alder Media", "Birch Media"]);
    expect(asked.at(-1)).toBe(key);
    expect(errors).toEqual([]);
  });
});

test.describe("Export this list", () => {
  test("a CSV of every page of the tab under its filters, never the metered export", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, FULL);
    await expect(rows(page).first()).toBeVisible();
    const total = Number(((await page.locator("[data-list-count] p").innerText()).match(/of ([\d,]+)/)?.[1] ?? "0").replace(/,/g, ""));
    expect(total).toBeGreaterThan(25);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export this list" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("publishers-all-matched.csv");
    const text = await readFile((await file.path())!, "utf8");
    const lines = text.split("\r\n");
    expect(lines[0]).toContain('"publisher_domain","publisher_name"');
    expect(lines.length - 1).toBe(total);
    // Never the metered full export (export-info is only its label).
    expect(calls.filter((c) => /\/export(\.xlsx)?$/.test(c.path))).toEqual([]);

    // Under a tab, a match type and a search: exactly those rows.
    await tab(page, "Added").click();
    await page.getByRole("textbox", { name: "Search matched publishers" }).fill("a");
    await settled(page);
    const shown = Number(((await page.locator("[data-list-count] p").innerText()).match(/([\d,]+)\s/g)?.pop() ?? "0").replace(/[^\d]/g, ""));
    const d2 = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export this list" }).click();
    const f2 = await d2;
    expect(f2.suggestedFilename()).toBe("publishers-added-search-a.csv");
    const t2 = (await readFile((await f2.path())!, "utf8")).split("\r\n");
    expect(t2.length - 1).toBe(shown);
    expect(errors).toEqual([]);
  });
});

test.describe("Popular", () => {
  test("only choices with rows; a choice opens its list on its tab; a second press clears it", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, FULL, "", () =>
      page.route("**/matched-apps?*change=removed*", (route) =>
        route.fulfill({ json: { page: 1, page_size: 25, total: 0, rows: [], change: "removed", match_type_counts: { all: 0, own: 0, ipd: 0 } } }),
      ),
    );
    const bar = page.getByTestId("popular");
    await expect(bar.locator("[data-popular]").first()).toBeVisible();
    await expect(bar.locator('[data-popular="apps-removed"]')).toHaveCount(0);
    // The demo's suggestion row: 14px, medium.
    const chip = bar.locator('[data-popular="stopped"]');
    await expect(chip).toHaveCSS("font-size", "14px");
    await expect(chip).toHaveCSS("font-weight", "500");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(tab(page, "Stopped watching")).toHaveAttribute("aria-selected", "true");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(tab(page, "All matched")).toHaveAttribute("aria-selected", "true");
    // A filter changed by hand clears the highlight.
    const added = bar.locator('[data-popular="apps-added"]');
    await added.click();
    await expect(tab(page, "Added")).toHaveAttribute("aria-selected", "true");
    await tab(page, "Removed").click();
    await expect(added).toHaveAttribute("aria-pressed", "false");
    expect(errors).toEqual([]);
  });

  test("the arrow keys walk the choices; on a phone it scrolls inside itself, never the page", async ({ page }) => {
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
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
    await toApps(page);
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
    await open(page, { ...FULL, realShapes: true });
    const card = page
      .locator("button[aria-expanded='true']")
      .first()
      .locator("xpath=ancestor::div[contains(@class,'rounded-3xl')][1]");
    const all = rows(page);
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
    const items = list.locator(":scope > li");
    const texts = await items.locator("[data-line-text]").allInnerTexts();
    expect(new Set(texts).size).toBe(texts.length);
    expect((await items.locator("[data-line-no]").allInnerTexts()).map(Number)).toEqual(texts.map((_, i) => i + 1));
    const via = list.locator("[data-line-via]").filter({ has: page.locator("[data-line-via-more]") }).first();
    await expect(via).toContainText("via northfold-tv.com, failarmy.tv");
    for (const p of ["northfold-tv.com", "failarmy.tv"])
      await expect(via.locator(`a[href^="https://${p}/ads.txt"]`)).toHaveCount(1);
    await via.locator("[data-line-via-more]").click();
    await expect(list.locator('[data-line-via] a[href^="https://example-partner.tv/ads.txt"]').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("the rows roll in", () => {
  test("every landing: each row fades in and slides down, staggered, capped", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, FULL);
    await expect(rows(page).first()).toBeVisible();
    const motion = () =>
      page.locator("[data-row-in]").evaluateAll((els) =>
        els.slice(0, 12).map((el) => {
          const cs = getComputedStyle(el);
          return { name: cs.animationName, delay: cs.animationDelay, duration: cs.animationDuration };
        }),
      );
    let m = await motion();
    expect(m[0].name).toBe("bl-row-in");
    // After a switch too, and the stagger stops growing at the seventh row.
    await tab(page, "Added").click();
    await expect(rows(page).first()).toBeVisible();
    m = await motion();
    expect(m.every((r) => r.name === "bl-row-in")).toBe(true);
    const delays = m.map((r) => parseFloat(r.delay) * (r.delay.endsWith("ms") ? 1 : 1000));
    expect(Math.max(...delays)).toBeLessThanOrEqual(210);
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(errors).toEqual([]);
  });

  test.describe("less motion asked for", () => {
    test.use({ contextOptions: { reducedMotion: "reduce" } });
    test("the rows simply appear", async ({ page }) => {
      await open(page, FULL);
      await expect(rows(page).first()).toBeVisible();
      const names = await page.locator("[data-row-in]").evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
      expect(names.every((n) => n === "none")).toBe(true);
    });
  });
});

