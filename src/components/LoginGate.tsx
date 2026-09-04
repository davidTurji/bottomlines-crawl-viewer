import { FormEvent, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { api, ApiError, MOCK, onUnauthorized } from "@/lib/api";
import { useReportScope } from "@/lib/reportScope";
import bottomlineSidebarLogo from "@/assets/bottomline-sidebar-logo.png";

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
 * MOCK mode never 401s, so the gate is invisible there by construction.
 */
export default function LoginGate({ children }: { children: React.ReactNode }) {
  const { token } = useReportScope();
  const [locked, setLocked] = useState(false);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    onUnauthorized(() => setLocked(true));
    return () => onUnauthorized(null);
  }, []);

  if (locked && !MOCK) {
    return (
      <LoginCard
        token={token}
        onAuthed={() => {
          setLocked(false);
          setEpoch((e) => e + 1);
        }}
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
}: {
  token: string;
  onAuthed: () => void;
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
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setError("That username and password did not match. Please try again.");
      } else {
        setError("Could not reach the server. Please try again in a moment.");
      }
    } finally {
      setBusy(false);
    }
  };

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
            Sign in to your crawl report
          </h1>
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
