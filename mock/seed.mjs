// Deterministic mock crawl, for local design work only. Never bundled into a
// production build — the dev middleware in mock/plugin.mjs is the only reader.
//
// Shapes match src/lib/api.ts exactly, so the UI cannot tell this apart from
// the real bottomlines-crawler /v1/viewer/* responses.

// ---- deterministic RNG (mulberry32) so every reload shows the same crawl ----
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260829);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const SSPS = [
  "google.com", "appnexus.com", "rubiconproject.com", "pubmatic.com",
  "openx.com", "magnite.com", "indexexchange.com", "criteo.com",
  "smartadserver.com", "adform.com", "sovrn.com", "triplelift.com",
  "sharethrough.com", "unity3d.com", "applovin.com", "ironsrc.com",
  "vungle.com", "inmobi.com", "mintegral.com", "liftoff.io",
  "tremorhub.com", "spotx.tv", "freewheel.tv", "beachfront.com",
  "smaato.com", "yieldmo.com", "taboola.com", "outbrain.com",
];

// Fictional studios and publishers on purpose — a crawl report names names,
// and none of these should resolve to a real company.
const DEVELOPERS = [
  ["Northlark Studios", "northlark.io", "ios"],
  ["Pinegrove Interactive", "pinegroveinteractive.com", "android"],
  ["Harbour & Vane", "harbourvane.com", "web"],
  ["Tidewell Games", "tidewell.gg", "ios"],
  ["Cobalt Meridian", "cobaltmeridian.com", "roku"],
  ["Sablefield Media", "sablefield.com", "web"],
  ["Orrery Labs", "orrerylabs.app", "android"],
  ["Lumen Row", "lumenrow.tv", "samsung"],
  ["Fenwick Digital", "fenwickdigital.com", "web"],
  ["Quillmark Apps", "quillmark.app", "ios"],
  ["Ashgrove Networks", "ashgrove.net", "firetv"],
  ["Verity Peak", "veritypeak.com", "android"],
  ["Marlowe Bay", "marlowebay.com", "web"],
  ["Kestrel Ridge Media", "kestrelridge.tv", "vizio"],
  ["Bramble Software", "bramblesoft.io", "ios"],
  ["Hollowmere Press", "hollowmere.com", "web"],
  ["Saltbrook Studios", "saltbrook.games", "android"],
  ["Dunmoor Entertainment", "dunmoor.tv", "lg"],
  ["Amberline Apps", "amberline.app", "ios"],
  ["Perch & Fable", "perchfable.com", "web"],
  ["Grayvault Interactive", "grayvault.io", "android"],
  ["Tallowbridge Media", "tallowbridge.com", "roku"],
  ["Wrenfield Digital", "wrenfield.co", "web"],
  ["Solstice Hollow", "solsticehollow.gg", "ios"],
  ["Ironbell Studios", "ironbell.studio", "android"],
  ["Cardinal Meadow", "cardinalmeadow.tv", "tvos"],
  ["Vesper Lane Media", "vesperlane.com", "web"],
  ["Hartcliff Games", "hartcliff.games", "ios"],
  ["Nettleford Labs", "nettleford.dev", "android"],
  ["Bayard Broadcast", "bayardbroadcast.tv", "googletv"],
  ["Copperfen Apps", "copperfen.app", "ios"],
  ["Almsworth Media", "almsworth.com", "web"],
  ["Riverstock Interactive", "riverstock.io", "android"],
  ["Glenhaven TV", "glenhaven.tv", "samsung"],
  ["Thistledown Studios", "thistledown.games", "ios"],
  ["Warrenby Digital", "warrenby.com", "web"],
  ["Oakbourne Networks", "oakbourne.net", "firetv"],
  ["Selwyn Park Media", "selwynpark.com", "web"],
  ["Fairhollow Apps", "fairhollow.app", "android"],
  ["Merrowgate Studios", "merrowgate.io", "ios"],
  ["Pellham Interactive", "pellham.gg", "android"],
  ["Windrose Media", "windrosemedia.tv", "roku"],
  ["Calderbrook Labs", "calderbrook.dev", "web"],
  ["Everly Sound", "everlysound.app", "ios"],
  ["Tarnhill Games", "tarnhill.games", "android"],
  ["Bellweather Digital", "bellweather.co", "web"],
  ["Stonepath Studios", "stonepath.studio", "ios"],
  ["Highmarsh Media", "highmarsh.tv", "vizio"],
];

