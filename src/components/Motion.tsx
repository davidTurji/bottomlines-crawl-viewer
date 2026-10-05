import { useEffect, useState, type ReactNode } from "react";

import { introMotion } from "@/lib/introMotion";
import { cn } from "@/lib/utils";

/**
 * QUIET MOTION for the report's lists (David, 2026-10-05: subtle, premium).
 * Each runs once and then holds still; nothing loops or pulses, and a
 * reader who asked the OS for less motion gets none of it.
 */

const COLLAPSE_MS = 280;

/**
 * An expanded row's body that eases open and shut in height instead of
 * snapping. Animates grid rows 0fr to 1fr, so it needs no measuring and
 * follows whatever the body grows to. The body mounts on open and unmounts
 * once the close has played, so a closed row still costs nothing, and a
 * row that is open when it first renders simply shows (no animation on
 * arrival).
 */
export function Collapse({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames: the first paints the body at 0fr, the second lets the
      // transition run from there rather than from nothing.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), COLLAPSE_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!mounted) return null;
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none",
        shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
      style={{ transitionDuration: `${COLLAPSE_MS}ms` }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/**
 * Scroll an element to the top of whatever scrolls it, easing in and out
 * (slow start, glide, soft stop) rather than the browser's own smooth
 * scroll, which starts abruptly and varies by browser. Lands `offset` px
 * above the element. Less motion asked for: jumps straight there.
 */
export function glideTo(el: HTMLElement | null, offset = 24, durationMs = 900) {
  if (!el) return;
  let scroller: HTMLElement | null = el.parentElement;
  while (scroller) {
    const oy = getComputedStyle(scroller).overflowY;
    if ((oy === "auto" || oy === "scroll") && scroller.scrollHeight > scroller.clientHeight) break;
    scroller = scroller.parentElement;
  }
  const box = scroller ?? document.scrollingElement ?? document.documentElement;
  const top = scroller ? scroller.getBoundingClientRect().top : 0;
  const from = box.scrollTop;
  const to = Math.max(0, from + el.getBoundingClientRect().top - top - offset);
  let reduced = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    /* no matchMedia: animate */
  }
  if (reduced || Math.abs(to - from) < 2) {
    box.scrollTop = to;
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    // Ease-in-out cubic.
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    box.scrollTop = from + (to - from) * eased;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * A list row that settles into place: up a few pixels and in from clear,
 * one row after another. The stagger stops growing after the first eight
 * rows, so a long page lands in well under a second.
 */
export function Settle({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  // Only on the first page opened (lib/introMotion), like the count-ups.
  const [play] = useState(introMotion);
  if (!play) return <div>{children}</div>;
  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-500 ease-out motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      {children}
    </div>
  );
}
