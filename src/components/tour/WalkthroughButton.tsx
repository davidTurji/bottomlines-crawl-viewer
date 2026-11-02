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
 * A quiet outlined control keeps help available beside the account menu,
 * compact: the compass tight to its words (2026-11-01, 2026-11-02).
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
      // Compact (David, 2026-11-01, tighter 2026-11-02): the compass tight
      // to its words, set like the Download button's text (12px, semibold),
      // so the button is no wider or taller than what it says. A phone
      // keeps its 40px tap height (index.css).
      className="walkthrough-button inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-white px-2.5 text-[12px] font-semibold text-primary transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      title="A short tour of this report, page by page"
    >
      <Compass aria-hidden className="h-3.5 w-3.5 flex-none" />
      <span className="hidden sm:inline">How this works</span><span className="sm:hidden">Guide</span>
    </button>
  );
}
