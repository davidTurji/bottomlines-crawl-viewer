import { useRef, useState } from "react";
import { ArrowUp, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useChatStream } from "@/lib/useChatStream";

/**
 * The inline Ask AI surface for every viewer page.
 *
 * Layout lifted verbatim from bottomlines-app's AskAIComposer: a pill-shaped
 * input with a sparkle icon on the left and a round send button on the right,
 * a horizontally scrolling suggestion rail beneath, and, once a question has
 * been asked, an inline thread that grows down the page.
 *
 * No fixed drawer, no modal. The thread is part of the page so the reader
 * keeps seeing their crawl numbers behind and around the answers.
 */
export default function InlineAskAI({
  token,
  suggestions,
  placeholder = "Ask about your crawl",
}: {
  token: string;
  suggestions: string[];
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const railRef = useRef<HTMLDivElement>(null);
  const { messages, streaming, send } = useChatStream(token);

  const page = (dir: number) => {
    const el = railRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const ask = (q: string) => {
    if (!q.trim() || streaming) return;
    send(q.trim());
    setValue("");
  };

  return (
    <div className="space-y-4">
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
            disabled={!value.trim() || streaming}
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
                disabled={streaming}
                className="flex-shrink-0 snap-start whitespace-nowrap rounded-full border border-border bg-white px-3.5 py-1.5 text-xs text-slate-500 transition-colors hover:border-primary/25 hover:text-primary disabled:opacity-50"
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

      {messages.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-5">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[85%] rounded-2xl bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                  : "mr-auto max-w-[92%] rounded-2xl bg-muted px-3.5 py-2 text-sm text-slate-800"
              }
            >
              <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
            </div>
          ))}
          {streaming && (
            <p className="text-xs text-muted-foreground">Thinking, one moment.</p>
          )}
        </div>
      )}
    </div>
  );
}
