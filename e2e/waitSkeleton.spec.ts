import { selectStatus } from "./statusChoice";
import { chooseFilter } from "./filterChoice";
/**
 * EVERY SWITCH WAITS WITH THE SKELETON (David, 2026-10-27: production still
 * dimmed the old rows under a "•••" on the match type switch). Whatever the
 * reader changes, the list that waits for new rows shows the first-load
 * skeleton: never the old rows, dimmed or not, and never the dots. One test
 * per kind of switch; each holds the list's answer until it has looked.
 */
import { expect, test, type Page } from "@playwright/test";

import { mockDeveloperEvents } from "../src/lib/mockData";
import { installFakeApi, TOKEN, type Scenario } from "./fakeApi";

const BASE = `/crawl-report/${TOKEN}`;
const FULL: Scenario = { matchType: true, appChange: true, inactive: "ok", watchTabs: true, foundIn: true, appPlatform: true };

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page, path = "", before?: () => Promise<unknown>) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false }));
    } catch {
      /* the tour may show; the page still renders */
    }
  });
  await installFakeApi(page, FULL);
  if (before) await before();
  await page.goto(`${BASE}${path}`);
  await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
}

/** Holds every answer matching `url` until released. */
async function hold(page: Page, url: string | RegExp | ((u: URL) => boolean)) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(url, async (route) => {
    await gate;
    await route.fallback();
  });
  return release;
}

const rows = (page: Page) => page.locator('button[aria-label^="Show the seat lines of"]');
const skeleton = (page: Page) => page.locator('[role="status"][aria-busy="true"]').first();

/** While it waits: the skeleton, none of the old rows, no dots. */
async function waits(page: Page, list: ReturnType<typeof rows>) {
  await expect(skeleton(page)).toBeVisible();
  await expect(list).toHaveCount(0);
  await expect(page.getByText("•••")).toHaveCount(0);
  await expect(page.locator("[data-list-fade], [data-list-swap]")).toHaveCount(0);
}

async function lands(page: Page, list: ReturnType<typeof rows>) {
  await expect(list.first()).toBeVisible();
  await expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(0);
}

test("match type pills, on publishers and on apps", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await lands(page, rows(page));
  let release = await hold(page, /matched-developers\?.*match_type=ipd/);
  await chooseFilter(page, "match-type", "IPD");
  await waits(page, rows(page));
  release();
  await lands(page, rows(page));

  await page.getByRole("button", { name: /Matched apps/ }).first().click();
  await lands(page, rows(page));
  release = await hold(page, /matched-apps\?.*match_type=own/);
  await chooseFilter(page, "match-type", "Own");
  await waits(page, rows(page));
  release();
  await lands(page, rows(page));
  expect(errors).toEqual([]);
});

test("status tabs", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await lands(page, rows(page));
  const release = await hold(page, /developer-events\?event=removed/);
  await page.getByRole("tab", { name: "Removed", exact: true }).click();
  await waits(page, rows(page));
  release();
  await lands(page, rows(page));
  expect(errors).toEqual([]);
});

test.skip("a Popular choice (hidden for design review)", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await lands(page, rows(page));
  const chip = page.locator('[data-popular="apps-added"]');
  await expect(chip).toBeVisible();
  const release = await hold(page, /matched-apps\?.*change=added/);
  await chip.click();
  await waits(page, rows(page));
  release();
  await lands(page, rows(page));
  expect(errors).toEqual([]);
});

test("search", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await lands(page, rows(page));
  const release = await hold(page, /matched-developers\?.*q=a/);
  await page.getByRole("textbox", { name: "Search matched publishers" }).fill("a");
  await waits(page, rows(page));
  await expect(page.locator("[data-count-skeleton]")).toBeVisible();
  release();
  await lands(page, rows(page));
  expect(errors).toEqual([]);
});

test("the lines filter", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await lands(page, rows(page));
  const release = await hold(page, /matched-developers\?.*lines=/);
  await page.getByRole("button", { name: "Filter by seat line" }).click();
  await page.getByRole("group", { name: "Seat lines" }).getByRole("menuitemcheckbox").first().click();
  await page.getByRole("menuitem", { name: "Apply", exact: true }).click();
  await waits(page, rows(page));
  release();
  await lands(page, rows(page));
  expect(errors).toEqual([]);
});

