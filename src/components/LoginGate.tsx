import { FormEvent, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import AuthHero3D from "@/components/AuthHero3D";
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
 * The centered sign-in card. Mirrors the bottomlines admin console's own
 * sign-in: the radial primary bloom behind, the product name set as display
 * type with one word tinted and underlined, a single white card on the muted
 * ground, racing-green primary accent. Branded PathFinder, kept minimal.
 * Sentence case throughout.
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
      try {
        // The account menu shows WHO signed in; this is its only source.
        // Session-scoped and keyed by token, so two reports in two tabs
        // never borrow each other's identity.
        sessionStorage.setItem(`pf.username.${token}`, username.trim());
      } catch {
        // Storage blocked: the menu shows no identity line, never a fake.
      }
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
    <div className="relative isolate min-h-[100svh] w-full overflow-hidden bg-background text-slate-900 antialiased">
      {/* THE ADMIN CONSOLE'S SIGN-IN, VERBATIM IN STRUCTURE. David's spec,
          his words: "exactly like admin console" -- so this is that room,
          not a homage to it. Left: the two-line display headline with the
          brand word tinted and swept-underlined, one muted subline, then
          the credentials where the console puts its sign-in buttons.
          Right: the same extruded 3D b (AuthHero3D, ported verbatim from
          the console, which ported it from the marketing hero). No logo
          lockup anywhere -- the b IS the brand on this screen. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(42% 42% at 82% 30%, hsl(var(--primary) / 0.08), transparent 70%)",
        }}
      />
      <style>{`
        @keyframes pfFadeUp {
          from { opacity: 0; transform: translate3d(0, 14px, 0) }
          to   { opacity: 1; transform: translate3d(0, 0, 0) }
        }
        .pf-up    { animation: pfFadeUp 700ms cubic-bezier(0.16, 1, 0.3, 1) both }
        .pf-up.d1 { animation-delay: 90ms }
        .pf-up.d2 { animation-delay: 180ms }
        .pf-up.d3 { animation-delay: 270ms }
        @keyframes pfUnderline { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        .pf-underline { animation: pfUnderline 1200ms cubic-bezier(0.22, 0.7, 0.2, 1) 500ms both; }
        @media (prefers-reduced-motion: reduce) {
          .pf-up, .pf-underline { animation: none }
        }
      `}</style>

      <main className="relative mx-auto flex min-h-[100svh] w-full max-w-[76rem] items-center px-6 py-8 sm:px-10 lg:px-16">
        {/* The admin's grid, with one correction our longer slogan forces:
            the b's column is a GUARANTEED minmax(420px,520px), because the
            fr-pair let the nowrap headline shove the mark down to 190px --
            measured -- which on screen read as the b simply missing. The
            words scale; the mark does not shrink. */}
        <div className="grid w-full items-center gap-10 lg:grid-cols-[1fr_minmax(420px,520px)] lg:gap-16">
          <div className="text-left">
            <h1
              className="pf-up d1 font-semibold leading-[1.02] tracking-[-0.028em] text-slate-900"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <span className="block text-[clamp(26px,4.2vw,50px)] sm:whitespace-nowrap">
                Govern your supply path.
              </span>
              <span className="mt-1 block text-[clamp(26px,4.2vw,50px)] sm:whitespace-nowrap">
                Own your{" "}
                <span className="relative inline-block">
                  <span className="text-primary">bottomlines</span>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -bottom-[0.08em] left-0 right-0 block h-[0.09em] overflow-hidden"
                  >
                    <span className="pf-underline block h-full origin-left rounded-full bg-primary/70" />
                  </span>
                </span>
                .
              </span>
            </h1>

            <p className="pf-up d2 mt-5 max-w-[30rem] text-[15.5px] leading-[1.55] text-slate-500">
              The weekly record of who carries your seats.
            </p>

            <form onSubmit={submit} className="pf-up d3 mt-7 max-w-[420px] space-y-3">
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
                  className="h-11 w-full rounded-md border border-border bg-card px-3.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
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
                  className="h-11 w-full rounded-md border border-border bg-card px-3.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
                />
              </label>

              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-critical-border bg-critical-bg px-3 py-2 text-xs text-critical"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || !username.trim() || !password}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                <Lock className="h-3.5 w-3.5" />
                {busy ? "Signing in" : "Sign in"}
              </button>
              <p className="text-[13px] leading-relaxed text-slate-400">
                Use the username and password we shared with you.
              </p>
            </form>
          </div>

          {/* RIGHT — the 3D b mark, in the ADMIN LOGIN'S EXACT BOX,
              because the box is the fix: AuthHero3D fills its parent, and
              the previous wrapper had no intrinsic height, so the mark
              rendered into zero pixels -- present in the DOM, invisible on
              screen, "it's not there" in the owner's words, and he was
              right. aspect-square IS the height. Same breakpoint as the
              admin too (md, not lg): on a phone the headline does the
              work. */}
          <div className="relative mx-auto hidden aspect-square w-full max-w-[380px] pf-up d2 sm:max-w-[440px] md:block lg:mx-0 lg:max-w-[520px]">
            <AuthHero3D />
          </div>
        </div>
      </main>
    </div>
  );
}
