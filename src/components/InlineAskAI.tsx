import { useRef, useState } from "react";
import { ArrowUp, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

/**
 * Page-level Ask AI trigger: a pill input + horizontally-scrolling
 * suggestion rail, matching bottomlines-app's AskAIComposer.
 *
 * Purely presentational. Owns no transcript, no streaming, no request.
 * Submitting the form or clicking a chip calls `onAsk(question)`; the
 * parent page routes that into AskAIDrawer.askAndOpen(q), which is where
 * the conversation actually lives.
 *
 * The rail is arrow-paged on desktop and swipe-scrolled on touch, so
 * long chip lists don't need to wrap onto multiple rows.
 */
export default function InlineAskAI({
  suggestions,
  onAsk,
  placeholder = "Ask about your crawl",
}: {
  suggestions: string[];
  onAsk: (question: string) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const railRef = useRef<HTMLDivElement>(null);

  const page = (dir: number) => {
    const el = railRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const ask = (q: string) => {
    const clean = q.trim();
    if (!clean) return;
    onAsk(clean);
    setValue("");
  };

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(value);
        }}
        className="flex items-center gap-3 rounded-[28px] border border-border bg-white py-2 pl-4 pr-2 shadow-sm transition-colors focus-within:border-primary/40 sm:pl-5"
      >
        <Sparkles className="h-4 w-4 flex-shrink-0 text-primary" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          aria-label="Ask AI"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-slate-100 disabled:text-slate-300"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => page(-1)}
          aria-label="Previous suggestions"
          className="hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:flex"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div
          ref={railRef}
          className="tbl tbl-no-scrollbar flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto sm:overflow-x-hidden"
        >
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="flex-shrink-0 snap-start whitespace-nowrap rounded-full border border-border bg-white px-3.5 py-1.5 text-xs text-slate-500 transition-colors hover:border-primary/25 hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => page(1)}
          aria-label="More suggestions"
          className="hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:flex"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
