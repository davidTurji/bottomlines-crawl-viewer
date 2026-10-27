/**
 * POPULAR (David, 2026-10-27): one click to the views a reader asks for most
 * ("All removed apps", "Publishers that lost lines", "Stopped watching" ...).
 * Not a chat: each choice SETS the list's own filters (the list, its tab,
 * its match type) and glides to it, which shows its skeleton while it loads.
 *
 * THE LOOK IS THE DEMO'S SUGGESTION ROW (bottomlines-app AskAIComposer,
 * copied into this viewer's own tokens; David's screenshot): pill buttons
 * in one horizontal row between two dark green round arrows, no input box,
 * a small "Popular" label. The text is bigger and bolder than the demo's
 * (14px, medium) and the pills a little taller, so it reads at a glance.
 * A carousel: the arrows page it and fade at either end (no arrows when
 * everything fits), a phone swipes it (the arrows step aside there, as on
 * the demo), the arrow keys move between choices, and the slide is smooth
 * unless the reader asked for less motion.
 *
 * A choice shows only when its list is not empty, with its count in quiet
 * text; the caller decides which. The active one is highlighted; a second
 * press, or any filter changed by hand, clears it.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { prefersReducedMotion } from "@/components/Motion";
import { Skeleton } from "@/components/Skeleton";
import { cn } from "@/lib/utils";

export type PopularChoice = { id: string; label: string; count: number };

export function PopularBar({
  choices,
  active,
  onPick,
  loading = false,
}: {
  choices: PopularChoice[];
  active: string | null;
  onPick: (id: string) => void;
  /** Counts still on their way: the chips that landed show, and the places
   *  of the rest in the skeleton tone, until all settle or the ceiling. */
  loading?: boolean;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [measure, choices.length, loading]);

  const page = (dir: number) => {
    const el = rail.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  // Arrow keys walk the choices, the rail following the focus.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(rail.current?.querySelectorAll<HTMLButtonElement>("button[data-popular]") ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const next =
      e.key === "ArrowRight" ? Math.min(buttons.length - 1, at + 1)
      : e.key === "ArrowLeft" ? Math.max(0, at - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? buttons.length - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    buttons[next].focus({ preventScroll: true });
    buttons[next].scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  if (!loading && choices.length === 0) return null;
  // Nothing to page (every choice fits): no arrows at all.
  const fits = edges.start && edges.end;
  const arrow = cn(
    "hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-[background-color,opacity] hover:bg-primary/90 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-primary sm:flex",
    fits && "sm:invisible",
  );
  return (
    // FULL WIDTH (David, 2026-10-27): the row spans the content like the
    // sections below; the label at the left, the arrows at the two ends,
    // the pills filling the rail between (they grow when they fit, and
    // scroll at their own width when they do not; a phone swipes).
    <section data-testid="popular" aria-label="Popular" aria-busy={loading || undefined} className="flex w-full items-center gap-2">
      <span className="flex-shrink-0 pr-1 text-[11px] font-medium text-slate-500">Popular</span>
      <button type="button" onClick={() => page(-1)} disabled={edges.start} aria-label="Previous choices" className={arrow}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div
        ref={rail}
        role="group"
        aria-label="Popular choices"
        onKeyDown={onKeyDown}
        className="tbl tbl-no-scrollbar flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto py-0.5"
      >
        {[
          ...choices.map((c) => {
              const on = c.id === active;
              return (
                <button
                  key={c.id}
                  type="button"
                  data-popular={c.id}
                  aria-pressed={on}
                  onClick={() => onPick(c.id)}
                  className={cn(
                    "flex h-9 flex-shrink-0 flex-grow snap-start items-center justify-center gap-2 whitespace-nowrap rounded-full border px-4 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    on
                      ? "border-primary/40 bg-accent text-primary"
                      : "border-border bg-white text-slate-700 hover:border-primary/25 hover:text-primary",
                  )}
                >
                  {c.label}
                  <span className={cn("text-[12px] font-normal tabular-nums", on ? "text-primary/70" : "text-slate-400")}>
                    {c.count.toLocaleString()}
                  </span>
                </button>
              );
            }),
          // The places of the counts still on their way.
          ...(loading
            ? Array.from({ length: Math.max(1, 4 - choices.length) }, (_, i) => (
                <span key={`s${i}`} data-popular-skeleton className="min-w-[11rem] flex-shrink-0 flex-grow">
                  <Skeleton className="h-9 w-full rounded-full" />
                </span>
              ))
            : []),
        ]}
      </div>
      <button type="button" onClick={() => page(1)} disabled={edges.end} aria-label="More choices" className={arrow}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </section>
  );
}
