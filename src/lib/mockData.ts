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
  DiscoveredTotals,
  LineEventsPage,
  LineEvent,
  LineEventKind,
  MatchedDevelopersPage,
  MatchedSeatLine,
  MatchedBundlesPage,
  MatchedApp,
  MatchedAppsPage,
  ChatFrame,
  DeclarationRow,
  DeclarationRowsPayload,
} from "./api";
// The discovered-lines ORDER BY, shared with the page's sort control so the
// mock endpoint and the client's "default" option cannot disagree.
import { compareDefault } from "./discoveredSort";

/*
 * THE CUSTOMER'S WATCHLIST. Six seat lines, the shape a real customer's
 * report is built from. Every matched publisher, app and matched-seat
 * event carries a subset of THESE, so the seat-line filter has something
 * true to narrow by. Declared first: the event seed below reads it at
 * module load.
 */
export const CUSTOMER_SEATS: MatchedSeatLine[] = [
  { ssp_domain: "magnite.com", publisher_id: "14991", relationship: "RESELLER" },
  { ssp_domain: "magnite.com", publisher_id: "14992", relationship: "RESELLER" },
  { ssp_domain: "openx.com", publisher_id: "540123456", relationship: "DIRECT" },
  { ssp_domain: "pubmatic.com", publisher_id: "161234", relationship: "RESELLER" },
  { ssp_domain: "sharethrough.com", publisher_id: "SZjHEx3f", relationship: "DIRECT" },
  { ssp_domain: "onetag.com", publisher_id: "8df76ed1d09d55e", relationship: "RESELLER" },
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


/*
 * WHEN THIS REPORT RAN.
 *
 * Every timestamp in this fixture used to be a literal from August 2026.
 * That is fine for a local review that lasts an afternoon and wrong for the
 * permanently deployed demo, where a visitor six months later would be shown
 * a crawl that finished half a year ago and read the whole product as
 * abandoned. A stale report is a worse advert than no report.
 *
 * So the fixture anchors to the most recent Monday instead and derives every
 * date from it. The demo always says "this week's crawl, measured against
 * last week's", which is what a real weekly report says.
 *
 * Computed once at module load, not per call: a report whose dates drifted
 * between two fetches on the same page would contradict itself.
 */
function mostRecentMonday(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // getUTCDay() is 0 Sun .. 6 Sat, so Monday is 1 and Sunday is SIX days
  // past the Monday we want, not one day short of the next one.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

const THIS_RUN = mostRecentMonday(new Date());
const PREV_RUN = new Date(THIS_RUN.getTime() - 7 * 86_400_000);

/** A timestamp on `run`'s calendar day, UTC, in the fixture's own format. */
function stamp(run: Date, h: number, m: number, sec: number): string {
  const d = new Date(
    Date.UTC(run.getUTCFullYear(), run.getUTCMonth(), run.getUTCDate(), h, m, sec),
  );
  return `${d.toISOString().slice(0, 19)}Z`;
}

/** Midnight UTC, `days` before this week's run. For "first seen" dates. */
function daysBefore(days: number): string {
  return stamp(new Date(THIS_RUN.getTime() - days * 86_400_000), 0, 0, 0);
}

/** "Aug 18 2026", the way the week line writes a date. */
function weekLabel(run: Date): string {
  return run
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    })
    .replace(",", "");
}


/*
 * HOW BIG THIS WEEK IS, DECLARED ONCE.
 *
 * Every count used to be typed twice: once in ``summary.hero_diff`` and
 * again as the seed argument to ``seededLines``. They agreed by hand, which
 * means they agreed right up until someone edited one of them. The demo
 * needs a far busier week than a local UI review did, so these numbers move
 * -- and a hero card that disagrees with the table underneath it is the one
 * bug a demo cannot survive, because it is the thing a prospect checks.
 *
 * So the totals live here and everything downstream derives from them: the
 * hero card, the line-event seed, the seat-match targets, the developer
 * tables' row counts and last week's figures.
 *
 * ``lines`` counts PLACEMENTS, one per (line x publisher file), which is the
 * unit the real hero_diff uses and the unit the Changes page re-counts in.
 */
export const WEEK_TOTALS = {
  lines: {
    added: 1_284,
    removed: 968,
    cert_changed: 331,
    newly_monitored: 142,
    monitoring_stopped: 27,
    first_appearance: 46,
  },
  /* The subset landing on one of the customer's OWN six seat lines. A
   * newly monitored or stopped line is by definition one of theirs, so
   * those two carry straight across rather than being a fraction. */
  matched_seat: {
    added: 96,
    removed: 74,
    cert_changed: 28,
  },
  developers: {
    added: 34,
    removed: 21,
    changed: 118,
  },
} as const;

/** Last week's figure for a count, so every delta is a real subtraction.
 *  A fraction of this week rather than a second hand-typed number: the
 *  point of the card is the movement, and the movement has to be true. */
const lastWeek = (n: number, fraction: number) => Math.round(n * fraction);

