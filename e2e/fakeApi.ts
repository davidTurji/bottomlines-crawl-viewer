import { groupByLine, pageChangeGroups } from "../src/lib/changeGroups";
import type { ChangeFilters } from "../src/lib/api";
/**
 * A fake crawler API for the browser tests, answered inside Playwright.
 *
 * The app under test is the REAL production build (no VITE_MOCK), so every
 * call goes through api.ts and req() exactly as it does for a customer. Only
 * the network is fake: page.route() answers /api/v1/viewer/* from the same
 * fixtures the mock mode reads, and each scenario switches one part of the
 * contract to the answer a real report can give (404 no page, 503 hiccup,
 * 401 not signed in, 403 expired at sign-in, a route this API does not have).
 *
 * Why this exists: 2026-10-06 every report without a Sellers.json page went
 * down, because mock mode never runs req() and its fixtures always had the
 * page. These tests run req() against the answers production really gives.
 */
import type { Page, Route } from "@playwright/test";

import {
  linesForDeveloper,
  mockDeclarationRows,
  mockDeveloperEvents,
  mockDiscoveredLinePlacements,
  mockDiscoveredLines,
  mockGone,
  mockInactive,
  mockLineEvents,
  mockMatchedApps,
  mockMatchedBundles,
  mockMatchedDevelopers,
  mockPreviousSummary,
  mockSummaryFor,
} from "../src/lib/mockData";
import { pageFromGone } from "../src/lib/inactive";
import type {
  DeveloperEvent,
  DiscoveredLine,
  DiscoveredShow,
  DiscoveredTotals,
  InactiveApp,
  InactiveKind,
  InactivePublisher,
  InactivePublisherLine,
  InactiveRow,
  LineEvent,
  MatchedApp,
  MatchedBundle,
  MatchedDeveloper,
  MatchedSeatLine,
  MatchTypeFilter,
  AppChange,
} from "../src/lib/api";
import {
  MOCK_CHECKED_AT,
  MOCK_SELLERS_DOMAIN,
  mockSellerSightings,
  mockSellersFile,
  mockCompletedChecks,
} from "../src/lib/mockSellers";

// mockDiscoveredLines reads ?discovery= from the page URL; in Node there is
// no page, so give it an empty one.
const g = globalThis as unknown as { window?: { location: { search: string } } };
if (!g.window) g.window = { location: { search: "" } };

export const TOKEN = "e2e-token";

