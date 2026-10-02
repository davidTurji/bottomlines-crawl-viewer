/**
 * ReportTour, the report walkthrough runner and its welcome prompt.
 *
 * Mounted once by the Layout, so it survives navigation: the walkthrough
 * drives the router, and a component that unmounted on every route change
 * could not. Ported from bottomlines-app's ProductTour.
 *
 * - **It navigates.** Each step names a report page, and opening the step
 *   takes the reader there, keeping the query string so a seat-line filter
 *   (and the mock's trial switch) rides along.
 * - **It points at things.** The `spotlight` variant dims everything except
 *   the step's `[data-tour]` anchor.
 * - **It fits the report.** Before the first card it reads what this report
 *   actually has (discovery, the line filter, an export, a trial), so no step
 *   describes something that is not on screen. See reportTourSteps.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { Compass, X } from "lucide-react";

import { api } from "@/lib/api";
import { useReportScope } from "@/lib/reportScope";
import { TourOverlay } from "./TourOverlay";
import { reportTourSteps, type ReportFeatures, type ReportPage } from "./reportTourSteps";
import { useReportTour } from "./useReportTour";

/** The rail's name for each page, as the page-change card says it. */
const PAGE_LABEL: Record<ReportPage, string> = {
  "": "Overview",
  changes: "Changes",
  discovery: "Discovery",
  declarations: "Declarations",
};

/** Each page's title block, where the "you're now on" beat points. */
const PAGE_HEADER: Record<ReportPage, string> = {
  "": "overview-header",
  changes: "changes-header",
  discovery: "discovery-header",
  declarations: "declarations-header",
};

/**
 * THE PAGE CHANGE, IN THREE BEATS, about three and a half seconds (David,
 * 2026-10-02: "a longer move, three or four seconds, it's not clear that
 * it's moving between pages"). One bar fills across all of it.
 *
 *   0          the highlight glides to the next page's link in the rail
 *              (the menu button on a phone): "Next page: Overview -> Changes"
 *   NAV_MS     the page switches, with the link still lit, so the reader
 *              watches it become the active page, like a click
 *   ARRIVE_MS  the highlight glides to the new page's title: "You're now on
 *              Changes"
 *   DONE_MS    the walkthrough carries on with the step on that page
 *
 * The three numbers are the whole tuning surface.
 */
const NAV_MS = 1400;
const ARRIVE_MS = 2000;
const DONE_MS = 3400;

export type Transit = {
  /** The step being travelled to: the bar runs once per move. */
  id: string;
  phase: "leaving" | "arrived";
  anchor: string;
  from: string;
  to: string;
  durationMs: number;
};

/** Read before the first card, so the step list never changes under the reader. */
function useReportFeatures(enabled: boolean): ReportFeatures | null {
  const { token } = useReportScope();
  const [features, setFeatures] = useState<ReportFeatures | null>(null);

  useEffect(() => {
    if (!enabled || features || !token) return;
    let alive = true;
    // Every read is allowed to fail: a missing answer drops the step it
    // governs rather than holding the walkthrough back.
    Promise.all([
      api
        .discoveredLines(token, { page: 1, page_size: 1 })
        .then((p) => (p?.total ?? 0) > 0)
        .catch(() => false),
      api.summary(token).catch(() => null),
      api.exportInfo(token).catch(() => null),
    ]).then(([hasDiscovery, summary, exportInfo]) => {
      if (!alive) return;
      setFeatures({
        hasDiscovery,
        hasLineFilter: (summary?.watchlist?.seats?.length ?? 0) > 0,
        canExport: !!exportInfo && exportInfo.format !== "none",
        trial: !!summary?.trial,
      });
    });
    return () => {
      alive = false;
    };
  }, [enabled, features, token]);

  return features;
}

