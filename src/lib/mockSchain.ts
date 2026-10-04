/**
 * Mock adapter for the Schain export page (VITE_MOCK=true only).
 *
 * Mirrors what the server will answer, built on the same roster the rest of
 * the demo reads (mockSchainSource in mockData.ts), so a publisher in the
 * schain preview is a publisher the reader can also find under Matched
 * publishers, carrying the same seat lines.
 *
 * The four checks are the admin Schain Export's, in the same order
 * (bottomlines-crawl services/compliance.py):
 *
 *   1. the seat line is in the publisher's app-ads.txt;
 *   2. the same file has a DIRECT line at the SDK; its ID is sid1;
 *   3. the SDK's sellers.json lists that ID as PUBLISHER or BOTH, under the
 *      publisher's own domain;
 *   4. the publisher's file has the reseller line
 *      `<customer domain>, <sid2>, RESELLER`, sid2 being the SDK's Seller
 *      ID in the customer's sellers.json.
 *
 * Which publishers pass each check is decided by a hash of (publisher, SDK),
 * so the answer is stable across reloads and the funnel narrows the way a
 * real one does.
 *
 * THE FILE follows the hand-built Arcane Flow workbook David signed off
 * (arcaneflow-onetag-pubnative-2026-09-28.xlsx): Summary with the rule, then
 * Publishers, <Sdk> IDs (every DIRECT id checked, valid or not) and Apps (one
 * row per app, its valid ids in one cell). Bold headers, frozen top row, the
 * same column widths.
 */

import {
  ApiError,
  type SchainFunnel,
  type SchainOverview,
  type SchainPreview,
  type SchainRow,
  type SchainSdk,
  type SchainSdkRead,
  type SchainSeatCount,
  type SchainSelection,
} from "./api";
import { CUSTOMER_SEATS, MOCK_CUSTOMER_DOMAIN, mockSchainSource, seatKey } from "./mockData";
import type { XlsxSheet } from "./xlsx";

const RESELLER = MOCK_CUSTOMER_DOMAIN;
const CUSTOMER_NAME = "Made Up Media";
const LIMIT = 3;
const TRIAL_CAP = 3;

/** The SDKs in madeupmedia.com/sellers.json: every seller there whose
 *  domain publishes its own sellers.json. One holds two Seller IDs, so the
 *  reseller-line choice is exercised. */
const SDKS: SchainSdk[] = [
  { domain: "applovin.com", name: "AppLovin", seller_type: "INTERMEDIARY", seller_ids: ["30021"] },
  { domain: "unity.com", name: "Unity Ads", seller_type: "INTERMEDIARY", seller_ids: ["30022"] },
  { domain: "inmobi.com", name: "InMobi", seller_type: "INTERMEDIARY", seller_ids: ["30027"] },
  { domain: "mintegral.com", name: "Mintegral", seller_type: "INTERMEDIARY", seller_ids: ["30031"] },
  { domain: "pubnative.net", name: "Verve", seller_type: "BOTH", seller_ids: ["30044", "30045"] },
  { domain: "vungle.com", name: "Liftoff Monetize", seller_type: "INTERMEDIARY", seller_ids: ["30052"] },
  { domain: "chartboost.com", name: "Chartboost", seller_type: "INTERMEDIARY", seller_ids: ["30058"] },
  { domain: "digitalturbine.com", name: "Digital Turbine", seller_type: "INTERMEDIARY", seller_ids: ["30063"] },
];

/** The popular SDKs we track: the list a customer's sellers.json is read
 *  against. Lives on the server in production; here only its size shows. */
const SDK_CATALOG = [
  "applovin.com", "unity.com", "ironsource.com", "google.com", "inmobi.com", "mintegral.com",
  "pubnative.net", "vungle.com", "chartboost.com", "digitalturbine.com", "fyber.com", "bigo.sg",
  "bytedance.com", "moloco.com", "yandex.com", "my.com", "start.io", "adcolony.com", "tapjoy.com",
  "smaato.com", "amazon-adsystem.com", "facebook.com", "kidoz.net", "ogury.com", "admost.com",
  "appodeal.com", "yahoo.com", "mobilefuse.com", "inneractive.com", "bidmachine.io", "verve.com",
  "hyprmx.com", "adview.com", "maticoo.com", "liftoff.io", "kwai.com", "mobfox.com", "adtiming.com",
  "toponad.com", "yso.mobi", "pangleglobal.com", "loopme.com", "madvertise.com", "ad-generation.jp",
  "five-corp.com", "i-mobile.co.jp", "nend.net", "maio.jp", "zucks.co.jp", "line.me", "kakao.com",
  "cauly.net", "adfit.co.kr", "mobvista.com", "sigmob.com", "gdt.qq.com", "baidu.com", "huawei.com",
  "xiaomi.com", "vivo.com.cn",
] as const;

