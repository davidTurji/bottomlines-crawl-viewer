import { ArrowUp, Check, Copy, Download, FileSpreadsheet, Plus, Sparkles, SquarePen, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { copyText } from "@/components/PublisherLinks";
import { RevealedMarkdown } from "@/components/RevealedMarkdown";
import {
  AI_POLICY_URL,
  DEFAULT_ACCEPT,
  DOWNLOAD_LABEL,
  isPastedList,
  useAskAi,
  type AskAttachment,
  type AskMessage,
} from "@/lib/askAi";
import { cn } from "@/lib/utils";
import { matchesAttachment } from "@/lib/askAttachment";

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
 *
 * FILES, the ChatGPT way: a round "+" left of the composer opens the file
 * picker; a file can also be dropped on the panel, and a long pasted list
 * becomes an attached list. The file sits as a chip on top of the composer
 * until it is removed, and rides along with every question; the server
 * checks it, never stores it, and offers the result as a download under
 * the answers that are about it.
 */
export default function AskAIPanel({ onClose }: { onClose: () => void }) {
  const {
    status, page, messages, pending, allowanceLeft, budgetExhausted, send, clear,
    attachment, attach, attachText, detach, download, finishReveal,
    draft: value, setDraft: setValue,
  } = useAskAi();
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const following = useRef(true);
  const scrollSize = useRef({ width: 0, height: 0, contentHeight: 0 });
  const expandedComposer = value.includes("\n") || value.length > 80;

  // Follow the conversation as it grows, and as an answer is written out.
  const follow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    scrollSize.current = { width: el.clientWidth, height: el.clientHeight, contentHeight: el.scrollHeight };
    if (following.current) el.scrollTo({ top: el.scrollHeight });
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [follow, messages.length, pending]);

  // The composer is the point of opening the panel: focus it, once it exists.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) {
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    }
  }, [page]);

  // Auto-grow in place; an empty box is one line.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const grow = () => {
      if (!value) { el.style.height = ""; return; }
      el.style.height = "0px";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    };
    grow();
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      grow();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, expandedComposer]);

  // Out of quota, the composer stays open: questions the report answers by
  // itself are free and still work; anything that needs the model is
  // refused by the server in a sentence.
  const fileReady = attachment?.state === "ready";
  const fileBlocked = Boolean(attachment && !fileReady);
  const canSend = (value.trim().length > 0 || fileReady) && !pending && !fileBlocked;
  const suggestions = status?.suggestions?.[page] ?? [];
  const fileSuggestions = attachment?.check?.suggestions ?? status?.files?.suggestions ?? [];
  const empty = messages.length === 0;
  const accept = status?.files?.accept ?? DEFAULT_ACCEPT;

  const pickFile = (files: FileList | null) => {
    const file = files?.[0];
    if (file) attach(file);
    if (window.matchMedia("(pointer: fine)").matches) {
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    }
  };

  const submit = () => {
    if (!canSend) return;
    following.current = true;
    send(value);
    setValue("");
  };
  const ask = (q: string) => {
    if (pending || fileBlocked) return;
    following.current = true;
    send(q);
  };

  return (
    <section
      aria-label="Ask AI"
      className="ask-font relative flex h-full min-h-0 w-full min-w-0 flex-col bg-white text-slate-900"
      onDragEnter={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        pickFile(e.dataTransfer.files);
      }}
    >
      {dragging && <DropOverlay />}
      <header
        className={cn(
          "relative flex h-14 flex-shrink-0 items-center gap-2 border-b border-slate-200/80 pl-4 pr-2",
          "max-sm:h-auto max-sm:py-2 max-sm:pt-[max(0.5rem,env(safe-area-inset-top))]",
        )}
      >
        <Mark className="h-6 w-6" />
        <h2 className="ask-label-enter min-w-0 flex-1 truncate text-[13px] font-medium text-slate-900">Bottomlines.ai</h2>
        <QuotaIndicator left={allowanceLeft} exhausted={budgetExhausted} />
        {messages.length > 0 && !pending && (
          <IconButton label="New conversation" onClick={clear}>
            <SquarePen className="h-[17px] w-[17px]" strokeWidth={1.8} />
          </IconButton>
        )}
        <IconButton label="Close" onClick={onClose}>
          <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </IconButton>
      </header>

      {/* Keep positioned transcript content, including screen-reader copy
          feedback, inside the scrolling region. */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onScroll={(e) => {
          const el = e.currentTarget;
          // Layout changes can emit scroll events before ResizeObserver.
          // They must not look like the reader scrolled up and disable following.
          const size = scrollSize.current;
          if (el.clientWidth !== size.width || el.clientHeight !== size.height || el.scrollHeight !== size.contentHeight) return;
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}>
        {empty ? (
          <EmptyState
            suggestions={fileReady ? fileSuggestions : suggestions}
            onPick={ask}
            disabled={pending || fileBlocked}
            withFile={fileReady}
          />
        ) : (
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-7 px-4 pb-6 pt-6 sm:px-6">
            {messages.map((m) => (
              <Message
                key={`${m.id}:${m.pending ? "pending" : "ready"}`}
                message={m}
                onProgress={follow}
                onRevealDone={finishReveal}
                attachment={attachment}
                onDownload={download}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-[760px] flex-shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:pb-3">
        {fileReady && !empty && !value && !pending && fileSuggestions.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
            {fileSuggestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                className="min-h-10 shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="rounded-[22px] bg-[#f4f4f4] p-1 transition-shadow focus-within:shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
        >
          {attachment && <AttachmentChip attachment={attachment} onRemove={detach} />}
          <div className={cn("flex items-end gap-1.5", expandedComposer && "flex-wrap")}>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach a file"
              title={status?.files?.hint ?? "Attach a CSV, TSV, TXT or XLSX file"}
              className="flex h-11 w-11 sm:[@media(pointer:fine)]:h-9 sm:[@media(pointer:fine)]:w-9 flex-shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900"
            >
              <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
            <textarea
              ref={inputRef}
              value={value}
              aria-label="Message Ask AI"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229 && window.matchMedia("(pointer: fine)").matches) {
                  e.preventDefault();
                  submit();
                }
              }}
              onPaste={(e) => {
                const files = e.clipboardData.files;
                if (files?.length) {
                  e.preventDefault();
                  pickFile(files);
                  return;
                }
                const text = e.clipboardData.getData("text");
                if (text && isPastedList(text)) {
                  // A pasted list is a file, as in ChatGPT: attached, not typed.
                  e.preventDefault();
                  attachText(text);
                }
              }}
              rows={1}
              maxLength={400}
              placeholder={fileReady ? "Ask about this file" : "Ask about your report"}
              className={cn(
                "min-h-[44px] sm:[@media(pointer:fine)]:min-h-[36px] min-w-0 flex-1 resize-none bg-transparent py-2.5 sm:[@media(pointer:fine)]:py-1.5 text-[16px] sm:[@media(pointer:fine)]:text-[14px] leading-6 text-slate-900 outline-none placeholder:text-slate-500",
                expandedComposer && "order-first basis-full px-3",
              )}
            />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className={cn(
              "group flex h-11 w-11 sm:[@media(pointer:fine)]:h-9 sm:[@media(pointer:fine)]:w-9 flex-shrink-0 items-center justify-center rounded-full",
              expandedComposer && "ml-auto",
            )}
          >
            <span className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
              canSend ? "bg-primary text-primary-foreground group-hover:bg-primary/90" : "bg-slate-300/80 text-white",
            )}>
              <ArrowUp className="h-4 w-4" strokeWidth={2} />
            </span>
          </button>
          </div>
        </form>
        <p className="mt-2 whitespace-nowrap text-center text-[10px] leading-4 text-slate-500 sm:text-[11px]">
          By chatting, you agree to the <PolicyLink>AI usage policy</PolicyLink>.
        </p>
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
      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
    >
      {children}
    </button>
  );
}

/** The empty panel: the question, and the starters. */
const SUGGESTION_LABEL: Record<string, string> = {
  "What changed this week, in short?": "This week's changes",
  "What was removed this week?": "Removed lines",
  "How many publishers and apps carry my lines?": "Publishers and apps",
  "How do I know if a publisher authorizes my seller ID?": "Seller authorization",
  "What does the Discovery page show?": "Discovery explained",
  "What is the difference between given and found lines?": "Given vs. found lines",
  "Which lines need fixing?": "Lines to fix",
  "What does listed in sellers.json mean?": "Listed sellers",
  "What is an inventory partner domain?": "Inventory partners",
  "What is the difference between owner domain and manager domain?": "Owner vs. manager",
  "Who named my domain this week?": "Who named my domain?",
  "What is the difference between DIRECT and RESELLER?": "DIRECT vs. RESELLER",
  "What does the Sellers.json page check?": "Sellers.json checks",
  "What is the difference between PUBLISHER, INTERMEDIARY and BOTH?": "Seller types",
  "What does it mean when a seller is not in my sellers.json?": "Missing sellers",
  "What does is_confidential mean?": "Confidential sellers",
  "What does the Schain page show?": "Schain explained",
  "What is a supply chain object?": "Supply chain objects",
  "What is an SDK in my sellers.json?": "SDKs in sellers.json",
  "Which of these carry my lines?": "Carrying my lines",
  "Which of these are not in my report?": "Not in my report",
  "Add the store link to each app": "Add store links",
  "Which of these lost my lines this week?": "Lost this week"
};

function EmptyState({
  suggestions,
  onPick,
  disabled,
  withFile,
}: {
  suggestions: string[];
  onPick: (q: string) => void;
  disabled: boolean;
  withFile: boolean;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-5 py-8">
      <h3 className="max-w-[420px] text-center text-[21px] font-medium leading-tight tracking-tight text-slate-900">
        {withFile ? "What do you want to know about this file?" : "What do you want to know?"}
      </h3>
      {suggestions.length > 0 && (
        <div className="mt-5 flex w-full max-w-[420px] flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              disabled={disabled}
              aria-label={s}
              title={s}
              className="min-h-10 max-w-full rounded-full border border-slate-200 bg-white px-3.5 py-2 text-center text-[13px] leading-5 text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
            >
              {SUGGESTION_LABEL[s] ?? s}
            </button>
          ))}
        </div>
      )}
      {!withFile && (
        <p className="mt-5 max-w-[380px] text-center text-[12.5px] leading-relaxed text-slate-500">
          Have a list of apps, store links or domains? Attach it with <span className="font-medium">+</span>{" "}
          to check it against this report.
        </p>
      )}
    </div>
  );
}

