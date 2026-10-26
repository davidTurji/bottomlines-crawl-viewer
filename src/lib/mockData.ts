/**
 * Mock data seed for local UI review.
 *
 * Turned on with ``VITE_MOCK=true`` at ``vite dev`` start time. Every
 * ``api.*`` function short-circuits to a promise resolving out of the
 * data below, no backend required. Realistic SSP names, plausible
 * publisher IDs, developer names lifted from real ad-monetised
 * publishers so a screenshot reads as a real product.
 *
 * NOT bundled in production builds: the api.ts adapter is a `if
 * (MOCK)` at each function head and the mock data is only imported
 * from that branch, so tree-shaking drops it entirely when MOCK is
 * false.
 */

import type {
  Summary,
  DeclarationSource,
  Declarations,
  DeveloperEventsPage,
  DeveloperEvent,
  DiscoveredLine,
  DiscoveredLineKey,
  DiscoveredLinesPage,
  DiscoveredPlacement,
  DiscoveredPlacementsPage,
  DiscoveredShow,
  DiscoveredTotals,
  LineIssue,
  SellerCheck,
  LineEventsPage,
  LineEvent,
  LineEventKind,
  MatchedDeveloper,
  MatchedDevelopersPage,
  MatchedSeatLine,
  MatchTypeFilter,
  MatchTypeFields,
  MatchTypeCounts,
  MatchedBundlesPage,
  MatchedApp,
  MatchedAppsPage,
  ChatFrame,
  DeclarationRow,
  DeclarationRowsPayload,
  InactiveApp,
  InactiveKind,
  InactivePage,
  InactivePublisher,
  InactiveRow,
} from "./api";
import { inactiveDay, inWindow, pageRows } from "./inactive";
// The discovered-lines ORDER BY, shared with the page's sort control so the
// mock endpoint and the client's "default" option cannot disagree.
import { compareDefault } from "./discoveredSort";
import { originsFrom } from "./discoveredOrigin";
import { PAGE_SIZE } from "./paging";

/*
 * THE CUSTOMER'S WATCHLIST. Six seat lines, the shape a real customer's
 * report is built from. Every matched publisher, app and matched-seat
 * event carries a subset of THESE, so the seat-line filter has something
 * true to narrow by. Declared first: the event seed below reads it at
 * module load.
 */
// PROVENANCE, EXERCISED (2026-09-25). Every line says where it came from
// and the day it was added, hinted under the line in the filter and
// nowhere else. The mix here is deliberate, so a preview shows every
// state rather than the happy one:
//
//   * a bulk sellers.json import, the majority in a real customer;
//   * lines a person typed, on later dates;
//   * both discovery buttons, which read the same to a customer;
//   * one line with no provenance at all, which is what every line on an
//     artifact frozen before this looks like. It must hint NOTHING rather
//     than guess "added manually".
export const CUSTOMER_SEATS: MatchedSeatLine[] = [
  { ssp_domain: "magnite.com", publisher_id: "14991", relationship: "RESELLER",
    source: "sellers_json", added_at: "2026-08-30" },
  { ssp_domain: "magnite.com", publisher_id: "14992", relationship: "RESELLER",
    source: "sellers_json", added_at: "2026-08-30" },
  { ssp_domain: "openx.com", publisher_id: "540123456", relationship: "DIRECT",
    source: "manual", added_at: "2026-09-02" },
  { ssp_domain: "pubmatic.com", publisher_id: "161234", relationship: "RESELLER",
    source: "sellers_json", added_at: "2026-08-30" },
  // Promoted from a one-off crawl's discovery matches. Reads the same as
  // the fold below, because a customer has no use for which button it was.
  { ssp_domain: "sharethrough.com", publisher_id: "SZjHEx3f", relationship: "DIRECT",
    source: "signal", added_at: "2026-09-11" },
  // Folded in by a generation that treated discovered lines as seat lines.
  { ssp_domain: "onetag.com", publisher_id: "8df76ed1d09d55e", relationship: "RESELLER",
    source: "discovered", added_at: "2026-09-16" },
  // The honest blank: an artifact frozen before provenance existed.
  { ssp_domain: "improvedigital.com", publisher_id: "1532", relationship: "DIRECT" },
  // A customer the size of eskimi (2026-09-21): well over a hundred seat
  // lines on one SSP, so the line filter has to scroll and the Apply
  // button has to stay in reach. Made-up names, as every example here.
  ...Array.from({ length: 120 }, (_, i) => ({
    ssp_domain: "madeupmedia.com",
    publisher_id: String(2020000100 + i * 3),
    relationship: i % 7 === 0 ? "RESELLER" : "DIRECT",
    // Mostly the bulk import they sent on day one; a handful found for
    // them since, so the blue lines are findable in a long list.
    ...(i % 17 === 5
      ? { source: "discovered" as const, added_at: "2026-09-16" }
      : i % 23 === 9
        ? { source: "manual" as const, added_at: "2026-09-09" }
        : { source: "sellers_json" as const, added_at: "2026-08-30" }),
  })),
];

export function seatKey(l: { ssp_domain: string; publisher_id: string; relationship: string }): string {
  return `${l.ssp_domain.trim().toLowerCase()}|${l.publisher_id.trim()}|${l.relationship.trim().toUpperCase()}`;
}

function carries(lines: MatchedSeatLine[] | undefined, selected: string[]): boolean {
  if (selected.length === 0) return true;
  if (!lines) return false;
  const want = new Set(selected);
  return lines.some((l) => want.has(seatKey(l)));
}


// ─────────────────────────────────────────────────────────────────
// Summary (hero + counters)
// ─────────────────────────────────────────────────────────────────

// The previous week's report, retained so every page can show the
// "current-crawl vs last-crawl" comparison David asked to keep visible.
export const mockPreviousSummary: Summary = {
  crawl_id: 47120,
  source: "weekly",
  status: "completed",
  queued_at: "2026-08-18T09:00:00Z",
  started_at: "2026-08-18T09:00:14Z",
  finished_at: "2026-08-18T09:19:22Z",
  previous_job_id: 46_988,
  counters: {
    developer_count: 1_241_984,
    fetched_count: 1_299_402,
    error_count: 11_918,
    not_found_count: 86_401,
    unreadable_count: 3_641,
    developers_with_lines: 1_042_117,
    matched: {
      lines: 1_338_549,
      // Last week's matched counts, set so the overview's matched publisher
      // and app cards show a real week-over-week growth delta: publishers
      // 8,061 -> 8,412 (+351, +4.4%), apps 23,140 -> 24,781 (+1,641, +7.1%).
      developers: 8_061,
      apps: 23_140,
    },
  },
  hero_diff: {
    line_totals: {
      added: 92, removed: 74, cert_changed: 28,
      newly_monitored: 0, monitoring_stopped: 0, first_appearance: 0,
    },
    line_totals_matched_seat: {
      added: 6, removed: 4, cert_changed: 3,
      newly_monitored: 0, monitoring_stopped: 0, first_appearance: 0,
    },
    developer_totals: {
      added: 9, removed: 4, changed: 41,
      newly_monitored: 0, monitoring_stopped: 0,
    },
    // Last week's distinct publishers / apps affected, so the Changes page's
    // "Where they landed" card can show a real week-over-week delta against
    // this week's (≈20 publishers, ≈15 apps): +3 on each.
    affected: { publishers: 17, apps: 12 },
    top_ssps: {
      added: [
        { ssp_domain: "openx.com", count: 22 },
        { ssp_domain: "magnite.com", count: 18 },
        { ssp_domain: "sharethrough.com", count: 12 },
      ],
      removed: [
        { ssp_domain: "appnexus.com", count: 21 },
        { ssp_domain: "rubiconproject.com", count: 17 },
        { ssp_domain: "google.com", count: 12 },
      ],
      cert_changed: [
        { ssp_domain: "amazon-adsystem.com", count: 8 },
        { ssp_domain: "criteo.com", count: 6 },
        { ssp_domain: "adform.com", count: 5 },
      ],
    },
  },
};

export const mockPreviousWeekOf = "Aug 18 2026";

/** No longer live, invented rows on madeupmedia-style names (never real
 *  companies). Dates derive from today so the demo never looks stale. */
const goneDay = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
export const mockGone: NonNullable<Summary["gone"]> = {
  publishers: [
    { domain: "quokkaplay-legacy.com", name: "Quokkaplay Legacy", reason: "The domain no longer exists", since: goneDay(15), lines: ["madeupmedia.com, 100231, DIRECT"], apps: 4 },
    { domain: "brambleloop-old.net", name: "", reason: "The website stopped answering", since: goneDay(8), lines: ["madeupmedia.com, 200118, RESELLER", "madeupmedia.com, 100262, DIRECT"], apps: 2 },
    { domain: "lanternbay-apps.com", name: "", reason: "The domain no longer exists", since: goneDay(22), lines: ["madeupmedia.com, 200126, RESELLER"], apps: 7 },
  ],
  apps: [
    { name: "Hex World War", store: "android", bundle: "com.madeup.war.hex.world", publisher: "silvergull-media.tv", reason: "No longer on Google Play", since: goneDay(10) },
    { name: "Fighter Jam", store: "android", bundle: "io.madeup.fighterjam", publisher: "orchardtide-ads.com", reason: "No longer on Google Play", since: goneDay(4) },
    { name: "Lantern Bay Solitaire", store: "ios", bundle: "com.madeup.lanternbay.solitaire", publisher: "copperwren-hiphop.com", reason: "No longer on the App Store", since: goneDay(7) },
    { name: "Harbor News Live", store: "roku", bundle: "614512", publisher: "harborview7news.com", reason: "No longer on the Roku Channel Store", since: goneDay(12) },
    { name: "Puzzle Wool Sort", store: "android", bundle: "puzzle.madeup.wool.sort", publisher: "cobaltriver15.com", reason: "No longer on Google Play", since: goneDay(3) },
  ],
  totals: { publishers: 3, apps: 5 },
};

/*
 * INACTIVE (2026-10-08): every reason the crawler can give, on invented
 * madeupmedia-style names checked to belong to nobody (dig NXDOMAIN, store
 * lookups empty). Newest first, as the bake keeps them. The seller ids are
 * the watchlist's own madeupmedia.com lines, so the seat-line filter has
 * something true to narrow the publishers by.
 *
 * A report covers the window between its two crawls (David, 2026-10-08),
 * so the fixtures are dated around this mock report's crawls and cut to
 * that window the way the crawler must cut its own block. A few fall
 * outside on purpose: one found dead BY the compared crawl (its day, the
 * report before) and older ones; none of them may show.
 */
export const MOCK_CRAWL_AT = "2026-08-25T09:18:47Z";
export const MOCK_COMPARED_CRAWL_AT = "2026-08-18T09:19:22Z";
/** A day, `before` days ahead of this mock report's crawl. */
const crawlDay = (before: number) =>
  new Date(Date.parse(MOCK_CRAWL_AT) - before * 86_400_000).toISOString().slice(0, 10);
const MOCK_WINDOW = { from: MOCK_COMPARED_CRAWL_AT, to: MOCK_CRAWL_AT };
/** "from 4 Aug to 25 Aug", for the evidence sentences. */
const span = (from: number, to: number) => `from ${inactiveDay(crawlDay(from))} to ${inactiveDay(crawlDay(to))}`;

const seat = (i: number) => CUSTOMER_SEATS.filter((l) => l.ssp_domain === "madeupmedia.com")[i];
const pubLine = (i: number, ended: number, file = "app-ads.txt") => {
  const l = seat(i);
  return {
    ssp_domain: l.ssp_domain,
    publisher_id: l.publisher_id,
    relationship: l.relationship,
    file,
    first_seen: crawlDay(ended + 70),
    last_seen: crawlDay(ended + 7),
    ended_at: crawlDay(ended),
    reason_code: "publisher_inactive",
  };
};

const INACTIVE_PUBLISHERS_ALL: InactivePublisher[] = [
  {
    developer_id: 880_101, domain: "brambleloop-old.net", name: null,
    inactive_since: crawlDay(0), reason_code: "site_silent", reason: "The website stopped answering",
    evidence_summary: `Failed in 4 crawls in a row, ${span(21, 0)}`,
    lines: [pubLine(1, 0), pubLine(2, 0, "ads.txt")], apps: 2,
  },
  {
    developer_id: 880_102, domain: "quokkaplay-legacy.com", name: "Quokkaplay Legacy",
    inactive_since: crawlDay(0), reason_code: "domain_gone", reason: "The domain no longer exists",
    evidence_summary: `Failed in 3 crawls in a row, ${span(14, 0)}`,
    lines: [pubLine(3, 0)], apps: 4,
  },
  {
    developer_id: 880_103, domain: "tinplover-studio.net", name: "Tinplover Studio",
    inactive_since: crawlDay(0), reason_code: "no_file",
    reason: "The website no longer serves an ads.txt or app-ads.txt file",
    evidence_summary: `Failed in 3 crawls in a row, ${span(14, 0)}`,
    lines: [pubLine(4, 0), pubLine(5, 0)], apps: 3,
  },
  {
    developer_id: 880_106, domain: "pebblemarsh-tv.com", name: "Pebblemarsh TV",
    inactive_since: crawlDay(3), reason_code: "retired_by_operator", reason: "Retired by our team",
    evidence_summary: "Retired by our team after review",
    lines: [pubLine(7, 3, "ads.txt"), pubLine(8, 3, "ads.txt")], apps: 0,
  },
  // Outside the window: found dead by the compared crawl, and older.
  {
    developer_id: 880_104, domain: "lanternbay-apps.com", name: null,
    inactive_since: crawlDay(7), reason_code: "certificate_broken",
    reason: "The website's security certificate is broken",
    evidence_summary: `Failed in 3 crawls in a row, ${span(21, 7)}`,
    lines: [pubLine(0, 7)], apps: 7,
  },
  {
    developer_id: 880_105, domain: "driftquill-media.com", name: "Driftquill Media",
    inactive_since: crawlDay(28), reason_code: "site_refuses", reason: "The website refuses connections",
    evidence_summary: `Failed in 5 crawls in a row, ${span(56, 28)}`,
    lines: [pubLine(6, 28)], apps: 1,
  },
];

/** The reader's lines a live publisher of an inactive app still carries. */
const appLines = (...idx: number[]) =>
  idx.map((i) => {
    const l = seat(i);
    return { ssp_domain: l.ssp_domain, publisher_id: l.publisher_id, relationship: l.relationship, file: "app-ads.txt" };
  });

