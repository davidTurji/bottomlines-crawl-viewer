const BASE = (import.meta.env.VITE_API_BASE as string) ?? "/api";

// ── Mock mode ─────────────────────────────────────────────────────
// Turned on with ``VITE_MOCK=true`` at ``vite dev`` start. Every
// function head short-circuits to a deterministic mock, no backend
// required, useful for UI-only reviews and screenshots.
// The mock adapter lives in src/lib/mockData.ts.
import { LINES_PARAM, linesQuery, serializeLines } from "./lineFilter";
import { PAGE_SIZE } from "./paging";
import { pageFromGone } from "./inactive";

export const MOCK = (import.meta.env.VITE_MOCK as string | undefined) === "true";

/** In MOCK mode, ``?trial=1`` renders the report as a trial (lead magnet):
 *  the lists cut to the caps below, no download, the banner and the locked
 *  tails on. The same convention as ``?bigapps=1`` and ``?legacy=1``. */
//  In MOCK mode the switch is remembered for the tab (sessionStorage) once
//  ``?trial=1`` has been seen, because the sidebar links drop the query and
//  a demo that forgot it mid-navigation looked like a report that could be
//  bypassed. ``?trial=0`` turns it off again. Production never reads the
//  URL for this: the flag is in the link's record and every request is cut
//  on the server.
const TRIAL_MOCK_KEY = "pf-mock-trial";
const trialMock = () => {
  if (!MOCK) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has("trial")) {
    try {
      sessionStorage.setItem(TRIAL_MOCK_KEY, params.get("trial") === "0" ? "0" : "1");
    } catch {
      /* no storage: the URL alone decides */
    }
  }
  try {
    const kept = sessionStorage.getItem(TRIAL_MOCK_KEY);
    if (kept !== null) return kept === "1";
  } catch {
    /* fall through */
  }
  return params.has("trial") && params.get("trial") !== "0";
};
const TRIAL_CAPS_MOCK = { publishers: 3, apps: 3, declarations: 3, discovered_lines: 3, inactive: 3 };
function cutRows<T>(rows: T[], cap: number, total: number) {
  const shown = Math.min(cap, rows.length, total);
  return { rows: rows.slice(0, cap), trial: { cap, shown, full_total: total } };
}

/** In MOCK mode, ``?inactive=legacy`` is a link frozen before the Inactive
 *  section (only its No longer live block) and ``?inactive=none`` one with
 *  neither. Read per call, like ``?bigapps=1``. */
const mockInactiveMode = (): "full" | "legacy" | "none" => {
  const v = new URLSearchParams(window.location.search).get("inactive");
  return v === "legacy" || v === "none" ? v : "full";
};
function mockInactiveVariant(s: Summary): Summary {
  const mode = mockInactiveMode();
  if (mode === "full") return s;
  const { inactive_counts: _drop, ...rest } = s;
  return mode === "legacy" ? rest : { ...rest, gone: undefined };
}

// ── AI chat flag ─────────────────────────────────────────────────
// The MVP backend ships no chat endpoint, so the Ask AI surface is
// hidden unless explicitly enabled (VITE_ENABLE_CHAT=true), e.g. for
// mock-mode demos. Default off.
export const ENABLE_CHAT =
  (import.meta.env.VITE_ENABLE_CHAT as string | undefined) === "true";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ── 401 fan-out ──────────────────────────────────────────────────
// The LoginGate registers one handler here; any data request that
// comes back 401 trips it, which swaps the app for the sign-in card.
// A callback registry rather than a thrown-error convention because
// pages already catch ApiError for their own error states, and the
// gate must fire regardless of what a page does with the error.
let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

// ── Dead links: decided by the summary's 403, never by a 404 ─────
// How the API answers a link that expired, was revoked, or has no
// published report (viewer_v2.require_viewer_session):
//   - no session cookie for this token: 401 on every data route; the
//     reader drops back to sign-in, and sign-in answers 403, which
//     LoginCard turns into the expired-link card;
//   - still signed in (cookies last 24h): 403 on every data route.
// Every page reads the summary, so the summary's own 403 is what shows
// the expired-link card (see `summary` below). Only there: other routes
// answer 403 for reasons that are not a dead link (schain downloads on a
// trial), and that must stay the page's own error.
//
// A 404 NEVER means a dead link. It is only ever "this optional part is
// not in this report" (sellers-fix) or "this API is older than this SPA"
// (a route not deployed yet). Reading those as a dead link took every
// report down twice: /export-info on 2026-09-29 and /sellers-fix on
// 2026-10-06. e2e/report.spec.ts locks both rules.
let linkRefusedHandler: (() => void) | null = null;
export function onLinkRefused(handler: (() => void) | null) {
  linkRefusedHandler = handler;
}

// ── Held until signed in (demo of #75, 2026-10-27) ─────────────────
// Before the email link's sign-in landed, the page fired ~23 data
// requests that all came back 401. While the sign-in form is up (the
// link's own, or after a 401), every data request waits here and goes
// once the session exists; the sign-in and resolve calls never wait.
let held: { until: Promise<void>; release: () => void } | null = null;

/** Hold every data request until `releaseDataRequests` (sign-in). */
export function holdDataRequests(): void {
  if (held) return;
  let release!: () => void;
  const until = new Promise<void>((r) => (release = r));
  held = { until, release };
}

/** The session exists: every held request goes. */
export function releaseDataRequests(): void {
  const h = held;
  held = null;
  h?.release();
}

/** Waits while data requests are held (a no-op otherwise). */
async function whenSignedIn(): Promise<void> {
  while (held) await held.until;
}

// ── Auth epoch ───────────────────────────────────────────────────
// Guards against a stale-401 re-lock race: a data request fired
// before sign-in can come back 401 *after* the login succeeded, and
// must not throw the freshly signed-in user back to the gate. Each
// request captures the epoch at call start; a successful auth bumps
// it, so any 401 from a pre-login in-flight request sees a mismatched
// epoch and stays silent (the page still gets its ApiError).
let authEpoch = 0;

/** Bumped by every successful sign-in. A cache of answers given to a
 *  reader keys on it, so a "no" told before sign-in never outlives it. */
