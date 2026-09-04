import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import {
  ReadableReportScope,
  ReportNoticeCard,
  TokenReportScope,
} from "./components/ReportScopeRoutes";
import CrawlReport from "./routes/CrawlReport";
import CrawlChanges from "./routes/CrawlChanges";
import CrawlResults from "./routes/CrawlResults";
import "./index.css";

/**
 * Route tree. Two URL shapes, one set of pages:
 *
 *   /crawl-report/{token}            the original signed share link
 *   /{customer-slug}/{crawl-short-id}   the readable customer link
 *
 * Each shape is a scope route (see ReportScopeRoutes.tsx) whose element
 * supplies the share token and renders the shell; the three pages hang off
 * it as children, so both shapes render literally the same components.
 *
 * Every report page sits behind LoginGate: the app renders optimistically,
 * and the first 401 from a data endpoint swaps the page for the username +
 * password card (see LoginGate.tsx). Auth is a session cookie set by POST
 * /v1/viewer/auth — no Google OAuth, no client id, nothing identity-shaped
 * in the bundle.
 *
 * Route ranking, not ordering, keeps the two apart: react-router scores a
 * static segment above a dynamic one, so /crawl-report/xyz always matches
 * the tokened route and never /:slug/:shortId. The readable scope matches
 * exactly two segments plus its named children, so it cannot swallow an
 * arbitrary deep path either — those fall to the catch-all.
 */
const reportPages = (
  <>
    <Route index element={<CrawlReport />} />
    <Route path="changes" element={<CrawlChanges />} />
    <Route path="results" element={<CrawlResults />} />
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

      {/* Anything else — a one-segment path, a deep path under no report —
          gets the same honest dead-end card rather than a blank screen. */}
      <Route
        path="*"
        element={
          <ReportNoticeCard message="This report link is not valid or has expired." />
        }
      />
    </Routes>
  </BrowserRouter>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{tree}</React.StrictMode>,
);
