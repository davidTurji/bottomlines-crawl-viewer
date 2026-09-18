import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUp, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Markdown } from "@/components/Markdown";
import type { ChatMsg } from "@/lib/useChatStream";
import { cn } from "@/lib/utils";

/**
 * The Ask AI conversation, as an actual chat.
 *
 * It used to be an inline thread that grew down the report: the composer
 * stayed where it was and answers pushed the publisher table further and
 * further below the fold, so reading a second answer meant scrolling past
 * the first, and the page you were asking about disappeared upward. A
 * conversation wants its own surface.
 *
 * So the composer on the page is a doorway now, and this is the room: a
 * centred panel on desktop, a full-height sheet on a phone, with the
 * transcript scrolling between a fixed header and a fixed composer -- the
 * shape every chat has, because it is the shape that works when the
 * transcript outgrows the screen.
 *
 * The transcript lives in the PARENT, not here. Closing the panel is not
 * meant to be destructive: a reader who shuts it to check a number on the
 * page and opens it again should find their conversation, not a blank box.
 */
export default function AskAIChat({
  open,
  onOpenChange,
  messages,
  streaming,
  onSend,
  suggestions,
  subtitle,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  messages: ChatMsg[];
  streaming: boolean;
  onSend: (q: string) => void;
  suggestions: string[];
  subtitle?: string;
}) {
  const [value, setValue] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow the answer as it streams in. Instant rather than smooth while
  // streaming: a smooth scroll restarts on every token and never arrives.
  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [open, messages, streaming]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  const ask = (q: string) => {
    const clean = q.trim();
    if (!clean || streaming) return;
    onSend(clean);
    setValue("");
  };

  const empty = messages.length === 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] data-[state=open]:animate-sheet-overlay-in data-[state=closed]:animate-sheet-overlay-out" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-white shadow-2xl outline-none",
            // Phone: the whole screen, which is the only honest amount of
            // room for a transcript at that width.
            "data-[state=open]:animate-sheet-in-bottom data-[state=closed]:animate-sheet-out-bottom",
            // Desktop: a centred panel, tall enough that the transcript is
            // the thing you see and not a letterbox.
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(42rem,88vh)] sm:w-[min(44rem,94vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border",
            "sm:data-[state=open]:animate-dialog-in sm:data-[state=closed]:animate-dialog-out",
          )}
        >
          <header className="flex flex-shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-sm font-medium text-slate-900">
                Ask about your crawl
              </Dialog.Title>
              {subtitle && (
                <p className="truncate text-[11px] text-slate-500">{subtitle}</p>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-muted hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {empty ? (
              <div className="flex h-full flex-col justify-center py-6">
                <p className="text-center font-display text-base text-slate-900">
                  What would you like to know?
                </p>
                <p className="mx-auto mt-1 max-w-sm text-center text-[13px] leading-relaxed text-slate-500">
                  Answers come from this week&apos;s crawl, so every figure
                  below matches the report behind this panel.
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-xl border border-border bg-white px-3.5 py-2.5 text-left text-[13px] text-slate-600 transition-colors hover:border-primary/30 hover:bg-primary/[0.03] hover:text-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-2.5">
                      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Sparkles className="h-3 w-3 text-primary" />
                      </span>
                      <div className="min-w-0 flex-1 text-sm text-slate-700">
                        {m.content ? (
                          <Markdown text={m.content} />
                        ) : (
                          <ThinkingDots />
                        )}
                      </div>
                    </div>
                  ),
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(value);
            }}
            className="flex flex-shrink-0 items-center gap-2 border-t border-border px-3 py-3 sm:px-4"
          >
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ask a follow-up"
              className="h-10 min-w-0 flex-1 rounded-full border border-border bg-white px-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary/40"
            />
            <button
              type="submit"
              disabled={!value.trim() || streaming}
              aria-label="Send"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-slate-100 disabled:text-slate-300"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Three dots while the first token is still in flight. An empty assistant
 *  bubble with nothing in it reads as an answer that failed. */
function ThinkingDots() {
  return (
    <span className="flex items-center gap-1 py-1.5" role="status" aria-label="Thinking">
      {[0, 1, 2].map((n) => (
        <span
          key={n}
          className="h-1.5 w-1.5 animate-dot-bounce rounded-full bg-slate-300"
          style={{ animationDelay: `${n * 160}ms` }}
        />
      ))}
    </span>
  );
}
