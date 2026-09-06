import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";

import Layout from "./Layout";
import LoginGate from "./LoginGate";
import { api, ApiError } from "@/lib/api";
import { ReportScopeContext, useReportScope } from "@/lib/reportScope";
import { isReservedFirstSegment } from "@/lib/reservedPaths";
import {
  EXPIRED_LINK_MESSAGE,
  ReportNoticeCard,
} from "@/components/ReportNoticeCard";

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
  | { status: "timeout" }
  | { status: "unreachable" };

/**
 * How long to wait for the resolve call before giving the reader a way
 * out. This one request sits in front of the entire app, so a backend
 * that accepts the connection and then stalls would otherwise pin the
 * reader to a spinner with no exit.
 */
const RESOLVE_TIMEOUT_MS = 20_000;

/**
 * /:slug/:shortId — the readable customer link, e.g. /selectmedia/0904-0644.
 *
 * One resolve call up front, then the token behaves exactly as it does on
 * the tokened routes. The resolve endpoint is public (it hands out a share
 * token, it does not read report data), so the password gate still happens
 * afterwards in LoginGate, unchanged.
 *
 * The route is greedy by construction, so a reserved first segment is
 * turned away before any network call happens: see reservedPaths.ts.
 */
export function ReadableReportScope() {
  const { slug = "", shortId = "" } = useParams();
  const reserved = isReservedFirstSegment(slug);
  const [state, setState] = useState<Resolution>({ status: "resolving" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    // A reserved segment is an app path, not a customer slug. Never
    // resolve it; the render below falls through to the catch-all card.
    if (reserved) return;

    let cancelled = false;
    let timedOut = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, RESOLVE_TIMEOUT_MS);

    setState({ status: "resolving" });
    api
      .resolve(slug, shortId, controller.signal)
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
        // The abort we armed ourselves: the server never answered, which
        // is a "try again", not a verdict on the link.
        if (timedOut) {
          setState({ status: "timeout" });
          return;
        }
        // A 4xx means this slug/short-id pair is not a report we know
        // about, whatever flavour of 4xx it is: 404 no such report, 410
        // gone, 403 revoked, and 401 too, because resolve takes no
        // credentials so it can never mean "wrong password". Anything
        // else (network failure, 5xx) is our problem, not the reader's,
        // and says so.
        const status = err instanceof ApiError ? err.status : 0;
        setState(
          status >= 400 && status < 500
            ? { status: "missing" }
            : { status: "unreachable" },
        );
      })
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug, shortId, reserved, attempt]);

  if (reserved) return <ReportNoticeCard message={EXPIRED_LINK_MESSAGE} />;
  if (state.status === "resolving") return <ResolvingScreen />;
  if (state.status === "missing") {
    return <ReportNoticeCard message={EXPIRED_LINK_MESSAGE} />;
  }
  if (state.status === "timeout") {
    return (
      <ReportNoticeCard
        title="Still opening your report"
        message="The server is taking longer than usual to answer. Please try again."
        action={{ label: "Try again", onClick: retry }}
        footer="If this keeps happening, let your account contact know."
      />
    );
  }
  if (state.status === "unreachable") {
    return (
      <ReportNoticeCard
        title="Report unavailable"
        message="Could not reach the server. Please try again in a moment."
        action={{ label: "Try again", onClick: retry }}
        footer="If this keeps happening, let your account contact know."
      />
    );
  }

  return <ReportShell token={state.token} basePath={`/${slug}/${shortId}`} />;
}

/**
 * Waiting screen shown while the readable URL is being turned into a
 * token. Labelled, not a bare spinner: the reader clicked a link to a
 * report and should be told that is what is happening.
 */
function ResolvingScreen() {
  return (
    <div
      className="flex min-h-screen min-h-[100dvh] w-full items-center justify-center bg-muted/40 px-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">
            Opening your report...
          </p>
          <p className="mt-1 text-xs text-slate-500">
            This usually takes a moment.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Child route for any path under a report that is not one of its pages.
 *
 * A mistyped sub-path such as /selectmedia/0904-0644/chnages is a typo
 * inside a link that is perfectly valid, so telling the reader it has
 * expired is a lie. Send them to the report's overview instead.
 */
export function ReportSubpathRedirect() {
  const { basePath } = useReportScope();
  return <Navigate to={basePath || "/"} replace />;
}
