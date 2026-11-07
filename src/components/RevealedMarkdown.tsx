import { useEffect, useRef, useState } from "react";

import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/utils";

/**
 * AN ANSWER WRITTEN OUT THE WAY A CHAT WRITES IT.
 *
 * The server hands the answer over whole, because it checks every figure in
 * it before anyone reads it; a half-checked stream would defeat the point.
 * The feel of an answer being written is kept on this side instead: the
 * text is revealed word by word on a short clock, with a round cursor at
 * the writing edge, and settles in under three seconds however long it is.
 *
 * Markdown is rendered on the partial text, so a bold run or a list is
 * styled from its first word rather than snapping into shape at the end.
 * An unclosed marker is closed for the render, so no asterisk ever shows.
 */
export function RevealedMarkdown({
  text,
  reveal,
  className,
  onDone,
  onProgress,
}: {
  text: string;
  /** False shows the whole text at once (a stored answer). */
  reveal: boolean;
  className?: string;
  onDone?: () => void;
  /** Called as the text grows, so the thread can keep the edge in view. */
  onProgress?: () => void;
}) {
  const words = useRef<string[]>([]);
  const [count, setCount] = useState<number>(() => (reveal ? 0 : Number.MAX_SAFE_INTEGER));
  const [writing, setWriting] = useState(reveal);

  useEffect(() => {
    if (!reveal || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(Number.MAX_SAFE_INTEGER);
      setWriting(false);
      onDone?.();
      return;
    }
    // Split keeping the whitespace, so joining the prefix reproduces the
    // text exactly, line breaks included.
    words.current = text.split(/(\s+)/).filter((w) => w.length > 0);
    const total = words.current.length;
    // Pace: a few words per tick, more for long answers, so the whole
    // thing lands in roughly 1.5 to 2.5 seconds.
    const ticks = Math.max(12, Math.min(60, Math.round(total / 2)));
    const perTick = Math.max(1, Math.ceil(total / ticks));
    const interval = Math.max(18, Math.min(45, Math.round(2000 / ticks)));
    let shown = 0;
    setCount(0);
    setWriting(true);
    const timer = window.setInterval(() => {
      shown = Math.min(total, shown + perTick);
      setCount(shown);
      onProgress?.();
      if (shown >= total) {
        window.clearInterval(timer);
        setWriting(false);
        onDone?.();
      }
    }, interval);
    return () => window.clearInterval(timer);
    // The text of one message never changes after it lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, text]);

  const shown = writing ? closeMarkers(words.current.slice(0, count).join("")) : text;

  return (
    <div className={cn("relative", className)}>
      <Markdown text={shown} />
      {writing && (
        <span
          aria-hidden
          className="ask-cursor ml-0.5 inline-block h-[0.9em] w-[0.9em] translate-y-[0.12em] rounded-full bg-slate-800 align-baseline"
        />
      )}
    </div>
  );
}

/** Close a bold, italic or code run the cut left open, for the render only. */
function closeMarkers(partial: string): string {
  let out = partial;
  const bold = (out.match(/\*\*/g) ?? []).length;
  if (bold % 2 === 1) out += "**";
  const code = (out.match(/`/g) ?? []).length;
  if (code % 2 === 1) out += "`";
  const singles = (out.replace(/\*\*/g, "").match(/\*/g) ?? []).length;
  if (singles % 2 === 1) out += "*";
  return out;
}
