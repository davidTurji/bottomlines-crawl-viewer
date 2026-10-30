import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A concise introduction with the full explanation available on request. */
export function ReportDescription({ summary, children, label, className }: {
  summary: string; children: ReactNode; label: string; className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <div className={cn("report-description text-sm leading-relaxed text-slate-500", className)}>
    <p>{summary}{" "}<button type="button" aria-label={expanded ? `Show less about ${label}` : `Show more about ${label}`}
      aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}
      className="report-description-toggle rounded px-1 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {expanded ? "Show less" : "Show more"}
    </button></p>
    <div id={id} aria-hidden={!expanded} data-expanded={expanded} className="report-description-reveal"
      ref={node => { if (node) node.inert = !expanded; }}>
      <div className="min-h-0 overflow-hidden"><div className="pt-1.5 text-[12px] leading-relaxed">{children}</div></div>
    </div>
  </div>;
}
