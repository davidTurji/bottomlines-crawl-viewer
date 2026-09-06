import bottomlineSidebarLogo from "@/assets/bottomline-sidebar-logo.png";

/**
 * Terminal-state card for a link that resolves to nothing, plus the
 * retryable variant used when the resolve call times out.
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
          <img
            src={bottomlineSidebarLogo}
            alt="bottomline.ai"
            draggable={false}
            className="h-12 w-auto object-contain object-left select-none"
          />
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

/** The one message every dead, revoked or expired link shows. */
export const EXPIRED_LINK_MESSAGE =
  "This report link is not valid or has expired.";

export default ReportNoticeCard;
