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

import { mockDeveloperEvents, mockLineEvents, mockMatchedApps, mockMatchedDevelopers } from "../src/lib/mockData";
import { lineKey } from "../src/lib/lineFilter";
import type { MatchedSeatLine } from "../src/lib/api";
import { groupSeatLines } from "../src/lib/seatLineGroups";
import { installFakeApi, TOKEN, type Calls, type Scenario } from "./fakeApi";

const BASE = `/crawl-report/${TOKEN}`;
const FULL: Scenario = { matchType: true, appChange: true };
const WATCH: Scenario = { ...FULL, watchTabs: true };

/** Every row of a paged mock list. */
function allRows<T>(readPage: (page: number) => { rows: T[]; total: number }): T[] {
  const out: T[] = [];
  for (let p = 1; p < 10_000; p++) {
    const r = readPage(p);
    out.push(...r.rows);
    if (!r.rows.length || out.length >= r.total) break;
  }
  return out;
}

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

  test("today's API (no watch filter): no Started watching, Stopped watching or Unconfirmed tab, and no page-by-page read", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, FULL);
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByRole("tab")).toHaveText(["All matched", "Added", "Removed", "Changed", "Inactive"]);
    await toApps(page);
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByRole("tab")).toHaveText(["All matched", "Added", "Removed", "Changed", "Inactive"]);
    // Never the old way: no list built from every line event.
    expect(calls.filter((c) => c.path.endsWith("/line-events"))).toEqual([]);
    await expect(page.locator('[data-popular="started"], [data-popular="stopped"], [data-popular="unconfirmed"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("an API with the watch filter (crawler #361): the tabs on both lists, each one server list; the tab survives the switch", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, WATCH);
    const want = ["All matched", "Added", "Removed", "Changed", "Started watching", "Stopped watching", "Unconfirmed", "Inactive"];
    await expect(page.getByRole("tab")).toHaveText(want);
    await tab(page, "Started watching").click();
    await expect(page.locator("[data-scope-note]")).toContainText("Not counted as added");
    await settled(page);
    const pubs = allRows((p) => mockMatchedDevelopers(p, "", [], "all"));
    const n = pubs.filter((_, i) => i % 3 === 0).length;
    await expect(page.locator("[data-list-count]")).toContainText(`${n.toLocaleString()} publishers`);
    expect(calls.some((c) => c.path.endsWith("/matched-developers") && c.query.includes("change=started_watching"))).toBe(true);
    await toApps(page);
    await expect(tab(page, "Started watching")).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => calls.some((c) => c.path.endsWith("/matched-apps") && c.query.includes("change=started_watching"))).toBe(true);
    await expect(page.getByRole("tab")).toHaveText(want);
    await toPublishers(page);
    await expect(tab(page, "Started watching")).toHaveAttribute("aria-selected", "true");
    // Never a list built from every line event: an opened row reads only
    // its own lines.
    expect(calls.filter((c) => c.path.endsWith("/line-events") && !c.query.includes("developer_id="))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("an API that ignores the filter (no echo): the tab goes, never a page filtered here", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, WATCH, "", () =>
      // The filter dropped on the way: the list answers unfiltered, with
      // no echo, as an API that does not know it would.
      page.route("**/matched-developers?*change=*", async (route) => {
        const url = new URL(route.request().url());
        url.searchParams.delete("change");
        return route.fallback({ url: url.toString() });
      }),
    );
    await tab(page, "Started watching").click();
    await expect(tab(page, "All matched")).toHaveAttribute("aria-selected", "true");
    await expect(tab(page, "Started watching")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a watch row opens on its lines of the kind, each with its reason", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { ...WATCH, declaredHost: true });
    await tab(page, "Started watching").click();
    await settled(page);
    await rows(page).first().click();
    const win = page.locator("[data-scope-window]");
    await expect(win).toContainText("Started watching");
    await expect(win.locator("[data-line-reason]").first()).toContainText("first read of this file this crawl");
    expect(errors).toEqual([]);
  });

  test("Unconfirmed: each line says why, when it was last seen, read and verified", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, WATCH);
    await tab(page, "Unconfirmed").click();
    await expect(page.locator("[data-scope-note]")).toContainText("could not verify");
    await rows(page).first().click();
    const win = page.locator("[data-scope-window]");
    await expect(win.locator("[data-line-reason]").first()).toContainText("503");
    await expect(win.locator("[data-line-dates]").first()).toContainText("last seen");
    expect(errors).toEqual([]);
  });

  test("Changed: each cert change old to new", async ({ page }) => {
    const errors = watchErrors(page);
    const row = { ...mockDeveloperEvents("changed", 1).rows[0], developer_id: 777001 };
    const line = { ...(row.cert_changed_lines?.[0] ?? mockDeveloperEvents("changed", 1).rows[0].matched_lines![0]) };
    row.cert_changed_lines = [{ ...line, cert_id: "newcert77" }];
    const certReads: (string | null)[] = [];
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
      await page.route("**/line-events?*event=cert_changed*", (route) => {
        certReads.push(new URL(route.request().url()).searchParams.get("developer_id"));
        return route.fulfill({ json: { page: 1, page_size: 500, total: 1, rows: [ev] } });
      });
    });
    await tab(page, "Changed").click();
    await expect(rows(page).first()).toBeVisible();
    // The rows land with no cert read at all (review of #75: it used to
    // page every cert change of the report first) ...
    expect(certReads).toEqual([]);
    await rows(page).first().click();
    await expect(page.locator("[data-cert-change]").first()).toHaveText("cert oldcert77 \u2192 newcert77");
    // ... and the open row reads its own, by its publisher.
    expect(certReads).toEqual(["777001"]);
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
    // The workbook's headers and values (run_export.py), never snake_case
    // names or lowercase codes.
    expect(lines[0]).toBe(
      '\uFEFF"Publisher domain","Publisher","Matched via","IPD partner","Lines this week","Lines last week","Lines added","Lines removed","Certs changed","Seat lines","Reason"',
    );
    expect(text).toMatch(/,"Own",|,"IPD",/);
    expect(text).not.toMatch(/,"(own|ipd)",/);
    for (const l of lines.slice(1).filter((x) => x.includes(',"IPD",')))
      expect(l).toMatch(/,"IPD","Via [^"]+, inventory partner of [^"]+",/);
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

  test("a watch tab exports the server's filtered list, every page", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, WATCH);
    await tab(page, "Started watching").click();
    await settled(page);
    const total = Number(((await page.locator("[data-list-count] p").innerText()).match(/([\d,]+) publishers/)?.[1] ?? "0").replace(/,/g, ""));
    const d = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export this list" }).click();
    const f = await d;
    expect(f.suggestedFilename()).toBe("publishers-started-watching.csv");
    expect((await readFile((await f.path())!, "utf8")).split("\r\n").length - 1).toBe(total);
    expect(calls.filter((c) => c.path.endsWith("/matched-developers") && c.query.includes("change=started_watching") && c.query.includes("page_size=100")).length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});

