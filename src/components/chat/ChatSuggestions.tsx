import { cn } from "@/lib/utils";

/**
 * Starter-question pill cluster shown in the drawer's empty state.
 *
 * Ported from bottomlines-app. Variable-width one-liners on a diffused
 * emerald glow, each with a layered resting shadow so the pills read as
 * raised objects rather than flat outlined shapes.
 */
export function ChatSuggestions({
  items,
  onSelect,
  maxWidthClassName = "max-w-[340px]",
}: {
  items: readonly string[];
  onSelect: (s: string) => void;
  maxWidthClassName?: string;
}) {
  return (
    <div className="relative w-full">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.20),rgba(16,185,129,0)_65%)] blur-2xl"
      />
      <div className={cn("mx-auto flex flex-wrap justify-center gap-2.5", maxWidthClassName)}>
        {items.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSelect(s)}
            className="whitespace-nowrap rounded-full border border-emerald-500/25 bg-white px-4 py-2 text-[12.5px] font-medium text-foreground/80 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_4px_14px_-4px_rgba(16,185,129,0.35)] ring-1 ring-inset ring-white/60 transition-all hover:-translate-y-0.5 hover:border-emerald-500/55 hover:text-primary hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_10px_24px_-6px_rgba(16,185,129,0.55)]"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
