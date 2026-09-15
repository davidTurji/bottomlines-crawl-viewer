/**
 * The seat-line dropdown: pick one or more of the customer's lines and
 * the page narrows to them. Multi-select, stays open while ticking, one
 * "All lines" row to clear. Same pill grammar as the filter bar's select,
 * so it sits beside a search box or on its own in a header without
 * looking like a different control.
 */
import { Check, ChevronsUpDown, ListFilter } from "lucide-react";

/** One size for this control and the Export button beside it: the two
 *  read as a pair, and a label that changes must never move the row. */
export const HEADER_PILL = "h-9 w-[176px]";

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

export function LineFilter({
  seats,
  selected,
  onChange,
  className,
}: {
  /** The customer's watchlist, as the report was built from it. */
  seats: MatchedSeatLine[];
  selected: string[];
  onChange: (keys: string[]) => void;
  className?: string;
}) {
  if (seats.length === 0) return null;
  const chosen = new Set(selected);
  const count = selected.length;
  // Never the line itself on the button: a count keeps the control one
  // size whatever is picked.
  const label = count === 0 ? "All lines" : `${count} of ${seats.length} lines`;

  const toggle = (key: string) => {
    if (chosen.has(key)) onChange(selected.filter((k) => k !== key));
    else onChange([...selected, key]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Filter by seat line"
          className={cn(
            HEADER_PILL,
            "flex flex-shrink-0 items-center gap-2 rounded-full border bg-white px-3.5 text-xs font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-50",
            count > 0 ? "border-primary/50" : "border-border",
            className,
          )}
        >
          <ListFilter
            aria-hidden
            className={cn("h-3.5 w-3.5 flex-shrink-0", count > 0 ? "text-primary" : "text-slate-400")}
          />
          <span className="flex-shrink-0 font-normal text-slate-400">Lines</span>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
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
          onSelect={() => onChange([])}
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
