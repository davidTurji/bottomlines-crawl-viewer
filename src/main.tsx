import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import {
  ReadableReportScope,
  ReportSubpathRedirect,
  TokenReportScope,
} from "./components/ReportScopeRoutes";
import {
  EXPIRED_LINK_MESSAGE,
  ReportNoticeCard,
} from "./components/ReportNoticeCard";
import CrawlReport from "./routes/CrawlReport";
import CrawlChanges from "./routes/CrawlChanges";
import CrawlDiscovered from "./routes/CrawlDiscovered";
import "./index.css";

/**
 * Route tree. Two URL shapes, one set of pages:
 *
 *   /crawl-report/{token}            the original signed share link
 *   /{customer-slug}/{crawl-short-id}   the readable customer link
 *
 * Each shape is a scope route (see ReportScopeRoutes.tsx) whose element
 * supplies the share token and renders the shell; every page hangs off it as
 * a child, so both shapes render literally the same components. A page added
 * to reportPages below is therefore reachable under both URL shapes at once,
 * which is why "discovered" needed one line rather than two.
 *
 * Every report page sits behind LoginGate: the app renders optimistically,
 * and the first 401 from a data endpoint swaps the page for the username +
 * password card (see LoginGate.tsx). Auth is a session cookie set by POST
 * /v1/viewer/auth — no Google OAuth, no client id, nothing identity-shaped
 * in the bundle.
 *
 * Route ranking, not ordering, keeps the two apart: react-router scores a
 * static segment above a dynamic one, so /crawl-report/xyz always matches
 * the tokened route and never /:slug/:shortId. /:slug/:shortId is still
 * greedy about everything else, though, so two things fence it in:
 *
 *   - reserved first segments (src/lib/reservedPaths.ts) are never read
 *     as a customer slug, so a missing /assets/... chunk falling through
 *     nginx's SPA rule cannot fire a resolve call or render the shell;
 *   - the trailing "*" child below turns a mistyped sub-path under a real
 *     report into a redirect to that report's overview, rather than the
 *     dead-end card, which would be a lie about a link that works.
 */
const reportPages = (
  <>
    <Route index element={<CrawlReport />} />
    <Route path="changes" element={<CrawlChanges />} />
    <Route path="discovery" element={<CrawlDiscovered />} />
    {/* The page was called "Discovered lines" and lived at /discovered
        until it was renamed. Kept as a redirect rather than dropped: a
        share link a customer already has in their inbox must not break
        because we renamed a page. */}
    <Route path="discovered" element={<Navigate to="../discovery" replace />} />
    {/* Unknown sub-path of a valid report: the link is fine, the page
        name is not. Send the reader to the overview. This is also what
        now catches /results, the retired Matched inventory page, so an
        older share link lands on the overview instead of a dead end. */}
    <Route path="*" element={<ReportSubpathRedirect />} />
  </>
);

const tree = (
  <BrowserRouter>
    <Routes>
      {/* Landing auto-redirects to the demo report so the reviewer sees
          the shell without clicking anything. */}
      <Route path="/" element={<Navigate to="/crawl-report/demo-token" replace />} />

      <Route path="/crawl-report/:token" element={<TokenReportScope />}>
        {reportPages}
      </Route>

      <Route path="/:slug/:shortId" element={<ReadableReportScope />}>
        {reportPages}
      </Route>

      {/* Anything else — a one-segment path, or a reserved first segment
          the router was handed because no real file matched — gets the
          same honest dead-end card rather than a blank screen. */}
      <Route path="*" element={<ReportNoticeCard message={EXPIRED_LINK_MESSAGE} />} />
    </Routes>
  </BrowserRouter>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{tree}</React.StrictMode>,
);
