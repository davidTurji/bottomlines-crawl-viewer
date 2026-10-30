import { chooseFilter } from "./filterChoice";
/**
 * THE LIST'S CONTROLS AT 390 PX (demo of #75, 2026-10-27):
 *
 *   - Found in, Match type and Platform: the label above the pills, every
 *     pill as wide as its own label and count, none overlapping another,
 *     no count cut off, the thumb under the chosen pill.
 *   - The status tabs: every one of them in sight and clickable (they wrap
 *     onto a second row rather than scroll out of view unannounced).
 */
import { expect, test, type Page } from "@playwright/test";

import { mockMatchedApps, mockMatchedDevelopers } from "../src/lib/mockData";
import { installFakeApi, TOKEN, type Scenario } from "./fakeApi";

const BASE = `/crawl-report/${TOKEN}`;
const WATCH: Scenario = { matchType: true, appChange: true, watchTabs: true, inactive: "ok", foundIn: true, appPlatform: true };

test.use({ viewport: { width: 390, height: 844 } });

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page, scenario: Scenario, routes?: () => Promise<unknown>) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false }));
    } catch {
      /* the tour may show; the page still renders */
    }
  });
  await installFakeApi(page, scenario);
  if (routes) await routes();
  await page.goto(BASE);
  await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
}

/** Big counts, the widest pills a real report draws. */
const FOUND_IN = { all: 12_345, ads_txt: 8_901, app_ads_txt: 3_210, both: 1_234 };
const PLATFORM = { all: 23_456, ctv: 12_345, mobile: 9_876, web: 1_235 };
const TYPES = { all: 12_345, own: 10_000, ipd: 2_345 };

async function expectConnected(page: Page) {
  const toolbar = page.locator('[data-list-toolbar]').filter({ has: page.getByTestId('match-type') });
  await expect(toolbar).toBeVisible();
  expect(await toolbar.evaluate(root => {
    const box = root.getBoundingClientRect();
    return [...root.querySelectorAll('.list-toolbar-search input, [data-list-pager] button, [data-list-pager] input, [data-export-list]')].filter(el => el.getClientRects().length).every(el => {
      const r = el.getBoundingClientRect(); return r.left >= box.left - 1 && r.right <= box.right + 1;
    });
  })).toBe(true);
}

test("Found in and Match type on the publishers list: label above, no overlap, no count cut off", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, WATCH, () =>
    page.route("**/matched-developers?*", (route) => {
      const q = new URL(route.request().url()).searchParams;
      const r = mockMatchedDevelopers(1);
      return route.fulfill({
        json: {
          ...r,
          total: FOUND_IN.all,
          found_in: q.get("found_in") ?? "all",
          found_in_counts: FOUND_IN,
          match_type: q.get("match_type") ?? "all",
          match_type_counts: TYPES,
        },
      });
    }),
  );
  const foundIn = page.getByTestId("found-in");
  await page.getByLabel("List filters", {exact:true}).click();
  await expect(foundIn).toBeVisible();
  await expectConnected(page);
  await chooseFilter(page, "found-in", "Both");
  await expect(foundIn).toContainText("Both");
  await expectConnected(page);
  expect(errors).toEqual([]);
});

test("Platform on the apps list: the same", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, WATCH, () =>
    page.route("**/matched-apps?*", (route) => {
      const q = new URL(route.request().url()).searchParams;
      const r = mockMatchedApps(1);
      return route.fulfill({
        json: {
          ...r,
          total: PLATFORM.all,
          change: q.get("change") ?? null,
          platform: q.get("platform") ?? "all",
          platform_counts: PLATFORM,
          match_type_counts: TYPES,
        },
      });
    }),
  );
  await page.getByRole("button", { name: /Matched apps/ }).first().click();
  const platform = page.getByTestId("platform");
  await page.getByLabel("List filters", {exact:true}).click();
  await expect(platform).toBeVisible();
  await expectConnected(page);
  await chooseFilter(page, "platform", "Mobile");
  await expect(platform).toContainText("Mobile");
  await expectConnected(page);
  expect(errors).toEqual([]);
});

test("every status tab is in sight and clickable, on both lists", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, WATCH);
  for (const view of ["publishers", "apps"] as const) {
    if (view === "apps") await page.getByRole("button", { name: /Matched apps/ }).first().click();
    const status = page.getByRole("combobox", { name: "Matched status" });
    await expect(status).toBeVisible();
    // Watch/unconfirmed choices arrive with the list's capability response.
    await expect(status.locator("option"), view).toContainText(["All matched", "Added", "Removed", "Changed", "Started watching", "Stopped watching", "Unconfirmed"]);
    const names = await status.locator("option").allTextContents();
    for (const name of names) {
      await status.selectOption({ label: name });
      await expect(status.locator("option:checked")).toHaveText(name);
    }
    await status.selectOption("all");
  }
  // Never wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});
