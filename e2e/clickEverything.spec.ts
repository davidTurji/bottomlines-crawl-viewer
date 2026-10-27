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
 *
 * COUNTS (real-user QA, David, 2026-10-27). On the way it reads every
 * count it is shown (e2e/counts.ts): the Matched tiles are their lists'
 * totals, every tab, pill, Found in / Platform and Popular choice lists
 * as many rows as it names, "1-25 of N" is the rows on screen, on the
 * first page and on a page in the middle and the last. A mismatch does not
 * stop the walk (a crash does); both fail it.
 *
 * REAL-USER QA (e2e/realUserQa.mjs, .github/workflows/real-user-qa.yml)
 * runs this walk on every link in a secret list after every viewer deploy,
 * every crawler deploy and every night; with REAL_USER_QA_RESULT set the
 * walk writes what it found there (redacted) for the run's summary. Its
 * dry run points the live mode at a local build with VIEWER_SMOKE_FAKE
 * (the fake API behind the live sign-in), so the workflow itself is tested.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  activeTile,
  inactiveState,
  laterPages,
  listProblem,
  listState,
  matchTypeCount,
  popularCount,
  splitCount,
  type ListState,
} from "./counts";
import { installFakeApi, TOKEN, type Scenario } from "./fakeApi";

const LIVE =
  process.env.VIEWER_SMOKE_BASE && process.env.VIEWER_SMOKE_TOKEN && process.env.VIEWER_SMOKE_SIGNIN
    ? {
        base: process.env.VIEWER_SMOKE_BASE.replace(/\/+$/, ""),
        token: process.env.VIEWER_SMOKE_TOKEN,
        signin: process.env.VIEWER_SMOKE_SIGNIN,
      }
    : null;

/** The real-user QA dry run: the live mode's sign-in and walk, against a
 *  local build with the fake API answering ("clean", or "count-mismatch":
 *  the tile one off its list). Never on a real link. */
const FAKE = LIVE ? (process.env.VIEWER_SMOKE_FAKE ?? "") : "";
if (FAKE && LIVE && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(LIVE.base))
  throw new Error("VIEWER_SMOKE_FAKE runs against a local build only");

/** Every form a link's secrets can take in the output: the token, the
 *  sign-in as given, URL-encoded, and decoded (user:password, the
 *  password, the user). Longest first, so a part never leaves the rest. */
const SECRETS: [string, string][] = (() => {
  if (!LIVE) return [];
  const out: [string, string][] = [[LIVE.token, "<TOKEN>"], [LIVE.signin, "<SIGNIN>"], [encodeURIComponent(LIVE.signin), "<SIGNIN>"]];
  const plain = Buffer.from(LIVE.signin, "base64url").toString("utf8");
  const colon = plain.indexOf(":");
  if (colon > 0) out.push([plain, "<SIGNIN>"], [plain.slice(colon + 1), "<PASSWORD>"], [plain.slice(0, colon), "<USER>"]);
  return out.filter(([v]) => v.length >= 4).sort((a, b) => b[0].length - a[0].length);
})();

/** Never print the link's secrets. */
const redact = (t: string) => SECRETS.reduce((acc, [v, mark]) => acc.split(v).join(mark), t);

/** The walk's scenario on the fake API: the crawler's real field shapes,
 *  every page and switch on, the tiles counted from their lists. */
const CLICK_SCENARIO: Scenario = {
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
  appPlatform: true,
  foundIn: true,
  countsMatchLists: true,
};

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

/** A control or page this report does not have: skipped, never failed. */
class Absent extends Error {}

const CRASH_CONSOLE = /TypeError|ReferenceError|is not a function|Cannot read/;
const ERROR_PANEL = /could not be shown|did not render/i;