const REL = ["DIRECT", "RESELLER"];

function certId() {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 16; i++) s += hex[Math.floor(rand() * 16)];
  return s;
}
function pubId() {
  return `pub-${between(100000, 999999)}`;
}

const FINISHED = new Date("2026-08-28T04:41:19Z");
const STARTED = new Date(FINISHED.getTime() - 12 * 60 * 1000); // 12 min crawl
const QUEUED = new Date(STARTED.getTime() - 47 * 1000);

function occurredAt(i) {
  return new Date(STARTED.getTime() + (i * 977) % (11 * 60 * 1000)).toISOString();
}

// ---- build developers with a per-developer change profile -------------------
// Buckets: a few brand-new developers, a few that dropped off, a long tail of
// developers whose line counts moved.
const developers = DEVELOPERS.map(([name, domain, platform], i) => {
  const bucket = i < 6 ? "added" : i < 11 ? "removed" : "changed";
  const prev = bucket === "added" ? 0 : between(4, 180);
  let added = 0;
  let removed = 0;
  let certChanged = 0;
  if (bucket === "added") {
    added = between(3, 64);
  } else if (bucket === "removed") {
    removed = prev;
  } else {
    added = rand() < 0.75 ? between(0, 22) : 0;
    removed = rand() < 0.7 ? between(0, 18) : 0;
    certChanged = rand() < 0.45 ? between(1, 9) : 0;
    if (added === 0 && removed === 0 && certChanged === 0) added = between(1, 6);
  }
  const current = bucket === "removed" ? 0 : prev + added - removed;
  const sspCount = between(2, 6);
  const ssps = [];
  const used = new Set();
  while (ssps.length < sspCount) {
    const d = pick(SSPS);
    if (used.has(d)) continue;
    used.add(d);
    ssps.push({ ssp_domain: d, count: between(1, 40) });
  }
  ssps.sort((a, b) => b.count - a.count);
  return {
    developer_id: 4100 + i,
    developer_name: name,
    developer_domain: domain,
    developer_platform: platform,
    matched_lines_prev: prev,
    matched_lines_current: Math.max(0, current),
    lines_added: added,
    lines_removed: removed,
    lines_cert_changed: certChanged,
    top_ssps: ssps,
    occurred_at: occurredAt(i),
    _bucket: bucket,
  };
});

// ---- line-level events, consistent with the developer counts ---------------
const lineEvents = [];
let n = 0;
for (const d of developers) {
  const emit = (event, howMany) => {
    for (let k = 0; k < howMany; k++) {
      const old = event === "cert_changed" ? certId() : null;
      lineEvents.push({
        developer_id: d.developer_id,
        developer_name: d.developer_name,
        developer_domain: d.developer_domain,
        file_kind: d.developer_platform === "web" ? "ads.txt" : "app-ads.txt",
        ssp_domain: pick(d.top_ssps).ssp_domain,
        publisher_id: pubId(),
        relationship: rand() < 0.62 ? REL[0] : REL[1],
        event,
        old_cert_id: old,
        new_cert_id: event === "removed" ? null : certId(),
        matched_seat: rand() < 0.68,
        occurred_at: occurredAt(n++),
      });
    }
  };
  // Cap per developer so the fixture stays a few thousand rows, not tens of
  // thousands — the UI paginates at 50 anyway.
  emit("added", Math.min(d.lines_added, 40));
  emit("removed", Math.min(d.lines_removed, 40));
  emit("cert_changed", Math.min(d.lines_cert_changed, 40));
}

// ---- matched app bundles, one per store the developer ships on -------------
const STORE_BY_PLATFORM = {
  ios: "ios",
  android: "android",
  roku: "roku",
  samsung: "samsung",
  lg: "lg",
  vizio: "vizio",
  firetv: "firetv",
  tvos: "tvos",
  googletv: "googletv",
};
const APP_NOUNS = [
  "Puzzle", "Solitaire", "Runner", "Weather", "Recipes", "Tycoon",
  "Merge", "Blocks", "Racing", "Sudoku", "Bingo", "Words", "Farm",
  "Idle", "Escape", "Live TV", "News", "Radio", "Fishing", "Bubble",
];
const APP_QUALIFIERS = ["", " HD", " 2", " Deluxe", " Free", " Plus", " Classic"];

