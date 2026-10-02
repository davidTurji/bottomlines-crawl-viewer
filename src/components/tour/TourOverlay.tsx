/**
 * TourOverlay, the walkthrough shell.
 *
 * Ported from bottomlines-app (src/components/tour/TourOverlay.tsx) so the
 * report walkthrough looks and moves exactly like the console's. Trimmed of
 * the two things the viewer has no use for: scripted demos (tourDemo) and the
 * hand-off launch button. It owns nothing but presentation: the caller holds
 * the step list and the current index.
 *
 * Two variants, because the two callers need opposite things from the page:
 *
 * - `spotlight` punches a hole in a dimmed backdrop over a `[data-tour="…"]`
 *   anchor and makes the page inert. Right when the copy is about one control.
 * - `panel` docks the card in a corner, draws no backdrop and never captures
 *   a click, so the page it is describing stays fully readable and usable.
 *   Right when the copy is about a whole page the user should be poking at.
 *
 * A step whose anchor is missing (not rendered in the current state) falls
 * back to a centered card, so the walkthrough never breaks on state it cannot
 * see.
 *
 * Three rules govern where the card lands, and they are the whole reason this
 * file is more than a positioned div:
 *
 * 1. **The card never covers the spotlight.** It is explaining that component;
 *    sitting on top of it defeats the step. Placement tries below, above,
 *    right and left, takes the first that both fits the viewport and clears
 *    the highlight, and only falls back to a corner when the anchor is so
 *    large that nothing clears it.
 * 2. **The card is never half off screen.** Every candidate is clamped inside
 *    the viewport before it is accepted, and the card is measured rather than
 *    guessed, so a long step does not overflow the bottom edge.
 * 3. **The spotlight is clamped to the viewport.** An anchor taller than the
 *    screen would otherwise report a box with no on-screen edges, and every
 *    placement decision made from it would be about geometry the reader cannot
 *    see.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  dockedCard,
  EDGE,
  highlightBox,
  NARROW_MAX,
  placeCard,
  resolveDockEdge,
  scrollBand,
  scrollDeltaIntoBand,
  type Box,
  type DockEdge,
  type TourCardSide,
} from "@/components/tour/tourPlacement";
import { cn } from "@/lib/utils";

export type { TourCardSide };

export interface TourStep {
  /**
   * Stable identifier, persisted instead of the numeric index so a walkthrough
   * that is resumed after the step list changed lands on the step the reader
   * was actually on rather than whatever now occupies that slot.
   */
  id: string;
  /** Matches a `[data-tour="…"]` element on the page; omit for a centered card. */
  anchor?: string;
  /**
   * Anchor to use instead of `anchor` on a narrow screen.
   *
   * For the steps whose subject is a different element on a phone. The rail is
   * the case that forced it: on desktop it is a permanent column, and on
   * mobile that column does not exist at all until someone taps the menu
   * button, so a step about navigation has to point at the button instead.
   */
  mobileAnchor?: string;
  /** Small label above the title, e.g. the sidebar section the step is in. */
  eyebrow?: string;
  title: string;
  body: React.ReactNode;
  /**
   * Let the reader actually use the page on this step.
   *
   * Drops the dimmed backdrop and the click-catcher, leaving only the ring
   * around the anchor and the card. Set it on any step that asks the reader to
   * do something (type a question, press Send), because the default spotlight
   * deliberately makes the page inert and would swallow that click. It also
   * keeps the walkthrough out of the way of anything the page opens in
   * response, which would otherwise render under the backdrop.
   */
  interactive?: boolean;
  /**
   * Placement to try first. Only worth setting when something the step causes
   * to appear (a right-hand drawer, say) needs the card on the other side.
   *
   * On a narrow screen, where the card docks to an edge rather than floating,
   * `"above"` is what docks it to the top instead of the bottom.
   */
  cardSide?: TourCardSide;
}

