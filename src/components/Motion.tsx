import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { introMotion } from "@/lib/introMotion";
import { cn } from "@/lib/utils";

/**
 * QUIET MOTION for the report's lists (David, 2026-10-05: subtle, premium).
 * Each runs once and then holds still; nothing loops or pulses, and a
 * reader who asked the OS for less motion gets none of it.
 */

const COLLAPSE_MS = 280;

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

/** False inside a ListSwap once its first list has landed: rows that
 *  arrive later (a filter, a tab, a search, a page) come in with the
 *  list's one fade, never one by one. Outside a ListSwap, true. */
const ListIntro = createContext(true);

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
  const intro = useContext(ListIntro);
  // Only on the first page opened (lib/introMotion), like the count-ups,
  // and only with the first list that page shows.
  const [play] = useState(() => introMotion() && intro);
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

/*
 * THE LIST SWAP: how a matched list changes its rows (David, 2026-10-26:
 * the Match type switch "is a bit violent as the results shift; make it
 * more premium"). One calm move for a filter, a tab, a search or a page,
 * on the publishers and the apps list alike:
 *
 * - The list stays mounted. Rows are never thrown away and faded in from
 *   nothing; a row in both lists keeps its place in the page.
 * - Asked for and not here yet: the rows on screen dim to 0.35 (120 ms),
 *   still readable, clearly the old answer. When the new rows land they
 *   take the old ones' place and come up to full (200 ms).
 * - Already here (read ahead, or seen before): one short fade through,
 *   60 ms down to half and 90 ms back up, 150 ms in all. Rows never swap
 *   at full strength, which is what made the switch look like a jolt.
 * - The list's height eases from the old to the new (240 ms), so the pager,
 *   the note and everything below glide instead of jumping. Once there it
 *   lets go (height auto), so an expanded card is never cut off; a card
 *   that opens mid-ease is followed.
 * - Less motion asked for: none of it. The new rows simply replace the old.
 */

const SWAP_DIM = 0.35;
const SWAP_DIM_MS = 120;
const SWAP_RISE_MS = 200;
/** The least a dimmed list stays down before its rows swap. */
const SWAP_HOLD_MS = 60;
const QUICK_DIM = 0.5;
const QUICK_OUT_MS = 60;
const QUICK_IN_MS = 90;
const HEIGHT_MS = 240;

let swapInstances = 0;
let clipValue: string | null = null;
/** overflow-y: clip keeps the cards' side shadows; hidden where unsupported. */
function clipY(): string {
  if (clipValue === null) {
    try {
      clipValue = CSS.supports("overflow-y", "clip") ? "clip" : "hidden";
    } catch {
      clipValue = "hidden";
    }
  }
  return clipValue;
}

