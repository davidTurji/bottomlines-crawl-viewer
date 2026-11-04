import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { prefersReducedMotion } from "@/components/Motion";

/**
 * EVERY LINE, ONE CLICK AWAY (David, 2026-11-02: "we should be able to show
 * all removed lines"). A window opens on its first lines; "Show all" opens
 * the whole list inside the window, which scrolls on its own so a long list
 * never pushes the page away, and draws the lines a step at a time as the
 * reader scrolls, so thousands stay quick. Nothing is ever cut. The report's
 * change windows and the Sellers.json page's source lines (2026-11-03) both
 * fold this way.
 */
export const FOLD_OPEN = 5;
/** A window shows every line when folding would hide this few or fewer. */
export const FOLD_SLACK = 2;
/** Lines drawn at a time inside an opened window. */
export const FOLD_STEP = 200;

/**
 * ONE MOTION BOTH WAYS (David, 2026-11-02: closing was "very violent"). The
 * list's height eases between its first lines and the whole list, the card
 * expansion's own time and curve (200 ms, ease out), opening and closing
 * alike; closing scrolls the list back to its top on the way. Returns a stop
 * that leaves the list at its natural height.
 */
export const FOLD_MOTION_MS = 200;

export function easeListHeight(
  el: HTMLElement,
  from: number,
  to: number,
  done: () => void,
  /** Closing: stay at the end height until the caller lets go, so the rest
   *  of the list never shows for a frame before it is taken away. */
  holdEnd = false,
): () => void {
  const top = el.scrollTop;
  const start = performance.now();
  let frame = 0;
  const clear = () => {
    el.style.height = "";
    el.style.overflow = "";
  };
  el.style.overflow = "hidden";
  el.style.height = `${from}px`;
  const step = (now: number) => {
    // A frame's time can precede the start by a little: never step backwards.
    const t = Math.min(1, Math.max(0, (now - start) / FOLD_MOTION_MS));
    const k = 1 - Math.pow(1 - t, 3);
    el.style.height = `${from + (to - from) * k}px`;
    if (to < from) el.scrollTop = top * (1 - k);
    if (t < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    if (!holdEnd) clear();
    done();
  };
  frame = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(frame);
    clear();
  };
}

/**
 * A folded window's state, the report's change window's own steps: open
 * and drawn, the scroller to ease and the "Showing X of Y" button that
 * draws the next step as the reader nears it. ``count`` is every line the
 * window holds; ``rows`` how many to draw now.
 */
export function useFoldedList(count: number) {
  const folds = count > FOLD_OPEN + FOLD_SLACK;
  const [open, setOpen] = useState(false);
  const [drawn, setDrawn] = useState(FOLD_STEP);
  const scroller = useRef<HTMLDivElement | null>(null);
  const more = useRef<HTMLButtonElement | null>(null);
  const stopMotion = useRef<(() => void) | null>(null);
  // The list's height before it opened, eased from once the whole list is drawn.
  const openedFrom = useRef<number | null>(null);
  useEffect(() => () => stopMotion.current?.(), []);
  // Draw the next step as the reader nears the end of what is drawn.
  useEffect(() => {
    const el = more.current;
    if (!open || !el || drawn >= count || typeof IntersectionObserver === "undefined") return;
    const seen = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setDrawn((d) => d + FOLD_STEP),
      { root: scroller.current, rootMargin: "400px 0px" },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, [open, drawn, count]);
  // Opening: the whole list is drawn, then its height eases up from where
  // the first lines left it, before the browser paints.
  useLayoutEffect(() => {
    const el = scroller.current;
    const from = openedFrom.current;
    openedFrom.current = null;
    if (el && !open) {
      // Closed: the first lines are drawn, so the held height lets go.
      el.style.height = "";
      el.style.overflow = "";
      return;
    }
    if (!open || !el || from === null) return;
    const to = el.getBoundingClientRect().height;
    if (to <= from) return;
    stopMotion.current?.();
    stopMotion.current = easeListHeight(el, from, to, () => { stopMotion.current = null; });
  }, [open]);
  const toggle = () => {
    const el = scroller.current;
    const still = prefersReducedMotion();
    if (open) {
      const finish = () => {
        stopMotion.current = null;
        if (el) el.scrollTop = 0;
        setOpen(false);
        setDrawn(FOLD_STEP);
      };
      // Closing: the height eases down to the first lines, then the rest go.
      const firstRows = el ? (Array.from(el.querySelector("ul")?.children ?? []) as HTMLElement[]).slice(0, FOLD_OPEN) : [];
      const to = firstRows.reduce((h, r) => h + r.offsetHeight, 0);
      stopMotion.current?.();
      if (!el || still || !to) {
        finish();
        return;
      }
      stopMotion.current = easeListHeight(el, el.getBoundingClientRect().height, to, finish, true);
      return;
    }
    stopMotion.current?.();
    stopMotion.current = null;
    if (el && !still) openedFrom.current = el.getBoundingClientRect().height;
    setOpen(true);
  };
  const rows = !folds ? count : open ? Math.min(drawn, count) : FOLD_OPEN;
  return {
    folds,
    open,
    drawn,
    rows,
    scroller,
    more,
    toggle,
    drawMore: () => setDrawn((d) => d + FOLD_STEP),
  };
}
