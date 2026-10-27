/**
 * THE LIST'S CONTROLS AT 390 PX (demo of #75, 2026-10-27):
 *
 *   - Found in, Match type and Platform: the label above the pills, every
 *     pill as wide as its own label and count, none overlapping another,
 *     no count cut off, the thumb under the chosen pill.
 *   - The status tabs: every one of them in sight and clickable (they wrap
 *     onto a second row rather than scroll out of view unannounced).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

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

/** One switch at a phone's width: its geometry, read in the page. */
async function layout(control: Locator) {
  return control.evaluate((root) => {
    const label = root.querySelector("span[id$='-label']")!.getBoundingClientRect();
    const group = root.querySelector("[role=group]")!;
    const track = group.getBoundingClientRect();
    const buttons = [...group.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect();
      const count = b.querySelector("[data-split-count]") as HTMLElement | null;
      const c = count?.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        on: b.getAttribute("aria-pressed") === "true",
        // The count inside its own pill, never under the next one.
        countInside: c ? c.left >= r.left - 0.5 && c.right <= r.right + 0.5 : true,
        clipped: b.scrollWidth > b.clientWidth + 1 || (count ? count.scrollWidth > count.clientWidth + 1 : false),
      };
    });
    const thumbEl = group.querySelector("[data-split-thumb], [data-match-type-thumb]") as HTMLElement | null;
    const thumb = thumbEl?.getBoundingClientRect();
    return { labelAbove: label.bottom <= track.top + 0.5, buttons, thumb: thumb ? { left: thumb.left, right: thumb.right } : null };
  });
}

/** Waits for the thumb to come to rest under the chosen pill. */
async function settledLayout(control: Locator) {
  await expect
    .poll(async () => {
      const out = await layout(control);
      const on = out.buttons.find((b) => b.on);
      return on && out.thumb ? Math.abs(out.thumb.left - on.left) <= 1 && Math.abs(out.thumb.right - on.right) <= 1 : false;
    })
    .toBe(true);
  return layout(control);
}

function expectClean(where: string, out: Awaited<ReturnType<typeof layout>>) {
  expect(out.labelAbove, `${where}: label above the pills`).toBe(true);
  for (let i = 1; i < out.buttons.length; i++)
    expect(out.buttons[i].left, `${where}: pill ${i + 1} overlaps pill ${i}`).toBeGreaterThanOrEqual(out.buttons[i - 1].right - 0.5);
  for (const [i, b] of out.buttons.entries()) {
    expect(b.countInside, `${where}: pill ${i + 1}'s count inside it`).toBe(true);
    expect(b.clipped, `${where}: pill ${i + 1} clipped`).toBe(false);
  }
  const on = out.buttons.find((b) => b.on)!;
  expect(out.thumb, `${where}: thumb`).not.toBeNull();
  expect(Math.abs(out.thumb!.left - on.left), `${where}: thumb under the chosen pill`).toBeLessThanOrEqual(1);
  expect(Math.abs(out.thumb!.right - on.right), `${where}: thumb as wide as the chosen pill`).toBeLessThanOrEqual(1);
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
  await expect(foundIn).toBeVisible();
  expectClean("Found in", await settledLayout(foundIn));
  // The widest choice chosen: still clean, the thumb on it.
  await foundIn.getByRole("button", { name: /^Both/ }).click();
  await expect(foundIn.getByRole("button", { name: /^Both/ })).toHaveAttribute("aria-pressed", "true");
  expectClean("Found in, Both", await settledLayout(foundIn));
  expect((await layout(page.getByTestId("match-type"))).labelAbove).toBe(true);
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
  await expect(platform).toBeVisible();
  expectClean("Platform", await settledLayout(platform));
  await platform.getByRole("button", { name: /^Mobile/ }).click();
  await expect(platform.getByRole("button", { name: /^Mobile/ })).toHaveAttribute("aria-pressed", "true");
  expectClean("Platform, Mobile", await settledLayout(platform));
  expect(errors).toEqual([]);
});

test("every status tab is in sight and clickable, on both lists", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, WATCH);
  for (const view of ["publishers", "apps"] as const) {
    if (view === "apps") await page.getByRole("button", { name: /Matched apps/ }).first().click();
    const tabs = page.getByRole("tablist").first().getByRole("tab");
    await expect(tabs.first()).toBeVisible();
    const names = await tabs.allInnerTexts();
    expect(names, view).toEqual(expect.arrayContaining(["All matched", "Added", "Removed", "Changed", "Started watching", "Stopped watching", "Unconfirmed"]));
    for (const name of names) {
      const t = page.getByRole("tab", { name, exact: true }).first();
      const box = (await t.boundingBox())!;
      // In sight without scrolling sideways: inside the screen's width.
      expect(box.x, `${view} / ${name}: left edge`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${view} / ${name}: right edge`).toBeLessThanOrEqual(390);
      await t.click({ trial: true });
      await t.click();
      await expect(t, `${view} / ${name}`).toHaveAttribute("aria-selected", "true");
    }
    await page.getByRole("tab", { name: "All matched", exact: true }).first().click();
  }
  // Never wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});
