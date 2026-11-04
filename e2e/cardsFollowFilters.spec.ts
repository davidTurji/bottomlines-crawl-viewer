/**
 * THE CARDS FOLLOW THE LISTS' FILTERS (David, 2026-11-04: "I pick IPD and
 * Matched publishers, Matched apps, Lines added and Lines removed do not
 * change"), and one Reset puts the whole report back.
 *
 * Production build against the fake API. A crawler that re-counts the
 * summary under ``match_type`` (``listSummary``): every card is the rows its
 * list holds under the same choice, says what it is filtered by, and shows
 * no week-over-week comparison. An older crawler (no echo): the cards keep
 * the whole report's figures and say they are not split, never painting a
 * whole figure as a filtered one.
 */
import { expect, test, type Page } from "@playwright/test";

import { mockDeveloperEvents, mockMatchedApps, mockMatchedDevelopers, mockSummaryFor } from "../src/lib/mockData";
import { chooseFilter } from "./filterChoice";
import { installFakeApi, TOKEN, type Calls, type Scenario } from "./fakeApi";

async function open(page: Page, scenario: Scenario): Promise<Calls> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false }));
    } catch {
      /* the tour may show; the page still renders */
    }
  });
  const calls = await installFakeApi(page, scenario);
  await page.goto(`/crawl-report/${TOKEN}`);
  await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
  const noThanks = page.getByRole("button", { name: "No thanks" });
  await noThanks.click({ timeout: 8000 }).catch(() => {});
  return calls;
}

const tile = (page: Page, label: string) => page.locator(".report-kpi-tile", { hasText: label });
const figure = (page: Page, label: string) => tile(page, label).locator(".report-figure-value");
const whole = mockSummaryFor([]);
const all = <T,>(read: (p: number) => { rows: T[]; total: number }) => {
  const out: T[] = [];
  for (let p = 1; ; p++) {
    const r = read(p);
    out.push(...r.rows);
    if (!r.rows.length || out.length >= r.total) return out;
  }
};
const ipdPublishers = all((p) => mockMatchedDevelopers(p, "", [], "ipd")).length;
const ipdApps = all((p) => mockMatchedApps(p, "", [], "ipd")).length;
const ipdAdded = mockDeveloperEvents("added", 1, [], "ipd", "", 1_000_000).rows.reduce((n, r) => n + (r.lines_added ?? 0), 0);

test("IPD re-counts all four cards off their lists, and Reset brings the whole report back", async ({ page }) => {
  const calls = await open(page, { matchType: true, listSummary: true });
  await expect(figure(page, "Matched publishers")).toHaveText(whole.counters.matched.developers.toLocaleString(), { timeout: 10000 });

  await chooseFilter(page, "match-type", "IPD");
  // The summary is asked under the list's choice.
  await expect.poll(() => calls.some((c) => c.path.endsWith("/summary") && c.query.includes("match_type=ipd"))).toBe(true);
  await expect(figure(page, "Matched publishers")).toHaveText(ipdPublishers.toLocaleString(), { timeout: 10000 });
  await expect(figure(page, "Matched apps")).toHaveText(ipdApps.toLocaleString());
  await expect(figure(page, "Lines added")).toHaveText(ipdAdded.toLocaleString());
  for (const label of ["Lines added", "Lines removed", "Matched publishers", "Matched apps"]) {
    await expect(tile(page, label)).toContainText("Filtered: IPD");
    // A filtered figure is never compared with the whole of last week.
    await expect(tile(page, label)).not.toContainText("vs last week");
  }
  await expect(page.locator("[data-kpi-comparison]")).toContainText("Filtered: Match type: IPD");
  // The menu's IPD count and the card are one number.
  await page.getByTestId("match-type").click();
  await expect(page.getByRole("menuitem", { name: /^IPD/ })).toContainText(ipdPublishers.toLocaleString());
  await page.keyboard.press("Escape");

  // A status tab too, then Reset: everything back to All.
  await page.getByRole("tab", { name: /^Added/ }).click();
  await page.getByTestId("reset-filters").click();
  await expect(page.getByTestId("match-type")).toContainText("All");
  await expect(page.getByRole("tab", { name: /^All matched/ })).toHaveAttribute("aria-selected", "true");
  await expect(figure(page, "Matched publishers")).toHaveText(whole.counters.matched.developers.toLocaleString(), { timeout: 10000 });
  await expect(page.locator("[data-kpi-comparison]")).toHaveText("Compared with last week");
  await expect(page.getByTestId("reset-filters")).toHaveCount(0);
  await expect(page.getByTestId("reset-filters-cards")).toHaveCount(0);
});

test("an older crawler answers the whole report: the cards say they are not split", async ({ page }) => {
  await open(page, { matchType: true });
  await chooseFilter(page, "match-type", "IPD");
  await expect(tile(page, "Matched publishers")).toContainText("Not split by match type", { timeout: 10000 });
  await expect(figure(page, "Matched publishers")).toHaveText(whole.counters.matched.developers.toLocaleString());
  await expect(tile(page, "Lines added")).toContainText("Not split by match type");
  // Reset from the cards' line works the same.
  await page.getByTestId("reset-filters-cards").click();
  await expect(page.getByTestId("match-type")).toContainText("All");
});

test("the sentence under the title names only what the filters cut", async ({ page }) => {
  await open(page, { matchType: true, listSummary: true });
  await chooseFilter(page, "match-type", "IPD");
  const win = page.locator('[data-tour="overview-header"] .relative p').first();
  await expect(win).toHaveText(
    `${ipdPublishers.toLocaleString()} ${ipdPublishers === 1 ? "publisher" : "publishers"} and ${ipdApps.toLocaleString()} ${ipdApps === 1 ? "app" : "apps"} match your filters.`,
    { timeout: 10000 });
});

test("a list filter whose re-read fails keeps the report: whole figures, said not split", async ({ page }) => {
  await open(page, { matchType: true, listSummary: "fails" });
  await chooseFilter(page, "match-type", "IPD");
  await expect(tile(page, "Matched publishers")).toContainText("Not split by match type", { timeout: 10000 });
  await expect(figure(page, "Matched publishers")).toHaveText(whole.counters.matched.developers.toLocaleString());
  await expect(page.getByText("Could not load this report")).toHaveCount(0);
  // The list itself still filters.
  await expect(page.getByTestId("match-type")).toContainText("IPD");
});

test("every card note and the filter line stay on one line, phone to desktop", async ({ page }) => {
  // Four widths and three picks: past the default budget on the demo's
  // full-size fixture.
  test.setTimeout(120_000);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 320) {
      // The longest notes: Own, app-ads.txt ticked with Both.
      await open(page, { matchType: true, listSummary: true, foundIn: true });
      await chooseFilter(page, "match-type", "Own");
      await chooseFilter(page, "found-in", "app-ads.txt");
      await chooseFilter(page, "found-in", "Both");
    }
    await page.waitForTimeout(300);
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll("[data-card-note], [data-kpi-comparison]")].map((el) => {
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 17;
        return Math.round(el.getBoundingClientRect().height / lh);
      }));
    expect(heights.length).toBeGreaterThan(0);
    for (const lines of heights) expect(lines, `at ${width}px`).toBe(1);
  }
});
