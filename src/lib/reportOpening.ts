import { createContext, useContext, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/** One entrance per report session. Pages keep fetching under the shell's
 * skeleton and report when their first useful view has settled. */
export const ReportOpeningContext = createContext<((path: string) => void) | null>(null);

export function useReportOpeningReady(ready: boolean) {
  const markReady = useContext(ReportOpeningContext);
  const initialEntry = useRef(markReady !== null);
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    if (ready) markReady?.(pathname);
  }, [ready, markReady, pathname]);
  return initialEntry.current;
}
