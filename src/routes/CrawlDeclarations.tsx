import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, RotateCw } from "lucide-react";

import {
  api,
  type DeclarationSource,
  type Declarations,
  type RelationshipMismatch,
  type Summary,
} from "../lib/api";
import { PageShell } from "@/components/PageShell";
import { formatWeek, WeekLine } from "@/components/WeekLine";
import { useReportScope } from "@/lib/reportScope";
import { cn } from "@/lib/utils";
import { fileLabel } from "./CrawlChanges";
import { MiniStat, SplitStat } from "./CrawlReport";

/**
 * DECLARATIONS.
 *
 * The other two list pages show what the crawled files CARRY: lines, and
 * how they moved. This page shows what the files SAY, which is a different
 * kind of fact: an inventorypartnerdomain line is a publisher vouching for
 * another domain's inventory, an ownerdomain line is a publisher claiming
 * who owns the site, and a relationship mismatch is a file carrying a seat
 * with a different relationship than the watchlist expects.
 *
 * Three sections, in that order, each a card list in the same grammar as
 * the Discovery page: a disc, the subject dominant, right-aligned stats,
 * click-to-expand roster. The IPD cards wear the suite's reserved violet
 * (--tone-special); owner claims wear the info blue, so the two sections
 * separate at a glance; mismatches wear the warn amber, because the fact
 * they state is worth attention without being an alarm.
 *
 * The endpoint sends everything in one response, no paging: declared_by /
 * claimed_by are capped at 50 per subject server side, and the honest
 * count travels beside each list as `declarer_total` / `claimant_total`,
 * which is what the "and N more" lines are measured against.
 */

