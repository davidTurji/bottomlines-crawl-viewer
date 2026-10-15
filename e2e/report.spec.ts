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

import { mockDiscoveredLinePlacements, mockDiscoveredLines, mockInactiveBlock } from "../src/lib/mockData";
import { PAGE_SIZE } from "../src/lib/paging";
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

  // 2026-10-15 (minute-ly.com): the rail asks for Sellers.json behind the
  // form, meets a 401, and kept that "no" past the sign-in, so a fresh
  // reader never saw the page. Only a reload showed it.
  test("signed out on a report with Sellers.json: the rail lists it after sign-in", async ({ page }) => {
    const calls = await open(page, { signedOut: true, sellers: "page" });
    await page.locator('input[autocomplete="username"]').fill("andres");
    await page.locator('input[type="password"]').fill("secret");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expectOverview(page);
    await expect(rail(page).getByRole("link", { name: "Sellers.json" })).toBeVisible();
    expect(calls.filter((c) => c.path.endsWith("/sellers-fix")).map((c) => c.status)).toContain(200);
  });

  test("the email's sign-in link: the rail lists Sellers.json after one press", async ({ page }) => {
    const errors = watchErrors(page);
    const signin = Buffer.from("andres:secret").toString("base64url");
    await open(page, { signedOut: true, sellers: "page" }, `#signin=${signin}`);
    await expect(page.locator('input[autocomplete="username"]')).toHaveValue("andres");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expectOverview(page);
    await expect(rail(page).getByRole("link", { name: "Sellers.json" })).toBeVisible();
    expect(errors).toEqual([]);
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

/* ── 2026-10-11: links everywhere ── */

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

/* ── 2026-10-14: Discovery checks each line against the customer's own sellers.json ── */

test.describe("discovery checks each line against your sellers.json", () => {
  /** A card by the line's identity, never by its text: a cert id cut short
   *  or with pasted HTML would otherwise match the clean line's card too. */
  const keyOf = (ssp: string, id: string, rel: string, cert: string) => [ssp, id, rel, cert].join("|");
  const card = (page: Page, key: string) => page.locator(`[data-discovered-line="${key}"]`);
  const cards = (page: Page) => page.locator("[data-discovered-line]");
  const WIDE = keyOf("madeupmedia.com", "1042318", "RESELLER", "4a7be0c1d9f23b58");
  const WIDE_KEY = { ssp_domain: "madeupmedia.com", publisher_id: "1042318", relationship: "RESELLER", cert_id: "4a7be0c1d9f23b58" };
  /** The mock's own answer for a line, so a test asserts what the API said. */
  const rowOf = (key: string) => mockDiscoveredLines({ page: 1, page_size: 500 }).rows.find((r) => keyOf(r.ssp_domain, r.publisher_id, r.relationship, r.cert_id) === key)!;
  /** New lines sort first, so a line may sit on a later page. */
  async function find(page: Page, key: string) {
    const pager = page.getByRole("navigation", { name: "Pages" }).first();
    for (let n = 2; n <= 8 && (await card(page, key).count()) === 0; n += 1) {
      const btn = pager.getByRole("button", { name: `Page ${n}`, exact: true });
      if ((await btn.count()) === 0) break;
      await btn.click();
      // Wait for the page to be the current one, never a fixed sleep.
      await expect(pager.getByRole("button", { name: `Page ${n}`, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(cards(page).first()).toBeVisible();
    }
    return card(page, key);
  }
  async function noTour(page: Page) {
    const no = page.getByRole("button", { name: "No thanks" });
    if (await no.isVisible().catch(() => false)) await no.click();
  }
  const showMenu = (page: Page) => page.getByRole("button", { name: "Show which lines" });
  /** Pick a Show option and wait for the list it asks for. */
  async function pick(page: Page, option: string, value: string) {
    await showMenu(page).click();
    const answered = page.waitForResponse((r) => r.url().includes("/discovered-lines?") && r.url().includes(`show=${value}`));
    await page.getByRole("menuitem", { name: option, exact: true }).click();
    await answered;
    await expect(cards(page).first()).toBeVisible();
  }

  test("says whether each seller ID is in your sellers.json, and the badge opens that page", async ({ page }) => {
    const errors = watchErrors(page);
    const calls = await open(page, { discovery: true, sellers: "page" }, "/discovery");
    await noTour(page);
    // The subtitle names the domains the report looked for, from the summary.
    await expect(page.locator("p", { hasText: "starts with your domain" })).toContainText("madeupmedia.com, madeupmedia.la");
    // The three stats; the sellers.json coverage is the Lines caption and nothing else.
    const kpi = page.locator('[data-tour="discovery-kpi"]');
    await expect(kpi.getByText("Across every publisher we scanned, against last week")).toBeVisible();
    // 2026-10-15 redesign: three separate cards, every week.
    await expect(kpi.getByText("New lines this week")).toBeVisible();
    await expect(kpi.getByText(/^\d+ in your sellers\.json \([\d,]+ sellers\), \d+ not(, [\d,]+ on your other domains)?$/)).toBeVisible();
    await expect(kpi.getByText("Unique publishers carrying them")).toBeVisible();
    await expect(kpi.getByText("Several of these lines, still one publisher")).toBeVisible();
    await expect(page.getByText(/in your sellers\.json \([\d,]+ sellers\), \d+ not/)).toHaveCount(1);

    // Not in the file: a warning badge, no words beside it.
    const unlisted = await find(page, keyOf("madeupmedia.com", "2884190", "DIRECT", "b1f4c72e5a08d9c3"));
    await expect(unlisted.getByRole("link", { name: "Not in your sellers.json" })).toBeVisible();
    // Needs fixing: the first issue's words, and how many more.
    const placeholder = await find(page, keyOf("madeupmedia.com", "XXXXXXXXXXX", "DIRECT", "4a7be0c1d9f23b5"));
    await expect(placeholder.getByRole("link", { name: "Needs fixing" })).toBeVisible();
    await expect(placeholder.getByText("The seller ID is a placeholder, not one of yours, and 1 more")).toBeVisible();
    // A seller the file types the other way is a fix, with the file's word for it.
    const mismatch = await find(page, keyOf("madeupmedia-ads.com", "cm41288", "RESELLER", "77d3b0e9c142a5fb"));
    await expect(mismatch.getByText("Your sellers.json lists this seller as PUBLISHER, the line says RESELLER")).toBeVisible();

    // In the file: the seller's name and type beside the badge, as the API said them.
    const wide = rowOf(WIDE);
    expect(wide.seller).toMatchObject({ status: "listed", seller_type: "INTERMEDIARY" });
    const c = await find(page, WIDE);
    const badge = c.getByRole("link", { name: "In your sellers.json" });
    await expect(badge).toBeVisible();
    await expect(c.getByText(`${(wide.seller as { name: string }).name}, intermediary`)).toBeVisible();
    // The badge opens the Sellers.json page; it never opens the card (no roster asked for).
    await badge.click();
    await expect(page).toHaveURL(new RegExp(`${BASE}/sellers$`));
    expect(calls.filter((x) => x.path.endsWith("/discovered-lines/placements"))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("without the Sellers.json page the badge is words, not a link", async ({ page }) => {
    await open(page, { discovery: true, sellers: "none" }, "/discovery");
    await noTour(page);
    const c = await find(page, WIDE);
    await expect(c.getByText("In your sellers.json", { exact: true })).toBeVisible();
    await expect(c.getByRole("link", { name: "In your sellers.json" })).toHaveCount(0);
    await expect(rail(page).getByRole("link", { name: "Sellers.json" })).toHaveCount(0);
  });

  test("the Show filter: in your file, not in it, needs fixing, DIRECT", async ({ page }) => {
    await open(page, { discovery: true }, "/discovery");
    await noTour(page);
    await pick(page, "In your sellers.json", "listed");
    await expect(cards(page).getByText("Not in your sellers.json")).toHaveCount(0);
    await expect(cards(page).getByText("In your sellers.json", { exact: true }).first()).toBeVisible();

    await pick(page, "Not in your sellers.json", "unlisted");
    await expect(cards(page).getByText("In your sellers.json", { exact: true })).toHaveCount(0);
    await expect(cards(page).getByText("Not in your sellers.json").first()).toBeVisible();

    await pick(page, "Needs fixing", "fixing");
    const fixing = await cards(page).count();
    expect(fixing).toBeGreaterThan(0);
    await expect(cards(page).getByText("Needs fixing", { exact: true })).toHaveCount(fixing);

    await pick(page, "DIRECT lines", "direct");
    await expect(cards(page).locator("code", { hasText: ", RESELLER" })).toHaveCount(0);
    await expect(cards(page).locator("code", { hasText: ", DIRECT" }).first()).toBeVisible();
  });

  test("the search narrows the lines by a publisher's domain, and the roster box starts with it", async ({ page }) => {
    const calls = await open(page, { discovery: true }, "/discovery");
    await noTour(page);
    const domain = mockDiscoveredLinePlacements(WIDE_KEY, { page: 1, page_size: 1 }).rows[0].developer_domain;
    const all = mockDiscoveredLines({ page: 1, page_size: 500 }).total;
    const narrowed = mockDiscoveredLines({ page: 1, page_size: 500, q: domain }).total;
    expect(narrowed).toBeGreaterThan(0);
    expect(narrowed).toBeLessThan(all);
    const answered = page.waitForResponse((r) => r.url().includes("/discovered-lines?") && r.url().includes(`q=${encodeURIComponent(domain)}`));
    await page.getByPlaceholder("Search seller IDs, publishers or apps").fill(domain);
    await answered;
    await expect(cards(page)).toHaveCount(Math.min(PAGE_SIZE, narrowed));
    // The wide line carries this publisher, so it is still listed; its
    // roster opens on the same search.
    const c = await find(page, WIDE);
    await c.getByRole("button", { expanded: false }).first().click();
    await expect(c.getByRole("textbox", { name: "Search the publishers and apps carrying this line" })).toHaveValue(domain);
    // A search shows every match (paged), not just the first three.
    const onLine = mockDiscoveredLinePlacements(WIDE_KEY, { page: 1, page_size: 500, q: domain }).total;
    await expect(c.locator("li.rounded-2xl")).toHaveCount(Math.min(onLine, 25));
    await expect(c.locator("li.rounded-2xl").first()).toBeVisible();
    expect(calls.some((x) => x.path.endsWith("/discovered-lines/placements") && x.query.includes(`q=${encodeURIComponent(domain)}`))).toBe(true);
  });

  test("a line opens on its first three publishers, then the whole roster in pages", async ({ page }) => {
    const calls = await open(page, { discovery: true }, "/discovery");
    await noTour(page);
    const wide = rowOf(WIDE);
    const c = await find(page, WIDE);
    await c.getByRole("button", { expanded: false }).first().click();
    await expect(c.getByText(`${wide.publishers_count} publishers, ${wide.placements_count} files`)).toBeVisible();
    await expect(c.locator("li.rounded-2xl")).toHaveCount(3);
    await expect(c.getByText(`${(wide.placements_count - 3).toLocaleString()} more publishers and apps carry this line`)).toBeVisible();
    await c.getByRole("button", { name: /^Show \d+ more$/ }).click();
    await expect(c.locator("li.rounded-2xl")).toHaveCount(25);
    await expect(c.getByText(/more publishers and apps carry this line/)).toHaveCount(0);
    await c.getByRole("navigation", { name: "Pages" }).first().getByRole("button", { name: "Page 2", exact: true }).click();
    await expect(c.locator("li.rounded-2xl")).toHaveCount(25);
    expect(calls.filter((x) => x.path.endsWith("/discovered-lines/placements") && /[?&]page=2(&|$)/.test(x.query))).toHaveLength(1);
  });

  test("the page exports every line as CSV", async ({ page }) => {
    await open(page, { discovery: true }, "/discovery");
    await noTour(page);
    await expect(cards(page).first()).toBeVisible();
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /^Export CSV$/ }).first().click(),
    ]);
    const body = await (await import("node:fs/promises")).readFile((await dl.path())!, "utf8");
    expect(body.charCodeAt(0)).toBe(0xfeff);
    const lines = body.slice(1).split("\r\n");
    expect(lines[0].startsWith('"ssp_domain","seller_id","relationship","cert_id","files_this_week"')).toBe(true);
    expect(lines.length - 1).toBe(mockDiscoveredLines({ page: 1, page_size: 1 }).totals.lines);
    expect(dl.suggestedFilename()).toMatch(/^discovery-lines-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test("a line exports every publisher carrying it as CSV", async ({ page }) => {
    await open(page, { discovery: true }, "/discovery");
    await noTour(page);
    const wide = rowOf(WIDE);
    const c = await find(page, WIDE);
    await c.getByRole("button", { expanded: false }).first().click();
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      c.getByRole("button", { name: "Export every publisher and app carrying this line as CSV" }).click(),
    ]);
    const body = await (await import("node:fs/promises")).readFile((await dl.path())!, "utf8");
    expect(body.charCodeAt(0)).toBe(0xfeff);
    const lines = body.slice(1).split("\r\n");
    expect(lines[0].startsWith('"ssp_domain","seller_id","relationship"')).toBe(true);
    expect(lines.length - 1).toBe(mockDiscoveredLinePlacements(WIDE_KEY, { page: 1, page_size: 500 }).total);
    expect(dl.suggestedFilename()).toMatch(/^discovery-.+\.csv$/);
    void wide;
  });

  test("a cut baseline says so, and nothing is new this week", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { discovery: true, discoveryApi: "baseline_cut" }, "/discovery");
    await noTour(page);
    await expect(page.getByText("Last week's list was cut short when that report was made, so there is nothing to compare this week")).toBeVisible();
    await expect(cards(page).first()).toBeVisible();
    await expect(page.getByText(/new this week/i)).toHaveCount(0);
    await expect(page.locator('[data-tour="discovery-kpi"]').getByText(/vs last week/)).toHaveCount(0);
    await expect(page.getByText("Last week", { exact: true })).toHaveCount(0);
    // The menu does not offer what the report cannot answer.
    await showMenu(page).click();
    await expect(page.getByRole("menuitem", { name: "New this week" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Needs fixing" })).toBeVisible();
    await page.keyboard.press("Escape");
    expect(errors).toEqual([]);
  });

  test("a first report says so, from the report's own word", async ({ page }) => {
    await open(page, { discovery: true, discoveryApi: "baseline_none" }, "/discovery");
    await expect(page.getByText("First report, no earlier week to compare")).toBeVisible();
    await expect(page.getByText(/new this week/i)).toHaveCount(0);
  });

  test("an older API with no last week to count says it could not be compared, never 'first report'", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { discovery: true, discoveryApi: "old_uncompared" }, "/discovery");
    await expect(page.getByText("Last week could not be compared")).toBeVisible();
    await expect(cards(page).first()).toBeVisible();
    await expect(page.getByText(/First report/)).toHaveCount(0);
    await expect(page.getByText(/new this week/i)).toHaveCount(0);
    // Such a report kept only the first 200 files of a wide line, and the
    // roster says so under a card that counts them all.
    await noTour(page);
    const wide = rowOf(WIDE);
    const c = await find(page, WIDE);
    await c.getByRole("button", { expanded: false }).first().click();
    await expect(c.getByText(`This report kept the first 200 of ${wide.placements_count.toLocaleString()} files for this line.`)).toBeVisible();
    await expect(c.getByText("197 more publishers and apps carry this line")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a publisher under a line opens their file at it", async ({ page }) => {
    await open(page, { discovery: true }, "/discovery");
    await noTour(page);
    const c = await find(page, WIDE);
    await c.getByRole("button", { expanded: false }).first().click();
    const link = c.locator('a[href*="#:~:text=madeupmedia.com"]').first();
    await expect(link).toHaveAttribute("href", /^https:\/\/[^/]+\/(app-)?ads\.txt#:~:text=madeupmedia\.com%2C-,1042318&text=1042318$/);
  });

  test("an API from before the marks still opens, counting listings honestly", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { discovery: true, discoveryApi: "old" }, "/discovery");
    await expect(page.getByText("Publisher listings")).toBeVisible();
    await expect(page.getByText("One per publisher file carrying a line")).toBeVisible();
    await expect(cards(page).first()).toBeVisible();
    // 2026-10-14: no "given by you / found" marks any more, and no
    // sellers.json verdict on an answer that carries none.
    await expect(cards(page).getByText(/sellers\.json|Needs fixing|Found by Path Finder|You gave us/)).toHaveCount(0);
    // The menu offers only what this answer can filter by: no sellers.json
    // pair without the file, and no "Needs fixing" on a report that never
    // checked its lines (an empty list would read as "nothing to fix").
    await showMenu(page).click();
    await expect(page.getByRole("menuitem", { name: "In your sellers.json" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Needs fixing" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "DIRECT lines" })).toBeVisible();
    await page.keyboard.press("Escape");
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
    const c = await find(page, keyOf("madeupmedia.la", "774061", "RESELLER", "9c02ea41b7d5f6a8"));
    await expect(c.getByText("new this week")).toHaveCount(0);
  });

  test("a line too wide to keep says so, not an error", async ({ page }) => {
    await open(page, { discovery: true, placements: "toolarge" }, "/discovery");
    await noTour(page);
    const first = cards(page).first();
    await first.getByRole("button", { expanded: false }).first().click();
    await expect(first.getByText("This line is on too many publishers to list here.", { exact: false })).toBeVisible();
    await expect(first.getByText("Could not load the publishers for this line.")).toHaveCount(0);
  });

  test("a dropped domain says the totals are not compared, never 'first report'", async ({ page }) => {
    await open(page, { discovery: true, discoveryApi: "scope_dropped" }, "/discovery");
    await expect(page.getByText("Your discovery domains changed since last week, so the totals are not compared")).toBeVisible();
    // 2026-10-14 wording: "First report, no earlier week to compare" (was "First crawl, no prior week to compare").
    await expect(page.getByText(/First (report|crawl)/)).toHaveCount(0);
  });

  test("a passing storage hiccup is an error, not 'too many publishers'", async ({ page }) => {
    await open(page, { discovery: true, placements: "hiccup" }, "/discovery");
    await noTour(page);
    const first = cards(page).first();
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
