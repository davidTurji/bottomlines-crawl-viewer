import { cn } from "@/lib/utils";

/**
 * Small right-aligned number pair used on the drilldown row header.
 *
 * Exported because the Discovered lines cards are deliberate siblings of
 * PublisherCard: same stat treatment, same label size, same tabular figures.
 * Copying it would let the two drift apart a pixel at a time.
 */
export function MiniStat({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  /** Greyed: a row no longer watched (Stopped watching, 2026-11-04). */
  muted?: boolean;
}) {
  return (
    <div>
      {/* Sentence case, never uppercase: the house rule is that labels read
          as words, not as shouting. */}
      <div className="text-[10px] font-medium tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={cn(
          "font-sans text-sm tabular-nums",
          muted ? "text-slate-400" : emphasis ? "font-semibold text-slate-900" : "text-slate-700",
        )}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}
