import { Sparkles } from "lucide-react";
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useAskAi } from "@/lib/askAi";
import { useReportScope } from "@/lib/reportScope";
import { cn } from "@/lib/utils";

// The report does not download or parse the chat UI until it is opened.
const AskAIPanel = lazy(() => import("@/components/AskAIPanel"));

function PanelNotice({ onClose, failed = false }: { onClose: () => void; failed?: boolean }) {
  return (
    <div className="p-4 text-sm text-slate-500">
      <p role="status">{failed ? "Ask AI could not open. Refresh the page to try again." : "Opening Ask AI…"}</p>
      <button type="button" onClick={onClose} className="mt-3 min-h-11 rounded-lg border px-4 text-slate-800">Close Ask AI</button>
    </div>
  );
}

// A failed chat chunk must never unmount the report or trap mobile readers.
class PanelBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <PanelNotice failed onClose={this.props.onClose} /> : this.props.children;
  }
}

/**
 * ASK AI AS A DOCKED SIDE PANEL.
 *
 * The pattern the design systems and the big products converge on for an
 * assistant inside a data app: a launcher pill in the bottom right corner
 * of every page, and a panel docked to the right edge, about a third of the
 * window wide, that the reader can resize from its edge and minimise back
 * to the pill. Material's side sheets, Google's Workspace panels and the
 * practitioner studies all land here for multi-turn work where the reader
 * keeps looking at the data while they talk about it.
 *
 * Choices inside that pattern:
 *
 * - It starts under the top bar, so the account menu and the walkthrough
 *   stay reachable, and runs to the bottom of the window.
 * - It overlays the page without a scrim and without reflowing it: the
 *   page stays live and still, the panel covers its own third. (Pushing
 *   the page over is the other standard choice; it was tried and the
 *   reflow was not wanted.)
 * - Width is the reader's: drag the left edge between 340px and 60% of the
 *   window; the width is remembered for the session. Double-click the edge
 *   to reset. No button for it: the edge is the control.
 * - Minimise keeps the conversation; the pill brings it back.
 * - On a phone (under 640px) the panel is the screen, modal, with the safe
 *   areas respected, which is Material's rule for compact windows.
 *
 * Portalled to the body so no page container's spacing or overflow can
 * reach it. Escape minimises. Renders nothing until the server has said the
 * panel is offered on this report, so a reader never sees a button the
 * backend would refuse.
 */

const MIN_W = 340;
const MAX_W_FRACTION = 0.6;
// Phones remain fullscreen in landscape; a short mouse-driven desktop
// window can still use the docked panel.
const DESKTOP = "(min-width: 640px) and (min-height: 500px), (min-width: 640px) and (pointer: fine)";

/** A third of the window, within sensible bounds. */
function defaultWidth(): number {
  const vw = window.innerWidth;
  return Math.round(Math.max(MIN_W, Math.min(520, Math.max(380, vw / 3))));
}

