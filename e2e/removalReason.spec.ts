/**
 * WHY A LINE WAS REMOVED (crawler, 2026-10-26).
 *
 * A removed line may carry ``removal_reason`` ("line_not_in_file" or
 * "file_not_served") and an optional ``removal_detail``. The page says it
 * in one quiet line under the removed line, on the Overview's publisher
 * rows (Removed tab and All matched) and on the Changes page's roster of a
 * removed line. A report frozen before the field says nothing, and either
 * way the line is still counted as removed.
 */
import { expect, test, type Page } from "@playwright/test";

import { mockDeveloperEvents, mockMatchedDevelopers } from "../src/lib/mockData";
import type { MatchedSeatLine } from "../src/lib/api";
import { installFakeApi, removalFor, TOKEN, type Scenario } from "./fakeApi";

const BASE = `/crawl-report/${TOKEN}`;
/** A removed window opens on this many lines when it has more than
 *  OPEN + SLACK, and "Show all" opens every one. */
const OPEN = 5;
const SLACK = 2;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page, scenario: Scenario, path = "") {
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
  await installFakeApi(page, scenario);
  await page.goto(`${BASE}${path}`);
}

/** The words the page must print for the scenario's i-th removed line. */
function expected(i: number): string {
  const r = removalFor(i);
  const label = r.removal_reason === "line_not_in_file" ? "Line no longer in the file" : "File not served";
  return r.removal_detail ? `${label}: ${r.removal_detail}` : label;
}

const removedWindow = (page: Page) => page.locator("section", { hasText: "Removed lines" }).first();
const reasons = (page: Page) => page.locator("[data-removal-reason]");

async function expectWindow(page: Page, lines: MatchedSeatLine[]) {
  const w = removedWindow(page);
  // Still counted as removed: the window's count is every removed line.
  await expect(w.locator("div").first()).toHaveText(new RegExp(`Removed lines\\s*${lines.length}$`));
  // The window opens on its first lines; "Show all" opens every one
  // (David, 2026-11-02), each still saying why.
  if (lines.length > OPEN + SLACK) {
    await expect(w.locator("li")).toHaveCount(OPEN);
    await w.locator("[data-window-toggle]").click();
  }
  await expect(w.locator("li")).toHaveCount(lines.length);
  await expect(w.locator("[data-removal-reason]")).toHaveText(Array.from({ length: lines.length }, (_, i) => expected(i)));
}

test.describe("why a removed line was removed", () => {
  test("Overview, Removed tab: each removed line says why, and is still counted", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { removalReasons: true });
    await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
    await page.getByRole("tab", { name: "Removed", exact: true }).click();
    const first = mockDeveloperEvents("removed", 1).rows[0];
    const lines = first.removed_lines ?? [];
    expect(lines.length).toBeGreaterThan(1);
    const name = first.developer_name || first.developer_domain!;
    await page.getByRole("button", { name: `Show the seat lines of ${name}`, exact: true }).first().click();
    await expectWindow(page, lines);
    expect(errors).toEqual([]);
  });

  test("Overview, All matched: a publisher row's expanded removed lines say why", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { removalReasons: true });
    await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
    const d = mockMatchedDevelopers(1).rows.find((r) => (r.removed_lines ?? []).length > 1)!;
    expect(d).toBeTruthy();
    await page.getByRole("textbox", { name: "Search matched publishers" }).fill(d.domain!);
    await page.getByRole("button", { name: `Show the seat lines of ${d.name || d.domain}`, exact: true }).click();
    await expectWindow(page, d.removed_lines!);
    expect(errors).toEqual([]);
  });

  test("a report frozen before the field says nothing about why", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, {});
    await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
    await page.getByRole("tab", { name: "Removed", exact: true }).click();
    const first = mockDeveloperEvents("removed", 1).rows[0];
    const name = first.developer_name || first.developer_domain!;
    await page.getByRole("button", { name: `Show the seat lines of ${name}`, exact: true }).first().click();
    await expect(removedWindow(page).locator("li").first()).toBeVisible();
    await expect(reasons(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
