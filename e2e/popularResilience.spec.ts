/**
 * POPULAR NEVER BLOCKS (hotfix 2026-10-27). On Select Media's report the
 * API ran out of memory; the Popular bar stayed a skeleton forever and its
 * six requests at once helped knock the API over. Now, against an API where
 * one of its counts never answers and one answers 503:
 *
 *   - nothing of Popular is asked before the list below has landed;
 *   - at most two of its requests are in flight at once;
 *   - the other chips show as their counts land, the two failed ones are
 *     simply not offered, and the skeleton ends by the ceiling;
 *   - the page and the lists work all along;
 *   - the row spans the content's full width.
 */
import { expect, test, type Page } from "@playwright/test";

import { mockDeveloperEvents, mockMatchedDevelopers } from "../src/lib/mockData";
import { installFakeApi, TOKEN, type Scenario } from "./fakeApi";

const BASE = `/crawl-report/${TOKEN}`;
const FULL: Scenario = { matchType: true, appChange: true, watchTabs: true };

/** Popular's own count requests: page_size=1. */
const isCount = (url: string) => /\/(developer-events|matched-apps)\?/.test(url) && /[?&]page_size=1(&|$)/.test(url);

async function open(page: Page, routes: () => Promise<unknown>) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false }));
    } catch {
      /* the tour may show; the page still renders */
    }
  });
  await installFakeApi(page, FULL);
  await routes();
  await page.goto(BASE);
}

test("one count never answers, one answers 503: the rest show, the skeleton ends, the page works", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Popular's requests, in flight and in order; and when the list landed.
  let inFlight = 0;
  let most = 0;
  const asked: { url: string; at: number }[] = [];
  page.on("request", (r) => {
    if (!isCount(r.url())) return;
    asked.push({ url: r.url(), at: Date.now() });
    inFlight++;
    most = Math.max(most, inFlight);
  });
  const done = (r: { url(): string }) => isCount(r.url()) && inFlight--;
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  let listLanded = 0;
  let releaseList!: () => void;
  const listGate = new Promise<void>((r) => (releaseList = r));
  await open(page, async () => {
    // The list below is held a moment: Popular must wait for it.
    await page.route(/matched-developers\?page=1&page_size=25(&|$)/, async (route) => {
      await listGate;
      listLanded = Date.now();
      await route.fallback();
    });
    // One count never answers ...
    await page.route(/developer-events\?event=removed&page=1&page_size=1(&|$)/, () => new Promise<void>(() => {}));
    // ... and one answers 503.
    await page.route(/matched-apps\?.*page_size=1.*change=added|matched-apps\?.*change=added.*page_size=1/, (route) =>
      route.fulfill({ status: 503, json: { detail: "Memory limit exceeded" } }),
    );
  });
  await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
  await page.waitForTimeout(800);
  expect(asked, "nothing of Popular before the list lands").toEqual([]);
  releaseList();
  const rows = page.locator('button[aria-label^="Show the seat lines of"]');
  await expect(rows.first()).toBeVisible();

  // The others' chips, as they land; the two failed ones never.
  const bar = page.getByTestId("popular");
  await expect(bar.locator('[data-popular="pubs-new"]')).toBeVisible();
  await expect(bar.locator('[data-popular="cert"]')).toBeVisible();
  await expect(bar.locator('[data-popular="apps-removed"]')).toBeVisible();
  // The page works while a count is still on its way.
  await page.getByRole("tab", { name: "Added", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Added", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(rows.first()).toBeVisible();
  await page.getByRole("tab", { name: "All matched", exact: true }).click();
  await expect(rows.first()).toBeVisible();
  // The skeleton ends by the ceiling (the hung count is given up at 15 s).
  await expect(bar.locator("[data-popular-skeleton]")).toHaveCount(0, { timeout: 40_000 });
  await expect(bar).not.toHaveAttribute("aria-busy", "true");
  await expect(bar.locator('[data-popular="pubs-lost"]')).toHaveCount(0);
  await expect(bar.locator('[data-popular="apps-added"]')).toHaveCount(0);

  expect(asked.length).toBeGreaterThan(0);
  expect(Math.min(...asked.map((a) => a.at))).toBeGreaterThanOrEqual(listLanded);
  expect(most, "at most two of Popular's requests at once").toBeLessThanOrEqual(2);
  // The IPD and watch counts came from the list's own answer: Popular
  // never asked matched-developers itself.
  expect(asked.filter((a) => a.url.includes("matched-developers"))).toEqual([]);
  expect(errors).toEqual([]);
});

test("nothing comes back: the bar goes quietly, the page stays", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, async () => {
    await page.route(/(developer-events|matched-apps)\?.*page_size=1(&|$)/, (route) => route.fulfill({ status: 503, json: { detail: "down" } }));
  });
  await expect(page.locator('button[aria-label^="Show the seat lines of"]').first()).toBeVisible();
  // Only the IPD chip may come from the list's own answer; every requested
  // count failed, and the bar never hangs in its skeleton.
  await expect(page.locator("[data-popular-skeleton]")).toHaveCount(0, { timeout: 20_000 });
  for (const id of ["pubs-new", "pubs-lost", "cert", "apps-added", "apps-removed"])
    await expect(page.locator(`[data-popular="${id}"]`)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the row spans the content's full width: label left, arrows at the two ends", async ({ page }) => {
  await open(page, async () => {});
  const bar = page.getByTestId("popular");
  await expect(bar.locator("[data-popular]").first()).toBeVisible();
  await expect(bar).not.toHaveAttribute("aria-busy", "true", { timeout: 20_000 });
  const b = (await bar.boundingBox())!;
  // As wide as the list below it (the content's column), to the pixel.
  const list = (await page.locator('[data-tour="overview-list"]').boundingBox())!;
  expect(Math.abs(b.width - list.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(b.x - list.x)).toBeLessThanOrEqual(2);
  // The pills fill the rail: the last one ends at the rail's end.
  const rail = (await bar.getByRole("group", { name: "Popular choices" }).boundingBox())!;
  const last = (await bar.locator("[data-popular]").last().boundingBox())!;
  const scrolls = await bar.getByRole("group", { name: "Popular choices" }).evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  if (!scrolls) expect(Math.abs(last.x + last.width - (rail.x + rail.width))).toBeLessThanOrEqual(3);
});

test("the list's own change counts spare the added and changed requests (crawler #361)", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => isCount(r.url()) && asked.push(r.url()));
  await open(page, async () => {
    await page.route(/matched-developers\?page=1&page_size=25(&|$)/, (route) => {
      const r = mockMatchedDevelopers(1);
      return route.fulfill({
        json: {
          ...r,
          match_type_counts: { all: r.total, own: r.total - 4, ipd: 4 },
          change_counts: { added: 70, changed: 20, removed: 99, started_watching: 0, stopped_watching: 0, unconfirmed: 0 },
        },
      });
    });
  });
  const bar = page.getByTestId("popular");
  await expect(bar.locator('[data-popular="pubs-new"]')).toHaveText(/\D70$/);
  await expect(bar.locator('[data-popular="cert"]')).toHaveText(/\D20$/);
  await expect(bar.locator('[data-popular="ipd"]')).toContainText("4");
  await expect(bar).not.toHaveAttribute("aria-busy", "true", { timeout: 20_000 });
  // Lost is always asked (the list cannot count a publisher that lost
  // every line); added and changed never.
  expect(asked.filter((u) => /developer-events\?event=(added|changed)/.test(u))).toEqual([]);
  expect(asked.filter((u) => /developer-events\?event=removed/.test(u)).length).toBe(1);
  await expect(bar.locator('[data-popular="pubs-lost"]')).not.toContainText("99");
});