const INACTIVE_APPS_ALL: InactiveApp[] = [
  {
    app_id: 990_206, store: "ios", bundle: "com.madeup.glintfox.runner", name: "Glintfox Runner",
    developer_id: 880_102, publisher: "quokkaplay-legacy.com", publisher_name: "Quokkaplay Legacy",
    publisher_inactive: true,
    inactive_since: crawlDay(0), reason_code: "unlisted_from_store", reason: "No longer on the App Store",
    evidence: { http_status: 404, storefronts_checked: ["US", "CA"], qa_outcome: "cloud_gone" },
    evidence_summary: "Checked in US, CA, the store answered 404",
    confirmed: true,
    lines: [pubLine(3, 0)],
  },
  {
    app_id: 990_201, store: "android", bundle: "puzzle.madeup.wool.sort", name: "Puzzle Wool Sort",
    developer_id: 77_301, publisher: "cobaltriver15.com", publisher_name: "Cobalt River",
    inactive_since: crawlDay(1), reason_code: "unlisted_from_store", reason: "No longer on Google Play",
    evidence: { http_status: 404, storefronts_checked: ["US", "GB"], qa_outcome: "cloud_gone" },
    evidence_summary: "Checked in US, GB, the store answered 404",
    confirmed: true,
    publisher_inactive: false, lines: appLines(11, 12),
  },
  {
    app_id: 990_202, store: "android", bundle: "io.madeup.fighterjam", name: "Fighter Jam",
    developer_id: 77_302, publisher: "orchardtide-ads.com", publisher_name: "Orchardtide",
    inactive_since: crawlDay(2), reason_code: "unlisted_from_store", reason: "No longer on Google Play",
    evidence: { http_status: 404, storefronts_checked: ["US", "GB", "JP"], qa_outcome: "cloud_gone" },
    evidence_summary: "Checked in US, GB, JP, the store answered 404",
    confirmed: true,
    publisher_inactive: false, lines: appLines(13),
  },
  {
    app_id: 990_203, store: "ios", bundle: "com.madeup.lanternbay.solitaire", name: "Lantern Bay Solitaire",
    developer_id: 77_303, publisher: "copperwren-hiphop.com", publisher_name: null,
    inactive_since: crawlDay(3), reason_code: "unlisted_from_store", reason: "No longer on the App Store",
    evidence: { http_status: 404, storefronts_checked: ["US", "GB", "DE", "JP"], qa_outcome: "cloud_gone" },
    evidence_summary: "Checked in US, GB, DE, JP, the store answered 404",
    confirmed: true,
    publisher_inactive: false, lines: appLines(14, 15, 16),
  },
  {
    app_id: 990_204, store: "android", bundle: "com.madeup.war.hex.world", name: "Hex World War",
    developer_id: 77_304, publisher: "silvergull-media.tv", publisher_name: "Silvergull Media",
    inactive_since: crawlDay(5), reason_code: "unlisted_from_store", reason: "No longer on Google Play",
    evidence: { http_status: 404, storefronts_checked: ["US"], qa_outcome: "cloud_gone" },
    evidence_summary: "Checked in US, the store answered 404",
    confirmed: true,
    publisher_inactive: false, lines: appLines(17),
  },
  {
    app_id: 990_205, store: "roku", bundle: "614512", name: "Harbor News Live",
    developer_id: 77_305, publisher: "harborview7news.com", publisher_name: "Harborview 7 News",
    inactive_since: crawlDay(6), reason_code: "unlisted_from_store", reason: "No longer on the Roku Channel Store",
    evidence: { http_status: 404, qa_outcome: "cloud_gone" },
    evidence_summary: "The store answered 404",
    confirmed: true,
    publisher_inactive: false, lines: appLines(18, 19),
  },
  // Outside the window: retired before the compared crawl.
  {
    app_id: 990_207, store: "android", bundle: "com.madeup.mossgate.pinball", name: "Mossgate Pinball",
    developer_id: 77_307, publisher: "mossgate-arcade.com", publisher_name: "Mossgate Arcade",
    inactive_since: crawlDay(13), reason_code: "unlisted_from_store", reason: "No longer on Google Play",
    evidence: { http_status: 404, storefronts_checked: ["US"], qa_outcome: "cloud_gone" },
    evidence_summary: "Checked in US, the store answered 404",
    confirmed: true,
    publisher_inactive: false, lines: appLines(20),
  },
];

const INACTIVE_PUBLISHERS = INACTIVE_PUBLISHERS_ALL.filter((p) => inWindow(p.inactive_since, MOCK_WINDOW));
const INACTIVE_APPS = INACTIVE_APPS_ALL.filter((a) => inWindow(a.inactive_since, MOCK_WINDOW));

/** The report's block: only what went inactive between its two crawls. */
export const mockInactiveBlock = {
  publishers: INACTIVE_PUBLISHERS,
  apps: INACTIVE_APPS,
  counts: {
    publishers: INACTIVE_PUBLISHERS.length,
    apps: INACTIVE_APPS.length,
  },
  /** Kept for the tests: rows that must never show on this report. */
  outside: {
    publishers: INACTIVE_PUBLISHERS_ALL.filter((p) => !INACTIVE_PUBLISHERS.includes(p)),
    apps: INACTIVE_APPS_ALL.filter((a) => !INACTIVE_APPS.includes(a)),
  },
};

/**
 * One page of an Inactive list, the way viewer_frozen.inactive serves it.
 * A trial keeps the first rows of each list (the counts stay whole) and
 * withholds the publisher of apps (its domain, name and id; the row keeps
 * its lines and publisher_inactive), BEFORE search and filter, as the
 * crawler's trial view does (viewer_frozen._unnamed). There is no lines
 * list: the crawler answers kind=lines with 410.
 */
export function mockInactive(
  kind: InactiveKind,
  opts: { page: number; q?: string; lines?: string[] },
  trial = false,
): InactivePage {
  const block = mockInactiveBlock;
  let rows: InactiveRow[] = block[kind];
  if (trial) {
    rows = rows.slice(0, 3);
    if (kind === "apps") {
      rows = (rows as InactiveApp[]).map((r) => ({
        ...r, publisher: "", publisher_name: "", developer_id: null,
      }));
    }
  }
  const cut = pageRows(kind, rows, { page: opts.page, pageSize: PAGE_SIZE, q: opts.q, lines: opts.lines });
  return {
    kind,
    page: opts.page,
    page_size: PAGE_SIZE,
    total: cut.total,
    rows: cut.rows,
    available: true,
    counts: { ...block.counts },
    truncated: false,
    ...(trial
      ? { trial: { cap: 3, shown: Math.min(3, block[kind].length), full_total: block.counts[kind] } }
      : {}),
  };
}

export const mockSummary: Summary = {
  gone: mockGone,
  inactive_counts: { ...mockInactiveBlock.counts },
  crawl_at: MOCK_CRAWL_AT,
  compared_crawl_at: MOCK_COMPARED_CRAWL_AT,
  crawl_id: 47281,
  source: "weekly",
  status: "completed",
  queued_at: "2026-08-25T09:00:00Z",
  started_at: "2026-08-25T09:00:12Z",
  finished_at: "2026-08-25T09:18:47Z",
  previous_job_id: 47120,
  counters: {
    developer_count: 1_247_392,
    fetched_count: 1_305_881,
    error_count: 12_447,
    not_found_count: 87_216,
    unreadable_count: 3_812,
    developers_with_lines: 1_047_283,
    matched: {
      lines: 1_337_492,
      developers: 8_412,
      apps: 24_781,
    },
    // Found and lost behind the net: 380 - 29 = +351 publishers,
    // 1,702 - 61 = +1,641 apps.
    matched_moves: {
      developers: { found: 380, lost: 29 },
      apps: { found: 1_702, lost: 61 },
    },
  },
  hero_diff: {
    line_totals: {
      added: 127,
      removed: 184,
      cert_changed: 43,
      newly_monitored: 61,
      monitoring_stopped: 9,
      first_appearance: 7,
      // Two lines the crawler could not verify this week (see
      // LINE_EVENTS_BY_EVENT.unconfirmed): a tab and a quiet line, never
      // a card, and never inside added or removed.
      unconfirmed: 2,
    },
    line_totals_matched_seat: {
      added: 12,
      removed: 27,
      cert_changed: 6,
      newly_monitored: 61,
      monitoring_stopped: 9,
      first_appearance: 7,
    },
    developer_totals: {
      added: 12,
      removed: 8,
      changed: 47,
      newly_monitored: 12,
      monitoring_stopped: 2,
    },
    scope_changed: true,
    // This week's distinct publishers / apps affected. The Changes page
    // computes the current figure from the loaded line events; this keeps the
    // fixture coherent and documents the field the delta reads from `previous`.
    affected: { publishers: 20, apps: 15 },
    top_ssps: {
      added: [
        { ssp_domain: "magnite.com", count: 34 },
        { ssp_domain: "openx.com", count: 21 },
        { ssp_domain: "pubmatic.com", count: 18 },
        { ssp_domain: "sharethrough.com", count: 14 },
        { ssp_domain: "smartadserver.com", count: 11 },
      ],
      removed: [
        { ssp_domain: "rubiconproject.com", count: 42 },
        { ssp_domain: "appnexus.com", count: 38 },
        { ssp_domain: "google.com", count: 29 },
        { ssp_domain: "yahoo.com", count: 17 },
        { ssp_domain: "criteo.com", count: 14 },
      ],
      cert_changed: [
        { ssp_domain: "amazon-adsystem.com", count: 12 },
        { ssp_domain: "adform.com", count: 9 },
        { ssp_domain: "criteo.com", count: 7 },
        { ssp_domain: "spotx.tv", count: 5 },
        { ssp_domain: "beachfront.com", count: 4 },
      ],
    },
  },
};

// ─────────────────────────────────────────────────────────────────
// Developer events (drilldown)
// ─────────────────────────────────────────────────────────────────

const DEV_ADDED: DeveloperEvent[] = [
  {
    developer_id: 91_204,
    developer_name: "Chomp Studios",
    developer_domain: "chompstudios.com",
    developer_platform: "iOS",
    matched_lines_prev: 0,
    matched_lines_current: 18,
    lines_added: 18,
    lines_removed: 0,
    lines_cert_changed: 0,
    lines_newly_monitored: 0,
    lines_monitoring_stopped: 0,
    top_ssps: [
      { ssp_domain: "magnite.com", count: 6 },
      { ssp_domain: "openx.com", count: 5 },
      { ssp_domain: "pubmatic.com", count: 4 },
    ],
    occurred_at: "2026-08-25T09:18:32Z",
  },
  {
    developer_id: 78_442,
    developer_name: "Roost Media",
    developer_domain: "roostmedia.tv",
    developer_platform: "Roku",
    matched_lines_prev: 0,
    matched_lines_current: 14,
    lines_added: 14,
    lines_removed: 0,
    lines_cert_changed: 0,
    lines_newly_monitored: 0,
    lines_monitoring_stopped: 0,
    top_ssps: [
      { ssp_domain: "spotx.tv", count: 5 },
      { ssp_domain: "beachfront.com", count: 4 },
      { ssp_domain: "magnite.com", count: 3 },
    ],
    occurred_at: "2026-08-25T09:18:33Z",
  },
  {
    developer_id: 66_120,
    developer_name: "Deep Sea Games",
    developer_domain: "deepsea.games",
    developer_platform: "Android",
    matched_lines_prev: 0,
    matched_lines_current: 11,
    lines_added: 11,
    lines_removed: 0,
    lines_cert_changed: 0,
    lines_newly_monitored: 0,
    lines_monitoring_stopped: 0,
    top_ssps: [
      { ssp_domain: "pubmatic.com", count: 4 },
      { ssp_domain: "smartadserver.com", count: 3 },
      { ssp_domain: "openx.com", count: 2 },
    ],
    occurred_at: "2026-08-25T09:18:35Z",
  },
  {
    developer_id: 44_881,
    developer_name: "Aurora TV Networks",
    developer_domain: "auroratv.io",
    developer_platform: "CTV",
    matched_lines_prev: 0,
    matched_lines_current: 9,
    lines_added: 9,
    lines_removed: 0,
    lines_cert_changed: 0,
    lines_newly_monitored: 0,
    lines_monitoring_stopped: 0,
    top_ssps: [
      { ssp_domain: "sharethrough.com", count: 4 },
      { ssp_domain: "magnite.com", count: 3 },
    ],
    occurred_at: "2026-08-25T09:18:36Z",
  },
  {
    developer_id: 22_401,
    developer_name: "Pixel Cauldron",
    developer_domain: "pixelcauldron.com",
    developer_platform: "iOS",
    matched_lines_prev: 0,
    matched_lines_current: 8,
    lines_added: 8,
    lines_removed: 0,
    lines_cert_changed: 0,
    lines_newly_monitored: 0,
    lines_monitoring_stopped: 0,
    top_ssps: [
      { ssp_domain: "openx.com", count: 3 },
      { ssp_domain: "smartadserver.com", count: 2 },
    ],
    occurred_at: "2026-08-25T09:18:37Z",
  },
  {
    developer_id: 51_224,
    developer_name: "Northlight Games",
    developer_domain: "northlight.games",
    developer_platform: "Android",
    matched_lines_prev: 0,
    matched_lines_current: 7,
    lines_added: 7,
    lines_removed: 0,
    lines_cert_changed: 0,
    lines_newly_monitored: 0,
    lines_monitoring_stopped: 0,
    top_ssps: [
      { ssp_domain: "pubmatic.com", count: 3 },
      { ssp_domain: "magnite.com", count: 2 },
    ],
    occurred_at: "2026-08-25T09:18:38Z",
  },
];

const DEV_REMOVED: DeveloperEvent[] = [
  {
    developer_id: 12_984,
    developer_name: "Kite Interactive",
    developer_domain: "kiteinteractive.com",
    developer_platform: "iOS",
    matched_lines_prev: 22,
    matched_lines_current: 0,
    lines_added: 0,
    lines_removed: 22,
    lines_cert_changed: 0,
    lines_newly_monitored: 0,
    lines_monitoring_stopped: 0,
    top_ssps: [
      { ssp_domain: "rubiconproject.com", count: 9 },
      { ssp_domain: "appnexus.com", count: 8 },
      { ssp_domain: "google.com", count: 5 },
    ],
    occurred_at: "2026-08-25T09:18:40Z",
  },
  {
    developer_id: 8_712,
    developer_name: "Cinder & Sky",
    developer_domain: "cinderandsky.co",
    developer_platform: "Web",
    matched_lines_prev: 16,
    matched_lines_current: 0,
    lines_added: 0,
    lines_removed: 16,
    lines_cert_changed: 0,
    lines_newly_monitored: 0,
    lines_monitoring_stopped: 0,
    top_ssps: [
      { ssp_domain: "google.com", count: 7 },
      { ssp_domain: "criteo.com", count: 5 },
      { ssp_domain: "yahoo.com", count: 4 },
    ],
    occurred_at: "2026-08-25T09:18:41Z",
  },
  {
    developer_id: 6_115,
    developer_name: "Meridian Sports Media",
    developer_domain: "meridiansports.io",
    developer_platform: "iOS",
    matched_lines_prev: 12,
    matched_lines_current: 0,
    lines_added: 0,
    lines_removed: 12,
    lines_cert_changed: 0,
    lines_newly_monitored: 0,
    lines_monitoring_stopped: 0,
    top_ssps: [
      { ssp_domain: "appnexus.com", count: 6 },
      { ssp_domain: "yahoo.com", count: 4 },
      { ssp_domain: "rubiconproject.com", count: 2 },
    ],
    occurred_at: "2026-08-25T09:18:42Z",
  },
  {
    developer_id: 7_302,
    developer_name: "Sable Broadcasting",
    developer_domain: "sablebroadcast.tv",
    developer_platform: "Samsung",
    matched_lines_prev: 9,
    matched_lines_current: 0,
    lines_added: 0,
    lines_removed: 9,
    lines_cert_changed: 0,
    lines_newly_monitored: 0,
    lines_monitoring_stopped: 0,
    top_ssps: [{ ssp_domain: "rubiconproject.com", count: 5 }],
    occurred_at: "2026-08-25T09:18:43Z",
  },
];

