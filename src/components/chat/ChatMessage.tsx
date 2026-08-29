import { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Chat message primitives ported from bottomlines-app so the viewer's
 * Ask AI drawer reads visually identical to the console:
 * - User question: right-aligned grey bubble
 * - Assistant answer: left-aligned with bot byline, lightly formatted
 *   markdown (bold / italic / inline code / bulleted + numbered lists),
 *   copy-to-clipboard button revealed on hover
 * - TypingDots: three-dot bounce shown between send and first token
 *
 * The mini-markdown renderer covers the subset LLMs actually emit — no
 * headings, tables, HTML, or nested lists. Shipping raw asterisks to a
 * pre-wrap paragraph made every answer look like a diff; this renders
 * `**bold**`, `` `code` ``, `* item`, `- item`, `1. item` as real markup.
 */

export function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-slate-100 px-3.5 py-2 text-[13.5px] leading-relaxed text-slate-900">
        {children}
      </div>
    </div>
  );
}

function BotByline() {
  return (
    <div className="mb-1.5 flex select-none items-center gap-1.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-3 w-3 text-primary" />
      </span>
      <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
        bottomline<span className="text-primary">.ai</span>
      </span>
    </div>
  );
}

export function AssistantMessage({
  text,
  showCopy = true,
  error = false,
}: {
  text: string;
  showCopy?: boolean;
  error?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable, text is on screen and selectable */
    }
  };

  if (error) {
    return (
      <div>
        <BotByline />
        <p className="whitespace-pre-wrap rounded-xl bg-critical-bg px-3.5 py-2.5 text-[13px] leading-relaxed text-critical">
          {text}
        </p>
      </div>
    );
  }

  return (
    <div className="group">
      <BotByline />
      <div className="min-w-0">
        <MarkdownText text={text} />
        {showCopy && text.length > 0 && (
          <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={copy}
              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Copy"
              aria-label="Copy answer"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TypingDots({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 pt-1", className)} aria-label="Thinking">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-3 w-3 text-primary" />
      </span>
      <div className="flex items-center gap-1">
        <span className="h-1 w-1 animate-bounce rounded-full bg-slate-300 [animation-delay:0s]" />
        <span className="h-1 w-1 animate-bounce rounded-full bg-slate-300 [animation-delay:0.15s]" />
        <span className="h-1 w-1 animate-bounce rounded-full bg-slate-300 [animation-delay:0.3s]" />
      </div>
    </div>
  );
}

// ── mini-markdown ────────────────────────────────────────────────────

type Block =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "p", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: list.kind, items: list.items });
      list = null;
    }
  };

  for (const raw of lines) {
    const ul = /^\s*[*\-+]\s+(.*)$/.exec(raw);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(raw);
    if (ul) {
      flushParagraph();
      if (list && list.kind === "ul") {
        list.items.push(ul[1]);
      } else {
        flushList();
        list = { kind: "ul", items: [ul[1]] };
      }
      continue;
    }
    if (ol) {
      flushParagraph();
      if (list && list.kind === "ol") {
        list.items.push(ol[1]);
      } else {
        flushList();
        list = { kind: "ol", items: [ol[1]] };
      }
      continue;
    }
    if (raw.trim() === "") {
      flushList();
      flushParagraph();
      continue;
    }
    flushList();
    paragraph.push(raw);
  }
  flushList();
  flushParagraph();
  return blocks;
}

function renderInline(source: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) {
      out.push(plain);
      plain = "";
    }
  };
  while (i < source.length) {
    if (source[i] === "*" && source[i + 1] === "*") {
      const end = source.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        out.push(
          <strong key={out.length} className="font-semibold text-foreground">
            {source.slice(i + 2, end)}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }
    if (source[i] === "`") {
      const end = source.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        out.push(
          <code
            key={out.length}
            className="rounded bg-muted px-1 py-[1px] font-mono text-[12px] text-foreground"
          >
            {source.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }
    if (source[i] === "*" && source[i + 1] !== "*" && (i === 0 || source[i - 1] !== " ")) {
      const end = source.indexOf("*", i + 1);
      if (end !== -1 && source[end - 1] !== " ") {
        flush();
        out.push(
          <em key={out.length} className="italic">
            {source.slice(i + 1, end)}
          </em>,
        );
        i = end + 1;
        continue;
      }
    }
    plain += source[i];
    i += 1;
  }
  flush();
  return out;
}

function MarkdownText({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  if (blocks.length === 0) {
    return (
      <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-800">{text}</p>
    );
  }
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed text-slate-800">
      {blocks.map((b, i) => {
        if (b.kind === "p") {
          return (
            <p key={i} className="whitespace-pre-wrap">
              {renderInline(b.text)}
            </p>
          );
        }
        if (b.kind === "ul") {
          return (
            <ul key={i} className="ml-4 list-disc space-y-1 marker:text-muted-foreground">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        return (
          <ol key={i} className="ml-5 list-decimal space-y-1 marker:text-muted-foreground">
            {b.items.map((it, j) => (
              <li key={j}>{renderInline(it)}</li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}
