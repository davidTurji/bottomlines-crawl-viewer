/**
 * MATCH TYPE: own or IPD (crawler PR #348).
 *
 * Two halves. The CONTRACT tests read the fake API's answers (the mock the
 * fake serves) and pin the row shape the client destructures: per row
 * ``match_type``, ``ipd_partner``, ``ipd_platform``, ``declared_in`` and
 * the roles; per list ``match_type_counts`` and ``ipd_inconclusive``; and
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
import { inconclusiveSentence } from "../src/components/MatchType";
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
const pill = (page: Page, name: "All" | "Own" | "IPD") =>
  control(page).getByRole("button", { name, exact: true });
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

  test("the note's sentence, word for word, in each view's shape", () => {
    expect(APP_NOTE).toBe(
      "Not counted: 2 inconclusive IPD apps via northfold-tv.com, inventory partner of Tidewick TV. This crawl could not read northfold-tv.com's ads.txt.",
    );
    expect(PUBLISHER_NOTE).toBe(
      "Not counted: 1 inconclusive IPD publisher (Tidewick TV, via northfold-tv.com, its inventory partner). This crawl could not read northfold-tv.com's ads.txt.",
    );
    expect(
      inconclusiveSentence(
        { count: 3, examples: [...MT_INCONCLUSIVE, { partner: "example-b.tv", platform: "Platform B" }] },
        "apps",
      ),
    ).toBe(
      "Not counted: 3 inconclusive IPD apps via northfold-tv.com, inventory partner of Tidewick TV; example-b.tv, inventory partner of Platform B. This crawl could not read northfold-tv.com's ads.txt and example-b.tv's ads.txt.",
    );
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
        await expect(anyCard(page)).toBeVisible();
        await expect(control(page)).toHaveCount(0);
        await expect(page.locator("[data-ipd-chip], [data-ipd-where], [data-ipd-inconclusive]")).toHaveCount(0);
      }
      await page.getByRole("tab", { name: "All matched" }).click();
      // Row 1 is the tabs alone; row 2 the search and the count with the pager.
      const row = page.getByRole("tablist").first().locator("xpath=../../..");
      await expect(row).toHaveText(/^All matchedAddedRemovedChangedInactive$/);
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
    await expect(pill(page, "All")).toHaveAttribute("aria-pressed", "true");
    await expect(pill(page, "All")).toHaveAttribute("title", `${counts.all.toLocaleString()} matched`);
    await expect(pill(page, "Own")).toHaveAttribute("title", `${counts.own.toLocaleString()} own`);
    await expect(pill(page, "IPD")).toHaveAttribute("title", `${counts.ipd.toLocaleString()} IPD`);
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
    await pill(page, "IPD").click();
    await expect(pill(page, "IPD")).toHaveAttribute("aria-pressed", "true");
    await expect(card(page, "Samsung TV Plus")).toHaveCount(1);
    await expect(page.locator("[data-ipd-inconclusive]")).toHaveText(APP_NOTE);
    expect(calls.some((c) => c.path.endsWith("/matched-apps") && c.query.includes("match_type=ipd"))).toBe(true);

    // Never under Own; no chip there at all, and no note.
    await pill(page, "Own").click();
    await expect(pill(page, "Own")).toHaveAttribute("aria-pressed", "true");
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
    await pill(page, "IPD").click();
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
    await expect(page.locator("[data-row-roles]")).toContainText("Seller role:Reseller");
    // The lines open failarmy.tv's ads.txt, where they are.
    await expect(page.locator("a[href*='failarmy.tv/ads.txt']").first()).toBeAttached();
    await expect(page.locator("a[href*='samsungtvplus.com/ads.txt']")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("roles show where a row is expanded: seller role, managed by, partner inventory on, alert", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { matchType: true });
    await page.getByRole("textbox", { name: "Search matched publishers" }).fill("Northfold");
    const closed = page.getByRole("button", { name: "Show the seat lines of Northfold TV" });
    if (await closed.count()) await closed.click();
    const roles = page.locator("[data-row-roles]");
    await expect(roles).toContainText("Seller role:Reseller");
    await expect(roles).toContainText("Managed by:copperline-media.tv (GB)");
    await expect(roles).toContainText("Partner inventory on:Tidewick TV");
    // Each alert on its own line.
    await expect(page.locator("[data-row-alert]")).toHaveText([
      "Listed as DIRECT, but sellers.json names copperline-media.tv, not northfold-tv.com: treated as a reseller.",
      "Two managers for one country (GB): neither counts there.",
    ]);
    // An own row: no chip.
    await expect(page.locator("[data-ipd-chip]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("an IPD publisher under Added carries its partner line too", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, { matchType: true });
    await page.getByRole("tab", { name: "Added" }).click();
    await pill(page, "IPD").click();
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
    await pill(page, "Own").click();
    await page.getByRole("tab", { name: "Added" }).click();
    await expect(pill(page, "Own")).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => calls.some((c) => c.path.endsWith("/developer-events") && c.query.includes("match_type=own")))
      .toBe(true);
    await toApps(page);
    await expect(page.getByRole("tab", { name: "Added" })).toHaveAttribute("aria-selected", "true");
    await expect(pill(page, "Own")).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("tab", { name: "Inactive" }).click();
    await expect(control(page)).toHaveCount(0);
    await page.getByRole("tab", { name: "All matched" }).click();
    await expect(pill(page, "Own")).toHaveAttribute("aria-pressed", "true");
    await toPublishers(page);
    await expect(pill(page, "Own")).toHaveAttribute("aria-pressed", "true");
    expect(errors).toEqual([]);
  });

  test("a list that does not say how it splits drops the pills and the filter", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { matchType: true });
    await pill(page, "IPD").click();
    await expect(pill(page, "IPD")).toHaveAttribute("aria-pressed", "true");
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
    await expect(pill(page, "All")).toHaveAttribute("aria-pressed", "true");
    expect(errors).toEqual([]);
  });
});