const DEV_CHANGED: DeveloperEvent[] = [
  {
    developer_id: 4_411,
    developer_name: "Riverstone Publishers",
    developer_domain: "riverstone.com",
    developer_platform: "Web",
    matched_lines_prev: 47,
    matched_lines_current: 52,
    lines_added: 8,
    lines_removed: 3,
    lines_cert_changed: 4,
    lines_newly_monitored: 0,
    lines_monitoring_stopped: 0,
    top_ssps: [
      { ssp_domain: "magnite.com", count: 4 },
      { ssp_domain: "criteo.com", count: 3 },
      { ssp_domain: "openx.com", count: 3 },
    ],
    occurred_at: "2026-08-25T09:18:44Z",
  },
  {
    developer_id: 15_902,
    developer_name: "Copperline Studios",
    developer_domain: "copperline.tv",
    developer_platform: "Vizio",
    matched_lines_prev: 29,
    matched_lines_current: 34,
    lines_added: 6,
    lines_removed: 1,
    lines_cert_changed: 2,
    lines_newly_monitored: 0,
    lines_monitoring_stopped: 0,
    top_ssps: [
      { ssp_domain: "spotx.tv", count: 3 },
      { ssp_domain: "magnite.com", count: 2 },
    ],
    occurred_at: "2026-08-25T09:18:44Z",
  },
  {
    developer_id: 33_014,
    developer_name: "Nomad Media Group",
    developer_domain: "nomadmediagroup.com",
    developer_platform: "iOS",
    matched_lines_prev: 21,
    matched_lines_current: 24,
    lines_added: 4,
    lines_removed: 1,
    lines_cert_changed: 3,
    lines_newly_monitored: 0,
    lines_monitoring_stopped: 0,
    top_ssps: [
      { ssp_domain: "pubmatic.com", count: 3 },
      { ssp_domain: "amazon-adsystem.com", count: 2 },
    ],
    occurred_at: "2026-08-25T09:18:45Z",
  },
];

const DEV_TABLES: Record<string, DeveloperEvent[]> = {
  added: DEV_ADDED,
  removed: DEV_REMOVED,
  changed: DEV_CHANGED,
};

export function mockDeveloperEvents(
  event: "added" | "removed" | "changed" | "unconfirmed",
  page: number,
  lines: string[] = [],
  /** null: a report frozen before match types (today's exact answer). */
  matchType: MatchTypeFilter | null = null,
): DeveloperEventsPage {
  // Attach the seat lines behind each row's counts, so its expanded card can
  // show WHAT moved. Seeded off the developer id (see changeArrays), so a
  // publisher shown here and under "All matched" carries identical lines.
  const rows = (DEV_TABLES[event] ?? [])
    .map((d) => ({
      ...d,
      ...changeArrays(d.developer_id, d.lines_added, d.lines_removed, d.lines_cert_changed),
    }))
    .filter((d) => carries(d.matched_lines ?? matchedLinesFor(d.developer_id, 6), lines));
  if (matchType !== null) return matchTypeEvents(event, rows, page, lines, matchType);
  // Paged like the live endpoint, so the change tabs page in a local run.
  return {
    event,
    page,
    page_size: PAGE_SIZE,
    total: rows.length,
    rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  };
}

// ─────────────────────────────────────────────────────────────────
// Line events (LinesDiff pane)
// ─────────────────────────────────────────────────────────────────

const SSPS_ADDED = [
  "magnite.com",
  "openx.com",
  "pubmatic.com",
  "sharethrough.com",
  "smartadserver.com",
  "improvedigital.com",
  "adyoulike.com",
  "adform.com",
  "sovrn.com",
  "triplelift.com",
];

const SSPS_REMOVED = [
  "rubiconproject.com",
  "appnexus.com",
  "google.com",
  "yahoo.com",
  "criteo.com",
  "indexexchange.com",
  "outbrain.com",
  "adtech.com",
];

/*
 * The publisher roster a line can land on.
 *
 * A real week's diff is not 127 unrelated events: an SSP changes its own
 * file and the same ads.txt line then appears on, or disappears from, every
 * publisher that syndicates it. So the seed is generated LINE FIRST, and
 * each line fans out across some number of these publishers. Grouping the
 * rows back up by (ssp, publisher id, relationship, cert pair, event) is
 * what the Line changes page does, and without a fan-out every group would
 * be a group of one, which is the shape that made the old table read as a
 * wall of identical rows.
 *
 * The roster reuses the developers the developer-level panes already show,
 * deduped, so a reader who opens a line and then a publisher sees the same
 * names in both places.
 */
const LINE_PUBLISHERS: {
  developer_id: number;
  developer_name: string;
  developer_domain: string;
  platform: string;
}[] = (() => {
  const seen = new Set<number>();
  const out: {
    developer_id: number;
    developer_name: string;
    developer_domain: string;
    platform: string;
  }[] = [];
  for (const d of [...DEV_ADDED, ...DEV_CHANGED, ...DEV_REMOVED]) {
    if (seen.has(d.developer_id)) continue;
    seen.add(d.developer_id);
    out.push({
      developer_id: d.developer_id,
      developer_name: d.developer_name ?? `Publisher #${d.developer_id}`,
      developer_domain: d.developer_domain ?? `pub-${d.developer_id}.example`,
      platform: d.developer_platform ?? "Web",
    });
  }
  // A few publishers that only ever show up in the line diff, so a line's
  // roster is not always a subset of the developer panes.
  for (const extra of [
    { developer_id: 60_118, developer_name: "Harbor Point Media", developer_domain: "harborpoint.com", platform: "Web" },
    { developer_id: 27_640, developer_name: "Ironwood Media", developer_domain: "ironwoodmedia.tv", platform: "Roku" },
    { developer_id: 39_255, developer_name: "Kestrel Games", developer_domain: "kestrelgames.games", platform: "Android" },
    { developer_id: 71_083, developer_name: "Tidewater Publishers", developer_domain: "tidewaterpub.com", platform: "Web" },
    { developer_id: 18_446, developer_name: "Halcyon Networks", developer_domain: "halcyon.tv", platform: "Samsung" },
    { developer_id: 55_907, developer_name: "Ember Peak Studios", developer_domain: "emberpeak.io", platform: "iOS" },
    { developer_id: 84_312, developer_name: "Foundry Row Media", developer_domain: "foundryrow.com", platform: "Web" },
  ]) {
    if (seen.has(extra.developer_id)) continue;
    seen.add(extra.developer_id);
    out.push(extra);
  }
  return out;
})();

/** Domains whose files vouch for a developer as their inventory partner.
 *  Drawn from the same publisher roster the line diff walks, so a declarer
 *  named on a card is a publisher the report knows elsewhere. Seven of
 *  them, so the widest declared list runs past the card's five-name cut
 *  and exercises the "and N more" tail. */
const IPD_DECLARERS = [
  "riverstone.com",
  "copperline.tv",
  "harborpoint.com",
  "tidewaterpub.com",
  "halcyon.tv",
  "ironwoodmedia.tv",
  "foundryrow.com",
];

/** A 16-hex TAG-ID, the shape of a real ads.txt fourth field. */
function certId(seed: number): string {
  let h = (seed * 2_654_435_761) >>> 0;
  let out = "";
  while (out.length < 16) {
    h = (h * 1_664_525 + 1_013_904_223) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 16);
}

/**
 * How many publishers the nth line of a bucket moved on. A decaying head
 * plus a long tail of ones, which is how the real distribution looks: a
 * handful of lines move everywhere, most move on one publisher.
 */
const FANOUT = [11, 9, 7, 6, 5, 4, 3, 3, 2, 2, 1, 1, 1, 1];

/** The nth line's fan-out: the head decays a little on each pass, so a
 *  bucket's cards carry a spread of counts rather than a run of identical
 *  ones. */
function fanoutFor(line: number): number {
  return Math.max(1, FANOUT[line % FANOUT.length] - Math.floor(line / FANOUT.length));
}

/** Matches summary.hero_diff.line_totals_matched_seat. */
const MATCHED_SEAT_TARGETS: Record<string, number> = {
  added: 12,
  removed: 27,
  cert_changed: 6,
};

function seededLines(
  ssps: string[],
  event: LineEventKind,
  seed: number,
): LineEvent[] {
  const rows: LineEvent[] = [];
  let line = 0;
  while (rows.length < seed) {
    const remaining = seed - rows.length;
    const fanout = Math.min(fanoutFor(line), remaining);
    const ssp = ssps[line % ssps.length];
    const relationship = line % 3 === 0 ? "DIRECT" : "RESELLER";
    const publisherId = `${ssp.split(".")[0]}-${
      1000 + ((line * 37 + seed * 11) % 8999)
    }`;
    const oldCert = certId(seed * 101 + line * 7);
    const newCert = certId(seed * 313 + line * 13 + 1);
    // Provenance, stamped per LINE rather than per placement so a group's
    // rows cannot disagree about how the line reached the report. Mostly
    // the developer's own file; a handful arrive via an inventory-partner
    // declaration and a couple via a subdomain's file, so both chips have
    // something to render. A file-matched line can still carry declarers:
    // being crawled directly and being vouched for are not exclusive.
    const matchedVia: LineEvent["matched_via"] =
      line % 9 === 4 ? "ipd" : line % 9 === 7 ? "subdomain" : "file";
    const declaredBy =
      matchedVia === "ipd"
        ? IPD_DECLARERS.slice(0, 2 + (line % (IPD_DECLARERS.length - 1)))
        : matchedVia === "file" && line % 13 === 5
          ? IPD_DECLARERS.slice(0, 1)
          : [];
    for (let j = 0; j < fanout; j += 1) {
      const pub = LINE_PUBLISHERS[(line * 5 + j) % LINE_PUBLISHERS.length];
      rows.push({
        developer_id: pub.developer_id,
        developer_name: pub.developer_name,
        developer_domain: pub.developer_domain,
        file_kind: pub.platform === "Web" ? "ads_txt" : "app_ads_txt",
        ssp_domain: ssp,
        publisher_id: publisherId,
        relationship,
        event,
        // A newly monitored line shows only what it looks like NOW: there
        // is no honest "before" for a week we were not watching.
        old_cert_id:
          event === "removed" || event === "monitoring_stopped"
            ? oldCert
            : event === "cert_changed"
              ? oldCert
              : null,
        new_cert_id:
          event === "added" || event === "newly_monitored"
            ? newCert
            : event === "cert_changed"
              ? newCert
              : null,
        matched_seat: false,
        occurred_at: "2026-08-25T09:18:30Z",
        // Two thirds of newly monitored lines were already out there; the
        // rest the book has never seen, so they carry no date and the card
        // says nothing rather than guessing.
        first_seen_at:
          event === "newly_monitored" && line % 3 !== 2
            ? "2026-06-14T00:00:00Z"
            : null,
        matched_via: matchedVia,
        ipd_declared_by: declaredBy,
        ...changeDatesFor(event, line, j),
      });
    }
    line += 1;
  }
  // Seat matches are a property of the line, not of the individual
  // placement, so they are stamped a whole line at a time and the totals
  // land on the same numbers the summary card reports.
  const seatTarget = MATCHED_SEAT_TARGETS[event];
  let stamped = 0;
  for (let i = 0; i < rows.length && stamped < seatTarget; i += 1) {
    const r = rows[i];
    if (i % 7 !== 0) continue;
    const key = `${r.ssp_domain}|${r.publisher_id}|${r.relationship}`;
    // A matched-seat event IS one of the customer's lines, so the rows
    // stamped here take a watchlist line's identity; that is what lets
    // the seat-line filter narrow the Changes page truthfully.
    const seat = CUSTOMER_SEATS[(seed + i) % CUSTOMER_SEATS.length];
    for (const other of rows) {
      if (
        stamped < seatTarget &&
        !other.matched_seat &&
        `${other.ssp_domain}|${other.publisher_id}|${other.relationship}` === key
      ) {
        other.matched_seat = true;
        other.ssp_domain = seat.ssp_domain;
        other.publisher_id = seat.publisher_id;
        other.relationship = seat.relationship;
        stamped += 1;
      }
    }
  }
  return rows;
}

/**
 * A file read time, offset from one of the two crawls' times, so every row
 * carries its own minute rather than the crawl's: a weekly crawl reads
 * files over hours, and the dates on a line are the read's, not the job's.
 */
function readAt(crawl: string, offsetSeconds: number): string {
  return new Date(new Date(crawl).getTime() + offsetSeconds * 1000).toISOString();
}

/**
 * THE DATES BEHIND A CHANGE (2026-10-20), stamped per row so a preview
 * shows every state the live report can be in:
 *
 *   - most rows carry exact read times from the two crawls ("fetch");
 *   - some carry the crawl's own time, the read time not stored ("crawl"),
 *     which the row hints on hover and otherwise prints the same;
 *   - one added line in five was not read in the compared crawl at all
 *     (last_absent_at null), and says so instead of a date;
 *   - one row in four carries no dates, which is what every row on a
 *     report frozen before the dates existed looks like. It must print
 *     "date not available", never a guess.
 */
function changeDatesFor(
  event: LineEventKind,
  line: number,
  j: number,
): Pick<LineEvent, "first_seen_at" | "last_absent_at" | "last_seen_at" | "not_found_at" | "seen_at" | "date_source"> {
  if (line % 4 === 3) return {};
  const fromCrawl = line % 6 === 1;
  const offset = fromCrawl ? 0 : (line * 97 + j * 41) % 5400;
  const thisRead = readAt(MOCK_CRAWL_AT, offset);
  const lastRead = readAt(MOCK_COMPARED_CRAWL_AT, offset);
  const date_source: LineEvent["date_source"] = fromCrawl ? "crawl" : "fetch";
  if (event === "removed")
    return { last_seen_at: lastRead, not_found_at: thisRead, date_source };
  if (event === "added")
    return {
      first_seen_at: thisRead,
      last_absent_at: line % 5 === 2 ? null : lastRead,
      date_source,
    };
  if (event === "cert_changed") return { seen_at: thisRead, date_source };
  return {};
}

/**
 * Lines the crawler could not verify this week. Two, by hand: one whose
 * file never read (so nothing was verified), one whose file read too short
 * to trust (verified on an earlier try, then unreadable). Both sit on the
 * customer's own madeupmedia.com seats and publishers the roster already
 * knows, so the tab reads like the rest of the report.
 */
const UNCONFIRMED_LINES: LineEvent[] = [
  {
    developer_id: 4_411,
    developer_name: "Riverstone Publishers",
    developer_domain: "riverstone.com",
    file_kind: "ads_txt",
    ssp_domain: "madeupmedia.com",
    publisher_id: "2020000103",
    relationship: "DIRECT",
    event: "unconfirmed",
    old_cert_id: null,
    new_cert_id: certId(4_411),
    matched_seat: true,
    occurred_at: "2026-08-25T09:18:30Z",
    matched_via: "file",
    ipd_declared_by: [],
    reason: "The file did not answer in three tries, so the line could not be checked.",
    last_seen_at: readAt(MOCK_COMPARED_CRAWL_AT, 1_260),
    read_at: readAt(MOCK_CRAWL_AT, 2_140),
    verified_at: null,
    tries: 3,
    date_source: "fetch",
  },
  {
    developer_id: 60_118,
    developer_name: "Harbor Point Media",
    developer_domain: "harborpoint.com",
    file_kind: "app_ads_txt",
    ssp_domain: "madeupmedia.com",
    publisher_id: "2020000121",
    relationship: "RESELLER",
    event: "unconfirmed",
    old_cert_id: null,
    new_cert_id: null,
    matched_seat: true,
    occurred_at: "2026-08-25T09:18:30Z",
    matched_via: "file",
    ipd_declared_by: [],
    reason: "The file read far shorter than last week, so its lines were not trusted.",
    last_seen_at: readAt(MOCK_COMPARED_CRAWL_AT, 3_005),
    read_at: readAt(MOCK_CRAWL_AT, 3_311),
    verified_at: readAt(MOCK_CRAWL_AT, 3_349),
    tries: 2,
    date_source: "fetch",
  },
];

