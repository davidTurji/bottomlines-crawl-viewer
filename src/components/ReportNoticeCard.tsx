
import { Link2Off } from "lucide-react";
import AuthHero3D from "@/components/AuthHero3D";

/**
 * Terminal-state screens: the expired-link screen for a link that opens
 * nothing any more, and the retryable card used when the resolve call
 * times out or the server cannot be reached.
 *
 * It lives in its own module (rather than next to the scope routes) so
 * LoginGate can render it for a dead share token without importing
 * ReportScopeRoutes, which imports LoginGate right back.
 *
 * Copy rules: sentence case, no em dashes.
 */
export function ReportNoticeCard({
  title = "Report unavailable",
  message,
  action,
  footer = "Check the link you were sent, or ask your account contact for a new one.",
}: {
  title?: string;
  message: string;
  action?: { label: string; onClick: () => void };
  footer?: string;
}) {
  return (
    <div className="flex min-h-screen min-h-[100dvh] w-full items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm animate-auth-rise">
        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
          {/* PathFinder set in type on this light card. The brand asset is a
              light/white lockup drawn for the dark sidebar rail, so it would
              vanish on white; the sign-in screen sets the name in type for
              the same reason, and this matches it. */}
          <div className="flex items-center">
            <span
              className="font-display text-xl font-semibold leading-none tracking-[-0.02em] text-slate-900"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Path<span className="text-primary">Finder</span>
            </span>
          </div>
          <h1 className="mt-5 font-display text-lg font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{message}</p>
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="mt-5 flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {action.label}
            </button>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">{footer}</p>
      </div>
    </div>
  );
}

/** The one headline every dead, revoked or expired link shows. */
export const EXPIRED_LINK_TITLE = "This link has expired";

/** The one message every dead, revoked or expired link shows. */
export const EXPIRED_LINK_MESSAGE =
  "The report behind this link is no longer available.";

/** What the reader can do about it: only the sender can issue a new link. */
export const EXPIRED_LINK_CONTACT =
  "If you still need it, please contact the person who sent you this link.";

/**
 * The expired-link screen (David, 2026-11-02: "show a nice expired screen,
 * in bottomlines system theme").
 *
 * One screen for every link that opens nothing any more: expired, turned
 * off, or its crawl deleted. The API cannot tell them apart for us on
 * purpose (sign-in answers 403, the readable path 404, for all of them),
 * and the reader's remedy is the same in each case: ask the sender.
 *
 * It is the sign-in screen's room, so a dead link still looks like
 * Bottomlines: the same ivory ground and racing-green bloom, the same
 * display headline, and on wider screens the same 3D b on the right. On a
 * phone the b is hidden, as on the sign-in, and the PathFinder wordmark
 * above the headline carries the brand instead.
 */
export function ExpiredLinkScreen() {
  return (
    <div className="relative isolate min-h-[100svh] w-full overflow-hidden bg-background text-slate-900 antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(42% 42% at 82% 30%, hsl(var(--primary) / 0.08), transparent 70%)",
        }}
      />
      <main className="relative mx-auto flex min-h-[100svh] w-full max-w-[76rem] items-center px-6 py-8 sm:px-10 lg:px-16">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[1fr_minmax(420px,520px)] lg:gap-16">
          <div className="animate-auth-rise text-left">
            <span
              className="mb-6 block text-xl font-semibold leading-none tracking-[-0.02em] text-slate-900 md:hidden"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Path<span className="text-primary">Finder</span>
            </span>
            <span
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/15 bg-accent text-primary"
            >
              <Link2Off className="h-5 w-5" />
            </span>
            <h1
              className="mt-6 text-[clamp(28px,4.2vw,50px)] font-semibold leading-[1.05] tracking-[-0.028em] text-slate-900"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {EXPIRED_LINK_TITLE}
            </h1>
            <p className="mt-4 max-w-[30rem] text-[15.5px] leading-[1.55] text-slate-500">
              {EXPIRED_LINK_MESSAGE}
            </p>
            <p className="mt-7 max-w-[420px] rounded-md border border-border bg-card px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm">
              {EXPIRED_LINK_CONTACT}
            </p>
          </div>

          {/* The sign-in screen's b, in the sign-in screen's box: it fills
              its parent, and aspect-square is what gives the box a height. */}
          <div className="relative mx-auto hidden aspect-square w-full max-w-[380px] animate-auth-rise sm:max-w-[440px] md:block lg:mx-0 lg:max-w-[520px]">
            <AuthHero3D />
          </div>
        </div>
      </main>
    </div>
  );
}

export default ReportNoticeCard;