export function currentAuthEpoch(): number {
  return authEpoch;
}

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  // Path without its query string, so the two exemptions below compare
  // whole endpoints. A prefix test would misfire on a share token that
  // happens to start with "resolve" (/v1/viewer/resolveXYZ/summary) and
  // silently switch the sign-in gate off for that reader.
  const endpoint = path.split("?")[0];
  // A data request waits for the sign-in; the sign-in and the resolve,
  // which run before any session exists, never do.
  if (!endpoint.endsWith("/viewer/auth") && endpoint !== "/v1/viewer/resolve") await whenSignedIn();
  const epochAtStart = authEpoch;
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) {
    // The auth endpoint's own 401 means "wrong credentials", not
    // "session expired": it must not re-trip the gate, only surface
    // as the form's error state.
    // Likewise the resolve endpoint: it runs *before* any session
    // exists (it is what turns a readable URL into a token), so its
    // failures are "no such report", never "session expired".
    if (
      res.status === 401 &&
      !endpoint.endsWith("/viewer/auth") &&
      endpoint !== "/v1/viewer/resolve" &&
      epochAtStart === authEpoch
    ) {
      unauthorizedHandler?.();
    }
    const detail = await res.text().catch(() => "");
    throw new ApiError(res.status, detail || `${method} ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  /**
   * Turn a readable report URL — /{customer-slug}/{crawl-short-id}, e.g.
   * /selectmedia/0904-0644 — into the share token every other endpoint is
   * keyed by. Public by design: it hands out a token, it does not read
   * report data, so the password gate still stands behind it.
   *
   * In MOCK mode any slug resolves to the demo token, so the readable
   * routes are exercisable with VITE_MOCK=true and no backend.
   *
   * Takes a signal because this call sits in front of the whole app: a
   * backend that accepts the connection and then never answers would
   * otherwise leave the reader on a spinner forever, so the caller
   * arms an abort timeout (see ReportScopeRoutes.tsx).
   */
  resolve: async (slug: string, shortId: string, signal?: AbortSignal) => {
    if (MOCK) return { token: "demo-token" };
    const q = new URLSearchParams({ slug, short_id: shortId });
    return req<{ token: string }>(
      "GET",
      `/v1/viewer/resolve?${q.toString()}`,
      undefined,
      signal,
    );
  },
  /**
   * Username + password sign-in for a share token. The API answers with
   * an httpOnly session cookie (hence credentials:"include" in req());
   * the JSON body only confirms who signed in.
   */
  auth: async (token: string, username: string, password: string) => {
    if (MOCK)
      return { ok: true, email: "you@publisherstudios.com", customer_id: 42 };
    const out = await req<{ ok: boolean; email: string; customer_id: number }>(
      "POST",
      `/v1/viewer/auth`,
      { token, username, password },
    );
    // New session established: invalidate the 401 fan-out for every
    // request that was already in flight before this sign-in.
    authEpoch++;
    return out;
  },
  /**
   * What "Export results" hands over, so the page can say it in words:
   * the report's Excel, or, when its Matched apps list has more rows than
   * Excel allows, a zip of the Excel plus that list as a CSV (2026-09-28).
   * Also whether a download of only the selected lines exists. Never
   * throws: an answer that cannot be read is the safe default (the full
   * report, as an Excel, no per-line download).
   *
   * In MOCK mode `?bigapps=1` answers with the zip case, for review.
   */
  exportInfo: async (token: string): Promise<ExportInfo> => {
    if (MOCK) {
      if (trialMock())
        return { format: "none", line_export: false, trial: true };
      const big = new URLSearchParams(window.location.search).has("bigapps");
      return big
        ? {
            format: "zip",
            line_export: true,
            excel_row_limit: 1_048_576,
            apps_rows: 3_682_524,
          }
        : { format: "xlsx", line_export: true, excel_row_limit: 1_048_576 };
    }
    const fallback: ExportInfo = { format: "xlsx", line_export: false };
    // A plain fetch, never req(): an API from before this endpoint answers
    // 404, and whatever goes wrong here falls back to the defaults. Nothing
    // here may touch the sign-in gate; the summary's own calls do that.
    try {
      await whenSignedIn();
      const res = await fetch(`${BASE}/v1/viewer/${token}/export-info`, {
        credentials: "include",
      });
      if (!res.ok) return fallback;
      const info = (await res.json()) as Partial<ExportInfo> | null;
      if (
        !info ||
        !["xlsx", "zip", "none"].includes(info.format as string) ||
        typeof info.line_export !== "boolean"
      ) {
        return fallback;
      }
      return info as ExportInfo;
    } catch {
      return fallback;
    }
  },
  /**
   * Same-origin URL of the CUSTOMER workbook for this run: the xlsx the
   * crawler bakes per crawl, the same file the Overview's "Export results"
   * button hands the reader. A plain link target, not a fetch, so the
   * download is an ordinary navigation the browser saves, and the httpOnly
   * session cookie rides along because BASE is same-origin ("/api").
   *
   * MOCK mode has no backend, so the button short-circuits to a small stub
   * rather than pointing at this (see CrawlReport's ExportResultsButton).
   */
  exportUrl: (token: string, lines: string[] = []) =>
    `${BASE}/v1/viewer/${token}/export.xlsx${
      lines.length ? `?${LINES_PARAM}=${serializeLines(lines)}` : ""
    }`,
  summary: async (token: string, lines?: string[]) => {
    if (MOCK) {
      const { mockSummaryFor } = await import("./mockData");
      const s = mockInactiveVariant(mockSummaryFor(lines ?? []));
      return trialMock() ? { ...s, trial: TRIAL_CAPS_MOCK } : s;
    }
    const q = linesQuery(lines);
    try {
      return await req<Summary>(
        "GET",
        `/v1/viewer/${token}/summary${q ? `?${q.slice(1)}` : ""}`,
      );
    } catch (e) {
      // A signed-in reader whose link expired or was revoked: the API
      // refuses the link itself with 403 (see "Dead links" above).
      if (e instanceof ApiError && e.status === 403) linkRefusedHandler?.();
      throw e;
    }
  },
  /**
   * The previous week's summary for the same customer, which is what every
   * "vs last week" delta on every page is measured against.
   *
   * Two calls, because the previous crawl's id is a fact only the current
   * summary knows: read this token's summary, then re-read the same
   * endpoint with `?crawl_id=` set to its `previous_job_id`. The endpoint
   * scopes that id to the token's own customer chain and 404s otherwise,
   * so passing it back is not a way to read someone else's crawl.
   *
   * Answers `null`, never throws, for the three ordinary ways there is no
   * previous week: this is the customer's first crawl
   * (`previous_job_id` is null), the prior job has been erased (404), or
   * the summary call itself failed. Every caller renders "no prior week to
   * compare" for a null, which is the honest reading of all three.
   */
  previousSummary: async (token: string): Promise<Summary | null> => {
    if (MOCK) {
      const { mockPreviousSummary, mockSummary } = await import("./mockData");
      // Mirror the real guard below. Returning a previous summary
      // unconditionally made the mock incapable of showing a FIRST crawl,
      // which is the one state where every delta on the page is a lie —
      // so it was the one state nobody could see while developing.
      if (mockSummary.previous_job_id == null) return null;
      return mockPreviousSummary;
    }
    try {
      const current = await req<Summary>("GET", `/v1/viewer/${token}/summary`);
      if (current.previous_job_id == null) return null;
      return await req<Summary>(
        "GET",
        `/v1/viewer/${token}/summary?crawl_id=${current.previous_job_id}`,
      );
    } catch {
      return null;
    }
  },
  developerEvents: async (
    token: string,
    event: "added" | "removed" | "changed" | "unconfirmed",
    page = 1,
    q = "",
    lines?: string[],
    matchType: MatchTypeFilter = "all",
    /** Rows per page; the lists ask for PAGE_SIZE, an export for more. */
    pageSize: number = PAGE_SIZE,
    /** The Found in switch (an API without it ignores it). */
    foundIn: FoundInFilter = "all",
  ) => {
    if (MOCK) {
      const { mockDeveloperEvents } = await import("./mockData");
      const r = mockDeveloperEvents(event, page, lines ?? [], mockMatchType(matchType));
      return trialMock()
        ? {
            ...r,
            page: 1,
            ...cutRows(r.rows, TRIAL_CAPS_MOCK.publishers, r.total),
          }
        : r;
    }
    return req<DeveloperEventsPage>(
      "GET",
      `/v1/viewer/${token}/developer-events?event=${event}&page=${page}&page_size=${pageSize}${q ? `&q=${encodeURIComponent(q)}` : ""}${linesQuery(lines)}${matchTypeQuery(matchType)}${foundIn !== "all" ? `&found_in=${foundIn}` : ""}`,
    );
  },
  changeGroups: async (
    token: string,
    filters: ChangeFilters = {},
    signal?: AbortSignal,
  ): Promise<ChangeGroupsPage> => {
    if (MOCK) {
      const { mockLineEvents } = await import("./mockData");
      const { pageChangeGroups } = await import("./changeGroups");
      const raw = mockLineEvents({
        ...filters,
        event: undefined,
        page: 1,
        page_size: 1_000_000,
      });
      const rows = trialMock() ? raw.rows.slice(0, 12) : raw.rows;
      return pageChangeGroups(
        rows,
        filters,
        trialMock()
          ? { cap: 12, shown: rows.length, full_total: raw.total }
          : null,
      );
    }
    return req<ChangeGroupsPage>(
      "GET",
      `/v1/viewer/${token}/change-groups?${changeQuery(filters)}`,
      undefined,
      signal,
    );
  },
  changePublishers: async (
    token: string,
    key: string,
    filters: ChangeFilters = {},
    signal?: AbortSignal,
  ): Promise<LineEventsPage> => {
    if (MOCK) {
      const { mockLineEvents } = await import("./mockData");
      const { groupByLine } = await import("./changeGroups");
      const raw = mockLineEvents({
        ...filters,
        event: undefined,
        page: 1,
        page_size: 1_000_000,
      });
      const rows =
        groupByLine(trialMock() ? raw.rows.slice(0, 12) : raw.rows).find(
          (g) => g.key === key,
        )?.publishers ?? [];
      const page = filters.page ?? 1,
        size = filters.page_size ?? 50;
      return {
        page,
        page_size: size,
        total: rows.length,
        rows: rows.slice((page - 1) * size, page * size),
      };
    }
    return req<LineEventsPage>(
      "GET",
      `/v1/viewer/${token}/change-groups/${encodeURIComponent(key)}/publishers?${changeQuery(filters)}`,
      undefined,
      signal,
    );
  },
  lineEvents: async (
    token: string,
    filters: {
      event?: LineEventKind;
      ssp_domain?: string;
      developer_id?: number;
      matched_seat_only?: boolean;
      page?: number;
      page_size?: number;
      /** Seat-line keys (see lib/lineFilter); empty means every line. */
      lines?: string[];
      /** All / own / IPD (crawler #348); "all" is never sent. */
      match_type?: MatchTypeFilter;
    } = {},
  ) => {
    if (MOCK) {
      const { mockLineEvents } = await import("./mockData");
      const r = mockLineEvents(filters);
      // The server keeps the events of the visible publishers only; the
      // mock keeps a dozen and says how many there are in full.
      return trialMock() ? { ...r, ...cutRows(r.rows, 12, r.total) } : r;
    }
    const { lines, match_type, ...rest } = filters;
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    }
    if (match_type && match_type !== "all") q.set("match_type", match_type);
    if (lines && lines.length) q.set(LINES_PARAM, serializeLines(lines));
    return req<LineEventsPage>(
      "GET",
      `/v1/viewer/${token}/line-events?${q.toString()}`,
    );
  },
  /**
   * `q` is a case-insensitive substring filter, applied SERVER-SIDE against
   * the frozen snapshot.
   *
   * Server-side because Boldwin matches 57,582 apps and 18,665 publishers.
   * Shipping all of those to a phone so it could filter locally would undo
   * the pooling that made the full list affordable in the first place. It
   * still opens no database connection: the snapshot is a file, and
   * filtering it is a list comprehension over what is already in memory.
   *
   * `total` on the response is the FILTERED total, so the pager below the
   * list counts what the search found rather than what the section holds.
   */
  matchedDevelopers: async (
    token: string,
    page = 1,
    q = "",
    lines?: string[],
    matchType: MatchTypeFilter = "all",
    pageSize: number = PAGE_SIZE,
    /** A watch tab's filter (crawler #361); an API without it ignores it
     *  and echoes nothing, and the tab is then not offered. */
    change?: WatchChange,
    /** The Found in switch (an API without it ignores it). */
    foundIn: FoundInFilter = "all",
  ) => {
    if (MOCK) {
      const { mockMatchedDevelopers } = await import("./mockData");
      const r = mockMatchedDevelopers(page, q, lines ?? [], mockMatchType(matchType));
      return trialMock()
        ? {
            ...r,
            page: 1,
            ...cutRows(r.rows, TRIAL_CAPS_MOCK.publishers, r.total),
          }
        : r;
    }
    return req<MatchedDevelopersPage>(
      "GET",
      `/v1/viewer/${token}/matched-developers?page=${page}&page_size=${pageSize}${q ? `&q=${encodeURIComponent(q)}` : ""}${linesQuery(lines)}${matchTypeQuery(matchType)}${change ? `&change=${change}` : ""}${foundIn !== "all" ? `&found_in=${foundIn}` : ""}`,
    );
  },
  matchedBundles: async (token: string, page = 1, q = "") => {
    if (MOCK) {
      const { mockMatchedBundles } = await import("./mockData");
      return mockMatchedBundles(page, q);
    }
    return req<MatchedBundlesPage>(
      "GET",
      `/v1/viewer/${token}/matched-bundles?page=${page}&page_size=250${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    );
  },
  /**
   * Matched apps: apps whose app-ads.txt carried the customer's seats, each
   * with the PUBLISHER that owns it. Powers the "Matched apps" list the
   * overview shows when its pink apps card is selected.
   *
   * PROPOSED ENDPOINT (mirror server side):
   *   GET /v1/viewer/{token}/matched-apps?page=1&page_size=100
   *   200 → { page, page_size, total, rows: MatchedApp[] }
   *
   * This is deliberately distinct from matched-bundles: that list is keyed by
   * the developer identity for the Results drilldown, while this one's unit is
   * the APP and it carries the app's owner and its matched seat lines. Could
   * instead be embedded under matched-developers; a standalone endpoint is
   * cleaner because the app is the row here, not the publisher.
   *
   * `change` (the Added / Removed / Changed tabs) asks the server to filter
   * the WHOLE list before paging: apps with lines_added, lines_removed or
   * lines_cert_changed above 0, combined with `q`, `lines` and
   * `match_type`, and `total` is the filtered count. A crawler that knows
   * the filter echoes it as `change` on the response; an older one ignores
   * the parameter and answers the unfiltered list (see MatchedAppsPage).
   */
  matchedApps: async (
    token: string,
    page = 1,
    q = "",
    lines?: string[],
    matchType: MatchTypeFilter = "all",
    change?: AppChange,
    pageSize: number = PAGE_SIZE,
    /** The Platform switch (an API without it ignores it). */
    platform: PlatformFilter = "all",
  ) => {
    if (MOCK) {
      const { mockMatchedApps } = await import("./mockData");
      const r = mockMatchedApps(page, q, lines ?? [], mockMatchType(matchType), change ?? null);
      return trialMock()
        ? { ...r, page: 1, ...cutRows(r.rows, TRIAL_CAPS_MOCK.apps, r.total) }
        : r;
    }
    return req<MatchedAppsPage>(
      "GET",
      `/v1/viewer/${token}/matched-apps?page=${page}&page_size=${pageSize}${q ? `&q=${encodeURIComponent(q)}` : ""}${linesQuery(lines)}${matchTypeQuery(matchType)}${change ? `&change=${change}` : ""}${platform !== "all" ? `&platform=${platform}` : ""}`,
    );
  },
  /**
   * One page of one Inactive list (publishers or apps): what carried the
   * reader's lines and went inactive between the two compared crawls, with
   * the date, the reason and the evidence. Frozen with the report, searched and paged server-side
   * like the matched lists; a trial answers its first rows with `trial`.
   *
   * BACKWARDS COMPATIBLE. An API from before this route answers 404, which
   * here means only "this API is older" (never a dead link, see above): the
   * page is then built from the summary's No longer live block, passed in as
   * `legacy`, the way the crawler itself serves an old link.
   *
   * In MOCK mode `?inactive=legacy` shows an older link (from the gone
   * block) and `?inactive=none` a report without the section.
   */
  inactive: async (
    token: string,
    kind: InactiveKind,
    opts: { page?: number; q?: string; lines?: string[]; pageSize?: number } = {},
    legacy?: GoneInventory | null,
  ): Promise<InactivePage> => {
    const page = opts.page ?? 1;
    if (MOCK) {
      const variant = mockInactiveMode();
      if (variant !== "full") {
        // An older link: the crawler answers from its gone block (or has
        // nothing), exactly what the 404 fallback below builds.
        const { mockGone } = await import("./mockData");
        return pageFromGone(variant === "legacy" ? mockGone : null, kind, {
          page,
          pageSize: PAGE_SIZE,
          q: opts.q,
          lines: opts.lines,
        });
      }
      const { mockInactive } = await import("./mockData");
      return mockInactive(
        kind,
        { page, q: opts.q, lines: opts.lines },
        trialMock(),
      );
    }
    const q = new URLSearchParams({
      kind,
      page: String(page),
      page_size: String(opts.pageSize ?? PAGE_SIZE),
    });
    if (opts.q) q.set("q", opts.q);
    // Appended raw, as every list does: the keys are encoded once by
    // serializeLines, and the API splits them without decoding again.
    try {
      return await req<InactivePage>(
        "GET",
        `/v1/viewer/${token}/inactive?${q.toString()}${linesQuery(opts.lines)}`,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        return pageFromGone(legacy, kind, {
          page,
          pageSize: PAGE_SIZE,
          q: opts.q,
          lines: opts.lines,
        });
      }
      throw e;
    }
  },
  /**
   * Line events scoped to a single developer, used by the nested-row
   * expansion on the Results page. In mock mode, reads the same seeded map
   * used by the summary counters. In live mode, calls the shared line-events
   * endpoint with a developer_id filter.
   */
  linesForDeveloper: async (token: string, developer_id: number) => {
    if (MOCK) {
      const { linesForDeveloper } = await import("./mockData");
      const rows = linesForDeveloper(developer_id);
      return {
        page: 1,
        page_size: rows.length || 1,
        total: rows.length,
        rows,
      } as LineEventsPage;
    }
    const q = new URLSearchParams({ developer_id: String(developer_id) });
    return req<LineEventsPage>(
      "GET",
      `/v1/viewer/${token}/line-events?${q.toString()}`,
    );
  },
  /** Bundles for a single developer, for the nested expansion. */
  bundlesForDeveloper: async (token: string, developer_id: number) => {
    if (MOCK) {
      const { bundlesForDeveloper } = await import("./mockData");
      return bundlesForDeveloper(developer_id);
    }
    // Live mode: no per-developer bundles endpoint yet, so fall back to
    // filtering the first page of the shared list.
    const page = await req<MatchedBundlesPage>(
      "GET",
      `/v1/viewer/${token}/matched-bundles?page=1&page_size=500`,
    );
    return page.rows.filter((r) => r.developer_id === developer_id);
  },
  /**
   * ─────────────────────────────────────────────────────────────────
   * DISCOVERED LINES — proposed backend contract
   * ─────────────────────────────────────────────────────────────────
   *
   * The old endpoint returned the export workbook's Discovered sheet
   * verbatim: one row per (developer x SSP x publisher id x file). That is
   * the right shape for a spreadsheet and the wrong shape for the screen,
   * because the reader's unit is THE LINE. The same
   * "madeupmedia.com, 1042318, RESELLER" appears on four hundred publishers
   * and produced four hundred rows, which buried the one fact the weekly
   * crawl exists to deliver: is this line on more publishers than it was
   * last week, or fewer.
   *
   * So the API groups. Two endpoints, both token-scoped like every other
   * viewer call, both behind the same session cookie:
   *
   * ── 1. The list ───────────────────────────────────────────────────
   *
   *   GET /v1/viewer/{token}/discovered-lines
   *       ?page=1                 (1-based, default 1)
   *       &page_size=50           (default 50, cap 200)
   *       &ssp_domain=caramb      (optional, case-insensitive SUBSTRING
   *                                match on ssp_domain, same semantics as
   *                                the line-events filter)
   *
   *   200 →
   *   {
   *     "page": 1,
   *     "page_size": 50,
   *     "total": 170,               // distinct lines matching the filter
   *     "totals": {                 // whole filtered set, NOT this page
   *       "lines": 170,
   *       "placements": 4102,
   *       "previous_lines": 158,    // null if there is no previous crawl
   *       "previous_placements": 3894
   *     },
   *     "rows": [
   *       {
   *         "ssp_domain": "madeupmedia.com",
   *         "publisher_id": "1042318",
   *         "relationship": "RESELLER",
   *         "cert_id": "4a7be0c1d9f23b58",   // "" when the file omits it
   *         "placements_count": 431,
   *         "previous_placements_count": 402, // null = line is new this week
   *         "placements": [ ...DiscoveredPlacement ]  // OPTIONAL, see below
   *       }
   *     ]
   *   }
   *
   *   Ordering, in three bands, because the question a WEEKLY crawl is
   *   opened with is "what changed", not "what is biggest":
   *
   *     1. Lines that are NEW this week (previous_placements_count IS NULL),
   *        placements_count DESC among themselves. A line that did not exist
   *        seven days ago is the largest change there is.
   *     2. Lines that GREW, by (placements_count - previous_placements_count)
   *        DESC, then placements_count DESC.
   *     3. Everything else, flat or shrunk, placements_count DESC.
   *
   *   Then, in every band, ssp_domain ASC, publisher_id ASC, relationship
   *   ASC, cert_id ASC. Those four are the line's identity, so the order is
   *   TOTAL, which is what keeps a paged list from repeating or dropping a
   *   row between page 1 and page 2. Note that ssp_domain + publisher_id
   *   alone is not unique (a rotated cert is two lines sharing both), which
   *   is why the tiebreak runs the whole tuple.
   *
   *   Reference implementation: `compareDefault` in src/lib/discoveredSort.ts,
   *   which the mock endpoint sorts with and which the page's sort control
   *   offers as its default option. Any backend implementation must produce
   *   the same order, or the page's first screen stops being the first
   *   screen once a second page exists.
   *
   *   The old order (placements_count DESC alone) is still reachable in the
   *   UI as the "Most publishers" sort, but it is no longer the default and
   *   the endpoint should not return it.
   *
   *   A line's identity is the whole four-tuple
   *   (ssp_domain, publisher_id, relationship, cert_id). Two rows that
   *   differ only in cert_id are two different ads.txt lines and must stay
   *   apart: a publisher rotating a cert is exactly the change the report
   *   has to be able to show.
   *
   *   `placements` is an OPTIONAL embed. The backend SHOULD include it when
   *   placements_count <= 20 and MUST omit it above that, so one widely
   *   carried line cannot turn a page of 50 into a multi-megabyte payload.
   *   The client treats a present array as authoritative and falls back to
   *   endpoint 2 when it is absent, so the threshold can be retuned server
   *   side without a frontend change.
   *
   *   `previous_placements_count` is null in exactly two cases, which the
   *   UI renders identically ("new"): the line did not exist in the
   *   previous crawl, or there is no previous crawl at all. When there is
   *   no previous crawl, `totals.previous_*` are also null, which is how
   *   the summary row knows to say "first crawl" instead of a direction.
   *
   *   `totals` is computed over the FILTERED set, not the page and not the
   *   whole crawl, so the summary row on screen always describes exactly
   *   the cards under it. `previous_placements` must be counted in the
   *   previous crawl (restricted to the same discovery domains and the same
   *   ssp_domain filter), NOT derived by summing the rows above: rows only
   *   cover lines that still exist this week, so a line that vanished
   *   entirely would silently drop out of last week's total and make every
   *   week look like growth.
   *
   * ── 2. One line's placements ──────────────────────────────────────
   *
   *   GET /v1/viewer/{token}/discovered-lines/placements
   *       ?ssp_domain=madeupmedia.com    (all four required, EXACT match)
   *       &publisher_id=1042318
   *       &relationship=RESELLER
   *       &cert_id=                    (empty string is a valid value)
   *       &page=1
   *       &page_size=100               (default 100, cap 500)
   *
   *   200 →
   *   {
   *     "page": 1, "page_size": 100, "total": 431,
   *     "rows": [
   *       {
   *         "developer_domain": "hollowcreekmedia.com",
   *         "developer_name": "Hollow Creek Media",
   *         "platform": "Web",
   *         "found_in": "ads.txt"        // "ads.txt" | "app-ads.txt"
   *       }
   *     ]
   *   }
   *
   *   The key travels as query params rather than a path segment on
   *   purpose: publisher_id is publisher-controlled free text (slashes,
   *   spaces and dots all occur in the wild) and cert_id is legitimately
   *   the empty string, neither of which survives a path segment cleanly.
   *
   *   Ordering: developer_domain ASC, then found_in ASC. Alphabetical, so
   *   a reader scanning a 400-row list can find a publisher by eye, and so
   *   a publisher listed in both files shows its two rows adjacent.
   *
   *   `found_in` arrives pre-rendered as the filename the reader
   *   recognises, not the internal file_kind enum, matching the old
   *   Discovered sheet.
   *
   *   404 is NOT the answer for an unknown line key; an empty rows array
   *   with total 0 is: an unknown key is an empty answer, not a missing
   *   route. (A 404 here no longer throws the reader out of the report;
   *   see "No 404 fan-out" above.)
   */
  discoveredLines: async (
    token: string,
    opts: {
      page?: number;
      page_size?: number;
      ssp_domain?: string;
      origin?: "given" | "found";
      /** Which lines to list (reports from 2026-10-14): by relationship,
       *  new this week, needing a fix, or by the customer's sellers.json.
       *  Absent lists every line. */
      show?: DiscoveredShow;
      /** Case-insensitive substring: a line matches on its publisher_id,
       *  ssp_domain or cert_id, or when any publisher in its roster
       *  matches on developer_domain or developer_name. */
      q?: string;
    } = {},
  ) => {
    if (MOCK) {
      const { mockDiscoveredLines } = await import("./mockData");
      const r = mockDiscoveredLines(opts);
      return trialMock()
        ? {
            ...r,
            page: 1,
            ...cutRows(r.rows, TRIAL_CAPS_MOCK.discovered_lines, r.total),
          }
        : r;
    }
    const q = new URLSearchParams();
    q.set("page", String(opts.page ?? 1));
    q.set("page_size", String(opts.page_size ?? 50));
    if (opts.ssp_domain) q.set("ssp_domain", opts.ssp_domain);
    if (opts.origin) q.set("origin", opts.origin);
    if (opts.show) q.set("show", opts.show);
    if (opts.q) q.set("q", opts.q);
    return req<DiscoveredLinesPage>(
      "GET",
      `/v1/viewer/${token}/discovered-lines?${q.toString()}`,
    );
  },
  /**
   * Every publisher carrying one discovered line, for the card's roster:
   * whole, paged, searchable. The page always reads the roster here, never
   * from a row's embedded `placements` (older reports still carry one,
   * capped at 200; the API serves it from this route too).
   *
   * `q` is a substring on developer_domain / developer_name, and on
   * app_name / bundle_id when present. 503 with "too large" in the detail
   * when the report did not keep that line's roster.
   */
  discoveredLinePlacements: async (
    token: string,
    key: DiscoveredLineKey,
    opts: { page?: number; page_size?: number; q?: string } = {},
  ) => {
    if (MOCK) {
      const { mockDiscoveredLinePlacements } = await import("./mockData");
      return mockDiscoveredLinePlacements(key, opts);
    }
    const q = new URLSearchParams();
    q.set("ssp_domain", key.ssp_domain);
    q.set("publisher_id", key.publisher_id);
    q.set("relationship", key.relationship);
    q.set("cert_id", key.cert_id);
    q.set("page", String(opts.page ?? 1));
    q.set("page_size", String(opts.page_size ?? 100));
    if (opts.q) q.set("q", opts.q);
    return req<DiscoveredPlacementsPage>(
      "GET",
      `/v1/viewer/${token}/discovered-lines/placements?${q.toString()}`,
    );
  },
  /**
   * What the crawled files DECLARED, as opposed to what they carried:
   * inventorypartnerdomain lines, ownerdomain claims, and seats found with
   * a different relationship than the watchlist expects. One call, no
   * paging: declared_by/claimed_by are capped at 50 per subject server
   * side, with `declarer_total`/`claimant_total` as the honest counts.
   *
   * The sidebar also uses this as its probe: the Declarations entry shows
   * only when one of the three totals is nonzero.
   */
  declarations: async (token: string): Promise<DeclarationsPayload> => {
    if (MOCK) {
      // `?legacy=1` exercises the grouped shape older links answer with.
      const legacy = new URLSearchParams(window.location.search).has("legacy");
      const { mockDeclarations, mockDeclarationRows } = await import(
        "./mockData"
      );
      if (trialMock() && !legacy) {
        const cut = cutRows(
          mockDeclarationRows.rows,
          TRIAL_CAPS_MOCK.declarations,
          mockDeclarationRows.total,
        );
        return { ...mockDeclarationRows, ...cut };
      }
      return legacy ? mockDeclarations : mockDeclarationRows;
    }
    return req<DeclarationsPayload>("GET", `/v1/viewer/${token}/declarations`);
  },
  /**
   * SELLERS.JSON FIX: the customer's own sellers.json as it stands, and
   * every seller ID publishers list under the customer's domain. The page
   * works out the suggestions itself (lib/sellersFix.ts) and never changes
   * the live file; it only builds the file the reader exports.
   *
   * A report without the page (no validator on the plan, a trial, an older
   * report, a file that could not be read) answers 404: null here, and the
   * page stays off the rail. Never the dead-link card.
   */
  sellersFix: async (token: string): Promise<SellersFixPayload | null> => {
    if (MOCK) {
      const m = await import("./mockSellers");
      // `?nofile=1` shows a customer with no sellers.json yet: the page
      // then builds one from scratch. `?noversion=1`, `?warnings=1` and `?broken=1` show the
      // notes about a live file that is not strict JSON, or that holds a
      // null and a number too long for a browser.
      const q = new URLSearchParams(window.location.search);
      if(q.has("sega")) return m.segaReport(q.get("sega") !== "blocked");
      if(token === "verification-demo" || q.get("verification") === "all") return m.verificationReport();
      let file = q.has("nofile")
        ? null
        : q.has("broken")
          ? m.brokenFile(m.mockSellersFile)
          : m.mockSellersFile;
      // `?noversion=1`: a file whose header has no version.
      if (file && q.has("noversion")) {
        const { version: _drop, ...rest } = file;
        file = rest as typeof file;
      }
      return {
        domain: m.MOCK_SELLERS_DOMAIN,
        file,
        sightings: m.mockSellerSightings,
        file_checks: m.mockCompletedChecks,
        checked_at: m.MOCK_CHECKED_AT,
        file_url: `https://${m.MOCK_SELLERS_DOMAIN}/sellers.json`,
        file_warnings: q.has("warnings") ? m.MOCK_FILE_WARNINGS : [],
      };
    }
    // A plain fetch: most reports have no Sellers.json page, and their 404
    // means exactly that, so it is answered here as null. Before 2026-10-06
    // req() read a 404 as a dead link, which took every report without the
    // page down.
    await whenSignedIn();
    const res = await fetch(`${BASE}/v1/viewer/${token}/sellers-fix`, {
      credentials: "include",
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ApiError(
        res.status,
        detail || `GET sellers-fix → ${res.status}`,
      );
    }
    return (await res.json()) as SellersFixPayload;
  },
  /**
   * SCHAIN EXPORT: what the page opens on.
   *
   * Frozen at bake time from the customer's own sellers.json: the SDKs in
   * it (every seller whose domain publishes its own sellers.json), each
   * with the Seller ID(s) it holds there, plus the customer's seat lines
   * and how many of the link's schain downloads are used. `status` other
   * than "ok" hides the page from the rail.
   */
  schain: async (token: string): Promise<SchainOverview> => {
    if (MOCK) {
      const { mockSchainOverview } = await import("./mockSchain");
      return mockSchainOverview(trialMock());
    }
    return req<SchainOverview>("GET", `/v1/viewer/${token}/schain`);
  },
  /**
   * Which copy of ONE SDK's sellers.json step 3 checks against.
   *
   * By default the copy saved with this report, read when it was made, so
   * the whole list is true of one moment and the page can say which.
   * `refresh: true` re-reads the SDK's file live (David, 2026-10-04: "you
   * can always refresh the sellers.json of the SDKs, not of the user"),
   * and the server then proves the preview and the file against that read.
   * The customer's own sellers.json is never refreshed here.
   */
  schainReadSdk: async (
    token: string,
    sdk: string,
    opts: { refresh?: boolean } = {},
  ): Promise<SchainSdkRead> => {
    if (MOCK) {
      const { mockSchainReadSdk } = await import("./mockSchain");
      return mockSchainReadSdk(sdk, !!opts.refresh);
    }
    return req<SchainSdkRead>("POST", `/v1/viewer/${token}/schain/sdk`, {
      sdk,
      refresh: !!opts.refresh,
    });
  },
  /** Per seat line, how many publishers and apps close a chain through
   *  this SDK. Read after the SDK's file, so a line with none is greyed. */
  schainSeatCounts: async (
    token: string,
    sdk: string,
    live = false,
  ): Promise<SchainSeatCount[]> => {
    if (MOCK) {
      const { mockSchainSeatCounts } = await import("./mockSchain");
      return mockSchainSeatCounts(sdk);
    }
    const q = new URLSearchParams({ sdk });
    if (live) q.set("live", "true");
    return req<SchainSeatCount[]>(
      "GET",
      `/v1/viewer/${token}/schain/seat-counts?${q.toString()}`,
    );
  },
  /** The funnel, the totals and one page of the Apps rows for one
   *  selection: SDK, seat line and reseller line. */
  schainPreview: async (
    token: string,
    sel: SchainSelection,
    opts: {
      page: number;
      page_size: number;
      q?: string;
      view?: "apps" | "publishers";
    },
  ): Promise<SchainPreview> => {
    if (MOCK) {
      const { mockSchainPreview } = await import("./mockSchain");
      return mockSchainPreview(sel, opts, trialMock());
    }
    const q = new URLSearchParams({
      sdk: sel.sdk,
      seat: sel.seat,
      sid2: sel.sid2,
      page: String(opts.page),
      page_size: String(opts.page_size),
    });
    if (sel.live) q.set("live", "true");
    if (opts.q) q.set("q", opts.q);
    if (opts.view) q.set("view", opts.view);
    return req<SchainPreview>(
      "GET",
      `/v1/viewer/${token}/schain/preview?${q.toString()}`,
    );
  },
  /**
   * Download the schain file for a selection. Counts against the link's 3
   * schain downloads, except a selection already downloaded, which is free.
   * Resolves with the downloads now used; the browser saves the file.
   *
   * In MOCK mode the workbook is built in the browser, in the same four
   * sheets and columns as the admin Schain Export.
   */
  schainExport: async (
    token: string,
    sel: SchainSelection,
    format: "xlsx" | "csv",
  ): Promise<{ used: number; limit: number }> => {
    if (MOCK) {
      const { mockSchainExport } = await import("./mockSchain");
      return mockSchainExport(sel, format);
    }
    const q = new URLSearchParams({
      sdk: sel.sdk,
      seat: sel.seat,
      sid2: sel.sid2,
    });
    if (sel.live) q.set("live", "true");
    await whenSignedIn();
    const res = await fetch(
      `${BASE}/v1/viewer/${token}/schain/export.${format}?${q.toString()}`,
      {
        credentials: "include",
        redirect: "follow",
      },
    );
    if (!res.ok) {
      let detail = "";
      try {
        detail = ((await res.json()) as { detail?: string }).detail ?? "";
      } catch {
        /* not JSON */
      }
      throw new ApiError(res.status, detail || `export failed: ${res.status}`);
    }
    const used = Number(res.headers.get("X-Schain-Downloads-Used") ?? 0);
    const limit = Number(res.headers.get("X-Schain-Downloads-Limit") ?? 3);
    const blob = await res.blob();
    const name =
      /filename="?([^";]+)"?/.exec(
        res.headers.get("Content-Disposition") ?? "",
      )?.[1] ?? `schain.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { used, limit };
  },
  chat: async function* (
    token: string,
    prompt: string,
  ): AsyncGenerator<ChatFrame> {
    if (MOCK) {
      const { mockChatStream } = await import("./mockData");
      for await (const frame of mockChatStream(prompt)) yield frame;
      return;
    }
    await whenSignedIn();
    const res = await fetch(`${BASE}/v1/viewer/${token}/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok || !res.body) {
      throw new ApiError(res.status, `chat stream failed: ${res.status}`);
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const raw of parts) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const chunk = line.slice(5).trim();
        if (!chunk) continue;
        try {
          yield JSON.parse(chunk) as ChatFrame;
        } catch {
          /* skip */
        }
      }
    }
  },
};