/** How each optional part of the report answers. Defaults: a full report. */
export type Scenario = {
  /** true: the crawl reports no predecessor (``previous_job_id`` null)
   *  while the summary still carries ``compared_crawl_at``, the shape a
   *  first report had before the crawler stopped stamping that date
   *  (Select One Off, 2026-10-20). */
  firstReport?: boolean;
  /** "page": has a Sellers.json page. "none": 404 (the common case). */
  sellers?: "page" | "none" | "error";
  /** "ok": schain on. "none": off, 200 {status:"off"} as the real route
   *  answers. "no_sdks": on, nothing to check. Its sub-routes answer 404
   *  when off or on an older snapshot (viewer_schain._block). */
  schain?: "ok" | "none" | "no_sdks" | "error";
  /** false: this crawl discovered nothing (total 0). */
  discovery?: boolean;
  /** "current": the contract of 2026-10-14 (seller check, issues,
   *  baseline). "old": the answer of an API before 2026-10-11 (no origin
   *  marks, no publisher counts, no split totals). "old_uncompared": that
   *  API with no last week to count (previous_* null) while the summary
   *  names a previous crawl. "baseline_cut" / "baseline_none": the report
   *  says why last week is not compared. The others are the 2026-10-11
   *  shapes; none of them carries the 2026-10-14 fields. */
  discoveryApi?:
    | "current"
    | "old"
    | "old_uncompared"
    | "unwatched"
    | "unwatched_new"
    | "cut"
    | "scope_dropped"
    | "baseline_cut"
    | "baseline_none";
  /** "toolarge": the report kept no roster for wide lines (503 with the
   *  bake's sentence). "hiccup": a passing 503 from storage. */
  placements?: "ok" | "toolarge" | "hiccup";
  /** "ok", or "none" for an API older than this SPA (404). */
  exportInfo?: "ok" | "none" | "trial";
  /** Trial report: lists capped, the summary says so. */
  trial?: boolean;
  /** Not signed in: data answers 401 until a sign-in succeeds. */
  signedOut?: boolean;
  /** Not signed in, and sign-in refused: the link expired or was revoked (403). */
  expired?: boolean;
  /** Still signed in (cookie under 24h old) when the link expired or was
   *  revoked: every data route answers 403 with the link's sentence, as
   *  viewer_v2.require_viewer_session does. */
  refusedWhileSignedIn?: boolean;
  /** Data routes that answer 403 for reasons that are not the link (as
   *  schain downloads do on a trial). Tails like "declarations". */
  forbidden?: string[];
  /** Data routes this API does not have (answered 404), e.g. a newer SPA
   *  shipped before its crawler. Tails like "declarations". (An older
   *  snapshot on a current API answers 503 instead; see "hiccup" cases.) */
  missing?: string[];
  /** false: a link frozen before the "No longer live" block existed. */
  gone?: boolean;
  /** The Inactive section. "ok": frozen with it (summary inactive_counts,
   *  /inactive answers). "legacy": a link frozen before it, served from its
   *  gone block (derived_from "gone"). "missing": an API older than the
   *  route (404), the SPA builds it from the summary's gone block. */
  inactive?: "ok" | "legacy" | "missing";
  /** Last week's summary: "none" answers 503 (erased), "error" 500. */
  previousWeek?: "ok" | "none" | "error";
  /** false: a summary without ``crawl_at`` / ``compared_crawl_at`` (the API
   *  today), so the window's start comes from last week's summary. */
  crawlDates?: boolean;
  /** true: the crawler credited the first matched app from the app-ads.txt
   *  at the host its store listing declares (IAB app-ads.txt spec,
   *  2026-10-21), its publisher names that host under ``file_hosts``, and
   *  every newly monitored line's first publisher carries the "host first
   *  read" reason. Default false: every file is the publisher's own. */
  declaredHost?: boolean;
  /** true: a report built by crawler #348 with its report switches on.
   *  Every matched publisher, app and publisher change carries
   *  ``match_type`` (own / ipd) and the IPD detail and roles, every such
   *  list its ``match_type_counts`` and ``ipd_inconclusive``, and the
   *  lists honour ``?match_type=own|ipd``. Default false: the answer of
   *  every report frozen before it, byte for byte today's. */
  matchType?: boolean;
  /** true: a report whose removed lines say why (crawler, 2026-10-26):
   *  every removed seat line and every removed line event carries
   *  ``removal_reason``, in turn "line_not_in_file", "file_not_served"
   *  with ``removal_detail`` "404 on 3 reads", and "file_not_served" with
   *  no detail (see ``removalFor``). Default false: every report frozen
   *  before it, with no such field. */
  removalReasons?: boolean;
  /** true: a crawler with the matched apps change filter (2026-10-26):
   *  ``?change=added|removed|changed`` filters the whole list before
   *  paging, ``total`` is the filtered count, and the answer echoes
   *  ``change``. Default false: today's API, which ignores the parameter
   *  and answers the unfiltered list with no echo. */
  appChange?: boolean;
  /** true: a report built after crawler #364, whose build read the seats'
   *  sellers.json files first: the summary carries ``sellers_json_reads``
   *  (SELLERS_READS) and the Sellers.json page shows its Seller roles
   *  segment. Default false: every report frozen before it. */
  sellersReads?: boolean;
  /** true: every matched row, app, publisher change and line event in the
   *  crawler's REAL field shapes, as a frozen report serves them on
   *  2026-10-27 (see ``realShape``): roles as "; "-joined strings, alerts
   *  as one " | "-joined string or "", ``partner_inventory_on`` a list,
   *  the internal platform "ipd_partner", empty strings where the crawler
   *  sends them, one line per IPD partner (the same line several times),
   *  and an inconclusive note of 55 with 25 examples. For the
   *  click-everything test: a type assumption must never pass. */
  realShapes?: boolean;
  /** true: a crawler with the watch filters (crawler #361): matched-
   *  developers and matched-apps take ``?change=started_watching|
   *  stopped_watching|unconfirmed``, filter the whole list, echo
   *  ``change`` and answer ``change_counts``; a watch line event of a
   *  publisher says why. Default false: today's API, none of it (the watch
   *  tabs are not offered). */
  watchTabs?: boolean;
  /** true: a crawler with the Platform filter on the matched APPS list
   *  (2026-10-27): ``?platform=ctv|mobile|web`` filters the whole list
   *  (an app's platform from its store), echoed, with ``platform_counts``.
   *  Default false: today's API (no Platform switch). */
  appPlatform?: boolean;
  /** true: a crawler with the Found in filter on the matched PUBLISHERS
   *  lists (2026-10-27): ``?found_in=ads_txt|app_ads_txt|both`` on
   *  matched-developers and developer-events, echoed, with
   *  ``found_in_counts``. Default false: today's API (no switch). */
  foundIn?: boolean;
};

/** Every row of a paged mock list. */
function readAll<T>(readPage: (page: number) => { rows: T[]; total: number }): T[] {
  const all: T[] = [];
  for (let p = 1; p < 10_000; p++) {
    const r = readPage(p);
    all.push(...r.rows);
    if (!r.rows.length || all.length >= r.total) break;
  }
  return all;
}

/** An app's platform, as the platform crawler names it: from its store. */
export function fakeAppPlatform(a: { store?: string | null }): "ctv" | "mobile" | "web" | null {
  const store = String(a.store ?? "").toLowerCase();
  if (["ios", "android", "apple", "google"].includes(store)) return "mobile";
  if (["roku", "samsung", "vizio", "firetv", "amazon", "lg", "tvos", "ctv"].includes(store)) return "ctv";
  if (store === "web") return "web";
  return null;
}

/** A publisher's files, as the Found in crawler names them: which of its
 *  files carry the row's seat lines. */
export function fakeFoundIn(row: Record<string, unknown>): "ads_txt" | "app_ads_txt" | "both" | null {
  const lists = ["matched_lines", "added_lines", "removed_lines", "cert_changed_lines"].flatMap((k) =>
    Array.isArray(row[k]) ? (row[k] as { found_in?: string }[]) : [],
  );
  const files = new Set(lists.map((l) => String(l.found_in ?? "").toLowerCase()));
  const ads = files.has("ads.txt") || files.has("both");
  const app = files.has("app-ads.txt") || files.has("both");
  return ads && app ? "both" : ads ? "ads_txt" : app ? "app_ads_txt" : null;
}

/** Counts of a full list per choice, and the list kept by the asked one. */
function split<T>(all: T[], of: (r: T) => string | null, keys: string[], asked: string | null) {
  const counts: Record<string, number> = { all: all.length };
  for (const k of keys) counts[k] = all.filter((r) => of(r) === k).length;
  return { counts, kept: asked ? all.filter((r) => of(r) === asked) : all };
}

