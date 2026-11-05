import { ArrowUp, Check, Copy, Sparkles, SquarePen, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Markdown } from "@/components/Markdown";
import { useAskAi, type AskMessage } from "@/lib/askAi";
import { cn } from "@/lib/utils";

/**
 * THE ASK AI PANEL'S CONTENT. The launcher owns the pill and the docked
 * frame (see AskAILauncher); this is what is inside the frame.
 *
 * ChatGPT's grammar, and no more: a thin header with the assistant's round
 * mark, two controls at most (new conversation, close); the conversation
 * in the middle, the reader's question in a grey bubble on the right, the
 * answer beside the round mark on the left; a rounded composer with a round
 * green send; one quiet line under it that carries both the questions left
 * on this page and the caution. Nothing is labelled that does not need a
 * label, and nothing is drawn that is not used.
 *
 * Nothing in here decides anything. How many questions are left, whether
 * the budget is spent and what a refusal says all come from the server;
 * this panel shows them.
 */
export default function AskAIPanel({ onClose }: { onClose: () => void }) {
  const { status, page, messages, pending, remaining, budgetExhausted, send, clear } = useAskAi();
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Follow the conversation as it grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  // The composer is the point of opening the panel: focus it, once it exists.
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [page]);

  // Auto-grow in place; an empty box is one line.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!value) {
      el.style.height = "";
      return;
    }
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
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

  // One line under the composer: what is left, and the caution. When a
  // limit is reached the line says only that, because nothing else matters.
  const footer = budgetExhausted
    ? "This report's AI budget is used up."
    : quotaReached
      ? "No questions left on this page."
      : remaining !== null && cap > 0
        ? `${remaining} of ${cap} questions left on this page. Answers can be wrong, check the report.`
        : "Answers can be wrong, check the report.";

  return (
    <section aria-label="Ask AI" className="ask-font flex h-full w-full flex-col bg-white text-slate-900">
      <header
        className={cn(
          "flex h-12 flex-shrink-0 items-center gap-2 pl-4 pr-2",
          "max-sm:h-auto max-sm:py-2 max-sm:pt-[max(0.5rem,env(safe-area-inset-top))]",
        )}
      >
        <Mark className="h-7 w-7" />
        <h2 className="min-w-0 flex-1 truncate text-[14px] font-medium text-slate-900">Ask AI</h2>
        {messages.length > 0 && !pending && (
          <IconButton label="New conversation" onClick={clear}>
            <SquarePen className="h-[17px] w-[17px]" strokeWidth={1.8} />
          </IconButton>
        )}
        <IconButton label="Close" onClick={onClose}>
          <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </IconButton>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <EmptyState suggestions={suggestions} onPick={ask} disabled={pending || locked} />
        ) : (
          <div className="flex flex-col gap-5 px-4 pb-4 pt-2 sm:px-5">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-1 sm:px-4 sm:pb-3">
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
            placeholder={locked ? "" : "Ask anything about this report"}
            className="min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-[1.55] text-slate-900 outline-none placeholder:text-slate-500"
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
        <p className="mt-2 truncate px-2 text-center text-[11px] leading-snug text-slate-500">{footer}</p>
      </div>
    </section>
  );
}

/** The assistant's mark: the sparkle on a green circle. */
function Mark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground",
        className,
      )}
      aria-hidden="true"
    >
      <Sparkles className="h-[55%] w-[55%]" strokeWidth={2} />
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
    >
      {children}
    </button>
  );
}

/** The empty panel: the question, and the starters. */
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
    <div className="flex h-full flex-col items-center justify-center px-5 pb-8 pt-4">
      <h3 className="text-center text-[22px] font-semibold tracking-tight text-slate-900">
        What do you want to know?
      </h3>
      {suggestions.length > 0 && (
        <div className="mt-6 flex w-full max-w-[380px] flex-col gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              disabled={disabled}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-left text-[13.5px] leading-snug text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Message({ message }: { message: AskMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-[20px] bg-[#f4f4f4] px-4 py-2.5 text-[14.5px] leading-[1.6] text-slate-900">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="group flex gap-3">
      <Mark className="mt-0.5 h-6 w-6" />
      <div className="min-w-0 flex-1 pt-0.5">
        {message.pending ? (
          <ThinkingDots />
        ) : (
          <>
            <Markdown
              text={message.content}
              className={cn("text-[14.5px] leading-[1.7]", message.refused ? "text-slate-600" : "text-slate-800")}
            />
            {!message.refused && <CopyButton text={message.content} />}
          </>
        )}
      </div>
    </div>
  );
}

/** Copy the answer. Shown on hover so a resting thread stays quiet. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the text is on screen and selectable */
    }
  };
  return (
    <div className="mt-1 flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      <button
        type="button"
        onClick={copy}
        aria-label="Copy answer"
        title="Copy"
        className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/** Three quiet dots while the answer is being written and checked. */
function ThinkingDots() {
  return (
    <span className="flex h-6 items-center gap-1" role="status" aria-label="Thinking">
      {[0, 1, 2].map((n) => (
        <span key={n} className="ask-dot h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: `${n * 0.18}s` }} />
      ))}
    </span>
  );
}