type Run = {
  failures: string[];
  /** Counts shown that are not the rows listed (e2e/counts.ts). They do
   *  not stop the walk; they fail it. */
  counts: string[];
  /** How many counts were compared. */
  countChecks: number;
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
    // The counts are read as the reader reads them: "8,412".
    locale: "en-US",
  });
  const page = await ctx.newPage();
  // Read-only: the report's export is never fetched, whatever is clicked.
  await page.route(/\/export\.xlsx|\/export(\?|$)|\/schain\/export\./, (r) => r.abort());
  // The tour's offer, declined whenever it shows (the fake API's install
  // does the same for every test).
  if (LIVE && !FAKE)
    await page.addLocatorHandler(page.getByRole("button", { name: "No thanks", exact: true }), async (b) => {
      await b.click();
    });
  // The dry run: the same sign-in and walk, the fake API answering.
  if (FAKE) await installFakeApi(page, { ...CLICK_SCENARIO, countMismatch: FAKE === "count-mismatch" });
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
    await installFakeApi(page, CLICK_SCENARIO);
    await page.goto(`/crawl-report/${TOKEN}`);
    await page.locator("input[autocomplete=username]").fill("reader", { timeout: 3_000 });
    await page.locator("input[autocomplete=current-password]").fill("any-password", { timeout: 3_000 });
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
  }
  return { ctx, page };
}

/** `samplePages`: also turn to later pages of every tab (the first
 *  viewport walked; the next only reads the pages the walk opens). */
