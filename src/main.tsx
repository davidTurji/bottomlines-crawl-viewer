import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import LoginGate from "./components/LoginGate";
import CrawlReport from "./routes/CrawlReport";
import CrawlChanges from "./routes/CrawlChanges";
import CrawlResults from "./routes/CrawlResults";
import "./index.css";

/**
 * Route tree. Every report page sits behind LoginGate: the app renders
 * optimistically, and the first 401 from a data endpoint swaps the page
 * for the username + password card (see LoginGate.tsx). Auth is a
 * session cookie set by POST /v1/viewer/auth — no Google OAuth, no
 * client id, nothing identity-shaped in the bundle.
 */
const page = (el: React.ReactNode) => (
  <LoginGate>
    <Layout>{el}</Layout>
  </LoginGate>
);

const tree = (
  <BrowserRouter>
    <Routes>
      {/* Landing auto-redirects to the demo report so the reviewer sees
          the shell without clicking anything. */}
      <Route path="/" element={<Navigate to="/crawl-report/demo-token" replace />} />
      <Route path="/crawl-report/:token" element={page(<CrawlReport />)} />
      <Route path="/crawl-report/:token/changes" element={page(<CrawlChanges />)} />
      <Route path="/crawl-report/:token/results" element={page(<CrawlResults />)} />
    </Routes>
  </BrowserRouter>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{tree}</React.StrictMode>,
);