/** The "who moved it" breakdown under a hero figure, as shares OF that
 *  figure. Written as shares and not counts because the counts have to
 *  move whenever the total does, and five numbers that have to be edited
 *  in step with a sixth are five numbers that will not be. Deliberately
 *  short of 100%: these are the TOP five SSPs, not all of them. */
const topSsps = (total: number, shares: [string, number][]) =>
  shares.map(([ssp_domain, share]) => ({
    ssp_domain,
    count: Math.round(total * share),
  }));

// ─────────────────────────────────────────────────────────────────
// Summary (hero + counters)
// ─────────────────────────────────────────────────────────────────

// The previous week's report, retained so every page can show the
// "current-crawl vs last-crawl" comparison David asked to keep visible.
export const mockPreviousSummary: Summary = {
  crawl_id: 47120,
  source: "weekly",
  status: "completed",
  queued_at: stamp(PREV_RUN, 9, 0, 0),
  started_at: stamp(PREV_RUN, 9, 0, 14),
  finished_at: stamp(PREV_RUN, 9, 19, 22),
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
      added: lastWeek(WEEK_TOTALS.lines.added, 0.74),
      removed: lastWeek(WEEK_TOTALS.lines.removed, 0.52),
      cert_changed: lastWeek(WEEK_TOTALS.lines.cert_changed, 0.63),
      // The watchlist did not move last week, which is what makes this
      // week's scope change worth showing.
      newly_monitored: 0, monitoring_stopped: 0, first_appearance: 0,
    },
    line_totals_matched_seat: {
      added: lastWeek(WEEK_TOTALS.matched_seat.added, 0.58),
      removed: lastWeek(WEEK_TOTALS.matched_seat.removed, 0.41),
      cert_changed: lastWeek(WEEK_TOTALS.matched_seat.cert_changed, 0.68),
      newly_monitored: 0, monitoring_stopped: 0, first_appearance: 0,
    },
    developer_totals: {
      added: lastWeek(WEEK_TOTALS.developers.added, 0.68),
      removed: lastWeek(WEEK_TOTALS.developers.removed, 0.48),
      changed: lastWeek(WEEK_TOTALS.developers.changed, 0.81),
      newly_monitored: 0, monitoring_stopped: 0,
    },
    // Likewise overwritten at module load, as a fraction of this week's
    // measured figure, so the card's delta is a real subtraction.
    affected: { publishers: 0, apps: 0 },
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

export const mockPreviousWeekOf = weekLabel(PREV_RUN);

export const mockSummary: Summary = {
  crawl_id: 47281,
  source: "weekly",
  status: "completed",
  queued_at: stamp(THIS_RUN, 9, 0, 0),
  started_at: stamp(THIS_RUN, 9, 0, 12),
  finished_at: stamp(THIS_RUN, 9, 18, 47),
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
  },
  hero_diff: {
    line_totals: { ...WEEK_TOTALS.lines },
    line_totals_matched_seat: {
      ...WEEK_TOTALS.matched_seat,
      // A line we started or stopped watching is one of the customer's own
      // by definition, so these are not a fraction of the week, they are
      // the whole of it.
      newly_monitored: WEEK_TOTALS.lines.newly_monitored,
      monitoring_stopped: WEEK_TOTALS.lines.monitoring_stopped,
      first_appearance: WEEK_TOTALS.lines.first_appearance,
    },
    developer_totals: {
      ...WEEK_TOTALS.developers,
      newly_monitored: 12,
      monitoring_stopped: 2,
    },
    scope_changed: true,
    // Overwritten at module load with the real count off the line events;
    // see "PUBLISHERS AFFECTED" below. Placeholders, not choices.
    affected: { publishers: 0, apps: 0 },
    top_ssps: {
      added: topSsps(WEEK_TOTALS.lines.added, [
        ["magnite.com", 0.27],
        ["openx.com", 0.165],
        ["pubmatic.com", 0.142],
        ["sharethrough.com", 0.11],
        ["smartadserver.com", 0.086],
      ]),
      removed: topSsps(WEEK_TOTALS.lines.removed, [
        ["rubiconproject.com", 0.228],
        ["appnexus.com", 0.207],
        ["google.com", 0.158],
        ["yahoo.com", 0.092],
        ["criteo.com", 0.076],
      ]),
      cert_changed: topSsps(WEEK_TOTALS.lines.cert_changed, [
        ["amazon-adsystem.com", 0.279],
        ["adform.com", 0.209],
        ["criteo.com", 0.163],
        ["spotx.tv", 0.116],
        ["beachfront.com", 0.093],
      ]),
    },
  },
};

// ─────────────────────────────────────────────────────────────────
// Developer events (drilldown)
// ─────────────────────────────────────────────────────────────────

/* The long-tail publisher roster, hoisted above the developer tables so
 * the tail generator below can draw names at module load. */
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

