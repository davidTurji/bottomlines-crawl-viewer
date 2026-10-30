import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared, unboxed KPI cells separated by quiet rules. */
export function ReportKpiGrid({ children, columns = 3, className }: { children: ReactNode; columns?: 3 | 4; className?: string }) {
  return <div data-columns={columns} className={cn("report-kpi-grid", className)}>{children}</div>;
}
