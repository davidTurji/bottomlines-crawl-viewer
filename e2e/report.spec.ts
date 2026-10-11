/**
 * The report must open in every shape a real report comes in.
 *
 * Each test loads the production build against the fake API (fakeApi.ts)
 * with one part of the contract switched to an answer production really
 * gives. The guard that matters most: no answer from an OPTIONAL part of
 * the report (Sellers.json, Schain, Discovery, export info, last week) may
 * ever take the whole report down. 2026-10-06 a 404 from /sellers-fix did.
 */
import { expect, test, type Page } from "@playwright/test";

import { mockInactiveBlock } from "../src/lib/mockData";
import { installFakeApi, TOKEN, type Scenario } from "./fakeApi";

const EXPIRED = "This report link is not valid or has expired.";
/** The page error boundary's card: a page threw while rendering. */
const CRASHED = "This page could not be shown";
const BASE = `/crawl-report/${TOKEN}`;

/** Uncaught errors on the page; every test asserts there are none. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page, scenario: Scenario, path = "") {
  // The walkthrough would open over the page on a first visit.
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
  await page.goto(`${BASE}${path}`);
  return calls;
}

/** The report opened: its heading shows and nothing replaced it. */
async function expectOverview(page: Page) {
  await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
  await expect(page.getByText(EXPIRED)).toHaveCount(0);
  await expect(page.getByText("Could not load this report")).toHaveCount(0);
  await expect(page.getByText(CRASHED)).toHaveCount(0);
}

const rail = (page: Page) => page.locator('[data-tour="report-nav"]');

