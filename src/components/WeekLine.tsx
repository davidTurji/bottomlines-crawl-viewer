import { cn } from "@/lib/utils";

/**
 * WHICH WEEK THIS REPORT IS, AS A SENTENCE.
 *
 * This replaces the pill that used to sit in the top right of every page:
 * a bordered, shadowed chip with a calendar glyph reading "Aug 25, 2026".
 * It was styled exactly like the console's date-range control and like the
 * filter pills further down these same pages, so it read as something you
 * could open and change. Nothing about a crawl report is selectable: a
 * report IS one crawl, of one week, and the link the customer opens is
 * bound to that crawl. The chip therefore advertised an interaction that
 * did not exist, and the first thing a new reader did was click it.
 *
 * So: no border, no shadow, no icon, no hit area. Plain muted text that
 * states the week and what it is measured against, which is the only thing
 * the chip ever actually said.
 */
export function WeekLine({
  week,
  previousWeek,
  className,
}: {
  week: string | null;
  previousWeek?: string | null;
  className?: string;
}) {
  if (!week) return null;
  return (
    <p className={cn("text-[13px] text-slate-500", className)}>
      Week of <span className="font-medium text-slate-700">{week}</span>
      {previousWeek ? (
        <>
          , compared with{" "}
          <span className="font-medium text-slate-700">{previousWeek}</span>
        </>
      ) : (
        <>, the first crawl, with no prior week to compare</>
      )}
    </p>
  );
}

export function formatWeek(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
