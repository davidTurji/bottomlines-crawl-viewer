import { FormEvent, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { api, ApiError, MOCK, onDeadLink, onUnauthorized } from "@/lib/api";
import { useReportScope } from "@/lib/reportScope";
import {
  EXPIRED_LINK_MESSAGE,
  ReportNoticeCard,
} from "@/components/ReportNoticeCard";

/**
 * Username + password gate in front of the viewer.
 *
 * The gate is optimistic: it renders the app immediately and only locks
 * when a data endpoint answers 401 (registered via onUnauthorized in
 * api.ts). That keeps the happy path — a live session cookie — free of
 * an extra round trip on every page load. On successful sign-in the
 * children remount (epoch key bump) so every page refetches with the
 * fresh session cookie instead of showing its stale error state.
 *
 * Two failures, two different answers, and telling them apart is the
 * whole point of the dead-link branch:
 *
 *   401  the report exists, these credentials do not open it   -> form
 *   404  there is no report behind this token any more         -> card
 *
 * A revoked or expired report used to reach the form and be told the
 * username and password did not match, which sent the reader off to
 * retype a password that could never work. It now gets the same
 * expired-link card the readable scope route shows.
 *
 * MOCK mode never 401s, so the gate is invisible there by construction.
 */
export default function LoginGate({ children }: { children: React.ReactNode }) {
  const { token } = useReportScope();
  const [locked, setLocked] = useState(false);
  const [dead, setDead] = useState(false);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    onUnauthorized(() => setLocked(true));
    onDeadLink(() => setDead(true));
    return () => {
      onUnauthorized(null);
      onDeadLink(null);
    };
  }, []);

  if (dead && !MOCK) {
    return <ReportNoticeCard message={EXPIRED_LINK_MESSAGE} />;
  }

  if (locked && !MOCK) {
    return (
      <LoginCard
        token={token}
        onAuthed={() => {
          setLocked(false);
          setEpoch((e) => e + 1);
        }}
        onDeadLink={() => setDead(true)}
      />
    );
  }

  return <div key={epoch} className="contents">{children}</div>;
}

/**
 * The centered sign-in card. Same visual language as the app shell:
 * white card on the muted ground, racing-green primary accent, the
 * Bottomlines wordmark on top. Sentence case throughout.
 */
function LoginCard({
  token,
  onAuthed,
  onDeadLink: onDead,
}: {
  token: string;
  onAuthed: () => void;
  onDeadLink: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await api.auth(token, username.trim(), password);
      onAuthed();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      // 404 no such report, 410 it was there and is gone, 403 the token
      // was revoked. None of the three is a credentials problem, and no
      // password the reader could type would change the answer, so they
      // all get the expired-link card instead of the form's error line.
      if (status === 404 || status === 410 || status === 403) {
        onDead();
        return;
      }
      if (status === 401) {
        setError("That username and password did not match. Please try again.");
      } else {
        setError("Could not reach the server. Please try again in a moment.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative isolate flex min-h-screen min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-background px-4">
      {/* The console's sign-in bloom, drawn from the primary token rather
          than a colour of its own, so the canvas still reads as paper. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(42% 42% at 82% 30%, hsl(var(--primary) / 0.08), transparent 70%)",
        }}
      />
      <div className="w-full max-w-sm animate-auth-rise">
        {/* THE PRODUCT NAME, SET IN TYPE, NOT PRINTED FROM A LOGO.
            Both logo assets in the brand kit carry a WHITE wordmark, drawn
            for the dark sidebar rail. On this white card the mark rendered
            and the word did not, so the screen showed a floating "b" above
            blank space. The console's own sign-in never had that problem
            because it never used the lockup: it sets the name as display
            type and tints one word with the primary token, which is what
            this now does. */}
        <div className="mb-6">
          <h1
            className="font-display text-[2rem] font-semibold leading-[1.05] tracking-[-0.028em] text-slate-900"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Path <span className="text-primary">Finder</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            by bottomlines.ai
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
          <h2 className="font-display text-lg font-semibold tracking-tight text-slate-900">
            Sign in to your crawl report
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Use the username and password we shared with you.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-700">
                Username
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-700">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-xs text-critical"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !username.trim() || !password}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              <Lock className="h-3.5 w-3.5" />
              {busy ? "Signing in" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          This report is private to your team.
        </p>
      </div>
    </div>
  );
}
