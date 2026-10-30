import { selectStatus } from "./statusChoice";
import { chooseFilter } from "./filterChoice";
/**
 * MATCH TYPE: own or IPD (crawler PR #348).
 *
 * Two halves. The CONTRACT tests read the fake API's answers (the mock the
 * fake serves) and pin the row shape the client destructures: per row
 * ``match_type``, ``ipd_partner``, ``ipd_platform``, ``declared_in`` and
 * the roles (read for the type, shown nowhere on a matching page since
 * 2026-10-27); per list ``match_type_counts`` and ``ipd_inconclusive``; and
 * on a report frozen before them, none of those keys at all. The BROWSER
 * tests run the production build against the fake API: the owner's golden
 * scenario (the Samsung TV Plus app, matched through failarmy.tv, which
 * samsungtvplus.com's app-ads.txt names) and, above all, an old report
 * that must look exactly as it did (links are forever).
 */
import { expect, test, type Page } from "@playwright/test";

import {
  mockDeveloperEvents,
  mockMatchedApps,
  mockMatchedDevelopers,
  MT_INCONCLUSIVE,
  MT_PARTNER,
  MT_PLATFORM,
} from "../src/lib/mockData";
import type { MatchTypeFields } from "../src/lib/api";
import { PAGE_SIZE } from "../src/lib/paging";
import { inconclusiveItem, inconclusiveSentence } from "../src/components/MatchType";
import { installFakeApi, TOKEN, type Calls, type Scenario } from "./fakeApi";

const BASE = `/crawl-report/${TOKEN}`;
const CONTRACT_ROW_KEYS = [
  "match_type",
  "ipd_partner",
  "ipd_platform",
  "declared_in",
  "seller_role",
  "managed_by",
  "verdict_alerts",
] as const;
const CONTRACT_LIST_KEYS = ["match_type_counts", "ipd_inconclusive"] as const;
const APP_NOTE = inconclusiveSentence({ count: 2, examples: MT_INCONCLUSIVE }, "apps");
const PUBLISHER_NOTE = inconclusiveSentence({ count: 1, examples: MT_INCONCLUSIVE }, "publishers");
const APP_WHERE = `Via ${MT_PARTNER}, inventory partner of Samsung TV Plus`;
const PUBLISHER_WHERE = `Via ${MT_PARTNER}, inventory partner of this publisher`;

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

const control = (page: Page) => page.getByTestId("match-type");
const card = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp(`^(Show|Hide) the seat lines of ${name}$`) });
const anyCard = (page: Page) =>
  page.locator('button[aria-label^="Show the seat lines of"], button[aria-label^="Hide the seat lines of"]').first();
const toApps = async (page: Page) => {
  await page.getByRole("button", { name: /Matched apps/ }).click();
  await expect(page.getByRole("heading", { name: "Matched apps" })).toBeVisible();
};
const toPublishers = async (page: Page) => {
  await page.getByRole("button", { name: /Matched publishers/ }).click();
  await expect(page.getByRole("heading", { name: "Matched publishers" })).toBeVisible();
};