async function crawl(page: Page, vp: string, { samplePages: sampling = true } = {}): Promise<Run> {
  const run: Run = { failures: [], counts: [], countChecks: 0, opened: {}, steps: 0 };
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
  /** Waits for every skeleton (aria-busy status) to go; false when one
   *  is still there after 30 s (a list that never lands is a failure). */
  const settled = async (): Promise<boolean> => {
    // A click's list starts loading a frame or two after it (React runs
    // the read in an effect after paint): give it that, so a skeleton about
    // to show is waited for rather than missed.
    await page
      .evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))))
      .catch(() => {});
    return page
      .locator('[role="status"][aria-busy="true"], [data-count-skeleton]')
      .first()
      .waitFor({ state: "detached", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
  };
  /** An error the page SHOWS without crashing (re-review of #75): an
   *  alert, a red error paragraph (a list whose rows failed to map says
   *  its message in one), or a "Could not load ..." in any colour. A fact
   *  of the report in red (a sellers.json the crawl could not read) is
   *  marked `data-report-fact` and is not one. One DOM pass, no locator
   *  text scan (those take minutes on a big page). */
  const errorShown = async (): Promise<string | null> =>
    page
      .evaluate(() => {
        const seen = (el: Element) => el.getClientRects().length > 0 && !el.closest("[data-report-fact]");
        for (const el of document.querySelectorAll('[role="alert"], p.text-critical'))
          if (seen(el) && (el.textContent ?? "").trim()) return (el.textContent ?? "").trim();
        const hits = document.evaluate(
          "//*[starts-with(normalize-space(text()), 'Could not load')]",
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );
        for (let i = 0; i < hits.snapshotLength; i++) {
          const el = hits.snapshotItem(i) as Element;
          if (seen(el)) return (el.textContent ?? "").trim();
        }
        return null;
      })
      .catch(() => null);
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
      // A control this report does not have is skipped (the callers ask
      // first and throw Absent); a control that IS there and cannot be
      // used is a failure (review of #75).
      const msg = redact(String((e as Error)?.message ?? e)).split("\n")[0].slice(0, 200);
      if (e instanceof Absent) {
        if (process.env.SMOKE_DEBUG) console.log(`${vp}: absent ${name}`);
        return;
      }
      run.failures.push(`${vp} / ${name}: ${msg}`);
      return;
    } finally {
      if (process.env.SMOKE_DEBUG && Date.now() - t > 1500) console.log(`${vp}: slow ${name} ${Date.now() - t} ms`);
    }
    if (!(await settled())) run.failures.push(`${vp} / ${name}: still loading after 30 s`);
    if (await panel()) run.failures.push(`${vp} / ${name}: error panel shown`);
    const shown = await errorShown();
    if (shown) run.failures.push(`${vp} / ${name}: error shown: ${redact(shown).slice(0, 200)}`);
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
  /** Clicks a control when the page has it; never waits for one it lacks.
   *  True when it clicked. */
  const tap = async (name: string, l: ReturnType<Page["locator"]>): Promise<boolean> => {
    if (!(await l.count())) return false;
    // There, but maybe a beat from shown (a list that just landed): a short
    // wait, so a present control is never skipped by a race.
    await l.waitFor({ state: "visible", timeout: 3_000 }).catch(() => {});
    if ((await l.isVisible().catch(() => false)) && (await l.isEnabled().catch(() => false))) {
      await step(name, () => click(l));
      return true;
    }
    if (process.env.SMOKE_DEBUG) console.log(`${vp}: hidden or disabled ${name}`);
    return false;
  };
  /** Fills a box when the page has it; never waits for one it lacks. */
  const fillIf = async (name: string, l: ReturnType<Page["locator"]>, value: string) => {
    if (await l.count()) await step(name, () => l.first().fill(value, { timeout: 3_000 }));
  };
  /* ── Counts (e2e/counts.ts): what a control names is what its list lists.
     Read after the click's step has settled, named after that step. ── */
  const countBad = (what: string) => run.counts.push(redact(`${vp} / ${where}: count mismatch: ${what}`).slice(0, 300));
  /** The list on screen against its own count line and, given `want`,
   *  against the number the clicked control named. `want.tab`: the tab
   *  the number was read on; a list that moved to another tab (a watch tab
   *  with no rows under the chosen pill is not offered, so the list goes
   *  back to All matched) is only checked against its own count line. */
  const checkList = async (want?: { n: number | null; by: string; tab?: string | null }, pageNo?: number): Promise<ListState | null> => {
    // A crashed page counts nothing: its crash is the finding.
    if (run.failures.length) return null;
    const s = await listState(page);
    if (!s) return null;
    run.countChecks++;
    const named = want && want.n != null && (want.tab === undefined || want.tab === s.tab) ? { n: want.n, by: want.by } : undefined;
    const problem = listProblem(s, named, pageNo);
    if (problem) countBad(problem);
    return s;
  };
  /** The chosen Matched tile against its list, while the list is the
   *  tile's own: All matched, match type All, no search, no Found in or
   *  Platform choice. Under a seat line filter both count those lines. */
  const checkTile = async () => {
    if (run.failures.length) return;
    const tile = await activeTile(page);
    const s = await listState(page);
    if (!tile || !s || s.tab !== "All matched" || (s.matchType && s.matchType !== "All") || s.query || (s.split && s.split !== "All")) return;
    run.countChecks++;
    const problem = listProblem(s, { n: tile.n, by: `the ${tile.label} tile` });
    if (problem) countBad(problem);
  };
  /** Later pages of the list on screen, one in the middle and the last,
   *  each holding exactly its share of the total; then page 1 again. */
  const samplePages = async (list: string) => {
    if (run.failures.length || !sampling) return;
    const first = await listState(page);
    if (!first?.count?.paged || first.count.page !== 1 || first.trial) return;
    const total = first.count.total;
    const pageButton = (n: number) => page.locator(`[data-tour="overview-list"] [data-list-count] button[aria-label="Page ${n}"]`);
    for (const n of laterPages(total)) {
      if (!(await pageButton(n).count())) {
        countBad(`${total.toLocaleString()} in all, and the pager offers no page ${n}`);
        continue;
      }
      await step(`${list} / page ${n}`, () => click(pageButton(n)));
      const s = await checkList(undefined, n);
      if (s?.count && s.count.total !== total) countBad(`page 1 says ${total.toLocaleString()} in all, page ${n} says ${s.count.total.toLocaleString()}`);
    }
    if (await tap(`${list} / page 1`, pageButton(1))) await checkList(undefined, 1);
  };
  /** The Inactive list on screen against its pill and the line under the
   *  tiles (`pill` false: after a search, its pager against its rows). */
  const checkInactive = async (pill = true) => {
    if (run.failures.length) return;
    const s = await inactiveState(page);
    if (!s?.kind || s.trial) return;
    run.countChecks++;
    const n = s.kinds[s.kind];
    const problem = listProblem({ count: s.count, rows: s.rows, trial: false }, pill ? { n, by: `the Inactive ${s.kind} pill` } : undefined);
    if (problem) countBad(problem);
    const quiet = s.quiet?.[s.kind === "apps" ? "apps" : "publishers"];
    if (pill && s.quiet && quiet !== n) countBad(`the line under the tiles says ${quiet} inactive ${s.kind}, the pill says ${n}`);
  };

  const OVERVIEW_ROWS = 'button[aria-label^="Show the seat lines of"]';
  const goTo = async (label: string) => {
    let link = page.getByRole("link", { name: label, exact: true }).first();
    if (!(await link.isVisible().catch(() => false))) {
      await page.locator('[data-tour="nav-trigger"]').click({ timeout: 5_000 }).catch(() => {});
      link = page.getByRole("link", { name: label, exact: true }).first();
      await link.waitFor({ timeout: 2_000 }).catch(() => {});
    }
    // A page this report does not have (no Schain, no Sellers.json): the
    // menu closes, all the way, before the next step looks for a link.
    if (!(await link.count())) {
      await page.keyboard.press("Escape").catch(() => {});
      await page.locator('[data-mobile="true"]').waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
      throw new Absent(label);
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
    await checkTile();
    for (const tab of ["All matched", "Added", "Removed", "Changed", "Started watching", "Stopped watching", "Unconfirmed", "Inactive"]) {
      const t = page.getByRole("tab", { name: tab, exact: true }).first();
      if (!(await t.count())) continue;
      await step(`${view} / ${tab}`, () => click(t));
      if (tab === "Inactive") {
        for (const kind of await page.getByRole("tablist", { name: "Inactive lists" }).getByRole("tab").all()) {
          await step(`${view} / Inactive / ${await kind.innerText()}`, () => click(kind));
          await checkInactive();
          await openAll(`inactive`, OVERVIEW_ROWS);
          await fillIf(`${view} / Inactive / search`, page.getByPlaceholder(/^Search/), "a");
          await checkInactive(false);
          await fillIf(`${view} / Inactive / clear search`, page.getByPlaceholder(/^Search/), "");
          await checkInactive();
        }
        continue;
      }
      // The tab's count against its rows, here and on later pages.
      await checkList();
      await samplePages(`${view} / ${tab}`);
      // Every row under All; the first few under Own and IPD (the same
      // rows, filtered), then back to All.
      await openAll(view, OVERVIEW_ROWS);
      const pills = page.getByTestId("match-type").getByRole("button");
      if (await pills.count()) {
        for (const pill of ["Own", "IPD", "All"]) {
          // The pill's tooltip names its count (when the list has one).
          const n = await matchTypeCount(page, pill);
          await step(`${view} / ${tab} / ${pill}`, () => click(pills.getByText(pill, { exact: true })));
          await checkList({ n, by: `the ${pill} pill`, tab });
          if (pill !== "All") await openAll(view, OVERVIEW_ROWS, 3);
        }
      }
      // Found in (publishers) and Platform (apps), when the list splits.
      for (const id of ["found-in", "platform"]) {
        const sw = page.getByTestId(id).getByRole("button");
        const words = (await sw.allInnerTexts().catch(() => [] as string[])).map((l) => l.trim().split(/\s+/)[0]);
        for (const word of words.slice(1)) {
          const n = await splitCount(page, id, word);
          await step(`${view} / ${tab} / ${id} ${word}`, () => click(sw.filter({ hasText: new RegExp(`^${word.replace(/[.]/g, "\\.")}`) })));
          await checkList({ n, by: `${id} ${word}`, tab });
          await openAll(view, OVERVIEW_ROWS, 2);
        }
        if (words.length) {
          const n = await splitCount(page, id, "All");
          if (await tap(`${view} / ${tab} / ${id} All`, sw.filter({ hasText: /^All/ }))) await checkList({ n, by: `${id} All`, tab });
        }
      }
    }
    await step(`${view} / All matched again`, () => click(page.getByRole("tab", { name: "All matched", exact: true }).first()));
    await checkTile();
    // The note's names, open and shut.
    await tap(`${view} / Show them`, page.getByRole("button", { name: "Show them", exact: true }));
    await tap(`${view} / Hide them`, page.getByRole("button", { name: "Hide them", exact: true }));
    // Paging: on and back, a row opened on the way.
    if (await tap(`${view} / next page`, page.getByRole("button", { name: "Next page", exact: true }).first())) await checkList(undefined, 2);
    await openAll(`${view} page 2`, OVERVIEW_ROWS, 2);
    if (await tap(`${view} / previous page`, page.getByRole("button", { name: "Previous page", exact: true }).first())) await checkList(undefined, 1);
    // Search: a term, one that finds nothing, and back.
    for (const term of ["tv", "zz-no-such-publisher", ""]) {
      await fillIf(`${view} / search "${term}"`, page.getByPlaceholder(view === "apps" ? "Search apps" : "Search publishers"), term);
      await checkList();
      if (term === "tv") await openAll(`${view} search`, OVERVIEW_ROWS, 2);
    }
  }
  // The lines filter: one line on, the list re-read, and off again.
  // The lines filter, on a report that carries its seat lines.
  if (await page.getByRole("button", { name: "Filter by seat line" }).count()) {
    await step("lines filter open", () => click(page.getByRole("button", { name: "Filter by seat line" })));
    await step("lines filter pick", () => click(page.getByRole("group", { name: "Seat lines" }).getByRole("menuitemcheckbox").first()));
    await step("lines filter apply", () => click(page.getByRole("menuitem", { name: "Apply", exact: true })));
    // Under a seat line, the tile and its list count that line alike.
    await checkTile();
    await checkList();
    await openAll("filtered", OVERVIEW_ROWS, 2);
    await step("lines filter reopen", () => click(page.getByRole("button", { name: "Filter by seat line" })));
    await step("lines filter unpick", () => click(page.getByRole("group", { name: "Seat lines" }).getByRole("menuitemcheckbox").first()));
    await step("lines filter apply again", () => click(page.getByRole("menuitem", { name: "Apply", exact: true })));
    await checkTile();
  }

  const CARDS = "button[aria-expanded='false']:not([aria-haspopup])";
  // "Export this list" on the fake API only: on a live link it would read
  // every page of the list (it is never the metered export, but it is load).
  if (!LIVE) await tap("export this list", page.getByRole("button", { name: "Export this list" }).first());

  /* ── Popular: every choice, then the last one again (it clears). ── */
  const choices = await page.locator("[data-popular]").evaluateAll((els) => els.map((e) => e.getAttribute("data-popular") ?? ""));
  for (const id of choices) {
    const n = await popularCount(page, id);
    await step(`popular ${id}`, () => click(page.locator(`[data-popular="${id}"]`)));
    await checkList({ n, by: `the Popular choice "${id}"` });
    await openAll(`popular ${id}`, OVERVIEW_ROWS, 1);
  }
  if (choices.length)
    await step("popular clear", () => click(page.locator(`[data-popular="${choices[choices.length - 1]}"]`)));
  await tap("popular next", page.getByRole("button", { name: "More choices" }));
  await tap("popular previous", page.getByRole("button", { name: "Previous choices" }));
  await step("back to publishers", () => click(page.getByRole("button", { name: /Matched publishers/ }).first()));
  await checkTile();

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
  await fillIf("Sellers.json / roles search", page.getByLabel("Search seller roles"), "tv");
  await fillIf("Sellers.json / roles clear", page.getByLabel("Search seller roles"), "");

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

/** One viewport's walk, as the real-user QA summary reads it. */
type Walked = {
  viewport: string;
  seconds: number;
  steps: number;
  countChecks: number;
  opened: Record<string, number>;
  failures: string[];
  counts: string[];
};

/** What the walk found, for e2e/realUserQa.mjs (REAL_USER_QA_RESULT):
 *  redacted, written whatever happened, even when sign-in failed. */
function writeResult(walked: Walked[]) {
  const out = process.env.REAL_USER_QA_RESULT;
  if (!out) return;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, redact(JSON.stringify({ viewports: walked }, null, 1)));
}

