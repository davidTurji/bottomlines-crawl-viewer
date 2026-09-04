import { createContext, useContext } from "react";

/**
 * The report a page is currently rendering, decoupled from how the URL
 * spelled it.
 *
 * Two URL shapes reach the same three pages:
 *
 *   /crawl-report/{token}[/changes|/results]     the signed share link
 *   /{customer-slug}/{crawl-short-id}[/...]      the readable link
 *
 * Pages used to read `token` straight off useParams(), which only exists
 * in the first shape. They now read it from here instead, so the readable
 * routes can resolve the token once (GET /v1/viewer/resolve) and hand the
 * identical value down.
 *
 * `basePath` is the prefix every in-app link must be built from, so a
 * reader who arrived on a readable URL keeps readable URLs as they click
 * around, and a reader on a tokened URL keeps tokened ones.
 */
export type ReportScope = {
  /** Share token, the value every /v1/viewer/... call is keyed by. */
  token: string;
  /** URL prefix for this report in the shape the reader arrived on. */
  basePath: string;
};

export const ReportScopeContext = createContext<ReportScope | null>(null);

/**
 * Read the active report scope. Falls back to empty strings rather than
 * throwing: a component rendered outside a scope (none today, but the
 * shell is shared) should degrade to inert links, not crash the page.
 */
export function useReportScope(): ReportScope {
  return useContext(ReportScopeContext) ?? { token: "", basePath: "" };
}
