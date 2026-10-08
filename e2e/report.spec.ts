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

  test("the quiet line opens the Inactive tab, three lists with date and reason", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, {});
    await expectOverview(page);
    const quiet = page.getByTestId("inactive-quiet");
    await expect(quiet).toContainText(
      `Plus ${counts.publishers} inactive publishers, ${counts.apps} inactive apps and ${counts.lines} inactive lines, not counted above.`,
    );
    await quiet.getByRole("button", { name: "See them" }).click();
    await expect(page.getByRole("tab", { name: "Inactive", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Inactive" })).toBeVisible();
    await expect(sub(page, "Publishers")).toHaveAttribute("aria-selected", "true");
    await expect(section(page).getByText("Quokkaplay Legacy")).toBeVisible();
    await expect(section(page).getByText("The domain no longer exists").first()).toBeVisible();
    await expect(section(page).getByText("Inactive since", { exact: true }).first()).toBeVisible();
    await sub(page, "Apps").click();
    await expect(section(page).getByText("No longer on Google Play").first()).toBeVisible();
    await expect(section(page).getByText("Retired by our team").first()).toBeVisible();
    await sub(page, "Lines").click();
    await expect(section(page).getByText("The publisher removed this line from its file").first()).toBeVisible();
    // 35 lines: the list pages like every other list.
    await expect(section(page).getByText(`of ${counts.lines} inactive lines`).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the main lists stay active only, and the open list survives a view switch", async ({ page }) => {
    await open(page, {});
    await expectOverview(page);
    await expect(page.getByText("Quokkaplay Legacy")).toHaveCount(0);
    await page.getByRole("tab", { name: "Inactive", exact: true }).click();
    await sub(page, "Lines").click();
    await page.getByRole("button", { name: /Matched apps/ }).click();
    await expect(page.getByRole("tab", { name: "Inactive", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(sub(page, "Lines")).toHaveAttribute("aria-selected", "true");
    await sub(page, "Publishers").click();
    await page.getByRole("button", { name: /Matched publishers/ }).click();
    await expect(sub(page, "Publishers")).toHaveAttribute("aria-selected", "true");
  });

  test("search narrows a list", async ({ page }) => {
    await open(page, {});
    await expectOverview(page);
    await page.getByRole("tab", { name: "Inactive", exact: true }).click();
    await section(page).getByRole("textbox", { name: "Search inactive publishers" }).fill("tinplover");
    await expect(section(page).getByText("Tinplover Studio")).toBeVisible();
    await expect(section(page).getByText("Quokkaplay Legacy")).toHaveCount(0);
  });

  test("a trial shows three rows, the locked tail, and no publisher on apps", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { trial: true });
    await expectOverview(page);
    await page.getByRole("tab", { name: "Inactive", exact: true }).click();
    await sub(page, "Apps").click();
    await expect(section(page).getByRole("button", { name: /Show details of/ })).toHaveCount(3);
    await expect(section(page).getByText("publisher:")).toHaveCount(0);
    await expect(section(page).getByText(`${counts.apps - 3} more inactive apps are waiting in your full report.`)).toBeVisible();
    expect(errors).toEqual([]);
  });

  for (const [name, scenario] of [
    ["an older link: built from its No longer live block", { inactive: "legacy" }],
    ["an older API without the route (404): built from the summary", { inactive: "missing" }],
  ] as [string, Scenario][]) {
    test(name, async ({ page }) => {
      const errors = watchErrors(page);
      await open(page, scenario);
      await expectOverview(page);
      await expect(page.getByTestId("inactive-quiet")).toContainText("Plus 3 inactive publishers and 5 inactive apps");
      await page.getByRole("tab", { name: "Inactive", exact: true }).click();
      await expect(section(page).getByText("Quokkaplay Legacy")).toBeVisible();
      await sub(page, "Lines").click();
      await expect(section(page).getByText("This report was made before ended lines were kept.")).toBeVisible();
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
