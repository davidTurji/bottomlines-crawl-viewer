/**
 * Three quiet dots, fading rather than bouncing: "the numbers you see are the old ones, new ones are on
 * the way". Used wherever a list refreshes under a filter, so the page
 * keeps its rows and its numbers in place instead of collapsing to
 * "Loading..." and jumping back.
 */
import { cn } from "@/lib/utils";

export function Dots({ className, label = "Updating" }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-flex items-center gap-1 align-middle", className)}
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          aria-hidden
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400"
          style={{ animationDelay: `${delay}ms`, animationDuration: "1200ms" }}
        />
      ))}
    </span>
  );
}