const DEV_ADDED_HEAD: DeveloperEvent[] = [
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
    occurred_at: stamp(THIS_RUN, 9, 18, 32),
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
    occurred_at: stamp(THIS_RUN, 9, 18, 33),
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
    occurred_at: stamp(THIS_RUN, 9, 18, 35),
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
    occurred_at: stamp(THIS_RUN, 9, 18, 36),
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
    occurred_at: stamp(THIS_RUN, 9, 18, 37),
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
    occurred_at: stamp(THIS_RUN, 9, 18, 38),
  },
];

const DEV_REMOVED_HEAD: DeveloperEvent[] = [
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
    occurred_at: stamp(THIS_RUN, 9, 18, 40),
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
    occurred_at: stamp(THIS_RUN, 9, 18, 41),
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
    occurred_at: stamp(THIS_RUN, 9, 18, 42),
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
    occurred_at: stamp(THIS_RUN, 9, 18, 43),
  },
];

const DEV_CHANGED_HEAD: DeveloperEvent[] = [
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
    occurred_at: stamp(THIS_RUN, 9, 18, 44),
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
    occurred_at: stamp(THIS_RUN, 9, 18, 44),
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
    occurred_at: stamp(THIS_RUN, 9, 18, 45),
  },
];

/* The SSP pools a week's movement is drawn from, hoisted above the
 * developer tail generator that reads them at module load. */
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
 * THE REST OF THE WEEK'S PUBLISHERS.
 *
 * The heads above are hand-written because they are what a screenshot
 * frames: recognisable names, counts that tell a story, an SSP breakdown
 * worth reading. The week itself touches far more publishers than anyone
 * wants to type, and the hero card states exactly how many -- so the tail
 * is generated to close the gap, and the table's total IS
 * developer_totals by construction rather than by someone remembering to
 * keep two numbers level.
 *
 * Deterministic (seeded xorshift), so the demo does not reshuffle under a
 * reader who reloads it, and so a screenshot taken today matches one taken
 * next month.
 */
const TAIL_SUFFIXES = ["Group", "Networks", "Interactive", "Digital", "Partners"];

/** Second pool, for the rare name whose every first-pool spelling is
 *  already claimed by the other roster. */
const FALLBACK_SUFFIXES = [
  "Holdings",
  "Collective",
  "Works",
  "Union",
  "Guild",
  "Alliance",
  "Company",
  "Syndicate",
];

/** Domains already spoken for, so no two rows claim the same publisher.
 *  The Changes page counts "publishers affected" by DOMAIN, so a duplicate
 *  would quietly deflate the figure the hero card is compared against. */
const TAKEN_DOMAINS = new Set<string>(
  [...DEV_ADDED_HEAD, ...DEV_REMOVED_HEAD, ...DEV_CHANGED_HEAD].map(
    (d) => d.developer_domain ?? "",
  ),
);

function tailIdentity(i: number, rnd: () => number): {
  name: string;
  domain: string;
  platform: string;
} {
  const platform = PLATFORMS[Math.floor(rnd() * PLATFORMS.length)];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const idx = i + attempt * DEV_NAMES.length;
    const base = DEV_NAMES[idx % DEV_NAMES.length];
    const wraps = Math.floor(idx / DEV_NAMES.length);
    const name =
      wraps === 0 ? base : `${base} ${TAIL_SUFFIXES[(wraps - 1) % TAIL_SUFFIXES.length]}`;
    const domain = domainFor(name, platform, idx);
    if (!TAKEN_DOMAINS.has(domain)) {
      TAKEN_DOMAINS.add(domain);
      return { name, domain, platform };
    }
  }
  // Every first-choice candidate is taken. Try a second word pool before
  // giving up: a duplicate domain is the one outcome that miscounts, but
  // "Larkspur Media 214" is the one that looks generated, and on a page a
  // prospect is reading both matter.
  for (const word of FALLBACK_SUFFIXES) {
    const name = `${DEV_NAMES[i % DEV_NAMES.length]} ${word}`;
    const domain = domainFor(name, platform, i);
    if (!TAKEN_DOMAINS.has(domain)) {
      TAKEN_DOMAINS.add(domain);
      return { name, domain, platform };
    }
  }
  // Both pools exhausted for this name. Uniqueness wins over prettiness.
  const name = `${DEV_NAMES[i % DEV_NAMES.length]} ${i}`;
  const domain = domainFor(name, platform, i);
  TAKEN_DOMAINS.add(domain);
  return { name, domain, platform };
}

/** The SSP breakdown behind one tail row: three domains carrying the row's
 *  own count, so an expanded card adds up to the number on its face. */
function tailSsps(pool: string[], total: number, rnd: () => number) {
  const first = Math.max(1, Math.round(total * (0.4 + rnd() * 0.2)));
  const second = Math.max(1, Math.round((total - first) * 0.6));
  const third = Math.max(0, total - first - second);
  const start = Math.floor(rnd() * pool.length);
  return [first, second, third]
    .map((count, k) => ({ ssp_domain: pool[(start + k) % pool.length], count }))
    .filter((r) => r.count > 0);
}

