/**
 * THE LIST SWITCHES WITH COUNTS (David, 2026-10-27), beside Match type:
 *
 *   - Platform, All / CTV / Mobile / Web, on the Matched APPS list only
 *     (every app has a platform from its store; a publisher carries no
 *     platform label anywhere in the viewer): ``platform=`` on
 *     matched-apps, echoed, with ``platform_counts``.
 *   - Found in, All / ads.txt / app-ads.txt / Both, on the Matched
 *     PUBLISHERS list: ``found_in=`` on matched-developers and
 *     developer-events, echoed, with ``found_in_counts``.
 *
 * The crawler filters the WHOLE list and counts it per choice; a switch
 * shows only when the list's answer carries those counts, so a page is
 * never filtered on its own. Each pill says its count; a choice with none
 * has no pill. The same one track and one thumb as Match type, so they
 * read as one family; arrow keys, Home and End move the choice.
 *
 * ON A PHONE (demo of #75, 390 px): the label sits above the pills, each
 * pill is as wide as its own label and count (equal segments overlapped
 * "app-ads.txt 6" with the chosen "Both"), so the thumb is measured onto
 * the chosen pill; a track wider than the screen scrolls inside itself.
 */
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import type { FoundInCounts, FoundInFilter, PlatformCounts, PlatformFilter } from "@/lib/api";
import { cn } from "@/lib/utils";

const PLATFORM: { value: PlatformFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ctv", label: "CTV" },
  { value: "mobile", label: "Mobile" },
  { value: "web", label: "Web" },
];

const FOUND_IN: { value: FoundInFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ads_txt", label: "ads.txt" },
  { value: "app_ads_txt", label: "app-ads.txt" },
  { value: "both", label: "Both" },
];

export function PlatformControl(props: {
  value: PlatformFilter;
  onChange: (next: PlatformFilter) => void;
  counts: PlatformCounts;
}) {
  return <SplitControl label="Platform" testId="platform" options={PLATFORM} {...props} />;
}

export function FoundInControl(props: {
  value: FoundInFilter;
  onChange: (next: FoundInFilter) => void;
  counts: FoundInCounts;
}) {
  return <SplitControl label="Found in" testId="found-in" options={FOUND_IN} {...props} />;
}

function SplitControl<V extends string>({
  label,
  testId,
  options,
  value,
  onChange,
  counts,
}: {
  label: string;
  testId: string;
  options: { value: V; label: string }[];
  value: V;
  onChange: (next: V) => void;
  counts: Partial<Record<V, number>>;
}) {
  // A choice with no rows has no pill; the chosen one always keeps its.
  const shown = options.filter((o) => o.value === "all" || o.value === value || (counts[o.value] ?? 0) > 0);
  const index = Math.max(0, shown.findIndex((o) => o.value === value));
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const track = useRef<HTMLDivElement | null>(null);
  // The thumb under the chosen pill, measured: pills are their own width.
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  // No slide into the first place: the thumb starts where it belongs.
  const [glide, setGlide] = useState(false);
  const widthKey = shown.map((o) => `${o.value}:${counts[o.value] ?? 0}`).join(",");
  useLayoutEffect(() => {
    const t = track.current;
    if (!t) return;
    // Sub-pixel exact (offsetLeft rounds): from the track's padding edge,
    // where the thumb's left: 0 sits.
    const measure = () => {
      const el = buttons.current[index];
      if (!el) return;
      const b = el.getBoundingClientRect();
      const r = t.getBoundingClientRect();
      setThumb({ x: b.left - r.left - t.clientLeft, w: b.width });
    };
    measure();
    // Any pill's size moving (its count, a font landing) moves the thumb.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(t);
    for (const b of buttons.current) if (b) ro?.observe(b);
    const frame = requestAnimationFrame(() => setGlide(true));
    return () => {
      ro?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [index, widthKey]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = shown.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? index === last ? 0 : index + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? index === 0 ? last : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    buttons.current[next]?.focus();
    if (next !== index) onChange(shown[next].value);
  };
  if (shown.length < 2) return null;
  return (
    <div
      className="flex min-w-0 max-w-full flex-col items-start gap-1 tabular-nums sm:flex-row sm:items-center sm:gap-2"
      data-testid={testId}
    >
      <span id={`${testId}-label`} className="whitespace-nowrap text-[10px] font-medium text-slate-500">
        {label}
      </span>
      {/* Scrolls inside itself when wider than the screen; the padding
          keeps the focus ring inside the scroller. */}
      <div className="-m-1 max-w-[calc(100%+0.5rem)] overflow-x-auto p-1">
      <div
        ref={track}
        role="group"
        aria-labelledby={`${testId}-label`}
        onKeyDown={onKeyDown}
        className="relative inline-grid h-8 auto-cols-max grid-flow-col items-center rounded-full border border-border bg-muted p-[3px]"
      >
        <span
          aria-hidden
          data-split-thumb={shown[index].value}
          className={cn(
            "pointer-events-none absolute inset-y-[3px] left-0 rounded-full bg-card shadow-[0_1px_2px_hsl(150_30%_8%/0.08),0_1px_1px_hsl(150_30%_8%/0.04)] ring-1 ring-border/70 [transition-duration:220ms] [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
            glide && "transition-[transform,width]",
            !thumb && "opacity-0",
          )}
          style={thumb ? { width: thumb.w, transform: `translateX(${thumb.x}px)` } : undefined}
        />
        {shown.map((o, i) => {
          const on = i === index;
          const n = counts[o.value] ?? 0;
          return (
            <button
              key={o.value}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              aria-pressed={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={cn(
                "relative z-10 inline-flex h-full min-w-[3.5rem] items-center justify-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium sm:min-w-[4.5rem] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
              <span data-split-count className="text-[10px] font-normal text-slate-400">
                {n.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}
