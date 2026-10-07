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
}: {
  label: string;
  value: number;
  emphasis?: boolean;
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
          "font-mono text-sm tabular-nums",
          emphasis ? "font-semibold text-slate-900" : "text-slate-700",
        )}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}