/** Which rows of a full list each watch filter keeps (by position, so a
 *  test can count them): the crawler's own rule is its line events. */
const WATCH_RULE: Record<string, (i: number) => boolean> = {
  started_watching: (i) => i % 3 === 0,
  stopped_watching: (i) => i % 7 === 1,
  unconfirmed: (i) => i % 11 === 2,
};

/** A publisher's watch line events of one kind, from its own lines. */
function watchEventsFor(developerId: number, event: string, declared: boolean): LineEvent[] {
  // A host's file read for the first time (or not read) says so on a
  // declared-host report; an unconfirmed line always says why.
  const reason =
    event === "unconfirmed"
      ? "The file answered 503 on every read this crawl."
      : !declared
        ? null
        : event === "newly_monitored"
          ? "host first read"
          : "host not read";
  return linesForDeveloper(developerId)
    .slice(0, 2)
    .map((r, i) => ({
      ...r,
      event,
      host: declared && i === 0 && event === "newly_monitored" ? DECLARED_HOST : (r.host ?? r.developer_domain),
      reason,
      last_seen_at: "2026-08-18T12:19:00+00:00",
      read_at: "2026-08-25T12:18:00+00:00",
      verified_at: null,
      tries: 3,
    })) as LineEvent[];
}

/** The ``sellersReads`` scenario's read summary (crawler #364's shape). */
export const SELLERS_READS = {
  wanted: 3,
  fresh: 1,
  read: 1,
  failed: 1,
  over_budget: 0,
  read_domains: ["madeupssp.com"],
  failed_domains: ["example-exchange.tv"],
  over_budget_domains: [],
};

/* ── THE CRAWLER'S REAL SHAPES (2026-10-27) ────────────────────────────
   What a frozen report really sends, read off a live link the morning a
   row's ``verdict_alerts`` (one string, not the contract's array) took
   the whole Overview down. Applied on top of the fixtures by row index,
   so every shape is on the first page of every list. */
const REAL_ROLES: Record<string, unknown>[] = [
  {
    seller_role: "not in sellers.json; owner; reseller",
    managed_by: "adnetwork-one.tv; adnetwork-two.com; adnetwork-three.com",
    verdict_alerts:
      "Listed as DIRECT, but sellers.json names adnetwork-three.com, not adnetwork-two.com: treated as a reseller. | Listed as RESELLER, but the sellers.json account is a publisher account: check the relationship.",
    partner_inventory_on: [],
    partner_inventory: [],
  },
  { seller_role: "", managed_by: "", verdict_alerts: "", partner_inventory_on: ["Tidewick TV"], partner_inventory: [] },
  { seller_role: "reseller", managed_by: null, verdict_alerts: ["An alert as the old contract's array."], partner_inventory_on: "Tidewick TV, Platform B" },
  { seller_role: null, managed_by: null, verdict_alerts: null, partner_inventory_on: null },
  { seller_role: "owner", managed_by: "copperline-media.tv (GB)", verdict_alerts: " | ", partner_inventory_on: [] },
];
const REAL_PLATFORMS = ["ipd_partner", "", "CTV", null, "website", "Mobile"];
const REAL_PARTNERS = ["northfold-tv.com", "failarmy.tv", "example-partner.tv"];

/** One seat line as the crawler sends it: an empty cert, a null host, and
 *  the row's match fields and (empty) roles repeated on the line. */
function realLine(l: MatchedSeatLine, partner: string | null): MatchedSeatLine {
  return {
    cert_id: "",
    host: null,
    ...l,
    ...(partner
      ? { match_type: "ipd", ipd_partner: partner, ipd_platform: "Tidewick TV", declared_in: "Tidewick TV's app-ads.txt" }
      : { match_type: "own" }),
    seller_role: partner ? "not in sellers.json" : "",
    managed_by: "",
    verdict_alerts: "",
  } as MatchedSeatLine;
}

/** A row in the real shapes. Its matched lines come once per IPD partner
 *  on every other row: the same line two or three times. */
function realShape<T extends LineArrays & Record<string, unknown>>(row: T, i: number): T {
  const roles = REAL_ROLES[i % REAL_ROLES.length];
  const platform = REAL_PLATFORMS[i % REAL_PLATFORMS.length];
  const twice = i % 2 === 0;
  const lines = (row.matched_lines ?? []) as MatchedSeatLine[];
  // A change window lists its lines once per partner too.
  const copies = (ls: MatchedSeatLine[]) =>
    twice
      ? ls.flatMap((l) => REAL_PARTNERS.slice(0, 2 + (i % 3 === 0 ? 1 : 0)).map((p) => realLine(l, p)))
      : ls.map((l) => realLine(l, null));
  const out: Record<string, unknown> = {
    ...row,
    ...roles,
    ...("platform" in row ? { platform } : {}),
    ...("developer_platform" in row ? { developer_platform: platform } : {}),
    ...(row.matched_lines
      ? {
          matched_lines: twice
            ? lines.flatMap((l) => REAL_PARTNERS.slice(0, 2 + (i % 3 === 0 ? 1 : 0)).map((p) => realLine(l, p)))
            : lines.map((l) => realLine(l, null)),
        }
      : {}),
    ...(row.added_lines ? { added_lines: copies(row.added_lines as MatchedSeatLine[]) } : {}),
    ...(row.removed_lines ? { removed_lines: copies(row.removed_lines as MatchedSeatLine[]) } : {}),
    ...(row.cert_changed_lines ? { cert_changed_lines: copies(row.cert_changed_lines as MatchedSeatLine[]) } : {}),
  };
  return out as T;
}

