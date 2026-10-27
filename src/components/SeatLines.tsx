/**
 * SEAT LINES, ONE LOOK (David, 2026-10-27): an expanded row on the
 * Overview and an expanded card on the Changes page open the same way,
 * load the same way and print their rows the same way. These are the
 * pieces both pages build that list from, so the two can never drift:
 *
 *   - SeatLinesHead      the title on the left, the count on the right
 *                        (an action, such as Export, beside the count);
 *   - SeatLinesFrame     the white, hairline-bordered list;
 *   - SEAT_ROW / LineNo  each row's box, led by a quiet gutter number like
 *                        a code editor's line numbers (1, 2, 3 ... the
 *                        row's place in its own list, monospace, muted,
 *                        right-aligned; it restarts per list and runs on
 *                        across the pages of one list);
 *   - RowText / RowNote  the row's mono text and the small notes under it;
 *   - SeatLinesSkeleton  the loading state, in the frame's own shape and
 *                        the theme's muted tone (Skeleton), never a word.
 */
import type { CSSProperties, ReactNode } from "react";

import { Skeleton } from "@/components/Skeleton";
import { cn } from "@/lib/utils";

/**
 * One row's box: the gutter number, the text, the margin.
 *
 * ALIGNED BY LINE BOX, NOT BY BASELINE (David, 2026-10-27: the numbers sat
 * off their line, worst on a row with a "first seen" line under it). The
 * line text truncates, and an element that clips its overflow gives a flex
 * row no baseline, so ``items-baseline`` lined the number up with the NEXT
 * line, or with the row's bottom. Now every item starts at the top and
 * the gutter, the line and the margin labels share one 16px line box and
 * the line's 11px mono size, so the number sits on the line's baseline.
 */
export const SEAT_ROW = "flex items-start gap-3 px-3 py-1.5";

/** The one line box every first line of a row shares. */
export const ROW_LINE = "text-[11px] leading-4";

/** The quiet margin labels at a row's right edge (the file, the host). */
export const ROW_MARGIN = "flex-shrink-0 text-[10px] leading-4 text-slate-400";

/** How many digits the gutter holds: four at least, so "1" and "1000"
 *  right-align in one fixed column and the lines start at one x on every
 *  row of every list; more only past 9,999. */
export function gutterDigits(last: number): number {
  return Math.max(4, String(Math.max(1, Math.floor(last))).length);
}

/** The gutter number. Decorative for a screen reader: the row reads as
 *  its line, not as "seven". */
export function LineNo({ n, digits }: { n: number; digits: number }) {
  return (
    <span
      aria-hidden
      data-line-no
      className="flex-shrink-0 select-none text-right font-mono text-[11px] leading-4 tabular-nums text-slate-400"
      style={{ width: `${Math.max(4, digits)}ch` }}
    >
      {n}
    </span>
  );
}

/** The block's heading: title left, count right, an action beside it. */
export function SeatLinesHead({
  title,
  count,
  action,
  className,
}: {
  title: ReactNode;
  count: number;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-1 flex min-h-[18px] items-center justify-between gap-3", className)}>
      <span className="text-xs font-medium text-slate-700">{title}</span>
      <span className="flex flex-shrink-0 items-center gap-2">
        {action}
        <span data-seat-lines-count className="font-mono text-[11px] tabular-nums text-slate-500">
          {count.toLocaleString()}
        </span>
      </span>
    </div>
  );
}

/** The white list every seat-line block prints its rows in. */
export function SeatLinesFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul data-seat-lines className={cn("bl-lines-in divide-y divide-border rounded-md border border-border bg-white", className)}>
      {children}
    </ul>
  );
}

/** A row's main text, in the report's one line grammar (mono, 11px). The
 *  element marked `data-line-text` is what reads as the row's link.
 *  THE LINE READS IN FULL ON A PHONE (David, 2026-10-27: "st...",
 *  "streamvan..." at 390 px): there it wraps, anywhere if it must (a long
 *  cert has no spaces); from the sm breakpoint up it keeps one line, cut
 *  with an ellipsis, as before. */
export function RowText({
  children,
  muted,
  as: Tag = "code",
}: {
  children: ReactNode;
  muted?: boolean;
  as?: "code" | "span";
}) {
  return (
    <Tag
      data-line-text
      className={cn(
        "block font-mono text-[11px] leading-4 tabular-nums [overflow-wrap:anywhere] sm:truncate",
        muted ? "text-slate-500" : "text-slate-800",
      )}
    >
      {children}
    </Tag>
  );
}

/** A small note under a row's text: a reason (darker) or dates. */
export function RowNote({
  children,
  tone = "dates",
  title,
  ...data
}: {
  children: ReactNode;
  tone?: "reason" | "dates";
  title?: string;
} & { [k: `data-${string}`]: boolean | string | undefined }) {
  return (
    <div
      {...data}
      title={title}
      className={cn("text-[10px] leading-snug", tone === "reason" ? "text-slate-600" : "text-slate-500")}
    >
      {children}
    </div>
  );
}

const stagger = (i: number): CSSProperties => ({ "--bl-delay": `${i * 90}ms` }) as CSSProperties;

/**
 * The block while its rows are on the way: the heading's two ends, then
 * the frame with a few rows, each a gutter, a line and the margin label,
 * at the real rows' height, so the rows land where their outlines were.
 */
export function SeatLinesSkeleton({ rows = 4, label }: { rows?: number; label: string }) {
  const widths = ["w-[46%]", "w-[38%]", "w-[52%]", "w-[42%]", "w-[34%]"];
  return (
    <div role="status" aria-live="polite" aria-busy="true" data-seat-lines-skeleton className="animate-in fade-in duration-500">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="mb-1 flex min-h-[18px] items-center justify-between gap-3">
        <Skeleton className="h-3 w-32 rounded-md" />
        <Skeleton className="h-3 w-6 rounded-md" style={stagger(1)} />
      </div>
      <ul aria-hidden className="divide-y divide-border rounded-md border border-border bg-white">
        {Array.from({ length: Math.max(1, rows) }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-[9px]">
            <Skeleton className="h-2.5 w-[1ch] flex-shrink-0 rounded-sm" style={stagger(i)} />
            <Skeleton className={cn("h-2.5 rounded-md", widths[i % widths.length])} style={stagger(i)} />
            <Skeleton className="ml-auto h-2.5 w-20 flex-shrink-0 rounded-md" style={stagger(i + 1)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
