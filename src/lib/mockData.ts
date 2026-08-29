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
  DeveloperEventsPage,
  DeveloperEvent,
  LineEventsPage,
  LineEvent,
  MatchedDevelopersPage,
  MatchedBundlesPage,
  ChatFrame,
} from "./api";
import { buildSystemPrompt } from "./knowledge";

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
      developers: 8_408,
      apps: 24_614,
    },
  },
  hero_diff: {
    line_totals: { added: 92, removed: 74, cert_changed: 28 },
    line_totals_matched_seat: { added: 6, removed: 4, cert_changed: 3 },
    developer_totals: { added: 9, removed: 4, changed: 41 },
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

export const mockSummary: Summary = {
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
  },
  hero_diff: {
    line_totals: {
      added: 127,
      removed: 184,
      cert_changed: 43,
    },
    line_totals_matched_seat: {
      added: 12,
      removed: 27,
      cert_changed: 6,
    },
    developer_totals: {
      added: 12,
      removed: 8,
      changed: 47,
    },
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
  event: "added" | "removed" | "changed",
  page: number,
): DeveloperEventsPage {
  const rows = DEV_TABLES[event] ?? [];
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

function seededLines(
  ssps: string[],
  event: "added" | "removed" | "cert_changed",
  seed: number,
): LineEvent[] {
  const rows: LineEvent[] = [];
  for (let i = 0; i < seed; i += 1) {
    const ssp = ssps[i % ssps.length];
    const dev = i < DEV_ADDED.length ? DEV_ADDED[i] : DEV_ADDED[i % DEV_ADDED.length];
    const removedDev =
      i < DEV_REMOVED.length ? DEV_REMOVED[i] : DEV_REMOVED[i % DEV_REMOVED.length];
    const chosenDev = event === "removed" ? removedDev : dev;
    const relationship = i % 3 === 0 ? "DIRECT" : "RESELLER";
    rows.push({
      developer_id: chosenDev.developer_id,
      developer_name: chosenDev.developer_name,
      developer_domain: chosenDev.developer_domain,
      file_kind: chosenDev.developer_platform === "Web" ? "ads_txt" : "app_ads_txt",
      ssp_domain: ssp,
      publisher_id: `${
        ssp.split(".")[0]
      }-${1000 + ((i * 37 + seed * 11) % 8999)}`,
      relationship,
      event,
      old_cert_id: event === "removed" || event === "cert_changed" ? `old-cert-${i}` : null,
      new_cert_id: event === "added" || event === "cert_changed" ? `new-cert-${i}` : null,
      matched_seat: i % 4 === 0,
      occurred_at: "2026-08-25T09:18:30Z",
    });
  }
  return rows;
}

const LINE_EVENTS_BY_EVENT: Record<string, LineEvent[]> = {
  added: seededLines(SSPS_ADDED, "added", 127),
  removed: seededLines(SSPS_REMOVED, "removed", 184),
  cert_changed: seededLines(SSPS_REMOVED, "cert_changed", 43),
};

export function mockLineEvents(
  filters: {
    event?: string;
    ssp_domain?: string;
    developer_id?: number;
    matched_seat_only?: boolean;
    page?: number;
    page_size?: number;
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

function buildMatchedDevs(): { developer_id: number; name: string; domain: string; platform: string; line_count: number }[] {
  const rows: { developer_id: number; name: string; domain: string; platform: string; line_count: number }[] = [
    ...DEV_HEAD,
  ];
  const rnd = xorshift(1_337);
  for (let i = 0; i < DEV_NAMES.length && rows.length < 100; i += 1) {
    const name = DEV_NAMES[i];
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
  // Sort by line_count desc so the head reads as head.
  return rows.sort((a, b) => b.line_count - a.line_count);
}

const MATCHED_DEVS = buildMatchedDevs();

export function mockMatchedDevelopers(page: number): MatchedDevelopersPage {
  return {
    page,
    page_size: 100,
    total: MATCHED_DEVS.length,
    rows: MATCHED_DEVS,
  };
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

export function mockMatchedBundles(page: number): MatchedBundlesPage {
  return {
    page,
    page_size: 100,
    total: MATCHED_BUNDLES.length,
    rows: MATCHED_BUNDLES,
  };
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
// Chat SSE stream (mock)
// ─────────────────────────────────────────────────────────────────

/**
 * Mock chat responses.
 *
 * Two families:
 * - Data questions grounded in this week's + last week's mock summary.
 * - IAB spec questions grounded in the knowledge package in ../knowledge.
 *
 * The lookup is keyword-based: each entry declares a set of trigger phrases;
 * the first match wins. Order matters — put narrower topics before broader
 * ones (e.g. "app-ads.txt" before "ads.txt" so the CTV question doesn't get
 * eaten by the web-ads.txt entry).
 */
type ChatEntry = { triggers: string[]; body: string };

const CHAT_ENTRIES: ChatEntry[] = [
  // ── Eligibility / compliance ─────────────────────────────────
  // These live FIRST because they answer the questions a publisher
  // actually opens the report to ask: "am I still allowed to sell X",
  // "what broke this week", "am I at risk". More specific compliance
  // triggers come before broad ones so "restore compliance" beats bare
  // "compliant", etc.
  {
    triggers: ["still eligible", "am i eligible", "eligible to sell"],
    body: `Yes — you're still eligible to sell **{{TARGET}}** as of this week's crawl.

- Their app-ads.txt lists **18 lines matching your seats** this week.
- **6 on Magnite** (your strongest DIRECT relationship), **5 on OpenX**, **4 on Pubmatic**.
- **No cert-ID rotations** on any of your seats with them.
- **SupplyChain check**: a bid with \`asi=magnite.com, sid=<your-magnite-seat>\` in schain node 0 will pass authorization. However, {{TARGET}} does NOT declare \`OWNERDOMAIN\` yet, so a strict SPO-first DSP may treat \`schain.complete\` as 0 on their first bid.

**Bottom line:** eligible today, at slight risk of being downweighted by SPO-strict buyers until {{TARGET}} adds an \`OWNERDOMAIN\` variable to their app-ads.txt. Ask them.`,
  },
  {
    triggers: ["was i authorized", "authorized on", "authorized last week"],
    body: `On **{{TARGET}}**: **last week yes, this week no.**

Last week's crawl had **22 lines** matching your seats:
- appnexus.com — 8 lines (mix of DIRECT and RESELLER)
- rubiconproject.com — 9 lines (mostly RESELLER)
- google.com — 5 lines (DIRECT)

This week's crawl finds **zero lines**. {{TARGET}} either purged their entire ads.txt or their domain returned a 404 for the second consecutive week. Per ads.txt v1.1 §3.1, a 404 is treated as "no advertising system authorized" — so any buyer that runs authorization checks will start filtering every bid coming from {{TARGET}} starting on the next crawl.

**Action:** reach out to {{TARGET}} ad-ops directly. If they legitimately dropped you, that's contractual and you're done; if the ads.txt is missing accidentally (deploy regression, domain issue), they need to republish it before next Monday's crawl.`,
  },
  {
    triggers: ["non-compliant", "became non", "went non", "lost compliance"],
    body: `Your compliance status shifted on **12 seat lines this week**. Breakdown:

**Compliant → non-compliant (12 seats):**
- **8 seats** on 4 publishers who dropped their entire ads.txt lines for you (Kite Interactive, Cinder & Sky, Meridian Sports Media, Sable Broadcasting).
- **3 seats** where the DIRECT relationship was downgraded to RESELLER on active publishers. Not spec-breaking per ads.txt v1.1 §3.3, but many DSP quality scores weight DIRECT higher.
- **1 seat** where the cert-ID rotated AND the account-ID rotated together (needs manual re-verification with the SSP).

**Stayed compliant:** 1,337,480 of 1,337,492 lines (99.999%). The vast majority of your matched inventory is untouched.

**Newly compliant this week:** 12 seats on the 6 net-new publishers (Chomp, Roost, Deep Sea, Aurora, Pixel Cauldron, Northlight).

**Net:** -0 seats vs last week (12 lost, 12 gained). But it's not the same 12 — you traded 4 established publishers for 6 mobile-first ones. That's a materially different portfolio, not a wash.`,
  },
  {
    triggers: ["newly authorized", "newly listed", "publishers newly", "who newly"],
    body: `**6 publishers newly authorized you this week**, adding 47 net-new matching lines:

| Publisher | Platform | New lines | Top SSPs |
|---|---|---|---|
| Chomp Studios | iOS | 18 | Magnite (6), OpenX (5), Pubmatic (4) |
| Roost Media | Roku CTV | 14 | SpotX (5), Beachfront (4), Magnite (3) |
| Deep Sea Games | Android | 11 | Pubmatic (4), SmartAdServer (3) |
| Aurora TV Networks | CTV | 9 | Sharethrough (4), Magnite (3) |
| Pixel Cauldron | iOS | 8 | OpenX (3), SmartAdServer (2) |
| Northlight Games | Android | 7 | Pubmatic (3), Magnite (2) |

All six are publishing valid app-ads.txt discovered through their app store's \`appstore:developer_url\` meta tag. **None declare \`OWNERDOMAIN\`** — worth a note to your account managers so a strict SPO buyer's SupplyChain check doesn't flag these as \`complete=0\`. One-line fix on their side.`,
  },
  {
    triggers: ["de-authorized", "deauthorized", "who dropped me", "who removed me"],
    body: `**4 publishers de-authorized you this week** (removed every one of your matched lines):

1. **Kite Interactive** (kiteinteractive.com, iOS) — 22 lines gone (AppNexus 8, Rubicon 9, Google 5).
2. **Cinder & Sky** (cinderandsky.co, Web) — 16 lines gone (Google 7, Criteo 5, Yahoo 4).
3. **Meridian Sports Media** (meridiansports.io, iOS) — 12 lines gone (AppNexus 6, Yahoo 4, Rubicon 2).
4. **Sable Broadcasting** (sablebroadcast.tv, Samsung CTV) — 9 lines gone (Rubicon 5, plus 4 more).

Per ads.txt v1.1, a missing entry = publisher no longer authorizes that relationship. Buyers running strict authorization checks will filter every bid on this inventory starting next crawl.

Common pattern for this shape of drop is a publisher moving to a sales-house exclusive (which would show up as a \`MANAGERDOMAIN\` in their new ads.txt). None of these four declared one, so it's more likely a plain contract wind-down or an accidental ads.txt rewrite. Worth 4 emails.`,
  },
  {
    triggers: ["how many seats", "how many am i compliant", "how many compliant", "compliance rate", "authorization rate"],
    body: `**You're compliant on 1,337,492 matched lines** across **8,412 publishers** and **24,781 apps** — that's the full set the ads.txt / app-ads.txt discovery marked as valid for you this crawl.

Vs last week (1,338,549 lines / 8,408 devs / 24,614 apps): **-1,057 lines, +4 developers, +167 apps**.

- Line count dropped slightly because 4 high-line-count publishers fully dropped you (Kite, Cinder & Sky, Meridian, Sable — 59 lines combined) and the 6 new publishers came in with fewer lines each.
- Developer breadth grew (+4 net) and app coverage grew a lot (+167).
- Net-positive trend for **supply diversity** even though gross line count dipped.

Compliance rate (matched lines / total attempted lines this week): **99.06%** (12 seat-level compliance losses out of 1,337,504 attempted). Last week it was 99.02%. Slight improvement.`,
  },
  {
    triggers: ["at risk", "filtered by buyers", "get filtered", "risk of being"],
    body: `**High-risk items this week — buyers doing strict supply-path checks will start filtering these next crawl:**

1. **12 DIRECT seat lines fully removed** (see "de-authorized" — Kite, Cinder & Sky, Meridian, Sable). Buyers that require a matching ads.txt entry for the schain node will filter every bid on these publishers.
2. **6 new publishers don't publish OWNERDOMAIN** (Chomp, Roost, Deep Sea, Aurora, Pixel Cauldron, Northlight). Buyers that check \`schain.nodes[0].domain == ads.txt OWNERDOMAIN\` may treat the chain as \`complete=0\`. Not fatal for most DSPs; SPO-first DSPs will downweight.
3. **1 seat needs manual re-verification** — cert-ID + account-ID both rotated on the same seat.

**Low-risk (safe to ignore):**
- 43 cert-ID rotations without a relationship change — benign per ads.txt v1.1 §3.3 (cert IDs are being superseded by the \`identifiers\` object in sellers.json anyway and may be deprecated in a future spec revision).
- 3 DIRECT→RESELLER downgrades on stable relationships — spec-legal per v1.1 §3.3, just a preference signal.`,
  },
  {
    triggers: ["broke my compliance", "what broke", "root cause"],
    body: `Three things broke compliance this week:

1. **Four publishers fully dropped you** (Kite, Cinder & Sky, Meridian, Sable — 59 lines combined). Most impactful — these were 3+ month-old, high-line-count relationships.
2. **Three DIRECT → RESELLER downgrades** on active publishers. Not spec-breaking (both are valid per ads.txt v1.1 §3.3), but DSP quality scores often weight DIRECT higher, and SPO paths through DIRECT are shorter.
3. **One dual-rotation** (cert-ID + account-ID together) on an existing seat needs manual re-verification with the SSP.

**Root cause is publisher-side, not yours** — no change to your ads.txt or seat configuration would have prevented any of this. The fix is contact + re-authorization on the four dropped publishers, plus a quick email to the SSP on the dual-rotation seat.`,
  },
  {
    triggers: ["direct lines", "direct line", "lost direct", "direct relationships"],
    body: `You lost **8 DIRECT lines this week** (removed by publisher-side ads.txt updates):

- **appnexus.com, xf-4402, DIRECT**: Kite Interactive dropped this line entirely.
- **rubiconproject.com, 22890, DIRECT**: Sable Broadcasting removed their only DIRECT with you on Samsung CTV.
- **google.com, pub-9083…, DIRECT**: Cinder and Sky purged all Google DIRECT lines.
- **appnexus.com, xf-2201, DIRECT**: Meridian Sports Media dropped it.
- Plus 4 more — filter Line changes by "removed" + "My seats only" to see the full list.

**Why DIRECT lines matter more than RESELLER:** most DSP quality scores weight them higher (fewer intermediaries), they carry lower reseller-margin skim in SPO-optimized paths, and in a complete SupplyChain object a DIRECT origin node results in a shorter chain — buyers prefer short chains.

**Restore priority:** these 8 DIRECT lines should be the first outreach this week. Losing DIRECT and keeping RESELLER on the same SSP is worse than losing both, because your bids now compete against your own reseller path.`,
  },
  {
    triggers: ["arbitrage", "legit inventory", "supply-path", "supply path optim"],
    body: `**Arbitrage screening from this week's crawl:**

- All 8,412 matched publishers have valid ads.txt / app-ads.txt — basic authorization is clean.
- **Only ~40% declare \`OWNERDOMAIN\` (ads.txt v1.1)**. Without it, buyers can't strictly verify that the entity being paid at schain node 0 actually owns the inventory. The door is open for undeclared re-labeling ("arbitrage") on the other ~60%.
- **Zero publishers this week declared \`MANAGERDOMAIN\`** for any of your markets. If any of your traffic actually flows through a sales house, you can't currently prove that from ads.txt alone — the SPO signal is missing.
- **No \`INVENTORYPARTNERDOMAIN\` chains observed** on your matched inventory this week (typical for non-CTV / non-syndicated inventory).

**Verdict:** the crawl passes basic authorization for every matched line. Arbitrage risk is **medium on the ~60% of publishers without OWNERDOMAIN**. Worth pushing your top-20 publishers by revenue to adopt v1.1 variables so their schain becomes strictly verifiable end to end — that's a competitive advantage vs publishers who don't.`,
  },
  {
    triggers: ["restore compliance", "how to fix", "how do i fix", "recover compliance", "what should i do to restore"],
    body: `Playbook for this week's compliance gaps:

1. **Email the 4 fully-dropped publishers** (Kite Interactive, Cinder & Sky, Meridian Sports Media, Sable Broadcasting). Confirm whether the ads.txt change is intentional. If yes, no action; if not, ask them to restore your lines before next Monday's crawl.
2. **Ask the 6 new publishers** (Chomp, Roost, Deep Sea, Aurora, Pixel Cauldron, Northlight) **to add \`OWNERDOMAIN=<their-domain>\`** to their app-ads.txt. One-line change on their side, big compliance win for you with SPO-strict DSPs.
3. **Re-verify the 1 dual-rotation seat** with the SSP directly — needs a new cert-ID confirmation.
4. **43 cert-ID-only rotations** — no action needed. Benign per ads.txt v1.1 §3.3.
5. **Nothing to change on your ads.txt or seats.** All this week's gaps are publisher-side.

Total effort: ~6 emails. Expected result: 8–12 of the 12 lost seats restored by next crawl.`,
  },
  // ── Data questions ────────────────────────────────────────────
  {
    triggers: ["who removed", "which publishers dropped", "publisher lost the most"],
    body: `Four publishers dropped your matched lines entirely this week:

1. **Kite Interactive** (kiteinteractive.com, iOS): 22 lines removed (Rubicon 9, AppNexus 8, Google 5).
2. **Cinder and Sky** (cinderandsky.co, Web): 16 lines (Google 7, Criteo 5, Yahoo 4).
3. **Meridian Sports Media** (meridiansports.io, iOS): 12 lines (AppNexus 6, Yahoo 4, Rubicon 2).
4. **Sable Broadcasting** (sablebroadcast.tv, Samsung CTV): 9 lines (Rubicon 5).

A missing ads.txt entry means the publisher no longer authorizes that relationship. These are real removals, not fetch errors — worth a note to the account team on each before next week's crawl.`,
  },
  {
    triggers: ["magnite"],
    body: `Magnite (magnite.com) added **34 new lines this week**, with no removals and no cert changes.

- **New publishers on Magnite**: Chomp Studios (+6), Roost Media (+3), Aurora TV Networks (+3), Northlight Games (+2).
- **Existing publishers where Magnite grew**: Riverstone Publishers (+4), Copperline Studios (+2).
- **No cert-id changes** for Magnite on your seats this week.

Cleanest single-partner expansion in this diff. If Magnite is a priority for you, confirm the OWNERDOMAIN is set correctly on the new publishers next week — that's what ties their ads.txt back to Magnite's sellers.json entry.`,
  },
  {
    triggers: ["new reseller", "show me all new resellers", "reseller lines"],
    body: `**127 new reseller lines** and 43 new direct lines added this week. Reseller only:

| SSP | New reseller lines | Notable publishers |
|---|---|---|
| magnite.com | 24 | Chomp Studios, Roost Media, Riverstone Publishers |
| openx.com | 16 | Chomp Studios, Pixel Cauldron |
| pubmatic.com | 14 | Deep Sea Games, Northlight Games |
| sharethrough.com | 11 | Aurora TV Networks, Riverstone Publishers |
| smartadserver.com | 8 | Deep Sea Games, Pixel Cauldron |
| adform.com | 7 | Riverstone Publishers |

Every one of these reseller nodes has a live counterparty in the seller list, so the payment path looks clean.`,
  },
  {
    triggers: ["unauthorized", "which of my seats are unauthor"],
    body: `You have **12 seat lines removed this week**, which means 12 of your declared partner relationships are no longer authorized by the publisher:

- **appnexus.com, xf-4402, DIRECT**: Kite Interactive dropped this line entirely.
- **rubiconproject.com, 22890, DIRECT**: Sable Broadcasting removed it (was your only direct with them on Samsung CTV).
- **google.com, pub-9083…, DIRECT**: Cinder and Sky purged all Google lines this week.
- **Plus 9 more**. Turn on the "My seats only" filter in Line changes to see the full list.

A removed line means the publisher no longer lists your partner as authorized. Buyers that check for authorization will start filtering these on the next crawl.`,
  },
  {
    triggers: ["compare", "vs last week", "this and last week", "week over week"],
    body: `Week-over-week rollup (this week's crawl vs last week's):

| Metric | Last week | This week | Change |
|---|---|---|---|
| Publisher domains fetched | 1,299,402 | 1,305,881 | +6,479 |
| Matched publishers | 8,408 | 8,412 | +4 |
| Matched apps | 24,614 | 24,781 | +167 |
| Lines added (weekly diff) | 92 | 127 | +35 |
| Lines removed (weekly diff) | 74 | 184 | +110 |
| Cert changes | 28 | 43 | +15 |

The story this week: churn is elevated on the removed side (2.5× last week's pace) with three publishers accounting for most of it. Additions are broad-based, mostly new mobile publishers coming online with Magnite / OpenX / Pubmatic seats.`,
  },
  {
    triggers: ["ctv", "connected tv"],
    body: `**CTV movement this week:**

- **Roku**: Roost Media added 14 lines across SpotX (5), Beachfront (4), Magnite (3).
- **Samsung**: Sable Broadcasting removed 9 lines (mostly Rubicon).
- **Vizio**: Copperline Studios grew +6 / -1 with 2 cert changes on SpotX.
- **CTV (Aurora TV Networks)**: 9 lines added across Sharethrough (4) and Magnite (3).

CTV inventory relies on the app-ads.txt flow, discovered via each app's store listing → developer URL → \`/app-ads.txt\`. If any of the above look off, the fastest debug is: (1) check the app store page for a valid \`appstore:developer_url\` meta tag, (2) confirm the developer domain resolves an \`app-ads.txt\`, (3) look for an \`inventorypartnerdomain=\` line pointing at the real content owner.`,
  },
  {
    triggers: ["cert", "certification"],
    body: `**43 cert-ID changes this week** (an SSP rotated its Certification Authority ID for the same seat):

- amazon-adsystem.com (12), adform.com (9), criteo.com (7), spotx.tv (5), beachfront.com (4).

Cert-ID rotations are usually benign — an SSP re-issues its TAG ID or migrates from one certification authority to another. They only warrant attention if the publisher/SSP relationship changes at the same time (i.e. cert change + DIRECT→RESELLER, or cert change + removal). None of this week's cert changes coincide with a relationship change on your seats.

Note per ads.txt v1.1 §3.3, field 4 (Cert ID) is being superseded by the \`identifiers\` object in sellers.json and may be deprecated entirely in a future spec revision.`,
  },
  {
    triggers: ["what should i do", "action", "recommend"],
    body: `Top three things to do off this week's crawl:

1. **Reach out on the four full-drop publishers** (Kite, Cinder & Sky, Meridian, Sable). Ask if the removals are permanent (contract expired, moved to a sales house) or accidental (ads.txt rewrite that missed lines). If it's a sales-house move, check whether they set a \`MANAGERDOMAIN\` per ads.txt v1.1.
2. **Confirm your seats on the six new mobile / CTV publishers** (Chomp, Roost, Deep Sea, Aurora, Pixel Cauldron, Northlight). Their app-ads.txt now authorizes you — good moment to make sure the developer-URL flow is complete on your DSP end.
3. **Double-check the 12 lines lost on your own seats**. These are the ones a buyer will start filtering next crawl.

The 43 cert changes are noise — no action.`,
  },
  {
    triggers: ["never matches", "never seen", "roster"],
    body: `Of the 8,412 publishers whose ads.txt was crawled this week, **8,412 matched at least one of your seats** — that's the whole matched developer set on your Overview page.

The **6 net-new publishers** (Chomp Studios, Roost Media, Deep Sea Games, Aurora TV Networks, Pixel Cauldron, Northlight Games) all matched fresh. The **8 that fell off** (Kite Interactive, Cinder & Sky, Meridian Sports Media, Sable Broadcasting, plus 4 more) had lines removed to zero.

If you want the negative case — seats you carry that no publisher ever authorizes — that's a different report; we can wire it once the "seats without matches" endpoint lands.`,
  },
  // ── IAB spec questions ────────────────────────────────────────
  {
    triggers: ["what is app-ads", "app-ads.txt", "app ads txt"],
    body: `**app-ads.txt** is the IAB extension of ads.txt to apps distributed through app stores (mobile, CTV, connected devices). Instead of the file living on the *content* domain, it lives on the developer's *website* domain.

The discovery flow:
1. The bid request carries a \`storeurl\` (e.g. \`https://itunes.apple.com/us/app/id1110145109\`).
2. The verifier fetches that page, parses the three required \`<meta>\` tags — \`appstore:developer_url\`, \`appstore:bundle_id\`, \`appstore:store_id\`.
3. The developer URL is canonicalized: strip \`www.\`/\`m.\`, keep at most the leading subdomain, respect the public-suffix list.
4. Verifier fetches \`https://<canonical-developer-domain>/app-ads.txt\` (falling back to HTTP, and if the developer URL had a subdomain, falling back to the parent domain).
5. Records are parsed with the SAME syntax as ads.txt, except the \`subdomain=\` directive is unused and must be ignored.

Key subtlety: index apps by \`(store-domain, bundle_id or store_id) → developer-domain\`, not by the raw \`storeurl\`. The same app can have many locale/campaign URL variants.`,
  },
  {
    triggers: ["direct vs reseller", "difference between direct and reseller", "what does direct mean", "what does reseller mean"],
    body: `Per ads.txt v1.1 §3.3, field 3:

- **DIRECT** — the publisher (content owner) directly controls the account in field 2 on the SSP in field 1. This usually implies a direct business contract between publisher and SSP.
- **RESELLER** — the publisher has authorized another entity to control that account and resell the ad space via the SSP.

Two implications:
- A single publisher line can carry both — \`silverssp.com, 9675, RESELLER\` and \`silverssp.com, 5569, DIRECT\` on the same SSP is legal (different accounts).
- Field 3 is case-insensitive per the spec. Some publishers spell it \`Reseller\`; both are valid.

For supply-path optimization, buyers prefer DIRECT paths (fewer intermediaries taking margin). A publisher who sells everything via a single sales house should still declare that in \`MANAGERDOMAIN\` — the sales house's ads.txt will carry the DIRECT lines.`,
  },
  {
    triggers: ["supply chain", "schain", "supply path", "supplychain object"],
    body: `The **OpenRTB SupplyChain Object** (\`schain\`) is attached to every bid request and lists every party being paid on this specific transaction, ordered from origin publisher outward.

Node shape:
\`\`\`json
{ "asi": "ssp.com", "sid": "1234", "hp": 1, "name": "...", "domain": "..." }
\`\`\`
- \`asi\` = the SSP domain (matches field 1 in ads.txt AND hosts a sellers.json).
- \`sid\` = the seller ID at that SSP (matches field 2 in ads.txt AND a seller entry in that SSP's sellers.json).
- \`hp\` = 1 if this node is in the payment chain.

The chain's \`complete\` flag is critical: \`complete: 1\` means every hop is present; \`complete: 0\` means an upstream rebroadcaster couldn't reconstruct history and some serious DSPs simply won't spend on it.

Together with ads.txt (who's authorized) and sellers.json (who each seller IS), schain gives a buyer end-to-end verification that this bid request came through a legitimate, declared path.`,
  },
  {
    triggers: ["sellers.json", "sellers json"],
    body: `**sellers.json** is a JSON file every SSP / exchange should publish at \`https://<ssp-domain>/sellers.json\`. It maps each \`seller_id\` that SSP transacts on behalf of to a real business entity.

Each entry has:
- \`seller_id\` (matches field 2 in the publisher's ads.txt and \`sid\` in schain nodes)
- \`name\` and \`domain\` (the legal entity — publisher's \`domain\` should match \`OWNERDOMAIN\` in ads.txt v1.1)
- \`seller_type\`: \`PUBLISHER\` (owned-and-operated), \`INTERMEDIARY\` (reseller), or \`BOTH\`
- \`is_confidential\`: if true, the SSP is intentionally hiding identity

Buyers cache the file offline (avoids per-bid identity lookups) and use it to cross-reference every \`asi\`/\`sid\` pair in a bid request's SupplyChain object against the publisher's ads.txt.

Ads.txt v1.1 field 4 (Certification Authority ID) is being superseded by the sellers.json \`identifiers\` object and may be deprecated entirely in a future ads.txt release.`,
  },
  {
    triggers: ["ownerdomain", "owner domain"],
    body: `**OWNERDOMAIN** (introduced in ads.txt v1.1, §3.5.1) declares the PSL+1 business domain that owns the site.

\`\`\`
OWNERDOMAIN=mediacompany.com
greenadexchange.com, XF7342, DIRECT, 5jyxf8k54
\`\`\`

Why it matters: for a complete OpenRTB SupplyChain object, node[0]'s \`sellers.domain\` (from the SSP's sellers.json) MUST match the publisher's \`OWNERDOMAIN\`. Without it, buyers can't verify that the entity being paid at the origin actually owns the inventory.

Rules:
- Only the first occurrence is used.
- Recommended even when it equals the ads.txt host domain.
- Sellers listed as \`BOTH\` in sellers.json should declare OWNERDOMAIN in every ads.txt they own OR represent — this is how buyers detect arbitrage on multi-entity operators.`,
  },
  {
    triggers: ["managerdomain", "manager domain", "sales house"],
    body: `**MANAGERDOMAIN** (ads.txt v1.1 §3.5.1) declares a primary or exclusive monetization partner — typically a sales house — when the publisher itself is NOT selling its own inventory in a given market.

Syntax: \`MANAGERDOMAIN=<PSL+1 domain>[, <ISO 3166-1 alpha-2 country code>]\`. One entry per country, plus optionally a global default (no country code).

\`\`\`
OWNERDOMAIN=mediacompany.com
MANAGERDOMAIN=yellowmediamanager.com, FR
MANAGERDOMAIN=bluemediamanager.com, US
MANAGERDOMAIN=defaultmanager.com
\`\`\`

For inventory monetized by the manager, that manager's domain should be node[0] in a complete SupplyChain object. This is a strategic lever for publishers doing SPO — you're telling buyers "here is my preferred route; anything else is a longer path."`,
  },
  {
    triggers: ["inventorypartnerdomain", "inventory partner"],
    body: `**INVENTORYPARTNERDOMAIN** (ads.txt v1.0.3, added for CTV / OTT) lets a distributor delegate a whole block of authorized sellers to a content partner.

The traditional CTV pattern is unwieldy — a vMVPD carrying content from Programmer A had to copy every one of Programmer A's SSP lines into its own app-ads.txt. The v1.0.3 pattern collapses that to one line:

\`\`\`
# vMVPD B's app-ads.txt
ssp.com, vwxyz, DIRECT
inventorypartnerdomain=programmerA.com
\`\`\`

The crawler now fetches \`http://programmerA.com/ads.txt\` and treats every seat there as authorized for vMVPD B's inventory. **Only one hop** — an \`inventorypartnerdomain\` line in Programmer A's own ads.txt is NOT followed.

Bid-request requirement: this delegation is only honored when the bid request itself carries \`app.inventorypartnerdomain\` or \`site.inventorypartnerdomain\` per OpenRTB.`,
  },
  {
    triggers: ["subdomain", "subdomain="],
    body: `The **\`subdomain=\`** variable lets a root ads.txt point crawlers at a subdomain that has its own distinct authorized-sellers list.

\`\`\`
# example.com/ads.txt
greenadexchange.com, 12345, DIRECT, d75815a79
subdomain=divisionone.example.com
\`\`\`

Rules per §3.5.1 and §5.5:
- Only ROOT domains can refer to subdomains. Subdomains must not refer to further subdomains.
- The data on the subdomain is bound to the subdomain, NOT the parent.
- \`subdomain=\` is exempt from public-suffix truncation.
- If a subdomain isn't declared in the root's ads.txt OR the subdomain doesn't serve its own file, the subdomain inherits the root's authorized set.

Important: \`subdomain=\` is **unused in app-ads.txt** and must be ignored there.`,
  },
  {
    triggers: ["what is ads.txt", "what does ads.txt do", "why ads.txt", "purpose of ads"],
    body: `**ads.txt** (Authorized Digital Sellers) is an IAB Tech Lab standard where a publisher publishes a plain-text file at \`https://<domain>/ads.txt\` declaring exactly which SSPs / exchanges are authorized to sell that publisher's inventory, and under what account IDs.

The problem it solves: before ads.txt, a rogue seller could offer counterfeit inventory to buyers claiming to be a well-known publisher — the buyer had no cheap way to check. With ads.txt, buyers fetch the publisher's file and reject any bid request whose \`(SSP-domain, publisher-id)\` pair isn't on the list.

Record format is 3 required fields, comma-separated:
\`\`\`
<SSP domain>, <publisher account ID at that SSP>, DIRECT|RESELLER [, cert authority ID]
\`\`\`

Version 1.1 (August 2022) added \`OWNERDOMAIN\` and \`MANAGERDOMAIN\` to tie ads.txt into sellers.json and enable supply-path optimization signals.`,
  },
  {
    triggers: ["placeholder", "empty ads.txt", "authorize nobody"],
    body: `A publisher who authorizes **nobody** must not simply serve an empty file — after March 1, 2020, that behavior is deprecated because it's indistinguishable from a webserver error.

The correct signal per ads.txt v1.1 §3.2.1 is one placeholder line:

\`\`\`
placeholder.example.com, placeholder, DIRECT, placeholder
\`\`\`

\`example.com\` is used because it's an IETF-reserved domain (RFC 6761) that will never be a real SSP. This is a "file adheres to the spec AND declares no authorized sellers" signal, distinct from a 404 or an empty body.`,
  },
  // ── Fallback ──────────────────────────────────────────────────
  {
    triggers: ["__default__"],
    body: `Here is the short read of this week:

- **184 lines removed**, mostly from rubiconproject.com (42), appnexus.com (38) and google.com (29).
- **127 lines added**, led by magnite.com, openx.com and pubmatic.com. Most of those additions are on new mobile publishers (Chomp Studios, Roost Media, Deep Sea Games).

The removals cluster on three publishers: Kite Interactive, Cinder and Sky, and Meridian Sports Media — 22, 16, and 12 lines gone. Looks like a cleanup of older relationships; worth checking whether they moved to a sales-house partner (which would show up as a \`MANAGERDOMAIN\` in their ads.txt).

Ask me anything specific: an SSP name, "what is app-ads.txt", "why did X drop", "what should I do".`,
  },
];

/**
 * Extract the "target" name from a prompt that references a specific app
 * or publisher. Used by the two entries that carry a {{TARGET}}
 * placeholder — an eligibility question and a retro authorization
 * question — so the mock answer reflects whichever name the dynamic
 * chip put in the prompt, not a hardcoded example.
 *
 * Match order: "sell X?", "sell X.", "authorized on X last week",
 * "authorized on X?". Case is preserved because we splice the name
 * back into a proper-noun position.
 */
function extractTarget(prompt: string): string | null {
  const sell = prompt.match(/sell\s+([^?.!]+?)(?:\s+last week)?[?.!]?\s*$/i);
  if (sell?.[1]) return sell[1].trim();
  const authOn = prompt.match(/authorized on\s+([^?.!]+?)(?:\s+last week)?[?.!]?\s*$/i);
  if (authOn?.[1]) return authOn[1].trim();
  return null;
}

function pickChatResponse(prompt: string): string {
  const p = prompt.toLowerCase().trim();
  for (const entry of CHAT_ENTRIES) {
    if (entry.triggers.includes("__default__")) continue;
    if (entry.triggers.some((t) => p.includes(t))) {
      if (entry.body.includes("{{TARGET}}")) {
        const target = extractTarget(prompt) ?? "this publisher";
        return entry.body.replaceAll("{{TARGET}}", target);
      }
      return entry.body;
    }
  }
  return CHAT_ENTRIES[CHAT_ENTRIES.length - 1].body;
}

/**
 * Compose (and log, once per conversation) the full system prompt that would
 * be sent to Gemini in live mode, so the wiring is exercised end-to-end even
 * without a real LLM. Same shape the future live chat will use — swap
 * mockChatStream for a Gemini SSE call and the system prompt is already
 * assembled correctly.
 */
let systemPromptLogged = false;
function logSystemPromptOnce() {
  if (systemPromptLogged) return;
  const prompt = buildSystemPrompt({
    currentSummary: mockSummary,
    previousSummary: mockPreviousSummary,
  });
  // eslint-disable-next-line no-console
  console.info(
    "[mock chat] system prompt composed (%d chars). Inspect in devtools.",
    prompt.length,
    prompt,
  );
  systemPromptLogged = true;
}

export async function* mockChatStream(
  prompt: string,
): AsyncGenerator<ChatFrame> {
  logSystemPromptOnce();
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
