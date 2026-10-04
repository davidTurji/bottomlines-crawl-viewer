import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, ChevronDown, CircleHelp, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * HOW THE SCHAIN EXPORT WORKS, as a question-and-answer panel.
 *
 * The four checks are spelled out with the reader's OWN lines: once they
 * have picked an SDK, a seat line and a reseller line, each step shows the
 * exact line we look for and the exact file we look in. Before they have,
 * the same steps read with placeholders. The checks are the admin Schain
 * Export's, in its order (bottomlines-crawl services/compliance.py), so
 * what this panel promises is what the file holds.
 */
export type HowItWorksContext = {
  resellerDomain: string;
  sdk: string | null;
  seatLine: string | null;
  sid2: string | null;
  crawledOn: string | null;
  limit: number;
};

export default function SchainHowItWorks({
  ctx,
  trigger,
}: {
  ctx: HowItWorksContext;
  /** The button that opens the panel; a default "How it works" pill when absent. */
  trigger?: ReactNode;
}) {
  const sdk = ctx.sdk ?? "<sdk>";
  const seat = ctx.seatLine ?? "<your seat line>";
  const sid2 = ctx.sid2 ?? "<sid2>";

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-3.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-primary/30 hover:text-primary"
          >
            <CircleHelp className="h-3.5 w-3.5" />
            How it works
          </button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] data-[state=open]:animate-sheet-overlay-in data-[state=closed]:animate-sheet-overlay-out" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(44rem,calc(100dvh-2rem))] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl outline-none data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-[17px] font-semibold leading-snug tracking-tight text-slate-900">
                How Schain works
              </Dialog.Title>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                {ctx.sdk && ctx.seatLine && ctx.sid2
                  ? "Shown with the lines you picked."
                  : "Pick an SDK, a seat line and a reseller line, and each step below shows the exact line we look for."}
              </p>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-muted hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <h3 className="text-sm font-semibold text-slate-900">The four checks</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
              For every publisher we crawled, we make four checks in this order. A
              publisher that passes all four goes in the file, with one row for each of
              its apps.
            </p>

            <ol className="mt-4 space-y-3">
              <Step
                n={1}
                title="Your seat line is in the publisher's file"
                where={`The publisher's app-ads.txt, from this week's crawl${ctx.crawledOn ? ` (${ctx.crawledOn})` : ""}.`}
                line={seat}
              />
              <Step
                n={2}
                title="The publisher sells the SDK directly"
                where="The same file."
                line={`${sdk}, <publisher's account id>, DIRECT`}
                note={
                  <>
                    That account id is <B>sid1</B>: the first link of the chain, the
                    publisher selling to {sdk}.
                  </>
                }
              />
              <Step
                n={3}
                title="The SDK agrees the account is theirs"
                where={
                  <>
                    <Mono>{sdk}/sellers.json</Mono>: the copy saved with this report, or
                    read live when you press Refresh.
                  </>
                }
                note={
                  <>
                    <B>sid1</B> must be listed there as <Mono>PUBLISHER</Mono> or{" "}
                    <Mono>BOTH</Mono>, under the publisher's own domain. A publisher often
                    has several accounts at an SDK; only the ones that pass count, and the
                    file shows every one we checked.
                  </>
                }
              />
              <Step
                n={4}
                title="You may resell them there"
                where="The publisher's file again."
                line={`${ctx.resellerDomain}, ${sid2}, RESELLER`}
                note={
                  <>
                    {sid2} is the Seller ID you gave {sdk} in your own sellers.json: that is{" "}
                    <B>sid2</B>, the second link of the chain, {sdk} selling to you.
                  </>
                }
              />
            </ol>

            <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
              <div className="text-xs font-medium text-slate-700">
                Each row of the file is one complete chain
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                <Node label="App" value="bundle id" />
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                <Node label="Node 1" value={`asi1 ${sdk}, sid1`} />
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                <Node label="Node 2" value={`asi2 ${ctx.resellerDomain}, sid2 ${sid2}`} />
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                <Node label="Your seat" value={seat} />
              </div>
            </div>

            <h3 className="mt-7 text-sm font-semibold text-slate-900">Questions</h3>
            <div className="mt-2 divide-y divide-border rounded-xl border border-border">
              <Faq q="What is an schain file?">
                A list of every app where your seat line can be bought through an SDK,
                with the two supply chain links a buyer checks: the publisher selling to
                the SDK (asi1, sid1) and the SDK selling to you (asi2, sid2). Buyers and
                SSPs use it to accept the path instead of blocking it.
              </Faq>
              <Faq q="Where does the SDK list come from?">
                From your own sellers.json at {ctx.resellerDomain}/sellers.json, read when
                this report was made. Every seller there whose domain publishes its own
                sellers.json is an SDK you can pick. Its Seller ID in your file is the
                reseller line.
              </Faq>
              <Faq q="How fresh is it?">
                The list is true as of the dates shown on the page. Publisher files come from
                this week's crawl, and your sellers.json is the copy read for this report.
                The SDK's sellers.json is the copy saved with the report too, and Refresh
                reads it live. A publisher can change their file after the crawl, so the
                next weekly report brings the list up to date.
              </Faq>
              <Faq q="Why is a seat line greyed out?">
                No publisher passes all four checks for that seat line through the SDK you
                picked. Try another SDK: each one has its own publishers and accounts.
              </Faq>
              <Faq q="What is in the file?">
                Four sheets. Summary: your seat line and reseller line, the rule all four
                checks follow, and the totals. Publishers: one row per publisher, with its
                valid SDK accounts and the file we checked. SDK IDs: every DIRECT account
                we found at the SDK, what the SDK's sellers.json says about it, and whether
                it is valid. Apps: one row per app with its store, platform, category,
                asi1, sid1, asi2, sid2 and store link. CSV is the Apps sheet alone.
              </Faq>
              <Faq q="How many downloads do I get?">
                {ctx.limit} schain files per report link, each with any SDK and seat line
                you like. Downloading the same selection again is free.
              </Faq>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Step({
  n,
  title,
  where,
  line,
  note,
}: {
  n: number;
  title: string;
  where: ReactNode;
  line?: string;
  note?: ReactNode;
}) {
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-white p-3.5">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-[12px] leading-relaxed text-slate-500">
          <span className="font-medium text-slate-600">Where we look: </span>
          {where}
        </div>
        {line && (
          <div className="mt-2">
            <div className="text-[11px] font-medium text-slate-500">What we look for</div>
            <code className="mt-1 block overflow-x-auto whitespace-nowrap rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-[12px] text-slate-900">
              {line}
            </code>
          </div>
        )}
        {note && <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{note}</p>}
      </div>
    </li>
  );
}

function Node({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 flex-col rounded-lg border border-border bg-white px-2 py-1">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="truncate font-mono text-slate-800">{value}</span>
    </span>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[13px] font-medium text-slate-800 transition-colors hover:text-primary"
      >
        {q}
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 flex-shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <p className="px-4 pb-4 text-[13px] leading-relaxed text-slate-600">{children}</p>
      )}
    </div>
  );
}

const B = ({ children }: { children: ReactNode }) => (
  <strong className="font-semibold text-slate-800">{children}</strong>
);
const Mono = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted/60 px-1 font-mono text-[11px] text-slate-800">{children}</code>
);
