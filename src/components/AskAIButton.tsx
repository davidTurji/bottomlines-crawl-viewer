import { Sparkles } from "lucide-react";

import { useAskAi } from "@/lib/askAi";
import { cn } from "@/lib/utils";

/**
 * The Ask AI button in the header of every report page.
 *
 * The one AI affordance people already know: the sparkle mark, the two
 * words, a pill. Racing Green because it is the report's own action, not a
 * third party's. It renders nothing until the server has said the panel is
 * offered on this report, so a reader never sees a button the backend would
 * refuse.
 */
export default function AskAIButton({ className }: { className?: string }) {
  const { available, open, setOpen } = useAskAi();
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-pressed={open}
      aria-label={open ? "Close Ask AI" : "Open Ask AI"}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        open
          ? "bg-primary/10 text-primary hover:bg-primary/15"
          : "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        className,
      )}
    >
      <Sparkles className="h-4 w-4" />
      <span>Ask AI</span>
    </button>
  );
}
