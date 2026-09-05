import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * THE PAGE CONTAINER, SHARED BY EVERY REPORT PAGE.
 *
 * Every page used to set its own width cap (7xl on the overview, 5xl on the
 * two list pages), which meant a reader on a wide monitor got a column of
 * content down the middle with several hundred pixels of empty page on
 * either side, and the cap differed page to page so the content jumped
 * width as they navigated.
 *
 * This is deliberately uncapped. The report's rows are wide by nature (a
 * full ads.txt line in mono on the left, stats on the right), so extra width
 * goes into showing more of the line before it truncates rather than into
 * stretching prose. Horizontal padding grows a little with the viewport so
 * the content never runs into the edge, but it never grows into a gutter.
 *
 * Anything genuinely line-length-sensitive (a paragraph of explanatory copy)
 * caps itself locally with a max-w on that element, which is the right level
 * for that decision.
 */
export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
