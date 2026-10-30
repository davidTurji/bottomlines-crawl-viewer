import { chooseFilter } from "./filterChoice";
/**
 * THE MATCHED APPS CHANGE TABS count the whole list, never one page.
 *
 * Select Media, 2026-10-26: Added / Removed / Changed on Matched apps said
 * "0 with changes" on a report with 82 apps lost, because the tabs filtered
 * the 25 rows already loaded and counted those. The crawler now filters the
 * whole list (``?change=``) and echoes the filter; an API from before it
 * ignores the parameter, and the tab then says its count covers this page.
 */
import { expect, test, type Page } from "@playwright/test";

import { mockMatchedApps, MT_PLATFORM } from "../src/lib/mockData";
import type { AppChange, MatchedApp, MatchTypeFilter } from "../src/lib/api";
import { PAGE_SIZE } from "../src/lib/paging";
import { installFakeApi, TOKEN, type Calls, type Scenario } from "./fakeApi";

const BASE = `/crawl-report/${TOKEN}`;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page, scenario: Scenario): Promise<Calls> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        "pf_report_walkthrough_v1",
        JSON.stringify({ status: "completed", stepId: null, open: false }),
      );
    } catch {
      /* storage blocked: the tour may show, the page still renders */
    }
  });
  const calls = await installFakeApi(page, scenario);
  await page.goto(BASE);
  await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
  return calls;
}

const toApps = async (page: Page) => {
  await page.getByRole("button", { name: /Matched apps/ }).click();
  await expect(page.getByRole("heading", { name: "Matched apps" })).toBeVisible();
};
const toPublishers = async (page: Page) => {
  await page.getByRole("button", { name: /Matched publishers/ }).click();
  await expect(page.getByRole("heading", { name: "Matched publishers" })).toBeVisible();
};
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const list = (page: Page) => page.locator('[data-tour="overview-list"]');
const count = (page: Page) => page.locator("[data-list-count] p");
const cards = (page: Page) => page.locator('button[aria-label^="Show the seat lines of"]');
const card = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp(`^(Show|Hide) the seat lines of ${name}$`) });

const moved = (a: MatchedApp, change: AppChange) =>
  (change === "added" ? a.lines_added : change === "removed" ? a.lines_removed : a.lines_cert_changed) ?? 0;

/** The count the search row shows for a server-filtered change tab. */
const serverCount = (total: number) =>
  total > PAGE_SIZE ? `1–${PAGE_SIZE} of ${total.toLocaleString()} with changes` : `${total.toLocaleString()} with changes`;

const appsCalls = (calls: Calls, change: AppChange) =>
  calls.filter((c) => c.path.endsWith("/matched-apps") && new URLSearchParams(c.query).get("change") === change);