test.describe("the skeleton ends whatever the list does (review of #77)", () => {
  const busy = (page: Page) => page.locator('[data-testid="popular"][aria-busy="true"]');
  const INACTIVE: Scenario = { ...FULL, inactive: "ok" };

  test("Inactive opened before the list lands: Popular still counts, and ends", async ({ page }) => {
    test.setTimeout(60_000);
    // The publishers list never answers.
    await installFakeApi(page, INACTIVE);
    await page.route(/matched-developers\?page=1&page_size=25(&|$)/, () => new Promise<void>(() => {}));
    await page.addInitScript(() => localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false })));
    await page.goto(BASE);
    await page.getByRole("button", { name: "See them", exact: true }).click();
    await expect(page.getByTestId("inactive-section")).toBeVisible();
    // Popular starts from Inactive at once, and its bar settles well
    // before the ceiling.
    await expect(page.getByTestId("popular").locator('[data-popular="pubs-new"]')).toBeVisible({ timeout: 15_000 });
    await expect(busy(page)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator("[data-popular-skeleton]")).toHaveCount(0);
  });

  test("a new line selection while on Inactive: the same", async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, async () => {});
    await expect(page.locator('button[aria-label^="Show the seat lines of"]').first()).toBeVisible();
    await page.getByRole("tab", { name: "Inactive", exact: true }).click().catch(async () => {
      await page.getByRole("button", { name: "See them", exact: true }).click();
    });
    await expect(page.getByTestId("inactive-section")).toBeVisible();
    await page.getByRole("button", { name: "Filter by seat line" }).click();
    await page.getByRole("group", { name: "Seat lines" }).getByRole("menuitemcheckbox").first().click();
    await page.getByRole("menuitem", { name: "Apply", exact: true }).click();
    await expect(busy(page)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator("[data-popular-skeleton]")).toHaveCount(0);
  });

  test("a list that never lands: the skeleton still ends by the ceiling", async ({ page }) => {
    test.setTimeout(80_000);
    await installFakeApi(page, FULL);
    await page.route(/matched-developers\?page=1&page_size=25(&|$)/, () => new Promise<void>(() => {}));
    await page.addInitScript(() => localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false })));
    await page.goto(BASE);
    await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
    await expect(busy(page)).toHaveCount(0, { timeout: 45_000 });
    await expect(page.locator("[data-popular-skeleton]")).toHaveCount(0);
  });
});