export interface TourOverlayProps {
  open: boolean;
  steps: TourStep[];
  /** Index into `steps`. Clamped by the caller; out-of-range renders nothing. */
  index: number;
  onIndexChange: (index: number) => void;
  /** Called by the close button, Esc, and the final step's primary button. */
  onClose: () => void;
  /** Accessible name for the dialog, e.g. "Crawler walkthrough". */
  ariaLabel: string;
  variant?: "spotlight" | "panel";
  /** Extra control rendered on the left of the footer, e.g. a Skip link. */
  footer?: React.ReactNode;
  /** Label for the primary button on the last step. */
  doneLabel?: string;
  /**
   * A page change in progress. While set, the highlight points at `anchor`
   * (the page's link in the rail, or the menu button on a phone) and the card
   * says where the walkthrough is going, with a bar that fills over
   * `durationMs`. The caller owns the navigation and clears this once the new
   * page is on screen.
   */
  transit?: { anchor: string; title: string; durationMs: number } | null;
}

/** Spotlight padding around the anchored element. Viewport margins and the
 *  card gap live in `tourPlacement`, which owns the geometry. */
const SPOT_PAD = 8;


/** How long a glide between two steps takes. One clock and one ease-out-quint
 *  for the highlight and the card, so they travel as one piece. */
const GLIDE_MS = 520;

/** How long the highlight holds its last spot while the next step's page
 *  loads, before giving up on the anchor and centring the card. */
const HOLD_MS = 1500;

/** Anchor polling while a page loads its data: 50 x 100ms = 5s of grace. */
const SCROLL_POLL_MS = 100;
const SCROLL_ATTEMPTS = 50;

/** Above this many steps a dot per step is unreadable, so switch to a bar. */
const MAX_DOTS = 12;

/** Card width, and the height assumed for one frame before it is measured. */
const CARD_W = 320;
const CARD_H_GUESS = 140;

/** A box partway from `a` to `b`. */
function lerpBox(a: Box, b: Box, e: number): Box {
  return {
    top: a.top + (b.top - a.top) * e,
    left: a.left + (b.left - a.left) * e,
    width: a.width + (b.width - a.width) * e,
    height: a.height + (b.height - a.height) * e,
  };
}

/** Corner radius of the hole and the frame (rounded-2xl). */
const HOLE_RADIUS = 16;

/**
 * The backdrop's clip: the whole viewport with `box` cut out as a rounded
 * rectangle (even-odd fill). Sub-pixel values are kept, so a glide is smooth
 * rather than stepping a pixel at a time.
 */
function holePath(box: Box, viewport: { width: number; height: number }): string {
  const { top: y, left: x, width: w, height: h } = box;
  const r = Math.max(0, Math.min(HOLE_RADIUS, w / 2, h / 2));
  const f = (n: number) => n.toFixed(2);
  return (
    `path(evenodd, "M0 0H${f(viewport.width)}V${f(viewport.height)}H0Z ` +
    `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}` +
    `V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}` +
    `H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}` +
    `V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z")`
  );
}

/**
 * The element that actually scrolls `el`, which is not always the window.
 *
 * The viewer puts its page content in a scrolling region inside the shell (Layout's <main>), so
 * `window.scrollBy` moves nothing on most routes. `scrollIntoView` finds this
 * by itself; the phone path needs to scroll by a computed delta instead, and
 * so has to find it too.
 */
function scrollParentOf(el: Element): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const style = getComputedStyle(p);
    const scrollable = /(auto|scroll|overlay)/.test(style.overflowY);
    if (scrollable && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return document.scrollingElement ?? document.documentElement;
}

