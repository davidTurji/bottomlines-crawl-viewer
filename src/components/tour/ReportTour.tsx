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
import { reportTourSteps, type ReportFeatures } from "./reportTourSteps";
import { useReportTour } from "./useReportTour";

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
   * Take the reader to the step's page, once per step.
   *
   * Keyed on the step rather than the location on purpose: navigating
   * whenever the two disagree would drag a reader back the moment they
   * followed a link on the page the step told them to explore.
   */
  const navigatedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !step) {
      navigatedFor.current = null;
      return;
    }
    if (navigatedFor.current === step.id) return;
    navigatedFor.current = step.id;
    const target = step.page ? `${basePath}/${step.page}` : basePath;
    if (location.pathname.replace(/\/+$/, "") !== target) {
      navigate({ pathname: target, search: location.search });
    }
    // location is read, not tracked: this must fire on step changes only.
  }, [open, step, basePath, navigate]);

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
      doneLabel="Finish"
      // No Skip link: the X and Esc already leave, and one less control is
      // one less thing on a card meant to be read at a glance.
    />
  );
}

/**
 * The first-visit question: would you like to be shown around?
 *
 * Asked once per browser, only on the overview, only once the report has
 * actually opened (see useReportTour). Either answer is remembered: yes runs
 * the walkthrough, no never asks again. The header button stays for both.
 *
 * The two answers are the same size and weight (David, 2026-10-02): green
 * for yes, white for no. The X and Esc are a no, so a reader who just wants
 * the card gone is never asked again either.
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
