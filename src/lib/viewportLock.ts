/**
 * Lock the viewport on touch devices so a report cannot be zoomed or panned.
 *
 * The customer-facing report is a fixed app shell: `html`, `body` and `#root`
 * are `position: fixed` with their own inner scroll container, so the *layout*
 * already cannot move. Browser zoom escapes that lock entirely — it scales the
 * visual viewport above the layout viewport, which is why a zoomed report pans
 * around under your finger with the sticky header sliding off screen.
 *
 * Three separate mechanisms can start that zoom, and each needs its own fix.
 * Only the first one is what actually bit us in production:
 *
 *   1. FOCUS ZOOM (the real cause). iOS Safari zooms in whenever a focused
 *      input has a computed `font-size` below 16px, and it does NOT zoom back
 *      out on blur. The sign-in fields were `text-sm` (14px), so signing in on
 *      an iPhone left the whole report zoomed for the rest of the session.
 *      Fixed in CSS — see the `pointer: coarse` block in index.css.
 *
 *   2. PINCH. `user-scalable=no` and `maximum-scale=1` in the viewport meta
 *      handle Chrome and Firefox on Android. iOS Safari has deliberately
 *      ignored both since iOS 10, and it ignores `touch-action` for page zoom
 *      too, so neither the meta tag nor the existing `touch-action: pan-x
 *      pan-y` rule does anything there. Preventing WebKit's non-standard
 *      `gesture*` events is the only lever Safari actually honours, and it is
 *      what this module exists for.
 *
 *   3. DOUBLE-TAP. Handled by `touch-action`, which Safari does honour for
 *      double-tap (just not for pinch). No JS needed.
 *
 * Deliberately NOT blocked: ctrl+wheel and keyboard zoom on desktop. Those are
 * the reader's own browser zoom on a device that has no panning problem, and
 * taking them away would be hostile for no gain.
 */

/** Installs the lock. Returns a teardown for symmetry; the app never calls it. */
export function installViewportLock(): () => void {
  if (typeof document === "undefined") return () => {};

  const block = (event: Event) => {
    event.preventDefault();
  };

  // WebKit-only pinch gesture events. Safari fires these INSTEAD of honouring
  // any of the declarative controls, so this listener is the whole reason the
  // module exists. `passive: false` is required — a passive listener cannot
  // call preventDefault and the browser silently ignores it.
  const gestureEvents = ["gesturestart", "gesturechange", "gestureend"];
  for (const name of gestureEvents) {
    document.addEventListener(name, block, { passive: false });
  }

  // Every other touch engine: a second finger on the glass is a pinch. Guarded
  // on touch count so ordinary one-finger scrolling is untouched — cancelling
  // every touchmove would freeze the report's inner scroller.
  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length > 1) event.preventDefault();
  };
  document.addEventListener("touchmove", onTouchMove, { passive: false });

  return () => {
    for (const name of gestureEvents) {
      document.removeEventListener(name, block);
    }
    document.removeEventListener("touchmove", onTouchMove);
  };
}

export default installViewportLock;