// ---- types ----

/** What Export hands over (GET /v1/viewer/{token}/export-info). */
/** A trial (lead magnet) report: how many rows of each list the reader may
 *  see. The headline counts on the summary are never capped; the lists are. */
export type TrialCaps = {
  publishers: number;
  apps: number;
  declarations: number;
  discovered_lines: number;
  /** Rows of each Inactive list; present when the report carries the section. */
  inactive?: number;
};

/** How a capped list was cut on a trial report: the cap, how many rows are
 *  shown, and the full count behind the cut. Absent on a full report. */
export type TrialSlice = { cap: number; shown: number; full_total: number };

export type ExportInfo = {
  /** "zip" = the Excel plus the Matched apps list as CSV (too big for Excel). */
  format: "xlsx" | "zip" | "none";
  /** True on a trial report: there is no download, by design. */
  trial?: boolean;
  /** A download of only the selected lines exists for this report. */
  line_export: boolean;
  excel_row_limit?: number;
  /** Rows in the Matched apps CSV, when format is "zip". */
  apps_rows?: number | null;
};

export type MatchedMove = { found: number; lost: number };
export type MatchedMoves = { developers: MatchedMove; apps: MatchedMove | null };

/** A publisher that carried the reader's lines and is gone (dead domain,
 *  site down for many crawls). Listed apart, never counted. */