test.describe("the contract the client reads", () => {
  test("every matched row says own or ipd; every IPD row names its partner, platform and file", () => {
    for (const r of [
      ...mockMatchedDevelopers(1, "", [], "all").rows,
      ...mockMatchedApps(1, "", [], "all").rows,
      ...mockMatchedApps(2, "", [], "all").rows,
      ...mockDeveloperEvents("added", 1, [], "all").rows,
    ] as MatchTypeFields[]) {
      expect(["own", "ipd"]).toContain(r.match_type);
      if (r.match_type === "ipd") {
        expect(typeof r.ipd_partner).toBe("string");
        expect(typeof r.ipd_platform).toBe("string");
        expect(typeof r.declared_in).toBe("string");
      }
    }
  });

  test("every list says how it splits, and all = own + ipd", () => {
    for (const p of [
      mockMatchedDevelopers(1, "", [], "all"),
      mockMatchedApps(1, "", [], "all"),
      mockDeveloperEvents("removed", 1, [], "all"),
    ]) {
      const c = p.match_type_counts!;
      expect(Object.keys(c).sort()).toEqual(["all", "ipd", "own"]);
      expect(c.all).toBe(c.own + c.ipd);
      expect(p.total).toBe(c.all);
    }
    const apps = mockMatchedApps(1, "", [], "all");
    expect(apps.ipd_inconclusive).toEqual({ count: 2, examples: [{ partner: "northfold-tv.com", platform: "Tidewick TV" }] });
    expect(mockMatchedApps(1, "", [], "ipd").total).toBe(apps.match_type_counts!.ipd);
    expect(mockMatchedApps(1, "", [], "own").total).toBe(apps.match_type_counts!.own);
  });

  test("golden: the Samsung TV Plus app is an IPD match through failarmy.tv, under All and IPD, never Own", () => {
    const find = (rows: { bundle_id: string }[]) => rows.find((a) => a.bundle_id === MT_PLATFORM.bundle);
    const all = mockMatchedApps(1, "Samsung TV Plus", [], "all");
    const app = find(all.rows);
    expect(app).toMatchObject({
      app_name: "Samsung TV Plus",
      match_type: "ipd",
      ipd_partner: MT_PARTNER,
      ipd_platform: "Samsung TV Plus",
      declared_in: "Samsung TV Plus's app-ads.txt",
      file_host: MT_PARTNER,
      file_source: "inventory_partner",
    });
    expect(find(mockMatchedApps(1, "Samsung TV Plus", [], "ipd").rows)).toBeTruthy();
    expect(find(mockMatchedApps(1, "Samsung TV Plus", [], "own").rows)).toBeUndefined();
    // Counted in the one Matched number.
    const counts = mockMatchedApps(1, "", [], "all").match_type_counts!;
    expect(counts.all).toBe(counts.own + counts.ipd);
    expect(counts.ipd).toBeGreaterThan(0);
    // The inconclusive pair is only ever the note, never a row.
    for (const mt of ["all", "own", "ipd"] as const)
      for (const pg of [1, 2])
        for (const r of mockMatchedApps(pg, "", [], mt).rows) expect(r.ipd_partner).not.toBe("northfold-tv.com");
  });

  test("a report frozen before match types carries none of the keys", () => {
    const pages = [
      mockMatchedDevelopers(1, "", []),
      mockMatchedApps(1, "", []),
      mockDeveloperEvents("added", 1, []),
    ];
    for (const p of pages) {
      for (const k of CONTRACT_LIST_KEYS) expect(Object.keys(p)).not.toContain(k);
      for (const r of p.rows as object[])
        for (const k of [...CONTRACT_ROW_KEYS, "partner_inventory_on"]) expect(Object.keys(r)).not.toContain(k);
    }
  });

  test("the note's one short line, word for word, in each view's shape (David, 2026-10-27)", () => {
    expect(APP_NOTE).toBe(
      "2 apps could not be checked this week: their inventory partner northfold-tv.com's ads.txt could not be read.",
    );
    expect(PUBLISHER_NOTE).toBe(
      "1 publisher could not be checked this week: its inventory partner northfold-tv.com's ads.txt could not be read.",
    );
    // Several partners: the first named, the rest counted.
    expect(
      inconclusiveSentence(
        {
          count: 55,
          examples: [
            { partner: "gustotv.com", platform: "1015vibe.com" },
            { partner: "gustotv.com", platform: "b985.com" },
            { partner: "example-b.tv", platform: "Platform B" },
            { partner: "example-c.tv", platform: "Platform C" },
          ],
        },
        "publishers",
      ),
    ).toBe(
      "55 publishers could not be checked this week: their inventory partners' ads.txt files (gustotv.com and 2 more) could not be read.",
    );
    // No partner named at all: still one plain sentence, never a crash.
    expect(inconclusiveSentence({ count: 3, examples: [] }, "apps")).toBe(
      "3 apps could not be checked this week: their inventory partner's ads.txt could not be read.",
    );
    expect(
      inconclusiveSentence({ count: 2, examples: "garbage" as unknown as [] }, "publishers"),
    ).toBe("2 publishers could not be checked this week: their inventory partner's ads.txt could not be read.");
    // The list behind "Show them": publisher, via partner; on the apps view
    // the publisher whose apps they are.
    expect(inconclusiveItem({ partner: "gustotv.com", platform: "1015vibe.com" }, "publishers")).toBe(
      "1015vibe.com, via gustotv.com",
    );
    expect(inconclusiveItem({ partner: "gustotv.com", platform: "1015vibe.com" }, "apps")).toBe(
      "Apps of 1015vibe.com, via gustotv.com",
    );
    // Never "Not counted" jargon, never an em dash.
    for (const t of [APP_NOTE, PUBLISHER_NOTE]) {
      expect(t).not.toMatch(/Not counted|inconclusive|\u2014/);
    }
  });
});

