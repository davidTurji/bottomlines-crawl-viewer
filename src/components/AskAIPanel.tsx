import { ArrowUp, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Markdown } from "@/components/Markdown";
import { PAGE_LABEL, useAskAi, type AskMessage } from "@/lib/askAi";
import { cn } from "@/lib/utils";

/**
 * THE ASK AI PANE.
 *
 * The shape every chat has, because it is the shape people already know
 * how to use: a quiet header, the conversation scrolling in the middle, a
 * rounded composer pinned to the bottom with a round send button, one line
 * of small print under it. The reader's question sits on the right in a
 * soft grey bubble; the answer sits on the left as plain text with a small
 * mark beside it. System fonts throughout, so the pane reads like the chat
 * apps on the reader's own machine rather than like the report.
 *
 * It is a SIDE pane, not a dialog. On a desktop it takes about a third of
 * the window and pushes the report over, so the numbers an answer talks
 * about stay on screen beside it; nothing is covered and nothing is
 * dimmed. On a phone it takes the screen, which is the only honest amount
 * of room for a conversation at that width.
 *
 * Nothing in here decides anything. How many questions are left, whether
 * the budget is spent and what a refusal says all come from the server;
 * this pane shows them.
 */
export default function AskAIPanel({ className }: { className?: string }) {
  const { status, setOpen, page, messages, pending, remaining, budgetExhausted, send } = useAskAi();
  const [value, setValue] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Follow the conversation as it grows. Instant, not smooth: a smooth
  // scroll restarts on every change and never arrives.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  // The composer is the point of opening the pane: focus it.
  useEffect(() => {
    inputRef.current?.focus();
  }, [page]);

  // Auto-grow in place: reset to 0 first or scrollHeight only ever grows.
  // An empty box is one line, measured or not: while the pane is still
  // sliding open its width is a few pixels, every character wraps, and a
  // measurement taken then would leave a tall empty box behind.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!value) {
      el.style.height = "";
      return;
    }
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const cap = status?.per_page_cap ?? 0;
  const quotaReached = remaining !== null && remaining <= 0;
  const locked = quotaReached || budgetExhausted;
  const canSend = value.trim().length > 0 && !pending && !locked;
  const suggestions = status?.suggestions?.[page] ?? [];
  const empty = messages.length === 0;

  const submit = () => {
    if (!canSend) return;
    send(value);
    setValue("");
  };

  const ask = (q: string) => {
    if (pending || locked) return;
    send(q);
  };

  const lockedLine = budgetExhausted
    ? "This report's AI budget is used up."
    : quotaReached
      ? `You have used the ${cap} questions for this page.`
      : null;

  return (
    <section
      aria-label="Ask AI"
      className={cn("ask-font flex h-full w-full flex-col bg-white text-slate-900", className)}
    >
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-slate-200/80 px-3.5 sm:h-14 sm:px-4">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold leading-tight text-slate-900">Ask AI</h2>
          <p className="truncate text-[12px] leading-tight text-slate-500">
            About this report, {PAGE_LABEL[page]} page
          </p>
        </div>
        {remaining !== null && cap > 0 && (
          <span
            className={cn(
              "hidden flex-shrink-0 rounded-full px-2 py-0.5 text-[11.5px] tabular-nums sm:inline",
              locked ? "bg-slate-100 text-slate-500" : "bg-primary/10 text-primary",
            )}
            title={`${remaining} of ${cap} questions left on this page`}
          >
            {remaining} of {cap} left
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close Ask AI"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        {empty ? (
          <EmptyState suggestions={suggestions} onPick={ask} disabled={pending || locked} />
        ) : (
          <div className="space-y-6">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 px-3.5 pb-3 pt-1 sm:px-4">
        {lockedLine && (
          <p className="mb-2 px-1 text-[12.5px] text-slate-500">{lockedLine}</p>
        )}
        {!empty && suggestions.length > 0 && !locked && (
          <SuggestionRail suggestions={suggestions} asked={messages} onPick={ask} disabled={pending} />
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className={cn(
            "flex items-end gap-2 rounded-[26px] py-2 pl-4 pr-2 transition-shadow",
            locked ? "bg-slate-100" : "bg-[#f4f4f4] focus-within:shadow-[0_0_0_1px_rgba(0,0,0,0.06)]",
          )}
        >
          <textarea
            ref={inputRef}
            value={locked ? "" : value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            maxLength={400}
            readOnly={locked}
            aria-disabled={locked || undefined}
            placeholder={
              budgetExhausted
                ? "The AI budget for this report is used up"
                : quotaReached
                  ? "No questions left on this page"
                  : "Ask anything about this report"
            }
            className="min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-[1.55] text-slate-900 outline-none placeholder:text-slate-500 disabled:text-slate-400"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className={cn(
              "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors",
              canSend ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-slate-300/80 text-white",
            )}
          >
            <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </button>
        </form>
        <p className="mt-2 px-2 text-center text-[11.5px] leading-snug text-slate-500">
          {status?.disclaimer ?? "Answers come only from this report and can be wrong. Check the lines."}
        </p>
      </div>
    </section>
  );
}

function EmptyState({
  suggestions,
  onPick,
  disabled,
}: {
  suggestions: string[];
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex h-full flex-col justify-center py-4">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-6 w-6 text-primary" />
      </span>
      <h3 className="mt-4 text-center text-[20px] font-semibold tracking-tight text-slate-900">
        What would you like to know?
      </h3>
      <p className="mx-auto mt-1.5 max-w-[22rem] text-center text-[13.5px] leading-relaxed text-slate-500">
        Ask about the numbers, lines, publishers and apps on this page, or what a term means.
        Answers come from this report only.
      </p>
      <div className="mt-6 grid gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            disabled={disabled}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-[14px] leading-snug text-slate-700 transition-colors hover:border-primary/30 hover:bg-primary/[0.04] hover:text-slate-900 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The starters not yet asked, as small chips above the composer. */
function SuggestionRail({
  suggestions,
  asked,
  onPick,
  disabled,
}: {
  suggestions: string[];
  asked: AskMessage[];
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  const done = new Set(asked.filter((m) => m.role === "user").map((m) => m.content));
  const remaining = suggestions.filter((s) => !done.has(s)).slice(0, 3);
  if (remaining.length === 0) return null;
  return (
    <div className="tbl tbl-no-scrollbar mb-2 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5">
      {remaining.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          disabled={disabled}
          className="flex-shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] text-slate-600 transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function Message({ message }: { message: AskMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-[20px] bg-[#f4f4f4] px-4 py-2.5 text-[15px] leading-[1.6] text-slate-900">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        {message.pending ? (
          <ThinkingDots />
        ) : (
          <Markdown
            text={message.content}
            className={cn("text-[15px] leading-[1.7]", message.refused ? "text-slate-600" : "text-slate-800")}
          />
        )}
      </div>
    </div>
  );
}

/** Three quiet dots while the answer is being written and checked. */
function ThinkingDots() {
  return (
    <span className="flex h-7 items-center gap-1" role="status" aria-label="Thinking">
      {[0, 1, 2].map((n) => (
        <span
          key={n}
          className="ask-dot h-2 w-2 rounded-full bg-slate-400"
          style={{ animationDelay: `${n * 0.18}s` }}
        />
      ))}
    </span>
  );
}
