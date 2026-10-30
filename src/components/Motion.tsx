import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { flushSync } from "react-dom";

/**
 * QUIET MOTION for the report's lists (David, 2026-10-05: subtle, premium).
 * Each runs once and then holds still; nothing loops or pulses, and a
 * reader who asked the OS for less motion gets none of it.
 */


/** The one easing the list swap, its height and the Match type thumb share:
 *  a quick start and a long, soft landing. */
export const CALM_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Whether the reader asked the OS for less motion, read at the moment of
 *  use (the setting can change while the page is open). */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * True once `on` has held for `ms`, false the moment it drops. For a
 * "still loading" sign that should never flash on an answer that comes
 * back at once.
 */
export function useLingering(on: boolean, ms: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on) {
      setShown(false);
      return;
    }
    const t = window.setTimeout(() => setShown(true), ms);
    return () => window.clearTimeout(t);
  }, [on, ms]);
  return on && shown;
}

/** Shared accordion motion. Keep the outgoing body for its short close
 *  transition, then unmount it so closed rows do no background work. */
export function Collapse({ open, children, id }: { open: boolean; children: ReactNode; id?: string }) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  const body = useRef<HTMLDivElement | null>(null);
  const lastContent = useRef(children);
  if (open) lastContent.current = children;
  useLayoutEffect(() => {
    if (prefersReducedMotion()) {
      setMounted(open); setExpanded(open);
      return;
    }
    let frame = 0;
    let timer = 0;
    if (open) {
      setMounted(true);
      // Commit the collapsed height before asking the browser to expand.
      body.current?.getBoundingClientRect();
      frame = requestAnimationFrame(() => setExpanded(true));
    } else {
      setExpanded(false);
      timer = window.setTimeout(() => setMounted(false), 220);
    }
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [open]);
  return <div id={id} ref={node => { body.current = node; if (node) node.inert = !open; }}
    aria-hidden={!open} data-expanded={expanded} className="report-expansion">
    <div>{(open || mounted) ? (open ? children : lastContent.current) : null}</div>
  </div>;
}

let cancelExpansionAnchor: (() => void) | undefined;

/** Keep the current scroll range while a shorter list or panel replaces it.
 * Without this floor, the browser clamps scrollTop before the close motion
 * finishes, moving the KPIs even though the reader never asked to scroll.
 * The floor shrinks as the reader scrolls up; a page change unmounts it. */
function reserveViewport(anchor: HTMLElement) {
  const scroller = anchor.closest<HTMLElement>("[data-report-main]");
  const content = scroller?.querySelector<HTMLElement>("[data-report-content]");
  if (!scroller || !content) return scroller;
  const floor = Math.ceil(scroller.scrollTop + scroller.clientHeight);
  content.style.minHeight = `${Math.max(floor, parseFloat(content.style.minHeight) || 0)}px`;
  const existing = viewportFloors.get(scroller);
  if (existing?.content !== content) {
    if (existing) scroller.removeEventListener("scroll", existing.release);
    const release = () => {
      if (!content.isConnected) { scroller.removeEventListener("scroll", release); viewportFloors.delete(scroller); return; }
      const next = Math.ceil(scroller.scrollTop + scroller.clientHeight);
      if (next < (parseFloat(content.style.minHeight) || 0)) content.style.minHeight = `${next}px`;
    };
    scroller.addEventListener("scroll", release, { passive: true });
    viewportFloors.set(scroller, { content, release });
  }
  return scroller;
}
const viewportFloors = new WeakMap<HTMLElement, { content: HTMLElement; release: () => void }>();

/** Swap inventory/status without navigating away from the current viewport. */
export function preserveReportViewport(anchor: HTMLElement | null, change: () => void) {
  if (!anchor) { change(); return; }
  const scroller = reserveViewport(anchor);
  const top = scroller?.scrollTop;
  flushSync(change);
  if (scroller && top != null) scroller.scrollTop = top;
}

/** Keep the clicked header in place when another open panel above it closes. */
export function toggleWithoutJump(button: HTMLElement, change: () => void) {
  cancelExpansionAnchor?.();
  const scroller = reserveViewport(button);
  const before = button.getBoundingClientRect().top;
  flushSync(change);
  if (!scroller || !button.isConnected) return;
  const align = () => {
    const shift = button.getBoundingClientRect().top - before;
    if (Math.abs(shift) > 0.5) scroller.scrollTop += shift;
  };
  align();
  if (prefersReducedMotion()) return;
  let frame = 0;
  const start = performance.now();
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) window.removeEventListener(event, stop);
    if (cancelExpansionAnchor === stop) cancelExpansionAnchor = undefined;
  };
  cancelExpansionAnchor = stop;
  for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) window.addEventListener(event, stop, { passive: true });
  const settle = () => {
    if (!button.isConnected) { stop(); return; }
    align();
    if (performance.now() - start < 260) frame = requestAnimationFrame(settle);
    else stop();
  };
  frame = requestAnimationFrame(settle);
}

let cancelGlide: (() => void) | undefined;

/**
 * Scroll an element to the top of whatever scrolls it, easing in and out
 * (slow start, glide, soft stop) rather than the browser's own smooth
 * scroll, which starts abruptly and varies by browser. Lands `offset` px
 * above the element. Less motion asked for: jumps straight there.
 */
export function glideTo(el: HTMLElement | null, offset = 24, durationMs = 320) {
  cancelGlide?.();
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
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) window.removeEventListener(event, stop);
    if (cancelGlide === stop) cancelGlide = undefined;
  };
  cancelGlide = stop;
  for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) window.addEventListener(event, stop, { passive: true });
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    // Ease-in-out cubic.
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    box.scrollTop = from + (to - from) * eased;
    if (t < 1) frame = requestAnimationFrame(step);
    else stop();
  };
  frame = requestAnimationFrame(step);
}

/**
 * THE ROWS ROLL IN (David, 2026-10-27): every time a list lands, the first
 * view and every switch after it (tab, match type, Popular, search, line
 * filter, page, the publishers / apps tiles, Inactive), each row fades in
 * and slides down 7px with a soft ease-out, 35ms after the row above it.
 * The stagger stops at the seventh row, so a 25-row page is in within
 * about 430ms, the rest arriving with the last batch: no long cascade.
 * Transform and opacity only, so it stays on the compositor (no layout
 * work, smooth on a phone); the row holds its space from the first frame,
 * so nothing below it jumps. Less motion asked for: none (index.css).
 */
export function Settle({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  return (
    <div data-row-in className="bl-row-in" style={{ "--bl-row-delay": `${Math.min(index, 6) * 35}ms` } as CSSProperties}>
      {children}
    </div>
  );
}