test.describe("the matched apps change tabs", () => {
  test("with the crawler's filter: the whole list's apps and the server's total", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, { appChange: true });
    await toApps(page);
    for (const change of ["added", "removed", "changed"] as const) {
      const whole = mockMatchedApps(1, "", [], null, change);
      const firstPage = mockMatchedApps(1).rows.filter((a) => moved(a, change) > 0).length;
      // The bug's shape (apps lost past the first page): the whole list
      // holds more than the first page shows.
      if (change === "removed") expect(whole.total).toBeGreaterThan(firstPage);
      else expect(whole.total).toBeGreaterThanOrEqual(firstPage);
      await tab(page, change === "changed" ? "Changed" : change === "added" ? "Added" : "Removed").click();
      await expect(count(page)).toHaveText(serverCount(whole.total));
      await expect(cards(page)).toHaveCount(Math.min(whole.total, PAGE_SIZE));
      // Every app on the tab moved that way, apps from past the first page too.
      for (const a of whole.rows) await expect(card(page, a.app_name).first()).toBeVisible();
      await expect.poll(() => appsCalls(calls, change).length).toBeGreaterThan(0);
    }
    // All matched asks for no filter (and comes back from the cache).
    await tab(page, "All matched").click();
    await expect(count(page)).toHaveText(new RegExp(`^1–${PAGE_SIZE} of [\\d,]+ apps$`));
    const unfiltered = calls.filter((c) => c.path.endsWith("/matched-apps") && !c.query.includes("change="));
    expect(unfiltered.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("with today's API (no echo): the page's apps, counted as this page only", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, {});
    await toApps(page);
    const firstPage = mockMatchedApps(1).rows;
    for (const [name, change] of [
      ["Added", "added"],
      ["Removed", "removed"],
      ["Changed", "changed"],
    ] as const) {
      const onPage = firstPage.filter((a) => moved(a, change) > 0);
      expect(onPage.length).toBeGreaterThan(0);
      await tab(page, name).click();
      await expect.poll(() => appsCalls(calls, change).length).toBeGreaterThan(0);
      await expect(count(page)).toHaveText(`${onPage.length} on this page`);
      await expect(cards(page)).toHaveCount(onPage.length);
      // Never a whole-list claim, and nothing to page.
      await expect(list(page).getByText(/with changes/)).toHaveCount(0);
      await expect(list(page).getByRole("navigation", { name: "Pages" })).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test("with today's API, a page with none says this page, not this report", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, {});
    await toApps(page);
    // A search the first page answers with apps that did not move.
    const still = mockMatchedApps(1).rows.find((a) => !a.lines_added && !a.lines_removed && !a.lines_cert_changed)!;
    await page.getByRole("textbox", { name: "Search matched apps" }).fill(still.bundle_id);
    await expect(card(page, still.app_name)).toHaveCount(1);
    await tab(page, "Added").click();
    await expect(page.getByText(`No apps with changes match "${still.bundle_id}" on this page.`)).toBeVisible();
    await expect(list(page).getByText(/on this report/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("the tab stays across the publishers and apps switch, and the apps list is filtered for it", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, { appChange: true });
    await tab(page, "Added").click();
    await expect(tab(page, "Added")).toHaveAttribute("aria-selected", "true");
    await toApps(page);
    await expect(tab(page, "Added")).toHaveAttribute("aria-selected", "true");
    await expect(count(page)).toHaveText(serverCount(mockMatchedApps(1, "", [], null, "added").total));
    expect(appsCalls(calls, "added").length).toBeGreaterThan(0);
    await tab(page, "Removed").click();
    await expect(count(page)).toHaveText(serverCount(mockMatchedApps(1, "", [], null, "removed").total));
    await toPublishers(page);
    await expect(tab(page, "Removed")).toHaveAttribute("aria-selected", "true");
    await toApps(page);
    await expect(tab(page, "Removed")).toHaveAttribute("aria-selected", "true");
    await expect(count(page)).toHaveText(serverCount(mockMatchedApps(1, "", [], null, "removed").total));
    expect(errors).toEqual([]);
  });

  test("the match type filter rides with a change tab", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, { matchType: true, appChange: true });
    await toApps(page);
    await tab(page, "Added").click();
    const both = (mt: MatchTypeFilter) => mockMatchedApps(1, "", [], mt, "added");
    await expect(count(page)).toHaveText(serverCount(both("all").total));

    // IPD and Added: the Samsung TV Plus app, whose partner gained two lines.
    await chooseFilter(page, "match-type", "IPD");
    await expect(page.getByTestId("match-type")).toContainText("IPD");
    await expect(count(page)).toHaveText(serverCount(both("ipd").total));
    await expect(card(page, MT_PLATFORM.name)).toHaveCount(1);
    await expect
      .poll(() =>
        calls.some((c) => {
          const p = new URLSearchParams(c.query);
          return c.path.endsWith("/matched-apps") && p.get("change") === "added" && p.get("match_type") === "ipd";
        }),
      )
      .toBe(true);

    // Own and Added: never the IPD app.
    await chooseFilter(page, "match-type", "Own");
    await expect(count(page)).toHaveText(serverCount(both("own").total));
    await expect(card(page, MT_PLATFORM.name)).toHaveCount(0);
    await expect(tab(page, "Added")).toHaveAttribute("aria-selected", "true");
    expect(errors).toEqual([]);
  });
});