const LINE_EVENTS_BY_EVENT: Record<string, LineEvent[]> = {
  added: seededLines(SSPS_ADDED, "added", 127),
  removed: seededLines(SSPS_REMOVED, "removed", 184),
  cert_changed: seededLines(SSPS_REMOVED, "cert_changed", 43),
  first_appearance: seededLines(SSPS_ADDED, "first_appearance", 7),
  // A week where the watchlist moved, so the preview exercises the states
  // a happy-path mock would hide.
  newly_monitored: seededLines(SSPS_ADDED, "newly_monitored", 61),
  monitoring_stopped: seededLines(SSPS_REMOVED, "monitoring_stopped", 9),
  unconfirmed: UNCONFIRMED_LINES,
};

export function mockLineEvents(
  filters: {
    event?: string;
    ssp_domain?: string;
    developer_id?: number;
    matched_seat_only?: boolean;
    page?: number;
    page_size?: number;
    lines?: string[];
  },
): LineEventsPage {
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 50;
  let pool: LineEvent[];
  if (filters.event) {
    pool = LINE_EVENTS_BY_EVENT[filters.event] ?? [];
  } else {
    pool = [
      ...LINE_EVENTS_BY_EVENT.added,
      ...LINE_EVENTS_BY_EVENT.removed,
      ...LINE_EVENTS_BY_EVENT.cert_changed,
      ...LINE_EVENTS_BY_EVENT.newly_monitored,
      ...LINE_EVENTS_BY_EVENT.monitoring_stopped,
      ...LINE_EVENTS_BY_EVENT.first_appearance,
      ...LINE_EVENTS_BY_EVENT.unconfirmed,
    ];
  }
  if (filters.ssp_domain) {
    const needle = filters.ssp_domain.toLowerCase();
    pool = pool.filter((r) => r.ssp_domain.toLowerCase().includes(needle));
  }
  if (filters.developer_id != null) {
    pool = pool.filter((r) => r.developer_id === filters.developer_id);
  }
  if (filters.matched_seat_only) {
    pool = pool.filter((r) => r.matched_seat);
  }
  if (filters.lines && filters.lines.length) {
    const want = new Set(filters.lines);
    pool = pool.filter((r) => r.matched_seat && want.has(seatKey(r)));
  }
  const start = (page - 1) * pageSize;
  return {
    page,
    page_size: pageSize,
    total: pool.length,
    rows: pool.slice(start, start + pageSize),
  };
}

// ─────────────────────────────────────────────────────────────────
// Matched developers + bundles
// ─────────────────────────────────────────────────────────────────

/*
 * 100-row seed for the Matched developers table. Names are hand-picked plus a
 * long-tail generator so screenshots look like a real customer's roster:
 *
 *  - A short head of well-known-looking hero rows (30-60 matched lines)
 *  - A wider mid tier (5-25 lines)
 *  - A long tail of small matches (1-8 lines)
 *
 * Platforms are drawn from the seven a publisher-focused crawler actually
 * sees: Web, iOS, Android, Roku, Samsung, Vizio, FireTV, CTV. Domains follow
 * the platform (`.games` for Android, `.tv` for CTV/Roku/Samsung/Vizio,
 * `.com`/`.io`/`.co` for Web/iOS, etc).
 */
const DEV_HEAD = [
  { developer_id: 4_411, name: "Riverstone Publishers", domain: "riverstone.com", platform: "Web", line_count: 58 },
  { developer_id: 91_204, name: "Chomp Studios", domain: "chompstudios.com", platform: "iOS", line_count: 52 },
  { developer_id: 15_902, name: "Copperline Studios", domain: "copperline.tv", platform: "Vizio", line_count: 47 },
  { developer_id: 78_442, name: "Roost Media", domain: "roostmedia.tv", platform: "Roku", line_count: 44 },
  { developer_id: 82_113, name: "Bluefin Media", domain: "bluefinmedia.com", platform: "Web", line_count: 41 },
  { developer_id: 33_014, name: "Nomad Media Group", domain: "nomadmediagroup.com", platform: "iOS", line_count: 38 },
  { developer_id: 45_701, name: "North Star Games", domain: "northstar.games", platform: "Android", line_count: 34 },
  { developer_id: 66_120, name: "Deep Sea Games", domain: "deepsea.games", platform: "Android", line_count: 31 },
];

const DEV_NAMES = [
  "Aurora TV Networks", "Pixel Cauldron", "Northlight Games", "Beacon Broadcasting",
  "Silver Fern Studios", "Harbor Point Media", "Kestrel Games", "Tidewater Publishers",
  "Ember Peak Studios", "Meadowlark Media", "Copper Canyon Games", "Lantern House Studios",
  "Blackfoot Broadcasting", "Wren & Wolf", "Foundry Row Media", "Great Basin Games",
  "Cloudberry Studios", "Halcyon Networks", "Ironwood Media", "Sable Broadcasting",
  "Alder Hollow", "Marble Falls Media", "Redwing Studios", "Sunburst Publishing",
  "Farrow Media", "Compass Rose Games", "Little Loom", "Storm Front Media",
  "Otter Creek Studios", "Bright Ledger", "Cedarhouse Networks", "Twin Elms Media",
  "Palisade Games", "Kite & Compass", "Northgate Publishers", "Skyward Studios",
  "Halyard Broadcasting", "Wildflour Media", "Lampyre Games", "Rockfall Studios",
  "Fieldnote Media", "Highwater Publishers", "Salt & Steel", "Winterberry Studios",
  "Broadstone Media", "Camber Games", "Driftwood Broadcasting", "Elmshade Publishers",
  "Foghorn Studios", "Glasshouse Media", "Hearthside Games", "Ivyhouse Studios",
  "Juneberry Publishers", "Kernel & Co", "Larkspur Media", "Moonrise Broadcasting",
  "Nightowl Studios", "Overland Networks", "Pinemark Publishers", "Quartz Ridge Games",
  "Riverbend Studios", "Sagebrush Media", "Tallow Broadcasting", "Umberton Games",
  "Voltera Publishers", "Windrose Studios", "Xylo Media", "Yellowstone Publishers",
  "Zephyrline Games", "Ashford Studios", "Bramble Networks", "Coastwise Media",
  "Duskfall Publishers", "Everline Games", "Fenwick Studios", "Grovehouse Broadcasting",
  "Hazel Ridge Media", "Ironbark Publishers", "Junction Row", "Karst Games",
  "Longspur Broadcasting", "Millbrook Studios", "Nectar Networks", "Oakhaven Publishers",
  "Portside Games", "Quill & Anvil", "Runeworks Studios", "Southlark Broadcasting",
  "Thornwood Media", "Underhill Games", "Verdemark Publishers", "Wynder Studios",
];

const PLATFORMS = ["Web", "iOS", "Android", "Roku", "Samsung", "Vizio", "FireTV", "CTV"] as const;

/** Deterministic pseudo-random, so screenshots do not shuffle between reloads. */
function xorshift(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xffffffff);
  };
}

function domainFor(name: string, platform: string, i: number): string {
  const slug = name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  const tld =
    platform === "Android"
      ? i % 3 === 0
        ? ".games"
        : ".io"
      : platform === "Roku" || platform === "Vizio" || platform === "Samsung" || platform === "FireTV" || platform === "CTV"
        ? ".tv"
        : platform === "iOS"
          ? i % 4 === 0
            ? ".io"
            : ".com"
          : i % 5 === 0
            ? ".co"
            : ".com";
  return `${slug}${tld}`;
}

/**
 * The seat line(s) a matched publisher carried, for the overview's expanded
 * row. Generated deterministically from the developer id so a screenshot is
 * stable across reloads, and capped at six for display: a real publisher can
 * match more, but `line_count` carries the honest total. Some lines print a
 * cert id and most do not, exactly the way real ads.txt files split.
 */

/* Every matched publisher and app carries a SUBSET of the customer's
   watchlist above, chosen by id so the same row always carries the same
   lines. That is what gives the seat-line filter something true to
   narrow by. */
