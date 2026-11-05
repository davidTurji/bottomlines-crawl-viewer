import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import AskAIPanel from "@/components/AskAIPanel";
import { useAskAi } from "@/lib/askAi";
import { cn } from "@/lib/utils";

/**
 * ASK AI AS A NATIVE WIDGET.
 *
 * The pattern every product assistant has settled on: a launcher pill in
 * the bottom right corner of every page, and a floating chat card that
 * opens from the same corner, anchored above the launcher, with the page
 * still live around it. The card covers only its own corner, so the report
 * stays readable and clickable behind it; the launcher turns into a close
 * control while the card is open, so the way out is where the way in was.
 *
 * Two sizes on a desktop: the card, about 400 by 660, and an expanded view
 * for long answers that takes the window's height at 560 wide. On a phone
 * the card is the screen, which is the only honest amount of room for a
 * conversation at that width.
 *
 * Portalled to the body so no page container's spacing or overflow can
 * reach it. Escape closes. Renders nothing until the server has said the
 * panel is offered on this report, so a reader never sees a button the
 * backend would refuse.
 */
export default function AskAILauncher() {
  const { available, open, setOpen } = useAskAi();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!available) return null;

  return createPortal(
    <>
      {/* The launcher. A pill when closed; a round close button under the
          card when open, so the corner always holds exactly one control.
          Hidden on a phone while the card is open: the card is the screen
          and has its own close. */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close Ask AI" : "Ask AI"}
        aria-expanded={open}
        className={cn(
          "fixed right-5 z-[60] inline-flex items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:right-6",
          "bottom-[max(1.25rem,env(safe-area-inset-bottom))] sm:bottom-6",
          open ? "h-12 w-12 max-sm:hidden" : "h-12 px-5 text-sm",
        )}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-4 w-4" />}
        {!open && "Ask AI"}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Ask AI"
          className={cn(
            "ask-pop fixed z-50 flex flex-col overflow-hidden bg-white",
            // Phone: the whole screen.
            "max-sm:inset-0",
            // Desktop: a card anchored above the launcher, in its corner.
            "sm:bottom-[5.25rem] sm:right-6 sm:rounded-2xl sm:border sm:border-slate-200/80 sm:shadow-[0_24px_64px_-16px_rgba(15,23,42,0.35),0_8px_24px_-12px_rgba(15,23,42,0.2)]",
            expanded
              ? "sm:h-[calc(100dvh-6.5rem)] sm:w-[min(560px,calc(100vw-3rem))]"
              : "sm:h-[min(660px,calc(100dvh-6.5rem))] sm:w-[min(400px,calc(100vw-3rem))]",
          )}
        >
          <AskAIPanel
            onClose={() => setOpen(false)}
            expanded={expanded}
            onToggleExpand={() => setExpanded((e) => !e)}
          />
        </section>
      )}
    </>,
    document.body,
  );
}