export type GonePublisher = {
  domain: string;
  name: string;
  reason: string;
  since: string | null;
  lines: string[];
  apps: number;
};

/** An app of a matched publisher that its store has twice said is gone. */
export type GoneApp = {
  name: string;
  store: string;
  bundle: string;
  publisher: string;
  reason: string;
  since: string | null;
};

/** No longer live (FelixAds QA, 2026-10-06): frozen with the report, the
 *  first rows of each list with the full totals. Absent on older links. */
export type GoneInventory = {
  publishers: GonePublisher[];
  apps: GoneApp[];
  totals: { publishers: number; apps: number };
};

// ---- Inactive (2026-10-08, crawler docs/INACTIVE.md) ----
// A report is the difference between two crawls, and so is this section:
// the publishers and apps that went inactive BETWEEN the compared crawl and
// this one (inactive_since after the compared crawl, up to this crawl),
// each with its date, its reason and the evidence. Listed apart from the
// active lists and never counted in the headline numbers. Two lists only,
// publishers and apps (David, 2026-10-08); Removed is unchanged.

export type InactiveKind = "publishers" | "apps";

/** How many of each went inactive between the two compared crawls: whole,
 *  never cut by a trial or a filter. Older APIs also send ``lines``; it is
 *  ignored. */
export type InactiveCounts = { publishers: number; apps: number };