export default function CrawlDeclarations() {
  const { token } = useReportScope();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [previous, setPrevious] = useState<Summary | null>(null);
  const [data, setData] = useState<Declarations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    api
      .summary(token)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => {});
    // Only for the week line's "compared with" date; the page's own numbers
    // never depend on it, so a failure costs the date and nothing else.
    api
      .previousSummary(token)
      .then((p) => !cancelled && setPrevious(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .declarations(token)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setOpen(new Set());
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const toggle = useCallback((key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const weekLabel = summary?.finished_at
    ? formatWeek(new Date(summary.finished_at))
    : null;
  const prevWeekLabel = previous?.finished_at
    ? formatWeek(new Date(previous.finished_at))
    : null;

  return (
    <PageShell>
      {/* Page header */}
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
          Declarations
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
          What the publisher files themselves declared this crawl: inventory
          partner domains, owner domain claims, and seats carrying a
          different relationship than your watchlist expects. Open a card to
          see which files said it.
        </p>
        <WeekLine
          week={weekLabel}
          previousWeek={prevWeekLabel}
          isFirstCrawl={summary?.previous_job_id === null}
          className="mt-1.5"
        />
      </div>

      {/* One KPI card, full width, same shape as the Discovery page's. The
          three numbers are the endpoint's own totals, so they stay honest
          when a list below is capped. */}
      {!loading && !error && data && (
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <div className="font-display text-sm font-medium text-slate-700">
                Declared this crawl
              </div>
              <div className="text-[11px] text-slate-500">
                Read out of the ads.txt and app-ads.txt files we fetched
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border">
            <SplitStat
              number={data.totals.ipd_partners}
              label="Inventory partners"
            />
            <SplitStat
              number={data.totals.owner_domains}
              label="Owner domains"
            />
            <SplitStat
              tone={
                data.totals.relationship_mismatches > 0 ? "warn" : undefined
              }
              number={data.totals.relationship_mismatches}
              label="Relationship mismatches"
            />
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <RotateCw className="h-4 w-4 animate-spin" />
          Loading declarations...
        </div>
      )}
      {error && <p className="py-4 text-sm text-critical">{error}</p>}

      {!loading && !error && data && (
        <>
          {/* ── Inventory partners ─────────────────────────────────── */}
          <div>
            <div className="mb-3">
              <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">
                Inventory partners
              </h2>
              <p className="text-sm text-slate-500">
                Domains that publisher files name as their inventory partner,
                which lets a file vouch for inventory sold through another
                domain.
              </p>
            </div>
            {data.ipd.length === 0 ? (
              <SectionEmpty>Nothing declared this crawl.</SectionEmpty>
            ) : (
              <div className="space-y-3">
                {data.ipd.map((p) => (
                  <SubjectCard
                    key={p.partner_domain}
                    subject={p.partner_domain}
                    sources={p.declared_by}
                    total={p.declarer_total}
                    tone="special"
                    noun="declared by"
                    expandedTitle="Declared inventory partner by"
                    open={open.has(`ipd|${p.partner_domain}`)}
                    onToggle={() => toggle(`ipd|${p.partner_domain}`)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Owner domain claims ────────────────────────────────── */}
          <div>
            <div className="mb-3">
              <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">
                Owner domain claims
              </h2>
              <p className="text-sm text-slate-500">
                Domains that publisher files claim as the owner of their
                inventory.
              </p>
            </div>
            {data.owner_claims.length === 0 ? (
              <SectionEmpty>
                No owner domains were claimed this crawl.
              </SectionEmpty>
            ) : (
              <div className="space-y-3">
                {data.owner_claims.map((c) => (
                  <SubjectCard
                    key={c.owner_domain}
                    subject={c.owner_domain}
                    sources={c.claimed_by}
                    total={c.claimant_total}
                    tone="info"
                    noun="claimed by"
                    expandedTitle="Claimed as owner domain by"
                    open={open.has(`own|${c.owner_domain}`)}
                    onToggle={() => toggle(`own|${c.owner_domain}`)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Relationship mismatches ────────────────────────────── */}
          <div>
            <div className="mb-3">
              <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">
                Seats with a different relationship
              </h2>
              <p className="text-sm text-slate-500">
                The line matched your seat, but the file carries a different
                relationship than your watchlist wants.
              </p>
            </div>
            {data.relationship_mismatches.length === 0 ? (
              <SectionEmpty>
                Every matched seat carried the relationship your watchlist
                expects.
              </SectionEmpty>
            ) : (
              <div className="space-y-3">
                {data.relationship_mismatches.map((m, i) => (
                  <MismatchCard
                    key={`${m.developer_domain}|${m.ssp_domain}|${m.publisher_id}|${i}`}
                    row={m}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}

/* ── The cards ─────────────────────────────────────────────────────── */

/**
 * One declared subject (an inventory partner, or a claimed owner domain),
 * built as a deliberate sibling of the Discovery page's LineCard: same
 * rounded-3xl white card, same 44px disc, same right-aligned MiniStat, same
 * chevron, same tinted expanded body. The two sections share this one
 * component because they are the same fact with the verbs swapped, and
 * copying it would let them drift apart a pixel at a time.
 */
function SubjectCard({
  subject,
  sources,
  total,
  tone,
  noun,
  expandedTitle,
  open,
  onToggle,
}: {
  subject: string;
  sources: DeclarationSource[];
  /** The honest count; `sources` is capped at 50 by the API. */
  total: number;
  tone: "special" | "info";
  /** "declared by" / "claimed by", for the mobile secondary line. */
  noun: string;
  expandedTitle: string;
  open: boolean;
  onToggle: () => void;
}) {
  const initial = (subject.replace(/^www\./i, "").charAt(0) || "?")
    .toUpperCase();
  const notShown = Math.max(0, total - sources.length);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-border bg-white shadow-sm transition-colors",
        open && "shadow-md",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5"
      >
        <div
          className={cn(
            "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-base font-semibold",
            tone === "special"
              ? "bg-special-bg text-special"
              : "bg-info-bg text-info",
          )}
        >
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          {/* The subject, verbatim and dominant: a domain, in mono, because
              it is a value read out of a file rather than a display name. */}
          <code className="block truncate font-mono text-[13px] font-semibold tracking-tight text-slate-900 sm:text-[15px]">
            {subject}
          </code>
          {/* On mobile the MiniStat is hidden, so the count moves here. */}
          <div className="mt-0.5 truncate text-xs text-slate-500 sm:hidden">
            {noun}{" "}
            <span className="font-mono tabular-nums text-slate-700">
              {total.toLocaleString()}
            </span>{" "}
            {total === 1 ? "file" : "files"}
          </div>
        </div>

        <div className="hidden items-center gap-6 text-right sm:flex">
          <div className="w-[76px]">
            <MiniStat label="Files" value={total} emphasis />
          </div>
        </div>

        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 flex-shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            "border-t border-border px-4 pb-4 pt-3 sm:px-5",
            tone === "special" ? "bg-special-bg/40" : "bg-info-bg/40",
          )}
        >
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs font-medium text-slate-700">
              {expandedTitle}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-slate-500">
              {total.toLocaleString()}
            </span>
          </div>
          {/* Capped and scrollable, like every roster on the sibling pages. */}
          <div className="scroll-y max-h-[320px] overflow-y-auto rounded-md border border-border bg-white">
            <ul className="divide-y divide-border">
              {sources.map((s, i) => (
                <li
                  key={`${s.domain}|${s.file_kind}|${i}`}
                  className="flex items-baseline gap-3 px-3 py-1.5 font-mono text-[11px] tabular-nums"
                >
                  <span className="truncate text-slate-800">{s.domain}</span>
                  {/* Rendered, never the raw enum: this is a customer's
                      screen, and "APP_ADS_TXT" is not a file name. */}
                  <span className="ml-auto flex-shrink-0 text-[10px] text-slate-400">
                    {fileLabel(s.file_kind)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {/* The API caps the list at 50; the count above is the honest
              total, and this line admits the difference in words. */}
          {notShown > 0 && (
            <p className="mt-1 text-[10px] text-slate-500">
              and {notShown.toLocaleString()} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One mismatched seat. No expansion: the card already carries the whole
 * fact, which is the two relationships side by side. The found value wears
 * the warn tone and the wanted value does not, so the eye lands on the one
 * that differs from the watchlist; the copy stays factual because a
 * mismatch is a market fact to check, not an error to fix.
 */
function MismatchCard({ row }: { row: RelationshipMismatch }) {
  const initial = (row.ssp_domain.replace(/^www\./i, "").charAt(0) || "?")
    .toUpperCase();
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-sm">
      <div className="flex w-full items-center gap-4 px-4 py-4 sm:px-5">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-warn-bg text-base font-semibold text-warn">
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <code className="block truncate font-mono text-[13px] font-semibold tracking-tight text-slate-900 sm:text-[15px]">
            {row.ssp_domain}, {row.publisher_id}
          </code>
          <div className="mt-1 truncate text-xs text-slate-500">
            watchlist says{" "}
            <span className="font-mono text-slate-700">
              {row.wanted_relationship}
            </span>
            , file says{" "}
            <span className="font-mono font-semibold text-warn">
              {row.found_relationship}
            </span>
            {/* On mobile the right column is hidden, so the file and the
                publisher move into this line. */}
            <span className="sm:hidden">
              {" "}
              in {row.found_in} on {row.developer_domain}
            </span>
          </div>
        </div>

        <div className="hidden min-w-0 flex-shrink-0 text-right sm:block">
          <div className="truncate text-xs text-slate-700">
            {row.developer_domain}
          </div>
          <div className="text-[10px] text-slate-400">{row.found_in}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Empty state ───────────────────────────────────────────────────── */

/** A section with nothing in it is a normal result, said plainly. */
function SectionEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-8 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}