test.describe("an old report shows nothing of this", () => {
  test("no Match type, no chip, no roles, no note, and no list is asked for a match type", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, {});
    for (const view of ["publishers", "apps"] as const) {
      if (view === "apps") await toApps(page);
      for (const tab of ["All matched", "Added", "Removed", "Changed"]) {
        await page.getByRole("tab", { name: tab }).click();
        await expect(page.locator('[role="tab"][aria-selected="true"]', { hasText: tab })).toBeVisible();
        if (view === "apps" && tab !== "All matched") {
          await expect(page.locator("[data-unsupported-app-change]")).toBeVisible();
          await expect(anyCard(page)).toHaveCount(0);
          await expect(page.getByRole("button", { name: "Download", exact: true })).toHaveCount(0);
        } else await expect(anyCard(page)).toBeVisible();
        await expect(control(page)).toHaveCount(0);
        await expect(page.locator("[data-ipd-chip], [data-ipd-where], [data-ipd-inconclusive]")).toHaveCount(0);
      }
      await page.getByRole("tab", { name: "All matched" }).click();
      // Row 1 is the tabs alone; row 2 the search and the count with the pager.
      const row = page.getByRole("tablist").first();
      await expect(row.getByRole("tab")).toHaveText(["All matched", "Added", "Removed", "Changed"]);
      await expect(page.locator("[data-list-count] p")).toHaveText(
        new RegExp(`^1–${PAGE_SIZE} of [\\d,]+ ${view}$`),
      );
      await expect(page.locator("[data-list-count]").getByRole("navigation", { name: "Pages" })).toBeVisible();
      // An expanded row has its lines and nothing above them.
      await page.locator('button[aria-label^="Show the seat lines of"]').first().click();
      await expect(page.locator("[data-line-text]").first()).toBeVisible();
      await expect(page.locator("[data-row-roles], [data-row-alert]")).toHaveCount(0);
    }
    expect(calls.filter((c) => c.query.includes("match_type"))).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe("match type on a report that has it", () => {
  test("golden: Samsung TV Plus under All and IPD with its chip and partner line, never under Own", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, { matchType: true });
    await toApps(page);
    const counts = mockMatchedApps(1, "", [], "all").match_type_counts!;
    // One row with the tabs: All / Own / IPD, counts in the tooltips.
    await expect(control(page)).toBeVisible();
    await expect(page.getByTestId("match-type")).toContainText("All");
    await control(page).click();
    await expect(page.getByRole("menuitem", { name: /^All/ })).toContainText(counts.all.toLocaleString());
    await expect(page.getByRole("menuitem", { name: /^Own/ })).toContainText(counts.own.toLocaleString());
    await expect(page.getByRole("menuitem", { name: /^IPD/ })).toContainText(counts.ipd.toLocaleString());
    await page.keyboard.press("Escape");
    // The one Matched number counts IPD too: the count on the search row.
    await expect(page.locator("[data-list-count] p")).toHaveText(`1–${PAGE_SIZE} of ${counts.all.toLocaleString()} apps`);

    // Under All (found by search: it is not on the first page).
    await page.getByRole("textbox", { name: "Search matched apps" }).fill("Samsung TV Plus");
    await expect(card(page, "Samsung TV Plus")).toHaveCount(1);
    const chip = page.locator("[data-ipd-chip]").first();
    await expect(chip).toHaveText("IPD");
    await expect(chip).toHaveAttribute("title", `${APP_WHERE}. Declared in Samsung TV Plus's app-ads.txt`);
    await expect(page.locator("[data-ipd-where]")).toHaveText([APP_WHERE]);
    // Credited from the partner's ads.txt, and the file line says so.
    await expect(page.locator("[data-app-file]")).toHaveText(["File: failarmy.tv's ads.txt"]);
    await expect(page.locator("[data-ipd-inconclusive]")).toHaveText(APP_NOTE);
    // One row: the count alone, no pager.
    await expect(page.locator("[data-list-count] p")).toHaveText("1 app");

    // Under IPD.
    await chooseFilter(page, "match-type", "IPD");
    await expect(page.getByTestId("match-type")).toContainText("IPD");
    await expect(card(page, "Samsung TV Plus")).toHaveCount(1);
    await expect(page.locator("[data-ipd-inconclusive]")).toHaveText(APP_NOTE);
    expect(calls.some((c) => c.path.endsWith("/matched-apps") && c.query.includes("match_type=ipd"))).toBe(true);

    // Never under Own; no chip there at all, and no note.
    await chooseFilter(page, "match-type", "Own");
    await expect(page.getByTestId("match-type")).toContainText("Own");
    await expect(card(page, "Samsung TV Plus")).toHaveCount(0);
    await page.getByRole("textbox", { name: "Search matched apps" }).fill("");
    await expect(anyCard(page)).toBeVisible();
    await expect(page.locator("[data-ipd-chip], [data-ipd-where], [data-ipd-inconclusive]")).toHaveCount(0);
    expect(calls.some((c) => c.path.endsWith("/matched-apps") && c.query.includes("match_type=own"))).toBe(true);
    // "All" is never sent: it is today's request.
    expect(calls.filter((c) => c.query.includes("match_type=all"))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("the IPD publisher row, its lines in the partner's ads.txt, and the note on publishers too", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { matchType: true });
    await chooseFilter(page, "match-type", "IPD");
    await expect(card(page, "Samsung TV Plus")).toHaveCount(1);
    await expect(page.locator("[data-ipd-where]")).toHaveText([PUBLISHER_WHERE]);
    await expect(page.locator("[data-ipd-chip]")).toHaveAttribute(
      "title",
      `${PUBLISHER_WHERE}. Declared in Samsung TV Plus's app-ads.txt`,
    );
    await expect(page.locator("[data-ipd-inconclusive]")).toHaveText(PUBLISHER_NOTE);
    await expect(page.locator("[data-list-count] p")).toHaveText("1 publisher");
    const closed = page.getByRole("button", { name: "Show the seat lines of Samsung TV Plus" });
    if (await closed.count()) await closed.click();
    // No sellers.json facts on a matching page (David, 2026-10-27).
    await expect(page.getByText(/Seller role|Managed by|Partner inventory on/)).toHaveCount(0);
    // The lines open failarmy.tv's ads.txt, where they are.
    await expect(page.locator("a[href*='failarmy.tv/ads.txt']").first()).toBeAttached();
    await expect(page.locator("a[href*='samsungtvplus.com/ads.txt']")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("no sellers.json facts on an expanded row: no seller role, managed by, partner inventory on or alert", async ({ page }) => {
    // Northfold TV carries all four in the fixtures (David, 2026-10-27:
    // "This page is all about matching and removing, nothing else").
    const errors = watchErrors(page);
    await open(page, { matchType: true, appChange: true });
    await page.getByRole("textbox", { name: "Search matched publishers" }).fill("Northfold");
    await expect(card(page, "Northfold TV")).toHaveCount(1);
    const closed = page.getByRole("button", { name: "Show the seat lines of Northfold TV" });
    if (await closed.count()) await closed.click();
    await expect(page.locator("[data-line-text]").first()).toBeVisible();
    await expect(page.getByText(/Seller role|Managed by|Partner inventory on|sellers\.json names/)).toHaveCount(0);
    await expect(page.locator("[data-row-roles], [data-row-alert]")).toHaveCount(0);
    // An own row: no chip.
    await expect(page.locator("[data-ipd-chip]")).toHaveCount(0);
    // Nor on the apps list, nor on any change tab.
    await toApps(page);
    await page.locator('button[aria-label^="Show the seat lines of"]').first().click();
    await expect(page.locator("[data-line-text]").first()).toBeVisible();
    await expect(page.getByText(/Seller role|Managed by|Partner inventory on/)).toHaveCount(0);
    await page.getByRole("tab", { name: "Added", exact: true }).click();
    await page.locator('button[aria-label^="Show the seat lines of"]').first().click();
    await expect(page.locator("[data-line-text]").first()).toBeVisible();
    await expect(page.getByText(/Seller role|Managed by|Partner inventory on/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("the inconclusive note: one quiet line, the names behind Show them, never counted", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { matchType: true });
    const note = page.locator("[data-ipd-inconclusive-note]");
    await expect(page.locator("[data-ipd-inconclusive]")).toHaveText(PUBLISHER_NOTE);
    await expect(page.locator("[data-ipd-inconclusive-list]")).toHaveCount(0);
    const show = note.getByRole("button", { name: "Show them" });
    await expect(show).toHaveAttribute("aria-expanded", "false");
    await show.click();
    const list = page.locator("[data-ipd-inconclusive-list]");
    await expect(list.locator("li")).toHaveText(
      MT_INCONCLUSIVE.map((e) => inconclusiveItem(e, "publishers")),
    );
    await note.getByRole("button", { name: "Hide them" }).click();
    await expect(list).toHaveCount(0);
    // The apps view, in its own words.
    await toApps(page);
    await expect(page.locator("[data-ipd-inconclusive]")).toHaveText(APP_NOTE);
    await page.locator("[data-ipd-inconclusive-note]").getByRole("button", { name: "Show them" }).click();
    await expect(page.locator("[data-ipd-inconclusive-list] li")).toHaveText(
      MT_INCONCLUSIVE.map((e) => inconclusiveItem(e, "apps")),
    );
    // Never part of a count: the list's count is the matched total.
    const counts = mockMatchedApps(1, "", [], "all").match_type_counts!;
    await expect(page.locator("[data-list-count] p")).toHaveText(`1–${PAGE_SIZE} of ${counts.all.toLocaleString()} apps`);
    expect(errors).toEqual([]);
  });

  test("an IPD publisher under Added carries its partner line too", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, { matchType: true });
    await page.getByRole("tab", { name: "Added" }).click();
    await chooseFilter(page, "match-type", "IPD");
    await expect(card(page, "Samsung TV Plus")).toHaveCount(1);
    await expect(page.locator("[data-ipd-chip]")).toHaveCount(1);
    await expect(page.locator("[data-ipd-where]")).toHaveText([PUBLISHER_WHERE]);
    await expect
      .poll(() => calls.some((c) => c.path.endsWith("/developer-events") && c.query.includes("match_type=ipd")))
      .toBe(true);
    expect(errors).toEqual([]);
  });

  test("match type stays across views and tabs, rides on Added, and hides on Inactive", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, { matchType: true });
    await chooseFilter(page, "match-type", "Own");
    await page.getByRole("tab", { name: "Added" }).click();
    await expect(page.getByTestId("match-type")).toContainText("Own");
    await expect
      .poll(() => calls.some((c) => c.path.endsWith("/developer-events") && c.query.includes("match_type=own")))
      .toBe(true);
    await toApps(page);
    await expect(page.getByRole("tab", { name: "Added" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("match-type")).toContainText("Own");
    await selectStatus(page, "Inactive");
    await expect(control(page)).toHaveCount(0);
    await page.getByRole("tab", { name: "All matched" }).click();
    await expect(page.getByTestId("match-type")).toContainText("Own");
    await toPublishers(page);
    await expect(page.getByTestId("match-type")).toContainText("Own");
    expect(errors).toEqual([]);
  });

  test("a list that does not say how it splits drops the pills and the filter", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { matchType: true });
    await chooseFilter(page, "match-type", "IPD");
    await expect(page.getByTestId("match-type")).toContainText("IPD");
    // This API's matched-apps answers in the old shape.
    await page.route("**/matched-apps?*", async (route) => {
      const url = new URL(route.request().url());
      const r = mockMatchedApps(Number(url.searchParams.get("page") ?? 1));
      await route.fulfill({ json: r });
    });
    await toApps(page);
    await expect(control(page)).toHaveCount(0);
    await expect(page.locator("[data-ipd-chip]")).toHaveCount(0);
    await toPublishers(page);
    await expect(page.getByTestId("match-type")).toContainText("All");
    expect(errors).toEqual([]);
  });
});

/*
 * ONE WAY TO WAIT (owner, 2026-10-27, replacing the dimmed swap of
 * 2026-10-26). Whenever a list waits for new rows (a tab, a match type, a
 * search, a page) it shows the same skeleton as the first load: never the
 * old rows dimmed, never the "..." dots, never the old count or pager. A
 * page already read lands at once. The one thumb still slides under the
 * chosen option; less motion asked for, it jumps.
 */
/** Holds every answer of one list route until `release` is called, so a
 *  test can see what the page shows while it waits. */
async function holdList(page: Page, glob: string) {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  await page.route(glob, async (route) => {
    await gate;
    await route.fallback();
  });
  return { release: () => open() };
}

const listSkeleton = (page: Page, noun: "publishers" | "apps") =>
  page.getByRole("status").filter({ hasText: `Loading matched ${noun}` });

test.describe("a list that waits shows the skeleton", () => {
  test("a tab switch: the skeleton in the rows' place, no old rows, no dots, no old count; then the new rows", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { matchType: true });
    await expect(anyCard(page)).toBeVisible();
    await expect(page.locator("[data-list-count] p")).toBeVisible();
    const held = await holdList(page, "**/developer-events?*");
    await page.getByRole("tab", { name: "Added" }).click();
    await expect(page.getByRole("tab", { name: "Added" })).toHaveAttribute("aria-selected", "true");
    // While it waits: the skeleton, and nothing of the old answer.
    await expect(listSkeleton(page, "publishers")).toBeVisible();
    await expect(anyCard(page)).toHaveCount(0);
    await expect(page.locator("[data-count-skeleton]")).toBeVisible();
    await expect(page.locator("[data-list-count] p")).toHaveCount(0);
    await expect(page.locator("[data-list-fade]")).toHaveCount(0);
    held.release();
    await expect(anyCard(page)).toBeVisible();
    await expect(listSkeleton(page, "publishers")).toHaveCount(0);
    await expect(page.locator("[data-count-skeleton]")).toHaveCount(0);
    await expect(page.locator("[data-list-count]")).toContainText("with changes");
    expect(errors).toEqual([]);
  });

  test("a match type switch on either list: the skeleton while it waits; the selected filter stays visible", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { matchType: true });
    for (const view of ["publishers", "apps"] as const) {
      if (view === "apps") await toApps(page);
      await expect(anyCard(page)).toBeVisible();
      const held = await holdList(page, view === "apps" ? "**/matched-apps?*" : "**/matched-developers?*");
      await chooseFilter(page, "match-type", "Own");
      await expect(page.getByTestId("match-type")).toContainText("Own");
      await expect(listSkeleton(page, view)).toBeVisible();
      await expect(anyCard(page)).toHaveCount(0);
      held.release();
      await expect(anyCard(page)).toBeVisible();
      await expect(listSkeleton(page, view)).toHaveCount(0);
      // Back to All: read before, so it lands at once (no skeleton needed).
      await chooseFilter(page, "match-type", "All");
      await expect(anyCard(page)).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("a search waits the same way, and never shows the old count", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { matchType: true });
    await expect(anyCard(page)).toBeVisible();
    const held = await holdList(page, "**/matched-developers?*");
    await page.getByRole("textbox", { name: "Search matched publishers" }).fill("Northfold");
    await expect(listSkeleton(page, "publishers")).toBeVisible();
    await expect(page.locator("[data-list-count] p")).toHaveCount(0);
    held.release();
    await expect(card(page, "Northfold TV")).toHaveCount(1);
    await expect(page.locator("[data-list-count] p")).toHaveText("1 publisher");
    expect(errors).toEqual([]);
  });

  test("filter menu supports keyboard selection and returns focus to its trigger", async ({ page }) => {
    await open(page, { matchType: true });
    const trigger = control(page);
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("menuitem").first().focus();
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", {name:/^IPD/})).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(trigger).toContainText("IPD");
    await expect(trigger).toBeFocused();
    await expect(card(page, "Samsung TV Plus")).toHaveCount(1);
  });
});

test.describe("less motion asked for", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("no thumb slide, no fade: the rows simply arrive", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { matchType: true });
    await expect(anyCard(page)).toBeVisible();
    await chooseFilter(page, "match-type", "IPD");
    await expect(card(page, "Samsung TV Plus")).toHaveCount(1);
    // The thumb is already there: nothing to wait for.
    // Never a fade over the rows: they simply replace each other.
    await expect(page.locator("[data-list-fade], [data-list-swap]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