/** How each SSP's own sellers.json names the customer's seat: the
 *  annotation on the Summary's seat line. */
const SSP_NAMES: Record<string, string> = {
  "magnite.com": "Magnite",
  "openx.com": "OpenX",
  "pubmatic.com": "PubMatic",
  "sharethrough.com": "Sharethrough",
  "onetag.com": "OneTag",
};

/** Sellers.json certification ids, so a DIRECT line reads as written. */
const CERTS: Record<string, string> = {
  "applovin.com": "",
  "unity.com": "96cabb5fbdde37a7",
  "inmobi.com": "83e75a7ae333ca9d",
  "mintegral.com": "0aeed750c80d6423",
  "pubnative.net": "d641df8625486a7b",
  "vungle.com": "c107d686becd2d77",
  "chartboost.com": "",
  "digitalturbine.com": "",
};

/** Other companies a publisher's DIRECT id can turn out to belong to, so
 *  the IDs sheet shows an id that is listed but under someone else. */
const OTHER_OWNERS = [
  ["Anymind", "anymanager.io"],
  ["AdPushup", "adpushup.com"],
  ["Gamelight Media", "gamelightmedia.com"],
  ["Bidmatic", "bidmatic.io"],
  ["Mobfox", "mobfox.com"],
] as const;

/** "pubnative.net" -> "pubnative", the way the file's headers say it. */
const label = (domain: string) => domain.split(".")[0];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ── Deterministic draws ───────────────────────────────────────────── */

/** FNV-1a over a string, to a number in [0, 1). */
function h(...parts: (string | number)[]): number {
  let x = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i += 1) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 0x01000193);
  }
  return (x >>> 0) / 4_294_967_296;
}

/** An account id in the shape each SDK hands out. */
function idFor(sdk: string, dev: number, n: number): string {
  const r = h("sid1", sdk, dev, n);
  if (sdk === "applovin.com") {
    return (
      Math.floor(r * 0xffffffff).toString(16).padStart(8, "0") +
      Math.floor(h("sid1b", sdk, dev, n) * 0xffffffff).toString(16).padStart(8, "0")
    );
  }
  if (sdk === "unity.com") return String(1_000_000 + Math.floor(r * 8_999_999));
  if (sdk === "pubnative.net") return String(1_000_000 + Math.floor(r * 99_999));
  return String(100_000 + Math.floor(r * 899_999));
}

/* ── The roster, indexed once ──────────────────────────────────────── */

type Dev = {
  developer_id: number;
  name: string;
  domain: string;
  platform: string;
  seats: Set<string>;
};
type App = { store: string; bundle_id: string; app_name: string };

const NOUNS = [
  "Puzzles", "Arcade", "Solitaire", "Bingo", "Match", "Quest", "Racer", "Blocks", "Bubble", "Chef",
  "Farm", "City", "Empire", "Legends", "Saga", "Rush", "Dash", "Merge", "Craft", "Idle", "Tycoon",
  "Trivia", "Word", "Sudoku", "Mahjong", "Radio", "Weather", "News", "Recipes", "Tracker", "Music",
  "Scores", "Maps", "Kids", "Sports", "Crossword", "Cast", "Live", "Stories", "Replay",
];
const MOBILE = ["android", "ios"] as const;
const CTV = ["roku", "firetv", "samsung", "vizio"] as const;

/** A publisher's apps: a long tail, most with a handful, a few with
 *  hundreds, like a real app-ads.txt roster. Web publishers ship none. */
