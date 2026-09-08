const BASE = (import.meta.env.VITE_API_BASE as string) ?? "/api";

// ── Mock mode ─────────────────────────────────────────────────────
// Turned on with ``VITE_MOCK=true`` at ``vite dev`` start. Every
// function head short-circuits to a deterministic mock, no backend
// required, useful for UI-only reviews and screenshots.
// The mock adapter lives in src/lib/mockData.ts.
export const MOCK = (import.meta.env.VITE_MOCK as string | undefined) === "true";

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

// ── 404 fan-out (dead share token) ───────────────────────────────
// A revoked, deleted or expired report answers 404, not 401: there is
// no report behind the token, so there are no credentials that would
// open it. Sending that reader to the sign-in card would have them
// retype a password that can never work, so it trips its own handler
// and the gate shows the expired-link card instead.
//
// Only the token-scoped endpoints (/v1/viewer/{token}/...) count. The
// resolve endpoint is deliberately excluded: it has no token yet, and
// the readable scope route already renders the expired card itself.
let deadLinkHandler: (() => void) | null = null;
export function onDeadLink(handler: (() => void) | null) {
  deadLinkHandler = handler;
}

const TOKEN_SCOPED = /^\/v1\/viewer\/[^/]+\/.+$/;

// ── Auth epoch ───────────────────────────────────────────────────
// Guards against a stale-401 re-lock race: a data request fired
// before sign-in can come back 401 *after* the login succeeded, and
// must not throw the freshly signed-in user back to the gate. Each
// request captures the epoch at call start; a successful auth bumps
// it, so any 401 from a pre-login in-flight request sees a mismatched
// epoch and stays silent (the page still gets its ApiError).
let authEpoch = 0;

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const epochAtStart = authEpoch;
  // Path without its query string, so the two exemptions below compare
  // whole endpoints. A prefix test would misfire on a share token that
  // happens to start with "resolve" (/v1/viewer/resolveXYZ/summary) and
  // silently switch the sign-in gate off for that reader.
  const endpoint = path.split("?")[0];
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) {
    // A dead token: no report to sign in to, so the gate shows the
    // expired-link card rather than the password form.
    if (res.status === 404 && TOKEN_SCOPED.test(endpoint)) {
      deadLinkHandler?.();
    }
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
    if (MOCK) return { ok: true, email: "you@publisherstudios.com", customer_id: 42 };
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
   * Same-origin URL of the CUSTOMER workbook for this run: the xlsx the
   * crawler bakes per crawl, the same file the Overview's "Export results"
   * button hands the reader. A plain link target, not a fetch, so the
   * download is an ordinary navigation the browser saves, and the httpOnly
   * session cookie rides along because BASE is same-origin ("/api").
   *
   * MOCK mode has no backend, so the button short-circuits to a small stub
   * rather than pointing at this (see CrawlReport's ExportResultsButton).
   */
  exportUrl: (token: string) => `${BASE}/v1/viewer/${token}/export.xlsx`,
  summary: async (token: string) => {
    if (MOCK) {
      const { mockSummary } = await import("./mockData");
      return mockSummary;
    }
    return req<Summary>("GET", `/v1/viewer/${token}/summary`);
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
    event: "added" | "removed" | "changed",
    page = 1,
  ) => {
    if (MOCK) {
      const { mockDeveloperEvents } = await import("./mockData");
      return mockDeveloperEvents(event, page);
    }
    return req<DeveloperEventsPage>(
      "GET",
      `/v1/viewer/${token}/developer-events?event=${event}&page=${page}&page_size=50`,
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
    } = {},
  ) => {
    if (MOCK) {
      const { mockLineEvents } = await import("./mockData");
      return mockLineEvents(filters);
    }
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    }
    return req<LineEventsPage>(
      "GET",
      `/v1/viewer/${token}/line-events?${q.toString()}`,
    );
  },
  matchedDevelopers: async (token: string, page = 1) => {
    if (MOCK) {
      const { mockMatchedDevelopers } = await import("./mockData");
      return mockMatchedDevelopers(page);
    }
    return req<MatchedDevelopersPage>(
      "GET",
      `/v1/viewer/${token}/matched-developers?page=${page}&page_size=100`,
    );
  },
  matchedBundles: async (token: string, page = 1) => {
    if (MOCK) {
      const { mockMatchedBundles } = await import("./mockData");
      return mockMatchedBundles(page);
    }
    return req<MatchedBundlesPage>(
      "GET",
      `/v1/viewer/${token}/matched-bundles?page=${page}&page_size=100`,
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
   */
  matchedApps: async (token: string, page = 1) => {
    if (MOCK) {
      const { mockMatchedApps } = await import("./mockData");
      return mockMatchedApps(page);
    }
    return req<MatchedAppsPage>(
      "GET",
      `/v1/viewer/${token}/matched-apps?page=${page}&page_size=100`,
    );
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
   * "carambola.com, 1042318, RESELLER" appears on four hundred publishers
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
   *         "ssp_domain": "carambola.com",
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
   *       ?ssp_domain=carambola.com    (all four required, EXACT match)
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
   *   with total 0 is, because 404 on a token-scoped path trips the
   *   dead-share-link handler above and would throw the reader out of a
   *   report that is perfectly alive.
   */
  discoveredLines: async (
    token: string,
    opts: { page?: number; page_size?: number; ssp_domain?: string } = {},
  ) => {
    if (MOCK) {
      const { mockDiscoveredLines } = await import("./mockData");
      return mockDiscoveredLines(opts);
    }
    const q = new URLSearchParams();
    q.set("page", String(opts.page ?? 1));
    q.set("page_size", String(opts.page_size ?? 50));
    if (opts.ssp_domain) q.set("ssp_domain", opts.ssp_domain);
    return req<DiscoveredLinesPage>(
      "GET",
      `/v1/viewer/${token}/discovered-lines?${q.toString()}`,
    );
  },
  /**
   * Every publisher carrying one discovered line, for the card expansion.
   * Only called when the list response did not embed `placements`, i.e. for
   * the wide lines, which are the ones worth a round trip.
   */
  discoveredLinePlacements: async (
    token: string,
    key: DiscoveredLineKey,
    opts: { page?: number; page_size?: number } = {},
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
  declarations: async (token: string) => {
    if (MOCK) {
      const { mockDeclarations } = await import("./mockData");
      return mockDeclarations;
    }
    return req<Declarations>("GET", `/v1/viewer/${token}/declarations`);
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

export type Summary = {
  crawl_id: number;
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
  };
};

export type DeveloperEvent = {
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

export type DeveloperEventsPage = {
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
  | "first_appearance";

/** Counts keyed by every event kind, as the API sends them. */
export type LineEventCounts = Record<LineEventKind, number>;

export type LineEvent = {
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
   *  independent book. Set only on `newly_monitored` rows, and only when
   *  the book knows: null means "we cannot say", never "it is new". */
  first_seen_at?: string | null;
  /** How this row was tied to the developer: found in their own file
   *  ("file"), through an inventorypartnerdomain declaration ("ipd"), or in
   *  a subdomain's file ("subdomain"). Absent on old data means "file". */
  matched_via?: "file" | "ipd" | "subdomain";
  /** Domains whose files declared this row's developer as their inventory
   *  partner. Can be non-empty even when matched_via is "file": a developer
   *  can be both crawled directly and vouched for. Capped at 25. */
  ipd_declared_by?: string[];
};

export type LineEventsPage = {
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
export type MatchedSeatLine = {
  ssp_domain: string;
  publisher_id: string;
  relationship: string;
  /** "" or absent when the file omits the fourth field, the majority case. */
  cert_id?: string;
};

export type MatchedDeveloper = {
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
};

export type MatchedDevelopersPage = {
  page: number;
  page_size: number;
  total: number;
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
};

export type MatchedBundlesPage = {
  page: number;
  page_size: number;
  total: number;
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
export type MatchedApp = {
  store: string;
  bundle_id: string;
  app_name: string;
  /** The publisher that owns this app: its domain, and optionally a name. */
  owner_domain: string;
  owner_name?: string | null;
  line_count: number;
  /**
   * This app's weekly change, so the matched-apps list can offer the same
   * Added / Removed / Changed tabs the publishers list has. All absent or
   * zero means the app matched but did not move this week, and it then sits
   * under "All matched" only.
   */
  lines_added?: number;
  lines_removed?: number;
  lines_cert_changed?: number;
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
};

export type MatchedAppsPage = {
  page: number;
  page_size: number;
  total: number;
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
 * One discovered ads.txt line, which is the unit this page is built on.
 *
 * The first four fields ARE the line as it appears in the file, in file
 * order, and together they are its identity:
 *
 *   carambola.com, 1042318, RESELLER, 4a7be0c1d9f23b58
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
   * Embedded placements, present only for narrow lines (see the contract
   * note on api.discoveredLines). Absent means "ask the placements
   * endpoint", it never means "this line has no placements".
   */
  placements?: DiscoveredPlacement[];
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
};

export type DiscoveredLinesPage = {
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

export type ChatFrame =
  | { type: "text"; delta: string }
  | { type: "tool_call"; name: string; args: unknown; result_preview: unknown }
  | { type: "done" }
  | { type: "error"; message: string };
