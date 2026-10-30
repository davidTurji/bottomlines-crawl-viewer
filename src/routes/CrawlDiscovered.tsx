import { csvLine, downloadCsvParts } from "@/lib/csvDownload";
import { ReportButton } from "@/components/ReportButton";
import { ReportDescription } from "@/components/ReportDescription";
import { eachPage } from "@/lib/completePages";
import { Pager, usePaging } from "@/components/ListControls";
import { Collapse, Settle, toggleWithoutJump } from "@/components/Motion";
import { usePageCache } from "@/lib/pageCache";
import LockedTail from "@/components/LockedTail";
import { MiniStat } from "@/components/MiniStat";
import TrialBanner from "@/components/TrialBanner";
import { SkeletonInlineRows, SkeletonRows, SkeletonStatCards } from "@/components/Skeleton";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, CircleAlert, Download, Radar, Users, Wrench } from "lucide-react";

import {
  ApiError,
  type TrialSlice,
  api,
  type DiscoveredLine,
  type DiscoveredLineKey,
  type DiscoveredPlacement,
  type DiscoveredShow,
  type DiscoveredTotals,
  type Summary,
} from "../lib/api";
import { lineMeasure, SORT_OPTIONS, type SortKey, sortDiscoveredLines } from "../lib/discoveredSort";
import { FilterAction, FilterBar, FilterGroup, FilterSearch, FilterSelect } from "@/components/FilterBar";
import { PageShell } from "@/components/PageShell";
import { ActionableLine, LineActionGroup, PublisherDomainLink } from "@/components/PublisherLinks";
import { formatWeek, WeekLine } from "@/components/WeekLine";
import { PAGE_SIZE } from "@/lib/paging";
import { useReportScope } from "@/lib/reportScope";
import { useSellersPage } from "@/lib/useSellersPage";
import { cn, foundInLabel, storeName } from "@/lib/utils";
import { computeDelta, SplitStat } from "./CrawlReport";

/**
 * DISCOVERY, own-domain edition (2026-10-14).
 *
 * The page answers one question: every ads.txt and app-ads.txt line on the
 * open web that STARTS WITH the customer's domain. One card per distinct
 * line, publishers counted once each, the week-over-week move per line.
 *
 * What changed against the page before it:
 *   - the "given by you / found by Path Finder" split is gone: for a line
 *     that starts with the customer's own domain the only honest reference
 *     is their own sellers.json, so each card says whether its seller ID is
 *     in that file, and what the file calls the seller;
 *   - a "needs fixing" mark on lines that cannot be right (a placeholder or
 *     malformed seller ID, a corrupted cert id, a seller carried with the
 *     relationship the file does not give it, the same seller ID both as
 *     DIRECT and RESELLER);
 *   - last week is compared only when it can be, and the rectangle says why
 *     when it cannot (readBaseline below), never "first report" for a week
 *     that merely could not be read;
 *   - the roster under a line is whole: paged, searchable, with the
 *     publisher and file links, always from the placements endpoint.
 *
 * ORDER. The default is the endpoint's own (new lines first, then the
 * biggest weekly gains, then widest first; see compareDefault in
 * src/lib/discoveredSort.ts), which is what lets it survive paging. The sort
 * control's alternatives are client-side over the loaded page, and the bar
 * says so whenever that matters.
 *
 * Data contract: api.discoveredLines and api.discoveredLinePlacements in
 * src/lib/api.ts.
 */

type ShowFilter = "all" | DiscoveredShow;

/** Publisher cards shown when a line opens, and a page of them after. */
const ROSTER_FIRST = 3;
const ROSTER_PAGE = 25;

