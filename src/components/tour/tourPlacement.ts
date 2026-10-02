/**
 * Where a walkthrough card goes, given what it is pointing at.
 *
 * Split out of `TourOverlay` because this is the part with rules worth
 * testing, and testing it inside the component would mean standing up a DOM to
 * assert arithmetic. Everything here takes the viewport as an argument rather
 * than reading `window`, which is what makes that possible.
 *
 * Three rules, in priority order:
 *
 * 1. **Never cover the highlight.** The card exists to explain that component;
 *    sitting on top of it defeats the step.
 * 2. **Never hang off the screen.** Every candidate is checked against the
 *    viewport before it is accepted.
 * 3. **Prefer below, then above, then beside.** Reading order, and the two
 *    vertical placements keep the card horizontally centred on the thing it
 *    describes, which is what makes the association obvious without a pointer.
 *
 * When the highlight is large enough that no placement clears it (a full-page
 * table on a short viewport), the least-overlapping viewport corner wins.
 * Covering part of a component the reader can still scroll is a better failure
 * than a card the reader cannot fully read.
 */

/** Where the card should be tried first, when the step has a reason to care. */
export type TourCardSide = "below" | "above" | "left" | "right";

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Minimum breathing room against the viewport edges. */
export const EDGE = 12;
/** Distance between the highlight and the card. */
export const GAP = 14;

/**
 * Below this width the card stops floating and docks to an edge.
 *
 * A phone is the case the "never cover the highlight" rule cannot satisfy: a
 * 366px card and a 390px screen leaves no room beside anything, and a card
 * that tall against an anchor that tall leaves no room above or below either.
 * Every mobile walkthrough worth using solves it the same way, by docking the
 * card to one edge and scrolling the anchor into what is left, which is what
 * `dockedCard` and `scrollBand` below describe. Matches Tailwind's `sm`.
 */
export const NARROW_MAX = 640;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export const boxesOverlap = (a: Box, b: Box): boolean =>
  a.left < b.left + b.width &&
  a.left + a.width > b.left &&
  a.top < b.top + b.height &&
  a.top + a.height > b.top;

const overlapArea = (a: Box, b: Box): number => {
  const w = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return w * h;
};

const DEFAULT_ORDER: TourCardSide[] = ["below", "above", "right", "left"];

/**
 * Clamp a raw anchor rect into a padded highlight box that has on-screen
 * edges.
 *
 * An anchor taller than the window reports a rect whose top and bottom are
 * both outside it, and every placement decision made from that would be about
 * geometry the reader cannot see. Clamping first means "below the highlight"
 * always means below something visible.
 */
export function highlightBox(
  rect: { top: number; left: number; bottom: number; right: number },
  pad: number,
  viewport: Viewport,
): Box {
  const top = clamp(rect.top - pad, -pad, viewport.height);
  const left = clamp(rect.left - pad, -pad, viewport.width);
  const bottom = clamp(rect.bottom + pad, 0, viewport.height + pad);
  const right = clamp(rect.right + pad, 0, viewport.width + pad);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * Pick the card's position. `spot` must already be a `highlightBox`.
 *
 * `prefer` moves one side to the front of the queue without disabling the
 * others, which is what a step needs when something it opens (a right-hand
 * drawer, say) wants the card on the opposite side but the anchor might not
 * leave room there.
 */
export function placeCard(
  spot: Box,
  card: { width: number; height: number },
  viewport: Viewport,
  prefer?: TourCardSide,
): Box {
  const { width, height } = card;
  const maxLeft = Math.max(EDGE, viewport.width - EDGE - width);
  const maxTop = Math.max(EDGE, viewport.height - EDGE - height);
  const centerX = clamp(spot.left + spot.width / 2 - width / 2, EDGE, maxLeft);
  const centerY = clamp(spot.top + spot.height / 2 - height / 2, EDGE, maxTop);

  const candidates: Record<TourCardSide, Box> = {
    below: { top: spot.top + spot.height + GAP, left: centerX, width, height },
    above: { top: spot.top - GAP - height, left: centerX, width, height },
    right: { top: centerY, left: spot.left + spot.width + GAP, width, height },
    left: { top: centerY, left: spot.left - GAP - width, width, height },
  };

  const order = prefer ? [prefer, ...DEFAULT_ORDER.filter((s) => s !== prefer)] : DEFAULT_ORDER;
  for (const side of order) {
    const box = candidates[side];
    const fits =
      box.top >= EDGE &&
      box.left >= EDGE &&
      box.top + height <= viewport.height - EDGE &&
      box.left + width <= viewport.width - EDGE;
    if (fits && !boxesOverlap(box, spot)) return box;
  }

  const corners: Box[] = [
    { top: EDGE, left: EDGE, width, height },
    { top: EDGE, left: maxLeft, width, height },
    { top: maxTop, left: EDGE, width, height },
    { top: maxTop, left: maxLeft, width, height },
  ];
  return corners.reduce((best, c) => (overlapArea(c, spot) < overlapArea(best, spot) ? c : best));
}

/** Which edge the card docks to on a narrow screen. */
export type DockEdge = "top" | "bottom";

/**
 * The card's box when it is docked to an edge.
 *
 * Full width less the gutters, so the copy keeps a readable measure on a
 * phone instead of being squeezed into whatever a floating card could claim.
 */
export function dockedCard(edge: DockEdge, cardHeight: number, viewport: Viewport): Box {
  const width = viewport.width - EDGE * 2;
  const height = Math.min(cardHeight, viewport.height - EDGE * 2);
  return {
    left: EDGE,
    top: edge === "top" ? EDGE : viewport.height - EDGE - height,
    width,
    height,
  };
}

/**
 * The strip of screen left over once the card has docked, in viewport
 * coordinates. The anchor is scrolled into this, not into the whole window,
 * which is the difference between "the highlight is on screen" and "the reader
 * can see the highlight".
 */
export function scrollBand(card: Box, edge: DockEdge, viewport: Viewport) {
  return edge === "top"
    ? { top: card.top + card.height + GAP, bottom: viewport.height - EDGE }
    : { top: EDGE, bottom: card.top - GAP };
}

/**
 * The edge to actually dock to, given where the highlight ended up.
 *
 * `preferred` is what the step asked for, and it usually wins. It loses when
 * the highlight cannot be scrolled clear of it, which happens on a page too
 * short to scroll: the reporting builder is one screen tall, so its run and
 * export row sits low no matter what, and a bottom-docked card lands straight
 * on it. Flipping to the other edge is free and clears it.
 */
export function resolveDockEdge(
  spot: Box,
  cardHeight: number,
  viewport: Viewport,
  preferred: DockEdge,
): DockEdge {
  const clears = (edge: DockEdge) => !boxesOverlap(dockedCard(edge, cardHeight, viewport), spot);
  if (clears(preferred)) return preferred;
  const other: DockEdge = preferred === "top" ? "bottom" : "top";
  return clears(other) ? other : preferred;
}

/**
 * How far to scroll so `rect` sits inside `band`.
 *
 * Positive means scroll down. An anchor taller than the band is aligned to the
 * band's top rather than centred, because a reader needs to see where a
 * component starts more than they need it balanced.
 */
export function scrollDeltaIntoBand(
  rect: { top: number; height: number },
  band: { top: number; bottom: number },
): number {
  const bandHeight = band.bottom - band.top;
  if (bandHeight <= 0) return 0;
  if (rect.height >= bandHeight) return rect.top - band.top;
  const targetTop = band.top + (bandHeight - rect.height) / 2;
  return rect.top - targetTop;
}