/** One of the seat lines an inactive publisher carried. Links frozen before
 *  the section carry only the line's identity (derived from ``gone``). */
export type InactivePublisherLine = {
  ssp_domain: string;
  publisher_id: string;
  relationship: string;
  file?: string | null;
  first_seen?: string | null;
  last_seen?: string | null;
  ended_at?: string | null;
  reason_code?: string | null;
  /** The declared host whose app-ads.txt holds the line (IAB app-ads.txt
   *  spec, 2026-10-21); null or absent: the publisher's own domain file. */
  host?: string | null;
};

export type InactivePublisher = {
  developer_id?: number | null;
  domain: string;
  name: string | null;
  inactive_since: string | null;
  /** domain_gone, certificate_broken, site_refuses, site_silent, no_file,
   *  retired_by_operator, inactive; null on a link derived from ``gone``. */
  reason_code: string | null;
  reason: string | null;
  evidence_summary?: string | null;
  lines: InactivePublisherLine[];
  apps: number | null;
};

export type InactiveApp = {
  app_id?: number | null;
  store: string;
  bundle: string;
  name: string | null;
  store_url?: string | null;
  developer_id?: number | null;
  /** The publisher's domain; "" on a trial (withheld). */
  publisher: string;
  publisher_name?: string | null;
  publisher_inactive?: boolean;
  inactive_since: string | null;
  /** unlisted_from_store (an operator's retirement is never listed to a
   *  customer); null when derived from ``gone``. */
  reason_code: string | null;
  reason: string | null;
  evidence?: {
    http_status?: number | null;
    storefronts_checked?: string[] | null;
    qa_outcome?: string | null;
  } | null;
  evidence_summary?: string | null;
  /** Always true on a list frozen since 2026-10-08: only a death confirmed
   *  in the window is listed. */
  confirmed?: boolean;
  /** The reader's seat lines its publisher carries (all of them, even none),
   *  so the card needs no other call. Absent only on a row frozen before
   *  them: the card then reads them by ``developer_id``, as a matched app
   *  card does. A trial keeps them and withholds the publisher's name. */
  lines?: InactivePublisherLine[];
  /** The host whose app-ads.txt authorized this app (see MatchedApp).
   *  Absent on a row frozen before 2026-10-21. */
  file_host?: string | null;
  file_source?: FileSource;
};

export type InactiveRow = InactivePublisher | InactiveApp;

/** GET /v1/viewer/{token}/inactive: one page of one Inactive list. */
export type InactivePage<R = InactiveRow> = {
  kind: InactiveKind;
  page: number;
  page_size: number;
  /** Rows matching the search and the line filter (what the pager counts). */
  total: number;
  rows: R[];
  /** False: the report was frozen without the section (and without ``gone``). */
  available: boolean;
  counts: InactiveCounts;
  /** The bake kept only the newest rows of this list. */
  truncated: boolean;
  /** Present on a trial report: this list was cut (see ``TrialSlice``). */
  trial?: TrialSlice | null;
  /** "gone": an older link, served from its No longer live block. */
  derived_from?: string | null;
};

/** The sellers.json read record (crawler #364,
 *  run_export.sellers_reads_record), frozen on the report: of the
 *  exchanges the seats name, how many have a read the seller role leans
 *  on, since when, and why each other one has none. ``unavailable`` when
 *  the build could not make it. Every field optional: read safely. */
export type SellersJsonReads = {
  unavailable?: boolean;
  exchanges?: number;
  read?: number;
  read_domains?: string[];
  /** ISO time of the oldest read leaned on. */
  oldest_read?: string;
  not_read?: { domain?: string; why?: string }[];
  /** Read before, not read again: the build's budget ran out. */
  not_reread?: string[];
  budget_s?: number;
  as_of?: string;
};

export type Summary = {
  crawl_id: number;
  /** What carried the reader's lines and is gone; never in the counts. */
  gone?: GoneInventory | null;
  /** Publishers and apps that went inactive between the two compared
   *  crawls: NOT in ``counters.matched``, which counts active only. Absent
   *  on links frozen before the section. */
  inactive_counts?: InactiveCounts | null;
  /** What the report build's read of the seats' sellers.json files did
   *  (crawler #364, "Sellers.json read" on the workbook's Summary). Only a
   *  report that carries it has seller roles worth showing: before #364 a
   *  seller ID that IS in sellers.json could read "not in sellers.json".
   *  Absent on every report frozen before it. */
  sellers_json_reads?: SellersJsonReads | null;
  /** When this crawl and the crawl it is compared with ran: the window the
   *  report covers (the Inactive section's, among others). Optional: until
   *  the backend sends them, this crawl's ``finished_at`` and the previous
   *  summary's ``finished_at`` stand in. */
  crawl_at?: string | null;
  compared_crawl_at?: string | null;
  /** Set on a trial report (see ``TrialCaps``); null or absent on a full one. */
  trial?: TrialCaps | null;
  /** The watchlist this report was built from: what the seat-line filter
   *  offers. Optional: artifacts frozen before it was exposed omit it, and
   *  the filter then simply does not show. */
  watchlist?: { seats: MatchedSeatLine[]; discover: string[] };
  source: string;
  status: string;
  queued_at: string | null;
  finished_at: string | null;
  started_at: string | null;
  previous_job_id: number | null;
  counters: {
    developer_count: number;
    fetched_count: number;
    error_count: number;
    not_found_count: number;
    unreadable_count: number;
    developers_with_lines: number;
    matched: { lines: number; developers: number; apps: number };
    /** How many matched publishers and apps STARTED and STOPPED matching
     *  since the baseline. Optional: links baked before it lack the key.
     *  Null = not computed (no baseline, or under a line filter); `apps`
     *  alone is null when the bake had to cap an app list. A publisher the
     *  crawl did not reach is never counted as lost. */
    matched_moves?: MatchedMoves | null;
  };
  hero_diff: {
    line_totals: LineEventCounts;
    line_totals_matched_seat: LineEventCounts;
    developer_totals: {
      added: number;
      removed: number;
      changed: number;
      newly_monitored: number;
      monitoring_stopped: number;
    };
    top_ssps: Record<string, { ssp_domain: string; count: number }[]>;
    /** The watchlist moved between the two crawls, so week-over-week
     *  deltas are not like-for-like. Set by the API from the same rows the
     *  counts come from, so the flag and the numbers cannot disagree. */
    scope_changed?: boolean;
    /** Distinct publishers and apps whose lines moved this week. Optional:
     *  present in mock today, and once the backend supplies it, live. The
     *  Changes page reads the PREVIOUS crawl's values to draw a week-over-week
     *  delta on "Publishers affected" / "Apps affected"; absent means no delta,
     *  which is the honest default before the backend sends it. */
    affected?: { publishers: number; apps: number };
  };
};

/* ── MATCH TYPE (crawler PR #348, inventory sharing) ──────────────────
   A match is "own" when the seat line sits in the publisher's own file,
   and "ipd" when it sits in an inventory partner's ads.txt that the
   publisher's app-ads.txt names (INVENTORYPARTNERDOMAIN: a FAST channel
   inside a CTV platform). IPD matches stay inside the one Matched count;
   the Match type filter only splits the list. An IPD match whose
   partner's ads.txt this crawl could not read is inconclusive: never a
   row, never counted, only a quiet note.

   Every field below is OPTIONAL and absent on every report frozen before
   the crawler sent it (or with its report switches off). Absent means
   the page looks exactly as it did: no Match type control, no chips. */

/** How a row matched: its own file, or an inventory partner's ads.txt. */
export type MatchType = "own" | "ipd";
/** The list filter (query param ``match_type``); "all" is never sent. */
export type MatchTypeFilter = "all" | MatchType;

/** The per-row fields of the contract. */
export type MatchTypeFields = {
  match_type?: MatchType;
  /** IPD rows: the partner whose ads.txt carries the line. */
  ipd_partner?: string | null;
  /** IPD rows: the platform whose app-ads.txt names that partner. */
  ipd_platform?: string | null;
  /** IPD rows: the file that declares the partner, in words. */
  declared_in?: string | null;
  /** The seat's role per its sellers.json entry: owner, manager,
   *  reseller, not in sellers.json, confidential. */
  seller_role?: string | null;
  /** "X (GB)": the manager that counts for this seller. */
  managed_by?: string | null;
  /** One sentence each when the roles disagree with the file, e.g.
   *  "Listed as DIRECT, but sellers.json names X, not Y: treated as a
   *  reseller." Empty or absent: nothing to say. */
  verdict_alerts?: string[] | string | null;
  /** Not part of the fixed contract: the CTV platforms whose app-ads.txt
   *  names this publisher as their inventory partner. Shown only if the
   *  crawler ever sends it. */
  partner_inventory_on?: string[] | string | null;
};

/** List meta: the split under the current search and lines. */
export type MatchTypeCounts = { all: number; own: number; ipd: number };

/** List meta: IPD matches this crawl could not confirm. */
export type IpdInconclusive = {
  count: number;
  examples: { partner: string; platform: string }[];
};

/** The list meta of every list that takes ``match_type``. */
export type MatchTypeMeta = {
  match_type_counts?: MatchTypeCounts | null;
  ipd_inconclusive?: IpdInconclusive | null;
  /** THE WATCH TABS (crawler #361, 2026-10-27): how many rows each change
   *  filter of this list holds (``started_watching``, ``stopped_watching``,
   *  ``unconfirmed`` ...). Absent on an API from before it: then those tabs
   *  are not offered at all. */
  change_counts?: Partial<Record<ListChange, number>> | null;
  /** FOUND IN (crawler PR, 2026-10-27): on the publishers' lists, the
   *  ``found_in`` filter the server applied to the whole list, echoed, and
   *  the split counted before it. Absent on an API from before it: then no
   *  Found in switch, and nothing filtered here. */
  found_in?: FoundInFilter | null;
  found_in_counts?: FoundInCounts | null;
};

/** The watch filters of crawler #361, on matched-developers and
 *  matched-apps: rows with a line that started being watched, stopped
 *  being watched, or could not be verified this crawl. */
export type WatchChange = "started_watching" | "stopped_watching" | "unconfirmed";

