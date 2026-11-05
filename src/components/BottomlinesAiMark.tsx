import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The assistant's mark: the sparkle everyone already reads as "AI", on the
 * brand green. Nothing bespoke; the custom glyph tried before it read as
 * sloppy at small sizes, and a mark that has to be explained is not a mark.
 *
 * `tile` is the header and empty-state treatment (rounded square on a soft
 * green gradient); `avatar` is the byline treatment (small filled circle).
 */
export function AiMark({
  className = "h-8 w-8",
  tone = "tile",
}: {
  className?: string;
  tone?: "tile" | "avatar";
}) {
  return (
    <span
      className={cn(
        "flex flex-shrink-0 items-center justify-center text-primary-foreground",
        tone === "tile"
          ? "rounded-[24%] bg-[linear-gradient(150deg,hsl(152_55%_30%),hsl(152_60%_17%))] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(15,23,42,0.12)]"
          : "rounded-full bg-primary",
        className,
      )}
      aria-hidden="true"
    >
      <Sparkles className="h-[58%] w-[58%]" strokeWidth={2} />
    </span>
  );
}

/** The name, set as live type: "bottomlines" in ink, ".ai" in the brand green. */
export function BottomlinesAiWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-semibold tracking-tight text-slate-900", className)}>
      bottomlines<span className="text-primary">.ai</span>
    </span>
  );
}