function clampWidth(w: number): number {
  const vw = window.innerWidth;
  return Math.round(Math.max(MIN_W, Math.min(w, vw * MAX_W_FRACTION, vw - 24)));
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(DESKTOP).matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const onChange = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener("change", onChange);
    setDesktop(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

export default function AskAILauncher() {
  const { available, open, setOpen } = useAskAi();
  const { token } = useReportScope();
  const desktop = useIsDesktop();
  const widthKey = `pf.ask.width.${token}`;

  // null = a third of the window, recomputed on resize; a number = the
  // reader's own width, remembered for the session.
  const [width, setWidth] = useState<number | null>(() => {
    try {
      const raw = sessionStorage.getItem(widthKey);
      const saved = Number(raw);
      return raw && Number.isFinite(saved) && saved > 0 ? clampWidth(saved) : null;
    } catch {
      return null;
    }
  });
  const [resizing, setResizing] = useState(false);
  const [, bump] = useState(0);
  const start = useRef<{ px: number; w: number } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);
  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }));
  }, [setOpen]);

  // Keep the phone composer above the software keyboard and browser chrome.
  useEffect(() => {
    if (!open || desktop) return;
    const visual = window.visualViewport;
    const sync = () => setViewport({ top: visual?.offsetTop ?? 0, height: visual?.height ?? window.innerHeight });
    sync();
    visual?.addEventListener("resize", sync);
    visual?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    const overflow = document.body.style.overflow;
    // The portal is outside #root: only the report behind the mobile modal
    // becomes inert. Its scroll position and component state stay intact.
    const reportRoot = document.getElementById("root");
    const wasInert = reportRoot?.inert ?? false;
    if (reportRoot) reportRoot.inert = true;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      visual?.removeEventListener("resize", sync);
      visual?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.body.style.overflow = overflow;
      if (reportRoot) reportRoot.inert = wasInert;
    };
  }, [open, desktop]);

  const remember = useCallback(
    (w: number | null) => {
      try {
        if (w) sessionStorage.setItem(widthKey, String(w));
        else sessionStorage.removeItem(widthKey);
      } catch {
        /* storage blocked */
      }
    },
    [widthKey],
  );

  // A window resize re-derives the default and re-clamps a chosen width.
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      setWidth((w) => (w ? clampWidth(w) : w));
      bump((n) => n + 1);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
      if (e.key === "Tab" && !desktop) {
        const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], textarea, summary, [tabindex="0"]',
        ) ?? []).filter((el) => el.getClientRects().length > 0);
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          e.preventDefault(); last?.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) {
          e.preventDefault(); first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, desktop]);

  const current = width ?? (typeof window !== "undefined" ? defaultWidth() : 440);

  const beginResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { px: e.clientX, w: current };
    setResizing(true);
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizing || !start.current) return;
    // The edge is on the left: dragging left makes the panel wider.
    setWidth(clampWidth(start.current.w + (start.current.px - e.clientX)));
  };
  const endResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizing) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    setResizing(false);
    start.current = null;
    setWidth((w) => {
      remember(w);
      return w;
    });
  };
  const resetWidth = () => {
    setWidth(null);
    remember(null);
  };

  if (!available) return null;

  return createPortal(
    <>
      {/* The launcher. Hidden while the panel is open: on a desktop the
          panel would cover it, on a phone the panel is the screen, and in
          both the header's minimise is the way back. */}
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask AI"
          className={cn(
            "fixed right-4 z-[60] inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-[13.5px] font-semibold text-primary-foreground shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:right-6 sm:h-12 sm:px-5 sm:text-sm",
            "bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6",
          )}
        >
          <Sparkles className="h-4 w-4" />
          Ask AI
        </button>
      )}

      {open && (
        <section
          ref={panelRef}
          tabIndex={-1}
          role={desktop ? "complementary" : "dialog"}
          aria-modal={desktop ? undefined : true}
          aria-label="Ask AI"
          style={desktop ? { width: current } : { top: viewport?.top ?? 0, height: viewport?.height ?? "100dvh", bottom: "auto" }}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-white outline-none",
            resizing && "select-none",
            desktop
              ? "bottom-0 right-0 top-14 border-l border-slate-200/80 shadow-[-16px_0_48px_-24px_rgba(15,23,42,0.28)]"
              : "inset-0 z-[70] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]",
            // Keep this class during resize so releasing the handle cannot
            // replay the entrance. Both animations use transforms only.
            desktop ? "animate-sheet-in-right" : "animate-sheet-in-bottom",
            "motion-reduce:animate-none",
          )}
        >
          {/* The resize edge: a 10px strip on the left; a visible hairline
              while hovered or dragging. Double-click puts the width back. */}
          {desktop && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize Ask AI"
              tabIndex={0}
              aria-valuemin={MIN_W}
              aria-valuemax={clampWidth(window.innerWidth)}
              aria-valuenow={current}
              title="Drag to resize, double-click to reset"
              onKeyDown={(e) => {
                if (e.key === "Home") { e.preventDefault(); resetWidth(); }
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const next = clampWidth(current + (e.key === "ArrowLeft" ? 20 : -20));
                setWidth(next);
                remember(next);
              }}
              onPointerDown={beginResize}
              onPointerMove={onResizeMove}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              onDoubleClick={resetWidth}
              className="group absolute inset-y-0 left-0 z-10 w-2.5 cursor-col-resize touch-none focus-visible:bg-primary/10 focus-visible:outline-none"
            >
              <span
                className={cn(
                  "absolute inset-y-0 left-0 w-[3px] bg-primary/50 transition-opacity",
                  resizing ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
              />
            </div>
          )}
          <PanelBoundary onClose={close}>
            <Suspense fallback={<PanelNotice onClose={close} />}>
              <AskAIPanel onClose={close} />
            </Suspense>
          </PanelBoundary>
        </section>
      )}
    </>,
    document.body,
  );
}