/** Every ``change`` filter a matched list may take. */
export type ListChange = "added" | "removed" | "changed" | WatchChange;

function matchTypeQuery(matchType: MatchTypeFilter | undefined): string {
  return matchType && matchType !== "all" ? `&match_type=${matchType}` : "";
}

/** Mock mode only: ``?matchtype=off`` previews a report frozen before
 *  match types (no fields, no control). Never reached in production. */
function mockMatchType(matchType: MatchTypeFilter): MatchTypeFilter | null {
  const off =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("matchtype") === "off";
  return off ? null : matchType;
}

export type DeveloperEvent = MatchTypeFields & {
  developer_id: number;
  developer_name: string | null;
  developer_domain: string | null;
  developer_platform: string | null;
  matched_lines_prev: number;
  matched_lines_current: number;
  lines_added: number;
  lines_removed: number;
  lines_cert_changed: number;
  lines_newly_monitored: number;
  lines_monitoring_stopped: number;
  /** Lines the crawler could not verify this crawl (see ``unconfirmed`` on
   *  LineEventKind). Optional: absent on reports frozen before it. */
  lines_unconfirmed?: number;
  top_ssps: { ssp_domain: string; count: number }[];
  occurred_at: string | null;
  /**
   * The exact seat lines behind this publisher's weekly change counts, so the
   * expanded row can show WHAT moved, not only how much. Each array's length
   * equals its matching count above (added_lines.length === lines_added, and
   * so on). Same shape as matched_lines; a cert change prints the new cert.
   */
  added_lines?: MatchedSeatLine[];
  removed_lines?: MatchedSeatLine[];
  cert_changed_lines?: MatchedSeatLine[];
  /** The standing matched set, for a publisher shown outside a change bucket. */
  matched_lines?: MatchedSeatLine[];
};

export type DeveloperEventsPage = MatchTypeMeta & {
  /** Present on a trial report: this list was cut (see ``TrialSlice``). */
  trial?: TrialSlice | null;
  event: string;
  page: number;
  page_size: number;
  total: number;
  rows: DeveloperEvent[];
};

/** What a line's row on the Changes page can say.
 *
 *  The first three describe the WILD: the line appeared, went, or changed
 *  its cert while we were watching both weeks. The last two describe our
 *  own WATCHLIST moving, which means the line was never comparable across
 *  the two crawls. They are separate kinds rather than a flag because
 *  adding them to "added" is the arithmetic that turned importing a
 *  sellers.json into a market-wide adoption event. */
export type LineEventKind =
  | "added"
  | "removed"
  | "cert_changed"
  | "newly_monitored"
  | "monitoring_stopped"
  /** A publisher we did not crawl last week, carrying the customer's own
   *  seats. New to the REPORT, which is all we can honestly claim: we were
   *  not looking at them last week, so we cannot say the line is new to
   *  the world. */
  | "first_appearance"
  /** The crawler could not verify this line this crawl (the file did not
   *  read, or read too short to trust). Never counted as added or removed:
   *  the line stays matched until a later read settles it. Each row says
   *  why, and when it was last seen, read and verified. Reports frozen
   *  before 2026-10-20 never carry it. */
  | "unconfirmed";

/** Counts keyed by every event kind, as the API sends them. ``unconfirmed``
 *  is optional: a report frozen before the kind existed omits it, and a
 *  missing key reads as 0. */
export type LineEventCounts = Record<Exclude<LineEventKind, "unconfirmed">, number> & {
  unconfirmed?: number;
};

/** How a line's dates were taken: from the file read itself, or from the
 *  crawl's time when the exact read time was not stored. */
export type LineDateSource = "fetch" | "crawl";

/**
 * WHY A LINE WAS REMOVED (crawler, 2026-10-26), on a removed line: the file
 * was read and the line is no longer in it, or the file itself was not
 * served. Absent on every report frozen before it: the line then says
 * nothing about why. Either way it is counted as removed.
 */
export type RemovalReason = "line_not_in_file" | "file_not_served";
export type RemovalFields = {
  removal_reason?: RemovalReason | null;
  /** Optional evidence in a few words, e.g. "404 on 3 reads". */
  removal_detail?: string | null;
};

export type LineEvent = RemovalFields & {
  developer_id: number;
  developer_name: string | null;
  developer_domain: string | null;
  file_kind: string;
  ssp_domain: string;
  publisher_id: string;
  relationship: string;
  event: string;
  old_cert_id: string | null;
  new_cert_id: string | null;
  matched_seat: boolean;
  occurred_at: string | null;
  /** When this line was FIRST seen in the wild, from the watchlist-
   *  independent book. On `newly_monitored` rows, only when the book
   *  knows: null means "we cannot say", never "it is new". On an `added`
   *  row, when this crawl first read it (the honest date of the addition).
   *  Absent means unknown. */
  first_seen_at?: string | null;
  /* THE DATES BEHIND A CHANGE (David, 2026-10-20: a change is shown only
     when verified, and every one carries dates). All ISO UTC; every field
     is optional because a report frozen before it was written has none,
     and a missing field means unknown, never a guess. */
  /** Removed: when we last read the line in the file. */
  last_seen_at?: string | null;
  /** Removed: the read that first did not find it. */
  not_found_at?: string | null;
  /** Added: the last read that did not have it. Null (not absent) when the
   *  compared crawl did not read this file at all. */
  last_absent_at?: string | null;
  /** Cert changed: the read that saw the new cert. */
  seen_at?: string | null;
  /** Whether the dates above are exact file read times ("fetch") or the
   *  crawl's time standing in for them ("crawl"). Absent means unknown. */
  date_source?: LineDateSource;
  /** Unconfirmed: why the crawler could not verify the line, in a sentence.
   *  Newly monitored / monitoring stopped: "host first read" (the file at
   *  this host was read for the first time this crawl, so its lines are
   *  newly monitored, not added) or "host not read" (the file at this host
   *  was not read this crawl, so its lines are no longer monitored, not
   *  removed); null is a watchlist change, as before. */
  reason?: string | null;
  /** The host whose file holds this line (IAB app-ads.txt spec,
   *  2026-10-21): a declared sub-domain host, or the publisher's own domain
   *  for its own file. Absent on reports frozen before it. */
  host?: string | null;
  /** Unconfirmed: when the file was read this crawl, and when the line was
   *  last verified (null: not verified). */
  read_at?: string | null;
  verified_at?: string | null;
  /** Unconfirmed: how many reads were attempted. */
  tries?: number | null;
  /** How this row was tied to the developer: found in their own file
   *  ("file"), through an inventorypartnerdomain declaration ("ipd"), or in
   *  a subdomain's file ("subdomain"). Absent on old data means "file". */
  matched_via?: "file" | "ipd" | "subdomain";
  /** Domains whose files declared this row's developer as their inventory
   *  partner. Can be non-empty even when matched_via is "file": a developer
   *  can be both crawled directly and vouched for. Capped at 25. */
  ipd_declared_by?: string[];
} & MatchTypeFields;

export type LineEventsPage = MatchTypeMeta & {
  /** Present on a trial report: this list was cut (see ``TrialSlice``). */
  trial?: TrialSlice | null;
  page: number;
  page_size: number;
  total: number;
  rows: LineEvent[];
};

/**
 * One matched seat line, as it appears in the publisher's file: the same
 * three fields the Changes and Discovery pages print in mono, plus the
 * optional cert id. This is the answer to "which of my seats did this
 * publisher carry", which is a different fact from how many moved this week.
 */
export type MatchedSeatLine = RemovalFields & {
  /** The seat's roles (crawler #348, REPORT_SELLER_ROLES), as on the row
   *  that carries the line; read for the type's sake, the row says them. */
  seller_role?: string | null;
  managed_by?: string | null;
  verdict_alerts?: string[] | string | null;
  ssp_domain: string;
  publisher_id: string;
  relationship: string;
  /** "" or absent when the file omits the fourth field, the majority case. */
  cert_id?: string;
  /**
   * Where the line came from and the day it was added to this customer's
   * list (2026-09-25). Four values, two of which are one idea reached by
   * two buttons: `sellers_json` imported in bulk, `manual` put there by a
   * person, `signal` and `discovered` both found on a discovery domain.
   * Absent on artifacts frozen before this, where the honest answer is
   * that we do not know, and the line carries no hint at all.
   */
  source?: "sellers_json" | "manual" | "signal" | "discovered" | "";
  added_at?: string | null;
  /**
   * Where the line was found: "ads.txt", "app-ads.txt", or "both" when
   * the same seat sits in the two files (one row, per the dedupe -- the
   * two sightings are one fact, and this word is what keeps that honest).
   * Absent on artifacts frozen before 2026-09-10.
   */
  found_in?: string;
  /**
   * The dates behind the change, when this line sits in a change window
   * (added, removed or cert changed): the same fields a LineEvent carries,
   * so the Overview's windows print what the Changes page prints. Absent
   * on a standing matched line and on artifacts frozen before 2026-10-20,
   * where the window says the date is not available rather than guessing.
   */
  first_seen_at?: string | null;
  last_absent_at?: string | null;
  last_seen_at?: string | null;
  not_found_at?: string | null;
  seen_at?: string | null;
  date_source?: LineDateSource;
  /**
   * The host whose app-ads.txt holds this line, when it is a declared
   * sub-domain host (IAB app-ads.txt spec, 2026-10-21: an app is credited
   * from the file at the host its store listing declares, e.g.
   * "ftmj.fortunemo.com"). Null or absent: the publisher's own domain file.
   */
  host?: string | null;
  /** Per line (crawler #348): "own" when the line sits in the publisher's
   *  own file, "ipd" when in an inventory partner's ads.txt, named by
   *  ``ipd_partner``. One row's lines can come through several partners,
   *  each line once per partner (2026-10-27). Absent on older reports:
   *  the row's own match type then speaks for its lines. */
  match_type?: MatchType;
  ipd_partner?: string | null;
  /** A cert change's previous cert, from the line events ("" when the line
   *  had none); set by the Changed tab so a row says old to new. */
  old_cert_id?: string;
};

/**
 * Which file an app was credited from (2026-10-21). own_domain: the
 * publisher's own app-ads.txt. host: the app-ads.txt at the host its store
 * listing declares. parent_no_file: the publisher's file, because the host
 * has no file. parent_host_unread: the publisher's file, because the host
 * was not read yet. other_site: the store listing names another site, so
 * the publisher's file is not this app's. no_website: the store listing names no
 * website, so no file applies and the app is credited with nothing.
 */
export type FileSource =
  | "own_domain"
  | "host"
  | "parent_no_file"
  | "parent_host_unread"
  | "other_site"
  | "no_website"
  /** An IPD app (crawler #348): credited from its inventory partner's
   *  ads.txt, the partner under ``file_host``. */
  | "inventory_partner";