export function TourOverlay({
  open,
  steps,
  index,
  onIndexChange,
  onClose,
  ariaLabel,
  variant = "spotlight",
  footer,
  doneLabel = "Done",
  transit = null,
}: TourOverlayProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[index];
  const last = index === steps.length - 1;
  const spotlight = variant === "spotlight";
  /** An interactive step keeps the page live: no backdrop, no click-catcher. */
  const inert = spotlight && !step?.interactive;

  /**
   * Phone layout, tracked live rather than read once, so rotating the device
   * or resizing a desktop window down re-lays the card instead of leaving it
   * floating somewhere that no longer fits.
   */
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= NARROW_MAX,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_MAX}px)`);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /** Which edge a docked card takes. `above` is the opt-out from the default. */
  const dockEdge: DockEdge = step?.cardSide === "above" ? "top" : "bottom";
  /** The anchor this viewport should actually point at. */
  const activeAnchor = transit?.anchor ?? ((narrow && step?.mobileAnchor) || step?.anchor);
  /** A page change points at a rail link, so the card goes beside it. */
  const cardSide = transit ? "right" : step?.cardSide;

  /**
   * Bring the anchored element into view when the step changes.
   *
   * Polled rather than run once, because the walkthrough navigates between
   * report pages and each one shows a skeleton until its data arrives: at the moment
   * the step opens, the page describing it usually has not mounted yet. A
   * single attempt would therefore miss on precisely the steps that change
   * page, leaving the reader on a highlighted element somewhere off screen.
   *
   * `block` is chosen from the element's own height. Centering is right for a
   * card or a chart, but an anchor taller than the viewport centered is an
   * anchor whose top and bottom are both off screen, which reads as the
   * walkthrough having scrolled to nowhere in particular. Those align to the
   * top instead, so the reader starts where the component starts.
   *
   * Stops on the first hit, and gives up after `SCROLL_ATTEMPTS` so a step
   * naming an anchor that genuinely never renders cannot poll forever.
   */
  /** Latest measured card height, read by the scroll routine without making it
   *  a dependency: re-running the poll on every measurement would restart it. */
  const cardHeightRef = useRef(CARD_H_GUESS);

  const revealAnchor = useCallback(
    (el: Element) => {
      if (!narrow) {
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.7;
        el.scrollIntoView({ behavior: "smooth", block: tall ? "start" : "center" });
        return;
      }
      // Phone: the card owns one edge of the screen, so "in view" has to mean
      // "in the part of the screen the card is not standing on".
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const card = dockedCard(dockEdge, cardHeightRef.current, viewport);
      const band = scrollBand(card, dockEdge, viewport);
      const delta = scrollDeltaIntoBand(el.getBoundingClientRect(), band);
      if (Math.abs(delta) < 2) return;
      const scroller = scrollParentOf(el);
      scroller.scrollBy({ top: delta, behavior: "smooth" });
    },
    [narrow, dockEdge],
  );

  useEffect(() => {
    if (!open || !activeAnchor) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      const el = document.querySelector(`[data-tour="${activeAnchor}"]`);
      if (el) {
        revealAnchor(el);
        window.clearInterval(timer);
      } else if (++attempts >= SCROLL_ATTEMPTS) {
        window.clearInterval(timer);
      }
    }, SCROLL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, index, activeAnchor, revealAnchor]);

  /**
   * ONE PAINT LOOP MOVES EVERYTHING (David, 2026-10-02: "extremely laggy",
   * "cutting lines", "no blipping").
   *
   * Every frame it measures the anchor, eases the highlight toward it, and
   * writes the result straight onto three elements: the backdrop's cut-out,
   * the frame around it, and the card. Nothing here goes through React, so a
   * step change re-renders the card's words once and then the motion is pure
   * style writes. The earlier version set React state every frame and moved
   * four blurred panes plus the card with CSS transitions on layout
   * properties: each frame re-laid-out and re-blurred five elements, the
   * transitions restarted on every scroll frame, and the four panes met in
   * visible seams around a rounded hole.
   *
   * The glide: on a step change (or when a page that was still loading
   * produces its anchor) the loop eases from wherever things are on screen to
   * where they belong, over GLIDE_MS on an ease-out-quint, retargeting every
   * frame so a page scrolling underneath is followed, not chased. Outside a
   * glide they track the anchor exactly.
   */
  const shownRef = useRef<Box | null>(null);
  const cardPosRef = useRef<{ left: number; top: number } | null>(null);
  const glideRef = useRef<{ box: Box | null; card: { left: number; top: number } | null; start: number }>({
    box: null,
    card: null,
    start: 0,
  });
  const dimRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  /** Start a glide from wherever the highlight and card are right now. */
  const kickGlide = useCallback(() => {
    glideRef.current = { box: shownRef.current, card: cardPosRef.current, start: performance.now() };
  }, []);
  // A new step, and also a new anchor within one step: a page change points
  // at the rail first and at the step's own anchor after, and both are moves.
  useEffect(() => {
    if (open) kickGlide();
  }, [open, index, activeAnchor, kickGlide]);

  useEffect(() => {
    if (!open || !spotlight) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0;
    // HOLD THE LAST SPOT across a page change. The next step's anchor does not
    // exist until its page has loaded; dropping it closed the hole (a dark
    // flash) and reopened it somewhere else. Held, everything stays put for
    // that moment and then glides over.
    let missingSince = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = activeAnchor
        ? document.querySelector<HTMLElement>(`[data-tour="${activeAnchor}"]`)
        : null;
      let r: DOMRect | null = el ? el.getBoundingClientRect() : null;
      if (r && r.width === 0 && r.height === 0) r = null;
      if (r) {
        // Found after a wait: open a glide for this move.
        if (missingSince) kickGlide();
        missingSince = 0;
      } else if (activeAnchor) {
        missingSince ||= performance.now();
        if (performance.now() - missingSince < HOLD_MS) return;
      }

      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const target = r ? highlightBox(r, SPOT_PAD, viewport) : null;
      const cardH = cardHeightRef.current;
      const cardW = Math.min(CARD_W, viewport.width - EDGE * 2);
      const narrowNow = viewport.width <= NARROW_MAX;
      let cardTarget: { left: number; top: number; width: number };
      if (target && narrowNow) {
        const edge = resolveDockEdge(target, cardH, viewport, dockEdge);
        const b = dockedCard(edge, cardH, viewport);
        cardTarget = { left: b.left, top: b.top, width: b.width };
      } else if (target) {
        const b = placeCard(target, { width: cardW, height: cardH }, viewport, cardSide);
        cardTarget = { left: b.left, top: b.top, width: cardW };
      } else {
        cardTarget = {
          left: (viewport.width - cardW) / 2,
          top: Math.max(EDGE, (viewport.height - cardH) / 2),
          width: cardW,
        };
      }

      // Ease toward the targets while a glide is running.
      const g = glideRef.current;
      const t = reduce ? 1 : Math.min(1, (performance.now() - g.start) / GLIDE_MS);
      const e = 1 - Math.pow(1 - t, 5);
      const box = target && g.box && t < 1 ? lerpBox(g.box, target, e) : target;
      const card =
        g.card && t < 1
          ? {
              left: g.card.left + (cardTarget.left - g.card.left) * e,
              top: g.card.top + (cardTarget.top - g.card.top) * e,
            }
          : { left: cardTarget.left, top: cardTarget.top };
      shownRef.current = box;
      cardPosRef.current = card;

      const dim = dimRef.current;
      if (dim) {
        dim.style.clipPath = box ? holePath(box, viewport) : "none";
      }
      const frame = frameRef.current;
      if (frame) {
        if (box) {
          frame.style.opacity = "1";
          frame.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
          frame.style.width = `${box.width}px`;
          frame.style.height = `${box.height}px`;
        } else {
          frame.style.opacity = "0";
        }
      }
      const cardEl = cardRef.current;
      if (cardEl) {
        cardEl.style.transform = `translate3d(${card.left}px, ${card.top}px, 0)`;
        cardEl.style.width = `${cardTarget.width}px`;
        cardEl.style.opacity = "1";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, index, steps, activeAnchor, cardSide, spotlight, dockEdge, kickGlide]);

  /**
   * Measure the card rather than assume it.
   *
   * Placement has to know the real height or a long step overflows the bottom
   * edge, and the height is only knowable after the body has rendered. The
   * paint loop reads it from `cardHeightRef` every frame; the card stays
   * invisible until the loop's first placement, so nobody sees it at the
   * guessed position.
   */
  const [measured, setMeasured] = useState(false);
  // Reset only when the walkthrough closes. Resetting this on every step
  // faded the card out and back in on each Next, which read as a blink.
  useEffect(() => {
    if (!open) setMeasured(false);
  }, [open]);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!open || !el) return;
    const read = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      cardHeightRef.current = height;
      setMeasured(true);
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, index]);

  /**
   * Second reveal, once the card's real height is known.
   *
   * The first one runs the moment the anchor appears, when the card height is
   * still the guess, so on a phone the band it scrolled into was the wrong
   * size. Correcting after measurement costs one short scroll and is the
   * difference between the highlight sitting just under the card and sitting
   * comfortably in the space above it. Desktop skips it: `scrollIntoView`
   * there never depended on the card in the first place.
   */
  useEffect(() => {
    if (!open || !narrow || !measured || !activeAnchor) return;
    const el = document.querySelector(`[data-tour="${activeAnchor}"]`);
    if (el) revealAnchor(el);
    // Deliberately not depending on `revealAnchor`: it changes identity with
    // `narrow`, and re-running this on that alone would fight a resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, narrow, measured, activeAnchor]);

  /** Keyboard: Esc always leaves. Arrows only step while the page underneath
   *  is inert. On a `panel` or an interactive step the page keeps its own
   *  focus and scrolling, so swallowing arrow keys there would break typing in
   *  a filter box and paging through a table. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (!inert) return;
      if (e.key === "ArrowRight" && !last) onIndexChange(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, last, onClose, onIndexChange, inert]);

  if (!open || !step) return null;

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const cardW = Math.min(CARD_W, viewport.width - EDGE * 2);
  // Position, width and opacity are written by the paint loop above. React
  // owns only what does not move, so a re-render can never yank the card.
  const cardStyle: React.CSSProperties | undefined = spotlight
    ? { position: "fixed", top: 0, left: 0, width: cardW, opacity: 0, willChange: "transform" }
    : undefined;

  const progress = (
    <div className="flex min-w-0 items-center gap-2">
      {steps.length <= MAX_DOTS ? (
        <div className="flex items-center gap-1.5">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-4 bg-primary" : i < index ? "w-1.5 bg-primary/35" : "w-1.5 bg-slate-200",
              )}
            />
          ))}
        </div>
      ) : (
        /* Long walkthroughs get a bar plus a count: twenty-plus dots read as
           noise and stop answering "how much is left", which is the one thing
           a reader wants from a progress indicator on a long walkthrough. */
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-200"
              style={{ width: `${((index + 1) / steps.length) * 100}%` }}
            />
          </div>
          <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
            {index + 1} / {steps.length}
          </span>
        </div>
      )}
    </div>
  );

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[100] animate-tour-fade motion-reduce:animate-none",
        // Anything that is not the click-catcher must let clicks through: in
        // panel mode the page is the point, and on an interactive step the
        // reader is being asked to use it.
        !inert && "pointer-events-none",
      )}
      role="dialog"
      aria-modal={inert}
      aria-label={ariaLabel}
    >
      {spotlight && (
        <>
          {/* THE BACKDROP: one layer, darkened and lightly blurred, with the
              highlight cut out of it as a rounded hole (clip-path, written
              by the paint loop). One element means no seams, and the hole's
              corners are the frame's corners exactly. clip-path also clips
              hit-testing, so this same layer is the click-catcher: the page
              is inert everywhere except inside the hole. An interactive step
              has no backdrop at all, so the reader can use the page. */}
          {inert && (
            <div
              ref={dimRef}
              className="absolute inset-0"
              style={{
                background: "rgba(15, 23, 42, 0.5)",
                backdropFilter: "blur(3px)",
                WebkitBackdropFilter: "blur(3px)",
              }}
            />
          )}
          {/* THE FRAME: still, never pulsing. A white hairline and a faint
              green edge, toned down (David, 2026-10-02: "the green glow a
              bit too much"). */}
          <div
            ref={frameRef}
            aria-hidden
            className="pointer-events-none fixed left-0 top-0 rounded-2xl"
            style={{
              opacity: 0,
              willChange: "transform",
              boxShadow: inert
                ? "0 0 0 1.5px rgba(255, 255, 255, 0.85), 0 0 0 4px rgba(52, 168, 110, 0.12)"
                : // No backdrop to separate it from the page, so the frame
                  // carries the whole job of saying "here".
                  "0 0 0 3px hsl(var(--primary)), 0 0 0 7px rgba(21, 81, 53, 0.12), 0 10px 34px rgba(15, 23, 42, 0.14)",
            }}
          />
        </>
      )}

      {/* Step card. */}
      <div
        ref={cardRef}
        style={cardStyle}
        className={cn(
          // Solid white: a see-through card let the page's text ghost through
          // its words.
          "pointer-events-auto flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.4)]",
          // The loop fades it in once, on its first placement.
          spotlight && "transition-opacity duration-300",
          // A docked card must leave the anchor more room than it takes, or
          // the step is a card with a sliver of page behind it. The body
          // scrolls inside the cap rather than pushing the card taller.
          spotlight && narrow && "max-h-[46vh]",
          !spotlight &&
            "fixed inset-x-3 bottom-3 max-h-[70vh] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[24rem]",
        )}
      >
        {transit ? (
          /* THE PAGE CHANGE (David, 2026-10-02: "it is not clear it is moving
             pages"). The highlight sits on the page's link in the rail, the
             card says where it is going, and the bar fills while the page
             switches underneath, so the move reads as a move. */
          <div
            key={`transit-${transit.title}`}
            className="animate-tour-card-in motion-reduce:animate-none"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ArrowRight className="h-4 w-4 animate-tour-arrow motion-reduce:animate-none" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-primary">Moving to</p>
                <h2 className="text-[15px] font-semibold leading-snug text-slate-900">
                  {transit.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={`Close ${ariaLabel}`}
                className="-mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full origin-left rounded-full bg-primary animate-tour-progress motion-reduce:animate-none"
                style={{ animationDuration: `${transit.durationMs}ms` }}
              />
            </div>
          </div>
        ) : (
        <>
        {/* Keyed on the step, so each step's words ease in rather than
            swapping under the reader while the card glides to its new spot. */}
        <div key={step.id} className="flex min-h-0 flex-1 flex-col animate-tour-card-in motion-reduce:animate-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {step.eyebrow && (
                /* Sentence case, not uppercase. A shouted label is heavier
                   than the title under it, which inverts the hierarchy the
                   card is built on, and it does not match the report. */
                <p className="mb-0.5 text-[11px] font-semibold text-primary">{step.eyebrow}</p>
              )}
              <h2 className="text-[14px] font-semibold leading-snug text-slate-900">{step.title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${ariaLabel}`}
              className="-mr-1.5 -mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-1 min-h-0 flex-1 overflow-y-auto text-[12.5px] leading-snug text-slate-500 [&_strong]:font-semibold [&_strong]:text-slate-800">
            {step.body}
          </div>
        </div>
        <div className="mt-3.5 flex items-center justify-between gap-3">
          {footer ?? progress}
          <div className="flex shrink-0 items-center gap-1.5">
            {index > 0 && (
              <button
                type="button"
                onClick={() => onIndexChange(index - 1)}
                aria-label="Back"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-all duration-200 hover:border-slate-300 hover:text-slate-800 active:scale-95"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? onClose() : onIndexChange(index + 1))}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-gradient-to-b from-[hsl(152_50%_32%)] to-primary pl-4 pr-3 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
            >
              {last ? doneLabel : "Next"}
              {last ? <span className="w-1" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        {/* When a caller supplies its own footer control the progress
            indicator still has to live somewhere, so it drops to its own row
            rather than competing with the control for the same slot. */}
        {footer && <div className="mt-3 border-t border-border pt-3">{progress}</div>}
        </>
        )}
      </div>
    </div>,
    document.body,
  );
}