test.describe("Export this list, safe and whole (review of #75)", () => {
  const base = mockMatchedDevelopers(1).rows[0];
  const pub = (i: number, name = `Alder ${i}`) => ({ ...base, developer_id: 970000 + i, name, domain: `alder${i}.example` });

  test("a UTF-8 file a spreadsheet never runs as a formula", async ({ page }) => {
    const errors = watchErrors(page);
    const rowsOf = [pub(1, '=HYPERLINK("https://madeupmedia.com","x")'), pub(2, "+1 Media"), pub(3, "Ålder Média")];
    await open(page, {}, "", () =>
      page.route("**/matched-developers?*", (route) =>
        route.fulfill({ json: { page: 1, page_size: 100, total: rowsOf.length, rows: rowsOf } }),
      ),
    );
    await expect(rows(page).first()).toBeVisible();
    const d = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export this list" }).click();
    const text = await readFile((await (await d).path())!, "utf8");
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain(`"'=HYPERLINK(""https://madeupmedia.com"",""x"")"`);
    expect(text).toContain(`"'+1 Media"`);
    expect(text).toContain(`"Ålder Média"`);
    expect(errors).toEqual([]);
  });

  test("a list that reads short of its count: said, and no file", async ({ page }) => {
    const errors = watchErrors(page);
    const TOTAL = 150;
    await open(page, {}, "", () =>
      page.route("**/matched-developers?*", (route) => {
        const url = new URL(route.request().url());
        const size = Number(url.searchParams.get("page_size") ?? "25");
        const pg = Number(url.searchParams.get("page") ?? "1");
        // The report keeps 100 rows but counts 150.
        const from = (pg - 1) * size;
        const rowsOf = Array.from({ length: Math.max(0, Math.min(size, 100 - from)) }, (_, i) => pub(from + i));
        return route.fulfill({ json: { page: pg, page_size: size, total: TOTAL, rows: rowsOf } });
      }),
    );
    await expect(rows(page).first()).toBeVisible();
    let downloaded = false;
    page.on("download", () => (downloaded = true));
    await page.getByRole("button", { name: "Export this list" }).click();
    await expect(page.getByRole("alert")).toHaveText("This list counts 150 rows but only 100 could be read. Nothing was exported.");
    expect(downloaded).toBe(false);
    expect(errors).toEqual([]);
  });
});