function appsFor(d: Dev): App[] {
  if (d.platform === "Web") return [];
  const r = h("apps", d.developer_id);
  const n =
    r < 0.4 ? 1 + Math.floor(h("n", d.developer_id) * 3)
    : r < 0.75 ? 4 + Math.floor(h("n", d.developer_id) * 17)
    : r < 0.95 ? 21 + Math.floor(h("n", d.developer_id) * 60)
    : 100 + Math.floor(h("n", d.developer_id) * 150);
  const ctv = ["Roku", "Samsung", "Vizio", "FireTV", "CTV"].includes(d.platform);
  const brand = d.name.split(/\s+/)[0];
  const slug = d.domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  return Array.from({ length: n }, (_, i) => {
    const stores = ctv ? CTV : MOBILE;
    const store = stores[Math.floor(h("store", d.developer_id, i) * stores.length)];
    const noun = NOUNS[Math.floor(h("noun", d.developer_id, i) * NOUNS.length)];
    const app_name = `${brand} ${noun}${i >= NOUNS.length ? ` ${Math.floor(i / NOUNS.length) + 1}` : ""}`;
    const bundle_id =
      store === "ios" ? String(1_100_000_000 + d.developer_id * 31 + i * 7)
      : store === "android" ? `com.${slug}.${noun.toLowerCase()}${i}`
      : store === "roku" ? String(400_000 + d.developer_id + i * 91)
      : `${store}-${slug}-${i + 1}`;
    return { store, bundle_id, app_name };
  });
}

let index: { devs: Dev[]; apps: Map<number, App[]> } | null = null;
function roster() {
  if (index) return index;
  const { developers } = mockSchainSource();
  const devs: Dev[] = developers.map((d) => ({
    developer_id: d.developer_id,
    name: d.name ?? d.domain ?? "",
    domain: d.domain ?? "",
    platform: d.platform ?? "Web",
    seats: new Set((d.matched_lines ?? []).map(seatKey)),
  }));
  const apps = new Map<number, App[]>();
  for (const d of devs) apps.set(d.developer_id, appsFor(d));
  index = { devs, apps };
  return index;
}

/** One DIRECT id at the SDK on a publisher's file, and what the SDK's
 *  sellers.json says about it. */
type CheckedId = {
  id: string;
  written: string;
  listed: boolean;
  type: string;
  name: string;
  domain: string;
  valid: boolean;
};

/** One publisher's standing with one SDK: every DIRECT id its file holds at
 *  the SDK (step 2), each checked against the SDK's file (step 3), and which
 *  of the SDK's reseller lines its file carries (step 4). */
type Standing = { ids: CheckedId[]; resellerIds: Set<string> };

const standings = new Map<string, Map<number, Standing>>();
function standingFor(sdk: SchainSdk): Map<number, Standing> {
  const hit = standings.get(sdk.domain);
  if (hit) return hit;
  const out = new Map<number, Standing>();
  for (const d of roster().devs) {
    if (h("direct", sdk.domain, d.developer_id) >= 0.3) continue;
    const r = h("count", sdk.domain, d.developer_id);
    const count = r < 0.55 ? 1 : r < 0.8 ? 2 : r < 0.93 ? 3 : 5;
    const cert = CERTS[sdk.domain];
    const ids: CheckedId[] = Array.from({ length: count }, (_, n) => {
      const id = idFor(sdk.domain, d.developer_id, n);
      const written = `${sdk.domain}, ${id}, DIRECT${cert ? `, ${cert}` : ""}`;
      // Most publishers' first id is their own; later ids are often an
      // agency's or a mediation partner's, listed under someone else.
      const own = h("own", sdk.domain, d.developer_id, n) < (n === 0 ? 0.8 : 0.35);
      const listed = own || h("listed", sdk.domain, d.developer_id, n) < 0.9;
      if (!listed) return { id, written, listed, type: "", name: "", domain: "", valid: false };
      if (own) {
        const type = h("type", sdk.domain, d.developer_id, n) < 0.08 ? "BOTH" : "PUBLISHER";
        return { id, written, listed, type, name: d.name.toUpperCase(), domain: d.domain, valid: true };
      }
      const [name, domain] = OTHER_OWNERS[Math.floor(h("other", sdk.domain, d.developer_id, n) * OTHER_OWNERS.length)];
      const type = h("otype", sdk.domain, d.developer_id, n) < 0.3 ? "INTERMEDIARY" : "PUBLISHER";
      return { id, written, listed, type, name, domain, valid: false };
    });
    const resellerIds = new Set(
      sdk.seller_ids.filter((sid2) => h("resell", sdk.domain, sid2, d.developer_id) < 0.4),
    );
    out.set(d.developer_id, { ids, resellerIds });
  }
  standings.set(sdk.domain, out);
  return out;
}

const sdkOf = (domain: string) => SDKS.find((s) => s.domain === domain);

/* ── The chain, for one selection ──────────────────────────────────── */

const CATEGORIES = ["Games", "Puzzle", "Casual", "News", "Entertainment", "Sports", "Lifestyle", "Music"];
function storeUrl(store: string, bundle: string): string {
  if (store === "ios") return `https://apps.apple.com/app/id${bundle}`;
  if (store === "android") return `https://play.google.com/store/apps/details?id=${bundle}`;
  if (store === "roku") return `https://channelstore.roku.com/details/${bundle}`;
  return "";
}

