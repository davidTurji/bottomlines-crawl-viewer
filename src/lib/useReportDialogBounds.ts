import { useLayoutEffect, type RefObject } from "react";

/** Portaled modals share the report's center, rather than the navigation rail's. */
export function useReportDialogBounds(mainRef: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    // Measure the stationary shell, not main's animated page contents.
    const area = mainRef.current?.parentElement;
    if (!area) return;
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const desktop = window.matchMedia("(min-width: 768px)");
    const names = ["left", "top", "width", "height", "x", "y"] as const;
    const previous = names.map(name => root.style.getPropertyValue(`--report-dialog-${name}`));
    const update = () => {
      const rect = area.getBoundingClientRect();
      const left = desktop.matches ? rect.left : viewport?.offsetLeft ?? 0;
      const top = desktop.matches ? rect.top : viewport?.offsetTop ?? 0;
      const width = desktop.matches ? rect.width : viewport?.width ?? window.innerWidth;
      const height = desktop.matches ? rect.height : viewport?.height ?? window.innerHeight;
      const values = [left, top, width, height, left + width / 2, top + height / 2];
      names.forEach((name, i) => root.style.setProperty(`--report-dialog-${name}`, `${values[i]}px`));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(area);
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      names.forEach((name, i) => previous[i]
        ? root.style.setProperty(`--report-dialog-${name}`, previous[i])
        : root.style.removeProperty(`--report-dialog-${name}`));
    };
  }, [mainRef]);
}
