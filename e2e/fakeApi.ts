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
import type { InactiveKind } from "../src/lib/api";
import {
  MOCK_CHECKED_AT,
  MOCK_SELLERS_DOMAIN,
  mockSellerSightings,
  mockSellersFile,
} from "../src/lib/mockSellers";

// mockDiscoveredLines reads ?discovery= from the page URL; in Node there is
// no page, so give it an empty one.
const g = globalThis as unknown as { window?: { location: { search: string } } };
if (!g.window) g.window = { location: { search: "" } };

export const TOKEN = "e2e-token";

/** How each optional part of the report answers. Defaults: a full report. */
export type Scenario = {
  /** "page": has a Sellers.json page. "none": 404 (the common case). */
  sellers?: "page" | "none" | "error";
  /** "ok": schain on. "none": off, 200 {status:"off"} as the real route
   *  answers. "no_sdks": on, nothing to check. Its sub-routes answer 404
   *  when off or on an older snapshot (viewer_schain._block). */
  schain?: "ok" | "none" | "no_sdks" | "error";
  /** false: this crawl discovered nothing (total 0). */
  discovery?: boolean;
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
};

const TRIAL_CAPS = { publishers: 3, apps: 3, declarations: 3, discovered_lines: 3 };

function cut<T>(rows: T[], cap: number, total: number) {
  return { rows: rows.slice(0, cap), trial: { cap, shown: Math.min(cap, rows.length, total), full_total: total } };
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
export type Calls = { method: string; path: string; status: number }[];

export async function installFakeApi(page: Page, scenario: Scenario = {}): Promise<Calls> {
  const s: Required<Scenario> = {
    sellers: "none",
    schain: "none",
    discovery: true,
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
    ...scenario,
  };
  let signedIn = !s.signedOut && !s.expired;
  const calls: Calls = [];

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, "");
    const q = url.searchParams;
    const page_ = Number(q.get("page") ?? 1);
    const lines = (q.get("lines") ?? "")
      .split(",")
      .filter(Boolean)
      .map((k) => decodeURIComponent(k));

    const reply = (status: number, body: unknown) => {
      calls.push({ method: req.method(), path, status });
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

    switch (tail) {
      case "summary": {
        if (q.get("crawl_id")) {
          if (s.previousWeek === "none") return reply(503, { detail: "This report is not available yet." });
          if (s.previousWeek === "error") return reply(500, { detail: "boom" });
          return reply(200, mockPreviousSummary);
        }
        const full = mockSummaryFor(lines);
        const withGone = s.gone ? full : { ...full, gone: undefined };
        const sum = s.inactive === "ok" ? withGone : { ...withGone, inactive_counts: undefined };
        return reply(200, s.trial ? { ...sum, trial: TRIAL_CAPS } : sum);
      }
      case "export-info":
        if (s.exportInfo === "none") return notFound();
        if (s.trial || s.exportInfo === "trial")
          return reply(200, { format: "none", line_export: false, trial: true });
        return reply(200, { format: "xlsx", line_export: true, excel_row_limit: 1_048_576 });
      case "developer-events": {
        const event = (q.get("event") ?? "added") as "added" | "removed" | "changed";
        const r = mockDeveloperEvents(event, page_, lines);
        return reply(200, s.trial ? { ...r, page: 1, ...cut(r.rows, TRIAL_CAPS.publishers, r.total) } : r);
      }
      case "line-events": {
        const filters: Record<string, unknown> = {};
        for (const [k, v] of q.entries()) if (k !== "lines") filters[k] = /^\d+$/.test(v) ? Number(v) : v;
        if (filters.developer_id !== undefined) {
          const rows = linesForDeveloper(Number(filters.developer_id));
          return reply(200, { page: 1, page_size: rows.length || 1, total: rows.length, rows });
        }
        return reply(200, mockLineEvents(filters as Parameters<typeof mockLineEvents>[0]));
      }
      case "matched-developers": {
        const r = mockMatchedDevelopers(page_, q.get("q") ?? "", lines);
        return reply(200, s.trial ? { ...r, page: 1, ...cut(r.rows, TRIAL_CAPS.publishers, r.total) } : r);
      }
      case "matched-bundles": {
        return reply(200, mockMatchedBundles(page_, q.get("q") ?? ""));
      }
      case "matched-apps": {
        const r = mockMatchedApps(page_, q.get("q") ?? "", lines);
        return reply(200, s.trial ? { ...r, page: 1, ...cut(r.rows, TRIAL_CAPS.apps, r.total) } : r);
      }
      case "discovered-lines": {
        if (!s.discovery) return reply(200, { page: 1, page_size: Number(q.get("page_size") ?? 50), total: 0, rows: [] });
        const r = mockDiscoveredLines({
          page: page_,
          page_size: Number(q.get("page_size") ?? 50),
          ssp_domain: q.get("ssp_domain") ?? undefined,
        });
        return reply(200, s.trial ? { ...r, page: 1, ...cut(r.rows, TRIAL_CAPS.discovered_lines, r.total) } : r);
      }
      case "discovered-lines/placements":
        return reply(
          200,
          mockDiscoveredLinePlacements(
            {
              ssp_domain: q.get("ssp_domain") ?? "",
              publisher_id: q.get("publisher_id") ?? "",
              relationship: (q.get("relationship") ?? "DIRECT") as "DIRECT",
              cert_id: q.get("cert_id") ?? "",
            },
            { page: page_, page_size: Number(q.get("page_size") ?? 100) },
          ),
        );
      case "declarations":
        return reply(
          200,
          s.trial
            ? { ...mockDeclarationRows, ...cut(mockDeclarationRows.rows, TRIAL_CAPS.declarations, mockDeclarationRows.total) }
            : mockDeclarationRows,
        );
      case "inactive": {
        if (s.inactive === "missing") return notFound();
        const kind = (q.get("kind") ?? "publishers") as InactiveKind;
        const opts = { page: page_, q: q.get("q") ?? "", lines };
        if (s.inactive === "legacy") {
          return reply(200, pageFromGone(s.gone ? mockGone : null, kind, { ...opts, pageSize: Number(q.get("page_size") ?? 50) }));
        }
        return reply(200, mockInactive(kind, opts, s.trial));
      }
      case "sellers-fix":
        if (s.sellers === "none") return notFound("This report has no sellers.json page.");
        if (s.sellers === "error") return reply(503, { detail: "not available yet" });
        return reply(200, {
          domain: MOCK_SELLERS_DOMAIN,
          file: mockSellersFile,
          sightings: mockSellerSightings,
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
