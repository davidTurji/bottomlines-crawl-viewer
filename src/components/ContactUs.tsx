import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Check, Copy, Globe, Mail, X } from "lucide-react";
import { useState } from "react";

/**
 * The one thing on the demo that is selling something.
 *
 * Everything else on this page is a report about a customer who does not
 * exist. This is the only control whose job is to turn a reader into a
 * conversation, so it is allowed to look like it: a filled gradient pill in
 * a header of quiet outlined buttons, which is the whole trick -- it stands
 * out because nothing else here is trying to.
 *
 * It opens rather than links straight to mailto:. A bare mailto: on a
 * machine with no mail client configured does nothing at all, silently,
 * which is the worst possible outcome for the button that matters most. The
 * panel shows the address as text you can read, copy, or click.
 */
const EMAIL = "david@bottomlines.ai";
const SITE = "https://bottomlines.ai";

export default function ContactUs() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard blocked (insecure origin, denied permission). The address
         is on screen as selectable text, so there is still a way through. */
    }
  };

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="group relative inline-flex h-8 flex-shrink-0 items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-br from-primary to-[hsl(150_58%_22%)] pl-3 pr-3.5 text-xs font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-9 sm:text-[13px]"
        >
          {/* A light sweep on hover. Purely decorative, so it is aria-hidden
              and pointer-events-none: it must never eat the click. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
          />
          <Mail className="h-3.5 w-3.5" />
          Contact us
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

          <Dialog.Title className="font-display text-lg font-medium tracking-tight text-slate-900">
            Let&apos;s talk
          </Dialog.Title>
          <p className="mt-1 max-w-[22rem] text-[13px] leading-relaxed text-slate-500">
            This report is sample data. We can run the same crawl against your
            own seats and show you the real one.
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
                {copied ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
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
            href={`mailto:${EMAIL}?subject=${encodeURIComponent("Path Finder: show me my inventory")}`}
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