/** A publisher in the file: its checked ids and its apps. */
type InFile = { dev: Dev; ids: CheckedId[]; apps: App[] };
type Proved = { funnel: SchainFunnel; publishers: InFile[]; rows: SchainRow[] };

const proved = new Map<string, Proved>();
function prove(sel: SchainSelection): Proved {
  const key = `${sel.sdk}|${sel.seat}|${sel.sid2}`;
  const hit = proved.get(key);
  if (hit) return hit;
  const sdk = sdkOf(sel.sdk);
  const { devs, apps } = roster();
  const funnel: SchainFunnel = {
    seat_publishers: 0,
    with_sdk_direct: 0,
    owned_by_them: 0,
    reseller_authorised: 0,
  };
  const publishers: InFile[] = [];
  const standing = sdk ? standingFor(sdk) : new Map<number, Standing>();
  for (const d of devs) {
    if (!d.seats.has(sel.seat)) continue; // 1. the seat line is in the file
    funnel.seat_publishers += 1;
    const st = standing.get(d.developer_id);
    if (!st) continue; // 2. a DIRECT line at the SDK
    funnel.with_sdk_direct += 1;
    if (!st.ids.some((i) => i.valid)) continue; // 3. the SDK vouches for one
    funnel.owned_by_them += 1;
    if (!st.resellerIds.has(sel.sid2)) continue; // 4. the reseller line
    funnel.reseller_authorised += 1;
    const own = apps.get(d.developer_id) ?? [];
    // A publisher with no app has nothing to put in an app's schain, so
    // it stays out of the file, as on the admin export.
    if (own.length) publishers.push({ dev: d, ids: st.ids, apps: own });
  }
  publishers.sort((a, b) => a.dev.domain.localeCompare(b.dev.domain));
  const rows: SchainRow[] = [];
  for (const p of publishers) {
    const sid1 = p.ids.filter((i) => i.valid).map((i) => i.id).join(", ");
    const sorted = [...p.apps].sort((a, b) => a.app_name.toLowerCase().localeCompare(b.app_name.toLowerCase()));
    for (const app of sorted) {
      rows.push({
        publisher_domain: p.dev.domain,
        app_name: app.app_name,
        store: app.store,
        bundle_id: app.bundle_id,
        platform: app.store === "ios" || app.store === "android" ? "Mobile" : "CTV",
        category: CATEGORIES[Math.floor(h("cat", app.bundle_id) * CATEGORIES.length)],
        asi1: sel.sdk,
        sid1,
        asi2: RESELLER,
        sid2: sel.sid2,
        store_url: storeUrl(app.store, app.bundle_id),
      });
    }
  }
  const out = { funnel, publishers, rows };
  proved.set(key, out);
  return out;
}

function totalsOf(p: Proved) {
  return {
    publishers: p.publishers.length,
    apps: p.rows.length,
    valid_ids: p.publishers.reduce((n, x) => n + x.ids.filter((i) => i.valid).length, 0),
    ids_checked: p.publishers.reduce((n, x) => n + x.ids.length, 0),
  };
}

/* ── Downloads used, remembered for the tab ────────────────────────── */

