import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";

import Layout from "./components/Layout";
import CrawlReport from "./routes/CrawlReport";
import CrawlChanges from "./routes/CrawlChanges";
import CrawlResults from "./routes/CrawlResults";
import { MOCK } from "./lib/api";
import "./index.css";

const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined) ??
  // Mock mode never actually calls Google, but the provider still
  // wants a non-empty string to not warn loudly at boot.
  (MOCK ? "mock-client-id.apps.googleusercontent.com" : "");

const tree = (
  <BrowserRouter>
    <Routes>
      {/* Landing auto-redirects to the demo report so the reviewer sees
          the shell without clicking anything. */}
      <Route path="/" element={<Navigate to="/crawl-report/demo-token" replace />} />
      <Route
        path="/crawl-report/:token"
        element={
          <Layout>
            <CrawlReport />
          </Layout>
        }
      />
      <Route
        path="/crawl-report/:token/changes"
        element={
          <Layout>
            <CrawlChanges />
          </Layout>
        }
      />
      <Route
        path="/crawl-report/:token/results"
        element={
          <Layout>
            <CrawlResults />
          </Layout>
        }
      />
    </Routes>
  </BrowserRouter>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{tree}</GoogleOAuthProvider>
  </React.StrictMode>,
);
