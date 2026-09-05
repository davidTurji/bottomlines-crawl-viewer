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
  DiscoveredLine,
  DiscoveredLineKey,
  DiscoveredLinesPage,
  DiscoveredPlacement,
  DiscoveredPlacementsPage,
  DiscoveredTotals,
  LineEventsPage,
  LineEvent,
  MatchedDevelopersPage,
  MatchedBundlesPage,
  ChatFrame,
} from "./api";

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
  event: "added" | "removed" | "cert_changed",
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
        old_cert_id:
          event === "removed"
            ? oldCert
            : event === "cert_changed"
              ? oldCert
              : null,
        new_cert_id:
          event === "added"
            ? newCert
            : event === "cert_changed"
              ? newCert
              : null,
        matched_seat: false,
        occurred_at: "2026-08-25T09:18:30Z",
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
    for (const other of rows) {
      if (
        stamped < seatTarget &&
        !other.matched_seat &&
        `${other.ssp_domain}|${other.publisher_id}|${other.relationship}` === key
      ) {
        other.matched_seat = true;
        stamped += 1;
      }
    }
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
// Discovered lines
// ─────────────────────────────────────────────────────────────────

/*
 * Seed for the "Discovered lines" page, grouped by LINE rather than by
 * (publisher x line): a line is kept because its SSP domain is on the run's
 * discover_domains list, not because it matched an exact seat line.
 *
 * Modelled on the operator's real case: a crawl for carambola.com and
 * carambo.la with no seat lines at all. Most lines therefore carry one of
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
  { domain: "carambola.com", weight: 46 },
  { domain: "carambo.la", weight: 34 },
  { domain: "carambolamedia.com", weight: 12 },
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
  if (ssp === "carambo.la") return `${(n % 900_000) + 100_000}`;
  if (ssp === "carambolamedia.com") return `cm${(n % 90_000) + 10_000}`;
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
    ssp_domain: "carambola.com",
    publisher_id: "1042318",
    relationship: "RESELLER",
    cert_id: "4a7be0c1d9f23b58",
    placements_count: 431,
    previous_placements_count: 402, // up 29
  },
  {
    ssp_domain: "carambo.la",
    publisher_id: "618402",
    relationship: "RESELLER",
    cert_id: "",
    placements_count: 387,
    previous_placements_count: 391, // down 4
  },
  {
    ssp_domain: "carambola.com",
    publisher_id: "2884190",
    relationship: "DIRECT",
    cert_id: "b1f4c72e5a08d9c3",
    placements_count: 264,
    previous_placements_count: 264, // no change
  },
  {
    ssp_domain: "carambo.la",
    publisher_id: "774061",
    relationship: "RESELLER",
    cert_id: "9c02ea41b7d5f6a8",
    placements_count: 198,
    previous_placements_count: null, // new this week
  },
  {
    ssp_domain: "carambola.com",
    publisher_id: "3390514",
    relationship: "RESELLER",
    cert_id: "",
    placements_count: 176,
    previous_placements_count: 151, // up 25
  },
  {
    ssp_domain: "carambolamedia.com",
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
    rows.push({
      developer_domain: pub.developer_domain,
      developer_name: pub.developer_name,
      platform: pub.platform,
      // A web publisher can only be found in ads.txt; an app publisher is
      // usually in app-ads.txt and occasionally in both.
      found_in:
        pub.platform === "Web"
          ? "ads.txt"
          : rnd() < 0.8
            ? "app-ads.txt"
            : "ads.txt",
    });
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
  // Same ORDER BY the endpoint promises: widest first, then alphabetical.
  unique.sort(
    (a, b) =>
      b.placements_count - a.placements_count ||
      a.ssp_domain.localeCompare(b.ssp_domain) ||
      a.publisher_id.localeCompare(b.publisher_id),
  );
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
  "carambola.com": { lines: 4, placements: 62 },
  "carambo.la": { lines: 3, placements: 41 },
  "carambolamedia.com": { lines: 1, placements: 9 },
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
 * case-insensitive substring, so typing "caramb" keeps both carambola.com
 * and carambo.la, and "la" keeps carambo.la alone.
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
- **Plus 9 more**. Turn on the "My seats only" filter in Line changes to see the full list.

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