test.describe("the overview opens whatever the optional parts answer", () => {
  const cases: [string, Scenario][] = [
    ["full report, every optional page on", { sellers: "page", schain: "ok", discovery: true }],
    ["no Sellers.json page (404), the common case", { sellers: "none" }],
    ["Schain off", { schain: "none" }],
    ["Schain on with nothing to check", { schain: "no_sdks" }],
    ["nothing discovered", { discovery: false }],
    ["an API without export-info (404)", { exportInfo: "none" }],
    ["every optional part 404s at once", { sellers: "none", schain: "none", exportInfo: "none", discovery: false }],
    ["optional parts hiccup (503)", { sellers: "error", schain: "error" }],
    ["last week erased (503)", { previousWeek: "none" }],
    ["last week fails (500)", { previousWeek: "error" }],
    ["trial report", { trial: true }],
    ["a link frozen before the Inactive section", { inactive: "legacy" }],
    ["an API without the Inactive route (404)", { inactive: "missing" }],
    // The rule behind both outages: a 404 from ANY data call is never "this
    // link is dead". Here every optional route is missing, as on an older API.
    [
      "an older API without the optional routes (404)",
      { missing: ["discovered-lines", "schain", "sellers-fix", "export-info", "declarations"] },
    ],
  ];
  for (const [name, scenario] of cases) {
    test(name, async ({ page }) => {
      const errors = watchErrors(page);
      await open(page, scenario);
      await expectOverview(page);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("the rail lists only what the report has", () => {
  test("every optional page on", async ({ page }) => {
    await open(page, { sellers: "page", schain: "ok", discovery: true });
    await expectOverview(page);
    await expect(rail(page).getByRole("link", { name: "Sellers.json" })).toBeVisible();
    await expect(rail(page).getByRole("link", { name: "Schain" })).toBeVisible();
    await expect(rail(page).getByRole("link", { name: "Discovery" })).toBeVisible();
  });

  test("none of them", async ({ page }) => {
    await open(page, { sellers: "none", schain: "none", discovery: false });
    await expectOverview(page);
    await expect(rail(page).getByRole("link", { name: "Changes" })).toBeVisible();
    await expect(rail(page).getByRole("link", { name: "Declarations" })).toBeVisible();
    await expect(rail(page).getByRole("link", { name: "Sellers.json" })).toHaveCount(0);
    await expect(rail(page).getByRole("link", { name: "Schain" })).toHaveCount(0);
    await expect(rail(page).getByRole("link", { name: "Discovery" })).toHaveCount(0);
  });
});

test.describe("every page opens, with and without its optional data", () => {
  const pages = ["/changes", "/discovery", "/declarations", "/sellers", "/schain"];
  for (const scenario of [
    { sellers: "page", schain: "ok", discovery: true } as Scenario,
    { sellers: "none", schain: "none", discovery: false } as Scenario,
  ]) {
    for (const path of pages) {
      test(`${path} (${scenario.sellers === "page" ? "parts on" : "parts off"})`, async ({ page }) => {
        const errors = watchErrors(page);
        await open(page, scenario, path);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await expect(page.getByText(EXPIRED)).toHaveCount(0);
        await expect(page.getByText(CRASHED)).toHaveCount(0);
        expect(errors).toEqual([]);
      });
    }
  }

  test("Schain on an older snapshot: its parts 404, the report stays", async ({ page }) => {
    // The overview says "ok" but the sub-routes 404 when the snapshot's
    // schain version is older (viewer_schain._block).
    const errors = watchErrors(page);
    await open(page, { schain: "ok" }, "/schain");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(EXPIRED)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a direct link to Schain on a report without it says so", async ({ page }) => {
    await open(page, { schain: "none" }, "/schain");
    await expect(page.getByText("Schain is not part of this report yet.")).toBeVisible();
    await expect(page.getByText(CRASHED)).toHaveCount(0);
  });

  test("a direct link to Sellers.json on a report without it says so", async ({ page }) => {
    await open(page, { sellers: "none" }, "/sellers");
    await expect(page.getByText("Sellers.json suggestions are not part of this report yet.")).toBeVisible();
    await expect(page.getByText(EXPIRED)).toHaveCount(0);
  });
});

test.describe("sign-in", () => {
  test("signed out: the form, then the report", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { signedOut: true });
    await page.locator('input[autocomplete="username"]').fill("andres");
    await page.locator('input[type="password"]').fill("secret");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expectOverview(page);
    expect(errors).toEqual([]);
  });

  test("signed out on a report without Sellers.json: still opens after sign-in", async ({ page }) => {
    // The exact path of the 2026-10-06 outage.
    await open(page, { signedOut: true, sellers: "none", schain: "none" });
    await page.locator('input[autocomplete="username"]').fill("andres");
    await page.locator('input[type="password"]').fill("secret");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expectOverview(page);
  });

  test("still signed in when the link expires: the expired card, on every page", async ({ page }) => {
    // The API answers 403 on every data route for a session whose link
    // expired or was revoked. Before 2026-10-06 the reader saw "Could not
    // load this report" and the raw JSON instead.
    const errors = watchErrors(page);
    await open(page, { refusedWhileSignedIn: true });
    for (const path of ["", "/changes", "/discovery", "/declarations", "/sellers", "/schain"]) {
      if (path) await page.goto(`${BASE}${path}`);
      await expect(page.getByText(EXPIRED), path || "/").toBeVisible();
      await expect(page.getByText("Could not load this report")).toHaveCount(0);
      await expect(page.getByText(CRASHED)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test("a 403 from anything but the summary never shows the expired card", async ({ page }) => {
    // Some routes answer 403 for reasons that are not the link (schain
    // downloads on a trial). Only the summary's 403 means a dead link.
    const errors = watchErrors(page);
    await open(page, {
      sellers: "page",
      schain: "ok",
      forbidden: ["sellers-fix", "schain", "export-info", "discovered-lines", "declarations", "matched-developers"],
    });
    await expectOverview(page);
    expect(errors).toEqual([]);
  });

  test("an expired link shows the expired card at sign-in", async ({ page }) => {
    await open(page, { expired: true });
    await page.locator('input[autocomplete="username"]').fill("andres");
    await page.locator('input[type="password"]').fill("secret");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(EXPIRED)).toBeVisible();
  });
});


test.describe("the matched list", () => {
  test("the tab stays when switching between publishers and apps", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, {});
    await expectOverview(page);
    await page.getByRole("tab", { name: "Added" }).click();
    await expect(page.getByRole("tab", { name: "Added" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: /Matched apps/ }).click();
    await expect(page.getByRole("heading", { name: "Matched apps" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Added" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Removed" }).click();
    await page.getByRole("button", { name: /Matched publishers/ }).click();
    await expect(page.getByRole("heading", { name: "Matched publishers" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Removed" })).toHaveAttribute("aria-selected", "true");
    expect(errors).toEqual([]);
  });
});

test.describe("inactive", () => {
  const counts = mockInactiveBlock.counts;
  const section = (page: Page) => page.getByTestId("inactive-section");
  const sub = (page: Page, name: string) => section(page).getByRole("tab", { name: new RegExp(`^${name}`) });
  // The mock report compares the crawl of Aug 25 with the one of Aug 18.
  const SINCE = /since Aug 18, 2026/;

  test("the quiet line opens the Inactive tab, two lists of what went inactive between the two crawls", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, {});
    await expectOverview(page);
    const quiet = page.getByTestId("inactive-quiet");
    await expect(quiet).toContainText(
      `${counts.publishers} publishers and ${counts.apps} apps went inactive since Aug 18, 2026, not counted above.`,
    );
    await expect(quiet).not.toContainText("lines");
    await quiet.getByRole("button", { name: "See them" }).click();
    await expect(page.getByRole("tab", { name: "Inactive", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Inactive" })).toBeVisible();
    // Two lists, never a third.
    await expect(section(page).getByRole("tab")).toHaveCount(2);
    await expect(sub(page, "Lines")).toHaveCount(0);
    await expect(sub(page, "Publishers")).toHaveAttribute("aria-selected", "true");
    await expect(section(page).getByText(SINCE).first()).toBeVisible();
    await expect(section(page).getByRole("button", { name: /Show the seat lines of/ })).toHaveCount(counts.publishers);
    await expect(section(page).getByText("Quokkaplay Legacy")).toBeVisible();
    // The matched card, greyed: an Inactive chip and the strip on top.
    const strips = section(page).getByTestId("inactive-strip");
    await expect(strips).toHaveCount(counts.publishers);
    await expect(strips.filter({ hasText: "Inactive since Aug 25, 2026: The domain no longer exists" })).toHaveCount(1);
    await expect(section(page).getByText("Inactive", { exact: true })).toHaveCount(counts.publishers);
    await sub(page, "Apps").click();
    await expect(section(page).getByRole("button", { name: /Show the seat lines of/ })).toHaveCount(counts.apps);
    await expect(section(page).getByText("No longer on Google Play").first()).toBeVisible();
    await expect(section(page).getByText("publisher:").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("only what went inactive between the two compared crawls shows", async ({ page }) => {
    await open(page, {});
    await expectOverview(page);
    await page.getByRole("tab", { name: "Inactive", exact: true }).click();
    await expect(section(page).getByText("Quokkaplay Legacy")).toBeVisible();
    // Found dead by the compared crawl itself (Aug 18), and older: the
    // report before, never this one.
    for (const p of mockInactiveBlock.outside.publishers) {
      await expect(section(page).getByText(p.name ?? p.domain)).toHaveCount(0);
    }
    expect(mockInactiveBlock.outside.publishers.length).toBeGreaterThan(0);
    await sub(page, "Apps").click();
    await expect(section(page).getByText("Glintfox Runner")).toBeVisible();
    for (const a of mockInactiveBlock.outside.apps) {
      await expect(section(page).getByText(a.name ?? a.bundle)).toHaveCount(0);
    }
  });

  test("a row keeps its date, reason, evidence and what it carried", async ({ page }) => {
    await open(page, {});
    await expectOverview(page);
    await page.getByRole("tab", { name: "Inactive", exact: true }).click();
    await expect(section(page).getByText("Failed in 3 crawls in a row, from Aug 11, 2026 to Aug 25, 2026").first()).toBeVisible();
    await section(page).getByRole("button", { name: "Show the seat lines of Quokkaplay Legacy" }).click();
    await expect(section(page).getByText("Your seat lines it carried")).toBeVisible();
    await sub(page, "Apps").click();
    await expect(section(page).getByText("inactive too")).toHaveCount(1);
    await expect(section(page).getByText("still live").first()).toBeVisible();
    await expect(section(page).getByText("Checked in US, CA, the store answered 404")).toBeVisible();
    await section(page).getByRole("button", { name: "Show the seat lines of Glintfox Runner" }).click();
    await expect(section(page).getByText("Your seat lines its publisher carries")).toBeVisible();
  });

  test("an app card shows the lines its row carries, with no other call, and no lines list is ever asked for", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, {});
    await expectOverview(page);
    await page.getByRole("tab", { name: "Inactive", exact: true }).click();
    await sub(page, "Apps").click();
    const before = calls.length;
    for (const a of mockInactiveBlock.apps) {
      await section(page).getByRole("button", { name: `Show the seat lines of ${a.name}` }).click();
      // A closed card keeps its lines mounted (hidden): only the open one is visible.
      await expect(section(page).getByText("Your seat lines its publisher carries").filter({ visible: true })).toHaveCount(1);
      await expect(section(page).getByText(a.lines![0].publisher_id).filter({ visible: true }).first()).toBeVisible();
    }
    // The lines came on the rows: no line-events read for any card.
    expect(calls.slice(before).filter((c) => c.path.endsWith("/line-events"))).toEqual([]);
    await sub(page, "Publishers").click();
    await expect(section(page).getByText("Quokkaplay Legacy")).toBeVisible();
    const inactiveCalls = calls.filter((c) => c.path.endsWith("/inactive"));
    expect(inactiveCalls.length).toBeGreaterThan(0);
    for (const c of inactiveCalls) {
      expect(new URLSearchParams(c.query).get("kind")).toMatch(/^(publishers|apps)$/);
      expect(c.status).toBe(200);
    }
    expect(errors).toEqual([]);
  });

  test("the header says the two crawls the summary names", async ({ page }) => {
    await open(page, {});
    await expectOverview(page);
    await expect(page.getByText(/Week of Aug 25, 2026, compared with Aug 18, 2026\./)).toBeVisible();
  });

  test("without the summary's dates the window starts at last week's crawl", async ({ page }) => {
    await open(page, { crawlDates: false });
    await expectOverview(page);
    await expect(page.getByTestId("inactive-quiet")).toContainText("went inactive since Aug 18, 2026");
  });

  test("with no date for the compared crawl it says so in words", async ({ page }) => {
    await open(page, { crawlDates: false, previousWeek: "none" });
    await expectOverview(page);
    await expect(page.getByTestId("inactive-quiet")).toContainText("went inactive since the compared crawl, not counted above.");
    await page.getByTestId("inactive-quiet").getByRole("button", { name: "See them" }).click();
    await expect(section(page).getByText(/went inactive since the compared crawl/)).toBeVisible();
  });

  test("the main lists stay active only, and the open list survives a view switch", async ({ page }) => {
    await open(page, {});
    await expectOverview(page);
    await expect(page.getByText("Quokkaplay Legacy")).toHaveCount(0);
    await page.getByRole("tab", { name: "Inactive", exact: true }).click();
    await sub(page, "Apps").click();
    await page.getByRole("button", { name: /Matched publishers/ }).click();
    await expect(page.getByRole("tab", { name: "Inactive", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(sub(page, "Publishers")).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: /Matched apps/ }).click();
    await expect(sub(page, "Apps")).toHaveAttribute("aria-selected", "true");
  });

  test("search narrows a list", async ({ page }) => {
    await open(page, {});
    await expectOverview(page);
    await page.getByRole("tab", { name: "Inactive", exact: true }).click();
    const box = section(page).getByRole("textbox", { name: "Search inactive publishers" });
    await box.fill("tinplover");
    await expect(section(page).getByText("Tinplover Studio")).toBeVisible();
    await expect(section(page).getByText("Quokkaplay Legacy")).toHaveCount(0);
  });

  test("a trial shows three rows, the locked tail, and no publisher on apps", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { trial: true });
    await expectOverview(page);
    await page.getByRole("tab", { name: "Inactive", exact: true }).click();
    await sub(page, "Apps").click();
    await expect(section(page).getByRole("button", { name: /Show the seat lines of/ })).toHaveCount(3);
    await expect(section(page).getByText("publisher:")).toHaveCount(0);
    await expect(section(page).getByText(`${counts.apps - 3} more inactive apps are waiting in your full report.`)).toBeVisible();
    await expect(section(page).getByText(/every inactive publisher and app, with the date and the reason/)).toBeVisible();
    // One kept back is said in the singular.
    await sub(page, "Publishers").click();
    const hiddenPubs = counts.publishers - 3;
    const pubWords = hiddenPubs === 1 ? "inactive publisher is" : "inactive publishers are";
    await expect(section(page).getByText(`${hiddenPubs} more ${pubWords} waiting in your full report.`)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("one row is counted in the singular, and the publisher line has no blank before its comma", async ({ page }) => {
    await open(page, {});
    await expectOverview(page);
    await page.getByRole("tab", { name: "Inactive", exact: true }).click();
    await section(page).getByRole("textbox", { name: "Search inactive publishers" }).fill("Quokkaplay");
    await expect(section(page).getByText("1 inactive publisher", { exact: true })).toBeVisible();
    await sub(page, "Apps").click();
    await section(page).getByRole("textbox", { name: "Search inactive apps" }).fill("Glintfox");
    await expect(section(page).getByText("1 inactive app", { exact: true })).toBeVisible();
    // The domain link ends where its text ends: no hidden arrow holding a
    // blank between it and the comma after it.
    const link = section(page).getByRole("link", { name: "quokkaplay-legacy.com" });
    const text = link.locator("span").first();
    const [a, t] = await Promise.all([link.boundingBox(), text.boundingBox()]);
    expect(a && t && Math.round(a.x + a.width - (t.x + t.width))).toBe(0);
  });

  for (const [name, scenario] of [
    ["an older link: built from its No longer live block", { inactive: "legacy" }],
    ["an older API without the route (404): built from the summary", { inactive: "missing" }],
  ] as [string, Scenario][]) {
    test(name, async ({ page }) => {
      const errors = watchErrors(page);
      await open(page, scenario);
      await expectOverview(page);
      await expect(page.getByTestId("inactive-quiet")).toContainText("3 publishers and 5 apps went inactive since Aug 18, 2026");
      await page.getByRole("tab", { name: "Inactive", exact: true }).click();
      await expect(section(page).getByRole("tab")).toHaveCount(2);
      await expect(section(page).getByText("Quokkaplay Legacy")).toBeVisible();
      await sub(page, "Apps").click();
      await expect(section(page).getByText("Hex World War")).toBeVisible();
      await expect(page.getByText(EXPIRED)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test("a link with neither block has no tab and no line", async ({ page }) => {
    await open(page, { gone: false, inactive: "legacy" });
    await expectOverview(page);
    await expect(page.getByRole("tab", { name: "Inactive", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("inactive-quiet")).toHaveCount(0);
  });
});

/* ── 2026-10-11: links everywhere, Discovery says who brought each line ── */

test.describe("sellers.json links", () => {
  test("the file, every seller and every line link to their source", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { sellers: "page" }, "/sellers");
    const file = page.getByRole("link", { name: "madeupmedia.com/sellers.json", exact: true });
    await expect(file).toHaveAttribute("href", "https://madeupmedia.com/sellers.json");
    // Unseen sellers are a check, never a red verdict.
    await expect(page.getByRole("heading", { name: /Not seen, check first/ })).toBeVisible();
    await expect(page.getByText("Suggested removals")).toHaveCount(0);
    // Each "Show all" turns into "Show fewer" when clicked.
    while ((await page.getByRole("button", { name: /^Show all/ }).count()) > 0) {
      await page.getByRole("button", { name: /^Show all/ }).first().click();
    }

    // A seller publishers list: its ID opens the customer's file at it, and
    // each line opens the publisher's file at the line.
    const card = page.locator("#seller-300210");
    await expect(card.getByRole("link", { name: "300210", exact: true })).toHaveAttribute(
      "href",
      "https://madeupmedia.com/sellers.json#:~:text=%22300210%22",
    );
    await card.getByRole("button", { name: "Seller 300210, details" }).click();
    await expect(card.getByRole("link", { name: /Open madeupmedia\.com, 300210, RESELLER in fernhollow-team\.it\/ads\.txt/ })).toHaveAttribute(
      "href",
      /^https:\/\/fernhollow-team\.it\/ads\.txt#:~:text=madeupmedia\.com%2C-,300210&text=300210$/,
    );
    await expect(card.getByRole("link", { name: "fernhollow-team.it", exact: true })).toHaveAttribute("href", "https://fernhollow-team.it");
    await expect(card.getByRole("link", { name: "emberquay-news.com/app-ads.txt" })).toHaveAttribute(
      "href",
      /^https:\/\/emberquay-news\.com\/app-ads\.txt#:~:text=/,
    );
    expect(errors).toEqual([]);
  });

  test("every closed row shows the link its problem points to, before any hover", async ({ page }) => {
    await open(page, { sellers: "page" }, "/sellers");
    while ((await page.getByRole("button", { name: /^Show all/ }).count()) > 0) {
      await page.getByRole("button", { name: /^Show all/ }).first().click();
    }
    // Not seen: the seller's own files, where a line naming the customer would be.
    const unseen = page.locator("#seller-400105");
    await expect(unseen.getByRole("link", { name: "fogharbor-news7.com/ads.txt" })).toHaveAttribute(
      "href",
      /^https:\/\/fogharbor-news7\.com\/ads\.txt#:~:text=madeupmedia\.com%2C-,400105&text=400105$/,
    );
    await expect(unseen.getByRole("link", { name: "fogharbor-news7.com/app-ads.txt" })).toBeVisible();
    // Fix that rests on publishers: the customer's entry and a publisher's file.
    const fix = page.locator("#seller-300210");
    await expect(fix.getByRole("link", { name: "your sellers.json at 300210" })).toBeVisible();
    await expect(fix.getByRole("link", { name: /^fernhollow-team\.it\/ads\.txt/ })).toBeVisible();
    // Shown, not only on hover: underlined in the brand ink.
    await expect(fix.getByRole("link", { name: "your sellers.json at 300210" })).toHaveCSS("text-decoration-line", "underline");
  });

  test("an unseen seller links its own files, to check by eye", async ({ page }) => {
    await open(page, { sellers: "page" }, "/sellers");
    const group = page.locator("section", { has: page.getByRole("heading", { name: /Not seen, check first/ }) });
    const first = group.locator('[id^="seller-"]').first();
    const id = (await first.getAttribute("id"))!.replace("seller-", "");
    await first.getByRole("button", { name: `Seller ${id}, details` }).click();
    await expect(first.getByText("Check it yourself:")).toBeVisible();
    await expect(first.getByRole("link", { name: `madeupmedia.com/sellers.json at ${id}` })).toBeVisible();
    await expect(first.getByRole("link", { name: /\/ads\.txt$/ }).first()).toHaveAttribute("href", /^https:\/\/[^/]+\/ads\.txt/);
  });
});

test.describe("discovery says who brought each line", () => {
  const card = (page: Page, line: string) => page.locator("div.rounded-3xl", { hasText: line });
  /** New lines sort first, so a line may sit on a later page. */
  async function find(page: Page, line: string) {
    const pager = page.getByRole("navigation", { name: "Pages" }).first();
    for (let n = 2; n <= 8 && (await card(page, line).count()) === 0; n += 1) {
      const btn = pager.getByRole("button", { name: `Page ${n}`, exact: true });
      if ((await btn.count()) === 0) break;
      await btn.click();
      // Wait for the page to be the current one, never a fixed sleep.
      await expect(pager.getByRole("button", { name: `Page ${n}`, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(page.locator("div.rounded-3xl").first()).toBeVisible();
    }
    return card(page, line);
  }
  async function noTour(page: Page) {
    const no = page.getByRole("button", { name: "No thanks" });
    if (await no.isVisible().catch(() => false)) await no.click();
  }

  test("lines they gave us and lines we found, apart and counted", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { discovery: true }, "/discovery");
    // The three cards as they always were; who brought the lines is the
    // middle card's caption.
    const kpi = page.locator('[data-tour="discovery-kpi"]');
    await expect(kpi.getByText(/\d+ given by you, \d+ found automatically by Path Finder/)).toBeVisible();
    await expect(kpi.getByText("Lines with your domain")).toBeVisible();
    await expect(page.getByText("With a line naming your domain, each counted once")).toBeVisible();
    await noTour(page);
    await expect((await find(page, "madeupmedia.com, 2884190, DIRECT")).getByText("You gave us this seller ID as RESELLER")).toBeVisible();
    const pager = page.getByRole("navigation", { name: "Pages" }).first();
    await pager.getByRole("button", { name: "Page 1", exact: true }).click();
    await expect(pager.getByRole("button", { name: "Page 1", exact: true })).toHaveAttribute("aria-current", "page");
    await expect((await find(page, "madeupmedia.la, 618402, RESELLER")).getByText(/In your list since 16 Sept? 2026/)).toBeVisible();

    // Only what they gave us.
    await page.getByRole("button", { name: "Show lines by who brought them" }).click();
    await page.getByRole("menuitem", { name: "You gave us" }).click();
    const given = card(page, "madeupmedia.com, 1042318, RESELLER");
    await expect(given.getByText("You gave us", { exact: true })).toBeVisible();
    await expect(given.getByText("From your sellers.json, 30 Aug 2026")).toBeVisible();
    await expect(card(page, "madeupmedia.com, 3390514, RESELLER").getByText("You added it by hand, 4 Sept 2026")).toBeVisible();
    const pills = page.locator("div.rounded-3xl").getByText(/^(You gave us|Found by Path Finder)$/);
    await expect(pills.first()).toHaveText("You gave us");
    expect(new Set(await pills.allTextContents())).toEqual(new Set(["You gave us"]));
    expect(errors).toEqual([]);
  });

  test("a publisher under a line opens their file at it", async ({ page }) => {
    await open(page, { discovery: true }, "/discovery");
    await noTour(page);
    const c = await find(page, "madeupmedia.com, 1042318, RESELLER");
    await c.getByRole("button", { expanded: false }).first().click();
    const link = c.locator('a[href*="#:~:text=madeupmedia.com"]').first();
    await expect(link).toHaveAttribute("href", /^https:\/\/[^/]+\/(app-)?ads\.txt#:~:text=madeupmedia\.com%2C-,1042318&text=1042318$/);
  });

  test("an API from before the marks still opens, counting listings honestly", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { discovery: true, discoveryApi: "old" }, "/discovery");
    await expect(page.getByText("Publisher listings")).toBeVisible();
    await expect(page.getByText("One per publisher file carrying a line")).toBeVisible();
    await expect(page.locator('[data-tour="discovery-kpi"]').getByText(/you gave us/i)).toHaveCount(0);
    // The browser marks lines from the summary's watchlist instead.
    await expect(page.locator("div.rounded-3xl").getByText("Found by Path Finder").first()).toBeVisible();
    await expect(page.getByText(CRASHED)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a week that did not watch the domain is not compared with zero", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { discovery: true, discoveryApi: "unwatched" }, "/discovery");
    await expect(page.getByText("No lines carried this domain last week, so there is nothing to compare")).toBeVisible();
    await expect(page.locator('[data-tour="discovery-kpi"]').getByText(/vs last week/)).toHaveCount(0);
    await expect(page.getByText("new this week")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a new report names the domain last week did not watch, and its lines are not new", async ({ page }) => {
    await open(page, { discovery: true, discoveryApi: "unwatched_new" }, "/discovery");
    await noTour(page);
    await expect(page.getByText("Last week's report did not watch madeupmedia.la, so the totals are not compared")).toBeVisible();
    const c = await find(page, "madeupmedia.la, 774061, RESELLER");
    await expect(c.getByText("new this week")).toHaveCount(0);
  });

  test("a line too wide to keep says so, not an error", async ({ page }) => {
    await open(page, { discovery: true, placements: "toolarge" }, "/discovery");
    await noTour(page);
    // The widest line has no embedded roster in the mock, so it asks.
    const first = page.locator("div.rounded-3xl").first();
    await first.getByRole("button", { expanded: false }).first().click();
    await expect(first.getByText("This line is on too many publishers to list here.", { exact: false })).toBeVisible();
    await expect(first.getByText("Could not load the publishers for this line.")).toHaveCount(0);
  });

  test("the Show filter never outlives its control", async ({ page }) => {
    await open(page, { discovery: true, discoveryApi: "cut" }, "/discovery");
    await noTour(page);
    const show = page.getByRole("button", { name: "Show lines by who brought them" });
    // A cut list: no split, so no Show control.
    await expect(show).toHaveCount(0);
    await expect(page.getByText(/The list below shows the/)).toBeVisible();
    // Under an SSP filter the split comes back: pick "You gave us".
    await page.getByPlaceholder("Filter by SSP domain").fill("madeupmedia.com");
    await expect(show).toBeVisible();
    await show.click();
    await page.getByRole("menuitem", { name: "You gave us" }).click();
    await expect(page.locator("div.rounded-3xl").getByText("Found by Path Finder")).toHaveCount(0);
    // Clear it: the split goes, and the list must not stay filtered by a
    // control that is no longer there.
    await page.getByPlaceholder("Filter by SSP domain").fill("");
    await expect(show).toHaveCount(0);
    await expect(page.locator("div.rounded-3xl").getByText("Found by Path Finder").first()).toBeVisible();
  });

  test("a dropped domain says the totals are not compared, never 'first crawl'", async ({ page }) => {
    await open(page, { discovery: true, discoveryApi: "scope_dropped" }, "/discovery");
    await expect(page.getByText("Your discovery domains changed since last week, so the totals are not compared")).toBeVisible();
    await expect(page.getByText("First crawl, no prior week to compare")).toHaveCount(0);
  });

  test("a passing storage hiccup is an error, not 'too many publishers'", async ({ page }) => {
    await open(page, { discovery: true, placements: "hiccup" }, "/discovery");
    await noTour(page);
    const first = page.locator("div.rounded-3xl").first();
    await first.getByRole("button", { expanded: false }).first().click();
    await expect(first.getByText("Could not load the publishers for this line.")).toBeVisible();
    await expect(first.getByText(/too many publishers/)).toHaveCount(0);
  });
});

test.describe("a seller seen only in its own file", () => {
  test("is seen, never told to change its type, and says where it was seen", async ({ page }) => {
    await open(page, { sellers: "page" }, "/sellers");
    while ((await page.getByRole("button", { name: /^Show all/ }).count()) > 0) {
      await page.getByRole("button", { name: /^Show all/ }).first().click();
    }
    // An ad network writing DIRECT on its own site: nothing to fix, not
    // "not seen", and never "maybe PUBLISHER".
    await expect(page.locator("#seller-400150")).toHaveCount(0);
    // A seller with a written-wrong name: a fix for the name only.
    const row = page.locator("#seller-400160");
    await expect(row).toBeVisible();
    await expect(row.getByText(/seller_type/)).toHaveCount(0);
    await row.getByRole("button", { name: "Seller 400160, details" }).click();
    await expect(row.getByText(/in the seller's own file on/)).toBeVisible();
    await expect(row.getByText(/The name has spaces around it/).first()).toBeVisible();
  });
});