export type MatchedDeveloper = MatchTypeFields & {
  developer_id: number;
  name: string | null;
  domain: string | null;
  platform: string | null;
  line_count: number;
  /**
   * The exact seat line(s) this publisher matched. Rendered verbatim in the
   * expanded row on the overview, so a reader sees WHICH seats matched, not
   * only that some did. Capped server side; `line_count` is the honest total.
   */
  matched_lines?: MatchedSeatLine[];
  /**
   * This publisher's weekly change, so the expanded row can reflect WHAT moved
   * on it this week rather than only the standing match. The counts drive the
   * card's change badge; the arrays carry the lines behind them, one object per
   * counted line (added_lines.length === lines_added, and so on). All zero /
   * empty means the publisher matched but held steady, and the expansion falls
   * back to the flat matched_lines list.
   */
  lines_added?: number;
  lines_removed?: number;
  lines_cert_changed?: number;
  added_lines?: MatchedSeatLine[];
  removed_lines?: MatchedSeatLine[];
  cert_changed_lines?: MatchedSeatLine[];
  /** The declared hosts among this publisher's lines (may be empty).
   *  Absent on reports frozen before 2026-10-21. */
  file_hosts?: string[];
};

export type MatchedDevelopersPage = MatchTypeMeta & {
  /** Present on a trial report: this list was cut (see ``TrialSlice``). */
  trial?: TrialSlice | null;
  /** The watch filter the server applied (crawler #361), echoed; absent
   *  on an API from before it. */
  change?: WatchChange | null;
  page: number;
  page_size: number;
  total: number;
  /**
   * True when the artifact holds only a PREFIX of this list.
   *
   * A report frozen under an older row cap reports its real headline count
   * and stores fewer rows. A reader cannot tell rows that ARE the answer
   * from rows that are the first N, and the difference decides whether they
   * should ask for the report to be regenerated, so the page says it.
   *
   * Optional: artifacts served by a crawler that predates the field omit it,
   * and absent means "not known to be truncated".
   */
  truncated?: boolean;
  rows: MatchedDeveloper[];
};

export type MatchedBundle = {
  store: string;
  bundle_id: string;
  app_name: string | null;
  developer_id: number;
  developer_name: string | null;
  developer_domain: string | null;
  line_count: number;
  /** The host whose app-ads.txt authorized this app (see MatchedApp).
   *  Absent on reports frozen before 2026-10-21. */
  file_host?: string | null;
  file_source?: FileSource;
};

export type MatchedBundlesPage = {
  page: number;
  page_size: number;
  total: number;
  /**
   * True when the artifact holds only a PREFIX of this list.
   *
   * A report frozen under an older row cap reports its real headline count
   * and stores fewer rows. A reader cannot tell rows that ARE the answer
   * from rows that are the first N, and the difference decides whether they
   * should ask for the report to be regenerated, so the page says it.
   *
   * Optional: artifacts served by a crawler that predates the field omit it,
   * and absent means "not known to be truncated".
   */
  truncated?: boolean;
  rows: MatchedBundle[];
};

/**
 * One matched app: an app whose app-ads.txt carried the customer's seats,
 * plus the PUBLISHER that owns it. The app-side sibling of MatchedDeveloper,
 * for the split the overview draws between matched publishers and matched
 * apps.
 *
 * `matched_lines` is the exact seat line(s) the app carried, shown verbatim
 * in the expanded row; it is capped for display, and `line_count` is the
 * honest total.
 */
export type MatchedApp = MatchTypeFields & {
  store: string;
  bundle_id: string;
  app_name: string;
  /** The publisher that owns this app: its domain, and optionally a name. */
  owner_domain: string;
  owner_name?: string | null;
  line_count: number;
  /**
   * The owning developer's id. The app's seat lines ARE that developer's
   * app-ads.txt lines, so the expanded row lazy-fetches them from the baked
   * line-events endpoint by this id, exactly as a publisher row does, rather
   * than embedding them in the list.
   */
  developer_id?: number;
  /**
   * This app's weekly change, so the matched-apps list can offer the same
   * Added / Removed / Changed tabs the publishers list has. All absent or
   * zero means the app matched but did not move this week, and it then sits
   * under "All matched" only.
   */
  lines_added?: number;
  lines_removed?: number;
  lines_cert_changed?: number;
  /** Since 2026-10-21 the lines of THIS app's file only (see file_host). */
  matched_lines?: MatchedSeatLine[];
  /**
   * The exact seat lines behind the change counts above, so the expanded row
   * can show WHAT moved this week. One object per counted line, so
   * added_lines.length === lines_added (and so on for removed / cert). Same
   * shape as matched_lines; a cert change prints the line's new cert.
   */
  added_lines?: MatchedSeatLine[];
  removed_lines?: MatchedSeatLine[];
  cert_changed_lines?: MatchedSeatLine[];
  /**
   * The host whose app-ads.txt authorizes this app (2026-10-21): the
   * publisher's own domain when it is the publisher's file, a declared host
   * otherwise, null when the app is credited with nothing. Absent on
   * reports frozen before it.
   */
  file_host?: string | null;
  /** Which file that is, in one word (see FileSource). */
  file_source?: FileSource;
};

/** The change filter of the matched apps list (query param ``change``). */
export type AppChange = "added" | "removed" | "changed" | WatchChange;

/** All / CTV / Mobile / Web: the matched APPS list's Platform switch (an
 *  app's platform comes from its store). */
export type PlatformFilter = "all" | "ctv" | "mobile" | "web";
export type PlatformCounts = { all: number; ctv: number; mobile: number; web: number; unknown?: number };

/** All / ads.txt / app-ads.txt / Both: the matched PUBLISHERS list's
 *  "Found in" switch (which file of theirs carries the seat lines). */
export type FoundInFilter = "all" | "ads_txt" | "app_ads_txt" | "both";
export type FoundInCounts = { all: number; ads_txt: number; app_ads_txt: number; both: number };

export type MatchedAppsPage = MatchTypeMeta & {
  /** Present on a trial report: this list was cut (see ``TrialSlice``). */
  trial?: TrialSlice | null;
  /**
   * The ``change`` filter the server applied to the whole list, echoed.
   * Absent on an API from before the filter: it ignored the parameter, so
   * the rows and ``total`` are the unfiltered list's.
   */
  change?: AppChange | null;
  /** PLATFORM (crawler PR, 2026-10-27): the ``platform`` filter the server
   *  applied to the whole list, echoed, and the list's split by platform
   *  counted before it. Both absent on an API from before it: then no
   *  Platform switch, and nothing filtered here. */
  platform?: PlatformFilter | null;
  platform_counts?: PlatformCounts | null;
  page: number;
  page_size: number;
  total: number;
  /**
   * True when the artifact holds only a PREFIX of this list.
   *
   * A report frozen under an older row cap reports its real headline count
   * and stores fewer rows. A reader cannot tell rows that ARE the answer
   * from rows that are the first N, and the difference decides whether they
   * should ask for the report to be regenerated, so the page says it.
   *
   * Optional: artifacts served by a crawler that predates the field omit it,
   * and absent means "not known to be truncated".
   */
  truncated?: boolean;
  rows: MatchedApp[];
};

/**
 * One place a discovered line was found: a publisher, and which of their two
 * files carried it. The SQL COALESCEs the text columns to "" rather than
 * NULL, so they are plain strings here.
 */
export type DiscoveredPlacement = {
  developer_domain: string;
  developer_name: string;
  platform: string;
  /** "ads.txt" or "app-ads.txt", pre-rendered, not the file_kind enum. */
  found_in: string;
  /**
   * APP PLACEMENTS. When the line was found in an app's app-ads.txt rather
   * than on a website, these carry the app it was found in: its store name,
   * its store/bundle id, and a display name. All three are absent on a plain
   * website placement, which stays a bare developer_domain + found_in row.
   *
   * `store` is the store code the crawler already speaks ("ios", "android",
   * "roku", "samsung", "vizio", "firetv", "ctv"), rendered to a human label
   * on screen (see storeLabel in CrawlDiscovered).
   */
  app_name?: string;
  store?: string;
  bundle_id?: string;
};

/**
 * What the customer's OWN sellers.json says about a line's seller ID
 * (reports from 2026-10-14). The discovery domain is the customer's domain,
 * so every line's seller ID should be one of theirs: either the file lists
 * it, with the seller's name and type, or it does not.
 */
export type SellerCheck =
  | { status: "listed"; name: string; seller_type: string }
  | { status: "unlisted" };

/** Something in the line itself a publisher should fix: a placeholder or
 *  malformed seller ID, a corrupted cert id, a seller carried with the
 *  relationship the sellers.json does not give it, or the same seller ID
 *  both as DIRECT and RESELLER. `text` is the sentence the page shows. */
export type LineIssue = {
  kind: "bad_id" | "bad_cert" | "relationship_mismatch" | "both_relationships";
  text: string;
};

/**
 * The `show` filter of api.discoveredLines. "new" is previous_placements_count
 * null while the report compares (totals.baseline "compared"); "fixing" is
 * issues non-empty; "listed" / "unlisted" is seller.status.
 */
export type DiscoveredShow = "direct" | "reseller" | "new" | "fixing" | "listed" | "unlisted";

/**
 * One discovered ads.txt line, which is the unit this page is built on.
 *
 * The first four fields ARE the line as it appears in the file, in file
 * order, and together they are its identity:
 *
 *   madeupmedia.com, 1042318, RESELLER, 4a7be0c1d9f23b58
 *   ssp_domain     publisher_id  relationship  cert_id
 *
 * cert_id is "" (never null) when the publisher's file omits the fourth
 * field, which is the majority case.
 */
export type DiscoveredLine = {
  ssp_domain: string;
  publisher_id: string;
  relationship: string;
  cert_id: string;
  /** Publishers carrying this exact line in this crawl. */
  placements_count: number;
  /**
   * The same count in the previous crawl, which is what the weekly delta
   * chip is computed from. Null means there is nothing to compare against:
   * either the line is new this week, or this is the first crawl.
   */
  previous_placements_count: number | null;
  /**
   * Embedded placements, which reports frozen before 2026-10-14 carry for
   * narrow lines (capped at 200). The page ignores it: the roster always
   * comes from api.discoveredLinePlacements, which serves the embedded one
   * for those older reports. Absent never means "no placements".
   */
  placements?: DiscoveredPlacement[];
  /** Different publishers carrying the line, each once whichever of its
   *  two files holds it (reports from 2026-10-11). Absent before, where
   *  placements_count counted files. */
  publishers_count?: number;
  previous_publishers_count?: number | null;
  /** Who brought the line (2026-10-11), see lib/discoveredOrigin.ts.
   *  Absent from an API that predates it, or a report with no watchlist. */
  origin?: "given" | "found_listed" | "found";
  origin_source?: string | null;
  origin_added_at?: string | null;
  given_as?: string;
  /** false: last week's report did not watch this line's domain, so the
   *  line is neither new nor moved (reports from 2026-10-11). */
  previous_watched?: boolean;
  /** The seller ID against the customer's own sellers.json, and what a
   *  publisher should fix (reports from 2026-10-14; absent before). */
  seller?: SellerCheck;
  issues?: LineIssue[];
};

/** The four fields that identify a line, for the placements endpoint. */
export type DiscoveredLineKey = {
  ssp_domain: string;
  publisher_id: string;
  relationship: string;
  cert_id: string;
};

/**
 * Crawl-wide (well, filter-wide) counts for the summary row. Backend
 * computes these over the filtered set; the client must not sum the rows,
 * which only cover lines that still exist this week.
 */
