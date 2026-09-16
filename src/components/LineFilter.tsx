/**
 * The seat-line dropdown: pick one or more of the customer's lines and
 * the page narrows to them. Multi-select, stays open while ticking, one
 * "All lines" row to clear. Same pill grammar as the filter bar's select,
 * so it sits beside a search box or on its own in a header without
 * looking like a different control.
 *
 * ── WHY THE SELECTION IS COMMITTED ON CLOSE ──────────────────────
 *
 * Every tick used to call `onChange` straight through, and `onChange`
 * writes `?lines=` in the URL. The pages read that param in a dependency
 * array, so one tick refetched the summary, the previous summary, the
 * matched publishers and the matched apps. A reader picking six lines
 * fired all of that six times over, each round on a bigger filter than
 * the last, and the answers raced each other home. THAT is why the filter
 * felt slow: not one slow query, but six rounds of queries nobody asked
 * for, five of which were for selections the reader was still in the
 * middle of making.
 *
 * So ticks are now local state. They paint instantly (the boxes and the
 * count on the pill are the draft), and the committed selection is
 * written ONCE, when the menu closes. Six ticks, one refetch.
 *
 * The draft is discarded if it comes back equal to what is already
 * applied, so opening the menu and closing it again refetches nothing.
 */
import { useEffect, useState } from "react";

import { Check, ChevronsUpDown, ListFilter, Loader2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MatchedSeatLine } from "@/lib/api";
import { lineKey, lineLabel } from "@/lib/lineFilter";
import { cn } from "@/lib/utils";

/** One size for this control and the Export button beside it: the two
 *  read as a pair, and a label that changes must never move the row. */
export const HEADER_PILL = "h-9 w-[176px]";

/** Same members, order ignored. */
const sameSelection = (a: string[], b: string[]) =>
  a.length === b.length && a.every((k) => b.includes(k));

export function LineFilter({
  seats,
  selected,
  onChange,
  busy = false,
  className,
}: {
  /** The customer's watchlist, as the report was built from it. */
  seats: MatchedSeatLine[];
  selected: string[];
  onChange: (keys: string[]) => void;
  /**
   * True while the page is refetching under the committed selection. The
   * pill swaps its icon for a spinner and says so, because the filter can
   * take several seconds on a big crawl and a control that looks idle
   * while it works reads as a control that did not register the click.
   */
  busy?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // The ticks in flight. Seeded from the applied selection every time the
  // menu opens, so it can never drift from the URL (a back button, a link
  // carrying ?lines=, another page's filter).
  const [draft, setDraft] = useState<string[]>(selected);
  useEffect(() => {
    if (!open) setDraft(selected);
  }, [open, selected]);

  if (seats.length === 0) return null;
  const chosen = new Set(draft);
  const count = draft.length;
  // Never the line itself on the button: a count keeps the control one
  // size whatever is picked.
  const label = count === 0 ? "All lines" : `${count} of ${seats.length} lines`;

  const toggle = (key: string) => {
    setDraft((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  // One commit, on close, and only when something actually changed.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && !sameSelection(draft, selected)) onChange(draft);
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Filter by seat line"
          aria-busy={busy}
          className={cn(
            HEADER_PILL,
            "flex flex-shrink-0 items-center gap-2 rounded-full border bg-white px-3.5 text-xs font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-50",
            count > 0 ? "border-primary/50" : "border-border",
            className,
          )}
        >
          {/* Same 14px box either way, so the spinner never nudges the
              label across as it appears. */}
          {busy ? (
            <Loader2
              aria-hidden
              className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-primary motion-reduce:animate-none"
            />
          ) : (
            <ListFilter
              aria-hidden
              className={cn("h-3.5 w-3.5 flex-shrink-0", count > 0 ? "text-primary" : "text-slate-400")}
            />
          )}
          <span className="flex-shrink-0 font-normal text-slate-400">Lines</span>
          <span className="min-w-0 flex-1 truncate text-left">
            {busy ? "Filtering..." : label}
          </span>
          <ChevronsUpDown aria-hidden className="h-3 w-3 flex-shrink-0 opacity-40" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="text-[11px] font-medium text-slate-500">
          Show only publishers and apps carrying
        </DropdownMenuLabel>
        {seats.map((s) => {
          const key = lineKey(s);
          const on = chosen.has(key);
          return (
            <DropdownMenuItem
              key={key}
              // Keep the menu open: the reader is ticking several.
              onSelect={(e) => {
                e.preventDefault();
                toggle(key);
              }}
              role="menuitemcheckbox"
              aria-checked={on}
              className="gap-2.5 font-mono text-[12px]"
            >
              {/* An empty box that fills when picked, always visible, so
                  the state of every line is readable at a glance. */}
              <span
                aria-hidden
                className={cn(
                  "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                  on ? "border-primary bg-primary" : "border-slate-300 bg-white",
                )}
              >
                {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </span>
              <span className="truncate">{lineLabel(s)}</span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setDraft([]);
          }}
          disabled={count === 0}
          className="gap-2.5 text-[12px]"
        >
          <span
            aria-hidden
            className={cn(
              "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border",
              count === 0 ? "border-primary bg-primary" : "border-slate-300 bg-white",
            )}
          >
            {count === 0 && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
          </span>
          All lines
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
