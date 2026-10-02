/**
 * useReportTour, the open/resume state behind the report walkthrough, plus
 * the one-time "would you like a walkthrough?" prompt.
 *
 * A context rather than local state, because the three things that talk to
 * the walkthrough sit in different parts of the shell: the Walkthrough button
 * in the header, the runner mounted beside the page, and the welcome prompt.
 * Ported from bottomlines-app's useProductTour; the prompt is the addition.
 *
 * The provider knows nothing about the step list. It stores an opaque step id
 * and hands it back; the runner owns which steps exist for this report.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useReportScope } from "@/lib/reportScope";
import {
  loadTourProgress,
  saveTourProgress,
  type TourProgress,
  type TourStatus,
} from "./tourStorage";

interface ReportTourContextValue {
  open: boolean;
  /** Id of the step to show, or null to start from the beginning. */
  stepId: string | null;
  status: TourStatus;
  /** Whether the first-visit "would you like a walkthrough?" card is up. */
  prompting: boolean;
  /** Opens the walkthrough. Pass `restart` to ignore saved progress. */
  start: (options?: { restart?: boolean }) => void;
  /** Records the reader's position without closing, so a reload resumes here. */
  goToStep: (stepId: string) => void;
  /** Leaves the walkthrough part-way. */
  skip: () => void;
  /** Leaves the walkthrough at the end. */
  complete: () => void;
  /** Answers the welcome prompt: yes starts from the top, no never asks again. */
  answerPrompt: (yes: boolean) => void;
}

const ReportTourContext = createContext<ReportTourContextValue | undefined>(undefined);

/**
 * The element whose arrival means the report really opened. It is the
 * overview's header, which only renders once the summary has loaded.
 *
 * Waiting for it rather than for a timer is what keeps the prompt off the
 * sign-in card: the gate in front of the report is optimistic, so the shell
 * renders first and only swaps to the password card when the first data call
 * answers 401. A timer would race that answer; the header never renders
 * behind a 401 at all.
 */
const READY_ANCHOR = '[data-tour="overview-header"]';

/** How often to look for it, and for how long, before giving up quietly. */
const READY_POLL_MS = 250;
const READY_ATTEMPTS = 240;

/** A beat after the numbers land, so the prompt opens over a finished page. */
const PROMPT_DELAY_MS = 700;

export function ReportTourProvider({ children }: { children: React.ReactNode }) {
  const { basePath } = useReportScope();
  const [progress, setProgress] = useState<TourProgress>(loadTourProgress);
  const [prompting, setPrompting] = useState(false);

  /** Persist on every change so a mid-walkthrough reload resumes in place. */
  useEffect(() => {
    saveTourProgress(progress);
  }, [progress]);

  const start = useCallback((options?: { restart?: boolean }) => {
    setPrompting(false);
    setProgress((prev) => ({
      status: "in-progress",
      stepId: options?.restart ? null : prev.stepId,
      open: true,
    }));
  }, []);

  const goToStep = useCallback((stepId: string) => {
    setProgress((prev) =>
      prev.stepId === stepId ? prev : { status: "in-progress", stepId, open: true },
    );
  }, []);

  const skip = useCallback(() => {
    setProgress((prev) => ({ status: "skipped", stepId: prev.stepId, open: false }));
  }, []);

  const complete = useCallback(() => {
    // Cleared, not kept: someone reopening a walkthrough they finished wants
    // it from the top, not the last card again.
    setProgress({ status: "completed", stepId: null, open: false });
  }, []);

  const answerPrompt = useCallback(
    (yes: boolean) => {
      setPrompting(false);
      if (yes) start({ restart: true });
      else setProgress({ status: "skipped", stepId: null, open: false });
    },
    [start],
  );

  /**
   * First visit on this browser: offer the walkthrough, once.
   *
   * Only on the overview. Someone who followed a link straight to Changes
   * asked a specific question, and a card asking them to take a tour first is
   * in the way of the answer. The header button is there for them anyway.
   */
  useEffect(() => {
    if (progress.status !== "unseen") return;
    const here = window.location.pathname.replace(/\/+$/, "");
    if (here !== basePath.replace(/\/+$/, "")) return;
    let attempts = 0;
    let delay = 0;
    const timer = window.setInterval(() => {
      if (document.querySelector(READY_ANCHOR)) {
        window.clearInterval(timer);
        delay = window.setTimeout(() => setPrompting(true), PROMPT_DELAY_MS);
      } else if (++attempts >= READY_ATTEMPTS) {
        window.clearInterval(timer);
      }
    }, READY_POLL_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(delay);
    };
    // Mount-only on purpose: answering the prompt flips the status, and
    // re-running this on that change would re-arm it against itself.
  }, []);

  const value = useMemo<ReportTourContextValue>(
    () => ({
      open: progress.open,
      stepId: progress.stepId,
      status: progress.status,
      prompting,
      start,
      goToStep,
      skip,
      complete,
      answerPrompt,
    }),
    [progress.open, progress.stepId, progress.status, prompting, start, goToStep, skip, complete, answerPrompt],
  );

  return <ReportTourContext.Provider value={value}>{children}</ReportTourContext.Provider>;
}

/**
 * Reads the walkthrough state. Inert defaults outside the provider rather
 * than a throw, so a component rendered on its own cannot take the page down.
 */
export function useReportTour(): ReportTourContextValue {
  const context = useContext(ReportTourContext);
  if (!context) {
    return {
      open: false,
      stepId: null,
      status: "unseen",
      prompting: false,
      start: () => {},
      goToStep: () => {},
      skip: () => {},
      complete: () => {},
      answerPrompt: () => {},
    };
  }
  return context;
}
