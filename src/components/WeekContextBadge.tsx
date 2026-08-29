import { CalendarClock } from "lucide-react";
import type { Summary } from "@/lib/api";

/**
 * Persistent temporal context, rendered in every page header:
 *
 *   [ Week of Aug 25 2026 · compared to Week of Aug 18 2026 ]
 *
 * David asked for the current-crawl-plus-previous-crawl relationship
 * to be visible everywhere. Same chrome as the retention pill on the
 * console pages: subtle border, muted foreground, hairline icon.
 */
export default function WeekContextBadge({
  summary,
  previousWeekOf,
}: {
  summary: Summary;
  previousWeekOf?: string | null;
}) {
  const week = summary.finished_at
    ? formatWeek(new Date(summary.finished_at))
    : `#${summary.crawl_id}`;
  const prev = previousWeekOf ?? null;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white/60 px-3 py-1 text-[12px] text-slate-600 shadow-sm">
      <CalendarClock className="h-3.5 w-3.5 text-primary" />
      <span>
        <span className="font-medium text-slate-800">Week of {week}</span>
        {prev ? (
          <>
            {" · vs "}
            <span className="text-slate-800">Week of {prev}</span>
          </>
        ) : (
          <>{" · first crawl (no prior week yet)"}</>
        )}
      </span>
    </div>
  );
}

export function formatWeek(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
