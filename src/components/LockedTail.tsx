import { Lock } from "lucide-react";

import ContactUs from "@/components/ContactUs";
import type { TrialCaps, TrialSlice } from "@/lib/api";

/**
 * The end of every list on a trial report, on every tab and every page.
 *
 * It replaces the pager: there is no next page to turn to, and saying so
 * honestly is the point. When the server kept rows back, the number that
 * matters is the one behind the cut, so it leads; when a tab holds fewer
 * rows than the cut (nothing hidden, or nothing at all), the card still
 * stands, because the way to the full report must never depend on which
 * tab the reader happens to be on. The server decides what is hidden; this
 * only says it.
 */
export default function LockedTail({
  slice,
  caps,
  noun,
  detail,
}: {
  /** The server's stamp for this list, when the response carried one. */
  slice: TrialSlice | null;
  /** The trial's caps from the summary: present on every page of a trial. */
  caps: TrialCaps | null;
  /** Plural noun for the rows: "matched publishers", "discovered lines". */
  noun: string;
  /** What the full list carries, finished as a sentence fragment after
   *  "every": "line, every app and every change, week after week". */
  detail?: string;
}) {
  if (!slice && !caps) return null;
  const hidden = slice ? Math.max(0, slice.full_total - slice.shown) : 0;
  const carries = detail
    ? ` The full report carries every ${detail}.`
    : " The full report carries all of them, and what changes week after week.";

  return (
    <div className="mt-4 overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-white to-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          {hidden > 0 && slice ? (
            <>
              <p className="font-display text-[17px] font-semibold leading-snug tracking-tight text-slate-900">
                {hidden.toLocaleString()} more {noun} are waiting in your full report.
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                This trial shows {slice.shown.toLocaleString()} of{" "}
                {slice.full_total.toLocaleString()} {noun} for your domain.
                {carries}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-[17px] font-semibold leading-snug tracking-tight text-slate-900">
                This is the trial view of your {noun}.
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                Every list on this trial is cut to its first rows.{carries}
              </p>
            </>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ContactUs
              label={
                hidden > 0 && slice
                  ? `Show me all ${slice.full_total.toLocaleString()}`
                  : "Unlock the full report"
              }
            />
            <span className="text-[12px] text-slate-500">
              One call, your full report on screen.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
