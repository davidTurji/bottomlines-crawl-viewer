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
import { Compass } from "lucide-react";

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
      footer={
        <button
          type="button"
          onClick={skip}
          className="shrink-0 rounded-md text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Skip
        </button>
      }
    />
  );
}

/**
 * The first-visit question: would you like to be shown around?
 *
 * Asked once per browser, only on the overview, only once the report has
 * actually opened (see useReportTour). Either answer is remembered: yes runs
 * the walkthrough, no never asks again. The header button stays for both.
 */
function WelcomePrompt({ onAnswer }: { onAnswer: (yes: boolean) => void }) {
  const yesRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    yesRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAnswer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnswer]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 px-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal
      aria-labelledby="walkthrough-prompt-title"
    >
      <div className="w-full max-w-[26rem] rounded-2xl border border-border bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Compass className="h-5 w-5" />
        </span>
        <h2
          id="walkthrough-prompt-title"
          className="mt-4 font-display text-lg font-semibold tracking-tight text-slate-900"
        >
          Want a quick walkthrough?
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
          We&apos;ll take you through your crawl report page by page and show
          you what each part means. It takes about a minute.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onAnswer(false)}
            className="inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-muted hover:text-slate-900"
          >
            No thanks
          </button>
          <button
            ref={yesRef}
            type="button"
            onClick={() => onAnswer(true)}
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Yes, show me around
          </button>
        </div>
        <p className="mt-4 text-[12px] text-slate-400">
          You can open it again any time from &ldquo;How this works&rdquo; at
          the top right.
        </p>
      </div>
    </div>,
    document.body,
  );
}