export type DiscoveredTotals = {
  lines: number;
  placements: number;
  /** Both null when there is no previous crawl to compare against. */
  previous_lines: number | null;
  previous_placements: number | null;
  /** Lines that did not exist last week (previous_placements_count null),
   *  over the whole filtered set. OPTIONAL: seeded in mock today; absent on
   *  live until the crawler sends it, and the page then leaves it out. */
  new_lines?: number | null;
  /** Different publishers carrying any line, each once (2026-10-11).
   *  Null under an SSP filter; absent on older reports. */
  publishers?: number | null;
  previous_publishers?: number | null;
  /** Lines the customer gave us, and the rest (2026-10-11). Absent when
   *  the report cannot say, or the list was cut. */
  given_lines?: number;
  found_lines?: number;
  /** Set when the totals count more lines than the list holds. */
  listed_lines?: number;
  /** Discovery domains last week's report did not watch (2026-10-11). */
  unwatched_domains?: string[];
  /** The discovery domains changed since last week (added or dropped):
   *  the totals are not compared. */
  scope_changed?: boolean;
  /** The customer's sellers.json the lines were checked against (reports
   *  from 2026-10-14). Null when the report has no file to check with. */
  sellers_json?: {
    url: string;
    sellers: number;
    read_at: string;
    listed_ids: number;
    unlisted_ids: number;
  } | null;
  /** Lines whose seller ID is, and is not, in that file; absent with no
   *  file. The Lines stat's caption, and nowhere else. */
  in_file_lines?: number;
  not_in_file_lines?: number;
  /** Lines with at least one issue. */
  needs_fixing?: number;
  /** Why last week is, or is not, compared (reports from 2026-10-14):
   *  "cut" when last week's list was cut short when that report was made,
   *  "none" on a first report. Absent before: the page reads
   *  previous_lines and the summary's previous_job_id instead. The
   *  discovery domains themselves come from the summary's
   *  watchlist.discover, not from here. */
  baseline?: "compared" | "cut" | "none";
};

export type DiscoveredLinesPage = {
  /** Present on a trial report: this list was cut (see ``TrialSlice``). */
  trial?: TrialSlice | null;
  /** The bake cut this list short (before 2026-10-11): the numbers count
   *  only what was kept. */
  cut?: boolean;
  page: number;
  page_size: number;
  total: number;
  totals: DiscoveredTotals;
  rows: DiscoveredLine[];
};

export type DiscoveredPlacementsPage = {
  page: number;
  page_size: number;
  total: number;
  rows: DiscoveredPlacement[];
};

/**
 * One file that made a declaration: whose domain, and which of their two
 * files said it. `file_kind` is the enum ("ads_txt" / "app_ads_txt"), so it
 * renders through fileLabel like every other file_kind on screen.
 */
export type DeclarationSource = {
  domain: string;
  file_kind: string;
};

/** One domain declared as an inventory partner, and by whom. */
export type IpdPartner = {
  partner_domain: string;
  /** Capped at 50; `declarer_total` is the honest count. */
  declared_by: DeclarationSource[];
  declarer_total: number;
};

/** One domain claimed as an owner domain, and by whom. */
export type OwnerClaim = {
  owner_domain: string;
  /** Capped at 50; `claimant_total` is the honest count. */
  claimed_by: DeclarationSource[];
  claimant_total: number;
};

/**
 * A seat found carrying a different relationship than the watchlist wants:
 * the file says DIRECT where the seat was sold as RESELLER, or the reverse.
 * `found_in` arrives display-ready ("ads.txt" / "app-ads.txt" / "both"),
 * unlike file_kind elsewhere.
 */
export type RelationshipMismatch = {
  developer_domain: string;
  ssp_domain: string;
  publisher_id: string;
  wanted_relationship: string;
  found_relationship: string;
  found_in: string;
  matched_via: string;
};

export type DeclarationsTotals = {
  ipd_partners: number;
  owner_domains: number;
  relationship_mismatches: number;
};

export type Declarations = {
  totals: DeclarationsTotals;
  ipd: IpdPartner[];
  owner_claims: OwnerClaim[];
  relationship_mismatches: RelationshipMismatch[];
};

/**
 * One declaration as a customer report freezes it: the Excel sheet's row.
 * `declaration` is "inventory partner", "owner domain" or "manager domain";
 * `found_in` arrives display-ready ("ads.txt" / "app-ads.txt"); `country`
 * is an ISO code for a country-scoped manager domain, else "".
 */
export type DeclarationRow = {
  declaration: string;
  declared_domain: string;
  declared_by: string;
  country?: string | null;
  found_in: string;
  /** This publisher did not make this declaration in this file last week.
   *  OPTIONAL: seeded in mock today; live reports omit it until the crawler
   *  diffs declarations against the previous crawl, and the page then shows
   *  no "new" at all. */
  is_new?: boolean | null;
};

export type DeclarationRowsPayload = {
  rows: DeclarationRow[];
  total: number;
  /** Present on a trial report: the rows were cut (see ``TrialSlice``). */
  trial?: TrialSlice | null;
};

/**
 * Either shape the endpoint has ever answered with. Read it through
 * `normalizeDeclarations` (lib/declarations.ts), never directly: links
 * minted before the customer-report era answer the grouped shape and must
 * keep opening.
 */
export type DeclarationsPayload = Declarations | DeclarationRowsPayload;

export type ChatFrame =
  | { type: "text"; delta: string }
  | { type: "tool_call"; name: string; args: unknown; result_preview: unknown }
  | { type: "done" }
  | { type: "error"; message: string };

// ---- schain export ----

/** One SDK in the customer's sellers.json. `seller_ids` are the IDs the
 *  customer gave it there (sid2): each one is a possible reseller line,
 *  `<customer domain>, <sid2>, RESELLER`. */
export type SchainSdk = {
  domain: string;
  name: string;
  seller_type: string;
  seller_ids: string[];
};

export type SchainOverview = {
  /** The customer's name as their reports say it, for the file's title. */
  customer_name: string;
  /** "off": this report has no schain page; the API then sends only
   *  `status`, every other field is absent. */
  status: "ok" | "no_sellers_json" | "no_sdks" | "off";
  /** The customer's domain: asi2 in every chain, and the first field of
   *  the reseller line. */
  reseller_domain: string;
  sellers_json_url: string;
  /** When the customer's sellers.json was read (bake time). */
  sellers_json_read_at: string;
  /** When the publisher files behind this report were crawled. */
  crawled_at: string;
  /** The SDKs in the customer's sellers.json that we can check: the ones
   *  on our list of popular SDKs whose own sellers.json we read. */
  sdks: SchainSdk[];
  /** How many popular SDKs we track, for "8 of 60". */
  sdk_catalog_size: number;
  seat_lines: MatchedSeatLine[];
  /** Schain downloads on this link. `selections` are the ones already
   *  taken (`sdk|seat|sid2`): downloading one of those again is free. */
  downloads: { used: number; limit: number; selections: string[] };
  /** On a trial: the preview is cut to this many rows, and export is locked. */
  trial?: { cap: number } | null;
};

/** `source`: "report" is the copy saved when the report was made; "live"
 *  a read made just now, on Refresh. */
export type SchainSdkRead =
  | {
      ok: true;
      domain: string;
      url: string;
      read_at: string;
      sellers_count: number;
      source: "report" | "live";
    }
  | { ok: false; domain: string; url: string; reason: string };

export type SchainSeatCount = {
  /** `ssp|publisher_id|REL`, the same key the seat-line filter uses. */
  seat: string;
  publishers: number;
  apps: number;
};

export type SchainSelection = {
  sdk: string;
  /** Seat line key, `ssp|publisher_id|REL`. */
  seat: string;
  /** The SDK's Seller ID in the customer's sellers.json. */
  sid2: string;
  /** Check step 3 against this link's live read of the SDK's file
   *  (after Refresh) rather than the copy saved with the report. */
  live?: boolean;
};

/** The four checks, counted in publishers, in the order they are made.
 *  Same four rows as the Summary sheet of the file. */
export type SchainFunnel = {
  seat_publishers: number;
  with_sdk_direct: number;
  owned_by_them: number;
  reseller_authorised: number;
};

/** One row of the Apps sheet: one app whose chain closes. An app whose
 *  publisher holds several valid accounts at the SDK lists them all in
 *  `sid1`, comma separated, exactly as the file writes it. */
export type SchainRow = {
  publisher_domain: string;
  app_name: string;
  store: string;
  bundle_id: string;
  /** "Mobile" or "CTV". */
  platform: string;
  category: string;
  asi1: string;
  sid1: string;
  asi2: string;
  sid2: string;
  store_url: string;
};

/** One publisher whose chain closes, for the publisher cards. */
export type SchainPublisherRow = {
  publisher_domain: string;
  apps: number;
  /** The accounts at the SDK that passed step 3. */
  valid_ids: string[];
  /** Every DIRECT account at the SDK on the file, valid or not. */
  ids_checked: number;
  seat_written: string;
  reseller_written: string;
  /** The valid DIRECT lines, as written. */
  direct_written: string[];
  file_url: string;
  found_in: string;
};

export type SchainPreview = {
  funnel: SchainFunnel;
  /** `valid_ids`: the publisher accounts at the SDK that passed step 3;
   *  `ids_checked`: every DIRECT id at the SDK on those publishers' files. */
  totals: { publishers: number; apps: number; valid_ids: number; ids_checked: number };
  page: number;
  page_size: number;
  /** Rows matching `q`, for the pager. */
  total: number;
  /** App rows, or publisher rows when asked with ``view=publishers``. */
  rows: SchainRow[] | SchainPublisherRow[];
  trial?: TrialSlice | null;
};

/** GET /v1/viewer/{token}/sellers-fix: frozen with the report when the
 *  customer's plan has the Sellers.json validator (never on a trial). */
export type SellersFixPayload = {
  file_checks?: import("./sellersFix").FileCheck[];
  /** The customer domain the sellers.json is published on. */
  domain: string;
  /** The file exactly as published; null when the domain serves none. */
  file: import("./sellersFix").SellersFile | null;
  /** Every line in the book naming the domain, one per seller ID and
   *  relationship. */
  sightings: import("./sellersFix").Sighting[];
  /** When the file was read, and where from (after redirects). */
  checked_at?: string | null;
  file_url?: string | null;
  /** What is wrong with the live file beyond its entries, in sentences. */
  file_warnings?: string[];
};


export type ChangeFilters = {
  event?: LineEventKind;
  ssp_domain?: string;
  lines?: string[];
  page?: number;
  page_size?: number;
  /** All / own / IPD (crawler #348); "all" is never sent. */
  match_type?: MatchTypeFilter;
};
function changeQuery({ lines, match_type, ...filters }: ChangeFilters): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== "") q.set(key, String(value));
  if (match_type && match_type !== "all") q.set("match_type", match_type);
  if (lines?.length) q.set(LINES_PARAM, serializeLines(lines));
  return q.toString();
}
export type ChangeGroup = Omit<
  import("./changeGroups").LocalChangeGroup,
  "publishers"
> & {
  publisher_count: number;
  /** Own or IPD (crawler #348); absent on reports frozen before it. */
  match_type?: MatchType;
};
export type ChangeKpi = {
  lines: number;
  placements: number;
  byEvent: LineEventCounts;
  publishers: number;
  apps: number;
};
export type ChangeGroupsPage = MatchTypeMeta & {
  page: number;
  page_size: number;
  total: number;
  rows: ChangeGroup[];
  counts: LineEventCounts;
  kpi: ChangeKpi;
  trial?: TrialSlice | null;
};