export function ListSwap({
  version,
  pending,
  intro = true,
  children,
}: {
  /** Changes whenever a new list is to be shown: a landed answer, or a
   *  filter the browser applies itself. */
  version: string | number;
  /** A new list has been asked for and has not landed yet. */
  pending: boolean;
  /** Whether the first list shown may play the rows' settle (Settle). */
  intro?: boolean;
  children: ReactNode;
}) {
  // One id per mount: the browser tests read it to prove a switch keeps
  // the list (and every row in both answers) in place.
  const [instance] = useState(() => ++swapInstances);
  const [first] = useState(version);
  const [shown, setShown] = useState(version);
  const [fade, setFade] = useState<{ opacity: number; ms: number }>({ opacity: 1, ms: 0 });

  // The rows rendered for the list on screen. They stay up, dimmed, until
  // the swap, even though the page already holds the next list's state.
  const held = useRef<ReactNode>(children);
  if (version === shown) held.current = children;
  const content = version === shown ? children : held.current;

  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const latest = useRef(version);
  latest.current = version;
  const onScreen = useRef(version);
  const dimSince = useRef<number | null>(null);
  const holding = useRef(false);
  const holdTimer = useRef(0);
  const fromHeight = useRef<number | null>(null);
  const easing = useRef(false);
  const heightTimer = useRef(0);

  const release = () => {
    easing.current = false;
    const outer = outerRef.current;
    if (!outer) return;
    outer.style.transition = "";
    outer.style.height = "";
    outer.style.overflowY = "";
  };
  const holdHeightUntilSettled = () => {
    window.clearTimeout(heightTimer.current);
    heightTimer.current = window.setTimeout(release, HEIGHT_MS + 40);
  };

  // A new list to show: swap, after the fade down where there is one.
  useLayoutEffect(() => {
    if (version === onScreen.current) {
      // Back to the list on screen before the hold ended (there and back
      // quickly): nothing to swap, just come back up.
      if (holding.current) {
        window.clearTimeout(holdTimer.current);
        holding.current = false;
        dimSince.current = null;
        setFade({ opacity: 1, ms: SWAP_RISE_MS });
      }
      return;
    }
    // A hold already running swaps to whatever is latest when it ends.
    if (holding.current) return;
    const reduced = prefersReducedMotion();
    const quick = dimSince.current === null;
    const swap = () => {
      holding.current = false;
      dimSince.current = null;
      const outer = outerRef.current;
      fromHeight.current = !reduced && outer ? outer.getBoundingClientRect().height : null;
      onScreen.current = latest.current;
      setShown(latest.current);
      setFade({ opacity: 1, ms: reduced ? 0 : quick ? QUICK_IN_MS : SWAP_RISE_MS });
    };
    if (reduced) {
      swap();
      return;
    }
    let wait: number;
    if (quick) {
      setFade({ opacity: QUICK_DIM, ms: QUICK_OUT_MS });
      wait = QUICK_OUT_MS;
    } else {
      wait = (dimSince.current ?? 0) + SWAP_HOLD_MS - performance.now();
    }
    if (wait <= 0) {
      swap();
      return;
    }
    holding.current = true;
    holdTimer.current = window.setTimeout(swap, wait);
  }, [version]);

  // Asked for, not here yet: dim. The ask ended without a new list (it
  // failed, or answered with what is on screen): come back up.
  useLayoutEffect(() => {
    if (pending) {
      if (dimSince.current !== null || prefersReducedMotion()) return;
      dimSince.current = performance.now();
      setFade({ opacity: SWAP_DIM, ms: SWAP_DIM_MS });
      return;
    }
    if (dimSince.current !== null && !holding.current && latest.current === onScreen.current) {
      dimSince.current = null;
      setFade({ opacity: 1, ms: SWAP_RISE_MS });
    }
  }, [pending]);

  // The swap has painted its rows: ease the height from the old list's.
  useLayoutEffect(() => {
    const from = fromHeight.current;
    fromHeight.current = null;
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (from === null || !outer || !inner) return;
    const to = inner.getBoundingClientRect().height;
    if (easing.current) {
      // Mid-ease already: carry on from where it is to the new height.
      outer.style.height = `${to}px`;
      holdHeightUntilSettled();
      return;
    }
    if (Math.abs(to - from) < 1) return;
    outer.style.transition = "none";
    outer.style.height = `${from}px`;
    outer.style.overflowY = clipY();
    void outer.offsetHeight;
    outer.style.transition = `height ${HEIGHT_MS}ms ${CALM_EASE}`;
    outer.style.height = `${to}px`;
    easing.current = true;
    holdHeightUntilSettled();
  }, [shown]);

  // Rows that grow while the height eases (a card opening) are followed.
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const outer = outerRef.current;
      if (!easing.current || !outer) return;
      outer.style.height = `${inner.getBoundingClientRect().height}px`;
      holdHeightUntilSettled();
    });
    ro.observe(inner);
    return () => {
      ro.disconnect();
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(heightTimer.current);
    };
  }, []);

  return (
    <div ref={outerRef} data-list-swap={instance}>
      <div
        ref={innerRef}
        data-list-fade
        className="flow-root"
        style={{
          opacity: fade.opacity,
          transition: fade.ms ? `opacity ${fade.ms}ms ${CALM_EASE}` : undefined,
        }}
      >
        <ListIntro.Provider value={intro && shown === first}>{content}</ListIntro.Provider>
      </div>
    </div>
  );
}