function Message({
  message,
  onProgress,
  onRevealDone,
  attachment,
  onDownload,
}: {
  message: AskMessage;
  onProgress?: () => void;
  onRevealDone: (id: string) => void;
  attachment: AskAttachment | null;
  onDownload: (only: string, format: "csv" | "xlsx") => Promise<void>;
}) {
  const [written, setWritten] = useState(!message.reveal);
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {message.file && (
          <div className="flex max-w-[85%] items-center gap-2.5 rounded-2xl border border-slate-200 bg-white py-2 pl-2 pr-4">
            <FileBadge />
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-medium text-slate-900">{message.file.name}</div>
              <div className="text-[12px] text-slate-500">{message.file.rows.toLocaleString()} rows</div>
            </div>
          </div>
        )}
        <div className="max-w-[90%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-[18px] bg-[#f4f4f4] px-4 py-2.5 text-[15px] leading-[1.6] text-[#0d0d0d]">
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
              onDone={() => { setWritten(true); onRevealDone(message.id); }}
              onProgress={onProgress}
              className={cn("[overflow-wrap:anywhere] text-[15px] leading-[1.65] [&>div]:leading-[inherit]", message.refused ? "text-slate-600" : "text-[#0d0d0d]")}
            />
            {written && message.download && !message.refused && (
              <DownloadRow message={message} attachment={attachment} onDownload={onDownload} />
            )}
            {written && (
              <div className="mt-1 flex items-center gap-2 text-left">
                <UsageNote message={message} />
                <CopyButton text={message.content} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The green spreadsheet badge of a file chip. */
function FileBadge() {
  return (
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
      <FileSpreadsheet className="h-[18px] w-[18px]" strokeWidth={1.8} />
    </span>
  );
}

/** The attached file, on top of the composer: reading, ready or refused. */
function AttachmentChip({ attachment, onRemove }: { attachment: AskAttachment; onRemove: () => void }) {
  const rows = attachment.check?.file.rows;
  const format = attachment.name.split(".").pop()?.toUpperCase() ?? "FILE";
  const sub =
    attachment.state === "reading"
      ? "Checking against this report…"
      : attachment.state === "error"
        ? attachment.error
        : `${format} · ${rows?.toLocaleString() ?? 0} rows · Checked`;
  return (
    <div className="mb-1.5 max-w-[360px] rounded-xl border border-slate-200/80 bg-white py-1 pl-2 pr-1" aria-live="polite">
    <div className="flex max-w-full items-center gap-2.5">
      {attachment.state === "reading" ? (
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
          <span className="ask-breathe inline-block h-3 w-3 rounded-full bg-slate-700" />
        </span>
      ) : attachment.state === "error" ? (
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
          <FileSpreadsheet className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
      ) : (
        <FileBadge />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-slate-900" title={attachment.name}>{attachment.name}</div>
        <div
          className={cn(
            "text-[12px] leading-snug",
            attachment.state === "error" ? "text-rose-600" : "truncate text-slate-500",
          )}
          title={attachment.state === "ready" ? `${sub}. Files are read to answer and are not stored.` : undefined}
        >
          {sub}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove file"
        title="Remove file"
        className="flex h-11 w-11 sm:[@media(pointer:fine)]:h-9 sm:[@media(pointer:fine)]:w-9 flex-shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
    {Boolean(attachment.check?.file.notes.length) && (
      <details className="mt-1 px-1 text-[12px] leading-relaxed text-slate-600">
        <summary className="cursor-pointer py-2">File reading notes ({attachment.check!.file.notes.length})</summary>
        <ul className="max-h-24 list-disc space-y-1 overflow-y-auto pl-4">
          {attachment.check!.file.notes.map((note, index) => <li key={index}>{note}</li>)}
        </ul>
      </details>
    )}
    </div>
  );
}

/** The checked file under an answer about it, as Excel or CSV. */
function DownloadRow({
  message,
  attachment,
  onDownload,
}: {
  message: AskMessage;
  attachment: AskAttachment | null;
  onDownload: (only: string, format: "csv" | "xlsx") => Promise<void>;
}) {
  const [busy, setBusy] = useState<"csv" | "xlsx" | null>(null);
  const [failed, setFailed] = useState(false);
  const only = message.download ?? "all";
  const ready = matchesAttachment(message, attachment);
  const label =
    attachment?.check?.counts.find((c) => c.status === only)?.label ?? DOWNLOAD_LABEL[only] ?? "All rows";
  const rows =
    only === "all"
      ? attachment?.check?.file.rows
      : only === "carrying"
        ? attachment?.check?.counts
            .filter((c) => c.status === "carries" || c.status === "partner")
            .reduce((a, c) => a + c.rows, 0)
        : attachment?.check?.counts.find((c) => c.status === only)?.rows;
  const go = (format: "csv" | "xlsx") => {
    if (!ready || busy) return;
    setBusy(format);
    setFailed(false);
    onDownload(only, format)
      .catch(() => setFailed(true))
      .finally(() => setBusy(null));
  };
  return (
    <div className="mt-4 grid max-w-[440px] grid-cols-[36px_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
      <FileBadge />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-slate-900">
          {message.downloadFile ?? "Your file"}, checked
        </div>
        <div className="text-[12px] leading-relaxed text-slate-500" role={failed ? "alert" : undefined}>
          {failed
            ? "The download failed. Try again."
            : ready
              ? `${label}${rows !== undefined ? `, ${rows.toLocaleString()} rows` : ""}`
              : "Attach the original file again to download"}
        </div>
      </div>
      <div className="col-span-2 flex gap-2">
      {(["xlsx", "csv"] as const).map((format) => (
        <button
          key={format}
          type="button"
          onClick={() => go(format)}
          disabled={!ready || busy !== null}
          title={ready ? `Download as ${format === "xlsx" ? "Excel" : "CSV"}` : "Attach the file again to download"}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-[14px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === format ? (
            <span className="ask-breathe inline-block h-2.5 w-2.5 rounded-full bg-slate-700" />
          ) : (
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          {format === "xlsx" ? "Excel" : "CSV"}
        </button>
      ))}
      </div>
    </div>
  );
}

/** Drop a file anywhere on the panel. */
function DropOverlay() {
  return (
    <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/50 bg-white/90 backdrop-blur-[2px]">
      <FileSpreadsheet className="h-8 w-8 text-primary" strokeWidth={1.6} />
      <div className="text-[15px] font-medium text-slate-900">Drop your file to check it</div>
      <div className="text-[12.5px] text-slate-500">CSV, TSV, TXT or XLSX, up to 5 MB. Not stored.</div>
    </div>
  );
}

/** Copy the answer. Shown on hover so a resting thread stays quiet. */
function CopyButton({ text }: { text: string }) {
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(""), 1500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const copy = async () => {
    setFeedback(await copyText(text) ? "Answer copied" : "Could not copy answer");
  };

  return (
    <div className="ask-copy ml-auto flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
      <button
        type="button"
        onClick={copy}
        aria-label="Copy answer"
        title={feedback || "Copy answer"}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {feedback === "Answer copied" ? <Check aria-hidden className="h-3.5 w-3.5 text-primary" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
      </button>
      <span role="status" className="sr-only">{feedback}</span>
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
    return <span className="text-[11.5px] text-slate-400">From your report, no quota used</span>;
  }
  if (message.usedPct === undefined || message.usedPct <= 0) return null;
  const pct = message.usedPct < 1 ? "under 1%" : `${Math.round(message.usedPct)}%`;
  return <span className="text-[11.5px] text-slate-400">Used {pct} of quota</span>;
}

/** Compact header quota; tap/keyboard also exposes the explanation on phones. */
function QuotaIndicator({ left, exhausted }: { left: number | null; exhausted: boolean }) {
  const pct = exhausted ? 0 : left === null ? null : Math.max(0, Math.min(100, left));
  const label = pct === null ? "AI quota unavailable" : `AI quota: ${pct}% remaining`;
  const r = 6;
  const circumference = 2 * Math.PI * r;
  const [open, setOpen] = useState(false);
  const popupId = useId();
  const quotaRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !quotaRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={quotaRef} className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        onClick={() => setOpen((shown) => !shown)}
        className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4 -rotate-90" aria-hidden="true">
          <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.75" />
          {pct !== null && <circle cx="8" cy="8" r={r} fill="none"
            stroke={pct > 15 ? "hsl(var(--primary))" : "hsl(var(--tone-warn))"}
            strokeWidth="1.75" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circumference} ${circumference}`} />}
        </svg>
      </button>
      {open && (
        <div
          id={popupId}
          className="absolute right-2 top-full z-20 mt-2 rounded-xl border border-slate-200 bg-white p-3 text-[12px] leading-relaxed text-slate-600 shadow-lg"
          style={{ width: "min(224px, calc(100% - 16px))" }}
        >
          <p className="font-medium text-slate-900" role="status">{label}</p>
          <p className="mt-1">{exhausted ? "Model answers are off for this report. Free report checks still work."
            : pct === null ? "The latest quota could not be loaded. Try again shortly."
            : "Shared across this report’s logins and devices. Refreshing does not reset it."}</p>
          <p className="mt-2">Answers can be wrong. Verify important information.</p>
        </div>
      )}
    </div>
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
