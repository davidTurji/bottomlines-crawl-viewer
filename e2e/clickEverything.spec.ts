/**
 * CLICK EVERYTHING (David, 2026-10-27, after a row's ``verdict_alerts``
 * arrived as one string instead of an array and opening it took the whole
 * Overview down on every report link).
 *
 * A reader who clicks everything: signs in, declines the tour, then on a
 * desktop and on a phone clicks every tab, every match type pill, every
 * expandable row on the first page of every list (matched publishers and
 * apps, Inactive, Changes, Discovery, Declarations, Sellers.json), the
 * lines filter, the search, the paging, "Show them", and the tour itself.
 * It fails on ANY page error, any console error naming a TypeError, a
 * ReferenceError, "is not a function" or "Cannot read", and any error
 * panel ("could not be shown").
 *
 * TWO MODES.
 *
 *   CI (every PR, blocks the merge): against the fake API, fed the
 *   crawler's REAL field shapes (fakeApi ``realShapes``: roles as
 *   "; "-joined strings, alerts as one " | "-joined string or "", the
 *   internal platform "ipd_partner", empty strings, one line per IPD
 *   partner), so a type assumption can never pass again.
 *
 *   Live smoke (``npm run smoke:live``): against a REAL link when
 *   VIEWER_SMOKE_BASE, VIEWER_SMOKE_TOKEN and VIEWER_SMOKE_SIGNIN are set.
 *   Read-only and light: one sign-in per viewport, clicks one after
 *   another, one worker, the export route blocked and Export never
 *   clicked. The token and the sign-in never reach the output.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { installFakeApi, TOKEN } from "./fakeApi";

const LIVE =
  process.env.VIEWER_SMOKE_BASE && process.env.VIEWER_SMOKE_TOKEN && process.env.VIEWER_SMOKE_SIGNIN
    ? {
        base: process.env.VIEWER_SMOKE_BASE.replace(/\/+$/, ""),
        token: process.env.VIEWER_SMOKE_TOKEN,
        signin: process.env.VIEWER_SMOKE_SIGNIN,
      }
    : null;

/** Never print the link's secrets. */
const redact = (t: string) =>
  LIVE ? t.split(LIVE.token).join("<TOKEN>").split(LIVE.signin).join("<SIGNIN>") : t;

const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  { name: "phone", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
] as const;

/** On a live link, the cards of the other pages (a Changes card reads its
 *  publishers, a Discovery line its placements) are opened a few per list,
 *  not all: light on the API, and done in minutes. Overview rows carry
 *  their lines and cost nothing to open, so every one is opened in both
 *  modes. */
const API_CARDS = LIVE ? 6 : Infinity;

const CRASH_CONSOLE = /TypeError|ReferenceError|is not a function|Cannot read/;
const ERROR_PANEL = /could not be shown|did not render/i;

type Run = {
  failures: string[];
  /** Rows (cards) opened, per list: the crawl really reached them. */
  opened: Record<string, number>;
  steps: number;
};

