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
};

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
        const sum = s.firstReport ? { ...withInactive, previous_job_id: null } : withInactive;
        return reply(200, s.trial ? { ...sum, trial: TRIAL_CAPS } : sum);
      }
      case "export-info":
        if (s.exportInfo === "none") return notFound();
        if (s.trial || s.exportInfo === "trial")
          return reply(200, { format: "none", line_export: false, trial: true });
        return reply(200, { format: "xlsx", line_export: true, excel_row_limit: 1_048_576 });
      case "developer-events": {
        const event = (q.get("event") ?? "added") as "added" | "removed" | "changed";
        const r = mockDeveloperEvents(event, page_, lines, matchType);
        r.rows = r.rows.map(eventRow).map((d) => (s.removalReasons ? withRemovalReasons(d) : d));
        return reply(200, s.trial ? { ...r, page: 1, ...cut(r.rows, TRIAL_CAPS.publishers, r.total) } : r);
      }
      case "line-events": {
        const filters: Record<string, unknown> = {};
        for (const [k, v] of q.entries()) if (k !== "lines") filters[k] = /^\d+$/.test(v) ? Number(v) : v;
        if (filters.developer_id !== undefined) {
          const rows = linesForDeveloper(Number(filters.developer_id)).map(lineEvent);
          return reply(200, { page: 1, page_size: rows.length || 1, total: rows.length, rows });
        }
        const r = mockLineEvents(filters as Parameters<typeof mockLineEvents>[0]);
        return reply(200, { ...r, rows: r.rows.map(lineEvent) });
      }
      case "matched-developers": {
        const r = mockMatchedDevelopers(page_, q.get("q") ?? "", lines, matchType);
        r.rows = r.rows
          .map((d) =>
            hostApp && d.domain === hostApp.owner_domain ? publisherWithHost(publisherRow(d)) : publisherRow(d),
          )
          .map((d) => (s.removalReasons ? withRemovalReasons(d) : d));
        return reply(200, s.trial ? { ...r, page: 1, ...cut(r.rows, TRIAL_CAPS.publishers, r.total) } : r);
      }
      case "matched-bundles": {
        const r = mockMatchedBundles(page_, q.get("q") ?? "");
        return reply(200, { ...r, rows: r.rows.map(bundleRow) });
      }
      case "matched-apps": {
        const r = mockMatchedApps(page_, q.get("q") ?? "", lines, matchType);
        r.rows = r.rows
          .map((a) => (hostApp && appKey(a) === appKey(hostApp) ? appAtHost(appRow(a)) : appRow(a)))
          .map((a) => (s.removalReasons ? withRemovalReasons(a) : a));
        return reply(200, s.trial ? { ...r, page: 1, ...cut(r.rows, TRIAL_CAPS.apps, r.total) } : r);
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