function bundleId(store, i) {
  if (store === "ios" || store === "tvos") return String(between(300000000, 999999999));
  if (store === "roku") return String(between(100000, 900000));
  return `com.${["studio", "games", "apps", "media"][i % 4]}.${
    ["northlark", "pinegrove", "tidewell", "orrery", "quillmark", "bramble"][i % 6]
  }${i}`;
}

const bundles = [];
let bi = 0;
for (const d of developers) {
  if (d.developer_platform === "web") continue;      // web publishers have no bundles
  if (d.matched_lines_current === 0) continue;       // dropped developers show nothing
  const store = STORE_BY_PLATFORM[d.developer_platform] ?? "android";
  const howMany = between(1, 5);
  let left = d.matched_lines_current;
  for (let k = 0; k < howMany; k++) {
    const share = k === howMany - 1 ? left : Math.max(1, Math.floor(left / (howMany - k)));
    left -= share;
    bundles.push({
      store,
      bundle_id: bundleId(store, bi),
      app_name: `${pick(APP_NOUNS)}${pick(APP_QUALIFIERS)}`,
      developer_id: d.developer_id,
      developer_name: d.developer_name,
      developer_domain: d.developer_domain,
      line_count: Math.max(1, share),
    });
    bi += 1;
    if (left <= 0) break;
  }
}

export const matchedBundles = bundles.sort((a, b) => b.line_count - a.line_count);

// ---- roll the summary up out of the rows, never hand-typed -----------------
function totals(rows, key) {
  return rows.reduce((acc, r) => acc + r[key], 0);
}
function topSsps(rows, event, matchedOnly = false) {
  const counts = new Map();
  for (const r of rows) {
    if (r.event !== event) continue;
    if (matchedOnly && !r.matched_seat) continue;
    counts.set(r.ssp_domain, (counts.get(r.ssp_domain) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([ssp_domain, count]) => ({ ssp_domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}
const countEvent = (event, matchedOnly = false) =>
  lineEvents.filter(
    (r) => r.event === event && (!matchedOnly || r.matched_seat),
  ).length;

const developerCount = 1_048_552;
const matchedLines = totals(developers, "matched_lines_current");

export const summary = {
  crawl_id: 471,
  source: "weekly",
  status: "completed",
  queued_at: QUEUED.toISOString(),
  started_at: STARTED.toISOString(),
  finished_at: FINISHED.toISOString(),
  previous_job_id: 464,
  counters: {
    developer_count: developerCount,
    fetched_count: 1_009_318,
    error_count: 6_204,
    not_found_count: 27_741,
    unreadable_count: 5_289,
    developers_with_lines: 612_884,
    matched: {
      lines: matchedLines,
      developers: developers.filter((d) => d.matched_lines_current > 0).length,
      apps: bundles.length,
    },
  },
  hero_diff: {
    line_totals: {
      added: countEvent("added"),
      removed: countEvent("removed"),
      cert_changed: countEvent("cert_changed"),
    },
    line_totals_matched_seat: {
      added: countEvent("added", true),
      removed: countEvent("removed", true),
      cert_changed: countEvent("cert_changed", true),
    },
    developer_totals: {
      added: developers.filter((d) => d._bucket === "added").length,
      removed: developers.filter((d) => d._bucket === "removed").length,
      changed: developers.filter((d) => d._bucket === "changed").length,
    },
    top_ssps: {
      added: topSsps(lineEvents, "added"),
      removed: topSsps(lineEvents, "removed"),
      cert_changed: topSsps(lineEvents, "cert_changed"),
    },
  },
};

export const developerEvents = {
  added: developers.filter((d) => d._bucket === "added"),
  removed: developers.filter((d) => d._bucket === "removed"),
  changed: developers
    .filter((d) => d._bucket === "changed")
    .sort(
      (a, b) =>
        b.lines_added + b.lines_removed + b.lines_cert_changed -
        (a.lines_added + a.lines_removed + a.lines_cert_changed),
    ),
};

export const allLineEvents = lineEvents;

export const matchedDevelopers = developers
  .filter((d) => d.matched_lines_current > 0)
  .map((d) => ({
    developer_id: d.developer_id,
    name: d.developer_name,
    domain: d.developer_domain,
    platform: d.developer_platform,
    line_count: d.matched_lines_current,
  }))
  .sort((a, b) => b.line_count - a.line_count);

export const sspList = SSPS;
