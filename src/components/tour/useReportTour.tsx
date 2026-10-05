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
  /**
   * Which pop-up is up, if any: "offer" asks on load (Show me around / No
   * thanks); "intro" is what the How this works button opens (Continue).
   */
  prompting: "offer" | "intro" | null;
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
  /** The How this works button: the pop-up first, then the walkthrough. */
  introduce: () => void;
}

const ReportTourContext = createContext<ReportTourContextValue | undefined>(undefined);

/**
 * The elements whose arrival means the report really opened: the overview's
 * header, and the week line on every other page. Both only render once the
 * summary has loaded.
 *
 * Waiting for them rather than for a timer is what keeps the prompt off the
 * sign-in card: the gate in front of the report is optimistic, so the shell
 * renders first and only swaps to the password card when the first data call
 * answers 401. A timer would race that answer; neither renders behind a 401.
 */
const READY_ANCHOR = '[data-tour="overview-header"], [data-report-ready]';

/** How often to look for it, and for how long, before giving up quietly. */
const READY_POLL_MS = 250;
const READY_ATTEMPTS = 240;

/** Six seconds after the page is ready (David, 2026-10-05): the numbers
 *  finish counting and the reader takes the page in before being asked. */
const PROMPT_DELAY_MS = 6000;

export function ReportTourProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<TourProgress>(loadTourProgress);
  const [prompting, setPrompting] = useState<"offer" | "intro" | null>(null);

  /** Persist on every change so a mid-walkthrough reload resumes in place. */
  useEffect(() => {
    saveTourProgress(progress);
  }, [progress]);

  const start = useCallback((options?: { restart?: boolean }) => {
    setPrompting(null);
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
      setPrompting(null);
      if (yes) start({ restart: true });
      else setProgress({ status: "skipped", stepId: null, open: false });
    },
    [start],
  );

  /**
   * Offer the walkthrough on EVERY load, on every report page (David,
   * 2026-10-02: "on each load show the walkthrough popup, on each refresh").
   * It used to ask once per browser and only on the overview; a reader who
   * had answered once never saw it again.
   *
   * The one exception is a walkthrough already in progress: a reload in the
   * middle of it resumes the tour, and asking whether they want one would be
   * asking a question they are in the middle of answering.
   */
  useEffect(() => {
    if (progress.open) return;
    let attempts = 0;
    let delay = 0;
    const timer = window.setInterval(() => {
      if (document.querySelector(READY_ANCHOR)) {
        window.clearInterval(timer);
        delay = window.setTimeout(() => setPrompting("offer"), PROMPT_DELAY_MS);
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

  /** Pressing How this works opens the same pop-up, as a "here we go"
   *  rather than a question (David, 2026-10-02): one Continue button. */
  const introduce = useCallback(() => setPrompting("intro"), []);

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
      introduce,
    }),
    [progress.open, progress.stepId, progress.status, prompting, start, goToStep, skip, complete, answerPrompt, introduce],
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
      prompting: null,
      start: () => {},
      goToStep: () => {},
      skip: () => {},
      complete: () => {},
      answerPrompt: () => {},
      introduce: () => {},
    };
  }
  return context;
}