test.describe("Popular", () => {
  test("only choices with rows; a choice opens its list on its tab; a second press clears it", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, WATCH, "", () =>
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

  test("every label names what its count counts, never a tile's word", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, WATCH);
    const chips = page.getByTestId("popular").locator("[data-popular]");
    await expect(chips.first()).toBeVisible();
    const labels = (await chips.allInnerTexts()).map((t) => t.replace(/[\d,]+\s*$/, "").replace(/\s+/g, " ").trim());
    expect(labels.length).toBeGreaterThan(3);
    for (const l of labels) expect(l).toMatch(/^(Publishers|Apps) (that (added|lost) lines|with |matched via IPD)/);
    // The apps tile's "lost" counts apps no longer matched at all; the
    // choice counts apps that lost lines, and says so.
    await expect(page.locator('[data-popular="apps-removed"]')).toContainText("Apps that lost lines");
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
    const via = list.locator("[data-line-via]").filter({ visible: true }).filter({ has: page.locator("[data-line-via-more]") }).first();
    await expect(via).toContainText("via northfold-tv.com, failarmy.tv");
    for (const p of ["northfold-tv.com", "failarmy.tv"])
      await expect(via.locator(`a[href^="https://${p}/ads.txt"]`)).toHaveCount(1);
    await via.locator("[data-line-via-more]").click();
    await expect(list.locator('[data-line-via] a[href^="https://example-partner.tv/ads.txt"]').filter({ visible: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("only partner copies fold (review of #75)", () => {
  // One seat, found six ways: the publisher's root ads.txt (twice, the
  // same place), a declared host's ads.txt, its own app-ads.txt, and two
  // inventory partners' ads.txt.
  const seat = { ssp_domain: "madeupssp.com", publisher_id: "S-4410", relationship: "DIRECT", cert_id: "" };
  const own = (host: string, found_in: string) => ({ ...seat, match_type: "own" as const, host, found_in });
  const ipd = (partner: string) => ({ ...seat, match_type: "ipd" as const, ipd_partner: partner, found_in: "ads.txt" });
  const LINES = [
    own("alder.example", "ads.txt"),
    own("alder.example", "ads.txt"),
    own("cdn.alder.example", "ads.txt"),
    own("alder.example", "app-ads.txt"),
    ipd("northfold-tv.com"),
    ipd("failarmy.tv"),
  ];

  test("root vs host and ads.txt vs app-ads.txt stay apart; the same place and the partners fold", () => {
    const groups = groupSeatLines(LINES as MatchedSeatLine[]);
    expect(groups.map((g) => [g.own, g.line.host ?? null, g.line.found_in, g.partners])).toEqual([
      [true, "alder.example", "ads.txt", []],
      [true, "cdn.alder.example", "ads.txt", []],
      [true, "alder.example", "app-ads.txt", []],
      [false, null, "ads.txt", ["northfold-tv.com", "failarmy.tv"]],
    ]);
  });

  test("on the page: four rows, each saying its own file and host", async ({ page }) => {
    const errors = watchErrors(page);
    const base = mockMatchedDevelopers(1).rows[0];
    const row = {
      ...base,
      developer_id: 990101,
      name: "Alder Media",
      domain: "alder.example",
      matched_lines: LINES,
      line_count: LINES.length,
      added_lines: [],
      removed_lines: [],
      cert_changed_lines: [],
    };
    await open(page, {}, "", () =>
      page.route("**/matched-developers?*", (route) =>
        route.fulfill({ json: { page: 1, page_size: 25, total: 1, rows: [row] } }),
      ),
    );
    await rows(page).first().click();
    const list = page.locator("[data-seat-lines]").first();
    const items = list.locator(":scope > li");
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toContainText("Found in ads.txt");
    await expect(items.nth(0).locator("[data-line-host]")).toHaveCount(0);
    await expect(items.nth(1).locator("[data-line-host]")).toHaveText("at cdn.alder.example");
    await expect(items.nth(2)).toContainText("Found in app-ads.txt");
    await expect(items.nth(3).locator("[data-line-via]").filter({ visible: true })).toContainText("via northfold-tv.com, failarmy.tv");
    expect(errors).toEqual([]);
  });
});

test.describe("one seat in two files (re-review of #75)", () => {
  const seat = { ssp_domain: "madeupssp.com", publisher_id: "S-5520", relationship: "DIRECT" };
  const ev0 = () => mockLineEvents({ event: "cert_changed", page_size: 1 }).rows[0];

  test("the lines read on open keep ads.txt and app-ads.txt apart", async ({ page }) => {
    const errors = watchErrors(page);
    const row = {
      ...mockMatchedDevelopers(1).rows[0],
      developer_id: 990201,
      name: "Alder Media",
      domain: "alder.example",
      matched_lines: [],
      added_lines: [],
      removed_lines: [],
      cert_changed_lines: [],
      line_count: 2,
    };
    const events = ["ads_txt", "app_ads_txt"].map((file_kind) => ({
      ...ev0(),
      ...seat,
      event: "matched",
      developer_id: 990201,
      host: "alder.example",
      file_kind,
      old_cert_id: null,
      new_cert_id: null,
    }));
    await open(page, {}, "", async () => {
      await page.route("**/matched-developers?*", (route) => route.fulfill({ json: { page: 1, page_size: 25, total: 1, rows: [row] } }));
      await page.route("**/line-events?*developer_id=990201*", (route) =>
        route.fulfill({ json: { page: 1, page_size: 2, total: 2, rows: events } }),
      );
    });
    await rows(page).first().click();
    const items = page.locator("[data-seat-lines]").first().locator(":scope > li");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("Found in ads.txt");
    await expect(items.nth(1)).toContainText("Found in app-ads.txt");
    expect(errors).toEqual([]);
  });

  // The same seat changed its cert in both files, each from its own old
  // cert: each line says its own old to new, on the page and in the file.
  const changed = async (page: Page) => {
    const row = {
      ...mockDeveloperEvents("changed", 1).rows[0],
      developer_id: 777002,
      developer_name: "Alder Media",
      developer_domain: "alder.example",
      cert_changed_lines: [
        { ...seat, cert_id: "newads", found_in: "ads.txt" },
        { ...seat, cert_id: "newapp", found_in: "app-ads.txt" },
      ],
    };
    const evs = [
      { file_kind: "ads_txt", old_cert_id: "oldads", new_cert_id: "newads" },
      { file_kind: "app_ads_txt", old_cert_id: "oldapp", new_cert_id: "newapp" },
    ].map((e) => ({ ...ev0(), ...seat, ...e, event: "cert_changed", developer_id: 777002, host: "alder.example" }));
    await page.route("**/developer-events?*event=changed*", (route) =>
      route.fulfill({ json: { page: 1, page_size: 25, total: 1, rows: [row], match_type_counts: { all: 1, own: 1, ipd: 0 } } }),
    );
    await page.route("**/line-events?*event=cert_changed*", (route) =>
      route.fulfill({ json: { page: 1, page_size: 500, total: evs.length, rows: evs } }),
    );
  };

  test("each file's line gets its own old cert", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, FULL, "", () => changed(page));
    await tab(page, "Changed").click();
    await rows(page).first().click();
    const certs = page.locator("[data-cert-change]");
    await expect(certs).toHaveCount(2);
    expect((await certs.allInnerTexts()).sort()).toEqual(["cert oldads \u2192 newads", "cert oldapp \u2192 newapp"]);
    expect(errors).toEqual([]);
  });

  test("the Changed tab's file says old to new, as the page does", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, FULL, "", () => changed(page));
    await tab(page, "Changed").click();
    await expect(rows(page).first()).toBeVisible();
    const d = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export this list" }).click();
    const text = await readFile((await (await d).path())!, "utf8");
    expect(text).toContain("madeupssp.com, S-5520, DIRECT, newads (cert oldads -> newads)");
    expect(text).toContain("madeupssp.com, S-5520, DIRECT, newapp (cert oldapp -> newapp)");
    expect(errors).toEqual([]);
  });
});

test.describe("store names (parity audit of #75)", () => {
  test("Apple TV, Google Play and LG, never their codes", async ({ page }) => {
    const errors = watchErrors(page);
    const base = mockMatchedApps(1).rows[0];
    const apps = ["tvos", "googleplay", "lg"].map((store, i) => ({ ...base, store, bundle_id: `b-${store}`, app_name: `App ${i}` }));
    await open(page, FULL, "", () =>
      page.route("**/matched-apps?*", (route) => route.fulfill({ json: { page: 1, page_size: 25, total: apps.length, rows: apps } })),
    );
    await toApps(page);
    await expect(rows(page)).toHaveCount(3);
    const list = page.locator("[data-list-rows]");
    for (const name of ["Apple TV", "Google Play", "LG"]) await expect(list.getByText(name, { exact: true }).first()).toBeVisible();
    for (const code of ["tvos", "googleplay"]) await expect(list.getByText(code, { exact: true })).toHaveCount(0);
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

test.describe("Found in (publishers) and Platform (apps)", () => {
  test("today's API: neither switch, no such request, and no platform label on any publisher", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, { ...FULL, realShapes: true });
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByTestId("found-in")).toHaveCount(0);
    await expect(page.getByTestId("platform")).toHaveCount(0);
    // A publisher carries no platform label anywhere (the fixtures give
    // them CTV, Mobile and Web).
    await expect(page.locator("[data-platform]")).toHaveCount(0);
    await expect(page.locator("main").getByText(/^(CTV|Mobile|Web)$/)).toHaveCount(0);
    await toApps(page);
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByTestId("platform")).toHaveCount(0);
    expect(calls.filter((c) => /[?&](found_in|platform)=/.test(c.query))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("Found in on the publishers list: counts in the pills, the whole list filtered by the server, with every tab", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, { ...WATCH, foundIn: true });
    const sw = page.getByTestId("found-in");
    await expect(sw).toBeVisible();
    const labels = await sw.getByRole("button").allInnerTexts();
    expect(labels[0]).toMatch(/^All\s*[\d,]+$/);
    for (const l of labels.slice(1)) expect(l).toMatch(/^(ads\.txt|app-ads\.txt|Both)\s*[1-9][\d,]*$/);
    const pill = sw.getByRole("button").nth(1);
    const word = (await pill.innerText()).trim().split(/\s+/)[0];
    const asked = word === "ads.txt" ? "ads_txt" : word === "app-ads.txt" ? "app_ads_txt" : "both";
    const n = Number((await pill.innerText()).replace(/[^\d]/g, "").replace(/^\D+/, "")) ;
    await pill.click();
    await expect(pill).toHaveAttribute("aria-pressed", "true");
    await settled(page);
    expect(calls.some((c) => c.path.endsWith("/matched-developers") && c.query.includes(`found_in=${asked}`))).toBe(true);
    expect(n).toBeGreaterThan(0);
    // With a change tab and a watch tab: the same filter rides along.
    await tab(page, "Added").click();
    await expect.poll(() => calls.some((c) => c.path.endsWith("/developer-events") && c.query.includes(`found_in=${asked}`))).toBe(true);
    await tab(page, "Started watching").click();
    await expect
      .poll(() => calls.some((c) => c.path.endsWith("/matched-developers") && c.query.includes("change=started_watching") && c.query.includes(`found_in=${asked}`)))
      .toBe(true);
    // Apps have no Found in switch.
    await toApps(page);
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByTestId("found-in")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("Platform on the apps list only: counts in the pills, the whole list filtered by the server", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, { ...FULL, appPlatform: true });
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByTestId("platform")).toHaveCount(0);
    await toApps(page);
    const sw = page.getByTestId("platform");
    await expect(sw).toBeVisible();
    const labels = await sw.getByRole("button").allInnerTexts();
    for (const l of labels.slice(1)) expect(l).toMatch(/^(CTV|Mobile|Web)\s*[1-9][\d,]*$/);
    const mobile = sw.getByRole("button").filter({ hasText: /^Mobile/ });
    await mobile.click();
    await expect(mobile).toHaveAttribute("aria-pressed", "true");
    await settled(page);
    expect(calls.some((c) => c.path.endsWith("/matched-apps") && c.query.includes("platform=mobile"))).toBe(true);
    await tab(page, "Added").click();
    await expect.poll(() => calls.some((c) => c.path.endsWith("/matched-apps") && c.query.includes("change=added") && c.query.includes("platform=mobile"))).toBe(true);
    expect(errors).toEqual([]);
  });
});