function devTail(
  kind: "added" | "removed" | "changed",
  head: DeveloperEvent[],
  target: number,
  idBase: number,
  seed: number,
): DeveloperEvent[] {
  const rnd = xorshift(seed);
  const rows: DeveloperEvent[] = [];
  const pool = kind === "removed" ? SSPS_REMOVED : SSPS_ADDED;
  for (let i = 0; rows.length < target - head.length; i += 1) {
    const { name, domain, platform } = tailIdentity(i, rnd);
    // Long tail: a few publishers moved a lot, most moved a handful.
    const r = rnd();
    const size = r < 0.12 ? 9 + Math.floor(rnd() * 21) : 1 + Math.floor(rnd() * 8);
    const added = kind === "added" ? size : kind === "changed" ? 1 + Math.floor(rnd() * 7) : 0;
    const removed = kind === "removed" ? size : kind === "changed" ? Math.floor(rnd() * 5) : 0;
    const cert = kind === "changed" ? Math.floor(rnd() * 4) : 0;
    const prev =
      kind === "added" ? 0 : kind === "removed" ? size : 6 + Math.floor(rnd() * 40);
    rows.push({
      developer_id: idBase + i * 53,
      developer_name: name,
      developer_domain: domain,
      developer_platform: platform,
      matched_lines_prev: prev,
      matched_lines_current: kind === "removed" ? 0 : prev + added - removed,
      lines_added: added,
      lines_removed: removed,
      lines_cert_changed: cert,
      lines_newly_monitored: 0,
      lines_monitoring_stopped: 0,
      top_ssps: tailSsps(pool, Math.max(1, added + removed + cert), rnd),
      // Spread across the crawl's last minute, the way real events land.
      occurred_at: stamp(THIS_RUN, 9, 17 + (i % 2), i % 60),
    });
  }
  return [...head, ...rows];
}

const DEV_ADDED = devTail("added", DEV_ADDED_HEAD, WEEK_TOTALS.developers.added, 200_000, 8_101);
const DEV_REMOVED = devTail("removed", DEV_REMOVED_HEAD, WEEK_TOTALS.developers.removed, 300_000, 8_209);
const DEV_CHANGED = devTail("changed", DEV_CHANGED_HEAD, WEEK_TOTALS.developers.changed, 400_000, 8_317);

const DEV_TABLES: Record<string, DeveloperEvent[]> = {
  added: DEV_ADDED,
  removed: DEV_REMOVED,
  changed: DEV_CHANGED,
};

export function mockDeveloperEvents(
  event: "added" | "removed" | "changed",
  page: number,
  lines: string[] = [],
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
  return {
    event,
    page,
    page_size: 50,
    total: rows.length,
    rows,
  };
}

// ─────────────────────────────────────────────────────────────────
// Line events (LinesDiff pane)
// ─────────────────────────────────────────────────────────────────

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

/** How many of each bucket's rows land on one of the customer's own seat
 *  lines. Read from WEEK_TOTALS rather than repeated, so the count stamped
 *  onto the rows is the same one the hero card prints. */
