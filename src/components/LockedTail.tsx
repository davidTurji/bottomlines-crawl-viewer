import { Lock } from "lucide-react";

import ContactUs from "@/components/ContactUs";
import type { TrialSlice } from "@/lib/api";

/**
 * The end of a capped list on a trial report.
 *
 * It replaces the pager: there is no next page to turn to, and saying so
 * honestly is the point. The number that matters is the one behind the
 * cut, so it leads; the rows above it are real rows about the reader's
 * own domain, which is what makes the rest worth asking for.
 */
export default function LockedTail({
  slice,
  noun,
  detail,
}: {
  slice: TrialSlice;
  /** Plural noun for the rows: "matched publishers", "discovered lines". */
  noun: string;
  /** What the full list carries, finished as a sentence fragment after
   *  "every": "line, every app and every change, week after week". */
  detail?: string;
}) {
  const hidden = Math.max(0, slice.full_total - slice.shown);
  if (slice.full_total <= slice.shown) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-white to-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] font-semibold leading-snug tracking-tight text-slate-900">
            {hidden.toLocaleString()} more {noun} are waiting in your full report.
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
            This trial shows the first {slice.shown.toLocaleString()} of{" "}
            {slice.full_total.toLocaleString()} {noun} for your domain.
            {detail
              ? ` The full report carries every ${detail}.`
              : " The full report carries all of them, and what changes week after week."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ContactUs label={`Show me all ${slice.full_total.toLocaleString()}`} />
            <span className="text-[12px] text-slate-500">
              One call, your full report on screen.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