/** A line event as the crawler sends it: the match fields per line, some
 *  through a partner, an empty cert, and nulls where it sends them. */
function realEvent(e: LineEvent, i: number): LineEvent {
  const partner = i % 3 === 1 ? REAL_PARTNERS[i % REAL_PARTNERS.length] : null;
  return {
    ...e,
    cert_id: "",
    ...(partner ? { match_type: "ipd", ipd_partner: partner, host: partner } : { match_type: "own" }),
    reason: i % 4 === 0 ? null : e.reason ?? "",
  } as unknown as LineEvent;
}

/** The real inconclusive note: 55 publishers, 25 examples, two partners. */
const REAL_INCONCLUSIVE = {
  count: 55,
  examples: Array.from({ length: 25 }, (_, i) => ({
    partner: i < 20 ? "gusto-example.tv" : "northfold-tv.com",
    platform: `station${100 + i}.example`,
  })),
};

function realList<P extends { rows: unknown[] }>(page: P): P {
  return {
    ...page,
    rows: page.rows.map((r, i) => realShape(r as LineArrays & Record<string, unknown>, i)),
    // Only a list that says how it splits carries the note, as on a real
    // report (pair ``realShapes`` with ``matchType``).
    ...((page as Record<string, unknown>).match_type_counts ? { ipd_inconclusive: REAL_INCONCLUSIVE } : {}),
  };
}

/* ── THE FILE-HOST FIELDS (snapshot version 5, 2026-10-21) ────────────
   Every seat line, publisher, app and line event now says where its file
   is. The fixtures predate the fields, so every answer is given the
   defaults a crawl of own-domain files sends: host null on a seat line,
   file_hosts [] on a publisher, file_host = the publisher's domain and
   file_source "own_domain" on an app, host = the publisher's domain and
   reason null on a line event. A fixture that already carries a field
   keeps it (an unconfirmed line keeps its reason). Reports frozen before
   the fields lack them altogether, and the SPA renders both. */

/** The declared host of the ``declaredHost`` scenario. */
export const DECLARED_HOST = "ftmj.fortunemo.com";

/** The app the ``declaredHost`` scenario credits from that host: the
 *  first of the matched apps list, so a test can name it. */
export function declaredHostApp(): MatchedApp {
  return mockMatchedApps(1).rows[0];
}

const seatLine = (l: MatchedSeatLine): MatchedSeatLine => ({ host: null, ...l });
const atHost = (l: MatchedSeatLine): MatchedSeatLine => ({ ...l, host: DECLARED_HOST });

type LineArrays = {
  matched_lines?: MatchedSeatLine[];
  added_lines?: MatchedSeatLine[];
  removed_lines?: MatchedSeatLine[];
  cert_changed_lines?: MatchedSeatLine[];
};
function mapLines<T extends LineArrays>(row: T, f: (l: MatchedSeatLine) => MatchedSeatLine): T {
  return {
    ...row,
    ...(row.matched_lines ? { matched_lines: row.matched_lines.map(f) } : {}),
    ...(row.added_lines ? { added_lines: row.added_lines.map(f) } : {}),
    ...(row.removed_lines ? { removed_lines: row.removed_lines.map(f) } : {}),
    ...(row.cert_changed_lines ? { cert_changed_lines: row.cert_changed_lines.map(f) } : {}),
  };
}

const publisherRow = (d: MatchedDeveloper): MatchedDeveloper => mapLines({ file_hosts: [], ...d }, seatLine);
const eventRow = (d: DeveloperEvent): DeveloperEvent => mapLines(d, seatLine);
const appRow = (a: MatchedApp): MatchedApp =>
  mapLines({ file_host: a.owner_domain, file_source: "own_domain", ...a }, seatLine);
const bundleRow = (b: MatchedBundle): MatchedBundle => ({
  file_host: b.developer_domain,
  file_source: "own_domain",
  ...b,
});
const lineEvent = (r: LineEvent): LineEvent => ({ host: r.developer_domain, reason: null, ...r });
const inactiveLine = (l: InactivePublisherLine): InactivePublisherLine => ({ host: null, ...l });
function inactiveRow(kind: InactiveKind, r: InactiveRow): InactiveRow {
  if (kind === "apps") {
    const a = r as InactiveApp;
    return {
      file_host: a.publisher || null,
      file_source: "own_domain",
      ...a,
      ...(a.lines ? { lines: a.lines.map(inactiveLine) } : {}),
    };
  }
  const p = r as InactivePublisher;
  return { ...p, lines: (p.lines ?? []).map(inactiveLine) };
}

/** The ``declaredHost`` scenario's app: credited from the host's file,
 *  every line of it at that host. */
const appAtHost = (a: MatchedApp): MatchedApp =>
  mapLines({ ...a, file_host: DECLARED_HOST, file_source: "host" }, atHost);
/** Its publisher: names the host, and its first line sits there. */
const publisherWithHost = (d: MatchedDeveloper): MatchedDeveloper => ({
  ...d,
  file_hosts: [DECLARED_HOST],
  ...(d.matched_lines?.length
    ? { matched_lines: [atHost(d.matched_lines[0]), ...d.matched_lines.slice(1)] }
    : {}),
});

/** The ``removalReasons`` scenario's reason for the i-th removed line of a
 *  row (or the i-th publisher of a removed line's roster). */