test("a truncated list's counts are never the chips': added and changed are asked", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => isCount(r.url()) && asked.push(r.url()));
  await open(page, async () => {
    await page.route(/matched-developers\?page=1&page_size=25(&|$)/, (route) => {
      const r = mockMatchedDevelopers(1);
      return route.fulfill({
        json: {
          ...r,
          truncated: true,
          match_type_counts: { all: r.total, own: r.total - 4, ipd: 4 },
          change_counts: { added: 70, changed: 20, started_watching: 0, stopped_watching: 0, unconfirmed: 0 },
        },
      });
    });
  });
  const bar = page.getByTestId("popular");
  await expect(bar).not.toHaveAttribute("aria-busy", "true", { timeout: 20_000 });
  expect(asked.filter((u) => /developer-events\?event=added/.test(u)).length).toBe(1);
  expect(asked.filter((u) => /developer-events\?event=changed/.test(u)).length).toBe(1);
  // The chips say what their tabs list (developer-events, as the fake
  // answers it), never the truncated list's 70 and 20.
  for (const [id, event] of [["pubs-new", "added"], ["cert", "changed"]] as const) {
    const total = mockDeveloperEvents(event, 1, [], "all").total;
    expect(total === 70 || total === 20, "the fixture must not collide").toBe(false);
    await expect(bar.locator(`[data-popular="${id}"]`)).toHaveText(new RegExp(`\\D${total}$`));
  }
});

test.describe("the list's controls (David, 2026-10-27)", () => {
  const WIDE: Scenario = { ...FULL, foundIn: true, appPlatform: true };
  const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

  test("one filters row: the list's own split far left, Match type far right, the content's width", async ({ page }) => {
    await installFakeApi(page, WIDE);
    await page.addInitScript(() => localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false })));
    await page.goto(BASE);
    await expect(page.locator('button[aria-label^="Show the seat lines of"]').first()).toBeVisible();
    for (const [view, split] of [["publishers", "found-in"], ["apps", "platform"]] as const) {
      if (view === "apps") {
        await page.getByRole("button", { name: /Matched apps/ }).first().click();
        await expect(page.getByTestId(split)).toBeVisible();
      }
      const row = await box(page, "[data-list-filters]");
      const list = await box(page, '[data-tour="overview-list"]');
      const left = await box(page, `[data-testid="${split}"]`);
      const right = await box(page, '[data-testid="match-type"]');
      expect(Math.abs(row.width - list.width), `${view}: the row is the content's width`).toBeLessThanOrEqual(2);
      expect(Math.abs(left.x - row.x), `${view}: ${split} at the far left`).toBeLessThanOrEqual(2);
      expect(Math.abs(right.x + right.width - (row.x + row.width)), `${view}: Match type at the far right`).toBeLessThanOrEqual(2);
      expect(Math.abs(left.y + left.height / 2 - (right.y + right.height / 2)), `${view}: one row`).toBeLessThanOrEqual(4);
      // And under the tabs.
      const tabs = await box(page, '[role="tablist"]');
      expect(row.y).toBeGreaterThanOrEqual(tabs.y + tabs.height - 1);
    }
  });

  test("Download list: a quiet link right after the count, before the pages, with its progress in place", async ({ page }) => {
    await installFakeApi(page, FULL);
    await page.addInitScript(() => localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false })));
    await page.goto(BASE);
    await expect(page.locator('button[aria-label^="Show the seat lines of"]').first()).toBeVisible();
    const slot = page.locator("[data-list-count]").first();
    const link = slot.getByRole("button", { name: "Download list" });
    await expect(link).toBeVisible();
    // No export button in the search row any more.
    await expect(page.getByRole("button", { name: "Export this list" })).toHaveCount(0);
    const count = await slot.locator("p").first().boundingBox();
    const at = (await link.boundingBox())!;
    const pages = await slot.getByRole("navigation", { name: "Pages" }).boundingBox();
    expect(at.x).toBeGreaterThan(count!.x + count!.width - 1);
    if (pages) expect(pages.x).toBeGreaterThan(at.x + at.width - 1);
    // The count's tone: small, muted, not a button's border.
    const countSize = await slot.locator("p").first().evaluate((el) => getComputedStyle(el).fontSize);
    await expect(link).toHaveCSS("font-size", countSize);
    await expect(link).toHaveCSS("border-top-width", "0px");
    // While it runs: its progress, in place.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(/matched-developers\?page=2&page_size=100/, async (route) => {
      await gate;
      await route.fallback();
    });
    const download = page.waitForEvent("download");
    await link.click();
    await expect(slot.locator("[data-export-list]")).toHaveText(/^Downloading [\d,]+ of [\d,]+…$/);
    release();
    await download;
    await expect(slot.getByRole("button", { name: "Download list" })).toBeVisible();
  });
});