const DOWNLOADS_KEY = "pf-mock-schain-downloads";
function downloaded(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DOWNLOADS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function remember(list: string[]) {
  try {
    sessionStorage.setItem(DOWNLOADS_KEY, JSON.stringify(list));
  } catch {
    /* no storage: the count resets on reload, which is fine for a mock */
  }
}

/* ── The endpoints ─────────────────────────────────────────────────── */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function mockSchainOverview(trial: boolean): SchainOverview {
  const now = new Date();
  return {
    customer_name: CUSTOMER_NAME,
    status: "ok",
    reseller_domain: RESELLER,
    sellers_json_url: `https://${RESELLER}/sellers.json`,
    sellers_json_read_at: new Date(now.getTime() - 3 * 3_600_000).toISOString(),
    crawled_at: new Date(now.getTime() - 5 * 3_600_000).toISOString(),
    sdks: SDKS,
    sdk_catalog_size: SDK_CATALOG.length,
    seat_lines: CUSTOMER_SEATS,
    downloads: {
      used: trial ? 0 : downloaded().length,
      limit: LIMIT,
      selections: trial ? [] : downloaded(),
    },
    trial: trial ? { cap: TRIAL_CAP } : null,
  };
}

/** Which read of each SDK's file the page last chose, for the file's
 *  "Checked" row: the server keeps the same per link. */
const lastRead = new Map<string, { at: string; live: boolean }>();

export async function mockSchainReadSdk(domain: string, refresh: boolean): Promise<SchainSdkRead> {
  const out = await readSdk(domain, refresh);
  if (out.ok) lastRead.set(domain, { at: out.read_at, live: out.source === "live" });
  return out;
}

async function readSdk(domain: string, refresh: boolean): Promise<SchainSdkRead> {
  const base = 2_000 + Math.floor(h("count", domain) * 38_000);
  if (!refresh) {
    // The copy saved with the report: no network, so no wait.
    await delay(120);
    return {
      ok: true,
      domain,
      url: `https://${domain}/sellers.json`,
      read_at: mockSchainOverview(false).sellers_json_read_at,
      sellers_count: base,
      source: "report",
    };
  }
  // A live read takes a moment; the page shows that it is happening.
  await delay(650);
  return {
    ok: true,
    domain,
    url: `https://${domain}/sellers.json`,
    read_at: new Date().toISOString(),
    sellers_count: base + Math.floor(h("drift", domain, Date.now() >> 16) * 40),
    source: "live",
  };
}

export async function mockSchainSeatCounts(domain: string): Promise<SchainSeatCount[]> {
  const sdk = sdkOf(domain);
  if (!sdk) return [];
  return CUSTOMER_SEATS.map((l) => {
    const seat = seatKey(l);
    // Best reseller line for the line: the count shown before one is picked.
    const best = sdk.seller_ids
      .map((sid2) => totalsOf(prove({ sdk: domain, seat, sid2 })))
      .sort((a, b) => b.apps - a.apps)[0];
    return { seat, publishers: best?.publishers ?? 0, apps: best?.apps ?? 0 };
  });
}

export function mockSchainPreview(
  sel: SchainSelection,
  opts: { page: number; page_size: number; q?: string },
  trial: boolean,
): SchainPreview {
  const proof = prove(sel);
  const { funnel, rows } = proof;
  const needle = (opts.q ?? "").trim().toLowerCase();
  const matched = needle
    ? rows.filter((r) =>
        [r.app_name, r.bundle_id, r.publisher_domain, r.sid1].some((v) =>
          v.toLowerCase().includes(needle),
        ),
      )
    : rows;
  if (trial) {
    return {
      funnel,
      totals: totalsOf(proof),
      page: 1,
      page_size: TRIAL_CAP,
      total: matched.length,
      rows: matched.slice(0, TRIAL_CAP),
      trial: { cap: TRIAL_CAP, shown: Math.min(TRIAL_CAP, matched.length), full_total: matched.length },
    };
  }
  const start = (opts.page - 1) * opts.page_size;
  return {
    funnel,
    totals: totalsOf(proof),
    page: opts.page,
    page_size: opts.page_size,
    total: matched.length,
    rows: matched.slice(start, start + opts.page_size),
    trial: null,
  };
}

/* ── The file, in the signed-off workbook's shape ──────────────────── */

function seatText(seat: string): string {
  const [ssp, pid, rel] = seat.split("|");
  return `${ssp}, ${pid}, ${rel}`;
}

function workbook(sel: SchainSelection, proof: Proved, crawledAt: string): XlsxSheet[] {
  const sdk = sdkOf(sel.sdk)!;
  const l = label(sel.sdk);
  const [ssp, pid] = sel.seat.split("|");
  const sspName = SSP_NAMES[ssp] ?? cap(label(ssp));
  const t = totalsOf(proof);
  const today = new Date().toISOString().slice(0, 10);
  const crawled = crawledAt.slice(0, 10);
  const seat = seatText(sel.seat);
  const reseller = `${RESELLER}, ${sel.sid2}, RESELLER`;
  const sdkRead = lastRead.get(sel.sdk);

  const summary: (string | number)[][] = [
    [`${CUSTOMER_NAME}, sell through ${sspName} via ${l}`, ""],
    ["", ""],
    [
      "Checked",
      `${today}, publisher files from the ${crawled} crawl, ${l}'s sellers.json ${
        sdkRead?.live ? "read live" : "read"
      } ${(sdkRead?.at ?? crawledAt).slice(0, 16).replace("T", " ")} UTC`,
    ],
    ["Seat line", `${seat} (${sspName} lists ${pid} as ${CUSTOMER_NAME}, ${RESELLER})`],
    ["Reseller line", `${reseller} (${CUSTOMER_NAME} lists ${sel.sid2} as ${sdk.name}, ${sel.sdk})`],
    ["", ""],
    ["Rule, all four must hold", ""],
    ["1", "The seat line is in the publisher's app-ads.txt"],
    ["2", `A ${sel.sdk} DIRECT line is in the publisher's app-ads.txt`],
    ["3", `That ID is in ${l}'s sellers.json as PUBLISHER or BOTH, under the publisher's domain`],
    ["4", "The reseller line is in the publisher's app-ads.txt"],
    ["", ""],
    ["Publishers", t.publishers],
    ["Apps", t.apps],
  ];

  const publishers: (string | number)[][] = [
    ["Publisher domain", "Apps", `Valid ${l} IDs`, "Seat line as written", "Reseller line as written", "File checked"],
    ...proof.publishers.map((p) => [
      p.dev.domain,
      p.apps.length,
      p.ids.filter((i) => i.valid).map((i) => i.id).join(", "),
      seat,
      reseller,
      `https://${p.dev.domain}/app-ads.txt`,
    ]),
  ];

  const ids: (string | number)[][] = [
    ["Publisher domain", `${cap(l)} ID`, "Line as written", `Listed at ${l}`, "Type", `Name at ${l}`, `Domain at ${l}`, "Valid"],
    ...proof.publishers.flatMap((p) =>
      p.ids.map((i) => [
        p.dev.domain,
        i.id,
        i.written,
        i.listed ? "yes" : "no",
        i.type,
        i.name,
        i.domain,
        i.valid ? "yes" : "no",
      ]),
    ),
  ];

  const apps: (string | number)[][] = [
    ["Publisher domain", "App", "Store", "Bundle / store ID", "Platform", "Category", "asi1", "sid1", "asi2", "sid2", "Store URL"],
    ...proof.rows.map((r) => [
      r.publisher_domain, r.app_name, r.store, r.bundle_id, r.platform, r.category,
      r.asi1, r.sid1, r.asi2, r.sid2, r.store_url,
    ]),
  ];

  return [
    { name: "Summary", title: true, widths: [30, 90], rows: summary },
    { name: "Publishers", header: true, widths: [28, 8, 40, 34, 38, 60], rows: publishers },
    { name: `${cap(l)} IDs`, header: true, widths: [28, 14, 44, 18, 14, 34, 30, 8], rows: ids },
    { name: "Apps", header: true, widths: [28, 40, 10, 44, 10, 20, 14, 30, 16, 12, 70], rows: apps },
  ];
}

function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function mockSchainExport(
  sel: SchainSelection,
  format: "xlsx" | "csv",
): Promise<{ used: number; limit: number }> {
  const params = new URLSearchParams(window.location.search);
  let trial = params.has("trial") && params.get("trial") !== "0";
  try {
    trial = sessionStorage.getItem("pf-mock-trial") === "1" || trial;
  } catch {
    /* URL decides */
  }
  if (trial) throw new ApiError(403, "Schain downloads are part of the full report.");
  const key = `${sel.sdk}|${sel.seat}|${sel.sid2}`;
  const used = downloaded();
  if (!used.includes(key)) {
    if (used.length >= LIMIT) {
      throw new ApiError(403, `All ${LIMIT} schain downloads on this link are used.`);
    }
    used.push(key);
    remember(used);
  }
  const proof = prove(sel);
  // Named like the signed-off file: customer, SSP, SDK, day.
  const base = `${label(RESELLER)}-${label(sel.seat.split("|")[0])}-${label(sel.sdk)}-${new Date()
    .toISOString()
    .slice(0, 10)}`;
  if (format === "csv") {
    const header = ["Publisher domain", "App", "Store", "Bundle / store ID", "Platform", "Category", "asi1", "sid1", "asi2", "sid2", "Store URL"];
    const lines = [
      header,
      ...proof.rows.map((r) => [
        r.publisher_domain, r.app_name, r.store, r.bundle_id, r.platform, r.category,
        r.asi1, r.sid1, r.asi2, r.sid2, r.store_url,
      ]),
    ].map((row) => row.map(csvCell).join(","));
    save(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
  } else {
    const { buildXlsxBlob } = await import("./xlsx");
    const crawledAt = mockSchainOverview(false).crawled_at;
    save(buildXlsxBlob(workbook(sel, proof, crawledAt)), `${base}.xlsx`);
  }
  return { used: used.length, limit: LIMIT };
}
