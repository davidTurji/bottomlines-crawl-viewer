import type { ChangeGroup, ChangeGroupsPage } from "@/lib/api";
import { HoverHint } from "@/components/HoverHint";
import { Pager, usePaging } from "@/components/ListControls";
import { Collapse, Settle } from "@/components/Motion";
import LockedTail from "@/components/LockedTail";
import TrialBanner from "@/components/TrialBanner";
import { SkeletonRows, SkeletonStatCards } from "@/components/Skeleton";
import { gutterDigits, RowNote, RowText, SeatLinesFrame, SeatLinesHead, SeatLinesSkeleton } from "@/components/SeatLines";
import { useEffect, useMemo, useRef, useState } from "react";
import { LineFilter } from "@/components/LineFilter";
import { PAGE_SIZE } from "@/lib/paging";
import { useLineFilter } from "@/lib/lineFilter";
import {
  ArrowRight,
  ChevronDown,
  CircleHelp,
  Download,
  Minus,
  Plus,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  addedDates,
  certDates,
  removedDates,
  removalReasonText,
  unconfirmedDates,
  unconfirmedSentence,
  WEEKLY_READ_NOTE,
} from "@/lib/changeDates";

import { api, type LineEvent, type Summary, type TrialSlice } from "../lib/api";
import { formatWeek, WeekLine } from "@/components/WeekLine";
import { useReportScope } from "@/lib/reportScope";
import { PageShell } from "@/components/PageShell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, scopeReasonText } from "@/lib/utils";
import { PublisherDomainLink } from "@/components/PublisherLinks";
import { computeDelta, MiniStat, SeatLineRow, SplitStat } from "./CrawlReport";
import { BEAT_PAUSE_MS, landsAfterMs } from "@/components/CountUp";

/**
 * LINE CHANGES.
 *
 * The question this page answers is "which ads.txt lines moved since last
 * week, and where". The previous draft answered it as a dense table whose
 * change type - the entire point - was an unlabelled 16px arrow in a column
 * with no header, and whose rows arrived grouped by event, so the All tab
 * showed a hundred and twenty seven identical-looking rows before the first
 * removal. It also leaked the raw file_kind enum ("APP_ADS_TXT") to the
 * customer and gave a cert rotation a single "Cert" column, which cannot
 * show a change.
 *
 * Rebuilt on the same premium card as the overview's PublisherCard and the
 * Discovered lines page:
 *
 *   - one card per LINE, not per (line x publisher) row. The unit is the
 *     ads.txt line, which is what an SSP actually changed; the publishers it
 *     moved on are the expansion.
 *   - the whole line in mono, dominant, cert included.
 *   - the event as a LABELLED CHIP in its tone, on the card face, plus a
 *     toned disc. No reader has to decode a glyph.
 *   - a cert rotation renders the rotation: old to new, both in mono.
 *   - the file is rendered as "ads.txt" / "app-ads.txt" wherever it shows.
 *
 * Tones. Added is `ok`, cert changes are `warn`, removals are `critical`.
 * A removal is a market fact rather than an error, and the copy is kept
 * deliberately neutral for that reason, but the three events have to be
 * separable at a glance or fault one comes straight back: with `warn`
 * already carrying cert rotations, giving removals the same amber would
 * make the two most confusable events share a colour. Every tone here is a
 * tint plus text, never a solid block, so red reads as direction and not
 * as an alarm. Colour is never the only carrier either: the chip says the
 * event in words, which is what a colourblind reader reads.
 */

type Bucket = "all" | EventKind;
/** What happened to a line between the two crawls.
 *
 *  The first three describe the WILD. The last two describe OUR WATCHLIST
 *  moving, which means the line was not comparable across the two weeks at
 *  all: we either started looking at it or stopped. They are separate
 *  kinds, not a footnote on "added", because a seat that joined the
 *  watchlist had always been out there and calling that an addition told
 *  the customer their market moved when only our attention did. */
type EventKind =
  | "added"
  | "removed"
  | "cert_changed"
  | "newly_monitored"
  | "monitoring_stopped"
  | "first_appearance"
  /** The crawler could not verify the line this crawl (David, 2026-10-20:
   *  1000 percent honesty). Not added, not removed, kept as matched; its
   *  own tab, with the reason and the dates, and never a big card. */
  | "unconfirmed";

