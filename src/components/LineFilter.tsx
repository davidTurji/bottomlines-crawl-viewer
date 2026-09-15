/**
 * The seat-line dropdown: pick one or more of the customer's lines and
 * the page narrows to them. Multi-select, stays open while ticking, one
 * "All lines" row to clear. Same pill grammar as the filter bar's select,
 * so it sits beside a search box or on its own in a header without
 * looking like a different control.
 */
import { Check, ChevronsUpDown, ListFilter } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
  const label =
    count === 0
      ? "All lines"
      : count === 1
        ? lineLabel(seats.find((s) => chosen.has(lineKey(s))) ?? seats[0])
        : `${count} of ${seats.length} lines`;

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
            "flex h-10 max-w-full items-center gap-2 rounded-full border bg-white px-3.5 text-xs font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-50",
            count > 0 ? "border-primary/50" : "border-border",
            className,
          )}
        >
          <ListFilter
            aria-hidden
            className={cn("h-3.5 w-3.5 flex-shrink-0", count > 0 ? "text-primary" : "text-slate-400")}
          />
          <span className="flex-shrink-0 font-normal text-slate-400">Lines</span>
          <span className={cn("truncate", count === 1 && "font-mono")}>{label}</span>
          {count > 0 && (
            <span className="flex-shrink-0 rounded-full bg-primary px-1.5 py-px font-mono text-[10px] text-white">
              {count}
            </span>
          )}
          <ChevronsUpDown aria-hidden className="h-3 w-3 flex-shrink-0 opacity-40" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="text-[11px] font-medium text-slate-500">
          Show only publishers and apps carrying
        </DropdownMenuLabel>
        {seats.map((s) => {
          const key = lineKey(s);
          return (
            <DropdownMenuCheckboxItem
              key={key}
              checked={chosen.has(key)}
              // Keep the menu open: the reader is ticking several.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(key)}
              className="font-mono text-[12px]"
            >
              <span className="truncate">{lineLabel(s)}</span>
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onChange([])}
          disabled={count === 0}
          className="text-[12px]"
        >
          <Check className={cn("mr-2 h-3.5 w-3.5", count === 0 ? "opacity-100" : "opacity-0")} />
          All lines
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
