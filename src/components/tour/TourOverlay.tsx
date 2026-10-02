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
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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
}

/** Spotlight padding around the anchored element. Viewport margins and the
 *  card gap live in `tourPlacement`, which owns the geometry. */
const SPOT_PAD = 8;

/** Extra padding the cutout starts at before settling, the "zoom in" travel. */
const SETTLE_PAD = 22;

/** Anchor polling while a page loads its data: 50 x 100ms = 5s of grace. */
const SCROLL_POLL_MS = 100;
const SCROLL_ATTEMPTS = 50;

/** Above this many steps a dot per step is unreadable, so switch to a bar. */
const MAX_DOTS = 12;

/** Card width, and the height assumed for one frame before it is measured. */
const CARD_W = 384;
const CARD_H_GUESS = 210;

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
}: TourOverlayProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
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
  const activeAnchor = (narrow && step?.mobileAnchor) || step?.anchor;

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
   * Drives the settle-in animation: each step starts with the cutout slightly
   * oversized and relaxes to the measured box, which reads as the highlight
   * closing in on the component rather than teleporting onto it. Purely
   * decorative, and skipped outright under `prefers-reduced-motion`.
   */
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!open || !spotlight) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setSettled(true);
      return;
    }
    setSettled(false);
    const raf = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(raf);
  }, [open, index, spotlight]);

  /** Track the anchor's rect every frame so the spotlight follows scroll,
   *  resizes, and the smooth scrollIntoView above, only re-rendering when
   *  the measured box actually moved. Skipped entirely in `panel` mode,
   *  which draws no spotlight and so has nothing to measure. */
  useEffect(() => {
    if (!open || !spotlight) return;
    let raf = 0;
    const tick = () => {
      const el = activeAnchor
        ? document.querySelector<HTMLElement>(`[data-tour="${activeAnchor}"]`)
        : null;
      const r = el ? el.getBoundingClientRect() : null;
      setRect((prev) => {
        if (!prev && !r) return prev;
        if (
          prev &&
          r &&
          prev.top === r.top &&
          prev.left === r.left &&
          prev.width === r.width &&
          prev.height === r.height
        ) {
          return prev;
        }
        return r;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, index, activeAnchor, spotlight]);

  /**
   * Measure the card rather than assume it.
   *
   * Placement has to know the real height or a long step overflows the bottom
   * edge, and the height is only knowable after the body has rendered. The
   * card is hidden for that one frame (see `measured`) so nobody sees it at
   * the guessed position.
   */
  const [cardSize, setCardSize] = useState({ width: CARD_W, height: CARD_H_GUESS });
  const [measured, setMeasured] = useState(false);
  useEffect(() => {
    setMeasured(false);
  }, [index, open]);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!open || !el) return;
    const read = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      cardHeightRef.current = height;
      setCardSize((prev) =>
        Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width, height },
      );
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

  // The highlight box, padded and clamped to the viewport. Everything below
  // positions against this rather than the raw rect, so an anchor that runs
  // off the bottom of the screen still yields a box with on-screen edges.
  const pad = settled ? SPOT_PAD : SETTLE_PAD;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const spot: Box | null = rect ? highlightBox(rect, pad, viewport) : null;

  const cardW = Math.min(CARD_W, viewport.width - EDGE * 2);
  let cardStyle: React.CSSProperties | undefined;
  if (spotlight) {
    if (narrow && spot) {
      // Phone: dock to an edge and let the anchor have the rest. Floating a
      // card this wide next to anything on a 390px screen is not a placement
      // problem that has a good answer, and every candidate would cover the
      // highlight it is describing. The edge is re-checked against where the
      // highlight actually ended up, because a page too short to scroll cannot
      // move it out from under the preferred edge.
      const edge = resolveDockEdge(spot, cardSize.height, viewport, dockEdge);
      const box = dockedCard(edge, cardSize.height, viewport);
      cardStyle = { position: "fixed", top: box.top, left: box.left, width: box.width };
    } else if (spot) {
      const box = placeCard(
        spot,
        { width: cardW, height: cardSize.height },
        viewport,
        step.cardSide,
      );
      cardStyle = { position: "fixed", top: box.top, left: box.left, width: cardW };
    } else {
      cardStyle = {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: cardW,
      };
    }
  }

  /**
   * The click-catcher, as four panes around the highlight instead of one sheet
   * over everything. The pane layout is what lets a step both keep the rest of
   * the page inert and leave the component it is pointing at clickable, so a
   * step can say "press Send" and mean it.
   */
  const catcher =
    inert && spot ? (
      <>
        <div className="absolute inset-x-0 top-0" style={{ height: Math.max(0, spot.top) }} />
        <div className="absolute inset-x-0 bottom-0" style={{ top: spot.top + spot.height }} />
        <div
          className="absolute left-0"
          style={{ top: spot.top, height: spot.height, width: Math.max(0, spot.left) }}
        />
        <div
          className="absolute right-0"
          style={{ top: spot.top, height: spot.height, left: spot.left + spot.width }}
        />
      </>
    ) : inert ? (
      <div className="absolute inset-0" />
    ) : null;

  const progress = (
    <div className="flex min-w-0 items-center gap-2">
      {steps.length <= MAX_DOTS ? (
        <div className="flex items-center gap-1.5">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-4 bg-primary" : "w-1.5 bg-muted",
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
        "fixed inset-0 z-[100]",
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
          {catcher}
          {spot ? (
            /* Spotlight. The 9999px shadow dims the whole page except this
               box, so the anchored component keeps its real colours while
               everything around it recedes: nothing is drawn over the thing
               the copy is about. The pad animates from SETTLE_PAD down to
               SPOT_PAD on each step, and because the same element is reused
               across steps the browser also tweens top/left/width/height,
               so moving between two anchors glides instead of cutting.

               An interactive step keeps the ring and drops the dimming: the
               reader is about to work in the page, and anything the page opens
               in response would otherwise come up underneath a grey sheet. */
            <div
              className={cn(
                "pointer-events-none fixed rounded-2xl transition-all duration-300 ease-out",
                inert ? "ring-2 ring-primary/70" : "ring-[3px] ring-primary",
              )}
              style={{
                top: spot.top,
                left: spot.left,
                width: spot.width,
                height: spot.height,
                boxShadow: inert
                  ? `0 0 0 9999px rgba(15, 23, 42, ${settled ? 0.55 : 0.4})`
                  : // No backdrop to separate it from the page, so the ring has
                    // to carry the whole job of saying "here". A tinted halo
                    // plus a lift shadow does what the dimming did, without
                    // taking the page away from a reader who is about to use it.
                    "0 0 0 6px rgba(21, 81, 53, 0.14), 0 10px 34px rgba(15, 23, 42, 0.14)",
              }}
            />
          ) : (
            inert && <div className="pointer-events-none fixed inset-0 bg-slate-900/55" />
          )}
        </>
      )}

      {/* Step card. */}
      <div
        ref={cardRef}
        style={cardStyle}
        className={cn(
          "pointer-events-auto flex flex-col rounded-2xl border border-border bg-card p-5 shadow-xl",
          // Anchored cards fade in once they have been measured, so nobody
          // sees the one frame drawn at the guessed height.
          spotlight && "transition-[top,left,opacity] duration-200 ease-out",
          spotlight && !measured && "opacity-0",
          // A docked card must leave the anchor more room than it takes, or
          // the step is a card with a sliver of page behind it. The body
          // scrolls inside the cap rather than pushing the card taller.
          spotlight && narrow && "max-h-[46vh] p-4",
          !spotlight &&
            "fixed inset-x-3 bottom-3 max-h-[70vh] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[24rem]",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {step.eyebrow && (
              /* Sentence case, not uppercase. A shouted label is heavier than
                 the title under it, which inverts the hierarchy the card is
                 built on, and it does not match the rest of the report. */
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">{step.eyebrow}</p>
            )}
            <h2 className="text-sm font-semibold text-foreground">{step.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${ariaLabel}`}
            className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto text-[13px] leading-relaxed text-muted-foreground">
          {step.body}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          {footer ?? progress}
          <div className="flex shrink-0 items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => onIndexChange(index - 1)}
                className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-muted hover:text-slate-900"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? onClose() : onIndexChange(index + 1))}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {last ? doneLabel : "Next"}
              {!last && <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        {/* When a caller supplies its own footer control the progress
            indicator still has to live somewhere, so it drops to its own row
            rather than competing with the control for the same slot. */}
        {footer && <div className="mt-3 border-t border-border pt-3">{progress}</div>}
      </div>
    </div>,
    document.body,
  );
}