async function signIn(browser: Browser, vp: (typeof VIEWPORTS)[number]): Promise<{ ctx: BrowserContext; page: Page }> {
  // Less motion: the same pages and the same clicks, without waiting for
  // every row's ease to settle before the next click.
  const ctx = await browser.newContext({
    viewport: vp.viewport,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  // Read-only: the report's export is never fetched, whatever is clicked.
  await page.route(/\/export\.xlsx|\/export(\?|$)|\/schain\/export\./, (r) => r.abort());
  // The first-visit offer, declined whenever it shows.
  await page.addLocatorHandler(page.getByRole("button", { name: "No thanks", exact: true }), async (b) => {
    await b.click();
  });
  if (LIVE) {
    await page
      .goto(`${LIVE.base}/crawl-report/${LIVE.token}#signin=${LIVE.signin}`, { waitUntil: "domcontentloaded" })
      .catch((e: Error) => {
        throw new Error(redact(e.message));
      });
    const button = page.getByRole("button", { name: "Sign in", exact: true });
    const overview = page.getByRole("heading", { name: "Your weekly crawl" });
    // A link that signs in by itself lands on the report; otherwise the
    // form is filled from the link, and one click signs in.
    await expect(button.or(overview).first()).toBeVisible({ timeout: 60_000 });
    if (await button.isVisible().catch(() => false)) await button.click();
    await expect(overview).toBeVisible({ timeout: 120_000 });
  } else {
    await installFakeApi(page, {
      signedOut: true,
      matchType: true,
      realShapes: true,
      sellersReads: true,
      sellers: "page",
      schain: "ok",
      inactive: "ok",
      removalReasons: true,
      appChange: true,
      declaredHost: true,
      watchTabs: true,
    });
    await page.goto(`/crawl-report/${TOKEN}`);
    await page.locator("input[autocomplete=username]").fill("reader", { timeout: 3_000 });
    await page.locator("input[autocomplete=current-password]").fill("any-password", { timeout: 3_000 });
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
  }
  return { ctx, page };
}

async function crawl(page: Page, vp: string): Promise<Run> {
  const run: Run = { failures: [], opened: {}, steps: 0 };
  const t0 = Date.now();
  const lap = (what: string) => console.log(`${vp}: ${what} at ${Math.round((Date.now() - t0) / 1000)} s`);
  let where = "sign in";
  page.on("pageerror", (e) => run.failures.push(`${vp} / ${where}: page error: ${redact(e.message).slice(0, 300)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && CRASH_CONSOLE.test(m.text()))
      run.failures.push(`${vp} / ${where}: console: ${redact(m.text()).slice(0, 300)}`);
  });

  // Both checks are plain CSS lookups: a text or role scan of a page that
  // holds thousands of sellers.json rows takes minutes (live, 2026-10-27).
  /** The error panel (PageErrorBoundary's heading). */
  const panel = async () =>
    page
      .evaluate((re) => [...document.querySelectorAll("h2")].some((h) => new RegExp(re, "i").test(h.textContent ?? "")), ERROR_PANEL.source)
      .catch(() => false);
  /** Waits for every skeleton (aria-busy status) to go, quietly. */
  const settled = async () => {
    await page
      .locator('[role="status"][aria-busy="true"]')
      .first()
      .waitFor({ state: "detached", timeout: 30_000 })
      .catch(() => {});
  };
  const step = async (name: string, fn: () => Promise<unknown>) => {
    // The first crash ends the walk: it is the answer, and every click
    // after it would only wait on a page that is gone.
    if (run.failures.length) return;
    where = name;
    run.steps++;
    const t = Date.now();
    try {
      await fn();
    } catch (e) {
      // A control this report does not have is not a crash; what the
      // crash checks catch is.
      if (process.env.SMOKE_DEBUG) console.log(`${vp}: skipped ${name}: ${redact(String((e as Error).message)).split("\n").slice(0, 12).join(" | ")}`);
      return;
    } finally {
      if (process.env.SMOKE_DEBUG && Date.now() - t > 1500) console.log(`${vp}: slow ${name} ${Date.now() - t} ms`);
    }
    await settled();
    if (await panel()) run.failures.push(`${vp} / ${name}: error panel shown`);
    if (process.env.SMOKE_DEBUG && Date.now() - t > 3000) console.log(`${vp}: slow with settle ${name} ${Date.now() - t} ms`);
  };
  const click = (l: ReturnType<Page["locator"]>) => l.click({ timeout: 3_000 });
  /** Opens the expandable rows of the list on screen, one by one (every
   *  one, or the first `limit`). Each is tagged first, so a row that opens
   *  (and stops matching the selector) never shifts which one is next. */
  let sweep = 0;
  const openAll = async (list: string, selector: string, limit = Infinity) => {
    const tag = `s${++sweep}`;
    const n = await page
      .locator(selector)
      .evaluateAll((els, t) => {
        els.forEach((e, i) => e.setAttribute("data-crawl", `${t}-${i}`));
        return els.length;
      }, tag)
      .catch(() => 0);
    for (let i = 0; i < Math.min(n, limit) && !run.failures.length; i++) {
      const row = page.locator(`[data-crawl="${tag}-${i}"]`);
      if (!(await row.count())) continue;
      await step(`${list}: open row ${i + 1}`, async () => {
        // Where a reader taps a row: by its chevron, at the right edge (the
        // row's middle holds the publisher's own links on a phone).
        await row.scrollIntoViewIfNeeded({ timeout: 3_000 });
        const box = await row.boundingBox();
        await row.click({
          timeout: 3_000,
          ...(box ? { position: { x: Math.max(4, box.width - 24), y: Math.min(box.height / 2, 24) } } : {}),
        });
        run.opened[list] = (run.opened[list] ?? 0) + 1;
      });
    }
  };
  /** Clicks a control when the page has it; never waits for one it lacks. */
  const tap = async (name: string, l: ReturnType<Page["locator"]>) => {
    if ((await l.count()) && (await l.isVisible().catch(() => false)) && (await l.isEnabled().catch(() => false)))
      await step(name, () => click(l));
  };
  const OVERVIEW_ROWS = 'button[aria-label^="Show the seat lines of"]';
  const goTo = async (label: string) => {
    let link = page.getByRole("link", { name: label, exact: true }).first();
    if (!(await link.isVisible().catch(() => false))) {
      await page.locator('[data-tour="nav-trigger"]').click({ timeout: 5_000 }).catch(() => {});
      link = page.getByRole("link", { name: label, exact: true }).first();
    }
    await click(link);
    // On a phone the menu is a sheet: let it close before the next tap.
    await page.locator('[data-mobile="true"]').waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
    await settled();
    // Debug pictures on the fake API only: a live page is the customer's.
    if (process.env.SMOKE_DEBUG && !LIVE)
      await page.screenshot({ path: `test-results/smoke-${vp}-${label.replace(/\W+/g, "")}.png` });
  };

  /* ── The Overview: both lists, every tab, every pill, every row. ── */
  for (const view of ["publishers", "apps"] as const) {
    await step(`view ${view}`, () => click(page.getByRole("button", { name: view === "apps" ? /Matched apps/ : /Matched publishers/ }).first()));
    for (const tab of ["All matched", "Added", "Removed", "Changed", "Started watching", "Stopped watching", "Unconfirmed", "Inactive"]) {
      const t = page.getByRole("tab", { name: tab, exact: true }).first();
      if (!(await t.count())) continue;
      await step(`${view} / ${tab}`, () => click(t));
      if (tab === "Inactive") {
        for (const kind of await page.getByRole("tablist", { name: "Inactive lists" }).getByRole("tab").all()) {
          await step(`${view} / Inactive / ${await kind.innerText()}`, () => click(kind));
          await openAll(`inactive`, OVERVIEW_ROWS);
          await step(`${view} / Inactive / search`, () => page.getByPlaceholder(/^Search/).first().fill("a", { timeout: 3_000 }));
          await step(`${view} / Inactive / clear search`, () => page.getByPlaceholder(/^Search/).first().fill("", { timeout: 3_000 }));
        }
        continue;
      }
      // Every row under All; the first few under Own and IPD (the same
      // rows, filtered), then back to All.
      await openAll(view, OVERVIEW_ROWS);
      const pills = page.getByTestId("match-type").getByRole("button");
      if (await pills.count()) {
        for (const pill of ["Own", "IPD"]) {
          await step(`${view} / ${tab} / ${pill}`, () => click(pills.getByText(pill, { exact: true })));
          await openAll(view, OVERVIEW_ROWS, 3);
        }
        await step(`${view} / ${tab} / All`, () => click(pills.getByText("All", { exact: true })));
      }
    }
    await step(`${view} / All matched again`, () => click(page.getByRole("tab", { name: "All matched", exact: true }).first()));
    // The note's names, open and shut.
    await tap(`${view} / Show them`, page.getByRole("button", { name: "Show them", exact: true }));
    await tap(`${view} / Hide them`, page.getByRole("button", { name: "Hide them", exact: true }));
    // Paging: on and back, a row opened on the way.
    await tap(`${view} / next page`, page.getByRole("button", { name: "Next page", exact: true }).first());
    await openAll(`${view} page 2`, OVERVIEW_ROWS, 2);
    await tap(`${view} / previous page`, page.getByRole("button", { name: "Previous page", exact: true }).first());
    // Search: a term, one that finds nothing, and back.
    for (const term of ["tv", "zz-no-such-publisher", ""]) {
      await step(`${view} / search "${term}"`, () => page.getByPlaceholder(view === "apps" ? "Search apps" : "Search publishers").fill(term, { timeout: 3_000 }));
      if (term === "tv") await openAll(`${view} search`, OVERVIEW_ROWS, 2);
    }
  }
  // The lines filter: one line on, the list re-read, and off again.
  await step("lines filter open", () => click(page.getByRole("button", { name: "Filter by seat line" })));
  await step("lines filter pick", () => click(page.getByRole("group", { name: "Seat lines" }).getByRole("menuitemcheckbox").first()));
  await step("lines filter apply", () => click(page.getByRole("menuitem", { name: "Apply", exact: true })));
  await openAll("filtered", OVERVIEW_ROWS, 2);
  await step("lines filter reopen", () => click(page.getByRole("button", { name: "Filter by seat line" })));
  await step("lines filter unpick", () => click(page.getByRole("group", { name: "Seat lines" }).getByRole("menuitemcheckbox").first()));
  await step("lines filter apply again", () => click(page.getByRole("menuitem", { name: "Apply", exact: true })));
  await step("lines filter close", () => page.keyboard.press("Escape"));

  const CARDS = "button[aria-expanded='false']:not([aria-haspopup])";
  // "Export this list" on the fake API only: on a live link it would read
  // every page of the list (it is never the metered export, but it is load).
  if (!LIVE) await tap("export this list", page.getByRole("button", { name: "Export this list" }).first());

  /* ── Popular: every choice, then the last one again (it clears). ── */
  const choices = await page.locator("[data-popular]").evaluateAll((els) => els.map((e) => e.getAttribute("data-popular") ?? ""));
  for (const id of choices) {
    await step(`popular ${id}`, () => click(page.locator(`[data-popular="${id}"]`)));
    await openAll(`popular ${id}`, OVERVIEW_ROWS, 1);
  }
  if (choices.length)
    await step("popular clear", () => click(page.locator(`[data-popular="${choices[choices.length - 1]}"]`)));
  await tap("popular next", page.getByRole("button", { name: "More choices" }));
  await tap("popular previous", page.getByRole("button", { name: "Previous choices" }));
  await step("back to publishers", () => click(page.getByRole("button", { name: /Matched publishers/ }).first()));

  lap("overview done");
  /* ── Every other page in the menu. ── */

  await step("page Discovery", () => goTo("Discovery"));
  await openAll("discovery", `main ${CARDS}`, API_CARDS);
  await tap("Discovery / next page", page.getByRole("button", { name: "Next page", exact: true }).first());

  await step("page Declarations", () => goTo("Declarations"));
  // A customer's few declared domains open on arrival: each is shut and
  // opened again, so every card is clicked either way.
  const TOGGLES = "main button[aria-expanded]:not([aria-haspopup])";
  await openAll("declarations", TOGGLES, API_CARDS);
  await openAll("declarations", TOGGLES, API_CARDS);

  await step("page Sellers.json", () => goTo("Sellers.json"));
  await openAll("sellers", `main ${CARDS}`, API_CARDS);
  await step("Sellers.json / roles search", () => page.getByLabel("Search seller roles").fill("tv", { timeout: 3_000 }));
  await step("Sellers.json / roles clear", () => page.getByLabel("Search seller roles").fill("", { timeout: 3_000 }));

  await step("page Schain", () => goTo("Schain"));
  await step("page Overview", () => goTo("Overview"));

  lap("pages done");
  /* ── The tour, all the way through. ── */
  await step("tour open", () => click(page.locator('[data-tour="walkthrough-button"]')));
  await step("tour continue", () => click(page.getByRole("button", { name: "Continue", exact: true })));
  for (let i = 0; i < 30; i++) {
    const next = page.getByRole("button", { name: /^(Next|Done)$/ }).first();
    if (!(await next.isVisible().catch(() => false))) break;
    const done = (await next.innerText()).trim() === "Done";
    await step(`tour step ${i + 1}`, () => click(next));
    if (done) break;
  }
  return run;
}

test.describe("click everything", () => {
  // One reader at a time: on a live link, light on the API.
  test.describe.configure({ mode: "serial", retries: LIVE ? 0 : undefined });

  test(LIVE ? "a real link: every click, desktop and phone, no crash" : "every click, desktop and phone, on the crawler's real shapes: no crash", async ({ browser }) => {
    test.setTimeout(LIVE ? 20 * 60_000 : 6 * 60_000);
    const failures: string[] = [];
    // SMOKE_VIEWPORT=phone (or desktop) walks one screen only.
    for (const vp of VIEWPORTS.filter((v) => !process.env.SMOKE_VIEWPORT || v.name === process.env.SMOKE_VIEWPORT)) {
      const { ctx, page } = await signIn(browser, vp);
      const run = await crawl(page, vp.name);
      failures.push(...run.failures);
      if (run.failures.length) {
        await ctx.close();
        break;
      }
      console.log(
        redact(
          `${vp.name}: ${run.steps} steps; rows opened: ${Object.entries(run.opened)
            .map(([k, v]) => `${k} ${v}`)
            .join(", ")}`,
        ),
      );
      if (!LIVE) {
        // The crawl really reached every list (a renamed control would
        // otherwise make this test pass by clicking nothing).
        for (const list of ["publishers", "apps", "inactive", "discovery", "declarations", "sellers"])
          expect(run.opened[list] ?? 0, `${vp.name}: rows opened on ${list}`).toBeGreaterThan(0);
      }
      await ctx.close();
    }
    expect(failures).toEqual([]);
  });
});
