/**
 * The "How this works" button in the header, top right beside the account
 * menu. It opens the walkthrough.
 *
 * A labelled button rather than the console's bare help icon: on a report a
 * customer opens once a week, a question mark is easy to miss, and the words
 * say what it does (David chose the label, 2026-10-02). It opens the
 * walkthrough's pop-up with a single Continue, then runs the tour from the
 * top; the walkthrough is short enough that resuming part-way is not worth
 * a second choice.
 *
 * A quiet outlined control keeps help available beside the account menu.
 */

import { Compass } from "lucide-react";

import { useReportTour } from "./useReportTour";

export function WalkthroughButton() {
  const { introduce } = useReportTour();
  return (
    <button
      type="button"
      data-tour="walkthrough-button"
      onClick={introduce}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white py-1 pl-1 pr-3.5 text-[13px] font-medium text-primary transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      title="A short tour of this report, page by page"
    >
      <span className="flex h-7 w-7 items-center justify-center text-primary">
        <Compass className="h-3.5 w-3.5" />
      </span>
      <span className="hidden sm:inline">How this works</span><span className="sm:hidden">Guide</span>
    </button>
  );
}