export function ReportTour() {
  const { open, stepId, goToStep, skip, complete, prompting, answerPrompt } = useReportTour();
  const { basePath } = useReportScope();
  const navigate = useNavigate();
  const location = useLocation();

  // Read as soon as the prompt shows, so a "yes" opens straight onto step one.
  const features = useReportFeatures(open || prompting);
  const steps = useMemo(() => (features ? reportTourSteps(features) : []), [features]);

  // A saved step id that no longer exists (a step this report does not have)
  // falls back to the beginning rather than to nothing.
  const savedIndex = steps.findIndex((s) => s.id === stepId);
  const index = savedIndex >= 0 ? savedIndex : 0;
  const step = steps[index];

  /**
   * Take the reader to the step's page, and SHOW the move (David,
   * 2026-10-02: "it is not clear it is moving pages").
   *
   * A step on the page already open just shows. A step on another page first
   * points at that page's link in the rail (on a phone, where the rail is
   * hidden, at the menu button), then navigates, then points at the new
   * page's title, then hands over to the step. See NAV_MS, ARRIVE_MS and
   * DONE_MS.
   *
   * Keyed on the step, not on the location: navigating whenever the two
   * disagree would drag a reader back the moment they followed a link on the
   * page a step told them to explore. The location is read through a ref.
   */
  const locRef = useRef(location);
  locRef.current = location;
  // Through a ref as well: react-router hands out a new `navigate` whenever
  // the path changes, and as a dependency that re-ran this effect the moment
  // the page switched, cutting the "Moving to" card short.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const [transit, setTransit] = useState<Transit | null>(null);
  useEffect(() => {
    if (!open || !step) {
      setTransit(null);
      return;
    }
    const target = step.page ? `${basePath}/${step.page}` : basePath;
    if (locRef.current.pathname.replace(/\/+$/, "") === target) {
      setTransit(null);
      return;
    }
    const link = `nav-${step.page || "overview"}`;
    const linkEl = document.querySelector(`[data-tour="${link}"]`);
    // The rail is a sheet on narrow screens and its links are not on screen,
    // so point at the button that opens it.
    const anchor = linkEl && linkEl.getClientRects().length > 0 ? link : "nav-trigger";
    // Where the reader is now, named the way the rail names it.
    const here = locRef.current.pathname.replace(/\/+$/, "");
    const fromPage = (here.startsWith(basePath) ? here.slice(basePath.length) : "").replace(/^\//, "");
    const from = PAGE_LABEL[fromPage as ReportPage] ?? "This page";
    const to = PAGE_LABEL[step.page];
    setTransit({ id: step.id, phase: "leaving", anchor, from, to, durationMs: DONE_MS });
    const go = window.setTimeout(
      () => navigateRef.current({ pathname: target, search: locRef.current.search }),
      NAV_MS,
    );
    const arrive = window.setTimeout(
      () => setTransit((t) => t && { ...t, phase: "arrived", anchor: PAGE_HEADER[step.page] }),
      ARRIVE_MS,
    );
    const done = window.setTimeout(() => setTransit(null), DONE_MS);
    // Cleared if the reader moves on, or closes, before the change lands:
    // the page then stays where it is.
    return () => {
      window.clearTimeout(go);
      window.clearTimeout(arrive);
      window.clearTimeout(done);
    };
  }, [open, step?.id, step?.page, basePath]);

  const handleIndexChange = useCallback(
    (next: number) => {
      const target = steps[next];
      if (target) goToStep(target.id);
    },
    [steps, goToStep],
  );

  /** Finishing on the last step is a completion, anything earlier a skip. */
  const handleClose = useCallback(() => {
    if (index === steps.length - 1) complete();
    else skip();
  }, [index, steps.length, complete, skip]);

  if (prompting) return <WelcomePrompt onAnswer={answerPrompt} />;
  if (!open || !step) return null;

  return (
    <TourOverlay
      open={open}
      steps={steps}
      index={index}
      onIndexChange={handleIndexChange}
      onClose={handleClose}
      ariaLabel="Report walkthrough"
      variant="spotlight"
      transit={transit}
      doneLabel="Finish"
      // No Skip link: the X and Esc already leave, and one less control is
      // one less thing on a card meant to be read at a glance.
    />
  );
}

/**
 * The first-visit question: would you like to be shown around?
 *
 * Asked on every load of any report page, once the report has actually
 * opened (see useReportTour). Yes runs the walkthrough; no, the X and Esc
 * close the card until the next load. The header button is always there.
 *
 * The two answers are the same size and weight (David, 2026-10-02): green
 * for yes, white for no.
 */
function WelcomePrompt({ onAnswer }: { onAnswer: (yes: boolean) => void }) {
  // Focus goes to the card, not to a button: a focused button wears a ring,
  // and the two answers must look exactly alike until one is chosen.
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAnswer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnswer]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 px-5 backdrop-blur-[2px] animate-tour-fade motion-reduce:animate-none"
      role="dialog"
      aria-modal
      aria-labelledby="walkthrough-prompt-title"
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="relative w-full max-w-[21rem] rounded-3xl border border-white/70 bg-white/95 p-5 shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] outline-none animate-tour-pop motion-reduce:animate-none"
      >
        <button
          type="button"
          onClick={() => onAnswer(false)}
          aria-label="Close"
          className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-b from-[hsl(152_50%_32%)] to-primary text-white shadow-md shadow-primary/25">
          <Compass className="h-4 w-4" />
        </span>
        <h2
          id="walkthrough-prompt-title"
          className="mt-3 font-display text-base font-semibold tracking-tight text-slate-900"
        >
          Want a quick walkthrough?
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-slate-500">
          A <strong className="font-semibold text-slate-800">1 minute</strong> tour
          of your report.
        </p>
        {/* Two equal columns on every screen, so the answers are exactly the
            same size: green for yes, white for no. */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onAnswer(false)}
            className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            No thanks
          </button>
          <button
            type="button"
            onClick={() => onAnswer(true)}
            className="inline-flex h-10 items-center justify-center rounded-full border border-transparent bg-gradient-to-b from-[hsl(152_50%_32%)] to-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Show me around
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400">
          Replay anytime from{" "}
          <strong className="font-semibold text-slate-500">How this works</strong>.
        </p>
      </div>
    </div>,
    document.body,
  );
}
