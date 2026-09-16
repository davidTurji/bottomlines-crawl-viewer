/**
 * The seat-line dropdown: pick one or more of the customer's lines and
 * the page narrows to them. Multi-select, stays open while ticking, one
 * "All lines" row to clear, and an Apply button that commits.
 *
 * ── DRAFT IN, APPLY OUT ──────────────────────────────────────────
 *
 * Every tick used to call `onChange` straight through, and `onChange`
 * writes `?lines=` in the URL, which four fetches depend on. A reader
 * picking six lines fired all of that six times over, each round on a
 * bigger filter than the last, and the answers raced each other home.
 * THAT is why the filter felt slow: not one slow query, but six rounds of
 * queries nobody asked for, five of them for selections the reader was
 * still in the middle of making.
 *
 * So ticking is local. `draft` is the ticks in progress; it is seeded from
 * the applied selection when the menu opens, and it drives NOTHING outside
 * the open menu. Apply is the only thing that commits it.
 *
 * ── WHY THE PILL READS THE APPLIED SELECTION, NEVER THE DRAFT ────
 *
 * This is the integrity rule of the whole control, and it is worth stating
 * plainly because an earlier cut of it got this wrong.
 *
 * `selected` (the URL) is the single source of truth for what the page is
 * showing. The pill sits outside the menu, next to numbers that were read
 * under `selected`, so it must say `selected` too. A pill counting the
 * draft would read "6 of 6 lines" over a page still showing all of them,
 * which is a lie about the data on screen, and it would also have to be
 * un-said if the reader dismissed the menu instead of applying.
 *
 * The consequences follow from that one rule:
 *   - Dismissing the menu (Escape, a click outside) applies NOTHING. The
 *     draft is discarded and the next open re-seeds from the URL. There is
 *     no implicit commit to get wrong, and no window in which the control
 *     and the page disagree.
 *   - Apply is disabled unless the draft actually differs from what is
 *     applied, so it can never fire a refetch for the selection already
 *     on screen.
 *   - Membership is compared ignoring order, so re-ticking the same lines
 *     in a different order is correctly seen as no change.
 */
import { useState } from "react";

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
   * True while the page is refetching under the applied selection. The
   * pill spins and says so, because applying re-reads the whole report and
   * a control that looks idle while it works reads as one that did not
   * register the click.
   */
  busy?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // The ticks in progress. Only ever read inside the open menu.
  const [draft, setDraft] = useState<string[]>(selected);

  // Seeded from the URL on every open, so it cannot carry a stale draft
  // across a back button, a link arriving with ?lines=, or the other
  // page's filter.
  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(selected);
    setOpen(next);
  };

  if (seats.length === 0) return null;

  const chosen = new Set(draft);
  const applied = selected.length;
  // Never the line itself on the button: a count keeps the control one
  // size whatever is picked.
  const label =
    applied === 0 ? "All lines" : `${applied} of ${seats.length} lines`;
  const dirty = !sameSelection(draft, selected);

  const toggle = (key: string) => {
    setDraft((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const apply = () => {
    setOpen(false);
    if (dirty) onChange(draft);
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
            applied > 0 ? "border-primary/50" : "border-border",
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
              className={cn(
                "h-3.5 w-3.5 flex-shrink-0",
                applied > 0 ? "text-primary" : "text-slate-400",
              )}
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
          disabled={draft.length === 0}
          className="gap-2.5 text-[12px]"
        >
          <span
            aria-hidden
            className={cn(
              "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border",
              draft.length === 0
                ? "border-primary bg-primary"
                : "border-slate-300 bg-white",
            )}
          >
            {draft.length === 0 && (
              <Check className="h-3 w-3 text-white" strokeWidth={3} />
            )}
          </span>
          All lines
        </DropdownMenuItem>

        {/* THE COMMIT. Nothing above this line has touched the page.
            The left half says what Apply would do, so the button is never
            the only thing explaining itself.

            Apply is a DropdownMenuItem, not a plain <button>, and that is
            load bearing rather than cosmetic. Radix owns focus inside an
            open menu: it moves between its own items with the arrow keys
            and does not put anything else in the tab order, so a raw
            button sitting in this footer is reachable with a mouse and
            unreachable with a keyboard — the commit for the whole control,
            with no way to press it. As an item it joins the roving focus,
            takes Enter and Space, and still closes the menu on select.
            `asChild` keeps the real <button> element underneath, so it is
            announced as a button and not as a menu row. */}
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-border px-2 pb-1 pt-2">
          <span className="min-w-0 truncate text-[11px] text-slate-500">
            {dirty
              ? draft.length === 0
                ? "All lines"
                : `${draft.length} of ${seats.length} selected`
              : "No changes to apply"}
          </span>
          <DropdownMenuItem
            asChild
            disabled={!dirty}
            onSelect={(e) => {
              // Radix closes the menu on select by default; `apply` needs
              // to own that so the commit and the close happen together.
              e.preventDefault();
              apply();
            }}
            className="flex-shrink-0 p-0 focus:bg-transparent data-[disabled]:opacity-100"
          >
            <button
              type="button"
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors",
                dirty
                  ? "bg-primary text-white hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/40"
                  : "cursor-not-allowed bg-muted text-slate-400",
              )}
            >
              Apply
            </button>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
