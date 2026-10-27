/**
 * POPULAR (David, 2026-10-27): one click to the views a reader asks for most
 * ("All removed apps", "Publishers that lost lines", "Lines removed this
 * week" ...). Not a chat: each choice SETS the Overview's own filters (the
 * list, its tab, its match type) and glides to the list, which shows its
 * skeleton while it loads.
 *
 * THE LOOK IS THE DEMO'S ASK AI BOX WITHOUT ITS INPUT (bottomlines-app
 * AskAIComposer, copied into this viewer's own tokens): the same pill card
 * (rounded 28px, hairline border, white, a soft shadow, the sparkle in the
 * brand green), the same round green arrows and the same chips, whose
 * active one carries the accent tint. A carousel: the arrows page it and
 * grey out at either end, a phone swipes it (the arrows step aside there),
 * the arrow keys move between choices when one has focus, and the slide is
 * smooth unless the reader asked for less motion.
 *
 * A choice shows only when its list is not empty, with its count in quiet
 * text; the caller decides which. The active one is highlighted; a second
 * press, or any filter changed by hand, clears it.
 */
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
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
  /** The counts are on their way: the chips' places, in the skeleton tone. */
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
    "hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-default disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none sm:flex",
    fits && "sm:invisible",
  );
  return (
    <section
      data-testid="popular"
      aria-label="Popular"
      className="flex items-center gap-2 rounded-[28px] border border-border bg-white py-2 pl-4 pr-2 shadow-sm sm:gap-3 sm:pl-5"
    >
      <span className="flex flex-shrink-0 items-center gap-2 text-sm font-medium text-slate-700">
        <Sparkles aria-hidden className="h-4 w-4 flex-shrink-0 text-primary" />
        Popular
      </span>
      <button
        type="button"
        onClick={() => page(-1)}
        disabled={edges.start}
        aria-label="Previous choices"
        className={arrow}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <div
        ref={rail}
        role="group"
        aria-label="Popular choices"
        onKeyDown={onKeyDown}
        className="tbl tbl-no-scrollbar flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto py-0.5"
      >
        {loading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-36 flex-shrink-0 rounded-full" />)
          : choices.map((c) => {
              const on = c.id === active;
              return (
                <button
                  key={c.id}
                  type="button"
                  data-popular={c.id}
                  aria-pressed={on}
                  onClick={() => onPick(c.id)}
                  className={cn(
                    "flex flex-shrink-0 snap-start items-baseline gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    on
                      ? "border-primary/40 bg-accent text-primary"
                      : "border-border bg-white text-slate-500 hover:border-primary/25 hover:text-primary",
                  )}
                >
                  {c.label}
                  <span className={cn("tabular-nums", on ? "text-primary/70" : "text-slate-400")}>
                    {c.count.toLocaleString()}
                  </span>
                </button>
              );
            })}
      </div>
      <button
        type="button"
        onClick={() => page(1)}
        disabled={edges.end}
        aria-label="More choices"
        className={arrow}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </section>
  );
}