test("paging", async ({ page }) => {
  const errors = watchErrors(page);
  // Page 2 is held from the start, so the read-ahead cannot answer it.
  const release = await (async () => {
    let r!: () => void;
    await open(page, "", async () => {
      r = await hold(page, /matched-developers\?page=2/);
    });
    return r;
  })();
  await lands(page, rows(page));
  await page.getByRole("button", { name: "Next page", exact: true }).first().click();
  await waits(page, rows(page));
  release();
  await lands(page, rows(page));
  expect(errors).toEqual([]);
});

test("Inactive: its lists switch the same way", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await lands(page, rows(page));
  await selectStatus(page, "Inactive");
  await lands(page, rows(page));
  const release = await hold(page, /\/inactive\?kind=apps/);
  await page.getByRole("button", { name: /Matched apps/ }).first().click();
  await waits(page, rows(page));
  release();
  await lands(page, rows(page));
  expect(errors).toEqual([]);
});

test("the publishers / apps tiles, and a watch tab", async ({ page }) => {
  const errors = watchErrors(page);
  // The watch tab's own read (the server's filter, crawler #361) is held.
  let stopped!: () => void;
  await open(page, "", async () => {
    stopped = await hold(page, (u) => u.pathname.endsWith("/matched-developers") && u.searchParams.get("change") === "stopped_watching");
  });
  await lands(page, rows(page));
  let release = await hold(
    page,
    (u) => u.pathname.endsWith("/matched-apps") && !u.searchParams.has("change") && u.searchParams.get("page") === "1",
  );
  await page.getByRole("button", { name: /Matched apps/ }).first().click();
  await waits(page, rows(page));
  release();
  await lands(page, rows(page));

  await page.getByRole("button", { name: /Matched publishers/ }).first().click();
  await lands(page, rows(page));
  await selectStatus(page, "Stopped watching");
  await waits(page, rows(page));
  stopped();
  await lands(page, rows(page));
  expect(errors).toEqual([]);
});

test("the Found in switch (publishers) and the Platform switch (apps)", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await lands(page, rows(page));
  let release = await hold(page, (u) => u.pathname.endsWith("/matched-developers") && u.searchParams.has("found_in"));
  await page.getByTestId("found-in").click();
  await page.getByRole("menuitem").nth(1).click();
  await waits(page, rows(page));
  release();
  await lands(page, rows(page));

  await page.getByRole("button", { name: /Matched apps/ }).first().click();
  await lands(page, rows(page));
  release = await hold(page, (u) => u.pathname.endsWith("/matched-apps") && u.searchParams.has("platform"));
  await page.getByTestId("platform").click();
  await page.getByRole("menuitem").nth(1).click();
  await waits(page, rows(page));
  release();
  await lands(page, rows(page));
  expect(errors).toEqual([]);
});


test.describe("the skeleton draws the rows the list will land with (re-review of #75)", () => {
  // Two publishers changed a cert this week: the Popular count says 2, and
  // the Changed tab, opened by the tab or by the choice, lands with 2.
  const two = async (page: Page) =>
    page.route(/developer-events\?event=changed/, (route) => {
      const r = mockDeveloperEvents("changed", 1);
      const rowsOf = r.rows.slice(0, 2).map((d, i) => ({ ...d, developer_id: 880100 + i }));
      return route.fulfill({ json: { ...r, page: 1, total: rowsOf.length, rows: rowsOf } });
    });
  const skeletonRows = (page: Page) => page.locator('[role="status"][aria-busy="true"] [data-skeleton-row]');

  for (const how of ["the tab"] as const) {
    test(`opened by ${how}: 2 rows, not a screenful`, async ({ page }) => {
      const errors = watchErrors(page);
      await open(page, "", () => two(page));
      await lands(page, rows(page));

      const release = await hold(page, /developer-events\?event=changed/);
      await page.getByRole("tab", { name: "Changed", exact: true }).click();
      await waits(page, rows(page));
      await expect(skeletonRows(page)).toHaveCount(2);
      release();
      await lands(page, rows(page));
      await expect(rows(page)).toHaveCount(2);
      expect(errors).toEqual([]);
    });
  }

  test("a list with no count known: as many as fit the screen, never more than a page", async ({ page }) => {
    await open(page);
    await lands(page, rows(page));
    const release = await hold(page, /matched-developers\?.*q=zz/);
    await page.getByRole("textbox", { name: "Search matched publishers" }).fill("zz");
    await expect(skeleton(page)).toBeVisible();
    const n = await skeletonRows(page).count();
    const fit = await page.evaluate(() => Math.max(3, Math.ceil(window.innerHeight / 90)));
    expect(n).toBeLessThanOrEqual(Math.min(25, fit));
    release();
  });
});
