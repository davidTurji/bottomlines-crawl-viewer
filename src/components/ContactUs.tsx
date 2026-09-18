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
          /* Slimmer than it was, and lighter. It sits beside the account
             pill in a 48px header, so a chunky button reads as a banner
             bolted onto the chrome rather than part of it. The colour is
             doing the standing out; the size does not need to as well. */
          className="group relative inline-flex h-7 flex-shrink-0 items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-br from-primary to-[hsl(150_58%_22%)] pl-2.5 pr-3 text-[11px] font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-8 sm:pl-3 sm:pr-3.5 sm:text-xs"
        >
          {/* The sweep runs on its own, every five seconds, rather than
              waiting for a hover it may never get: on a phone there is no
              hover at all, and this is the one control on the page we
              actually want found. Decorative, so it is aria-hidden and
              pointer-events-none and must never eat the click, and it
              stops entirely for a reader who asked for less motion. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-shine-sweep bg-gradient-to-r from-transparent via-white/30 to-transparent motion-reduce:hidden"
          />
          <Mail className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
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

          {/* THE PITCH.
              The hook is the heading, not a line under one: a reader who
              opens this and reads four words should already know what is on
              offer. The two paragraphs under it carry the ask (fifty lines)
              and the reason to bother (what this costs elsewhere), with the
              price sitting in its own tinted row because it is the sentence
              that does the work. */}
          <Dialog.Title className="max-w-[calc(100%-2.5rem)] font-display text-[17px] font-semibold leading-snug tracking-tight text-slate-900">
            This is just a sample. Want your own FREE crawl?
          </Dialog.Title>

          <p className="mt-2.5 text-[13px] leading-relaxed text-slate-600">
            Send us{" "}
            <strong className="font-semibold text-slate-900">
              50 of your ads.txt lines
            </strong>
            , and we&apos;ll run the same crawl on your data,{" "}
            <strong className="font-semibold text-primary">completely FREE</strong>.
          </p>

          <p className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.05] px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-600">
            Competitors charge{" "}
            <strong className="font-semibold text-slate-900">$2,000/month</strong>{" "}
            for this.{" "}
            <strong className="font-semibold text-primary">
              With us, it&apos;s free.
            </strong>
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