function matchedLinesFor(developer_id: number, line_count: number): MatchedSeatLine[] {
  const n = Math.max(1, Math.min(line_count, CUSTOMER_SEATS.length));
  const out: MatchedSeatLine[] = [];
  for (let i = 0; i < n; i += 1) {
    const seat = CUSTOMER_SEATS[(developer_id + i * 5) % CUSTOMER_SEATS.length];
    if (out.some((o) => seatKey(o) === seatKey(seat))) continue;
    const line: MatchedSeatLine = { ...seat };
    // Roughly a quarter of lines carry the optional fourth field.
    if ((developer_id + i) % 4 === 0) line.cert_id = certId(developer_id * 13 + i * 7);
    line.found_in = (developer_id + i) % 3 === 0 ? "both" : "app-ads.txt";
    out.push(line);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Weekly change lines (the seats behind a card's +added / -removed badge)
// ─────────────────────────────────────────────────────────────────

/** SSPs the synthetic weekly changes draw from. A superset of SEAT_LINE_SSPS
 *  so an added / removed line reads like the matched ones beside it. */
const CHANGE_LINE_SSPS = [
  "magnite.com", "openx.com", "pubmatic.com", "rubiconproject.com",
  "appnexus.com", "google.com", "sharethrough.com", "criteo.com",
  "smartadserver.com", "adform.com", "yahoo.com", "spotx.tv",
];

/**
 * Synthesize exactly `count` seat lines behind a weekly change, deterministically
 * from `seed`, in the same shape matchedLinesFor produces. `alwaysCert` forces
 * the fourth field on: a cert change is ABOUT the cert, so those lines always
 * print one. Seeding by the subject id (see changeArrays) keeps the same
 * publisher's lines identical wherever they are shown, so the "All matched" and
 * "Changed" tabs cannot disagree about the same card.
 */
function changeLinesFor(
  seed: number,
  count: number,
  kind: "added" | "removed" | "cert_changed",
): MatchedSeatLine[] {
  const out: MatchedSeatLine[] = [];
  for (let i = 0; i < count; i += 1) {
    const ssp = CHANGE_LINE_SSPS[(seed + i * 3) % CHANGE_LINE_SSPS.length];
    const relationship = (seed + i) % 3 === 0 ? "DIRECT" : "RESELLER";
    const publisher_id = `${ssp.split(".")[0]}-${
      1000 + ((seed * 7 + i * 131) % 8999)
    }`;
    const line: MatchedSeatLine = { ssp_domain: ssp, publisher_id, relationship };
    if (kind === "cert_changed" || (seed + i) % 4 === 0) {
      line.cert_id = certId(seed * 13 + i * 7 + 3);
    }
    // WHERE IT MOVED. The crawler started writing this onto the change
    // windows on 2026-09-26; before that the artifact carried no lines at
    // all behind those counts, and this mock invented them WITHOUT the
    // file, which is exactly how the gap stayed invisible in preview.
    line.found_in = (seed + i) % 5 === 0 ? "both" : (seed + i) % 2 === 0 ? "ads.txt" : "app-ads.txt";
    // WHEN IT MOVED (2026-10-20): the same dates the Changes page prints,
    // in the same mix of states (see changeDatesFor).
    Object.assign(line, changeDatesFor(kind, seed + i, i));
    out.push(line);
  }
  return out;
}

/** The three change-line arrays for one subject, sized to match its counts.
 *  Seeded off the subject id (with a per-kind offset), so the arrays are stable
 *  across reloads and identical wherever the same subject appears. */
function changeArrays(
  id: number,
  added: number,
  removed: number,
  cert: number,
): {
  added_lines: MatchedSeatLine[];
  removed_lines: MatchedSeatLine[];
  cert_changed_lines: MatchedSeatLine[];
} {
  return {
    added_lines: changeLinesFor(id * 2 + 1, added, "added"),
    removed_lines: changeLinesFor(id * 2 + 501, removed, "removed"),
    cert_changed_lines: changeLinesFor(id * 2 + 907, cert, "cert_changed"),
  };
}

/** A publisher's weekly change counts, keyed off its id so the four cases the
 *  expanded card can show — added only, removed only, both (+ cert), and stable
 *  — are spread deterministically across the matched roster. Publishers that
 *  also drive a change tab reuse those exact counts instead (see
 *  DEV_EVENT_CHANGE), so a card reads the same in every list it appears in. */
function changeProfileFor(id: number): {
  added: number;
  removed: number;
  cert: number;
} {
  switch (id % 5) {
    case 0:
      return { added: 0, removed: 0, cert: 0 }; // stable, matched but held steady
    case 1:
      return { added: 1 + (id % 6), removed: 0, cert: 0 }; // added only
    case 2:
      return { added: 0, removed: 1 + ((id >> 2) % 5), cert: 0 }; // removed only
    case 3:
      return { added: 1 + (id % 5), removed: 1 + ((id >> 2) % 4), cert: 0 }; // both
    default:
      return {
        added: 2 + (id % 4),
        removed: 1 + ((id >> 2) % 3),
        cert: 1 + ((id >> 3) % 3),
      }; // both, plus a cert rotation (the three-window case)
  }
}

/** Change counts for every publisher that drives a change tab, so the same
 *  publisher shown under "All matched" reconciles to its Changed-tab numbers. */
const DEV_EVENT_CHANGE: Record<
  number,
  { added: number; removed: number; cert: number }
> = {};
for (const d of [...DEV_ADDED, ...DEV_REMOVED, ...DEV_CHANGED]) {
  DEV_EVENT_CHANGE[d.developer_id] = {
    added: d.lines_added,
    removed: d.lines_removed,
    cert: d.lines_cert_changed,
  };
}

function buildMatchedDevs(): {
  developer_id: number;
  name: string;
  domain: string;
  platform: string;
  line_count: number;
  lines_added: number;
  lines_removed: number;
  lines_cert_changed: number;
  matched_lines: MatchedSeatLine[];
  added_lines: MatchedSeatLine[];
  removed_lines: MatchedSeatLine[];
  cert_changed_lines: MatchedSeatLine[];
}[] {
  const rows: { developer_id: number; name: string; domain: string; platform: string; line_count: number }[] = [
    ...DEV_HEAD,
  ];
  const rnd = xorshift(1_337);
  // 260, not 92. The page size is 100, so a list that stops at the name
  // supply produces exactly one page and the pager never renders -- which
  // would leave pagination unreviewable in the one mode built for reviewing
  // the shell. Names cycle with a suffix past the supply; a real report is
  // far larger still (Boldwin matches 18,665 publishers).
  const MOCK_DEV_ROWS = 260;
  for (let i = 0; i < MOCK_DEV_ROWS && rows.length < MOCK_DEV_ROWS; i += 1) {
    const base = DEV_NAMES[i % DEV_NAMES.length];
    const name =
      i < DEV_NAMES.length ? base : `${base} ${Math.floor(i / DEV_NAMES.length) + 1}`;
    const platform = PLATFORMS[Math.floor(rnd() * PLATFORMS.length)];
    // Long-tail: a handful in 8-24, most in 1-8.
    const r = rnd();
    const line_count =
      r < 0.15 ? 8 + Math.floor(rnd() * 18) : 1 + Math.floor(rnd() * 8);
    rows.push({
      developer_id: 100_000 + i * 37,
      name,
      domain: domainFor(name, platform, i),
      platform,
      line_count,
    });
  }
  // Sort by line_count desc so the head reads as head, then attach the matched
  // seat lines each row exposes on the overview's expanded card, plus this
  // week's change (counts + the lines behind them). A publisher that also
  // drives a change tab reuses those exact counts; everyone else gets a
  // deterministic profile spread across the four cases the card can show.
  return rows
    .sort((a, b) => b.line_count - a.line_count)
    .map((d) => {
      const prof =
        DEV_EVENT_CHANGE[d.developer_id] ?? changeProfileFor(d.developer_id);
      return {
        ...d,
        lines_added: prof.added,
        lines_removed: prof.removed,
        lines_cert_changed: prof.cert,
        matched_lines: matchedLinesFor(d.developer_id, d.line_count),
        ...changeArrays(d.developer_id, prof.added, prof.removed, prof.cert),
      };
    });
}

/**
 * Search and page a mock list the way the server does.
 *
 * Mock mode exists so the shell can be reviewed without a live report, and a
 * mock that ignored `page` and `q` would mean the search box and the pager
 * were inert on exactly the screen built to demonstrate them -- reviewed as
 * working when nothing had been exercised.
 *
 * Mirrors `viewer_frozen._search` and `_page`: case-insensitive substring
 * over the named fields, and a FILTERED total so the pager counts what the
 * search found.
 */
function mockPage<T extends Record<string, unknown>>(
  all: T[],
  page: number,
  q: string,
  fields: (keyof T)[],
  pageSize = 250,
): { page: number; page_size: number; total: number; truncated: boolean; rows: T[] } {
  const needle = (q || "").trim().toLowerCase();
  const matched = needle
    ? all.filter((r) =>
        fields.some((f) => String(r[f] ?? "").toLowerCase().includes(needle)),
      )
    : all;
  const start = Math.max(0, (page - 1) * pageSize);
  return {
    page,
    page_size: pageSize,
    total: matched.length,
    // Mock data is always whole, so this is always false. Present anyway so
    // the field exists in the shape the real server returns.
    truncated: false,
    rows: matched.slice(start, start + pageSize),
  };
}

const MATCHED_DEVS = buildMatchedDevs();

export function mockMatchedDevelopers(
  page: number,
  q = "",
  lines: string[] = [],
  /** null: a report frozen before match types (today's exact answer). */
  matchType: MatchTypeFilter | null = null,
): MatchedDevelopersPage {
  if (matchType !== null) return matchTypePublishers(page, q, lines, matchType);
  const pool = MATCHED_DEVS.filter((d) => carries(d.matched_lines, lines));
  return mockPage(pool, page, q, ["name", "domain"], PAGE_SIZE) as MatchedDevelopersPage;
}

/* App bundle seed. Long-tail same as developers: a head of hero apps that
 * screenshot well, then a run of small matches, drawn from the developer
 * roster so the two tables reconcile. */
const APP_NOUNS = [
  "Puzzles", "Weekly", "Live", "Arcade", "Reader", "Now", "Daily", "Studio",
  "Radio", "Cast", "Watch", "Play", "Notes", "Tribune", "Journal", "Times",
  "Guide", "Herald", "Report", "Beat", "Signal", "Weather", "Reef", "Trail",
  "Coop", "Home", "Voice", "Pulse", "Currents",
];
const STORES = ["ios", "android", "roku", "vizio", "samsung", "firetv", "ctv"] as const;

function bundleIdFor(store: string, name: string, i: number): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (store === "ios") return `${1_100_000_000 + i * 137}`;
  if (store === "android") return `com.${slug}.${APP_NOUNS[i % APP_NOUNS.length].toLowerCase()}`;
  if (store === "roku") return `${400_000 + i * 91}`;
  if (store === "vizio") return `vz-${slug}-${(i % 12) + 1}`;
  if (store === "samsung") return `sm-${slug}-${(i % 8) + 1}`;
  if (store === "firetv") return `B0${(8 + (i % 2))}${slug.slice(0, 6).toUpperCase()}${i % 10}${(i * 7) % 10}`;
  return `${slug}.app.v${(i % 5) + 1}`;
}

function buildMatchedBundles(): {
  store: string;
  bundle_id: string;
  app_name: string;
  developer_id: number;
  developer_name: string;
  developer_domain: string;
  line_count: number;
}[] {
  const rnd = xorshift(4_242);
  const rows: {
    store: string;
    bundle_id: string;
    app_name: string;
    developer_id: number;
    developer_name: string;
    developer_domain: string;
    line_count: number;
  }[] = [];
  // At least one app per top developer, then extras drawn round-robin.
  const heads = MATCHED_DEVS.slice(0, 20);
  for (let i = 0; i < 60; i += 1) {
    const dev = heads[i % heads.length];
    const platform = dev.platform.toLowerCase();
    const store = STORES.includes(platform as (typeof STORES)[number])
      ? (platform as (typeof STORES)[number])
      : STORES[i % STORES.length];
    const noun = APP_NOUNS[i % APP_NOUNS.length];
    const app_name = `${dev.name.split(/\s+/)[0]} ${noun}`;
    const r = rnd();
    const line_count = r < 0.12 ? 14 + Math.floor(rnd() * 20) : 1 + Math.floor(rnd() * 10);
    rows.push({
      store,
      bundle_id: bundleIdFor(store, dev.name, i),
      app_name,
      developer_id: dev.developer_id,
      developer_name: dev.name,
      developer_domain: dev.domain,
      line_count,
    });
  }
  return rows.sort((a, b) => b.line_count - a.line_count);
}

const MATCHED_BUNDLES = buildMatchedBundles();

export function mockMatchedBundles(page: number, q = ""): MatchedBundlesPage {
  return mockPage(MATCHED_BUNDLES, page, q, ["app_name", "bundle_id", "developer_name", "developer_domain"]) as MatchedBundlesPage;
}

/**
 * Bundles grouped by developer_id so the nested "Results" list can expand a
 * developer row and reveal every app that developer publishes without a
 * second request.
 */
export function bundlesForDeveloper(developer_id: number) {
  return MATCHED_BUNDLES.filter((b) => b.developer_id === developer_id);
}

// ─────────────────────────────────────────────────────────────────
// Matched apps (the pink list on the overview)
// ─────────────────────────────────────────────────────────────────

/*
 * Apps whose app-ads.txt carried the customer's seats, each with the
 * PUBLISHER that owns it. Owners are drawn from the matched-publisher roster
 * (web publishers excluded, since they ship no apps) so the two lists
 * reconcile: an app's owner is a publisher the reader can also find under
 * Matched publishers. Deterministic, like the rest of this fixture, and a
 * couple of dozen strong so the list reads as real.
 */
function buildMatchedApps(): MatchedApp[] {
  const rnd = xorshift(9_931);
  const owners = MATCHED_DEVS.filter((d) => d.platform !== "Web");
  const rows: MatchedApp[] = [];
  for (let i = 0; i < 42; i += 1) {
    const owner = owners[i % owners.length];
    const store = owner.platform.toLowerCase();
    const noun = APP_NOUNS[i % APP_NOUNS.length];
    const r = rnd();
    // A short head of hero apps, then a long tail of small matches.
    const line_count =
      r < 0.16 ? 10 + Math.floor(rnd() * 22) : 1 + Math.floor(rnd() * 9);
    // Weekly change profile, so the app tabs (Added / Removed / Changed) have
    // real content and the expanded card exercises all four of its states.
    // Most apps have no change and sit under All matched only (the stable,
    // flat-list case). The rest split across added only, removed only, cert
    // only, added+removed (two windows), and a slice of added+removed+cert
    // (three windows).
    const c = rnd();
    let lines_added = 0;
    let lines_removed = 0;
    let lines_cert_changed = 0;
    if (c < 0.2) {
      lines_added = 1 + Math.floor(rnd() * 8);
    } else if (c < 0.38) {
      lines_removed = 1 + Math.floor(rnd() * 6);
    } else if (c < 0.5) {
      lines_cert_changed = 1 + Math.floor(rnd() * 4);
    } else if (c < 0.58) {
      lines_added = 1 + Math.floor(rnd() * 5);
      lines_removed = 1 + Math.floor(rnd() * 4);
    } else if (c < 0.63) {
      lines_added = 2 + Math.floor(rnd() * 4);
      lines_removed = 1 + Math.floor(rnd() * 3);
      lines_cert_changed = 1 + Math.floor(rnd() * 2);
    }
    // One seed drives both the standing match and the change lines for this
    // app, so a screenshot is stable and the two never contradict each other.
    const appSeed = owner.developer_id + i * 17;
    rows.push({
      store,
      bundle_id: bundleIdFor(store, owner.name, i),
      app_name: `${owner.name.split(/\s+/)[0]} ${noun}`,
      owner_domain: owner.domain,
      owner_name: owner.name,
      line_count,
      lines_added,
      lines_removed,
      lines_cert_changed,
      matched_lines: matchedLinesFor(appSeed, line_count),
      ...changeArrays(appSeed, lines_added, lines_removed, lines_cert_changed),
    });
  }
  return rows.sort((a, b) => b.line_count - a.line_count);
}

const MATCHED_APPS = buildMatchedApps();

export function mockMatchedApps(
  page: number,
  q = "",
  lines: string[] = [],
  /** null: a report frozen before match types (today's exact answer). */
  matchType: MatchTypeFilter | null = null,
): MatchedAppsPage {
  if (matchType !== null) return matchTypeApps(page, q, lines, matchType);
  const pool = MATCHED_APPS.filter((a) => carries(a.matched_lines, lines));
  return mockPage(pool, page, q, ["app_name", "bundle_id", "owner_domain"], PAGE_SIZE) as MatchedAppsPage;
}

// ─────────────────────────────────────────────────────────────────
// Match type: own or IPD (crawler PR #348, inventory sharing)
// ─────────────────────────────────────────────────────────────────
//
// Only on a report that carries match types (mock mode by default,
// ``?matchtype=off`` for one frozen before them; the e2e fake API's
// ``matchType`` scenario). Off, every function above answers exactly
// what it always did.
//
// THE OWNER'S GOLDEN SCENARIO, real-world-correct (mock-data rule,
// 2026-10-07: no real platform is ever shown naming a partner it does not
// name). Checked live on 2026-10-25:
//   * samsungtvplus.com/app-ads.txt (served from tvplus.adgrx.com) carries
//     ``inventorypartnerdomain=failarmy.tv`` (line 348 that day);
//   * failarmy.tv/ads.txt answers 200 (www.failarmy.tv, Trusted Media
//     Brands), so this crawl "read" it;
//   * com.samsung.android.tvplus is the Samsung TV Plus app on Google Play.
// The customer's seat lines in that ads.txt are the invented
// madeupmedia.com lines, as everywhere in this mock. So the Samsung TV Plus
// app, and its publisher, match through failarmy.tv: IPD rows, counted in
// the one Matched number, listed under All and IPD, never under Own.
//
// Everything else here is invented and belongs to nobody (NXDOMAIN, no NS,
// 404 on Google Play, 2026-10-25): Northfold TV (northfold-tv.com,
// tv.northfold.app) matches on its own app-ads.txt and carries the roles
// sample; Tidewick TV (tidewick-tv.com) names northfold-tv.com as its
// inventory partner, but this crawl did not read northfold-tv.com's
// ads.txt, so those IPD matches are inconclusive: never a row, never
// counted, one quiet note. copperline-media.tv is the invented manager.

export const MT_PARTNER = "failarmy.tv";
export const MT_PLATFORM = {
  developer_id: 990_301,
  name: "Samsung TV Plus",
  domain: "samsungtvplus.com",
  bundle: "com.samsung.android.tvplus",
};
const MT_SEATS = CUSTOMER_SEATS.filter((l) => l.ssp_domain === "madeupmedia.com").slice(1, 9);
export const MT_INCONCLUSIVE = [{ partner: "northfold-tv.com", platform: "Tidewick TV" }];
const mtLines = (found_in: string): MatchedSeatLine[] => MT_SEATS.map((l) => ({ ...l, found_in }));
const MT_NO_CHANGE = {
  lines_added: 0,
  lines_removed: 0,
  lines_cert_changed: 0,
  added_lines: [] as MatchedSeatLine[],
  removed_lines: [] as MatchedSeatLine[],
  cert_changed_lines: [] as MatchedSeatLine[],
};
const MT_OWN: MatchTypeFields = { match_type: "own" };
const MT_IPD: MatchTypeFields = {
  match_type: "ipd",
  ipd_partner: MT_PARTNER,
  ipd_platform: MT_PLATFORM.name,
  // The crawler sends the declaring file by its display name.
  declared_in: `${MT_PLATFORM.name}'s app-ads.txt`,
  seller_role: "reseller",
};
/** The partner's ads.txt gained two of the customer's lines this week, so
 *  the platform's IPD rows (publisher, app, and the Added event) move. */
const MT_ADDED = {
  ...MT_NO_CHANGE,
  lines_added: 2,
  added_lines: MT_SEATS.slice(0, 2).map((l) => ({ ...l, found_in: "ads.txt" })),
};
const NORTHFOLD_LINES = (): MatchedSeatLine[] =>
  CUSTOMER_SEATS.slice(40, 43).map((l) => ({ ...l, found_in: "app-ads.txt" }));
const NORTHFOLD_ROLES: MatchTypeFields = {
  seller_role: "reseller",
  managed_by: "copperline-media.tv (GB)",
  verdict_alerts: [
    "Listed as DIRECT, but sellers.json names copperline-media.tv, not northfold-tv.com: treated as a reseller.",
    "Two managers for one country (GB): neither counts there.",
  ],
  partner_inventory_on: ["Tidewick TV"],
};

const MT_PUBLISHERS: MatchedDeveloper[] = [
  {
    developer_id: MT_PLATFORM.developer_id,
    name: MT_PLATFORM.name,
    domain: MT_PLATFORM.domain,
    platform: "Samsung",
    line_count: MT_SEATS.length,
    matched_lines: mtLines("ads.txt"),
    ...MT_ADDED,
    file_hosts: [],
    ...MT_IPD,
  },
  {
    developer_id: 990_310,
    name: "Northfold TV",
    domain: "northfold-tv.com",
    platform: "CTV",
    line_count: 3,
    matched_lines: NORTHFOLD_LINES(),
    ...MT_NO_CHANGE,
    file_hosts: [],
    ...MT_OWN,
    ...NORTHFOLD_ROLES,
  },
];

const MT_APPS: MatchedApp[] = [
  {
    store: "android",
    bundle_id: MT_PLATFORM.bundle,
    app_name: MT_PLATFORM.name,
    owner_domain: MT_PLATFORM.domain,
    owner_name: MT_PLATFORM.name,
    developer_id: MT_PLATFORM.developer_id,
    line_count: MT_SEATS.length,
    matched_lines: mtLines("ads.txt"),
    ...MT_ADDED,
    // Credited from the partner's ads.txt (file_source of crawler #348).
    file_host: MT_PARTNER,
    file_source: "inventory_partner",
    ...MT_IPD,
  },
  {
    store: "android",
    bundle_id: "tv.northfold.app",
    app_name: "Northfold TV",
    owner_domain: "northfold-tv.com",
    owner_name: "Northfold TV",
    developer_id: 990_310,
    line_count: 3,
    matched_lines: NORTHFOLD_LINES(),
    ...MT_NO_CHANGE,
    file_host: "northfold-tv.com",
    file_source: "own_domain",
    ...MT_OWN,
    ...NORTHFOLD_ROLES,
  },
];

function mtSplit<T extends MatchTypeFields>(
  rows: T[],
  matchType: MatchTypeFilter,
): { rows: T[]; counts: MatchTypeCounts } {
  const ipd = rows.filter((r) => r.match_type === "ipd").length;
  return {
    rows: matchType === "all" ? rows : rows.filter((r) => (r.match_type ?? "own") === matchType),
    counts: { all: rows.length, own: rows.length - ipd, ipd },
  };
}
function mtSearch<T>(rows: T[], q: string, text: (r: T) => (string | null | undefined)[]): T[] {
  const needle = (q || "").trim().toLowerCase();
  return needle ? rows.filter((r) => text(r).some((v) => (v ?? "").toLowerCase().includes(needle))) : rows;
}
/** The note's IPD matches ride on Northfold TV's lines: they leave with a
 *  line filter that drops those. */
function mtInconclusive(lines: string[], count: number) {
  return carries(CUSTOMER_SEATS.slice(40, 43), lines) ? { count, examples: MT_INCONCLUSIVE } : null;
}

function matchTypePublishers(
  page: number,
  q: string,
  lines: string[],
  matchType: MatchTypeFilter,
): MatchedDevelopersPage {
  const all: MatchedDeveloper[] = [
    ...MATCHED_DEVS.map((d): MatchedDeveloper => ({ ...d, ...MT_OWN })),
    ...MT_PUBLISHERS,
  ].sort((a, b) => b.line_count - a.line_count);
  const pool = mtSearch(
    all.filter((d) => carries(d.matched_lines, lines)),
    q,
    (d) => [d.name, d.domain, d.ipd_partner, d.ipd_platform],
  );
  const split = mtSplit(pool, matchType);
  return {
    ...(mockPage(split.rows, page, "", [], PAGE_SIZE) as MatchedDevelopersPage),
    match_type_counts: split.counts,
    ipd_inconclusive: mtInconclusive(lines, 1),
  };
}

function matchTypeApps(page: number, q: string, lines: string[], matchType: MatchTypeFilter): MatchedAppsPage {
  const all: MatchedApp[] = [...MATCHED_APPS.map((a): MatchedApp => ({ ...a, ...MT_OWN })), ...MT_APPS].sort(
    (a, b) => b.line_count - a.line_count,
  );
  const pool = mtSearch(
    all.filter((a) => carries(a.matched_lines, lines)),
    q,
    (a) => [a.app_name, a.bundle_id, a.owner_domain, a.ipd_partner, a.ipd_platform],
  );
  const split = mtSplit(pool, matchType);
  const start = (page - 1) * PAGE_SIZE;
  return {
    page,
    page_size: PAGE_SIZE,
    total: split.rows.length,
    truncated: false,
    rows: split.rows.slice(start, start + PAGE_SIZE),
    match_type_counts: split.counts,
    // Tidewick TV's two apps, through northfold-tv.com: not read, not counted.
    ipd_inconclusive: mtInconclusive(lines, 2),
  };
}

/** The IPD event of the week: the partner's two new lines, on the platform. */
const MT_ADDED_EVENT: DeveloperEvent = {
  developer_id: MT_PLATFORM.developer_id,
  developer_name: MT_PLATFORM.name,
  developer_domain: MT_PLATFORM.domain,
  developer_platform: "Samsung",
  matched_lines_prev: MT_SEATS.length - MT_ADDED.lines_added,
  matched_lines_current: MT_SEATS.length,
  lines_newly_monitored: 0,
  lines_monitoring_stopped: 0,
  top_ssps: [{ ssp_domain: "madeupmedia.com", count: MT_ADDED.lines_added }],
  occurred_at: "2026-08-25T09:18:40Z",
  ...MT_ADDED,
  matched_lines: mtLines("ads.txt"),
  ...MT_IPD,
};

function matchTypeEvents(
  event: string,
  rows: DeveloperEvent[],
  page: number,
  lines: string[],
  matchType: MatchTypeFilter,
): DeveloperEventsPage {
  const all: DeveloperEvent[] = [
    ...rows.map((d): DeveloperEvent => ({ ...d, ...MT_OWN })),
    // An IPD row under Added, with its partner, platform and file: the
    // developer-events rows carry them too (crawler #348).
    ...(event === "added" && carries(MT_ADDED_EVENT.matched_lines, lines) ? [MT_ADDED_EVENT] : []),
  ];
  const split = mtSplit(all, matchType);
  return {
    event,
    page,
    page_size: PAGE_SIZE,
    total: split.rows.length,
    rows: split.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    match_type_counts: split.counts,
  };
}

/** The summary under a seat-line filter: the matched counters re-counted
 *  over what carries the selected lines. Everything else stays crawl-wide. */
export function mockSummaryFor(lines: string[]): Summary {
  // The discovery domains, as the API serves them; none with the
  // ``?discovery=none`` escape hatch, where the report looked for none.
  const discover =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("discovery") === "none"
      ? []
      : DISCOVERY_SSPS.map((s) => s.domain);
  const base: Summary = { ...mockSummary, watchlist: { seats: CUSTOMER_SEATS, discover } };
  if (lines.length === 0) return base;
  const want = new Set(lines);
  const devs = MATCHED_DEVS.filter((d) => carries(d.matched_lines, lines));
  const apps = MATCHED_APPS.filter((a) => carries(a.matched_lines, lines));
  const lineTotal = devs.reduce(
    (n, d) => n + d.matched_lines.filter((l) => want.has(seatKey(l))).length,
    0,
  );
  // This week's changes, re-counted over the selected lines: matched-seat
  // events only, since only those carry a watchlist line's identity.
  const count = (kind: string) =>
    (LINE_EVENTS_BY_EVENT[kind] ?? []).filter((r) => r.matched_seat && want.has(seatKey(r))).length;
  return {
    ...base,
    counters: {
      ...base.counters,
      matched: { lines: lineTotal, developers: devs.length, apps: apps.length },
      // Last week is never filtered, so the backend sends no found / lost.
      matched_moves: null,
    },
    hero_diff: {
      ...base.hero_diff,
      line_totals: {
        ...base.hero_diff.line_totals,
        added: count("added"),
        removed: count("removed"),
        cert_changed: count("cert_changed"),
        unconfirmed: count("unconfirmed"),
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// Per-developer line events (for the nested expansion + api.linesForDeveloper)
// ─────────────────────────────────────────────────────────────────

/**
 * Build synthetic per-developer line events for the top matched developers so
 * an expanded row can show real "which of my seats matched here" content
 * without a live backend. Every event covers a plausible SSP + relationship
 * combination, and the total per developer stays between 1 and 3 so the row
 * still reads compactly.
 */
function buildLinesByDeveloper(): Record<number, LineEvent[]> {
  const map: Record<number, LineEvent[]> = {};
  const topDevs = MATCHED_DEVS.slice(0, 20);
  const eventCycle: ("added" | "removed" | "cert_changed")[] = [
    "added",
    "removed",
    "cert_changed",
  ];
  const sspCycle = [
    "magnite.com",
    "openx.com",
    "pubmatic.com",
    "rubiconproject.com",
    "appnexus.com",
    "google.com",
    "sharethrough.com",
    "criteo.com",
  ];
  topDevs.forEach((dev, idx) => {
    const count = 1 + (idx % 3);
    const rows: LineEvent[] = [];
    for (let i = 0; i < count; i += 1) {
      const ssp = sspCycle[(idx + i) % sspCycle.length];
      const relationship = (idx + i) % 3 === 0 ? "DIRECT" : "RESELLER";
      const evt = eventCycle[(idx + i) % eventCycle.length];
      rows.push({
        developer_id: dev.developer_id,
        developer_name: dev.name,
        developer_domain: dev.domain,
        file_kind: dev.platform === "Web" ? "ads_txt" : "app_ads_txt",
        ssp_domain: ssp,
        publisher_id: `${ssp.split(".")[0]}-${10_000 + dev.developer_id % 8999}`,
        relationship,
        event: evt,
        old_cert_id: evt === "removed" || evt === "cert_changed" ? `old-cert-${dev.developer_id}` : null,
        new_cert_id: evt === "added" || evt === "cert_changed" ? `new-cert-${dev.developer_id}` : null,
        matched_seat: true,
        occurred_at: "2026-08-25T09:18:30Z",
        // Every fifth row reached the report through an inventory-partner
        // declaration, so the overview's expanded mini list exercises its
        // provenance chip too.
        matched_via: (idx + i) % 5 === 2 ? "ipd" : "file",
        ipd_declared_by:
          (idx + i) % 5 === 2 ? IPD_DECLARERS.slice(0, 2) : [],
      });
    }
    map[dev.developer_id] = rows;
  });
  return map;
}

const LINES_BY_DEVELOPER = buildLinesByDeveloper();

/** All matched-seat line events for one developer. Empty array if unknown. */
export function linesForDeveloper(developer_id: number): LineEvent[] {
  return LINES_BY_DEVELOPER[developer_id] ?? [];
}

// ─────────────────────────────────────────────────────────────────
// Discovered lines
// ─────────────────────────────────────────────────────────────────

/*
 * Seed for the "Discovered lines" page, grouped by LINE rather than by
 * (publisher x line): a line is kept because its SSP domain is on the run's
 * discover_domains list, not because it matched an exact seat line.
 *
 * Modelled on the operator's real case: a crawl for madeupmedia.com and
 * madeupmedia.la with no seat lines at all. Most lines therefore carry one of
 * those two domains; a couple of others are mixed in because an operator
 * usually lists every domain a partner is known to publish under.
 *
 * Shape and ordering are the contract documented on api.discoveredLines:
 * placements_count DESC, then ssp_domain, then publisher_id, with a
 * previous-crawl count on every line so the weekly delta is a real
 * subtraction rather than a decoration.
 */

/** Discovery domains, weighted: the two real ones dominate. */
const DISCOVERY_SSPS: { domain: string; weight: number }[] = [
  { domain: "madeupmedia.com", weight: 46 },
  { domain: "madeupmedia.la", weight: 34 },
  { domain: "madeupmedia-ads.com", weight: 12 },
  { domain: "madeupmedia-video.com", weight: 8 },
];

const DISCOVERY_SSP_PICK: string[] = DISCOVERY_SSPS.flatMap((s) =>
  Array<string>(s.weight).fill(s.domain),
);

/* 40 x 16 = 640 distinct publisher names, so the widest line (431
 * publishers) has a real roster to draw from without repeating anyone, and
 * the roster reads the way a discovery run's does: a long list of
 * publishers nobody on the customer side has heard of, which is exactly the
 * point of the page. */
const DISCOVERED_PREFIX = [
  "Hollow Creek", "Ridgeline", "Copper Kettle", "Saltmarsh", "Bright Anvil",
  "Fernhill", "Windward", "Barrowfield", "Lowtide", "Kestrelwood",
  "Amber Row", "Northbank", "Stonefall", "Wildergreen", "Pale Harbor",
  "Tinderbox", "Clearwater", "Highfen", "Rookery", "Gladewater",
  "Thistledown", "Oxbow", "Marlstone", "Quiet Harbor", "Bramblewick",
  "Falconridge", "Greyhawk", "Hartfield", "Ivory Gate", "Junipergrove",
  "Kelpwood", "Larkfield", "Millrace", "Netherfold", "Orchard Row",
  "Pinewater", "Quarryside", "Redgate", "Sablewood", "Thornbury",
];

const DISCOVERED_SUFFIX = [
  "Media", "Studios", "Networks", "Publishers", "Interactive",
  "Broadcasting", "Games", "Digital", "Press", "Group",
  "Labs", "Collective", "Partners", "Works", "House", "Company",
];

/** A publisher account id in the shape the named SSP hands out. */
function discoveredPublisherId(ssp: string, n: number): string {
  if (ssp === "madeupmedia-video.com") return `sb-${(n % 90_000) + 10_000}`;
  if (ssp === "madeupmedia.la") return `${(n % 900_000) + 100_000}`;
  if (ssp === "madeupmedia-ads.com") return `cm${(n % 90_000) + 10_000}`;
  return `${(n % 9_000_000) + 1_000_000}`;
}

/** A TAG-ish 16-hex cert id; only some publishers bother to print one. */
function discoveredCertId(n: number): string {
  let out = "";
  let x = (n * 2_246_822_519 + 374_761_393) >>> 0;
  for (let i = 0; i < 16; i += 1) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out += "0123456789abcdef"[x % 16];
  }
  return out;
}

/** The publisher roster a discovery crawl walks. Deduped by domain. */
type MockDiscoveryPublisher = {
  developer_domain: string;
  developer_name: string;
  platform: string;
};

function buildDiscoveryPublishers(): MockDiscoveryPublisher[] {
  const rnd = xorshift(51_477);
  const seen = new Set<string>();
  const out: MockDiscoveryPublisher[] = [];
  const total = DISCOVERED_PREFIX.length * DISCOVERED_SUFFIX.length;
  for (let i = 0; i < total; i += 1) {
    const name = `${DISCOVERED_PREFIX[i % DISCOVERED_PREFIX.length]} ${
      DISCOVERED_SUFFIX[
        Math.floor(i / DISCOVERED_PREFIX.length) % DISCOVERED_SUFFIX.length
      ]
    }`;
    const platform = PLATFORMS[Math.floor(rnd() * PLATFORMS.length)];
    const developer_domain = domainFor(name, platform, i);
    if (seen.has(developer_domain)) continue;
    seen.add(developer_domain);
    out.push({ developer_domain, developer_name: name, platform });
  }
  return out;
}

const DISCOVERY_PUBLISHERS = buildDiscoveryPublishers();

/** A line before its placements are attached. */
type MockLineSpec = {
  ssp_domain: string;
  publisher_id: string;
  relationship: string;
  cert_id: string;
  placements_count: number;
  previous_placements_count: number | null;
};

/*
 * The head of the list, written by hand rather than generated, for one
 * reason: the first screen has to show all four delta states. A reviewer
 * looking at a screenshot should be able to see "up", "down", "no change"
 * and "new" without scrolling or filtering, and a generator seeded to
 * produce a pleasing head is a generator that will stop producing one the
 * next time the seed moves.
 *
 * The counts are the operator's real shape: two lines carried by hundreds
 * of publishers, then a fall-off.
 */
const DISCOVERED_HEAD: MockLineSpec[] = [
  {
    ssp_domain: "madeupmedia.com",
    publisher_id: "1042318",
    relationship: "RESELLER",
    cert_id: "4a7be0c1d9f23b58",
    placements_count: 431,
    previous_placements_count: 402, // up 29
  },
  {
    ssp_domain: "madeupmedia.la",
    publisher_id: "618402",
    relationship: "RESELLER",
    cert_id: "",
    placements_count: 387,
    previous_placements_count: 391, // down 4
  },
  {
    ssp_domain: "madeupmedia.com",
    publisher_id: "2884190",
    relationship: "DIRECT",
    cert_id: "b1f4c72e5a08d9c3",
    placements_count: 264,
    previous_placements_count: 264, // no change
  },
  {
    ssp_domain: "madeupmedia.la",
    publisher_id: "774061",
    relationship: "RESELLER",
    cert_id: "9c02ea41b7d5f6a8",
    placements_count: 198,
    previous_placements_count: null, // new this week
  },
  {
    ssp_domain: "madeupmedia.com",
    publisher_id: "3390514",
    relationship: "RESELLER",
    cert_id: "",
    placements_count: 176,
    previous_placements_count: 151, // up 25
  },
  {
    ssp_domain: "madeupmedia-ads.com",
    publisher_id: "cm41288",
    relationship: "RESELLER",
    cert_id: "77d3b0e9c142a5fb",
    placements_count: 143,
    previous_placements_count: 158, // down 15
  },
  // LINES THAT NEED FIXING (2026-10-14), each the shape seen on a real
  // own-domain report: a seller ID with letters where the SSP's are digits,
  // a placeholder ID with a cert id cut short, a cert id with pasted HTML,
  // and the same seller ID as RESELLER where its DIRECT line is the wide
  // one. The seller the file lists as PUBLISHER but publishers carry as
  // RESELLER is cm41288 above (see SELLER_TYPE_PIN).
  {
    ssp_domain: "madeupmedia.com",
    publisher_id: "l0p9531e427dc0a8",
    relationship: "RESELLER",
    cert_id: "4a7be0c1d9f23b58",
    placements_count: 112,
    previous_placements_count: 104,
  },
  {
    ssp_domain: "madeupmedia.com",
    publisher_id: "XXXXXXXXXXX",
    relationship: "DIRECT",
    cert_id: "4a7be0c1d9f23b5",
    placements_count: 58,
    previous_placements_count: 61,
  },
  {
    ssp_domain: "madeupmedia.com",
    publisher_id: "1042318",
    relationship: "RESELLER",
    cert_id: "4a7be0c1d9f23b58<br />",
    placements_count: 23,
    previous_placements_count: 19,
  },
  {
    ssp_domain: "madeupmedia.com",
    publisher_id: "2884190",
    relationship: "RESELLER",
    cert_id: "b1f4c72e5a08d9c3",
    placements_count: 37,
    previous_placements_count: 35,
  },
];

/*
 * The tail. Long-tailed on purpose: a handful of lines on 90+ publishers,
 * a band in the twenties to eighties, and most on a single digit's worth,
 * which is what a discovery run against two partner domains actually
 * returns.
 */
function buildDiscoveredTail(): MockLineSpec[] {
  const rnd = xorshift(90_210);
  const out: MockLineSpec[] = [];
  for (let i = 0; i < 164; i += 1) {
    const ssp = DISCOVERY_SSP_PICK[Math.floor(rnd() * DISCOVERY_SSP_PICK.length)];
    const account = 7 + i * 97;
    const r = rnd();
    const placements_count =
      r < 0.05
        ? 90 + Math.floor(rnd() * 130)
        : r < 0.18
          ? 24 + Math.floor(rnd() * 60)
          : r < 0.47
            ? 6 + Math.floor(rnd() * 16)
            : 1 + Math.floor(rnd() * 5);
    // Delta mix, weighted so growth leads (a discovery domain a partner is
    // actively selling spreads week over week) without hiding the losses.
    const d = rnd();
    const swing = (pct: number) =>
      1 + Math.floor(rnd() * Math.max(2, Math.round(placements_count * pct)));
    let previous_placements_count: number | null;
    if (d < 0.14) {
      previous_placements_count = null; // new this week
    } else if (d < 0.52) {
      previous_placements_count = Math.max(1, placements_count - swing(0.12));
    } else if (d < 0.76) {
      previous_placements_count = placements_count + swing(0.1);
    } else {
      previous_placements_count = placements_count;
    }
    out.push({
      ssp_domain: ssp,
      publisher_id: discoveredPublisherId(ssp, account),
      relationship: rnd() < 0.28 ? "DIRECT" : "RESELLER",
      cert_id: rnd() < 0.5 ? discoveredCertId(account + i) : "",
      placements_count,
      previous_placements_count,
    });
  }
  return out;
}

/**
 * Publishers carrying one line. Walks a contiguous window of the roster
 * from a per-line offset, so two lines overlap the way two accounts on the
 * same SSP really do, every publisher on a line is distinct, and the whole
 * thing stays deterministic across reloads.
 */
function placementsFor(spec: MockLineSpec, i: number): DiscoveredPlacement[] {
  const pool = DISCOVERY_PUBLISHERS;
  const rnd = xorshift(1_000_003 + i * 7_919);
  const start = (i * 137) % pool.length;
  const count = Math.min(spec.placements_count, pool.length);
  const rows: DiscoveredPlacement[] = [];
  for (let k = 0; k < count; k += 1) {
    const pub = pool[(start + k) % pool.length];
    // A web publisher can only be found in ads.txt; an app publisher is
    // usually in app-ads.txt and occasionally in both.
    const found_in =
      pub.platform === "Web"
        ? "ads.txt"
        : rnd() < 0.8
          ? "app-ads.txt"
          : "ads.txt";
    const row: DiscoveredPlacement = {
      developer_domain: pub.developer_domain,
      developer_name: pub.developer_name,
      platform: pub.platform,
      found_in,
    };
    // When the line turned up in an app's app-ads.txt, name the APP, not
    // just the publisher domain: the store, its bundle id, and a display
    // name. A plain website placement stays a bare domain row.
    if (pub.platform !== "Web" && found_in === "app-ads.txt") {
      const store = pub.platform.toLowerCase();
      row.store = store;
      row.app_name = `${pub.developer_name.split(/\s+/)[0]} ${
        APP_NOUNS[(start + k) % APP_NOUNS.length]
      }`;
      row.bundle_id = bundleIdFor(store, pub.developer_name, start + k);
    }
    rows.push(row);
  }
  return rows.sort(
    (a, b) =>
      a.developer_domain.localeCompare(b.developer_domain) ||
      a.found_in.localeCompare(b.found_in),
  );
}

function buildDiscoveredLines(): DiscoveredLine[] {
  const specs = [...DISCOVERED_HEAD, ...buildDiscoveredTail()];
  // A line's identity is the four-tuple, so collapse duplicates the way
  // GROUP BY would.
  const seen = new Set<string>();
  const unique = specs.filter((s) => {
    const key = [s.ssp_domain, s.publisher_id, s.relationship, s.cert_id].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Same ORDER BY the endpoint promises: new lines first, then the biggest
  // weekly gains, then everything else widest-first. The comparator is the
  // shared one in ./discoveredSort, which the page's sort control also uses,
  // so the server order and the client's "default" option cannot drift.
  //
  // Sorted as specs (no placements attached yet) because the comparator only
  // reads the four identity fields and the two counts, all of which a spec
  // already has; attaching first would build 640-row rosters for lines the
  // sort is about to move anyway.
  unique.sort(compareDefault);
  return unique.map((s, i) => ({ ...s, placements: placementsFor(s, i) }));
}

const DISCOVERED_LINES = buildDiscoveredLines();

/*
 * OWN-DOMAIN DISCOVERY MARKS (2026-10-14). The customer's own sellers.json
 * is the reference for a line that starts with their domain: its seller ID
 * is either in that file (with the seller's name and type) or it is not.
 * Deterministic by ID; the head's IDs are pinned so the first screen shows
 * both states. Names come from the roster's invented pool, which was
 * checked to belong to nobody.
 */
const ID_SHAPE: Record<string, RegExp> = {
  "madeupmedia.com": /^\d{7}$/,
  "madeupmedia.la": /^\d{6}$/,
  "madeupmedia-ads.com": /^cm\d{5}$/,
  "madeupmedia-video.com": /^sb-\d{5}$/,
};

function hashId(s: string): number {
  let h = 2_166_136_261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16_777_619) >>> 0;
  }
  return h;
}

const SELLER_LISTED = new Set(["1042318", "618402", "3390514", "cm41288"]);
const SELLER_UNLISTED = new Set(["2884190", "774061", "XXXXXXXXXXX", "l0p9531e427dc0a8"]);
/** The type the file gives a pinned seller. cm41288 is the mismatch on the
 *  first screen: a PUBLISHER in the file, carried as RESELLER. */
const SELLER_TYPE_PIN: Record<string, string> = {
  "1042318": "INTERMEDIARY",
  "618402": "INTERMEDIARY",
  "3390514": "BOTH",
  cm41288: "PUBLISHER",
};

function sellerCheckOf(id: string, relationship: string): SellerCheck {
  const listed = SELLER_LISTED.has(id)
    ? true
    : SELLER_UNLISTED.has(id)
      ? false
      : hashId(id) % 100 < 58;
  if (!listed) return { status: "unlisted" };
  const h = hashId(`name:${id}`);
  const name = `${DISCOVERED_PREFIX[h % DISCOVERED_PREFIX.length]} ${
    DISCOVERED_SUFFIX[(h >>> 8) % DISCOVERED_SUFFIX.length]
  }`;
  // The file mostly agrees with the line (PUBLISHER sells DIRECT, an
  // INTERMEDIARY resells); one seller in thirteen is typed the other way.
  const agrees = relationship === "DIRECT" ? "PUBLISHER" : "INTERMEDIARY";
  const disagrees = relationship === "DIRECT" ? "INTERMEDIARY" : "PUBLISHER";
  const seller_type = SELLER_TYPE_PIN[id] ?? ((h >>> 16) % 13 === 0 ? disagrees : agrees);
  return { status: "listed", name, seller_type };
}

/** The relationship a seller of this type should be carried with; null for
 *  BOTH, which may be either. */
function relationshipFor(sellerType: string): string | null {
  const t = sellerType.toUpperCase();
  return t === "PUBLISHER" ? "DIRECT" : t === "INTERMEDIARY" ? "RESELLER" : null;
}

function issuesOf(l: DiscoveredLine, all: DiscoveredLine[]): LineIssue[] {
  const out: LineIssue[] = [];
  const shape = ID_SHAPE[l.ssp_domain];
  if (shape && !shape.test(l.publisher_id)) {
    out.push({
      kind: "bad_id",
      text: /^X+$/.test(l.publisher_id)
        ? "The seller ID is a placeholder, not one of yours"
        : "The seller ID does not look like one of yours",
    });
  }
  if (l.cert_id && !/^[0-9a-f]{16}$/.test(l.cert_id)) {
    out.push({ kind: "bad_cert", text: `The cert id is corrupted: ${l.cert_id}` });
  }
  if (l.seller?.status === "listed") {
    const wanted = relationshipFor(l.seller.seller_type);
    if (wanted && wanted !== l.relationship) {
      out.push({
        kind: "relationship_mismatch",
        // Word for word the crawler's sentence (customer_snapshot._line_issues).
        text: `Your sellers.json lists this seller as ${l.seller.seller_type.toUpperCase()}, the line says ${l.relationship}`,
      });
    }
  }
  const other = all.find(
    (o) =>
      o !== l &&
      o.ssp_domain === l.ssp_domain &&
      o.publisher_id === l.publisher_id &&
      o.relationship !== l.relationship &&
      (o.publishers_count ?? o.placements_count) >= (l.publishers_count ?? l.placements_count),
  );
  if (other) {
    out.push({
      kind: "both_relationships",
      text: `Also listed as ${other.relationship} on ${(publishersOf(other.placements_count) ?? 0).toLocaleString()} publishers`,
    });
  }
  return out;
}

/**
 * Lines that were in last week's crawl and are gone from this one, by
 * discovery domain. They exist only so the summary row's previous-week
 * total is honest: the rows a crawl returns cover lines that still exist,
 * so summing them would erase every disappearance and make every week look
 * like growth. The live endpoint counts the previous crawl directly and
 * never needs this table.
 */
const DISCOVERY_VANISHED: Record<string, { lines: number; placements: number }> = {
  "madeupmedia.com": { lines: 4, placements: 62 },
  "madeupmedia.la": { lines: 3, placements: 41 },
  "madeupmedia-ads.com": { lines: 1, placements: 9 },
  "madeupmedia-video.com": { lines: 0, placements: 0 },
};


function discoveredTotals(pool: DiscoveredLine[]): DiscoveredTotals {
  let placements = 0;
  let previous_lines = 0;
  let previous_placements = 0;
  let new_lines = 0;
  const ssps = new Set<string>();
  for (const l of pool) {
    placements += l.placements_count;
    ssps.add(l.ssp_domain);
    if (l.previous_placements_count != null) {
      previous_lines += 1;
      previous_placements += l.previous_placements_count;
    } else {
      new_lines += 1;
    }
  }
  for (const ssp of ssps) {
    const gone = DISCOVERY_VANISHED[ssp];
    if (!gone) continue;
    previous_lines += gone.lines;
    previous_placements += gone.placements;
  }
  return {
    lines: pool.length,
    placements,
    previous_lines: pool.length === 0 ? null : previous_lines,
    previous_placements: pool.length === 0 ? null : previous_placements,
    new_lines: pool.length === 0 ? null : new_lines,
  };
}

function lineKeyOf(k: DiscoveredLineKey): string {
  return [k.ssp_domain, k.publisher_id, k.relationship, k.cert_id].join("|");
}

/**
 * Filtering matches the live line-events behaviour: ssp_domain is a
 * case-insensitive substring, so typing "madeupmedia" keeps madeupmedia.com,
 * madeupmedia.la and the others, and ".la" keeps madeupmedia.la alone.
 *
 * Mock-only escape hatch: adding ``?discovery=none`` to the URL empties the
 * list, which is how the seat-line-only empty state is reviewed without a
 * second fixture set. Never reached in a production build, where MOCK is
 * false and this module is tree-shaken out.
 */
/*
 * WHO BROUGHT EACH LINE (2026-10-11), as the API marks it from the report's
 * watchlist: a few of the head's lines are in the customer's list (from
 * their sellers.json, by hand, one found earlier), and one seller ID they
 * gave as RESELLER turns up DIRECT, so a preview shows every mark.
 */
const DISCOVERY_SEATS: MatchedSeatLine[] = [
  { ssp_domain: "madeupmedia.com", publisher_id: "1042318", relationship: "RESELLER", source: "sellers_json", added_at: "2026-08-30" },
  { ssp_domain: "madeupmedia.com", publisher_id: "2884190", relationship: "RESELLER", source: "sellers_json", added_at: "2026-08-30" },
  { ssp_domain: "madeupmedia.com", publisher_id: "3390514", relationship: "RESELLER", source: "manual", added_at: "2026-09-04" },
  { ssp_domain: "madeupmedia.la", publisher_id: "618402", relationship: "RESELLER", source: "discovered", added_at: "2026-09-16" },
];
const mockOrigin = originsFrom([...CUSTOMER_SEATS, ...DISCOVERY_SEATS])!;

/** Publishers once each, in the shape a report from 2026-10-11 carries:
 *  most publishers hold the line in one file, some in both. */
const publishersOf = (listings: number | null) => (listings == null ? null : Math.max(1, Math.round(listings * 0.62)));

/** Mock-only: ``?baseline=cut`` is a report whose baseline's list was cut
 *  short (no comparison, and the page says why); ``?baseline=none`` is a
 *  first report. Read from the page URL; the e2e fake passes it instead. */
function mockBaselineParam(): DiscoveredTotals["baseline"] {
  if (typeof window === "undefined") return "compared";
  const v = new URLSearchParams(window.location.search).get("baseline");
  return v === "cut" || v === "none" ? v : "compared";
}

export function mockDiscoveredLines(opts: {
  page?: number;
  page_size?: number;
  ssp_domain?: string;
  origin?: "given" | "found";
  show?: DiscoveredShow;
  q?: string;
  /** The e2e fake's way to pick the baseline state without a page URL. */
  baseline?: DiscoveredTotals["baseline"];
}): DiscoveredLinesPage {
  const page = opts.page ?? 1;
  const pageSize = opts.page_size ?? 50;
  const emptied =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("discovery") === "none";
  const baseline = opts.baseline ?? mockBaselineParam();
  let pool = emptied ? [] : DISCOVERED_LINES;
  if (opts.ssp_domain) {
    const needle = opts.ssp_domain.trim().toLowerCase();
    pool = pool.filter((r) => r.ssp_domain.toLowerCase().includes(needle));
  }
  pool = pool.map((r) => ({
    ...r,
    ...mockOrigin(r),
    publishers_count: publishersOf(r.placements_count)!,
    previous_publishers_count: publishersOf(r.previous_placements_count),
  }));
  // The seller check first, since one of the issues reads it.
  pool = pool.map((r) => ({ ...r, seller: sellerCheckOf(r.publisher_id, r.relationship) }));
  pool = pool.map((r) => ({ ...r, issues: issuesOf(r, pool) }));
  if (baseline !== "compared") {
    pool = pool.map((r) => ({ ...r, previous_placements_count: null, previous_publishers_count: null }));
  }
  // The totals are the REPORT's numbers, counted before the search and the
  // Show filter, exactly as viewer_frozen.discovered_lines counts them: the
  // list's own count line says how many lines the filter keeps. (Only the
  // SSP-domain filter rescopes them, and this page no longer offers it.)
  const whole = pool;
  if (opts.q) {
    // The contract's search: the line itself, or any publisher in its
    // roster by domain or name.
    const needle = opts.q.trim().toLowerCase();
    const has = (s: string | undefined) => (s ?? "").toLowerCase().includes(needle);
    pool = pool.filter(
      (r) =>
        has(r.publisher_id) ||
        has(r.ssp_domain) ||
        has(r.cert_id) ||
        (r.placements ?? []).some((p) => has(p.developer_domain) || has(p.developer_name)),
    );
  }
  if (opts.origin) pool = pool.filter((r) => (r.origin === "given") === (opts.origin === "given"));
  if (opts.show === "direct") pool = pool.filter((r) => r.relationship === "DIRECT");
  if (opts.show === "reseller") pool = pool.filter((r) => r.relationship === "RESELLER");
  if (opts.show === "new") pool = pool.filter((r) => r.previous_placements_count == null && baseline === "compared");
  if (opts.show === "fixing") pool = pool.filter((r) => (r.issues ?? []).length > 0);
  if (opts.show === "listed") pool = pool.filter((r) => r.seller?.status === "listed");
  if (opts.show === "unlisted") pool = pool.filter((r) => r.seller?.status === "unlisted");
  const given = whole.filter((r) => r.origin === "given").length;
  const listedIds = new Set(whole.filter((r) => r.seller?.status === "listed").map((r) => r.publisher_id));
  const unlistedIds = new Set(whole.filter((r) => r.seller?.status === "unlisted").map((r) => r.publisher_id));
  const base = discoveredTotals(whole);
  const compared = baseline === "compared";
  const start = (page - 1) * pageSize;
  return {
    page,
    page_size: pageSize,
    total: pool.length,
    totals: {
      ...base,
      previous_lines: compared ? base.previous_lines : null,
      previous_placements: compared ? base.previous_placements : null,
      new_lines: compared ? base.new_lines : null,
      given_lines: given,
      found_lines: whole.length - given,
      publishers: opts.ssp_domain ? null : Math.round(whole.reduce((n, r) => n + (r.publishers_count ?? 0), 0) * 0.7),
      previous_publishers:
        !compared || opts.ssp_domain || base.previous_placements == null
          ? null
          : Math.round((publishersOf(base.previous_placements) ?? 0) * 0.7),
      sellers_json: {
        url: "madeupmedia.com/sellers.json",
        sellers: listedIds.size + 24,
        read_at: MOCK_CRAWL_AT,
        listed_ids: listedIds.size,
        unlisted_ids: unlistedIds.size,
      },
      in_file_lines: whole.filter((r) => r.seller?.status === "listed").length,
      not_in_file_lines: whole.filter((r) => r.seller?.status === "unlisted").length,
      needs_fixing: whole.filter((r) => (r.issues ?? []).length > 0).length,
      baseline,
    },
    // The roster is never embedded: the page reads it whole, paged, from
    // the placements endpoint.
    rows: pool.slice(start, start + pageSize).map((l) => ({ ...l, placements: undefined })),
  };
}

export function mockDiscoveredLinePlacements(
  key: DiscoveredLineKey,
  opts: { page?: number; page_size?: number; q?: string },
): DiscoveredPlacementsPage {
  const page = opts.page ?? 1;
  const pageSize = opts.page_size ?? 100;
  const wanted = lineKeyOf(key);
  const line = DISCOVERED_LINES.find((l) => lineKeyOf(l) === wanted);
  let rows = line?.placements ?? [];
  if (opts.q) {
    const needle = opts.q.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.developer_domain.toLowerCase().includes(needle) ||
        (r.developer_name ?? "").toLowerCase().includes(needle) ||
        (r.app_name ?? "").toLowerCase().includes(needle) ||
        (r.bundle_id ?? "").toLowerCase().includes(needle),
    );
  }
  const start = (page - 1) * pageSize;
  return {
    page,
    page_size: pageSize,
    total: rows.length,
    rows: rows.slice(start, start + pageSize),
  };
}

// ─────────────────────────────────────────────────────────────────
// Declarations (inventory partners, owner claims, mismatches)
// ─────────────────────────────────────────────────────────────────

/**
 * Declaring files, drawn from the discovery publisher roster so every
 * domain a card names is one the report knows elsewhere. Deterministic,
 * like everything else in this file, so screenshots do not shuffle.
 */
function declarationSources(count: number, offset: number): DeclarationSource[] {
  return Array.from({ length: count }, (_, i) => {
    const pub =
      DISCOVERY_PUBLISHERS[(offset + i * 3) % DISCOVERY_PUBLISHERS.length];
    return {
      domain: pub.developer_domain,
      file_kind: pub.platform === "Web" ? "ads_txt" : "app_ads_txt",
    };
  });
}

/*
 * Shaped after the operator's real case: one partner domain most of the
 * network declares (capped at 50 by the endpoint, so the page's "and N
 * more" line has something true to say), a couple of small ones, a pair of
 * owner claims, and two seats whose file relationship disagrees with the
 * watchlist. Totals match the arrays because nothing here is filtered.
 */
/*
 * The customer-report shape: the Excel sheet's rows, flat. Shaped like a
 * real run (2026-09-15): a handful of partners each named by many
 * publisher files, in both files where the publisher has both, plus owner
 * domains and a few country-scoped manager domains so every kind renders.
 * Every domain is made up and was DNS-checked to resolve nowhere
 * (2026-10-02): the public demo is built from this file, and the real
 * run's customer and publishers must not appear on it.
 */
/** The mock customer's own domain: what its downloads are named after. */
export const MOCK_CUSTOMER_DOMAIN = "madeupmedia.com";

const DECLARATION_ROWS_SEED: [string, string, string[], string][] = [
  // Only rows that NAME the customer's own domain (madeupmedia.com): the
  // sheet is per customer since 2026-09-15, and discover domains are not
  // the customer's domain.
  ["inventory partner", "madeupmedia.com", [
    "quokkaplay-games.com", "tidepoolarcade.com", "brambleloop-apps.com", "lanternbay-tv.com", "fernhollow-team.it",
    "velvetmoth-network.com", "silvergull-media.tv", "orchardtide-ads.com", "copperwren-hiphop.com", "whistlecove-tv.tv",
    "harborview7news.com", "cobaltriver15.com", "pinecrest-denver9.com", "mesaridge-news.com", "northfold-tv.com", "ambermile-news9.com",
  ], ""],
  ["owner domain", "madeupmedia.com", ["quokkaplay-games.com", "tidepoolarcade.com"], ""],
  ["manager domain", "madeupmedia.com", ["quokkaplay-games.com", "tidepoolarcade.com", "brambleloop-apps.com"], ""],
  ["manager domain", "madeupmedia.com", ["quokkaplay-games.com"], "IN"],
  ["manager domain", "madeupmedia.com", ["tidepoolarcade.com"], "BR"],
];

/** Declarations first made this week, as "kind|declared_by": the last
 *  four inventory partners, and both owner-domain publishers, so the owner
 *  card shows a domain nobody named last week. */
const NEW_DECLARATIONS = new Set([
  "inventory partner|mesaridge-news.com",
  "inventory partner|northfold-tv.com",
  "inventory partner|ambermile-news9.com",
  "inventory partner|cobaltriver15.com",
  "owner domain|quokkaplay-games.com",
  "owner domain|tidepoolarcade.com",
]);

export const mockDeclarationRows: DeclarationRowsPayload = (() => {
  const rows: DeclarationRow[] = [];
  DECLARATION_ROWS_SEED.forEach(([declaration, declared_domain, declarers, country]) => {
    declarers.forEach((declared_by, i) => {
      const is_new = NEW_DECLARATIONS.has(`${declaration}|${declared_by}`);
      rows.push({ declaration, declared_domain, declared_by, country, found_in: "ads.txt", is_new });
      // Most publishers carry both files; every third one is web-only.
      if (i % 3 !== 2) {
        rows.push({
          declaration, declared_domain, declared_by, country, found_in: "app-ads.txt", is_new,
        });
      }
    });
  });
  return { rows, total: rows.length };
})();

export const mockDeclarations: Declarations = {
  totals: { ipd_partners: 3, owner_domains: 2, relationship_mismatches: 2 },
  ipd: [
    {
      partner_domain: "madeupmedia.com",
      declared_by: declarationSources(50, 0),
      declarer_total: 63,
    },
    {
      partner_domain: "madeupmedia.la",
      declared_by: declarationSources(4, 17),
      declarer_total: 4,
    },
    {
      partner_domain: "roostmedia.tv",
      declared_by: declarationSources(1, 41),
      declarer_total: 1,
    },
  ],
  owner_claims: [
    {
      owner_domain: "riverstone.com",
      claimed_by: declarationSources(3, 8),
      claimant_total: 3,
    },
    {
      owner_domain: "nomadmediagroup.com",
      claimed_by: declarationSources(1, 29),
      claimant_total: 1,
    },
  ],
  relationship_mismatches: [
    {
      developer_domain: "chompstudios.com",
      ssp_domain: "magnite.com",
      publisher_id: "magnite-2041",
      wanted_relationship: "RESELLER",
      found_relationship: "DIRECT",
      found_in: "app-ads.txt",
      matched_via: "file",
    },
    {
      developer_domain: "riverstone.com",
      ssp_domain: "openx.com",
      publisher_id: "openx-1187",
      wanted_relationship: "DIRECT",
      found_relationship: "RESELLER",
      found_in: "both",
      matched_via: "ipd",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// Chat SSE stream (mock)
// ─────────────────────────────────────────────────────────────────

const CHAT_RESPONSES: Record<string, string> = {
  DEFAULT: `Here is the short read of this week:

- **184 lines removed**, mostly from rubiconproject.com (42), appnexus.com (38) and google.com (29).
- **127 lines added**, led by magnite.com, openx.com and pubmatic.com. Most of those additions are on new mobile publishers (Chomp Studios, Roost Media, Deep Sea Games).

The removals cluster on three publishers this week: Kite Interactive, Cinder and Sky, and Meridian Sports Media. That is 22, 16, and 12 lines gone. It looks like a cleanup of older relationships. Worth checking whether those publishers moved to a sales-house partner.`,

  "who removed my lines this week?": `Four publishers dropped your matched lines entirely this week:

1. **Kite Interactive** (kiteinteractive.com, iOS): 22 lines removed (Rubicon 9, AppNexus 8, Google 5).
2. **Cinder and Sky** (cinderandsky.co, Web): 16 lines (Google 7, Criteo 5, Yahoo 4).
3. **Meridian Sports Media** (meridiansports.io, iOS): 12 lines (AppNexus 6, Yahoo 4, Rubicon 2).
4. **Sable Broadcasting** (sablebroadcast.tv, Samsung CTV): 9 lines (Rubicon 5).

A missing ads.txt entry means the publisher no longer authorizes that relationship. These are real removals, not fetch errors.`,

  "what changed for magnite?": `Magnite (magnite.com) added **34 new lines this week**, with no removals and no cert changes. Details:

- **New publishers on Magnite**: Chomp Studios (+6), Roost Media (+3), Aurora TV Networks (+3), Northlight Games (+2).
- **Existing publishers where Magnite grew**: Riverstone Publishers (+4), Copperline Studios (+2).
- **No cert-id changes** for Magnite on your seats this week.

This is one of the cleanest single-partner expansions in the diff. If Magnite is a priority for you, confirm the owner domain is aligned on the new publishers next week.`,

  "show me all new resellers.": `There are **127 new reseller lines** and 43 new direct lines added this week. Reseller only:

| SSP | New reseller lines | Notable publishers |
|---|---|---|
| magnite.com | 24 | Chomp Studios, Roost Media, Riverstone Publishers |
| openx.com | 16 | Chomp Studios, Pixel Cauldron |
| pubmatic.com | 14 | Deep Sea Games, Northlight Games |
| sharethrough.com | 11 | Aurora TV Networks, Riverstone Publishers |
| smartadserver.com | 8 | Deep Sea Games, Pixel Cauldron |
| adform.com | 7 | Riverstone Publishers |

Every one of these reseller nodes is a live counterparty in the seller list, so the payment path looks clean.`,

  "which of my seats are unauthorized?": `You have **12 seat lines removed this week**, which means 12 of your declared partner relationships are no longer authorized by the publisher:

- **appnexus.com, xf-4402, DIRECT**: Kite Interactive dropped this line entirely.
- **rubiconproject.com, 22890, DIRECT**: Sable Broadcasting removed it (was your only direct with them on Samsung CTV).
- **google.com, pub-9083..., DIRECT**: Cinder and Sky purged all Google lines this week.
- **Plus 9 more**. Open the Changes page and filter to Removed to see the full list.

A removed line means the publisher no longer lists your partner as authorized. Buyers that check for authorization will start filtering these on the next crawl.`,
};

function pickChatResponse(prompt: string): string {
  const p = prompt.toLowerCase().trim();
  for (const [key, val] of Object.entries(CHAT_RESPONSES)) {
    if (key === "DEFAULT") continue;
    if (p.includes(key.toLowerCase().replace(/[?.]/g, ""))) return val;
  }
  return CHAT_RESPONSES.DEFAULT;
}

export async function* mockChatStream(
  prompt: string,
): AsyncGenerator<ChatFrame> {
  const response = pickChatResponse(prompt);
  // Chunk word-by-word to look like a streaming LLM.
  const words = response.split(/(\s+)/);
  for (const w of words) {
    await new Promise((r) => setTimeout(r, 22));
    yield { type: "text", delta: w };
  }
  await new Promise((r) => setTimeout(r, 100));
  yield { type: "done" };
}

/**
 * The matched roster and its app bundles, for the schain fixture
 * (src/lib/mockSchain.ts). Read off the same lists the overview pages, so
 * a publisher in the schain preview is one the reader can also find under
 * Matched publishers, carrying the same seat lines.
 */
export function mockSchainSource() {
  return { developers: MATCHED_DEVS, bundles: MATCHED_BUNDLES };
}