export function removalFor(i: number): Pick<MatchedSeatLine, "removal_reason" | "removal_detail"> {
  if (i % 3 === 0) return { removal_reason: "line_not_in_file" };
  if (i % 3 === 1) return { removal_reason: "file_not_served", removal_detail: "404 on 3 reads" };
  return { removal_reason: "file_not_served" };
}
function withRemovalReasons<T extends LineArrays>(row: T): T {
  return row.removed_lines ? { ...row, removed_lines: row.removed_lines.map((l, i) => ({ ...l, ...removalFor(i) })) } : row;
}

const TRIAL_CAPS = { publishers: 3, apps: 3, declarations: 3, discovered_lines: 3 };

function cut<T>(rows: T[], cap: number, total: number) {
  return { rows: rows.slice(0, cap), trial: { cap, shown: Math.min(cap, rows.length, total), full_total: total } };
}

/** An answer from before 2026-10-14: none of the own-domain fields. */
function withoutOwnDomainFields(totals: DiscoveredTotals, rows: DiscoveredLine[]) {
  const {
    sellers_json: _sj,
    in_file_lines: _in,
    not_in_file_lines: _out,
    needs_fixing: _fix,
    baseline: _b,
    ...rest
  } = totals;
  return {
    totals: rest as DiscoveredTotals,
    rows: rows.map((row) => {
      const { seller: _s, issues: _i, ...kept } = row;
      return kept as DiscoveredLine;
    }),
  };
}

function schainOverview(status: "ok") {
  return {
    customer_name: "Made Up Media",
    status,
    reseller_domain: "madeupmedia.com",
    sellers_json_url: "https://madeupmedia.com/sellers.json",
    sellers_json_read_at: "2026-10-05T03:12:00+00:00",
    crawled_at: "2026-10-04T03:00:00+00:00",
    sdks: [{ domain: "madeupsdk.com", name: "Made Up SDK", seller_type: "PUBLISHER", seller_ids: ["100231"] }],
    sdk_catalog_size: 60,
    seat_lines: [],
    downloads: { used: 0, limit: 5, selections: [] },
  };
}

/** Every request the page made, for assertions. */
export type Calls = { method: string; path: string; status: number; query: string }[];