test.describe("click everything", () => {
  // One reader at a time: on a live link, light on the API.
  test.describe.configure({ mode: "serial", retries: LIVE ? 0 : undefined });

  test(LIVE ? "a real link: every click, desktop and phone, no crash, every count adds up" : "every click, desktop and phone, on the crawler's real shapes: no crash, every count adds up", async ({ browser }) => {
    test.setTimeout(LIVE ? 30 * 60_000 : 10 * 60_000);
    const failures: string[] = [];
    const walked: Walked[] = [];
    try {
      // SMOKE_VIEWPORT=phone (or desktop) walks one screen only.
      for (const vp of VIEWPORTS.filter((v) => !process.env.SMOKE_VIEWPORT || v.name === process.env.SMOKE_VIEWPORT)) {
        const t0 = Date.now();
        let opened: { ctx: BrowserContext; page: Page } | null = null;
        let run: Run;
        try {
          opened = await signIn(browser, vp);
          run = await crawl(opened.page, vp.name, { samplePages: walked.length === 0 });
        } catch (e) {
          // A link that never signs in, or a walk that died: the finding.
          const msg = redact(String((e as Error)?.message ?? e)).split("\n")[0].slice(0, 300);
          run = { failures: [`${vp.name} / sign in: ${msg}`], counts: [], countChecks: 0, opened: {}, steps: 0 };
        }
        failures.push(...run.failures, ...run.counts);
        walked.push({
          viewport: vp.name,
          seconds: Math.round((Date.now() - t0) / 1000),
          steps: run.steps,
          countChecks: run.countChecks,
          opened: run.opened,
          failures: run.failures,
          counts: run.counts,
        });
        // A picture of what went wrong, on fake data only: a real link's
        // page is the customer's, and this repository's runs are public.
        if (opened && (run.failures.length || run.counts.length) && (!LIVE || FAKE))
          await opened.page
            .screenshot({ path: `${process.env.REAL_USER_QA_SHOT_DIR ?? "test-results"}/click-everything-${vp.name}.png` })
            .catch(() => {});
        await opened?.ctx.close().catch(() => {});
        // The first crash ends the walk (the phone would only repeat it).
        if (run.failures.length) break;
        console.log(
          redact(
            `${vp.name}: ${run.steps} steps, ${run.countChecks} counts checked; rows opened: ${Object.entries(run.opened)
              .map(([k, v]) => `${k} ${v}`)
              .join(", ")}`,
          ),
        );
        if (!LIVE) {
          // The crawl really reached every list (a renamed control would
          // otherwise make this test pass by clicking nothing), and really
          // read the counts (a renamed count line would check none).
          for (const list of ["publishers", "apps", "inactive", "discovery", "declarations", "sellers"])
            expect(run.opened[list] ?? 0, `${vp.name}: rows opened on ${list}`).toBeGreaterThan(0);
          expect(run.countChecks, `${vp.name}: counts checked`).toBeGreaterThan(40);
        }
      }
    } finally {
      writeResult(walked);
    }
    expect(failures).toEqual([]);
  });
});
