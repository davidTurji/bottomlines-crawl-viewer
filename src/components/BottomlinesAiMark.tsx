import { cn } from "@/lib/utils";

/**
 * THE BOTTOMLINES.AI MARK, drawn as inline SVG.
 *
 * The house logomark is a literal bottom line: a thick baseline with the
 * trend running above it and ending in a marker dot, profit above the line.
 * The assistant wears the same mark with one change: the marker dot becomes
 * a four-point spark in the brand's teal, the sign every product uses for
 * "AI". Same silhouette as the account monogram in the header, so the two
 * speakers in a conversation are drawn alike; crisp at any size because it
 * is vector, and always on-theme because the colours come from the tokens.
 *
 * `tile` is the header treatment (rounded square, gradient green);
 * `avatar` is the byline treatment (small filled circle).
 */
export function BottomlinesAiMark({
  className = "h-8 w-8",
  tone = "tile",
}: {
  className?: string;
  tone?: "tile" | "avatar";
}) {
  const ink = "hsl(var(--primary-foreground))";
  const spark = "hsl(var(--sidebar-primary))";
  return (
    <span
      className={cn(
        "flex flex-shrink-0 items-center justify-center overflow-hidden",
        tone === "tile"
          ? "rounded-[22%] bg-[linear-gradient(145deg,hsl(152_58%_26%),hsl(152_58%_16%))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
          : "rounded-full bg-primary",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[74%] w-[74%]" aria-hidden="true">
        {/* the bottom line */}
        <path d="M4 20h16" stroke={ink} strokeWidth="3.2" strokeLinecap="round" />
        {/* the trend above it, rising to the spark */}
        <path
          d="M5 15l4-4.6 3.4 3 2.9-3.8"
          stroke={ink}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* the marker, now a spark: four points in the brand teal, big
            enough to read as a star at 20px */}
        <path
          d="M18.2 1.8l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2L13.7 6.3l3.2-1.3z"
          fill={spark}
        />
      </svg>
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
