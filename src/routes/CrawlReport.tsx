import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { api, ApiError, type Summary } from "../lib/api";
import HeroWidget from "../components/HeroWidget";
import DeveloperDrilldown from "../components/DeveloperDrilldown";
import MatchedTables from "../components/MatchedTables";
import ChatDrawer from "../components/ChatDrawer";

type State =
  | { kind: "loading" }
  | { kind: "needs_auth"; message?: string }
  | { kind: "auth_error"; message: string }
  | { kind: "ready"; summary: Summary; email: string }
  | { kind: "error"; message: string };

export default function CrawlReport() {
  const { token = "" } = useParams();
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = () => {
    setState({ kind: "loading" });
    api
      .summary(token)
      .then((summary) =>
        setState({
          kind: "ready",
          summary,
          email: "",
        }),
      )
      .catch((e: ApiError) => {
        if (e.status === 401) setState({ kind: "needs_auth" });
        else setState({ kind: "error", message: e.message });
      });
  };

  useEffect(load, [token]);

  const login = useGoogleLogin({
    flow: "implicit",
    onSuccess: async (resp) => {
      // GIS "implicit" gives an access token; we actually need an ID token.
      // For the ID token flow, prefer the credential from GoogleLogin button.
      // Fallback: if only an access token is returned, exchange via userinfo endpoint.
      const idToken = (resp as { id_token?: string }).id_token;
      if (!idToken) {
        setState({
          kind: "auth_error",
          message: "Google returned no ID token. Use the Sign in with Google button.",
        });
        return;
      }
      try {
        await api.auth(token, idToken);
        load();
      } catch (e) {
        setState({ kind: "auth_error", message: (e as Error).message });
      }
    },
    onError: () =>
      setState({ kind: "auth_error", message: "Google sign-in failed. Try again." }),
  });

  if (state.kind === "loading") {
    return (
      <Shell>
        <p className="text-muted-foreground">Loading your crawl…</p>
      </Shell>
    );
  }

  if (state.kind === "needs_auth" || state.kind === "auth_error") {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="font-display text-2xl font-semibold">Sign in to view this report</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with the Google account that receives your Bottomlines Crawl reports.
          </p>
          <div className="mt-6 flex justify-center">
            <GoogleSignInButton
              token={token}
              onDone={(err) => {
                if (err) setState({ kind: "auth_error", message: err });
                else load();
              }}
            />
          </div>
          {state.kind === "auth_error" && (
            <p className="mt-4 text-sm text-critical">{state.message}</p>
          )}
          <p className="mt-6 text-xs text-muted-foreground">
            (Fallback popup:{" "}
            <button
              onClick={() => login()}
              className="underline decoration-dotted"
            >
              use the popup flow
            </button>
            )
          </p>
        </div>
      </Shell>
    );
  }

  if (state.kind === "error") {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-xl border border-critical-border bg-critical-bg p-6 text-center">
          <h1 className="font-display text-lg font-semibold text-critical">
            Couldn't load this report
          </h1>
          <p className="mt-2 text-sm">{state.message}</p>
        </div>
      </Shell>
    );
  }

  const summary = state.summary;

  return (
    <Shell>
      <header className="mb-6">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">
          Bottomlines Crawl — weekly report
        </p>
        <h1 className="font-display text-3xl font-semibold">
          Crawl #{summary.crawl_id}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {summary.source === "weekly"
            ? "Automatic weekly crawl"
            : summary.source === "on_demand"
              ? "On-demand crawl"
              : summary.source}
          {" · "}
          {summary.counters.developer_count.toLocaleString()} developers scanned{" · "}
          {summary.counters.matched.lines.toLocaleString()} matched lines
        </p>
      </header>

      <div className="space-y-6">
        <HeroWidget summary={summary} />
        <DeveloperDrilldown token={token} />
        <MatchedTables token={token} />
      </div>

      <ChatDrawer token={token} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </div>
  );
}

// Google sign-in button component — uses GIS "One Tap"-style rendered button
// which returns an ID token directly (unlike the useGoogleLogin implicit flow).
function GoogleSignInButton({
  token,
  onDone,
}: {
  token: string;
  onDone: (err: string | null) => void;
}) {
  useEffect(() => {
    const gis = (window as unknown as { google?: any }).google;
    if (!gis?.accounts?.id) return;
    gis.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string,
      callback: async (resp: { credential: string }) => {
        try {
          await api.auth(token, resp.credential);
          onDone(null);
        } catch (e) {
          onDone((e as Error).message);
        }
      },
    });
    gis.accounts.id.renderButton(document.getElementById("gis-btn"), {
      theme: "filled_black",
      size: "large",
      text: "signin_with",
      shape: "pill",
    });
  }, [token, onDone]);
  return <div id="gis-btn" />;
}
