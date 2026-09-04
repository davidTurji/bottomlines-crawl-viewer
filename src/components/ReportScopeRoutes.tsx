import { useEffect, useMemo, useState } from "react";
import { Outlet, useParams } from "react-router-dom";

import Layout from "./Layout";
import LoginGate from "./LoginGate";
import { api, ApiError } from "@/lib/api";
import { ReportScopeContext } from "@/lib/reportScope";
import bottomlineSidebarLogo from "@/assets/bottomline-sidebar-logo.png";

/**
 * The two route scopes that front the report pages.
 *
 * Both end in the exact same tree — ReportScopeContext, then the
 * unchanged LoginGate + Layout + page. They differ only in where the
 * share token comes from:
 *
 *   TokenScope     reads it straight off the URL (/crawl-report/:token)
 *   ReadableScope  resolves it once from /:slug/:shortId
 *
 * Keeping the shell in one place is what guarantees "renders exactly the
 * same pages": there is no second copy of the gate or the layout to drift.
 */

function ReportShell({ token, basePath }: { token: string; basePath: string }) {
  const scope = useMemo(() => ({ token, basePath }), [token, basePath]);
  return (
    <ReportScopeContext.Provider value={scope}>
      <LoginGate>
        <Layout>
          <Outlet />
        </Layout>
      </LoginGate>
    </ReportScopeContext.Provider>
  );
}

/** /crawl-report/:token — the original signed share link, unchanged. */
export function TokenReportScope() {
  const { token = "" } = useParams();
  return <ReportShell token={token} basePath={`/crawl-report/${token}`} />;
}

type Resolution =
  | { status: "resolving" }
  | { status: "ready"; token: string }
  | { status: "missing" }
  | { status: "unreachable" };

/**
 * /:slug/:shortId — the readable customer link, e.g. /selectmedia/0904-0644.
 *
 * One resolve call up front, then the token behaves exactly as it does on
 * the tokened routes. The resolve endpoint is public (it hands out a share
 * token, it does not read report data), so the password gate still happens
 * afterwards in LoginGate, unchanged.
 */
export function ReadableReportScope() {
  const { slug = "", shortId = "" } = useParams();
  const [state, setState] = useState<Resolution>({ status: "resolving" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "resolving" });
    api
      .resolve(slug, shortId)
      .then((res) => {
        if (cancelled) return;
        setState(
          res?.token
            ? { status: "ready", token: res.token }
            : { status: "missing" },
        );
      })
      .catch((err) => {
        if (cancelled) return;
        // A 4xx means this slug/short-id pair is not a report we know
        // about. Anything else (network failure, 5xx) is our problem, not
        // the reader's, and says so.
        const status = err instanceof ApiError ? err.status : 0;
        setState(
          status >= 400 && status < 500
            ? { status: "missing" }
            : { status: "unreachable" },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [slug, shortId]);

  if (state.status === "resolving") return <ResolvingScreen />;
  if (state.status === "missing") {
    return <ReportNoticeCard message="This report link is not valid or has expired." />;
  }
  if (state.status === "unreachable") {
    return (
      <ReportNoticeCard message="Could not reach the server. Please try again in a moment." />
    );
  }

  return <ReportShell token={state.token} basePath={`/${slug}/${shortId}`} />;
}

/** Spinner shown while the readable URL is being turned into a token. */
function ResolvingScreen() {
  return (
    <div
      className="flex min-h-screen min-h-[100dvh] w-full items-center justify-center bg-muted/40 px-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
        <p className="text-sm text-slate-500">Opening your report</p>
      </div>
    </div>
  );
}

/**
 * Terminal state card for a link that resolves to nothing. Same visual
 * language as the sign-in card so the two read as one product.
 */
export function ReportNoticeCard({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen min-h-[100dvh] w-full items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm animate-auth-rise">
        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
          <img
            src={bottomlineSidebarLogo}
            alt="bottomline.ai"
            draggable={false}
            className="h-12 w-auto object-contain object-left select-none"
          />
          <h1 className="mt-5 font-display text-lg font-semibold tracking-tight text-slate-900">
            Report unavailable
          </h1>
          <p className="mt-1 text-sm text-slate-500">{message}</p>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Check the link you were sent, or ask your account contact for a new one.
        </p>
      </div>
    </div>
  );
}
