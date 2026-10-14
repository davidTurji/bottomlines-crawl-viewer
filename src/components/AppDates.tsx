import {
  APP_DATE_COLUMNS,
  appDatesSentence,
  firstSeenHint,
  shownAppDates,
  type AppDateKey,
  type AppDates,
} from "@/lib/appDates";
import { cn } from "@/lib/utils";

type Row = AppDates & { inactive_since?: string | null };

/**
 * An app card's date columns (wide screens): one cell per column the LIST
 * shows (see appDateColumns), so the cards line up, with "—" where this
 * app has no such date. No columns, nothing rendered: an old report reads
 * as it always did.
 */
export function AppDateCells({ row, columns }: { row: Row; columns: AppDateKey[] }) {
  if (columns.length === 0) return null;
  const days = shownAppDates(row);
  return (
    <>
      {APP_DATE_COLUMNS.filter((c) => columns.includes(c.key)).map((c) => {
        const day = days[c.key];
        return (
          <div key={c.key} data-app-date={c.key} className="hidden w-[88px] whitespace-nowrap lg:block">
            <div className="text-[10px] font-medium tracking-wide text-slate-500">{c.label}</div>
            <div
              title={c.key === "first_seen_at" && day ? firstSeenHint(row.first_seen_source) : undefined}
              className={cn("text-sm tabular-nums", day ? "text-slate-700" : "text-slate-300")}
            >
              {day ?? "—"}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** The same dates in one quiet line, for screens too narrow for columns. */
export function AppDatesLine({ row, className }: { row: Row; className?: string }) {
  const text = appDatesSentence(row);
  if (!text) return null;
  return (
    <div data-app-dates-line className={cn("text-xs text-slate-400 lg:hidden", className)}>
      {text}
    </div>
  );
}
