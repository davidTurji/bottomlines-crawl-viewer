/**
 * The "How this works" button in the header, top right beside the account
 * menu. It opens the walkthrough.
 *
 * A labelled pill rather than the console's bare help icon: on a report a
 * customer opens once a week, a question mark is easy to miss, and the words
 * say what it does (David chose the label, 2026-10-02). Always restarts
 * from the top; the walkthrough is short enough that resuming part-way is
 * not worth a second choice.
 *
 * Made to be pressed (David, 2026-10-02: "more tempting"): a green-tinted
 * pill with the icon in a solid green disc and a soft green glow, a lift on
 * hover. Still at rest: nothing on it pulses ("no blipping").
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
      className="group inline-flex h-9 items-center gap-2 rounded-full border border-primary/20 bg-gradient-to-b from-white to-[hsl(152_45%_95%)] py-1 pl-1 pr-3.5 text-[13px] font-semibold text-primary shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-primary/40 hover:shadow-md hover:shadow-primary/10 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      title="A short tour of this report, page by page"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-b from-[hsl(152_50%_32%)] to-primary text-white shadow-[0_0_0_3px_rgba(52,168,110,0.15)] transition-transform duration-300 group-hover:rotate-12">
        <Compass className="h-3.5 w-3.5" />
      </span>
      How this works
    </button>
  );
}