export default function CrawlChanges() {
  const { token } = useReportScope();
  const [summary, setSummary] = useState<Summary | null>(null);
  // Whether the summary request has SETTLED, success or failure — which
  // is not the same question as whether a summary arrived. Every page here
  // swallows a summary failure (the week line is the only thing that reads
  // it, and a page whose own numbers are fine should not die for a missing
  // date), so `summary` stays null forever on an old artifact whose summary
  // does not load. Reserving the week line's space on `!summary` would then
  // shimmer a skeleton bar for ever on exactly those older links.
  const [summarySettled, setSummarySettled] = useState(false);
  const [previous, setPrevious] = useState<Summary | null>(null);
  const [bucket, setBucket] = useState<Bucket>("all");
  // Which scope tabs this week earns, from the crawl-wide totals.
  const scopeTabs = useMemo<[EventKind, string][]>(() => {
    const t = summary?.hero_diff?.line_totals;
    if (!t) return [];
    return (["newly_monitored", "monitoring_stopped"] as const)
      .filter((k) => (t[k] ?? 0) > 0)
      .map((k) => [k, TONES[k].label]);
  }, [summary]);
  // UNCONFIRMED (2026-10-20): lines the crawler could not verify this
  // crawl. Counted from the summary, like the scope tabs, so the tab that
  // reveals them does not vanish once it is open. Missing on a report
  // frozen before the kind existed, which reads as 0: no tab, no line.
  const unconfirmedCount = summary?.hero_diff?.line_totals?.unconfirmed ?? 0;
  // The tab exists only while something is unconfirmed; a page left on it
  // (a line filter that narrowed them away) falls back to All.
  useEffect(() => {
    if (bucket === "unconfirmed" && summary && unconfirmedCount === 0) setBucket("all");
  }, [bucket, summary, unconfirmedCount]);
  const [ssp, setSsp] = useState("");
  const [result, setResult] = useState<ChangeGroupsPage | null>(null);
  const rows = result?.rows ?? [];
  /** Present on a trial: the server cut the line events to the visible
   *  publishers' and says how many there are in full. */
  const [trial, setTrial] = useState<TrialSlice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const paging = usePaging(setPage);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Bumps each time a list lands, so the new cards ease in as one piece.
  const [settled, setSettled] = useState(0);

  const [filter, setFilter] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setFilter(ssp.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [ssp]);
  // Which query produced the displayed counters. A server-paged tab or
  // filter must never put old totals under a newly selected label.
  const [settledFor, setSettledFor] = useState<string | null>(null);
  /* The seat-line filter, shared with the overview through the URL. The
     events are re-fetched under it, and every KPI on this page is counted
     from the rows, so the numbers follow the filter by construction. */
  const { selected: lines, setSelected: setLines } = useLineFilter();
  const linesKey = lines.join(",");
  const selectionKey = JSON.stringify([token, linesKey, filter, bucket]);
  const refiltering = settledFor !== null && settledFor !== selectionKey;
  // The cold open and the refilter share one treatment.
  const showSkeleton = !error && (refiltering || (loading && settled === 0));
  const showListSkeleton =
    showSkeleton || (!error && (loading || result?.page !== page));

  useEffect(() => {
    let cancelled = false;
    api
      .summary(token, lines)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => {})
      .finally(() => !cancelled && setSummarySettled(true));
    return () => {
      cancelled = true;
    };
  }, [token, lines]);

  // LAST WEEK'S SUMMARY DOES NOT TAKE THE LINE FILTER, so it is keyed on
  // the token alone. It used to sit in the effect above and be re-read on
  // every change of selection, and it is two round trips (it reads this
  // crawl's summary to learn the previous crawl's id, then reads that),
  // every one of them returning the answer already in state.
  useEffect(() => {
    let cancelled = false;
    api
      .previousSummary(token)
      .then((p) => !cancelled && setPrevious(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  // The server groups BEFORE paging and counts the entire filtered set.
  // Abort an obsolete read; it must not continue walking old pages.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .changeGroups(
        token,
        {
          event: bucket === "all" ? undefined : bucket,
          ssp_domain: filter || undefined,
          lines: lines.length ? lines : undefined,
          page,
          page_size: PAGE_SIZE,
        },
        controller.signal,
      )
      .then((r) => {
        if (controller.signal.aborted) return;
        setResult(r);
        setTrial(r.trial ?? null);
        setOpen(new Set());
        setSettled((n) => n + 1);
        setSettledFor(selectionKey);
      })
      .catch(
        (e: Error) =>
          !controller.signal.aborted && setError(changeErrorMessage(e)),
      )
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [token, filter, lines, linesKey, bucket, page, selectionKey]);

  useEffect(() => setPage(1), [bucket, filter, lines]);
  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const shown = rows;

  const weekLabel = summary?.finished_at
    ? formatWeek(new Date(summary.finished_at))
    : null;
  const prevWeekLabel = previous?.finished_at
    ? formatWeek(new Date(previous.finished_at))
    : null;

  // The KPI row re-scopes to the selected tab, so the numbers on top always
  // describe the cards underneath them rather than the whole week. Picking
  // "Removed" and reading a total that still counts additions was the old
  // page's worst lie.
  const kpi = result?.kpi ?? {
    lines: 0,
    placements: 0,
    publishers: 0,
    apps: 0,
    byEvent: {
      added: 0,
      removed: 0,
      cert_changed: 0,
      newly_monitored: 0,
      monitoring_stopped: 0,
      first_appearance: 0,
    },
  };

  /** No previous crawl at all. Distinct from "no changes": one is a
   *  starting point, the other is a result. */
  const isFirstCrawl = summary?.previous_job_id === null;

  // Last week's own totals for the same three events, so each KPI can say
  // whether this week was busier than the last.
  //
  // WHICH NUMBER THIS CAN BE COMPARED AGAINST. `hero_diff.line_totals`
  // counts one per (line x publisher file) — 127 additions last week means
  // 127 file entries, not 127 distinct lines. This page's cards are one per
  // DISTINCT line, so its `counts.added` (32) is a different unit entirely.
  // Putting last week's 92 next to this week's 32 produced a confident
  // "-65.2%" that measured nothing. The delta therefore rides on
  // `kpi.byEvent`, which is counted the same way the summary counts, and
  // the distinct-line figure carries no delta because no prior-week
  // distinct-line count exists to compare it to.
  //
  // Suppressed under a filter for the same reason: the counts on screen
  // then describe a slice while last week's describe the whole week.
  //
  // Incomplete frozen artifacts are refused by the grouped endpoint.
  // A seat-line filter makes every current count a slice of the week while
  // last week's figures are the whole week, so nothing is comparable.
  // Not on a trial either: this week's figures are counted on the cut
  // rows while last week's are whole, and a delta between the two would
  // be confident and wrong.
  const comparable = !filter && lines.length === 0 && !trial;
  const prevCounts = useMemo<Record<EventKind, number | null>>(
    () => ({
      added: previous?.hero_diff.line_totals.added ?? null,
      removed: previous?.hero_diff.line_totals.removed ?? null,
      cert_changed: previous?.hero_diff.line_totals.cert_changed ?? null,
      // A scope kind has no honest previous value BY CONSTRUCTION: last
      // week we were not watching these lines, so there is no number from
      // that week to be a percentage of. Their first week is a baseline.
      newly_monitored: null,
      monitoring_stopped: null,
      first_appearance: null,
      // Not a change at all, so nothing to be a percentage of.
      unconfirmed: null,
    }),
    [previous],
  );
  const deltaFor = (event: EventKind, current: number) => {
    // Scope kinds never carry a delta, whatever else is true. Everything
    // else keeps the existing suppression rules.
    if (isScopeKind(event) || event === "unconfirmed") return null;
    const prev = prevCounts[event];
    return comparable && prev != null ? computeDelta(current, prev) : null;
  };

  // Week-over-week growth on the "Where they landed" card's two figures.
  // Drawn only where the comparison is like for like: the whole week (the All
  // tab, not a scope tab where the current counts describe only a slice while
  // last week's affected figure is the whole week), and only when the deltas
  // are comparable at all (no filter, not truncated) with a previous crawl to
  // measure against. Same discipline the left card's deltas already follow.
  const prevAffected = previous?.hero_diff.affected ?? null;
  const showAffectedDelta = bucket === "all" && comparable;
  const publishersAffectedDelta =
    showAffectedDelta && prevAffected
      ? computeDelta(kpi.publishers, prevAffected.publishers)
      : null;
  const appsAffectedDelta =
    showAffectedDelta && prevAffected
      ? computeDelta(kpi.apps, prevAffected.apps)
      : null;

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <PageShell>
      {summary?.trial && <TrialBanner caps={summary.trial} summary={summary} />}
      {/* Page header. The seat-line filter sits top right, exactly where the
          overview keeps it, so it is the same control in the same place on
          both pages. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0" data-tour="changes-header">
          <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            Changes
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isFirstCrawl
              ? "Lines publishers added, dropped, or re-certified. First crawl, so the comparison begins next week."
              : "Lines publishers added, dropped, or re-certified this week."}
          </p>
          <WeekLine
            week={weekLabel}
            previousWeek={prevWeekLabel}
            isFirstCrawl={summary?.previous_job_id === null}
            pending={!summarySettled}
            className="mt-1.5"
          />
        </div>
        <LineFilter
          seats={summary?.watchlist?.seats ?? []}
          selected={lines}
          onChange={setLines}
          // Only a REFILTER, not the page's own first load: on a cold open
          // the skeleton below already says the page is loading, and a
          // second "Filtering..." beside it would claim the reader had
          // set a filter they never touched.
          busy={refiltering}
        />
      </div>
      <p className="-mt-2 min-h-[18px] text-[12px] leading-[18px] text-slate-500">
        {lines.length > 0 && (
          <>
            Only changes on{" "}
            <span className="font-mono text-slate-700">
              {lines.length === 1
                ? "the selected line"
                : `${lines.length} selected lines`}
            </span>
            .
          </>
        )}
      </p>

      {/* The KPI row, scoped to the selected tab. Same two-card shape as the
          overview so a reader who has seen one has seen both. */}
      {/* The KPI row, scoped to the selected tab.

          A SEAT-LINE REFILTER AND A COLD OPEN GET THE SAME SKELETON: both
          are a new question about the report, and the numbers here would
          otherwise sit at 60% opacity still stating the answer to the old
          one. An SSP search is different, and deliberately keeps the light
          treatment (the dim, plus the dots beside the tabs).

          This sits in the KPI row's own slot rather than where the loader
          used to be, because the real row is ABOVE the tabs: put it lower
          and the cards would arrive under the controls and jump back. */}
      {showSkeleton && <SkeletonStatCards count={2} />}

      {!error && !showSkeleton && (
        <div
          className={cn(
            "grid grid-cols-1 gap-4 transition-opacity duration-300 ease-out lg:grid-cols-2",
            loading && "opacity-60",
          )}
        >
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <div className="font-display text-sm font-medium text-slate-700">
                  {bucket === "all"
                    ? "This week's changes"
                    : TONES[bucket].label}
                </div>
                <div className="text-[11px] text-slate-500">
                  {isFirstCrawl
                    ? "Your first crawl"
                    : bucket === "all"
                      ? "Relative to last week"
                      : bucket === "first_appearance"
                        ? "New to your report, nothing to compare against"
                        : bucket === "newly_monitored"
                          ? "Their first week on your seat lines"
                          : // Not "first week": these lines came OFF the list,
                            // so the week they are having is their last. The
                            // publishers still carry them.
                            bucket === "monitoring_stopped"
                            ? "Came off your seat lines, still carried"
                            : bucket === "unconfirmed"
                              ? "Not counted as added or removed"
                              : "This tab only"}
                </div>
              </div>
              <span className="text-xs text-slate-500">
                {isFirstCrawl
                  ? "baseline"
                  : bucket === "all"
                    ? `${kpi.byEvent.cert_changed.toLocaleString()} cert changes`
                    : `${kpi.lines.toLocaleString()} distinct lines`}
              </span>
            </div>
            {/* Same reason as the overview: on a first crawl "+0 added, -0
                removed" is the absence of a result, not one, and it is the
                first thing a new customer reads. */}
            {isFirstCrawl ? (
              <div className="rounded-xl border border-border bg-muted/30 px-5 py-6 text-center">
                <div className="text-sm font-medium text-slate-700">
                  This is the first crawl, with no prior week
                </div>
                <div className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-slate-500">
                  There is nothing to compare against yet. This week is your
                  baseline, and the next crawl will list what publishers added,
                  dropped and re-certified against it.
                </div>
              </div>
            ) : bucket === "unconfirmed" ? (
              // NEVER A BIG NUMBER (David, 2026-10-20). What could not be
              // checked is not a result, so this tab's card says what the
              // lines below are instead of counting them in a KPI.
              <div className="rounded-xl border border-border bg-muted/30 px-5 py-6 text-center">
                <div className="text-sm font-medium text-slate-700">
                  {unconfirmedSentence(unconfirmedCount)}
                </div>
                <div className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-slate-500">
                  Each line below says why, when it was last seen, when its
                  file was read this crawl and whether it was verified.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border border-border">
                {bucket === "all" ? (
                  <>
                    <SplitStat
                      tone="ok"
                      prefix="+"
                      number={kpi.byEvent.added}
                      label="Lines added"
                      delta={deltaFor("added", kpi.byEvent.added)}
                      note={
                        lines.length ? "under the selected lines" : undefined
                      }
                    />
                    <SplitStat
                      tone="critical"
                      prefix="-"
                      number={kpi.byEvent.removed}
                      label="Lines removed"
                      delta={deltaFor("removed", kpi.byEvent.removed)}
                      note={
                        lines.length ? "under the selected lines" : undefined
                      }
                    />
                  </>
                ) : (
                  <>
                    <SplitStat
                      tone={
                        bucket === "added"
                          ? "ok"
                          : bucket === "removed"
                            ? "critical"
                            : bucket === "newly_monitored"
                              ? "info"
                              : bucket === "monitoring_stopped"
                                ? "warn"
                                : // First appearance stays neutral, matching
                                  // its cards: news about our crawl, not the
                                  // market.
                                  isScopeKind(bucket)
                                  ? undefined
                                  : "warn"
                      }
                      number={kpi.placements}
                      label={TONES[bucket].label}
                      delta={deltaFor(bucket, kpi.placements)}
                      note={
                        lines.length ? "under the selected lines" : undefined
                      }
                    />
                    <SplitStat number={kpi.lines} label="Distinct lines" />
                  </>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <div className="font-display text-sm font-medium text-slate-700">
                  Where they landed
                </div>
                <div className="text-[11px] text-slate-500">
                  {isFirstCrawl
                    ? "No prior week to compare against"
                    : bucket === "unconfirmed"
                      ? "Carrying the unconfirmed lines below"
                      : "Across the lines shown below"}
                </div>
              </div>
              <span className="text-xs text-slate-500">
                {isFirstCrawl
                  ? "first crawl"
                  : `${kpi.lines.toLocaleString()} lines`}
              </span>
            </div>
            {/* "0 publishers affected" is true and useless on a first crawl:
                nothing was affected because there is no earlier week for
                anything to have moved against. Two zeros make a new customer
                read the product as having found nothing, so the card says
                which of the two it is. */}
            {isFirstCrawl ? (
              <div className="rounded-xl border border-border bg-muted/30 px-5 py-6 text-center">
                <div className="text-sm font-medium text-slate-700">
                  This is the first crawl, with no prior week
                </div>
                <div className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-slate-500">
                  Nothing has moved yet because there is nothing to move
                  against. Publishers and apps appear here once the next crawl
                  compares to this one.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border border-border">
                {/* Same tones as the overview's matched cards: publishers in the
                  brand green, apps in pink, so the two pages read as one. */}
                <SplitStat
                  tone="publisher"
                  number={kpi.publishers}
                  label="Publishers affected"
                  // Second beat: a second after the left card has landed.
                  delayMs={landsAfterMs() + BEAT_PAUSE_MS}
                  delta={publishersAffectedDelta}
                  note={lines.length ? "under the selected lines" : undefined}
                />
                <SplitStat
                  tone="app"
                  number={kpi.apps}
                  label="Apps affected"
                  // Second beat: a second after the left card has landed.
                  delayMs={landsAfterMs() + BEAT_PAUSE_MS}
                  delta={appsAffectedDelta}
                  note={lines.length ? "under the selected lines" : undefined}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls: the bucket, then a full-width SSP filter on its own row.
          The search used to be a fixed-width pill floating on the right of the
          tabs; as a wide bar spanning the row it reads as the search it is. */}
      <div className="space-y-3" data-tour="changes-controls">
        {/* The same plain segmented control the overview's drilldown wears.
            The per-tab counts it used to carry now live in the KPI row
            directly above, which re-scopes with the tab, so printing them
            on the control as well was the same number twice. */}
        {/* THE NOTE SITS WITH THE TABS IT IS ABOUT, not inside the KPI
            card. Inside the card it pushed the two headline numbers down
            and left the pair of cards uneven, which is a layout cost paid
            on the one week a customer most needs the numbers to read
            normally. Here it explains the two extra tabs, an arm's length
            from them, and disturbs nothing above it. */}
        {!isFirstCrawl && scopeTabs.length > 0 && (
          <p className="mb-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-slate-500">
            <Eye
              aria-hidden
              className="mt-[3px] h-3.5 w-3.5 flex-shrink-0 text-slate-400"
            />
            <span>
              Your seat lines changed since last week. Lines you started or
              stopped watching are on their own tabs, and are not counted as
              added or removed: the publishers carrying them did not change.
            </span>
          </p>
        )}
        <div className="flex min-w-0 items-center gap-3">
          {/* ON A PHONE, A WEEK WITH SIX TABS IS WIDER THAN THE SCREEN. The
              row scrolls sideways on its own, so the tabs never push the
              whole page into a sideways scroll (it did, by about 100px). */}
          <div className="min-w-0 overflow-x-auto">
            <Tabs value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
              {/* max-w-none: the base layer caps every element at 100% of its
                parent, which squeezed this strip to the screen and, being
                centred, pushed All and Added off its left edge where no
                scroll could reach them. */}
              <TabsList className="w-max max-w-none">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="added">Added</TabsTrigger>
                <TabsTrigger value="removed">Removed</TabsTrigger>
                <TabsTrigger value="cert_changed">Cert changes</TabsTrigger>
                {/* THE WATCHLIST MOVED, so the lines it moved get somewhere to
                  be. Shown only on a week that has them -- the ordinary week
                  keeps four tabs -- and counted from the summary rather than
                  from the rows on screen, which are already scoped to the
                  open tab and would make the tab that reveals them vanish
                  the moment it was used.

                  Without these, a customer who trimmed fifty lines could
                  see the note above and then have no way to find which
                  fifty: the rows sit in All, mixed into a week of real
                  market movement. */}
                {scopeTabs.map(([kind, label]) => (
                  <TabsTrigger key={kind} value={kind}>
                    {label}
                  </TabsTrigger>
                ))}
                {/* WHAT COULD NOT BE CHECKED, last, and only on a week
                    that has any: the ordinary week keeps its tabs. */}
                {!isFirstCrawl && unconfirmedCount > 0 && (
                  <TabsTrigger value="unconfirmed">Unconfirmed</TabsTrigger>
                )}
              </TabsList>
            </Tabs>
          </div>
        </div>
        {/* ONE QUIET LINE, NEVER A CARD (David, 2026-10-20): the lines the
            crawler could not verify, under the tabs, on every tab but their
            own, where the card above already says it. */}
        {!isFirstCrawl && unconfirmedCount > 0 && bucket !== "unconfirmed" && (
          <p data-testid="unconfirmed-quiet" className="text-[12px] leading-relaxed text-slate-500">
            {unconfirmedSentence(unconfirmedCount)}
          </p>
        )}
        {/* Why every removal carries two dates, said once where they are. */}
        {!isFirstCrawl && bucket === "removed" && (
          <p className="text-[12px] leading-relaxed text-slate-500">{WEEKLY_READ_NOTE}</p>
        )}

        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={ssp}
            onChange={(e) => setSsp(e.target.value)}
            placeholder="Filter by SSP domain"
            aria-label="Filter by SSP domain"
            className="h-10 w-full rounded-full border border-border bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary/40"
          />
        </div>
      </div>

      {showListSkeleton && (
        <SkeletonRows rows={6} label="Loading line changes" />
      )}
      {error && <p className="py-4 text-sm text-critical">{error}</p>}

      {/* An empty list has two very different causes and they must not
          share a sentence. "No changes match this filter" blames a filter
          the customer never set when the real reason is that this is their
          first crawl and there is nothing to compare against yet. */}
      {!loading && !error && shown.length === 0 && isFirstCrawl && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <div className="text-sm font-medium text-slate-700">
            This is your first crawl
          </div>
          <p className="mx-auto mt-1 max-w-lg text-[13px] leading-relaxed text-slate-500">
            There is no earlier week to compare against yet, so nothing is
            listed here. Everything found this week becomes the baseline, and
            the next crawl will show what moved against it.
          </p>
        </div>
      )}
      {!loading && !error && shown.length === 0 && !isFirstCrawl && (
        <p className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center text-sm text-slate-500">
          No line changes match this filter.
        </p>
      )}

      {!showListSkeleton && total > PAGE_SIZE && (
        <Pager
          placement="top"
          anchorRef={paging.topRef}
          page={safePage}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={paging.onPage}
          noun="lines"
        />
      )}

      {/* Not while the skeleton is up: the previous filter's rows are
          still in state and would render underneath it. */}
      {!showListSkeleton && !error && shown.length > 0 && (
        <div
          key={settled}
          className={cn(
            "animate-in fade-in space-y-3 transition-opacity duration-300 ease-out",
            loading && "opacity-60",
          )}
        >
          {shown.map((g, i) => (
            <Settle key={g.key} index={i}>
              <ChangeCard
                group={g}
                token={token}
                filters={{ ssp_domain: filter || undefined, lines }}
                open={open.has(g.key)}
                onToggle={() => toggle(g.key)}
              />
            </Settle>
          ))}
        </div>
      )}

      {/* Counts the PREVIOUS filter's groups while a new one is in
          flight, so it stays down with the list it describes. */}
      {!showListSkeleton && !loading && (summary?.trial || trial) && (
        <LockedTail
          slice={trial}
          caps={summary?.trial ?? null}
          noun="line changes"
          detail="change, on every publisher, week after week"
        />
      )}
      {/* The locked tail describes hidden trial placements. Paging below
          stays within the server's already-cut, entitled publisher set. */}
      {!showListSkeleton && total > PAGE_SIZE && (
        <Pager
          className="border-t border-border/70 pt-4"
          page={safePage}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={paging.onPage}
          noun="lines"
        />
      )}
    </PageShell>
  );
}

/* ── The card ──────────────────────────────────────────────────────── */

/** Publishers per page of an expanded card's roster. */
const ROSTER_PAGE = 50;

/**
 * One changed line, built as a deliberate sibling of PublisherCard and of
 * the Discovered lines card: same rounded-3xl white card, same shadow, same
 * 44px disc, same right-aligned MiniStats, same chevron, and the very body
 * an Overview row opens (David, 2026-10-27).
 *
 * The difference is that the disc carries the tone of the EVENT, because on
 * this page the event is the fact the reader came for. The disc means a
 * card's event is readable from the edge of vision, before any word is read.
 */
function ChangeCard({
  group,
  token,
  filters,
  open,
  onToggle,
}: {
  group: ChangeGroup;
  token: string;
  filters: { ssp_domain?: string; lines?: string[] };
  open: boolean;
  onToggle: () => void;
}) {
  const tone = TONES[group.event];
  const Icon = tone.icon;
  const count = group.publisher_count;
  const [publishers, setPublishers] = useState<LineEvent[]>([]);
  const [publisherPage, setPublisherPage] = useState(1);
  const [rosterLoading, setRosterLoading] = useState(false);
  // The roster page on screen: until the first one lands the body shows the
  // skeleton, never an empty list for a frame.
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const linesKey = filters.lines?.join(",") ?? "";
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setRosterLoading(true);
    setRosterError(null);
    api
      .changePublishers(
        token,
        group.key,
        {
          ssp_domain: filters.ssp_domain,
          lines: linesKey ? linesKey.split(",") : undefined,
          page: publisherPage,
          page_size: ROSTER_PAGE,
        },
        controller.signal,
      )
      .then((r) => {
        if (controller.signal.aborted) return;
        setPublishers(r.rows);
        setLoadedPage(publisherPage);
      })
      .catch(
        (e: Error) =>
          !controller.signal.aborted && setRosterError(changeErrorMessage(e)),
      )
      .finally(() => !controller.signal.aborted && setRosterLoading(false));
    return () => controller.abort();
  }, [token, group.key, open, publisherPage, filters.ssp_domain, linesKey]);
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => () => exportController.current?.abort(), []);
  async function downloadRoster() {
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setRosterError(null);
    try {
      const all: LineEvent[] = [];
      for (let p = 1; all.length < count; p++) {
        const r = await api.changePublishers(
          token,
          group.key,
          { ...filters, page: p, page_size: 500 },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (!r.rows.length || r.total !== count)
          throw new Error(
            "The publisher list changed. Reload before exporting.",
          );
        all.push(...r.rows);
      }
      if (all.length !== count)
        throw new Error("Incomplete publisher list; export cancelled.");
      exportPublishers(group, all);
    } catch (e) {
      if (!controller.signal.aborted)
        setRosterError(changeErrorMessage(e as Error));
    } finally {
      if (!controller.signal.aborted) setExporting(false);
    }
  }

  // The cert that belongs to the line as it stands. A rotation has two, and
  // gets its own row below rather than a fourth field that cannot show a
  // change.
  const inlineCert =
    group.event === "added" || group.event === "newly_monitored"
      ? group.new_cert_id
      : group.event === "removed" || group.event === "monitoring_stopped"
        ? group.old_cert_id
        : group.event === "unconfirmed"
          ? (group.new_cert_id ?? group.old_cert_id)
          : null;
  // WHEN, per publisher (David, 2026-10-20): the dates are a fact of the
  // read of THAT publisher's file, so they sit on the roster row, not on
  // the card, which speaks for the line across all of them.
  const rowDates = (p: LineEvent): string | null =>
    group.event === "removed"
      ? removedDates(p)
      : group.event === "added"
        ? addedDates(p)
        : group.event === "cert_changed"
          ? certDates(p)
          : group.event === "unconfirmed"
            ? unconfirmedDates(p)
            : null;

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
        <HoverHint text={tone.hint} side="right" className="flex-shrink-0">
          <div
            className={cn(
              "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full",
              tone.disc,
            )}
          >
            <Icon aria-hidden className="h-5 w-5" />
          </div>
        </HoverHint>

        <div className="min-w-0 flex-1">
          {/*
            The line, verbatim and dominant, cert included: that string IS
            the unit of this page. It truncates rather than wraps, so a card
            keeps its height whatever the length of a cert id.
          */}
          <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 truncate font-mono text-[13px] font-semibold tracking-tight text-slate-900 sm:text-[15px]">
              {group.ssp_domain}, {group.publisher_id}, {group.relationship}
              {inlineCert && (
                <span className="font-normal text-slate-400">
                  , {inlineCert}
                </span>
              )}
            </code>
            {/* PROVENANCE, only when it is not the ordinary kind. A line
                found in the developer's own file needs no note; one that
                reached the report through an inventory-partner declaration,
                or through a subdomain's file, says so in words on the face.
                Violet is the suite's reserved IPD tone (--tone-special);
                the subdomain case is neutral, a fact and not a signal. */}
            {group.matched_via === "ipd" && (
              <span className="flex-shrink-0 rounded-full border border-special-border bg-special-bg px-2 py-0.5 text-[10px] font-medium text-special">
                via inventory partner
              </span>
            )}
            {group.matched_via === "subdomain" && (
              <span className="flex-shrink-0 rounded-full border border-neutral-border bg-neutral-bg px-2 py-0.5 text-[10px] font-medium text-neutral">
                subdomain file
              </span>
            )}
          </div>

          {/* One quiet line of reach, nothing else. The toned disc on the
              left already says which of the three things happened, so
              repeating it in a coloured chip was the same fact twice and
              put a second piece of colour on a card that only needs one. */}
          <div className="mt-1.5 truncate text-xs text-slate-500">
            {tone.preposition}{" "}
            <span className="font-mono tabular-nums text-slate-700">
              {count.toLocaleString()}
            </span>{" "}
            {count === 1 ? "publisher" : "publishers"}
            {/* THE FINDING, not the apology. "Newly monitored" alone says
                only that we started looking. When the book knows the line
                was already out there, say since when: that is the answer
                to the question the customer actually has, and it is only
                available because the book is watchlist-independent. */}
            {group.event === "first_appearance" && (
              <>
                {" · "}
                <span className="text-slate-600">
                  first appearance in your report
                </span>
              </>
            )}
            {group.event === "newly_monitored" && group.first_seen_at && (
              <>
                {" · "}
                <span className="text-slate-600">
                  already live since {formatSeen(group.first_seen_at)}
                </span>
              </>
            )}
          </div>

          {/* A cert rotation is inherently old to new, so it renders as
              old to new. */}
          {group.event === "cert_changed" && (
            <div className="mt-1.5 flex min-w-0 items-center gap-2">
              <span className="flex-shrink-0 text-[11px] text-slate-500">
                cert
              </span>
              <code className="min-w-0 truncate font-mono text-[11px] text-slate-400 sm:text-[12px]">
                {group.old_cert_id || "not set"}
              </code>
              <ArrowRight
                aria-hidden
                className="h-3 w-3 flex-shrink-0 text-warn"
              />
              <code className="min-w-0 truncate font-mono text-[11px] font-semibold text-slate-900 sm:text-[12px]">
                {group.new_cert_id || "not set"}
              </code>
            </div>
          )}
        </div>

        {/* Reserved columns rather than optional ones, so the figures stack
            into a column down the list instead of jittering card to card.
            A line event carries no previous-week count, so this is the one
            honest figure there is: how many publishers it moved on. */}
        <div className="hidden items-center gap-6 text-right sm:flex">
          <div className="w-[76px]">
            <MiniStat label="Publishers" value={count} emphasis />
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

      {/* THE SAME OPENING AS AN OVERVIEW ROW (David, 2026-10-27): the same
          eased Collapse, the same tinted body, the same heading, the same
          skeleton while the publishers load, and the same rows (the
          Overview's SeatLineRow, gutter numbers included). The card's
          disc keeps the event's tone; the body is the Overview's. */}
      <Collapse open={open}>
        <div className="border-t border-border bg-accent/30 px-4 pb-4 pt-3 sm:px-5">
          {/* Who vouched for this line's developer. One quiet sentence, not
              a list: the declarers are context on the match, not the roster
              the reader opened the card for. */}
          {group.ipd_declared_by.length > 0 && (
            <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
              declared inventory partner by {declaredBy(group.ipd_declared_by)}
            </p>
          )}
          {rosterError ? (
            <p role="alert" className="py-3 text-xs text-critical">
              {rosterError}
            </p>
          ) : rosterLoading || loadedPage !== publisherPage ? (
            <SeatLinesSkeleton
              rows={Math.min(4, Math.max(1, count - (publisherPage - 1) * ROSTER_PAGE))}
              label="Loading publishers"
            />
          ) : (
            <div>
              <SeatLinesHead
                title={tone.expandedTitle}
                count={count}
                // The list on screen is paged; anyone who needs to act on
                // the whole roster (chase a removal, brief a partner) needs
                // it in a spreadsheet.
                action={
                  <button
                    type="button"
                    onClick={downloadRoster}
                    disabled={exporting}
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm transition-colors hover:bg-muted"
                  >
                    <Download aria-hidden className="h-3 w-3" />
                    {exporting ? "Preparing…" : "Export"}
                  </button>
                }
              />
              <SeatLinesFrame>
                {publishers.map((p, i) => (
                  // Click the row: the line is copied and this publisher's
                  // file opens at it (David, 2026-10-06); a line that has
                  // left the file copies, and its file opens from the margin
                  // (as on the Overview). The domain itself links to their
                  // site.
                  <SeatLineRow
                    key={`${p.developer_id}|${p.file_kind}|${i}`}
                    // Numbered across the roster's pages: page 2 starts at 51.
                    n={(publisherPage - 1) * ROSTER_PAGE + i + 1}
                    digits={gutterDigits(count)}
                    line={{
                      ssp_domain: group.ssp_domain,
                      publisher_id: group.publisher_id,
                      relationship: group.relationship,
                      cert_id: inlineCert ?? undefined,
                      found_in: fileLabel(p.file_kind),
                      // The file is at its host (2026-10-21): a declared
                      // sub-domain's, or the publisher's own domain.
                      host: p.host ?? null,
                      date_source: p.date_source,
                    }}
                    publisherDomain={p.developer_domain}
                    gone={group.event === "removed" || group.event === "monitoring_stopped"}
                    label={
                      <div className="flex min-w-0 items-baseline gap-3">
                        {/* Never the internal id (David, 2026-10-06): the
                            domain, else the name, else a plain word. */}
                        <RowText as="span">
                          {p.developer_domain ? (
                            <PublisherDomainLink domain={p.developer_domain} />
                          ) : (
                            p.developer_name || "Unnamed publisher"
                          )}
                        </RowText>
                        {p.developer_domain && p.developer_name && (
                          <span className="hidden truncate text-[11px] text-slate-500 sm:inline">
                            {p.developer_name}
                          </span>
                        )}
                      </div>
                    }
                    notes={
                      <>
                        {/* Why, in the crawler's words, before the dates. */}
                        {group.event === "unconfirmed" && (
                          <RowNote tone="reason">{p.reason || "No reason recorded."}</RowNote>
                        )}
                        {/* WHY THE WATCH MOVED ON THIS FILE (2026-10-21): a
                            host's file read for the first time this crawl,
                            or not read this crawl. Said in plain words; a
                            change to the customer's list carries no reason
                            and says nothing here. */}
                        {(group.event === "newly_monitored" || group.event === "monitoring_stopped") &&
                          scopeReasonText(p.reason) && (
                            <RowNote tone="reason" data-line-reason>
                              {scopeReasonText(p.reason)}
                            </RowNote>
                          )}
                        {/* WHY THE LINE WAS REMOVED (2026-10-26): the line
                            left the file, or the file was not served.
                            Nothing on a report frozen before the crawler
                            said. */}
                        {group.event === "removed" && removalReasonText(p) && (
                          <RowNote tone="reason" data-removal-reason>
                            {removalReasonText(p)}
                          </RowNote>
                        )}
                      </>
                    }
                    // WHEN, per publisher (David, 2026-10-20): the dates are
                    // a fact of the read of THAT publisher's file.
                    dates={rowDates(p)}
                  />
                ))}
              </SeatLinesFrame>
            </div>
          )}
          {count > ROSTER_PAGE && (
            <Pager
              page={publisherPage}
              pageSize={ROSTER_PAGE}
              total={count}
              onPage={setPublisherPage}
              noun="publishers"
            />
          )}
        </div>
      </Collapse>
    </div>
  );
}

/* ── Tones ─────────────────────────────────────────────────────────── */

const TONES: Record<
  EventKind,
  {
    label: string;
    preposition: string;
    expandedTitle: string;
    disc: string;
    icon: typeof Plus;
    /** What the round icon means, shown on hover (owner, 2026-10-15). */
    hint: string;
  }
> = {
  added: {
    label: "Lines added",
    preposition: "to",
    expandedTitle: "Publishers that added this line",
    disc: "bg-ok-bg text-ok",
    icon: Plus,
    hint: "Line added: publishers started carrying it this week",
  },
  removed: {
    label: "Lines removed",
    preposition: "from",
    expandedTitle: "Publishers that dropped this line",
    disc: "bg-critical-bg text-critical",
    icon: Minus,
    hint: "Line removed: publishers dropped it this week",
  },
  cert_changed: {
    label: "Cert changes",
    preposition: "on",
    expandedTitle: "Publishers carrying the new cert",
    disc: "bg-warn-bg text-warn",
    icon: RefreshCw,
    hint: "Cert changed: publishers changed this line's cert ID this week",
  },
  // Toned neutral on purpose. These are not good or bad news about the
  // market, they are a note about what we were looking at, and giving them
  // the green of an addition would put them back in the column this whole
  // distinction exists to keep them out of.
  newly_monitored: {
    // Plain verbs, not system vocabulary. "Monitored" is how the operator
    // view talks about its own machinery; a customer reading their own
    // report is being told what THEY did to their list (David, 2026-09-26).
    label: "Started watching",
    preposition: "on",
    expandedTitle: "Publishers carrying this line in its first week",
    // Blue, not the green of "added" (David, 2026-10-05): a change to
    // the customer's own list, kept visibly apart from market news.
    disc: "bg-info-bg text-info",
    icon: Eye,
    hint: "Started watching: you added this line to your list this week",
  },
  monitoring_stopped: {
    label: "Stopped watching",
    preposition: "on",
    expandedTitle: "Publishers that carried this line when we last looked",
    // Amber, not the red of "removed" (David, 2026-10-05): worth noticing,
    // but the publishers still carry these lines.
    disc: "bg-warn-bg text-warn",
    icon: EyeOff,
    hint: "Stopped watching: you took this line off your list this week",
  },
  // Neutral for the same reason as the two above: this is news about our
  // crawl, not about the market, and colouring it as a gain would put it
  // back in the column it was carefully kept out of.
  first_appearance: {
    label: "First appearance",
    preposition: "on",
    expandedTitle: "Publishers appearing in your report for the first time",
    disc: "bg-muted text-muted-foreground",
    icon: Sparkles,
    hint: "First appearance: these publishers are in your report for the first time",
  },
  // Neutral, like the three above: not a verdict on the market, only on
  // our read of it. Green or red here would be the very claim the kind
  // exists to avoid.
  unconfirmed: {
    label: "Unconfirmed",
    preposition: "on",
    expandedTitle: "Publishers whose file could not be verified for this line",
    disc: "bg-muted text-muted-foreground",
    icon: CircleHelp,
    hint: "Unconfirmed: the crawler could not verify this line this crawl, so it is kept as matched",
  },
};

/**
 * One line's publisher roster, as a CSV download.
 *
 * Requested only on an explicit export click. Every roster page must
 * reconcile to the group's full count before a CSV can be downloaded.
 * Frozen artifact reads work while the crawl database is asleep.
 */
function exportPublishers(group: ChangeGroup, publishers: LineEvent[]) {
  const line = [
    group.ssp_domain,
    group.publisher_id,
    group.relationship,
    group.new_cert_id ?? group.old_cert_id ?? "",
  ]
    .filter(Boolean)
    .join(", ");
  // THE DATES RIDE ALONG (David, 2026-10-20), as the ISO UTC the API
  // sent, one column each, only the ones this kind of change has.
  const iso = (v: string | null | undefined) => v ?? "";
  const dated: [string, (p: LineEvent) => string][] =
    group.event === "removed"
      ? [
          ["last_seen_at", (p) => iso(p.last_seen_at)],
          ["not_found_at", (p) => iso(p.not_found_at)],
          ["date_source", (p) => iso(p.date_source)],
        ]
      : group.event === "added"
        ? [
            ["first_seen_at", (p) => iso(p.first_seen_at)],
            [
              "last_absent_at",
              (p) =>
                p.last_absent_at === null
                  ? "not read in the compared crawl"
                  : iso(p.last_absent_at),
            ],
            ["date_source", (p) => iso(p.date_source)],
          ]
        : group.event === "cert_changed"
          ? [
              ["seen_at", (p) => iso(p.seen_at)],
              ["date_source", (p) => iso(p.date_source)],
            ]
          : group.event === "unconfirmed"
            ? [
                ["reason", (p) => iso(p.reason)],
                ["last_seen_at", (p) => iso(p.last_seen_at)],
                ["read_at", (p) => iso(p.read_at)],
                ["verified_at", (p) => iso(p.verified_at)],
                ["tries", (p) => (p.tries == null ? "" : String(p.tries))],
              ]
            : group.event === "newly_monitored" ||
                group.event === "monitoring_stopped"
              ? [["reason", (p) => iso(p.reason)]]
              : [];
  // The file's host rides along too (2026-10-21): the declared sub-domain
  // whose app-ads.txt holds the line, or the publisher's own domain.
  const header = [
    "publisher_domain",
    "publisher_name",
    "file",
    "host",
    "change",
    "line",
    ...dated.map(([name]) => name),
  ];
  const body = publishers.map((p) => [
    p.developer_domain ?? "",
    p.developer_name ?? "",
    fileLabel(p.file_kind),
    p.host ?? "",
    TONES[group.event].label,
    line,
    ...dated.map(([, read]) => read(p)),
  ]);
  const csv = [header, ...body]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${group.event.replace(/_/g, "-")}-${group.ssp_domain}-${group.publisher_id}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ── Grouping ──────────────────────────────────────────────────────── */

/** The declarer roster as a sentence fragment. Cut at five: past that the
 *  useful fact is the count, not the names, and the API itself caps the
 *  list at 25 so "and N more" is measured against what was sent. */
function declaredBy(domains: string[]): string {
  const shown = domains.slice(0, 5);
  const more = domains.length - shown.length;
  return more > 0
    ? `${shown.join(", ")} and ${more.toLocaleString()} more`
    : shown.join(", ");
}

/** "12 Jul 2026" — a month and a year, because the useful fact is how
 *  LONG this has been true, and a precise day implies a precision the
 *  weekly crawl cadence does not have. */
function formatSeen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "an earlier crawl"
    : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** True for the kinds that mean the watchlist moved rather than the world. */
/** Kinds that describe OUR coverage rather than the market: we started or
 *  stopped watching a line, or met a publisher for the first time. None of
 *  them carries a week-over-week delta, because in each case there is no
 *  honest previous number to be a percentage of. */
function isScopeKind(event: EventKind): boolean {
  return (
    event === "newly_monitored" ||
    event === "monitoring_stopped" ||
    event === "first_appearance"
  );
}

/* ── Helpers ───────────────────────────────────────────────────────── */

/**
 * The customer-facing name of the file a line was found in. The API speaks
 * an enum ("app_ads_txt"); a publisher's file is called app-ads.txt.
 */
export function fileLabel(kind: string): string {
  const k = kind.toLowerCase().replace(/[^a-z]/g, "");
  if (k === "appadstxt") return "app-ads.txt";
  if (k === "adstxt") return "ads.txt";
  return kind;
}

/** Display the API's explanation as a sentence, never its JSON envelope. */
function changeErrorMessage(error: Error): string {
  try {
    const detail = JSON.parse(error.message)?.detail;
    return typeof detail === "string"
      ? detail
      : "Could not load this change. Please try again.";
  } catch {
    return error.message;
  }
}
