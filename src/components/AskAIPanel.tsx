import { ArrowUp, Check, Copy, Sparkles, SquarePen, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { RevealedMarkdown } from "@/components/RevealedMarkdown";
import { AI_POLICY_URL, useAskAi, type AskMessage } from "@/lib/askAi";
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
  const { status, page, messages, pending, allowanceLeft, budgetExhausted, send, clear } = useAskAi();
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Follow the conversation as it grows, and as an answer is written out.
  const follow = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  };
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

  // Out of quota, the composer stays open: questions the report answers by
  // itself are free and still work; anything that needs the model is
  // refused by the server in a sentence.
  const canSend = value.trim().length > 0 && !pending;
  const suggestions = status?.suggestions?.[page] ?? [];
  const empty = messages.length === 0;

  const submit = () => {
    if (!canSend) return;
    send(value);
    setValue("");
  };
  const ask = (q: string) => {
    if (pending) return;
    send(q);
  };

  return (
    <section aria-label="Ask AI" className="ask-font flex h-full w-full flex-col bg-white text-slate-900">
      <header
        className={cn(
          "flex h-12 flex-shrink-0 items-center gap-2 border-b border-slate-200/80 pl-4 pr-2",
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
          <EmptyState suggestions={suggestions} onPick={ask} disabled={pending} />
        ) : (
          <div className="flex flex-col gap-5 px-4 pb-4 pt-5 sm:px-5">
            {messages.map((m) => (
              <Message key={m.id} message={m} onProgress={follow} />
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
          className="flex items-end gap-2 rounded-[26px] bg-[#f4f4f4] py-2 pl-4 pr-2 transition-shadow focus-within:shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
        >
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            maxLength={400}
            placeholder="Ask anything about this report"
            className="min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-[1.5] text-slate-900 outline-none placeholder:text-slate-500"
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
        <QuotaLine left={allowanceLeft} exhausted={budgetExhausted} disclaimer={status?.disclaimer} />
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
      <p className="mt-6 max-w-[380px] text-center text-[11.5px] leading-relaxed text-slate-400">
        By asking a question you agree to the <PolicyLink>AI usage policy</PolicyLink>.
      </p>
    </div>
  );
}

function Message({ message, onProgress }: { message: AskMessage; onProgress?: () => void }) {
  const [written, setWritten] = useState(!message.reveal);
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-[24px] bg-[#f4f4f4] px-5 py-2.5 text-[16px] leading-[1.6] text-[#0d0d0d]">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="group flex gap-3">
      <Mark className="mt-1 h-6 w-6" />
      <div className="min-w-0 flex-1">
        {message.pending ? (
          <Thinking />
        ) : (
          <>
            <RevealedMarkdown
              text={message.content}
              reveal={Boolean(message.reveal)}
              onDone={() => setWritten(true)}
              onProgress={onProgress}
              className={cn("text-[16px] leading-[1.75]", message.refused ? "text-slate-600" : "text-[#0d0d0d]")}
            />
            {written && (
              <div className="mt-1 flex items-center gap-2">
                {!message.refused && <CopyButton text={message.content} />}
                <UsageNote message={message} />
              </div>
            )}
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
    <div className="flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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

/**
 * How much of the quota an answer used, in grey under it. Answers the report
 * gives by itself say so, because they are the ones a reader can lean on
 * when the quota runs low. Stored transcripts from before carry nothing.
 */
function UsageNote({ message }: { message: AskMessage }) {
  if (message.local) {
    return <span className="text-[11.5px] text-slate-400">From the report, no quota used</span>;
  }
  if (message.usedPct === undefined || message.usedPct <= 0) return null;
  const pct = message.usedPct < 1 ? "under 1%" : `${Math.round(message.usedPct)}%`;
  return <span className="text-[11.5px] text-slate-400">Used {pct} of quota</span>;
}

/**
 * The quota, always in view under the composer: a small ring that empties as
 * the report's AI quota is spent, the percent left, and the caution. When the
 * quota is gone it says so, and that the report's own answers still work.
 */
function QuotaLine({
  left,
  exhausted,
}: {
  left: number | null;
  exhausted: boolean;
  disclaimer?: string;
}) {
  const policy = <PolicyLink>usage policy</PolicyLink>;
  if (left === null) {
    return (
      <p className="mt-2 px-2 text-center text-[11px] leading-snug text-slate-500">
        Answers can be wrong, see the {policy}.
      </p>
    );
  }
  const pct = exhausted ? 0 : Math.max(0, Math.min(100, left));
  const r = 5.5;
  const c = 2 * Math.PI * r;
  return (
    <p className="mt-2 flex items-center justify-center gap-1.5 px-2 text-center text-[11px] leading-snug text-slate-500">
      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 flex-shrink-0 -rotate-90" aria-hidden>
        <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
        <circle
          cx="7"
          cy="7"
          r={r}
          fill="none"
          stroke={pct > 15 ? "hsl(var(--primary))" : "hsl(var(--tone-warn))"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span className="truncate">
        {exhausted ? (
          <>AI quota used up. Report questions still work. See the {policy}.</>
        ) : (
          <>
            {pct}% of AI quota left. Answers can be wrong, see the {policy}.
          </>
        )}
      </span>
    </p>
  );
}

/** The AI usage policy on the main site, in a new tab so the report stays put. */
function PolicyLink({ children }: { children: React.ReactNode }) {
  return (
    <a
      href={AI_POLICY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-slate-300 underline-offset-2 transition-colors hover:text-slate-800 hover:decoration-slate-500"
    >
      {children}
    </a>
  );
}

/** One breathing dot while the answer is being written and checked. */
function Thinking() {
  return (
    <span className="flex h-7 items-center" role="status" aria-label="Thinking">
      <span className="ask-breathe inline-block h-3.5 w-3.5 rounded-full bg-slate-800" />
    </span>
  );
}
