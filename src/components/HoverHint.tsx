/**
 * A short explanation that appears above its target on hover or keyboard
 * focus (owner, 2026-10-15: the round icons on Changes say what they mean).
 * Pure CSS, no portal: the target wraps itself in a `group/hint`, the
 * bubble sits above it, dark like the system's other floating notes.
 */
import { cn } from "@/lib/utils";

export function HoverHint({
  text,
  children,
  className,
  side = "top",
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
  /** "right" for a target near a clipped edge, e.g. inside a rounded card. */
  side?: "top" | "right";
}) {
  return (
    <span className={cn("group/hint relative inline-flex", className)}>
      {children}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute z-30 w-max max-w-[320px]",
          side === "top"
            ? "bottom-full left-1/2 mb-2 -translate-x-1/2"
            : "left-full top-1/2 ml-2 -translate-y-1/2",
          "rounded-lg bg-slate-900 px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug text-white shadow-lg",
          "opacity-0 transition-opacity duration-150 group-hover/hint:opacity-100 group-focus-within/hint:opacity-100",
        )}
      >
        {text}
      </span>
    </span>
  );
}
