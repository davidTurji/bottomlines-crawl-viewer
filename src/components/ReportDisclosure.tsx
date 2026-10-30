import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapse, toggleWithoutJump } from "@/components/Motion";
import { cn } from "@/lib/utils";

/** A report section's header and body share the same accordion as its rows. */
export function ReportDisclosure({ summary, children, className, triggerClassName, testId }: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  triggerClassName?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <section className={className} data-testid={testId}>
    <button type="button" aria-expanded={open} aria-controls={id}
      onClick={event => toggleWithoutJump(event.currentTarget, () => setOpen(value => !value))}
      className={cn("flex w-full items-start justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", triggerClassName)}>
      {summary}
      <ChevronDown aria-hidden className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform", open && "rotate-180")} />
    </button>
    <Collapse open={open} id={id}>{children}</Collapse>
  </section>;
}
