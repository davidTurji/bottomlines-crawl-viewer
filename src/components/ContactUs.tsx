import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Check, Copy, Globe, Mail, X } from "lucide-react";
import { useState } from "react";

/**
 * The one control on a trial report whose job is to turn a reader into a
 * conversation, so it is allowed to look like it: a filled gradient pill
 * among quiet outlined buttons. Ported from the demo's contact button with
 * its own words: a trial reader already has a report about THEIR domain,
 * so the pitch is the rest of it, not a free sample.
 *
 * It opens a panel rather than linking straight to mailto:, because a bare
 * mailto: on a machine with no mail client does nothing, silently. The
 * address is on screen as text to read, copy or click.
 */
const EMAIL = "david@bottomlines.ai";
const SITE = "https://bottomlines.ai";

export default function ContactUs({
  label = "Book a call",
  title = "Want the whole picture for your domain?",
  lead = "This trial shows a slice. The full report lists every matched publisher and app, every declaration and every discovered line, and tracks what changes week after week.",
  note = "Book a call and we walk you through your full report live, then set up your weekly crawl.",
  compact = false,
}: {
  label?: string;
  title?: string;
  lead?: string;
  note?: string;
  /** A smaller pill for a header; the default suits a card. */
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard blocked. The address is on screen as selectable text. */
    }
  };

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={
            compact
              ? "group relative inline-flex h-7 flex-shrink-0 items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-br from-primary to-[hsl(150_58%_22%)] pl-2.5 pr-3 text-[11px] font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-8 sm:pl-3 sm:pr-3.5 sm:text-xs"
              : "group relative inline-flex h-10 flex-shrink-0 items-center gap-2 overflow-hidden rounded-full bg-gradient-to-br from-primary to-[hsl(150_58%_22%)] px-5 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          }
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-shine-sweep bg-gradient-to-r from-transparent via-white/30 to-transparent motion-reduce:hidden"
          />
          <Mail className={compact ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-4 w-4"} />
          {label}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] data-[state=open]:animate-sheet-overlay-in data-[state=closed]:animate-sheet-overlay-out" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-white p-5 shadow-2xl outline-none data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out sm:p-6"
        >
          <Dialog.Close
            aria-label="Close"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-muted hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </Dialog.Close>

          <Dialog.Title className="max-w-[calc(100%-2.5rem)] font-display text-[17px] font-semibold leading-snug tracking-tight text-slate-900">
            {title}
          </Dialog.Title>

          <p className="mt-2.5 text-[13px] leading-relaxed text-slate-600">{lead}</p>

          <p className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.05] px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-600">
            {note}
          </p>

          <div className="mt-5 space-y-2">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-1 pl-3.5">
              <Mail className="h-4 w-4 flex-shrink-0 text-primary" />
              <a
                href={`mailto:${EMAIL}`}
                className="min-w-0 flex-1 truncate py-2 text-sm font-medium text-slate-800 transition-colors hover:text-primary"
              >
                {EMAIL}
              </a>
              <button
                type="button"
                onClick={copy}
                aria-label={copied ? "Copied" : "Copy email address"}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-primary"
              >
                {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <a
              href={SITE}
              target="_blank"
              rel="noreferrer noopener"
              className="group flex items-center gap-2 rounded-xl border border-border bg-muted/40 py-3 pl-3.5 pr-3 transition-colors hover:border-primary/30 hover:bg-primary/[0.04]"
            >
              <Globe className="h-4 w-4 flex-shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 group-hover:text-primary">
                bottomlines.ai
              </span>
              <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-primary" />
            </a>
          </div>

          <a
            href={`mailto:${EMAIL}?subject=${encodeURIComponent("Pathfinder: show me my full report")}`}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-[hsl(150_58%_22%)] text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md"
          >
            <Mail className="h-4 w-4" />
            Email us
          </a>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
