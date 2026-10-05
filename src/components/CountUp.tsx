import { useEffect, useState, type CSSProperties } from "react";

import { introMotion } from "@/lib/introMotion";

/**
 * A KPI figure that counts up to its value once, when it first appears:
 * from 0 through every figure on the way, quick at first and easing into a
 * soft stop on the number (David, 2026-10-05: counting up to it, premium,
 * not a casino). Then it holds still for good. No loop, no pop.
 *
 * `delayMs` lets a page land its KPIs in beats: a figure waiting its turn
 * sits at 0, dimmed, and wakes as it starts. A new value is a new figure
 * (callers key on it) and counts again. Tabular figures in the caller keep
 * the width steady, and a reader who asked the OS for less motion gets the
 * number straight away. It plays only on the first page opened (see
 * lib/introMotion); after a page move every figure simply shows.
 */

/** How long one figure takes to count up. */
const DURATION_MS = 1400;

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** How long after it starts a figure lands on its number. */
export function landsAfterMs(): number {
  return DURATION_MS;
}

export function CountUp({ value, delayMs = 0 }: { value: number; delayMs?: number }) {
  const [still] = useState(() => reducedMotion() || !introMotion());
  const [shown, setShown] = useState(() => (still || !Number.isFinite(value) ? value : 0));

  useEffect(() => {
    if (still || !Number.isFinite(value) || value === 0) {
      setShown(value);
      return;
    }
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / DURATION_MS);
      // Ease-out quart: brisk at first, then slowing gently onto the number.
      const eased = 1 - Math.pow(1 - t, 4);
      // Floor, so the figure only ever climbs and never shows the final
      // number before it has truly arrived.
      setShown(t === 1 ? value : Math.floor(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    const wait = window.setTimeout(() => {
      frame = requestAnimationFrame(tick);
    }, delayMs);
    // A page that never paints (a background tab, a capture) runs no
    // frames: the figure still lands on its number, never stays at 0.
    const land = window.setTimeout(() => setShown(value), delayMs + DURATION_MS + 150);
    return () => {
      window.clearTimeout(wait);
      window.clearTimeout(land);
      cancelAnimationFrame(frame);
    };
  }, [value, delayMs, still]);

  if (still) return <>{Number.isFinite(value) ? value.toLocaleString() : value}</>;
  return (
    <span
      // Dimmed while it waits its turn, full strength as it starts.
      style={delayMs > 0 ? { animation: `kpi-wake 260ms ease-out ${delayMs}ms both` } : undefined}
    >
      {/* A screen reader hears the number, not the count passing through. */}
      <span aria-hidden>{Number.isFinite(shown) ? shown.toLocaleString() : shown}</span>
      <span className="sr-only">{Number.isFinite(value) ? value.toLocaleString() : value}</span>
    </span>
  );
}

/** The inline style that brings a KPI's change line in once its figure
 *  has landed: a soft rise, then it stays. Nothing under reduced motion
 *  (index.css). */
export function payoffStyle(afterMs: number): CSSProperties | undefined {
  if (!introMotion()) return undefined;
  return { animation: `kpi-payoff 480ms cubic-bezier(0.2, 0.8, 0.2, 1) ${afterMs}ms both` };
}

/** The pause between a page's first and second beat, so the first
 *  figures sit settled for a moment before the next ones start. */
export const BEAT_PAUSE_MS = 1000;
