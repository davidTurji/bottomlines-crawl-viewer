/**
 * localStorage persistence for the report walkthrough.
 *
 * Same shape and the same rules as the console's tour (bottomlines-app,
 * src/components/tour/tourStorage.ts):
 *
 * - The saved position is a step **id**, never an index. Steps come and go
 *   with the report (Discovery only exists on a crawl that discovered
 *   something), so an index would point at the wrong page; a missing id falls
 *   back to the beginning.
 * - Every access is wrapped. Safari's private mode throws on both read and
 *   write, and a walkthrough that cannot remember where it got to is a far
 *   better outcome than a report that will not render.
 * - Whether the walkthrough is **currently open** is persisted too. It drives
 *   the router, so a step change is a real navigation, and a reload half way
 *   through should land the reader back on the same step, not end it.
 *
 * One record per browser, not per report. It no longer decides whether the
 * welcome prompt shows (that is every load, by request); it remembers where
 * a walkthrough got to, so a reload mid-tour resumes it.
 */

/** Versioned so a future incompatible shape can be ignored rather than parsed. */
const STORAGE_KEY = "pf_report_walkthrough_v1";

export type TourStatus =
  /** Never opened on this browser. */
  | "unseen"
  /** Opened and left part-way through. */
  | "in-progress"
  /** Declined at the prompt, or closed before the end. */
  | "skipped"
  /** Reached the final step and pressed Finish. */
  | "completed";

export interface TourProgress {
  status: TourStatus;
  /** Id of the step the reader was last on, or null before the first open. */
  stepId: string | null;
  /** Whether the card should be on screen right now. See the note above. */
  open: boolean;
}

const DEFAULT_PROGRESS: TourProgress = { status: "unseen", stepId: null, open: false };

/** Reads saved progress, treating anything unparseable as a first visit. */
export function loadTourProgress(): TourProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_PROGRESS;
    const { status, stepId, open } = parsed as Partial<TourProgress>;
    const valid: TourStatus[] = ["unseen", "in-progress", "skipped", "completed"];
    const resolved: TourStatus = valid.includes(status as TourStatus)
      ? (status as TourStatus)
      : "unseen";
    return {
      status: resolved,
      stepId: typeof stepId === "string" ? stepId : null,
      // Only a walkthrough left mid-way may reopen itself on load.
      open: open === true && resolved === "in-progress",
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

/** Writes progress. Failure is non-fatal: the walkthrough just will not resume. */
export function saveTourProgress(progress: TourProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* private mode or a full quota, nothing here is worth failing over */
  }
}
