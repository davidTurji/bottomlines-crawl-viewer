import { useRef, useState } from "react";
import { ArrowUp, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

import AskAIChat from "@/components/AskAIChat";
import { useChatStream } from "@/lib/useChatStream";

/**
 * The Ask AI doorway on a report page.
 *
 * What sits on the page is a composer and a rail of questions. What happens
 * when you touch either is that the conversation opens in its own panel
 * (AskAIChat) -- it does not grow down the report any more. An inline
 * thread meant the answer pushed the publisher table off the screen, so
 * asking a second question scrolled the first one away and the numbers you
 * were asking about went with it.
 *
 * The composer here is a button wearing the input's clothes. It is not a
 * real field: there is a real one in the panel, focused on open, and two
 * inputs for one conversation is how you end up typing into the wrong one.
 *
 * The transcript lives HERE, above the panel, so closing it to look at the
 * report and opening it again brings the conversation back.
 */
export default function InlineAskAI({
  token,
  suggestions,
  placeholder = "Ask about your crawl",
  subtitle,
}: {
  token: string;
  suggestions: string[];
  placeholder?: string;
  subtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const { messages, streaming, send } = useChatStream(token);

  const page = (dir: number) => {
    const el = railRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const askAndOpen = (q: string) => {
    setOpen(true);
    send(q);
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-[28px] border border-border bg-white py-2 pl-4 pr-2 text-left shadow-sm transition-colors hover:border-primary/40 sm:pl-5"
      >
        <Sparkles className="h-4 w-4 flex-shrink-0 text-primary" />
        <span className="h-10 min-w-0 flex-1 truncate py-[11px] text-sm text-slate-400">
          {messages.length > 0 ? "Continue the conversation" : placeholder}
        </span>
        <span
          aria-hidden
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <ArrowUp className="h-4 w-4" />
        </span>
      </button>

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
              onClick={() => askAndOpen(s)}
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

      <AskAIChat
        open={open}
        onOpenChange={setOpen}
        messages={messages}
        streaming={streaming}
        onSend={send}
        suggestions={suggestions}
        subtitle={subtitle}
      />
    </div>
  );
}
