/**
 * The "How this works" button in the header, top right beside the account
 * menu. It opens the walkthrough.
 *
 * A labelled pill rather than the console's bare help icon: on a report a
 * customer opens once a week, a question mark is easy to miss, and the words
 * say what it does (David chose the label, 2026-10-02). Always restarts
 * from the top; the walkthrough is short enough that resuming part-way is
 * not worth a second choice.
 */

import { Compass } from "lucide-react";

import { useReportTour } from "./useReportTour";

export function WalkthroughButton() {
  const { start } = useReportTour();
  return (
    <button
      type="button"
      data-tour="walkthrough-button"
      onClick={() => start({ restart: true })}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 transition-colors hover:border-primary/40 hover:bg-accent/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      title="A short tour of this report, page by page"
    >
      <Compass className="h-4 w-4" />
      How this works
    </button>
  );
}