const MATCHED_SEAT_TARGETS: Record<string, number> = {
  ...WEEK_TOTALS.matched_seat,
  // Scope changes are watchlist movements, so every row in these three
  // buckets IS one of the customer's lines and all of them are stamped.
  newly_monitored: WEEK_TOTALS.lines.newly_monitored,
  monitoring_stopped: WEEK_TOTALS.lines.monitoring_stopped,
  first_appearance: WEEK_TOTALS.lines.first_appearance,
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
        occurred_at: stamp(THIS_RUN, 9, 18, 30),
        // Two thirds of newly monitored lines were already out there; the
        // rest the book has never seen, so they carry no date and the card
        // says nothing rather than guessing.
        first_seen_at:
          event === "newly_monitored" && line % 3 !== 2
            ? daysBefore(72)
            : null,
        matched_via: matchedVia,
        ipd_declared_by: declaredBy,
      });
    }
    line += 1;
  }
  // Seat matches are a property of the line, not of the individual
  // placement, so they are stamped a whole line at a time and the totals
  // land on the same numbers the summary card reports.
  const seatTarget = MATCHED_SEAT_TARGETS[event];
  // Which rows get to SEED a stamp. A fixed every-seventh stride was fine
  // while every target was a handful, and silently under-delivered once the
  // targets grew: a bucket that wants all 142 of its rows stamped cannot get
  // there by seeding one row in seven. Spacing the seeds across the bucket
  // instead means the target is reached whatever its size, and the matched
  // rows stay spread through the list rather than bunching at the top.
  const stride = Math.max(1, Math.floor(rows.length / Math.max(1, seatTarget)));
  let stamped = 0;
  for (let i = 0; i < rows.length && stamped < seatTarget; i += 1) {
    const r = rows[i];
    if (i % stride !== 0) continue;
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

const LINE_EVENTS_BY_EVENT: Record<string, LineEvent[]> = {
  added: seededLines(SSPS_ADDED, "added", WEEK_TOTALS.lines.added),
  removed: seededLines(SSPS_REMOVED, "removed", WEEK_TOTALS.lines.removed),
  cert_changed: seededLines(SSPS_REMOVED, "cert_changed", WEEK_TOTALS.lines.cert_changed),
  first_appearance: seededLines(SSPS_ADDED, "first_appearance", WEEK_TOTALS.lines.first_appearance),
  // A week where the watchlist moved, so the preview exercises the states
  // a happy-path mock would hide.
  newly_monitored: seededLines(SSPS_ADDED, "newly_monitored", WEEK_TOTALS.lines.newly_monitored),
  monitoring_stopped: seededLines(SSPS_REMOVED, "monitoring_stopped", WEEK_TOTALS.lines.monitoring_stopped),
};

/*
 * "PUBLISHERS AFFECTED" AND "APPS AFFECTED", MEASURED RATHER THAN TYPED.
 *
 * The Changes page recounts both from the events it loaded, and compares
 * them against last week's figure out of the previous summary. Both used to
 * be hand-typed (20 and 15) next to a fixture that actually touched a
 * different number, so the card's delta was measuring a typo. Now this week
 * is counted off the rows the reader is about to see, and last week is a
 * fraction of it, which is the only way the arrow on that card can be true.
 *
 * Runs at module load, right after the events exist, so nothing downstream
 * can observe the un-filled value.
 */
(() => {
  const publishers = new Set<string>();
  const apps = new Set<string>();
  for (const rows of Object.values(LINE_EVENTS_BY_EVENT)) {
    for (const r of rows) {
      // Identity exactly as the page derives it, domain first and the id
      // as the fallback, so the two counts cannot differ by a row whose
      // domain happens to be missing.
      const id = r.developer_domain ?? String(r.developer_id);
      publishers.add(id);
      // Same split the page draws: app inventory is a change that landed
      // in a publisher's app-ads.txt.
      if (r.file_kind === "app_ads_txt") apps.add(id);
    }
  }
  mockSummary.hero_diff.affected = { publishers: publishers.size, apps: apps.size };
  mockPreviousSummary.hero_diff.affected = {
    publishers: lastWeek(publishers.size, 0.86),
    apps: lastWeek(apps.size, 0.83),
  };
})();

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
  alwaysCert = false,
): MatchedSeatLine[] {
  const out: MatchedSeatLine[] = [];
  for (let i = 0; i < count; i += 1) {
    const ssp = CHANGE_LINE_SSPS[(seed + i * 3) % CHANGE_LINE_SSPS.length];
    const relationship = (seed + i) % 3 === 0 ? "DIRECT" : "RESELLER";
    const publisher_id = `${ssp.split(".")[0]}-${
      1000 + ((seed * 7 + i * 131) % 8999)
    }`;
    const line: MatchedSeatLine = { ssp_domain: ssp, publisher_id, relationship };
    if (alwaysCert || (seed + i) % 4 === 0) {
      line.cert_id = certId(seed * 13 + i * 7 + 3);
    }
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
    added_lines: changeLinesFor(id * 2 + 1, added),
    removed_lines: changeLinesFor(id * 2 + 501, removed),
    cert_changed_lines: changeLinesFor(id * 2 + 907, cert, true),
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
    // One allocator for both rosters (see tailIdentity): past the name
    // supply it cycles with a WORD rather than a numeral, because
    // "Yellowstone Publishers 3" reads as a fixture that ran out of ideas
    // and on a demo that is the row a prospect stops on. It also refuses a
    // domain another roster already claimed, so the publisher shown on
    // "Matched publishers" and the one shown on "Changes" are never two
    // different companies wearing one domain.
    const { name, domain, platform } = tailIdentity(i, rnd);
    // Long-tail: a handful in 8-24, most in 1-8.
    const r = rnd();
    const line_count =
      r < 0.15 ? 8 + Math.floor(rnd() * 18) : 1 + Math.floor(rnd() * 8);
    rows.push({
      developer_id: 100_000 + i * 37,
      name,
      domain,
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
): MatchedDevelopersPage {
  const pool = MATCHED_DEVS.filter((d) => carries(d.matched_lines, lines));
  return mockPage(pool, page, q, ["name", "domain"]) as MatchedDevelopersPage;
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

export function mockMatchedApps(page: number, q = "", lines: string[] = []): MatchedAppsPage {
  const pool = MATCHED_APPS.filter((a) => carries(a.matched_lines, lines));
  return mockPage(pool, page, q, ["app_name", "bundle_id", "owner_domain"]) as MatchedAppsPage;
}

/** The summary under a seat-line filter: the matched counters re-counted
 *  over what carries the selected lines. Everything else stays crawl-wide. */
export function mockSummaryFor(lines: string[]): Summary {
  const base: Summary = { ...mockSummary, watchlist: { seats: CUSTOMER_SEATS, discover: [] } };
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
    },
    hero_diff: {
      ...base.hero_diff,
      line_totals: {
        ...base.hero_diff.line_totals,
        added: count("added"),
        removed: count("removed"),
        cert_changed: count("cert_changed"),
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
        occurred_at: stamp(THIS_RUN, 9, 18, 30),
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
 * Modelled on the operator's real case: a crawl for two of the customer's
 * own domains with no seat lines at all. Most lines therefore carry one of
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
  { domain: "arcaneflow.com", weight: 46 },
  { domain: "arcflow.tv", weight: 34 },
  { domain: "arcaneflowmedia.com", weight: 12 },
  { domain: "sonobi.com", weight: 8 },
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
  if (ssp === "sonobi.com") return `sb-${(n % 90_000) + 10_000}`;
  if (ssp === "arcflow.tv") return `${(n % 900_000) + 100_000}`;
  if (ssp === "arcaneflowmedia.com") return `cm${(n % 90_000) + 10_000}`;
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
    ssp_domain: "arcaneflow.com",
    publisher_id: "1042318",
    relationship: "RESELLER",
    cert_id: "4a7be0c1d9f23b58",
    placements_count: 431,
    previous_placements_count: 402, // up 29
  },
  {
    ssp_domain: "arcflow.tv",
    publisher_id: "618402",
    relationship: "RESELLER",
    cert_id: "",
    placements_count: 387,
    previous_placements_count: 391, // down 4
  },
  {
    ssp_domain: "arcaneflow.com",
    publisher_id: "2884190",
    relationship: "DIRECT",
    cert_id: "b1f4c72e5a08d9c3",
    placements_count: 264,
    previous_placements_count: 264, // no change
  },
  {
    ssp_domain: "arcflow.tv",
    publisher_id: "774061",
    relationship: "RESELLER",
    cert_id: "9c02ea41b7d5f6a8",
    placements_count: 198,
    previous_placements_count: null, // new this week
  },
  {
    ssp_domain: "arcaneflow.com",
    publisher_id: "3390514",
    relationship: "RESELLER",
    cert_id: "",
    placements_count: 176,
    previous_placements_count: 151, // up 25
  },
  {
    ssp_domain: "arcaneflowmedia.com",
    publisher_id: "cm41288",
    relationship: "RESELLER",
    cert_id: "77d3b0e9c142a5fb",
    placements_count: 143,
    previous_placements_count: 158, // down 15
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

/**
 * Lines that were in last week's crawl and are gone from this one, by
 * discovery domain. They exist only so the summary row's previous-week
 * total is honest: the rows a crawl returns cover lines that still exist,
 * so summing them would erase every disappearance and make every week look
 * like growth. The live endpoint counts the previous crawl directly and
 * never needs this table.
 */
const DISCOVERY_VANISHED: Record<string, { lines: number; placements: number }> = {
  "arcaneflow.com": { lines: 4, placements: 62 },
  "arcflow.tv": { lines: 3, placements: 41 },
  "arcaneflowmedia.com": { lines: 1, placements: 9 },
  "sonobi.com": { lines: 0, placements: 0 },
};

/** Embed threshold, mirroring the rule stated in the api.ts contract. */
const DISCOVERED_EMBED_MAX = 20;

function discoveredTotals(pool: DiscoveredLine[]): DiscoveredTotals {
  let placements = 0;
  let previous_lines = 0;
  let previous_placements = 0;
  const ssps = new Set<string>();
  for (const l of pool) {
    placements += l.placements_count;
    ssps.add(l.ssp_domain);
    if (l.previous_placements_count != null) {
      previous_lines += 1;
      previous_placements += l.previous_placements_count;
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
  };
}

function lineKeyOf(k: DiscoveredLineKey): string {
  return [k.ssp_domain, k.publisher_id, k.relationship, k.cert_id].join("|");
}

/**
 * Filtering matches the live line-events behaviour: ssp_domain is a
 * case-insensitive substring, so typing "arcane" keeps both arcaneflow.com
 * and arcaneflowmedia.com, and "tv" keeps arcflow.tv alone.
 *
 * Mock-only escape hatch: adding ``?discovery=none`` to the URL empties the
 * list, which is how the seat-line-only empty state is reviewed without a
 * second fixture set. Never reached in a production build, where MOCK is
 * false and this module is tree-shaken out.
 */
export function mockDiscoveredLines(opts: {
  page?: number;
  page_size?: number;
  ssp_domain?: string;
}): DiscoveredLinesPage {
  const page = opts.page ?? 1;
  const pageSize = opts.page_size ?? 50;
  const emptied =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("discovery") === "none";
  let pool = emptied ? [] : DISCOVERED_LINES;
  if (opts.ssp_domain) {
    const needle = opts.ssp_domain.trim().toLowerCase();
    pool = pool.filter((r) => r.ssp_domain.toLowerCase().includes(needle));
  }
  const start = (page - 1) * pageSize;
  return {
    page,
    page_size: pageSize,
    total: pool.length,
    totals: discoveredTotals(pool),
    // Strip the embedded placements above the threshold, exactly as the
    // proposed endpoint would, so the card's fetch-on-expand path is what
    // a mock review actually exercises on the wide lines.
    rows: pool.slice(start, start + pageSize).map((l) =>
      l.placements && l.placements.length <= DISCOVERED_EMBED_MAX
        ? l
        : { ...l, placements: undefined },
    ),
  };
}

export function mockDiscoveredLinePlacements(
  key: DiscoveredLineKey,
  opts: { page?: number; page_size?: number },
): DiscoveredPlacementsPage {
  const page = opts.page ?? 1;
  const pageSize = opts.page_size ?? 100;
  const wanted = lineKeyOf(key);
  const line = DISCOVERED_LINES.find((l) => lineKeyOf(l) === wanted);
  const rows = line?.placements ?? [];
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
 * The customer-report shape: the Excel sheet's rows, flat. Lifted from a
 * shape of a real run: a handful of partners each named by many
 * publisher files, in both files where the publisher has both, plus owner
 * domains and a few country-scoped manager domains so every kind renders.
 */
/** The mock customer's own domain: what its downloads are named after. */
export const MOCK_CUSTOMER_DOMAIN = "arcaneflow.com";

const DECLARATION_ROWS_SEED: [string, string, string[], string][] = [
  // Only rows that NAME the customer's own domain (arcaneflow.com): the
  // sheet is per customer, and discover domains are not the customer's
  // domain.
  ["inventory partner", "arcaneflow.com", [
    "riverstone.com", "chompstudios.com", "copperline.tv", "roostmedia.tv", "bluefinmedia.com",
    "nomadmediagroup.com", "northstar.games", "deepsea.games", "auroratvnetworks.com", "beaconbroadcasting.tv",
    "harborpointmedia.com", "kestrelgames.io", "meadowlarkmedia.com", "halcyonnetworks.tv", "sablebroadcasting.tv", "riverbendstudios.com",
  ], ""],
  ["owner domain", "arcaneflow.com", ["riverstone.com", "chompstudios.com"], ""],
  ["manager domain", "arcaneflow.com", ["riverstone.com", "chompstudios.com", "copperline.tv"], ""],
  ["manager domain", "arcaneflow.com", ["riverstone.com"], "IN"],
  ["manager domain", "arcaneflow.com", ["chompstudios.com"], "BR"],
];

export const mockDeclarationRows: DeclarationRowsPayload = (() => {
  const rows: DeclarationRow[] = [];
  DECLARATION_ROWS_SEED.forEach(([declaration, declared_domain, declarers, country]) => {
    declarers.forEach((declared_by, i) => {
      rows.push({ declaration, declared_domain, declared_by, country, found_in: "ads.txt" });
      // Most publishers carry both files; every third one is web-only.
      if (i % 3 !== 2) {
        rows.push({ declaration, declared_domain, declared_by, country, found_in: "app-ads.txt" });
      }
    });
  });
  return { rows, total: rows.length };
})();

export const mockDeclarations: Declarations = {
  totals: { ipd_partners: 3, owner_domains: 2, relationship_mismatches: 2 },
  ipd: [
    {
      partner_domain: "arcaneflow.com",
      declared_by: declarationSources(50, 0),
      declarer_total: 63,
    },
    {
      partner_domain: "arcflow.tv",
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

/*
 * THE ASK AI PANEL'S ANSWERS.
 *
 * Two rules, both learned the hard way on a fixture this one replaces.
 *
 * FIRST, every figure is READ OFF THE REPORT, never typed. These answers
 * used to quote a hardcoded 184 and 127 while the card directly above the
 * panel said something else, which is the single worst thing a demo can do:
 * the one surface whose whole promise is "these numbers are checkable"
 * caught contradicting itself, in public, by anyone who reads two lines.
 *
 * SECOND, matching is by KEYWORD, not by the full question. The four
 * suggested chips on the overview are phrased nothing like the keys here
 * ("Are any of my seats unauthorized?" against "which of my seats are
 * unauthorized?"), so a whole-string match sent all four to the same
 * default answer -- four different questions, one identical reply, which
 * reads as a panel that is not listening.
 */
const chatFigures = () => {
  const d = mockSummary.hero_diff;
  const n = (x: number) => x.toLocaleString();
  const worstRemovals = DEV_REMOVED.slice(0, 4);
  return { d, n, worstRemovals };
};

/** Answer keyed by the words a reader actually types. Order matters: the
 *  first rule whose keywords appear wins, so the specific questions sit
 *  above the general ones. */
const CHAT_RULES: { match: string[]; answer: () => string }[] = [
  {
    match: ["unauthorized", "unauthorised", "authoriz", "authoris"],
    answer: () => {
      const { d, n, worstRemovals } = chatFigures();
      const seats = d.line_totals_matched_seat.removed;
      const lead = worstRemovals
        .slice(0, 3)
        .map(
          (r) =>
            `- **${r.developer_name}** (${r.developer_domain}): dropped all ${r.matched_lines_prev} of your lines.`,
        )
        .join("\n");
      return `**${n(seats)} of your own seat lines came off this week**, which means that many declared partner relationships are no longer authorized by the publisher.

${lead}

A removed line means the publisher no longer lists your partner as authorized. Buyers that check authorization will start filtering these on the next crawl. Open Changes and filter to Removed for the full list.`;
    },
  },
  {
    match: ["lost the most", "removed", "dropped", "lost", "gone"],
    answer: () => {
      const { d, n, worstRemovals } = chatFigures();
      const rows = worstRemovals
        .map(
          (r, i) =>
            `${i + 1}. **${r.developer_name}** (${r.developer_domain}, ${r.developer_platform}): ${r.matched_lines_prev} lines removed${
              r.top_ssps?.length
                ? ` (${r.top_ssps.slice(0, 3).map((t) => `${t.ssp_domain.split(".")[0]} ${t.count}`).join(", ")})`
                : ""
            }.`,
        )
        .join("\n");
      return `**${n(d.line_totals.removed)} lines came off this week**, ${n(d.line_totals_matched_seat.removed)} of them on a seat you actually hold.

The publishers that dropped you entirely:

${rows}

The SSP taking the biggest cut is ${d.top_ssps.removed[0].ssp_domain} at ${n(d.top_ssps.removed[0].count)} lines. A missing ads.txt entry means the publisher no longer authorizes that relationship: these are real removals, not fetch errors.`;
    },
  },
  {
    match: ["ssp moved", "which ssp", "by ssp", "partner moved"],
    answer: () => {
      const { d, n } = chatFigures();
      const table = d.top_ssps.added
        .map((a, i) => {
          const rem = d.top_ssps.removed[i];
          return `| ${a.ssp_domain} | +${n(a.count)} | ${rem ? `${rem.ssp_domain} (-${n(rem.count)})` : ""} |`;
        })
        .join("\n");
      return `This week's movement, by SSP:

| Gaining | Lines added | Losing |
|---|---|---|
${table}

${d.top_ssps.added[0].ssp_domain} is the cleanest single-partner expansion in the diff at +${n(d.top_ssps.added[0].count)}; ${d.top_ssps.removed[0].ssp_domain} is the biggest contraction at -${n(d.top_ssps.removed[0].count)}. ${n(d.line_totals.cert_changed)} lines kept the seat but changed certification authority id, which usually follows a reseller migration.`;
    },
  },
  {
    match: ["reseller", "direct"],
    answer: () => {
      const { d, n } = chatFigures();
      const rows = d.top_ssps.added
        .map((a) => `| ${a.ssp_domain} | ${n(Math.round(a.count * 0.68))} | ${n(a.count - Math.round(a.count * 0.68))} |`)
        .join("\n");
      return `Of the **${n(d.line_totals.added)} lines added this week**, the split by relationship across your top partners:

| SSP | New RESELLER | New DIRECT |
|---|---|---|
${rows}

Every one of these reseller nodes is a live counterparty in the seller list, so the payment path looks clean.`;
    },
  },
  {
    match: ["added", "new", "gain", "grew", "growth"],
    answer: () => {
      const { d, n } = chatFigures();
      const best = DEV_ADDED.slice(0, 4)
        .map((r) => `- **${r.developer_name}** (${r.developer_platform}): ${r.lines_added} new lines`)
        .join("\n");
      return `**${n(d.line_totals.added)} lines were added this week**, ${n(d.line_totals_matched_seat.added)} of them on one of your own seats, across ${n(d.developer_totals.added)} brand-new publishers and ${n(d.developer_totals.changed)} existing ones.

New this week:

${best}

Most of the growth is on ${d.top_ssps.added[0].ssp_domain} (+${n(d.top_ssps.added[0].count)}), then ${d.top_ssps.added[1].ssp_domain} (+${n(d.top_ssps.added[1].count)}).`;
    },
  },
];

const chatDefault = () => {
  const { d, n, worstRemovals } = chatFigures();
  const cluster = worstRemovals
    .slice(0, 3)
    .map((r) => `${r.developer_name} (${r.matched_lines_prev})`)
    .join(", ");
  return `Here is the short read of this week:

- **${n(d.line_totals.removed)} lines removed**, mostly from ${d.top_ssps.removed
    .slice(0, 3)
    .map((r) => `${r.ssp_domain} (${n(r.count)})`)
    .join(", ")}.
- **${n(d.line_totals.added)} lines added**, led by ${d.top_ssps.added
    .slice(0, 3)
    .map((r) => r.ssp_domain)
    .join(", ")}.
- **${n(d.line_totals.cert_changed)} cert changes**, where the seat stayed and the certification authority id moved.

The removals cluster on a few publishers: ${cluster}. That reads as a cleanup of older relationships. Worth checking whether those publishers moved to a sales-house partner.`;
};

function pickChatResponse(prompt: string): string {
  const p = prompt.toLowerCase().trim();
  for (const rule of CHAT_RULES) {
    if (rule.match.some((k) => p.includes(k))) return rule.answer();
  }
  return chatDefault();
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
