import { ArrowUp, Check, ChevronsRight, Copy, PanelRightClose, PanelRightOpen, SquarePen, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AiMark, BottomlinesAiWordmark } from "@/components/BottomlinesAiMark";
import { Markdown } from "@/components/Markdown";
import { PAGE_LABEL, useAskAi, type AskMessage } from "@/lib/askAi";
import { cn } from "@/lib/utils";

/**
 * THE ASK AI DRAWER'S CONTENT. The launcher owns the pill, the backdrop and
 * the drawer frame (see AskAILauncher); this is what is inside the frame.
 *
 * The shape is the console's Ask AI, which readers of the console already
 * know, in the chat idiom everyone else knows: a one-row header with the
 * bottomlines.ai mark and the quota for this page, the conversation in the
 * middle (the reader's question in a grey bubble on the right, the answer
 * under a small byline on the left, full width), a rounded composer with a
 * round green send button, one line of small print.
 *
 * Nothing in here decides anything. How many questions are left, whether
 * the budget is spent and what a refusal says all come from the server;
 * this pane shows them.
 */
export default function AskAIPanel({
  onClose,
  expanded = false,
  onToggleExpand,
}: {
  /** Minimise: the conversation is kept, the pill brings it back. */
  onClose: () => void;
  /** The panel is at its wide setting (half the window). */
  expanded?: boolean;
  /** Toggle between a third and half of the window; absent on a phone. */
  onToggleExpand?: () => void;
}) {
  const { status, page, messages, pending, remaining, budgetExhausted, send, clear } = useAskAi();
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Follow the conversation as it grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  // The composer is the point of opening the drawer: focus it, once it exists.
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
  const used = remaining !== null && cap > 0 ? Math.max(0, cap - remaining) : 0;
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

  return (
    <section aria-label="Ask AI" className="ask-font flex h-full w-full flex-col bg-white text-slate-900">
      {/* Header: who is answering, and the close. */}
      <header
        className={cn(
          "flex h-[52px] flex-shrink-0 items-center gap-2 border-b border-slate-200/70 pl-4 pr-2",
          "max-sm:h-auto max-sm:py-2.5 max-sm:pt-[max(0.625rem,env(safe-area-inset-top))]",
        )}
      >
        <AiMark className="h-8 w-8" />
        <div className="min-w-0 flex-1 leading-tight">
          <BottomlinesAiWordmark className="block truncate text-[15px]" />
          <p className="truncate text-[11.5px] text-slate-500">Ask about this report, {PAGE_LABEL[page]} page</p>
        </div>
        {/* New conversation on this page. Only once there is one: a reset
            button on an empty thread is a control with nothing to do. */}
        {messages.length > 0 && !pending && (
          <HeaderButton label="New conversation" onClick={clear}>
            <SquarePen className="h-4 w-4" />
          </HeaderButton>
        )}
        {onToggleExpand && (
          <HeaderButton label={expanded ? "Narrower" : "Wider"} onClick={onToggleExpand}>
            {expanded ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </HeaderButton>
        )}
        {/* Minimise on a desktop (the thread stays, the pill brings it
            back); a plain close on a phone, where the panel is the screen. */}
        <HeaderButton label="Minimise" onClick={onClose} className="max-sm:hidden">
          <ChevronsRight className="h-4 w-4" />
        </HeaderButton>
        <HeaderButton label="Close" onClick={onClose} className="sm:hidden">
          <X className="h-4 w-4" />
        </HeaderButton>
      </header>

      {/* The quota, always in view. Five segments per page, filled as they
          are used; the words say the same thing for a reader who does not
          count segments. The server owns both numbers. */}
      {cap > 0 && remaining !== null && (
        <div
          className={cn(
            "flex flex-shrink-0 items-center gap-3 border-b border-slate-200/70 px-4 py-2 text-[12px]",
            locked ? "bg-slate-50 text-slate-500" : "bg-white text-slate-600",
          )}
          aria-label={`${remaining} of ${cap} questions left on this page`}
        >
          <span className="flex items-center gap-1" aria-hidden>
            {Array.from({ length: cap }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-5 rounded-full transition-colors",
                  i < used ? (locked ? "bg-slate-300" : "bg-primary") : "bg-slate-200",
                )}
              />
            ))}
          </span>
          <span className="tabular-nums">
            {budgetExhausted
              ? "This report's AI budget is used up"
              : quotaReached
                ? `All ${cap} questions used on this page`
                : `${remaining} of ${cap} questions left on this page`}
          </span>
        </div>
      )}

      {/* The conversation. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <EmptyState suggestions={suggestions} onPick={ask} disabled={pending || locked} />
        ) : (
          <div className="flex flex-col gap-6 px-5 py-6">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
            {!locked && suggestions.length > 0 && !pending && (
              <SuggestionRail suggestions={suggestions} asked={messages} onPick={ask} />
            )}
          </div>
        )}
      </div>

      {/* The composer. */}
      <div className="flex-shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:pb-4">
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
        <p className="mt-2 px-2 text-center text-[11.5px] leading-snug text-slate-500">
          {status?.disclaimer ?? "Answers come only from this report and can be wrong. Check the lines."}
        </p>
      </div>
    </section>
  );
}

function HeaderButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * The empty card: the question, and the starters as raised pills on a
 * soft emerald glow, the console's own treatment.
 */
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
    <div className="relative flex h-full flex-col items-center justify-center gap-7 overflow-hidden px-5 py-10">
      {/* The glow: three soft lights in the brand's greens drifting slowly
          behind the greeting, the way a premium assistant's home screen
          breathes. Blurred blobs, transform-only animation, no motion when
          the reader asked for none. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span className="ask-glow absolute left-1/2 top-[38%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.28),rgba(16,185,129,0))] blur-2xl" />
        <span className="ask-glow ask-glow-2 absolute left-[30%] top-[62%] h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(45,212,191,0.22),rgba(45,212,191,0))] blur-2xl" />
        <span className="ask-glow ask-glow-3 absolute left-[72%] top-[58%] h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(132,204,22,0.16),rgba(132,204,22,0))] blur-2xl" />
      </div>
      <AiMark className="h-12 w-12" />
      <div className="text-center">
        <h3 className="text-[19px] font-semibold tracking-tight text-slate-900">What do you want to know?</h3>
        <p className="mx-auto mt-1.5 max-w-[20rem] text-[13px] leading-relaxed text-slate-500">
          Ask about the numbers, lines, publishers and apps on this page, or what a term means.
        </p>
      </div>
      {suggestions.length > 0 && (
        <div className="mx-auto flex max-w-[360px] flex-wrap justify-center gap-2.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              disabled={disabled}
              className="rounded-full border border-emerald-600/15 bg-[linear-gradient(180deg,#ffffff,#f6fbf8)] px-4 py-2 text-[12.5px] font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.06),0_10px_28px_-12px_rgba(16,185,129,0.45)] transition-all hover:-translate-y-0.5 hover:border-emerald-600/35 hover:text-primary hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_4px_rgba(15,23,42,0.06),0_14px_32px_-10px_rgba(16,185,129,0.55)] disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The starters not asked yet, as quiet chips after the last answer. */
function SuggestionRail({
  suggestions,
  asked,
  onPick,
}: {
  suggestions: string[];
  asked: AskMessage[];
  onPick: (q: string) => void;
}) {
  const done = new Set(asked.filter((m) => m.role === "user").map((m) => m.content));
  const left = suggestions.filter((s) => !done.has(s)).slice(0, 3);
  if (left.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pl-8">
      {left.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600 transition-colors hover:border-emerald-500/40 hover:text-primary"
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
        <div className="max-w-[85%] whitespace-pre-wrap rounded-[20px] bg-[#f4f4f4] px-4 py-2.5 text-[14.5px] leading-[1.6] text-slate-900">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="group">
      {/* Who is speaking, above the answer rather than beside it, so the
          text gets the full width of a narrow drawer. */}
      <div className="mb-1.5 flex select-none items-center gap-1.5">
        <AiMark tone="avatar" className="h-5 w-5" />
        <BottomlinesAiWordmark className="text-[11px] font-medium tracking-tight" />
      </div>
      <div className="min-w-0">
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
    <div className="mt-1.5 flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