export default function CrawlDiscovered() {
  const { token, basePath } = useReportScope();
  const [summary, setSummary] = useState<Summary | null>(null);
  // Whether the summary request has SETTLED, success or failure, which is
  // not the same question as whether a summary arrived: a page whose own
  // numbers are fine must not die, or shimmer for ever, for a missing one.
  const [summarySettled, setSummarySettled] = useState(false);
  const [previous, setPrevious] = useState<Summary | null>(null);
  const [rows, setRows] = useState<DiscoveredLine[]>([]);
  const cache = usePageCache<unknown>();
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<DiscoveredTotals | null>(null);
  /** The bake cut this report's list short (see DiscoveredLinesPage.cut). */
  const [cut, setCut] = useState(false);
  /** The cut this trial report made to the list, or null on a full report. */
  const [trial, setTrial] = useState<TrialSlice | null>(null);
  const [page, setPage] = useState(1);
  const paging = usePaging(setPage);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<ShowFilter>("all");
  const [sort, setSort] = useState<SortKey>("default");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Whether this crawl has any discovered lines at all, independent of the
  // filter, so an over-narrow filter never renders the "did not look"
  // card, which would be a lie about the report rather than a fact about
  // the filter.
  const [anyDiscovered, setAnyDiscovered] = useState<boolean | null>(null);
  // The badges link to the Sellers.json page only when the report has it,
  // by the rail's own rule.
  const sellersPage = useSellersPage(token);

  const filter = q.trim();
  const filtered = Boolean(filter) || show !== "all";

  useEffect(() => {
    let cancelled = false;
    api
      .summary(token)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => {})
      .finally(() => !cancelled && setSummarySettled(true));
    // Only for the week line's "compared with" date. The comparison itself
    // comes from the discovered-lines totals, so a failure costs the date
    // and nothing else.
    api
      .previousSummary(token)
      .then((p) => !cancelled && setPrevious(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => setPage(1), [filter, show]);

  useEffect(() => {
    let cancelled = false;
    const load = (pg: number) =>
      api.discoveredLines(token, {
        page: pg,
        page_size: PAGE_SIZE,
        q: filter || undefined,
        show: show === "all" ? undefined : show,
      });
    type Loaded = Awaited<ReturnType<typeof load>>;
    const keyFor = (pg: number) => `${pg}|${filter}|${show}`;
    // Read the next page while this one is on screen, so "next" is
    // instant. Not while a search is being typed.
    const readAhead = (r: Loaded) => {
      if (!filter && page * PAGE_SIZE < r.total) {
        cache.prefetch(keyFor(page + 1), () => load(page + 1));
      }
    };
    const apply = (r: Loaded) => {
      setRows(r.rows);
      setTotal(r.total);
      setTotals(r.totals);
      setCut(Boolean(r.cut));
      setTrial(r.trial ?? null);
      // A different set of cards: an expansion held open from the previous
      // set would vanish or, worse, appear to belong to another line.
      setOpen(null);
      // An unfiltered answer settles the question for the whole report.
      if (!filtered) setAnyDiscovered(r.total > 0);
      else if (r.total > 0) setAnyDiscovered(true);
    };
    setError(null);
    const kept = cache.get(keyFor(page)) as Loaded | undefined;
    if (kept) {
      apply(kept);
      setLoading(false);
      readAhead(kept);
      return;
    }
    setLoading(true);
    load(page)
      .then((r) => {
        cache.put(keyFor(page), r);
        if (cancelled) return;
        apply(r);
        readAhead(r);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, page, filter, show, filtered, cache]);

  const toggle = useCallback((key: string) => {
    setOpen(prev => prev === key ? null : key);
  }, []);

  const weekLabel = summary?.finished_at ? formatWeek(new Date(summary.finished_at)) : null;
  const prevWeekLabel = previous?.finished_at ? formatWeek(new Date(previous.finished_at)) : null;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // The local sort reorders the loaded page only; on the default option
  // that is the endpoint's own order, so it is a no-op. Every other option
  // is true of what is on screen, and the bar says so (localOnly).
  const sorted = useMemo(() => sortDiscoveredLines(rows, sort), [rows, sort]);
  const localOnly = sort !== "default" && pageCount > 1;
  const noDiscovery = !loading && !error && total === 0 && anyDiscovered === false;
  const onTrial = Boolean(trial || summary?.trial);

  const baseline = useMemo(() => readBaseline(totals, summary, summarySettled), [totals, summary, summarySettled]);
  // "New this week" is a count only against a week that was compared.
  const newLines = baseline.totals && totals?.new_lines != null ? totals.new_lines : null;
  // Publishers once each (reports from 2026-10-11); an older report counts
  // files and says so.
  const countsPublishers = totals?.publishers != null;
  const domains = summary?.watchlist?.discover ?? [];

  // The Show menu offers only what the report can answer: "New this week"
  // needs a compared week, "Needs fixing" a report that checked its lines
  // (an older one never did, and an empty list would read as "nothing to
  // fix"), the sellers.json pair the file.
  const hasSellersJson = Boolean(totals?.sellers_json);
  const checkedLines = totals?.needs_fixing != null;
  const showOptions = useMemo(() => {
    const o: { value: ShowFilter; label: string; description: string; group: string }[] = [
      { value: "all", label: "All lines", description: "Every discovered line using your domains.", group: "Line types" },
      { value: "direct", label: "DIRECT lines", description: "The file names the seller account as DIRECT.", group: "Line types" },
      { value: "reseller", label: "RESELLER lines", description: "The file names the seller account as RESELLER.", group: "Line types" },
    ];
    if (baseline.lines) o.push({ value: "new", label: "New this week", description: "Lines that no publisher carried in the compared crawl.", group: "Weekly changes" });
    if (checkedLines) o.push({ value: "fixing", label: "Needs fixing", description: "Lines with a seller ID or relationship issue to review.", group: "Sellers.json" });
    if (hasSellersJson) {
      o.push({ value: "listed", label: "In your sellers.json", description: "The seller ID is present in your sellers.json.", group: "Sellers.json" });
      o.push({ value: "unlisted", label: "Not in your sellers.json", description: "The seller ID is absent from your sellers.json.", group: "Sellers.json" });
    }
    return o;
  }, [baseline.lines, checkedLines, hasSellersJson]);
  // Never leave the list filtered by an option that is no longer offered.
  useEffect(() => {
    if (totals && !showOptions.some((o) => o.value === show)) setShow("all");
  }, [totals, showOptions, show]);

  return (
    <PageShell>
      {summary?.trial && <TrialBanner caps={summary.trial} summary={summary} />}
      <div className="min-w-0" data-tour="discovery-header">
        <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
          Discovery
        </h1>
        <ReportDescription className="mt-1" label="Discovery" summary="Lines across publisher files that start with your domain.">
          Every ads.txt and app-ads.txt line on the open web that starts with your domain
          {domains.length > 0 && (
            <>
              {": "}
              {domains.map((d, i) => (
                <span key={d}>
                  <span className="font-mono text-[13px] text-slate-700">{d}</span>
                  {i < domains.length - 1 ? ", " : ""}
                </span>
              ))}
            </>
          )}
          .
          {rows[0] && (
            <>
              {" "}For example{" "}
              <span className="font-mono text-[13px] text-slate-700">
                {rows[0].ssp_domain}, {rows[0].publisher_id}, {rows[0].relationship}
              </span>
              .
            </>
          )}
        </ReportDescription>
        <WeekLine
          week={weekLabel}
          previousWeek={prevWeekLabel}
          isFirstCrawl={summary?.previous_job_id === null}
          pending={!summarySettled}
          className="mt-1.5"
        />
      </div>

      {/* The KPI card's own slot, so the real card lands where its outline
          was rather than pushing the list down. */}
      {loading && !totals && <SkeletonStatCards />}

      {!noDiscovery && totals && (
        <div className="report-panel rounded-2xl border border-border bg-white p-5" data-tour="discovery-kpi">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <div className="font-display text-sm font-medium text-slate-700">
                Lines that start with your domain
              </div>
              <div className="text-[11px] text-slate-500">{baseline.words}</div>
            </div>
          </div>
          {/* Three separate cards, every week (owner, 2026-10-14): new lines
              discovered this week (on a first report, all of them), the
              unique lines actually found with the domain, and the
              publishers holding them. */}
          <div className="report-kpi-discovery grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SplitStat
              tone="info"
              prefix={newLines ? "+" : undefined}
              number={newLines ?? 0}
              label="New lines this week"
              caption={newLines != null ? "No publisher carried them last week" : "No prior week to compare"}
              className="report-kpi-cell"
            />
            <SplitStat
              tone="info"
              number={totals.lines}
              label="Lines found with your domain"
              caption={
                totals.in_file_lines != null && totals.not_in_file_lines != null
                  ? `${totals.in_file_lines.toLocaleString()} in your sellers.json${
                      totals.sellers_json?.sellers != null
                        ? ` (${totals.sellers_json.sellers.toLocaleString()} sellers)`
                        : ""
                    }, ${totals.not_in_file_lines.toLocaleString()} not${
                      // Only lines on the customer's own domain are checked
                      // against their file; say how many sit elsewhere.
                      totals.lines - totals.in_file_lines - totals.not_in_file_lines > 0
                        ? `, ${(totals.lines - totals.in_file_lines - totals.not_in_file_lines).toLocaleString()} on your other domains`
                        : ""
                    }`
                  : "Each line counted once"
              }
              className="report-kpi-cell"
              delta={
                baseline.totals && totals.previous_lines != null
                  ? computeDelta(totals.lines, totals.previous_lines)
                  : null
              }
              note={baseline.totals ? undefined : "not compared"}
            />
            <SplitStat
              tone="publisher"
              number={countsPublishers ? (totals.publishers ?? 0) : totals.placements}
              label={countsPublishers ? "Unique publishers carrying them" : "Publisher listings"}
              caption={
                countsPublishers
                  ? "Several of these lines, still one publisher"
                  : "One per publisher file carrying a line"
              }
              className="report-kpi-cell"
              delta={
                baseline.totals &&
                (countsPublishers ? totals.previous_publishers : totals.previous_placements) != null
                  ? computeDelta(
                      countsPublishers ? (totals.publishers ?? 0) : totals.placements,
                      (countsPublishers ? totals.previous_publishers : totals.previous_placements) ?? 0,
                    )
                  : null
              }
              note={baseline.totals ? undefined : "not compared"}
            />
          </div>
          {/* A list shorter than its numbers says so, never passes for
              whole. */}
          {totals.listed_lines != null && totals.listed_lines < totals.lines && (
            <p className="mt-2 text-[11px] text-slate-500">
              The list below shows the {totals.listed_lines.toLocaleString()} widest lines. The numbers above
              count all {totals.lines.toLocaleString()}.
            </p>
          )}
          {cut && (
            <p className="mt-2 text-[11px] text-warn">
              This report's list was cut short when it was made, so these numbers count only the lines it kept.
            </p>
          )}
        </div>
      )}

      {!noDiscovery && (
        <div className="space-y-2">
          <FilterBar className="discovery-list-tools" actions={
            <FilterAction
              icon={Download}
              disabled={exporting || total === 0}
              onClick={() => {
                setExporting(true);
                setExportError(null);
                downloadCsv(token, filter, show).catch((e: unknown) => setExportError(e instanceof Error ? e.message : "Export failed. Please try again."))
                  .finally(() => setExporting(false));
              }}
            >
              {exporting ? "Preparing..." : "Export CSV"}
            </FilterAction>
          }>
            <FilterSearch value={q} onChange={setQ} placeholder="Search seller IDs or publishers" />

            <FilterGroup>
            <FilterSelect
              value={show}
              onChange={setShow}
              options={showOptions}
              leading="Show"
              ariaLabel="Show which lines"
            />
            <FilterSelect
              value={sort}
              onChange={setSort}
              options={SORT_OPTIONS}
              leading="Sort"
              ariaLabel="Sort discovered lines"
            />
            </FilterGroup>

          {!loading && !error && !onTrial && total > 0 && (
            <Pager placement="inline" anchorRef={paging.topRef} page={page} pageSize={PAGE_SIZE}
              total={total} onPage={paging.onPage} noun="lines" className="list-toolbar-pager" />
          )}
          </FilterBar>
          {exportError && <p role="alert" className="text-sm text-red-700">{exportError}</p>}
          {localOnly && (
            <p className="text-[11px] leading-relaxed text-slate-400">
              This sort reorders the {rows.length.toLocaleString()} lines on this page. The full list of{" "}
              {(total ?? 0).toLocaleString()} stays in new and biggest gains order.
            </p>
          )}
        </div>
      )}

      {loading && <SkeletonRows rows={6} label="Loading discovered lines" />}
      {error && <p className="py-4 text-sm text-critical">{error}</p>}
      {noDiscovery && <NoDiscoveryCard />}

      {!loading && !error && !noDiscovery && rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center text-sm text-slate-500">
          No lines match this filter.
        </p>
      )}

      {!loading && !error && sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map((line, i) => {
            const key = lineKey(line);
            return (
              <Settle key={key} index={i}>
                <LineCard
                  token={token}
                  basePath={basePath}
                  line={line}
                  compare={baseline.lines && line.previous_watched !== false}
                  search={filter}
                  canExport={!onTrial}
                  sellersPage={sellersPage}
                  open={open === key}
                  onToggle={() => toggle(key)}
                />
              </Settle>
            );
          })}
        </div>
      )}

      {onTrial && (
        <LockedTail
          slice={trial}
          caps={summary?.trial ?? null}
          noun="discovered lines"
          detail="line on the open web that starts with your domain, with every publisher carrying it"
        />
      )}
      {!loading && !onTrial && total > 0 && (
        <Pager
          className="border-t border-border/70 pt-4"
          page={page}
          pageSize={PAGE_SIZE}
          total={total ?? 0}
          onPage={paging.onPage}
          noun="lines"
        />
      )}
    </PageShell>
  );
}

/* ── Why last week is, or is not, compared ────────────────────────── */

type Baseline = {
  /** The lines compare with last week: "new this week", last week, change. */
  lines: boolean;
  /** The totals compare: the deltas on the KPI rectangle. */
  totals: boolean;
  words: string;
};

const COMPARED_WORDS = "Across every publisher we scanned, against last week";
const FIRST_WORDS = "First report, no earlier week to compare";
const CUT_WORDS =
  "Last week's list was cut short when that report was made, so there is nothing to compare this week";
const UNKNOWN_WORDS = "Last week could not be compared";

/**
 * Reports from 2026-10-14 say it themselves (totals.baseline). An older
 * report is read from its numbers: a previous count compares; zero last
 * week beside lines this week means the baseline did not watch the domain
 * (2026-10-11: read as growth, "+2,952 vs last week", on Truvid); no
 * previous count is a first report only when the summary says there was
 * no earlier crawl, else a week that could not be compared, which is not
 * the same claim. A dropped or unwatched domain keeps its own sentence
 * and turns the totals' deltas off.
 */
function readBaseline(totals: DiscoveredTotals | null, summary: Summary | null, settled: boolean): Baseline {
  if (!totals) return { lines: false, totals: false, words: "" };
  let lines: boolean;
  let words: string;
  if (totals.baseline) {
    lines = totals.baseline === "compared";
    words = totals.baseline === "cut" ? CUT_WORDS : totals.baseline === "none" ? FIRST_WORDS : COMPARED_WORDS;
  } else if (totals.previous_lines === 0 && totals.lines > 0) {
    lines = false;
    words = "No lines carried this domain last week, so there is nothing to compare";
  } else if (totals.previous_lines == null) {
    lines = false;
    words = settled && summary?.previous_job_id === null ? FIRST_WORDS : UNKNOWN_WORDS;
  } else {
    lines = true;
    words = COMPARED_WORDS;
  }
  const unwatched = totals.unwatched_domains ?? [];
  if (unwatched.length > 0) {
    return {
      lines,
      totals: false,
      words: `Last week's report did not watch ${unwatched.join(", ")}, so the totals are not compared`,
    };
  }
  if (totals.scope_changed) {
    return {
      lines,
      totals: false,
      words: "Your discovery domains changed since last week, so the totals are not compared",
    };
  }
  return { lines, totals: lines, words };
}

/* ── The card ──────────────────────────────────────────────────────── */

/**
 * One line, a deliberate sibling of PublisherCard on the overview: same
 * rounded-3xl card, same 44px disc, same right-aligned MiniStats, same
 * chevron, same tinted expanded body, in the `info` blue a line (not a
 * publisher) wears. The whole face is the button; the badge inside it is
 * the one thing that is not, when it links to the Sellers.json page.
 */
function LineCard({
  token,
  basePath,
  line,
  compare,
  search,
  canExport,
  sellersPage,
  open,
  onToggle,
}: {
  token: string;
  basePath: string;
  line: DiscoveredLine;
  /** False when last week cannot be set against this line: no "new", no move. */
  compare: boolean;
  /** The page's search term, carried into the roster when the card opens. */
  search: string;
  /** A full report has an Excel export; a trial has none. */
  canExport: boolean;
  /** The report has the Sellers.json page, so the badge opens it. */
  sellersPage: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const delta: Delta = compare ? deltaOf(line) : { kind: "flat" };
  const measure = lineMeasure(line);
  // Publishers once each where the report counts them; else files, and
  // the words say listings.
  const byPublisher = measure.unit === "publishers";
  const count = measure.now;
  const lastWeek = compare ? measure.before : null;
  const isNew = delta.kind === "new";
  const initial = (line.ssp_domain.replace(/^www\./i, "").charAt(0) || "?").toUpperCase();
  const mark = markOf(line);
  const openSellers = () => navigate(`${basePath}/sellers`);

  return (
    <div
      data-discovered-line={lineKey(line)}
      className={cn(
        "report-row overflow-hidden rounded-xl border shadow-sm transition-colors",
        isNew ? "border-info-border bg-info-bg/60" : "border-border bg-white",
        open && "shadow-md",
      )}
    >
      <button
        type="button"
        onClick={event => toggleWithoutJump(event.currentTarget, onToggle)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5"
      >
        <div
          className={cn(
            "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-base font-semibold",
            isNew ? "bg-info text-white" : "bg-info-bg text-info",
          )}
        >
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          {/* The line, verbatim and dominant; the cert id muted inside the
              same mono run, since it IS the fourth field of this line. */}
          <code className="block truncate font-mono text-[13px] font-semibold tracking-tight text-slate-900 sm:text-[15px]">
            {line.ssp_domain}, {line.publisher_id}, {line.relationship}
            {line.cert_id && <span className="font-normal text-slate-400">, {line.cert_id}</span>}
          </code>

          <div className="discovery-line-meta mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-500 sm:flex-nowrap">
            <span className="flex-shrink-0 sm:hidden">
              <span className="font-sans tabular-nums text-slate-700">{count.toLocaleString()}</span>{" "}
              {byPublisher ? (count === 1 ? "publisher" : "publishers") : count === 1 ? "listing" : "listings"}
            </span>
            {/* THE BADGE. The Sellers.json page owns the story (to add, to
                fix, not seen); here the badge only says which group the
                seller ID is in, and opens that page when the report has
                it. A click on it must not toggle the card. */}
            {mark && (
              <span className="discovery-line-status order-2 flex min-w-0 basis-full flex-wrap items-center gap-1.5 sm:order-none sm:basis-auto sm:flex-nowrap" title={mark.detail || undefined}>
                <span
                  role={sellersPage ? "link" : undefined}
                  tabIndex={sellersPage ? 0 : undefined}
                  title={sellersPage ? "Open your Sellers.json page" : undefined}
                  onClick={
                    sellersPage
                      ? (e) => {
                          e.stopPropagation();
                          openSellers();
                        }
                      : undefined
                  }
                  onKeyDown={
                    sellersPage
                      ? (e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          e.stopPropagation();
                          openSellers();
                        }
                      : undefined
                  }
                  className={cn(
                    "discovery-seller-mark inline-flex max-w-full flex-shrink-0 items-center gap-1.5 rounded-sm text-[12px] font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    MARK_STYLE[mark.kind].cls,
                    sellersPage && cn("cursor-pointer", MARK_STYLE[mark.kind].hover),
                  )}
                >
                  {(() => {
                    const MarkIcon = MARK_STYLE[mark.kind].icon;
                    return <MarkIcon aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />;
                  })()}
                  {mark.pill}
                </span>
                {mark.detail && <span className="truncate text-[11px] text-slate-500">{mark.detail}</span>}
              </span>
            )}
            {isNew && <span className="order-1 flex-shrink-0 font-medium text-info sm:order-none">new this week</span>}
          </div>
        </div>

        {/* Three reserved columns, so the numbers stack down the list
            rather than jittering card to card. */}
        <div className="hidden items-center gap-6 text-right sm:flex">
          <div className="w-[72px]">{lastWeek != null && <MiniStat label="Last week" value={lastWeek} />}</div>
          <div className="w-[72px]">
            <MiniStat label="This week" value={count} emphasis />
          </div>
          <div className="w-[72px]">
            {(delta.kind === "up" || delta.kind === "down") && (
              <>
                <div className="text-[10px] font-medium tracking-wide text-slate-500">Change</div>
                {/* Down is amber, not red: a publisher dropping a line is
                    worth attention, not a failure. */}
                <div
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    delta.kind === "up" ? "text-ok" : "text-warn",
                  )}
                >
                  {delta.kind === "up" ? "+" : "-"}
                  {(delta.n ?? 0).toLocaleString()}
                </div>
              </>
            )}
          </div>
        </div>

        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 flex-shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>

      <Collapse open={open}>
        <div
          className={cn(
            "border-t px-4 pb-4 pt-3 sm:px-5",
            isNew ? "border-info-border bg-info-bg/80" : "border-border bg-info-bg/40",
          )}
        >
          {/* The face already says the first issue; the list appears only
              when there is more than one to say. */}
          {line.issues && line.issues.length > 1 && (
            <ul className="mb-3 space-y-1 text-[12px] text-warn">
              {line.issues.map((it) => (
                <li key={it.kind} className="flex gap-1.5">
                  <span aria-hidden>•</span>
                  <span>{it.text}</span>
                </li>
              ))}
            </ul>
          )}
          <Roster token={token} line={line} initialQ={search} canExport={canExport} />
        </div>
      </Collapse>
    </div>
  );
}

/* ── The roster: whole, paged, searchable ─────────────────────────── */

type RosterData = { rows: DiscoveredPlacement[]; total: number } | "loading" | "error" | "toolarge";

function Roster({
  token,
  line,
  initialQ,
  canExport,
}: {
  token: string;
  line: DiscoveredLine;
  initialQ: string;
  canExport: boolean;
}) {
  /* No paging until asked (owner, 2026-10-15): a line opens on its first
     three publishers and a card saying how many more carry it; "Show more"
     turns the list into the Overview's pages. */
  const [paged, setPaged] = useState(false);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState(initialQ);
  const [data, setData] = useState<RosterData>("loading");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // Liveness, not per-run cancellation: setData("loading") re-renders, and
  // a `let cancelled` closure would then discard the very response it
  // waited for.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const needle = q.trim();
  useEffect(() => setPage(1), [needle]);
  const key = lineKey(line);
  useEffect(() => {
    setData((prev) => (typeof prev === "object" ? prev : "loading"));
    const [ssp_domain, publisher_id, relationship, cert_id] = key.split("|");
    const lineId: DiscoveredLineKey = { ssp_domain, publisher_id, relationship, cert_id };
    api
      .discoveredLinePlacements(token, lineId, { page, page_size: ROSTER_PAGE, q: needle || undefined })
      .then((r) => alive.current && setData({ rows: r.rows, total: r.total }))
      .catch((e: unknown) => {
        if (!alive.current) return;
        // 503 with the bake's own words: the report did not keep this
        // line's roster, which a retry cannot change. Any other failure,
        // a passing storage hiccup included, is an error.
        setData(e instanceof ApiError && e.status === 503 && /too large/i.test(e.message) ? "toolarge" : "error");
      });
  }, [token, key, page, needle]);

  const total = typeof data === "object" ? data.total : null;
  // A search shows every match, paged: the first three are for browsing.
  const whole = paged || needle !== "";
  const rows = typeof data === "object" ? (whole ? data.rows : data.rows.slice(0, ROSTER_FIRST)) : [];
  const hidden = !whole && total != null ? Math.max(0, total - rows.length) : 0;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-medium text-slate-700">Where it was found</span>
        <span className="flex items-center gap-4">
          {/* Publishers once each and their files where the report counts
              publishers; an older report counts files and says listings. */}
          <span className="text-[11px] text-slate-500">
            {line.publishers_count != null ? (
              <>
                <span className="font-sans tabular-nums">{line.publishers_count.toLocaleString()}</span>{" "}
                {line.publishers_count === 1 ? "publisher" : "publishers"},{" "}
                <span className="font-sans tabular-nums">{line.placements_count.toLocaleString()}</span>{" "}
                {line.placements_count === 1 ? "file" : "files"}
              </>
            ) : (
              <>
                <span className="font-sans tabular-nums">{(line.placements_count ?? 0).toLocaleString()}</span>{" "}
                {line.placements_count === 1 ? "listing" : "listings"}
              </>
            )}
          </span>

        </span>
      </div>
      {exportError && <p role="alert" className="mb-3 text-sm text-red-700">{exportError}</p>}
      {data !== "toolarge" && (
        <FilterBar className="mb-3">
          <FilterSearch value={q} onChange={setQ} placeholder="Search publishers" ariaLabel="Search publishers carrying this line" />
          {/* The page toolbar's Export, the same look, for this line alone. */}
          {canExport && (
            <ReportButton
              disabled={exporting || total === 0}
              onClick={() => {
                setExporting(true);
                setExportError(null);
                downloadLineCsv(token, line).catch((e: unknown) => setExportError(e instanceof Error ? e.message : "Export failed. Please try again."))
                  .finally(() => setExporting(false));
              }}
              className="report-download-action list-toolbar-action"
              aria-label="Export every publisher source file carrying this line as CSV"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Preparing..." : "Export CSV"}
            </ReportButton>
          )}
          {whole && typeof data === "object" && <Pager placement="inline" className="list-toolbar-pager" page={page}
            pageSize={ROSTER_PAGE} total={total ?? 0} onPage={setPage} noun="source files" />}
        </FilterBar>
      )}
      {/* A report frozen before 2026-10-14 kept only the first files of a
          wide line (200). Under a card that counts 10,801, the list says
          so, never passes for whole. */}
      {typeof data === "object" && !needle && total != null && total < line.placements_count && (
        <p className="mb-2 text-[11px] text-slate-500">
          This report kept the first {total.toLocaleString()} of {line.placements_count.toLocaleString()} files for
          this line.{canExport ? " The full list is in your Excel export." : ""}
        </p>
      )}
      {data === "loading" ? (
        <SkeletonInlineRows rows={3} label="Loading publishers for this line" />
      ) : data === "toolarge" ? (
        <p className="py-2 text-xs text-slate-500">
          This line is on too many publishers to list here.
          {canExport ? " The full list is in your Excel export." : ""}
        </p>
      ) : data === "error" ? (
        <p className="py-2 text-xs text-critical">Could not load the publishers for this line.</p>
      ) : data.rows.length === 0 ? (
        <p className="py-2 text-xs text-slate-500">
          {needle ? "No publisher on this line matches." : "No publishers recorded."}
        </p>
      ) : (
        <div>
          <LineActionGroup tone="added">
          <ul className="space-y-2">
            {rows.map((p, i) => (
              <PlacementCard key={`${p.developer_domain}|${p.bundle_id ?? ""}|${p.found_in}|${i}`} line={line} p={p} />
            ))}
          </ul>
          </LineActionGroup>
          {hidden > 0 && (
            /* The trial card's look (LockedTail), small: how many more carry
               the line, and the one button that opens them. */
            <div className="mt-3 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-white to-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Users className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[15px] font-semibold leading-snug tracking-tight text-slate-900">
                    {hidden.toLocaleString()} more {hidden === 1 ? "source file carries" : "source files carry"}{" "}
                    this line
                  </p>
                  <p className="mt-0.5 text-[12px] text-slate-600">
                    Showing {rows.length.toLocaleString()} of {(total ?? 0).toLocaleString()}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPaged(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  Show {Math.min(ROSTER_PAGE, total ?? 0).toLocaleString()} more
                </button>
              </div>
            </div>
          )}
          {whole && (
            <div className="mt-3">
              <Pager
                page={page}
                pageSize={ROSTER_PAGE}
                total={total ?? 0}
                onPage={setPage}
                noun="source files"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** A publisher carrying a line, with separate copy and source
 *  actions. The publisher name remains a link to its website. */
function PlacementCard({ line, p }: { line: DiscoveredLine; p: DiscoveredPlacement }) {
  const name = p.developer_name || p.developer_domain;
  const sourceLabel = foundInLabel(p.found_in)?.replace(/^Found in /, "") ?? "File not recorded";
  const initial = (name.replace(/^www\./i, "").charAt(0) || "?").toUpperCase();
  return (
    <ActionableLine
      line={line}
      selectionLabel={name}
      publisherDomain={p.file_host || p.developer_domain}
      foundIn={p.found_in}
      shown
      className="discovery-placement flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-sm"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-primary"
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="discovery-placement-name block truncate text-sm font-semibold tracking-tight text-slate-900">
          <PublisherDomainLink domain={p.developer_domain} label={name} shown />
        </span>
        <span className="discovery-placement-meta mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
          {name !== p.developer_domain && <span className="break-all">{p.developer_domain}</span>}
          {name !== p.developer_domain && <span aria-hidden className="text-slate-300">·</span>}
          <span data-line-text className="discovery-placement-source" title={`Source file: ${sourceLabel}`}>
            {sourceLabel}
          </span>
          {p.file_host && p.file_host !== p.developer_domain && <span className="break-all">on {p.file_host}</span>}
        </span>
      </span>
    </ActionableLine>
  );
}

/* ── Marks, deltas, helpers ───────────────────────────────────────── */

type Delta = { kind: "new" } | { kind: "flat" } | { kind: "up"; n: number } | { kind: "down"; n: number };

function deltaOf(line: DiscoveredLine): Delta {
  if (line.previous_placements_count == null) return { kind: "new" };
  // The same count on both sides, by the rule the sorts use.
  const m = lineMeasure(line);
  if (m.before == null) return { kind: "flat" };
  const d = m.now - m.before;
  if (d > 0) return { kind: "up", n: d };
  if (d < 0) return { kind: "down", n: -d };
  return { kind: "flat" };
}

/** The pill and the words beside it: what the customer's own file says,
 *  or what a publisher should fix. Null on a report without the check. */
type MarkKind = "fix" | "listed" | "unlisted";

/** Quiet status links: the words and a simple icon carry the meaning. */
const MARK_STYLE: Record<MarkKind, { cls: string; hover: string; icon: typeof Wrench }> = {
  listed: { cls: "text-ok", hover: "hover:underline underline-offset-4", icon: Check },
  unlisted: { cls: "text-warn", hover: "hover:underline underline-offset-4", icon: CircleAlert },
  fix: { cls: "text-critical", hover: "hover:underline underline-offset-4", icon: Wrench },
};

function markOf(
  line: DiscoveredLine,
): { pill: string; detail: string; tone: "warn" | "plain"; kind: MarkKind } | null {
  const issues = line.issues ?? [];
  if (issues.length > 0) {
    const first = issues[0].text;
    const rest = issues.length - 1;
    return {
      pill: "Needs fixing",
      detail: rest > 0 ? `${first}, and ${rest} more` : first,
      tone: "warn",
      kind: "fix",
    };
  }
  const s = line.seller;
  if (!s) return null;
  if (s.status === "listed") {
    return {
      pill: "In your sellers.json",
      detail: `${s.name}, ${s.seller_type.toLowerCase()}`,
      tone: "plain",
      kind: "listed",
    };
  }
  return { pill: "Not in your sellers.json", detail: "", tone: "warn", kind: "unlisted" };
}

/** A line's identity, and the React key for its card. */
function lineKey(l: DiscoveredLine): string {
  return [l.ssp_domain, l.publisher_id, l.relationship, l.cert_id].join("|");
}

/**
 * The seat-line-only report. An empty list would read as "discovery ran
 * and found nothing", which is the opposite of the truth.
 */
function NoDiscoveryCard() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white">
        <Radar className="h-5 w-5 text-slate-400" />
      </div>
      <h2 className="mt-4 text-sm font-semibold text-slate-900">
        This report did not look for lines starting with your domain
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
        It looked for your exact seat lines, so every line it kept is already on the Overview.
      </p>
    </div>
  );
}

/**
 * CSV export of what is on screen: one row per line, not per placement,
 * carrying the active search and Show filter. Walks every page; the cap
 * that remains is a runaway guard far above any real report.
 */
/** Save through the shared CSV writer used by all report lists. */
function saveCsv(name: string, header: readonly string[], rows: string[][]) {
  downloadCsvParts(["\uFEFF", csvLine([...header]), ...rows.map(row => "\r\n" + csvLine(row))], name);
}

const today = () => new Date().toISOString().slice(0, 10);
const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

/** Every publisher and app carrying one line, read whole from the
 *  placements endpoint (500 a page, its cap), one row each. */
async function downloadLineCsv(token: string, line: DiscoveredLine) {
  const header = [
    "ssp_domain",
    "seller_id",
    "relationship",
    "cert_id",
    "publisher_name",
    "publisher_domain",
    "file_host",
    "found_in",
    "app_name",
    "store",
    "bundle_id",
  ] as const;
  const id: DiscoveredLineKey = {
    ssp_domain: line.ssp_domain,
    publisher_id: line.publisher_id,
    relationship: line.relationship,
    cert_id: line.cert_id,
  };
  const rows: string[][] = [];
  await eachPage(
    (page) => api.discoveredLinePlacements(token, id, { page, page_size: 500 }),
    500,
    (pageRows) => { for (const p of pageRows) {
      rows.push([
        line.ssp_domain,
        line.publisher_id,
        line.relationship,
        line.cert_id,
        p.developer_name || p.developer_domain,
        p.developer_domain,
        p.file_host || p.developer_domain,
        p.found_in,
        p.app_name ?? "",
        p.app_name ? storeName(p) : "",
        p.bundle_id ?? "",
      ]);
    }
    }, undefined, undefined, {
      expectedTotal: line.placements_count,
      key: (p) => JSON.stringify([p.developer_domain, p.file_host || p.developer_domain, p.found_in, p.store || "", p.bundle_id || ""]),
    },
  );
  // App columns only when the report carries apps (a report names
  // publishers and their files; app details ride along only when present).
  const hasApps = rows.some((r) => r[8] !== "");
  saveCsv(
    `discovery-${fileSafe(line.ssp_domain)}-${fileSafe(line.publisher_id)}-${line.relationship.toLowerCase()}-${today()}.csv`,
    hasApps ? header : header.slice(0, 8),
    hasApps ? rows : rows.map((r) => r.slice(0, 8)),
  );
}

async function downloadCsv(token: string, q: string, show: ShowFilter) {
  // Named the way the page says it: seller ID, files, publishers.
  const header = [
    "ssp_domain",
    "seller_id",
    "relationship",
    "cert_id",
    "files_this_week",
    "files_last_week",
    "publishers_this_week",
    "publishers_last_week",
    "origin",
    "in_your_sellers_json",
    "seller_name",
    "needs_fixing",
  ] as const;
  const acc: string[][] = [];
  // Check the unfiltered artifact too: filtering cannot restore omitted rows.
  const whole = await api.discoveredLines(token, { page: 1, page_size: 1 });
  if (whole.cut || whole.total !== whole.totals.lines ||
      (whole.totals.listed_lines != null && whole.totals.listed_lines !== whole.totals.lines))
    throw new Error("This report contains an incomplete discovery list. Request a complete new report. Nothing was exported.");
  const pageSize = 200;
  await eachPage((page) => api.discoveredLines(token, {
      page,
      page_size: pageSize,
      q: q || undefined,
      show: show === "all" ? undefined : show,
    }), pageSize, (pageRows) => {
    for (const row of pageRows) {
      acc.push([
        row.ssp_domain,
        row.publisher_id,
        row.relationship,
        row.cert_id,
        String(row.placements_count),
        row.previous_placements_count == null ? "" : String(row.previous_placements_count),
        row.publishers_count == null ? "" : String(row.publishers_count),
        row.previous_publishers_count == null ? "" : String(row.previous_publishers_count),
        row.origin ?? "",
        row.seller ? (row.seller.status === "listed" ? "yes" : "no") : "",
        row.seller?.status === "listed" ? row.seller.name : "",
        (row.issues ?? []).map((i) => i.text).join("; "),
      ]);
    }
  }, undefined, undefined, {
    key: (row) => JSON.stringify([row.ssp_domain, row.publisher_id, row.relationship, row.cert_id]),
  });
  saveCsv(`discovery-lines-${today()}.csv`, header, acc);
}