export async function installFakeApi(page: Page, scenario: Scenario = {}): Promise<Calls> {
  const s: Required<Scenario> = {
    firstReport: false,
    sellers: "none",
    schain: "none",
    discovery: true,
    discoveryApi: "current",
    placements: "ok",
    exportInfo: "ok",
    trial: false,
    signedOut: false,
    expired: false,
    refusedWhileSignedIn: false,
    forbidden: [],
    previousWeek: "ok",
    missing: [],
    gone: true,
    inactive: "ok",
    crawlDates: true,
    declaredHost: false,
    matchType: false,
    removalReasons: false,
    appChange: false,
    sellersReads: false,
    realShapes: false,
    watchTabs: false,
    appPlatform: false,
    foundIn: false,
    ...scenario,
  };
  const hostApp = s.declaredHost ? declaredHostApp() : null;
  const appKey = (a: MatchedApp) => `${a.store}:${a.bundle_id}`;
  let signedIn = !s.signedOut && !s.expired;
  const calls: Calls = [];

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, "");
    const q = url.searchParams;
    const page_ = Number(q.get("page") ?? 1);
    // The list filter of crawler #348, read only by a report that has it
    // (an older API ignores the parameter and answers in full).
    const matchType = s.matchType ? ((q.get("match_type") ?? "all") as MatchTypeFilter) : null;
    const lines = (q.get("lines") ?? "")
      .split(",")
      .filter(Boolean)
      .map((k) => decodeURIComponent(k));

    const reply = (status: number, body: unknown) => {
      calls.push({ method: req.method(), path, status, query: url.search });
      return route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    };
    const notFound = (detail = "Not Found") => reply(404, { detail });

    if (path === "/v1/viewer/auth" && req.method() === "POST") {
      if (s.expired) return reply(403, { detail: "This link has expired." });
      signedIn = true;
      return reply(200, { ok: true, email: "andres", customer_id: null });
    }

    const m = path.match(/^\/v1\/viewer\/([^/]+)\/(.+)$/);
    if (!m) return notFound();
    const [, , tail] = m;
    if (tail === "signout") {
      signedIn = false;
      return reply(200, { ok: true });
    }
    if (!signedIn) return reply(401, { detail: "viewer session missing or expired" });
    if (s.refusedWhileSignedIn)
      return reply(403, { detail: "This link has expired. Please contact your admin for a new one." });
    if (s.missing.includes(tail)) return notFound();
    if (s.forbidden.includes(tail)) return reply(403, { detail: "Not part of this link." });

    if (
      tail === "change-groups" ||
      /^change-groups\/.+\/publishers$/.test(tail)
    ) {
      const filters = {
        event: q.get("event") || undefined,
        ssp_domain: q.get("ssp_domain") || undefined,
        lines,
        page: Number(q.get("page") || 1),
        page_size: Number(q.get("page_size") || 25),
      } as ChangeFilters;
      const raw = mockLineEvents({
        ...filters,
        event: undefined,
        page: 1,
        page_size: 1_000_000,
      });
      const visible = s.trial ? raw.rows.slice(0, 12) : raw.rows;
      if (tail === "change-groups")
        return reply(
          200,
          pageChangeGroups(
            visible,
            filters,
            s.trial
              ? { cap: 12, shown: visible.length, full_total: raw.total }
              : null,
          ),
        );
      const key = decodeURIComponent(tail.split("/")[1]);
      const group = groupByLine(visible).find((g) => g.key === key);
      const rows = (group?.publishers ?? []).map((r, i) =>
        // The host's file, read for the first time this crawl: its lines
        // are newly monitored, not added (the first publisher of each).
        s.declaredHost && group?.event === "newly_monitored" && i === 0
          ? { ...lineEvent(r), host: DECLARED_HOST, reason: "host first read" }
          : s.removalReasons && group?.event === "removed"
            ? { ...lineEvent(r), ...removalFor(i) }
            : lineEvent(r),
      );
      const size = filters.page_size!,
        p = filters.page!;
      return reply(200, {
        page: p,
        page_size: size,
        total: rows.length,
        rows: rows.slice((p - 1) * size, p * size),
      });
    }

    switch (tail) {
      case "summary": {
        if (q.get("crawl_id")) {
          if (s.previousWeek === "none") return reply(503, { detail: "This report is not available yet." });
          if (s.previousWeek === "error") return reply(500, { detail: "boom" });
          return reply(200, mockPreviousSummary);
        }
        const built = mockSummaryFor(lines);
        // A report that discovered nothing looked for no domain.
        const dated = s.discovery ? built : { ...built, watchlist: { ...built.watchlist!, discover: [] } };
        const full = s.crawlDates ? dated : { ...dated, crawl_at: undefined, compared_crawl_at: undefined };
        const withGone = s.gone ? full : { ...full, gone: undefined };
        const withInactive = s.inactive === "ok" ? withGone : { ...withGone, inactive_counts: undefined };
        const first = s.firstReport ? { ...withInactive, previous_job_id: null } : withInactive;
        const sum = s.sellersReads ? { ...first, sellers_json_reads: SELLERS_READS } : first;
        return reply(200, s.trial ? { ...sum, trial: TRIAL_CAPS } : sum);
      }
      case "export-info":
        if (s.exportInfo === "none") return notFound();
        if (s.trial || s.exportInfo === "trial")
          return reply(200, { format: "none", line_export: false, trial: true });
        return reply(200, { format: "xlsx", line_export: true, excel_row_limit: 1_048_576 });
      case "developer-events": {
        const event = (q.get("event") ?? "added") as "added" | "removed" | "changed";
        let r = mockDeveloperEvents(event, page_, lines, matchType);
        if (s.foundIn) {
          const asked = q.get("found_in");
          const f = split(readAll((p) => mockDeveloperEvents(event, p, lines, matchType)), (d) => fakeFoundIn(d as unknown as Record<string, unknown>), ["ads_txt", "app_ads_txt", "both"], asked);
          r = { ...r, rows: f.kept.slice((page_ - 1) * 25, page_ * 25), total: f.kept.length, found_in_counts: f.counts, found_in: asked ?? "all" } as typeof r;
        }
        r.rows = r.rows.map(eventRow).map((d) => (s.removalReasons ? withRemovalReasons(d) : d));
        const ev = s.realShapes ? realList(r) : r;
        return reply(200, s.trial ? { ...ev, page: 1, ...cut(ev.rows, TRIAL_CAPS.publishers, ev.total) } : ev);
      }
      case "line-events": {
        const filters: Record<string, unknown> = {};
        for (const [k, v] of q.entries()) if (k !== "lines") filters[k] = /^\d+$/.test(v) ? Number(v) : v;
        if (filters.developer_id !== undefined && s.watchTabs && typeof filters.event === "string" && ["newly_monitored", "monitoring_stopped", "unconfirmed"].includes(filters.event)) {
          const rows = watchEventsFor(Number(filters.developer_id), filters.event, s.declaredHost);
          return reply(200, { page: 1, page_size: rows.length || 1, total: rows.length, rows });
        }
        if (filters.developer_id !== undefined) {
          const rows = linesForDeveloper(Number(filters.developer_id))
            .map(lineEvent)
            .map((r, i) => (s.realShapes ? (realShape(r as unknown as LineArrays & Record<string, unknown>, i) as unknown as LineEvent) : r));
          return reply(200, { page: 1, page_size: rows.length || 1, total: rows.length, rows });
        }
        const r = mockLineEvents(filters as Parameters<typeof mockLineEvents>[0]);
        // The host's file, read for the first time this crawl: each newly
        // monitored line's first publisher (as on the change-groups roster).
        const firstOf = new Set<string>();
        const rows = r.rows.map(lineEvent).map((e) => {
          if (!s.declaredHost || e.event !== "newly_monitored") return e;
          const k = `${e.ssp_domain}|${e.publisher_id}|${e.relationship}`;
          if (firstOf.has(k)) return e;
          firstOf.add(k);
          return { ...e, host: DECLARED_HOST, reason: "host first read" };
        });
        return reply(200, { ...r, rows: s.realShapes ? rows.map((e, i) => realEvent(e, i)) : rows });
      }
      case "matched-developers": {
        let r = mockMatchedDevelopers(page_, q.get("q") ?? "", lines, matchType);
        if (s.watchTabs || s.foundIn) {
          let all = readAll((p) => mockMatchedDevelopers(p, q.get("q") ?? "", lines, matchType));
          const extra: Record<string, unknown> = {};
          if (s.watchTabs) {
            extra.change_counts = Object.fromEntries(Object.entries(WATCH_RULE).map(([k, f]) => [k, all.filter((_, i) => f(i)).length]));
            const ch = q.get("change");
            if (ch && WATCH_RULE[ch]) {
              all = all.filter((_, i) => WATCH_RULE[ch](i));
              extra.change = ch;
            }
          }
          if (s.foundIn) {
            const asked = q.get("found_in");
            const f = split(all, (d) => fakeFoundIn(d as unknown as Record<string, unknown>), ["ads_txt", "app_ads_txt", "both"], asked);
            all = f.kept;
            extra.found_in_counts = f.counts;
            extra.found_in = asked ?? "all";
          }
          r = { ...r, ...extra, rows: all.slice((page_ - 1) * 25, page_ * 25), total: all.length } as typeof r;
        }
        r.rows = r.rows
          .map((d) =>
            hostApp && d.domain === hostApp.owner_domain ? publisherWithHost(publisherRow(d)) : publisherRow(d),
          )
          .map((d) => (s.removalReasons ? withRemovalReasons(d) : d));
        const md = s.realShapes ? realList(r) : r;
        return reply(200, s.trial ? { ...md, page: 1, ...cut(md.rows, TRIAL_CAPS.publishers, md.total) } : md);
      }
      case "matched-bundles": {
        const r = mockMatchedBundles(page_, q.get("q") ?? "");
        return reply(200, { ...r, rows: r.rows.map(bundleRow) });
      }
      case "matched-apps": {
        const asked = q.get("change") || null;
        const watch = s.watchTabs && asked !== null && asked in WATCH_RULE;
        const change = s.appChange && !watch ? (asked as AppChange | null) : null;
        let r = mockMatchedApps(page_, q.get("q") ?? "", lines, matchType, change);
        if (s.watchTabs || s.appPlatform) {
          let all = readAll((p) => mockMatchedApps(p, q.get("q") ?? "", lines, matchType, change));
          const extra: Record<string, unknown> = {};
          if (s.watchTabs) {
            extra.change_counts = Object.fromEntries(Object.entries(WATCH_RULE).map(([k, f]) => [k, all.filter((_, i) => f(i)).length]));
            if (watch && asked) {
              all = all.filter((_, i) => WATCH_RULE[asked](i));
              extra.change = asked;
            }
          }
          if (s.appPlatform) {
            const pf = q.get("platform");
            const f = split(all, (a) => fakeAppPlatform(a), ["ctv", "mobile", "web"], pf);
            all = f.kept;
            extra.platform_counts = f.counts;
            extra.platform = pf ?? "all";
          }
          r = { ...r, ...extra, rows: all.slice((page_ - 1) * 25, page_ * 25), total: all.length } as typeof r;
        }
        r.rows = r.rows
          .map((a) => (hostApp && appKey(a) === appKey(hostApp) ? appAtHost(appRow(a)) : appRow(a)))
          .map((a) => (s.removalReasons ? withRemovalReasons(a) : a));
        const ma = s.realShapes ? realList(r) : r;
        return reply(200, s.trial ? { ...ma, page: 1, ...cut(ma.rows, TRIAL_CAPS.apps, ma.total) } : ma);
      }
      case "discovered-lines": {
        if (!s.discovery) return reply(200, { page: 1, page_size: Number(q.get("page_size") ?? 50), total: 0, rows: [] });
        const legacy = s.discoveryApi !== "current" && !s.discoveryApi.startsWith("baseline_");
        const r = mockDiscoveredLines({
          page: page_,
          page_size: Number(q.get("page_size") ?? 50),
          ssp_domain: q.get("ssp_domain") ?? undefined,
          origin: s.discoveryApi === "old" ? undefined : ((q.get("origin") as "given" | "found" | null) ?? undefined),
          // An API from before 2026-10-14 does not know these.
          show: legacy ? undefined : ((q.get("show") as DiscoveredShow | null) ?? undefined),
          q: legacy ? undefined : (q.get("q") ?? undefined),
          baseline:
            s.discoveryApi === "baseline_cut" ? "cut" : s.discoveryApi === "baseline_none" ? "none" : "compared",
        });
        if (legacy) {
          const stripped = withoutOwnDomainFields(r.totals, r.rows);
          r.totals = stripped.totals;
          r.rows = stripped.rows;
        }
        if (s.discoveryApi === "unwatched") {
          // An artifact frozen before 2026-10-11, served by today's API,
          // whose baseline did not watch the domain: zero last week, every
          // line without a previous count, no publisher counts at all (the
          // API adds only the origin marks and given/found to old links).
          const { publishers: _p, previous_publishers: _pp, ...totals } = r.totals;
          r.totals = { ...totals, previous_lines: 0, previous_placements: 0, new_lines: null };
          r.rows = r.rows.map((row) => {
            const { publishers_count: _c, previous_publishers_count: _pc, ...rest } = row;
            return { ...rest, previous_placements_count: null };
          });
        }
        if (s.discoveryApi === "unwatched_new") {
          // A report from 2026-10-11 whose baseline did not watch madeupmedia.la.
          // The partial-overlap shape: other domains were watched, so their
          // lines keep last week; the totals are not compared.
          r.totals = { ...r.totals, previous_lines: null, previous_placements: null, new_lines: null, previous_publishers: null, scope_changed: true, unwatched_domains: ["madeupmedia.la"] };
          r.rows = r.rows.map((row) =>
            row.ssp_domain === "madeupmedia.la" ? { ...row, previous_placements_count: null, previous_publishers_count: null, previous_watched: false } : row,
          );
        }
        if (s.discoveryApi === "scope_dropped") {
          // A domain was dropped since last week: totals not compared.
          r.totals = { ...r.totals, previous_lines: null, previous_placements: null, new_lines: null, previous_publishers: null, scope_changed: true, unwatched_domains: [] };
        }
        if (s.discoveryApi === "cut") {
          // A list cut at 5,000 lines (viewer_frozen.discovered_lines): when
          // UNFILTERED the totals are the baked whole ones, with no
          // given/found split, whatever the origin asked. Under an SSP
          // filter the API counts the list itself, split included.
          if (!q.get("ssp_domain")) {
            const { given_lines: _g, found_lines: _f, ...totals } = r.totals;
            r.totals = { ...totals, listed_lines: r.total, lines: r.total + 100, placements: (r.totals.placements ?? 0) + 4_000 };
          }
        }
        if (s.discoveryApi === "old" || s.discoveryApi === "old_uncompared") {
          // What the API answered before 2026-10-11, field for field.
          const { publishers: _p, previous_publishers: _pp, given_lines: _g, found_lines: _f, ...totals } = r.totals;
          r.totals = totals;
          r.rows = r.rows.map((row) => {
            const { origin: _o, origin_source: _s, origin_added_at: _a, given_as: _ga, publishers_count: _c, previous_publishers_count: _pc, ...rest } = row;
            return rest;
          });
        }
        if (s.discoveryApi === "old_uncompared") {
          // No last week to count, and no word on why: the summary still
          // names a previous crawl (mockSummary.previous_job_id).
          r.totals = { ...r.totals, previous_lines: null, previous_placements: null, new_lines: null };
          r.rows = r.rows.map((row) => ({ ...row, previous_placements_count: null }));
        }
        return reply(200, s.trial ? { ...r, page: 1, ...cut(r.rows, TRIAL_CAPS.discovered_lines, r.total) } : r);
      }
      case "discovered-lines/placements":
        if (s.placements === "hiccup") {
          // viewer_v2._link_refusal's transient answer, word for word.
          return reply(503, { detail: "Temporarily unavailable. Please try again in a few minutes." });
        }
        if (s.placements === "toolarge") {
          // viewer_v2.viewer_discovered_placements, word for word: the page
          // keys on "too large" (CrawlDiscovered LineCard).
          return reply(503, { detail: "This list is too large to display here. Please contact your admin for the full workbook." });
        }
        {
          const key = {
            ssp_domain: q.get("ssp_domain") ?? "",
            publisher_id: q.get("publisher_id") ?? "",
            relationship: (q.get("relationship") ?? "DIRECT") as "DIRECT",
            cert_id: q.get("cert_id") ?? "",
          };
          const size = Number(q.get("page_size") ?? 100);
          const term = q.get("q") ?? undefined;
          // A report frozen before 2026-10-14 kept at most the first 200
          // files of a line, and the API serves exactly those.
          const capped = s.discoveryApi !== "current" && !s.discoveryApi.startsWith("baseline_");
          if (!capped) return reply(200, mockDiscoveredLinePlacements(key, { page: page_, page_size: size, q: term }));
          const kept = mockDiscoveredLinePlacements(key, { page: 1, page_size: 100_000 }).rows.slice(0, 200);
          const rows = term
            ? kept.filter((p) => (p.developer_domain + " " + p.developer_name).toLowerCase().includes(term.toLowerCase()))
            : kept;
          return reply(200, { page: page_, page_size: size, total: rows.length, rows: rows.slice((page_ - 1) * size, page_ * size) });
        }
      case "declarations":
        return reply(
          200,
          s.trial
            ? { ...mockDeclarationRows, ...cut(mockDeclarationRows.rows, TRIAL_CAPS.declarations, mockDeclarationRows.total) }
            : mockDeclarationRows,
        );
      case "inactive": {
        if (s.inactive === "missing") return notFound();
        // There is no customer-facing lines list: the crawler answers 410
        // (viewer_frozen.LINES_REFUSED), and any other kind is a 422.
        const rawKind = q.get("kind") ?? "publishers";
        if (rawKind === "lines") {
          return reply(410, {
            detail:
              "The Inactive section lists publishers and apps only. The seat lines an inactive publisher carried are on its card (lines), and each inactive app carries its publisher's lines.",
          });
        }
        if (rawKind !== "publishers" && rawKind !== "apps") return reply(422, { detail: "unknown kind" });
        const kind = rawKind as InactiveKind;
        const opts = { page: page_, q: q.get("q") ?? "", lines };
        const r =
          s.inactive === "legacy"
            ? pageFromGone(s.gone ? mockGone : null, kind, { ...opts, pageSize: Number(q.get("page_size") ?? 50) })
            : mockInactive(kind, opts, s.trial);
        return reply(200, { ...r, rows: r.rows.map((row) => inactiveRow(kind, row)) });
      }
      case "sellers-fix":
        if (s.sellers === "none") return notFound("This report has no sellers.json page.");
        if (s.sellers === "error") return reply(503, { detail: "not available yet" });
        return reply(200, {
          domain: MOCK_SELLERS_DOMAIN,
          file: mockSellersFile,
          sightings: mockSellerSightings,
          file_checks: mockCompletedChecks,
          checked_at: MOCK_CHECKED_AT,
          file_url: `https://${MOCK_SELLERS_DOMAIN}/sellers.json`,
          file_warnings: [],
        });
      case "schain":
        if (s.schain === "none") return reply(200, { status: "off" });
        if (s.schain === "error") return reply(503, { detail: "not available yet" });
        if (s.schain === "no_sdks") return reply(200, { status: "no_sdks" });
        return reply(200, schainOverview("ok"));
      default:
        // A route this API does not have: exactly what an older crawler
        // answers to a newer SPA.
        return notFound();
    }
  });
  return calls;
}
