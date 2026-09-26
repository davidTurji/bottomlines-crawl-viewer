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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

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
import { isDiscovered, lineKey, lineLabel, sourceHint } from "@/lib/lineFilter";
import { cn } from "@/lib/utils";

/** One size for this control and the Export button beside it: the two
 *  read as a pair, and a label that changes must never move the row. */
export const HEADER_PILL = "h-9 w-[176px]";

/** Same members, order ignored. */
const sameSelection = (a: string[], b: string[]) =>
  a.length === b.length && a.every((k) => b.includes(k));

/**
 * A scroll rail the list draws for itself, always on show.
 *
 * The native bar is an overlay on macOS: invisible until something moves,
 * so a list of 126 lines cut off at the ninth looked like a list of nine
 * (David, 2026-09-21: "have a bar so people will know it's scrollable").
 * Styling the native bar is platform lottery (Chromium drops the WebKit
 * rules the moment the standard properties are set; Firefox never had
 * them), so the native one is hidden and this rail stands in on every
 * platform: a track the full height of the list, a thumb sized to the
 * visible share and placed by scrollTop, draggable, and a click on the
 * track jumps there. Wheel, trackpad and arrow keys scroll the list as
 * before; the rail only mirrors them.
 */
function ScrollRail({
  target,
  deps,
}: {
  target: React.RefObject<HTMLDivElement | null>;
  /** Anything whose change should re-measure (the list length). */
  deps: unknown[];
}) {
  const [rail, setRail] = useState<{ top: number; height: number; track: number } | null>(null);
  const drag = useRef<{ startY: number; startTop: number } | null>(null);

  const measure = useCallback(() => {
    const el = target.current;
    if (!el) return;
    const { scrollHeight, clientHeight, scrollTop } = el;
    if (scrollHeight <= clientHeight + 1) {
      setRail(null);
      return;
    }
    const track = clientHeight;
    const height = Math.max(24, Math.round((clientHeight / scrollHeight) * track));
    const top = Math.round((scrollTop / (scrollHeight - clientHeight)) * (track - height));
    setRail({ top, height, track });
  }, [target]);

  // Measured on mount, on every scroll, and whenever the box changes size
  // (the menu is capped at the room below the pill, which follows the
  // window).
  useLayoutEffect(() => {
    measure();
    const el = target.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps]);

  useEffect(() => {
    if (!rail) return;
    const move = (e: PointerEvent) => {
      const el = target.current;
      if (!drag.current || !el) return;
      const { scrollHeight, clientHeight } = el;
      const span = rail.track - rail.height;
      if (span <= 0) return;
      const nextTop = Math.min(span, Math.max(0, drag.current.startTop + (e.clientY - drag.current.startY)));
      el.scrollTop = (nextTop / span) * (scrollHeight - clientHeight);
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [rail, target]);

  if (!rail) return null;

  return (
    <div
      data-testid="scroll-rail"
      aria-hidden
      onPointerDown={(e) => {
        // A click on the track (not the thumb) jumps the list there.
        const el = target.current;
        if (!el || e.target !== e.currentTarget) return;
        const y = e.clientY - e.currentTarget.getBoundingClientRect().top - rail.height / 2;
        const span = rail.track - rail.height;
        el.scrollTop = (Math.min(span, Math.max(0, y)) / span) * (el.scrollHeight - el.clientHeight);
      }}
      className="absolute bottom-0 right-1 top-0 w-2 cursor-pointer rounded-full bg-slate-200"
    >
      <div
        data-testid="scroll-thumb"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          drag.current = { startY: e.clientY, startTop: rail.top };
        }}
        style={{ top: rail.top, height: rail.height }}
        className="absolute left-0 w-full rounded-full bg-slate-400 transition-colors hover:bg-slate-500"
      />
    </div>
  );
}

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
  const listRef = useRef<HTMLDivElement | null>(null);

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
      {/* ── A LONG WATCHLIST SCROLLS INSIDE THE MENU ──────────────────
          A customer with a hundred and more lines (eskimi, 2026-09-21)
          pushed the menu past the bottom of the window: the last lines,
          "All lines" and Apply were off screen with no way to reach them,
          and the page behind the menu does not scroll while it is open.
          Radix measures the room left below the pill and hands it over as
          a CSS variable; the menu is capped at that height and laid out
          as a column, so the list is the only part that scrolls and the
          label above it and the commit below it are always in view. */}
      <DropdownMenuContent
        align="end"
        collisionPadding={16}
        className="flex w-[420px] max-w-[calc(100vw-2rem)] flex-col"
        style={{ maxHeight: "var(--radix-dropdown-menu-content-available-height)" }}
      >
        <DropdownMenuLabel className="flex-shrink-0 text-[11px] font-medium text-slate-500">
          Show only publishers and apps carrying
          {seats.length > 8 && (
            <span className="ml-1 font-normal text-slate-400">
              ({seats.length} lines, scroll for more)
            </span>
          )}
          {/* Said once here, so the small grey line under each seat reads
              as an answer rather than as stray text. */}
          <span className="mt-0.5 block font-normal normal-case text-[10.5px] text-slate-400">
            Under each line, where it came from and when it was added.
          </span>
        </DropdownMenuLabel>
        {/* The wrapper is a flex column too, so the list is a flex item
            with a definite height (a percentage height would not resolve
            against a max-height-capped menu) and the rail can sit beside
            it at the full height of the visible list. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={listRef}
          role="group"
          aria-label="Seat lines"
          className="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain pr-4"
        >
        {seats.map((s) => {
          const key = lineKey(s);
          const on = chosen.has(key);
          // Every line hints where it came from and the day it was added,
          // here and nowhere else: this menu is the one surface that lists
          // them all (David, 2026-09-25). A line we found for the customer
          // reads blue, because it is the one worth picking out of a long
          // list; the lines they gave read plain. Same row, same checkbox.
          const hint = sourceHint(s);
          const discovered = isDiscovered(s);
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
              className={cn(
                // A ROW, NOT A STACK. The box belongs beside the line it
                // ticks, so it is laid out as one flex row with the box in
                // its own column and the line plus its hint in the other.
                // Stacked, the box centred itself against a two-line row
                // and floated between the line and its hint, belonging to
                // neither.
                "items-start gap-2.5 rounded-none border-b border-border/60 px-2 py-2 last:border-b-0",
                discovered && "bg-sky-50/60 focus:bg-sky-50",
              )}
            >
              {/* An empty box that fills when picked, always visible, so
                  the state of every line is readable at a glance. Nudged
                  down by a hair to sit on the line's baseline rather than
                  its box. */}
              <span
                aria-hidden
                className={cn(
                  "mt-[2px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                  on ? "border-primary bg-primary" : "border-slate-300 bg-white",
                )}
              >
                {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </span>
              {/* THE HINT IN WORDS, under its line, with a hairline between
                  one seat and the next (David, 2026-09-26). A bare date at
                  the right margin was compact, but it made the reader carry
                  a legend in their head; spelled out, each seat answers for
                  itself. The rule is what the first two-line attempt was
                  missing: without it 127 rows ran together into a wall and
                  the eye could not tell where one seat ended. */}
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span
                  className={cn(
                    "truncate font-mono text-[12px] leading-[18px]",
                    discovered ? "text-sky-900" : "text-slate-900",
                  )}
                >
                  {lineLabel(s)}
                </span>
                {hint && (
                  <span
                    className={cn(
                      "truncate text-[10.5px] leading-[14px]",
                      discovered ? "text-sky-600" : "text-slate-400",
                    )}
                  >
                    {hint}
                  </span>
                )}
              </span>
            </DropdownMenuItem>
          );
        })}
        </div>
        <ScrollRail target={listRef} deps={[seats.length]} />
        </div>
        <DropdownMenuSeparator className="flex-shrink-0" />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setDraft([]);
          }}
          disabled={draft.length === 0}
          className="flex-shrink-0 gap-2.5 text-[12px]"
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
        <div className="mt-1 flex flex-shrink-0 items-center justify-between gap-3 border-t border-border px-2 pb-1 pt-2">
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
            // `rounded-full` is said HERE, on the item, and not only on the
            // button below: the item's own `rounded-sm` wins the cascade
            // over a class merged in through `asChild`, and Apply came out
            // with the corners of a menu row instead of the pill every
            // other button on these screens has (David, 2026-09-21).
            className="flex-shrink-0 rounded-full p-0 focus:bg-transparent data-[disabled]:opacity-100"
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
