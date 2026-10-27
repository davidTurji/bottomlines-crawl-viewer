import InactiveSection, { type InactiveCards } from "@/components/InactiveSection";
import LockedTail from "@/components/LockedTail";
import { MiniStat } from "@/components/MiniStat";
import { Collapse, Settle, glideTo } from "@/components/Motion";
import TrialBanner from "@/components/TrialBanner";
import {
  OverviewSkeleton,
  Skeleton,
  SkeletonRows,
  SkeletonStatCards,
  skeletonRowCount,
} from "@/components/Skeleton";
import { expectedRows, knownKey, type Landed } from "@/lib/expectedRows";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BEAT_PAUSE_MS, CountUp, landsAfterMs, payoffStyle } from "@/components/CountUp";
import { LineFilter } from "@/components/LineFilter";
import { HoverHint } from "@/components/HoverHint";
import {
  appSubject,
  IpdChip,
  IpdInconclusiveNote,
  IpdWhere,
  MatchTypeControl,
} from "@/components/MatchType";
import { PAGE_SIZE } from "@/lib/paging";
import { usePageCache } from "@/lib/pageCache";
import { useLineFilter } from "@/lib/lineFilter";
import { Link } from "react-router-dom";
import { ChevronDown, Download, Globe, Search, Smartphone } from "lucide-react";
import {
  type TrialCaps, type TrialSlice,
  api,
  ApiError,
  ENABLE_CHAT,
  MOCK,
  type ExportInfo,
  type Summary,
  type DeveloperEvent,
  type MatchedDeveloper,
  type MatchedApp,
  type MatchedAppsPage,
  type AppChange,
  type MatchedSeatLine,
  type LineEvent,
  type IpdInconclusive,
  type MatchTypeCounts,
  type MatchTypeFields,
  type MatchTypeFilter,
  type ListChange,
  type FoundInCounts,
  type FoundInFilter,
  type PlatformCounts,
  type PlatformFilter,
  type MatchedMove,
  type MatchedMoves,
  type InactiveApp,
  type InactiveCounts,
  type InactiveKind,
  type InactivePublisher,
  type InactivePublisherLine,
} from "../lib/api";
import { inactiveCountsOf, inactiveDay, inactiveTotal, reasonText } from "@/lib/inactive";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyResult,
  Pager,
  usePaging,
  TruncatedNotice,
} from "@/components/ListControls";
import { Card } from "@/components/ui/card";
import InlineAskAI from "@/components/InlineAskAI";
import { PageShell } from "@/components/PageShell";
import { formatWeek } from "@/components/WeekLine";
import { appFileLine, cn, fileHostsLabel, foundInLabel, lineHostLabel, scopeReasonText, storeLabel } from "@/lib/utils";
import {
  addedDates,
  certDates,
  dateTitle,
  formatDateTime,
  removedDates,
  removalReasonText,
  unconfirmedDates,
  unconfirmedSentence,
  WEEKLY_READ_NOTE,
} from "@/lib/changeDates";
import {
  ActionableLine,
  CopyableLine,
  FoundInLinks,
  PartnerLinks,
  PublisherAvatarLink,
  PublisherDomainLink,
} from "@/components/PublisherLinks";
import { groupSeatLines, placeKey, seatKey } from "@/lib/seatLineGroups";
import {
  allCertChanges,
  certChangeOf,
  type CertChanges,
  isScopeTab,
  eachPage,
  READ_PAGE,
  rowCertChanges,
  WATCH_CHANGE,
  watchEvents,
  type Progress,
  type ScopeTab,
} from "@/lib/scopeRows";
import { csvName, ExportListButton, type CsvCell, type CsvSink } from "@/components/ExportList";
import { FoundInControl, PlatformControl } from "@/components/PlatformControl";
import { useReportScope } from "@/lib/reportScope";
import { PopularBar, type PopularChoice } from "@/components/PopularBar";
import {
  gutterDigits,
  LineNo,
  ROW_MARGIN,
  RowNote,
  RowText,
  SEAT_ROW,
  SeatLinesFrame,
  SeatLinesHead,
  SeatLinesSkeleton,
} from "@/components/SeatLines";

const OVERVIEW_SUGGESTIONS = [
  "What lines were added this week?",
  "Which publisher lost the most?",
  "Which SSP moved the most on my seats?",
  "Are any of my seats unauthorized?",
];

/**
 * OVERVIEW page, "Your weekly crawl".
 *
 * Layout mirrors bottomlines-app's PerformanceDashboard "Your Bottom Line"
 * template: a page header with a date chip, then two side-by-side hero
 * cards (this week's changes + since your crawl started), a horizontal
 * segmented bar with labelled chips underneath the left card, and an
 * inline Ask AI composer with suggestion chip buttons that grows an
 * answer thread inline below. The Developer drilldown table follows.
 *
 * Class strings for the hero cards, the segmented bar, and the AI
 * composer are lifted verbatim from PerformanceDashboard.tsx and
 * AskAIComposer.tsx so the visual reads identical to the console.
 */

export default function CrawlReport() {
  const { token } = useReportScope();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [previous, setPrevious] = useState<Summary | null>(null);
  // What Export hands over; the safe default until it answers.
  const [exportInfo, setExportInfo] = useState<ExportInfo>({
    format: "xlsx",
    line_export: false,
  });
  const [error, setError] = useState<string | null>(null);
  // Which matched list the section below shows. The two matched-inventory
  // cards act as its selector; publishers is the default.
  const [matchedView, setMatchedView] = useState<ListView>("publishers");
  // The list's tab lives here, not in the list, so the "Lines added" and
  // "Lines removed" cards can open it on Added or Removed.
  const [drillTab, setDrillTab] = useState<DrillTab>("all");
  // Which Inactive list is open (Publishers or Apps). The page's, so it
  // survives switching views; picking a view picks its own list.
  const [inactiveKind, setInactiveKind] = useState<InactiveKind>("publishers");
  // Match type (All / Own / IPD, crawler #348). The page's, like the tab,
  // so it survives switching between publishers and apps. Never anything
  // but "all" on a report without match types: the pills that change it
  // only show when the list says how it splits.
  const [matchType, setMatchType] = useState<MatchTypeFilter>("all");
  // Found in (publishers) and Platform (apps), the page's like match type,
  // so they survive the switches; only ever set while the list says how it
  // splits by them.
  const [foundIn, setFoundIn] = useState<FoundInFilter>("all");
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  /** Shows a list; the tab stays (owner rule: tabs survive the publishers
   *  / apps switch), unless a tab is asked for. */
  const showView = (view: ListView, tab?: DrillTab) => {
    if (tab) setDrillTab(tab);
    setMatchedView(view);
    setInactiveKind(view);
  };
  const pickView = (view: ListView) => showView(view);
  // Bumped by those two cards: the list opens its first row once it has
  // landed, so the reader sees the lines the card counted, not just names.
  const [openFirst, setOpenFirst] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const showLinesOf = (tab: "added" | "removed") => {
    setDrillTab(tab);
    setOpenFirst((n) => n + 1);
    glideTo(listRef.current);
  };
  /** The quiet line's "See them": the Inactive tab, on a list that has rows. */
  const showInactive = (counts: InactiveCounts) => {
    setDrillTab("inactive");
    setInactiveKind(counts[matchedView] > 0 ? matchedView : matchedView === "publishers" ? "apps" : "publishers");
    glideTo(listRef.current);
  };
  /* THE SEAT-LINE FILTER. In the URL, so it survives a refresh and follows
     the reader across the lists. When set, the summary's matched
     counters, the publisher list and the app list are all re-read under
     it, so the two headline numbers and the rows beneath agree. */
  const { selected: lines, setSelected: setLines } = useLineFilter();
  // Which selection the summary on screen was read under. While it lags
  // the URL the numbers are last selection's and the cards dim a little;
  // they never blank, so nothing above the list jumps.
  const linesKey = lines.join(",");
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const refreshing = summary != null && settledFor !== linesKey;

  useEffect(() => {
    let cancelled = false;
    api
      .summary(token, lines)
      .then((s) => {
        if (!cancelled) {
          setSummary(s);
          setSettledFor(linesKey);
        }
      })
      .catch((e: ApiError) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, lines, linesKey]);

  // What Export hands over does not take the line filter either.
  useEffect(() => {
    let cancelled = false;
    api.exportInfo(token).then((info) => {
      if (!cancelled) setExportInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // LAST WEEK'S SUMMARY DOES NOT TAKE THE LINE FILTER, so it belongs in its
  // own effect keyed on the token alone. It used to sit in the one above
  // and be re-read on every change of selection — and it is two round
  // trips, not one (it reads this crawl's summary to learn the previous
  // crawl's id, then reads that). Under the filter that was two thirds of
  // the requests a tick fired, every one of them for an answer already in
  // state and identical to the last.
  useEffect(() => {
    let cancelled = false;
    api
      .previousSummary(token)
      .then((p) => {
        if (!cancelled) setPrevious(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  // POPULAR (David, 2026-10-27): the counts come first, so a choice whose
  // list is empty is never offered.
  const popularCounts = usePopularCounts(token, lines, summary);
  const [popular, setPopular] = useState<PopularId | null>(null);
  // Bumped by a Popular choice: the lists clear their search.
  const [searchReset, setSearchReset] = useState(0);
  const popularState = { view: matchedView, tab: drillTab, matchType };
  // Any filter changed by hand clears the highlighted choice.
  useEffect(() => {
    if (popular && !targetMatches(POPULAR[popular].target, popularState)) setPopular(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popular, matchedView, drillTab, matchType]);
  const pickPopular = (raw: string) => {
    const id = raw as PopularId;
    const t = POPULAR[id].target;
    if (popular === id) {
      // A second press clears it: the list back to All.
      setPopular(null);
      setDrillTab("all");
      setMatchType("all");
      return;
    }
    showView(t.view, t.tab);
    setMatchType(t.matchType);
    // The choice's count is its whole tab: no search, no file or platform
    // split left on from before (review of #75).
    setFoundIn("all");
    setPlatform("all");
    setSearchReset((n) => n + 1);
    setPopular(id);
    glideTo(listRef.current);
  };

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Card className="border-critical-border bg-critical-bg p-6 text-center">
          <h1 className="font-display text-lg font-semibold text-critical">
            Could not load this report
          </h1>
          <p className="mt-2 text-sm">{error}</p>
        </Card>
      </div>
    );
  }

  if (!summary) {
    return (
      <PageShell className="space-y-5">
        <OverviewSkeleton />
      </PageShell>
    );
  }

  // The two crawls this report compares. The summary says when each ran
  // (``crawl_at``, ``compared_crawl_at``) on every report frozen since
  // 2026-10-08; an older one falls back to this crawl's finished_at and last
  // week's summary's finished_at.
  const crawlAt = validDate(summary.crawl_at ?? summary.finished_at);
  const comparedAt = validDate(summary.compared_crawl_at ?? previous?.finished_at);

  const added = summary.hero_diff.line_totals.added;
  const removed = summary.hero_diff.line_totals.removed;
  const certChanged = summary.hero_diff.line_totals.cert_changed;

  const matchedDevs = summary.counters.matched.developers;
  const matchedApps = summary.counters.matched.apps;
  // Under a seat-line filter every current figure is a slice while last
  // week's summary is the whole week, so a delta would compare unlike
  // things ("-97%"). No delta is the honest answer there.
  const filtered = lines.length > 0;
  const prevMatchedDevs = filtered ? null : (previous?.counters.matched.developers ?? null);
  const prevMatchedApps = filtered ? null : (previous?.counters.matched.apps ?? null);
  // Found and lost behind the net, when the report carries them (David,
  // 2026-10-05: "+351" alone hides the 380 we found). Never under a filter.
  const moves = filtered ? null : (summary.counters.matched_moves ?? null);

  // Last week's OWN added/removed totals, so "+32 lines added" can say
  // whether 32 is a busy week or a quiet one. Comparing this week's added
  // against last week's added is like for like; comparing it against last
  // week's matched inventory would not be.
  const prevAdded = filtered ? null : (previous?.hero_diff.line_totals.added ?? null);
  const prevRemoved = filtered ? null : (previous?.hero_diff.line_totals.removed ?? null);

  // Matched growth, week over week, shown on the publisher and app cards.
  // Computed straight from this crawl's matched counters against last week's,
  // with the same computeDelta the rest of the page uses. Null when there is
  // no prior week to compare against.
  const matchedDevsDelta =
    prevMatchedDevs != null ? computeDelta(matchedDevs, prevMatchedDevs) : null;
  const matchedAppsDelta =
    prevMatchedApps != null ? computeDelta(matchedApps, prevMatchedApps) : null;

  // THE FIRST CRAWL HAS NO LAST WEEK, and every "relative to last week"
  // caption on this page is a false statement until there is one. The
  // deltas were already suppressed (the API sends no previous summary), so
  // what was left was captions promising a comparison that is not there and
  // a pair of zeros presented as this week's result.
  const isFirstCrawl = summary.previous_job_id === null;

  // UNTIL WHEN THE DATA IS CURRENT (David, 2026-10-20). Files are read once
  // a week, so the report is a comparison of two reads, and the header
  // says both to the minute. "First report" is claimed only when the crawl
  // itself reports no predecessor: a compared date can also be missing
  // because last week's summary failed to load, and that is not a first
  // report.
  const currentLine = (() => {
    const current = formatDateTime(crawlAt);
    const compared = formatDateTime(comparedAt);
    if (!current) return `Crawl #${summary.crawl_id}, crawl dates not available.`;
    // The crawl's own word comes first: a first report's summary carried a
    // compared date from the Inactive window (which starts at the previous
    // crawl even then), and the page said "compared with the crawl of ..."
    // over a pair of zeros while the workbook said "None, first report"
    // (Select One Off, report 328, 2026-10-20).
    if (isFirstCrawl) return `Data current as of ${current}. First report, nothing to compare with yet.`;
    if (compared) return `Data current as of ${current}, compared with the crawl of ${compared}.`;
    return `Data current as of ${current}.`;
  })();

  // UNCONFIRMED (2026-10-20): lines the crawler could not verify. Never in
  // added or removed, never a card: one quiet line under this week's
  // changes, and a tab on the Changes page. Missing on older reports is 0.
  const unconfirmed = summary.hero_diff.line_totals.unconfirmed ?? 0;

  // INACTIVE (2026-10-08): the headline numbers count active only; what
  // stopped counting is a tab of the list and one quiet line, never a card.
  // An older link without the section counts from its No longer live block.
  const inactiveCounts = inactiveCountsOf(summary);
  const hasInactive = inactiveTotal(inactiveCounts) > 0;
  // The tab exists only while something is inactive; a page left on it
  // (a filter, an older link) reads as All matched rather than a tab-less list.
  const listTab: DrillTab = drillTab === "inactive" && !hasInactive ? "all" : drillTab;
  // A report covers the window between its two crawls, and the Inactive
  // section lists what went inactive in it: since the compared crawl (the
  // same date the header says it is compared with).
  const inactiveSince = comparedAt ? `since ${formatWeek(comparedAt)}` : "since the compared crawl";
  const inactive = inactiveCounts && hasInactive
    ? {
        counts: inactiveCounts,
        kind: inactiveKind,
        setKind: setInactiveKind,
        legacy: summary.gone,
        since: inactiveSince,
      }
    : null;

  // TWO BEATS (David, 2026-10-05): the left card's line figures count up
  // first, and the matched publishers and apps start a second after those
  // have landed, so the first pair is seen settled. A first crawl has no line figures, so they go straight away.
  const secondBeat = isFirstCrawl ? 0 : landsAfterMs() + BEAT_PAUSE_MS;

  const popularChoices: PopularChoice[] = popularCounts
    ? POPULAR_ORDER.flatMap((id) => {
        const n = popularCounts[id];
        return typeof n === "number" && n > 0 ? [{ id, label: POPULAR[id].label, count: n }] : [];
      })
    : [];
  const popularActive = popular;
  // The same counts, for the lists' skeletons: a choice, or the tab it
  // opens, lands with this many rows (lib/expectedRows).
  const knownFor = (view: ListView): Record<string, number> => {
    const out: Record<string, number> = {};
    if (popularCounts)
      for (const id of POPULAR_ORDER) {
        const n = popularCounts[id];
        const t = POPULAR[id].target;
        if (t.view === view && typeof n === "number") out[knownKey(t.tab, t.matchType, lines.join(","))] = n;
      }
    return out;
  };

  return (
    <PageShell className="space-y-5">
      {/* Page header. One line summary of what got scanned, no floating
          date chip. The h1 and its subtitle already carry the week. The
          export sits top right, the one action this page offers. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0" data-tour="overview-header">
          <h1 className="font-display text-xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            Your weekly crawl
          </h1>
          <p className="mt-1 text-sm text-slate-500">{currentLine}</p>
          {refreshing ? (
            // The figures below are reloading for a new line selection;
            // a sentence about the old one would be wrong for a moment.
            <div aria-hidden className="mt-3 h-5 w-full max-w-md animate-pulse rounded bg-muted" />
          ) : (
            <WeeklyWin
              publishers={matchedDevs}
              apps={matchedApps}
              publishersDelta={matchedDevsDelta}
              appsDelta={matchedAppsDelta}
              moves={moves}
              firstCrawl={isFirstCrawl}
              filtered={filtered}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LineFilter
            seats={summary.watchlist?.seats ?? []}
            selected={lines}
            onChange={setLines}
            busy={refreshing}
          />
          {exportInfo.format !== "none" && (
            <ExportResultsButton
              token={token}
              summary={summary}
              lines={lines}
              info={exportInfo}
            />
          )}
        </div>
      </div>
      {/* Reserved whether or not a filter is on, so toggling one never
          pushes the cards below down and back up. */}
      {summary.trial && <TrialBanner caps={summary.trial} summary={summary} />}
      <p className="-mt-2 min-h-[18px] text-[12px] leading-[18px] text-slate-500">
        {lines.length > 0 && (
          <>
            Showing only publishers and apps carrying{" "}
            <span className="font-mono text-slate-700">
              {lines.length === 1 ? "the selected line" : `${lines.length} selected lines`}
            </span>
            . Line totals and the week&apos;s changes follow the same filter
            {exportInfo.line_export ? ", and so does Export." : ". Export gives the full report."}
          </>
        )}
        {/* The one exception to "Export is an Excel", said before the click
            (David, 2026-09-28: it must not be confusing at all), whenever
            Export hands over the full report: no filter, or a filter this
            report cannot be cut by. */}
        {(lines.length === 0 || !exportInfo.line_export) && exportInfo.format === "zip" && (
          <span className="text-critical">
            {lines.length > 0 && " "}
            {zipExplanation(exportInfo)}
          </span>
        )}
      </p>

      {/* Two hero cards, side by side. Left = this week's plus/minus
          lines. Right = matched inventory, as two premium tone tiles:
          publishers in green, apps in pink. */}
      {/* APPLYING A LINE FILTER RE-READS THE WHOLE REPORT, so it gets the
          same skeleton a cold load gets. These cards used to dim to 60%
          and keep last selection's figures on screen, which reads as a
          page that is merely faded, not one whose numbers are being
          replaced — and the figures under the fade were answers to a
          question the reader had already changed. */}
      {refreshing ? (
        <SkeletonStatCards count={2} />
      ) : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div
          className="rounded-2xl border border-border bg-white p-5 shadow-sm"
          data-tour="overview-changes"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <div className="font-display text-sm font-medium text-slate-700">
                This week&apos;s changes
              </div>
              <div className="text-[11px] text-slate-500">
                {isFirstCrawl
                  ? "Your first crawl"
                  : filtered
                    ? "Under the selected lines"
                    : "Relative to last week"}
              </div>
            </div>
            <span className="text-xs text-slate-500">
              {isFirstCrawl ? "baseline" : `${certChanged.toLocaleString()} cert changes`}
            </span>
          </div>
          {/* A first crawl has nothing to have changed FROM, so "+0 added,
              -0 removed" is not a result, it is the absence of one — and as
              the first thing a new customer reads it looks like the product
              found nothing. Say what actually happened instead: this week is
              the baseline, and the comparison starts next week. */}
          {isFirstCrawl ? (
            <div className="rounded-xl border border-border bg-muted/30 px-5 py-6 text-center">
              <div className="text-sm font-medium text-slate-700">
                This is the first crawl, with no prior week
              </div>
              <div className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-slate-500">
                There is nothing to compare against yet. Everything found this
                week is your starting point, and from the next crawl on this
                panel shows what publishers added, dropped and re-certified
                against it.
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border border-border">
            <SplitStat
              tone="ok"
              prefix="+"
              number={added}
              label="Lines added"
              delta={prevAdded != null ? computeDelta(added, prevAdded) : null}
              note={filtered ? "under the selected lines" : undefined}
              active={drillTab === "added"}
              onClick={() => showLinesOf("added")}
            />
            <SplitStat
              tone="critical"
              prefix="-"
              number={removed}
              label="Lines removed"
              delta={
                prevRemoved != null ? computeDelta(removed, prevRemoved) : null
              }
              note={filtered ? "under the selected lines" : undefined}
              active={drillTab === "removed"}
              onClick={() => showLinesOf("removed")}
            />
          </div>
          )}
          {/* A side finding is a line, never a card (David, 2026-10-20):
              what could not be checked sits under the figures it is kept
              out of, in the same quiet voice as the inactive line. */}
          {!isFirstCrawl && unconfirmed > 0 && (
            <p data-testid="unconfirmed-quiet" className="mt-3 text-[12px] leading-snug text-slate-500">
              {unconfirmedSentence(unconfirmed)}
            </p>
          )}
        </div>

        <div
          className="rounded-2xl border border-border bg-white p-5 shadow-sm"
          data-tour="overview-matched"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <div className="font-display text-sm font-medium text-slate-700">
                Matched inventory
              </div>
              <div className="text-[11px] text-slate-500">
                {isFirstCrawl
                  ? "First crawl, no prior week to compare against"
                  : filtered
                    ? "Under the selected lines"
                    : "Relative to last week"}
              </div>
            </div>
            <span className="text-xs text-slate-500">
              {summary.counters.matched.lines.toLocaleString()} lines total
            </span>
          </div>
          {/* Two tiles that double as the selector for the list below:
              publishers in the brand's racing green, apps in pink. THE SAME
              SPLIT AS THE LEFT CARD (David, 2026-10-25): one bordered box,
              a hairline between, the same padding, so all four tiles are
              the same width to the pixel and the two hero panels line up.
              Click one to switch the list underneath; the selected tile
              carries its tint. */}
          <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border border-border">
            <MatchedTile
              tone="publisher"
              icon={Globe}
              number={matchedDevs}
              label="Matched publishers"
              delayMs={secondBeat}
              delta={matchedDevsDelta}
              previous={prevMatchedDevs}
              move={moves?.developers ?? null}
              note={filtered ? "under the selected lines" : undefined}
              active={matchedView === "publishers"}
              // The tab stays (David, 2026-10-07): Added on publishers
              // is Added on apps, never a silent jump back to All matched.
              onClick={() => pickView("publishers")}
            />
            <MatchedTile
              tone="app"
              icon={Smartphone}
              number={matchedApps}
              label="Matched apps"
              delayMs={secondBeat}
              delta={matchedAppsDelta}
              previous={prevMatchedApps}
              move={moves?.apps ?? null}
              note={filtered ? "under the selected lines" : undefined}
              active={matchedView === "apps"}
              // The tab stays (David, 2026-10-07): Added on publishers
              // is Added on apps, never a silent jump back to All matched.
              onClick={() => pickView("apps")}
            />
          </div>
          {inactive && (
            <InactiveQuietLine
              counts={inactive.counts}
              since={inactive.since}
              filtered={filtered}
              onShow={() => showInactive(inactive.counts)}
            />
          )}
        </div>
      </div>
      )}

      {/* Ask AI, inline, between the KPIs and the drilldown. Same shape
          bottomlines-app uses on the "Your Bottom Line" page: pill input
          with a sparkle glyph + horizontal suggestion rail; answers grow
          in a thread below the composer. Gated off by default: the MVP
          backend has no chat endpoint. Set VITE_ENABLE_CHAT=true (e.g.
          alongside VITE_MOCK=true) to bring it back. */}
      {ENABLE_CHAT && (
        <InlineAskAI
          token={token}
          suggestions={OVERVIEW_SUGGESTIONS}
          placeholder="Ask about your crawl"
        />
      )}

      {/* The matched list. Which one shows is driven by the two cards above:
          publishers by default, apps when the pink card is selected. Both are
          card-per-row lists in the same grammar as bottomlines-app's
          HierarchyCard: colored disc, generous padding, right-aligned stats,
          tinted expansion. Publishers are green, apps are pink. */}
      {/* POPULAR (David, 2026-10-27): one click sets the list below to a
          view readers ask for; only choices whose list has rows. */}
      <PopularBar
        choices={popularChoices}
        active={popularActive}
        onPick={pickPopular}
        loading={popularCounts === undefined}
      />

      {/* The matched list. Which one shows is driven by the two cards above:
          publishers by default, apps when the pink card is selected. Both are
          card-per-row lists in the same grammar as bottomlines-app's
          HierarchyCard: colored disc, generous padding, right-aligned stats,
          tinted expansion. Publishers are green, apps are pink. */}
      <div data-tour="overview-list" ref={listRef} className="scroll-mt-6">
        <ListHead
          inactive={listTab === "inactive"}
          title={VIEW_TITLE[matchedView].title}
          blurb={VIEW_TITLE[matchedView].blurb}
        />
        {matchedView === "publishers" ? (
          <DrilldownList
            token={token}
            lines={lines}
            caps={summary.trial ?? null}
            inactive={inactive}
            tab={listTab}
            setTab={setDrillTab}
            openFirst={openFirst}
            matchType={matchType}
            setMatchType={setMatchType}
            foundIn={foundIn}
            setFoundIn={setFoundIn}
            searchReset={searchReset}
            known={knownFor("publishers")}
          />
        ) : (
          <MatchedAppsList
            token={token}
            lines={lines}
            caps={summary.trial ?? null}
            inactive={inactive}
            tab={listTab}
            setTab={setDrillTab}
            openFirst={openFirst}
            matchType={matchType}
            setMatchType={setMatchType}
            platform={platform}
            setPlatform={setPlatform}
            searchReset={searchReset}
            known={knownFor("apps")}
          />
        )}
      </div>
    </PageShell>
  );
}

/**
 * THE WEEK'S WIN, IN ONE SENTENCE, under the page title: what the crawl
 * found for the customer, said before any card asks them to read a number.
 * Leads with growth when there is growth ("we found 351 more publishers"),
 * and otherwise says plainly how much carries their seats, so it is never
 * a boast the figures below contradict. The figures wear their tiles'
 * colours, publishers green and apps pink.
 */
function WeeklyWin({
  publishers,
  apps,
  publishersDelta,
  appsDelta,
  moves,
  firstCrawl,
  filtered,
}: {
  publishers: number;
  apps: number;
  publishersDelta: Delta | null;
  appsDelta: Delta | null;
  /** Found / lost from the report, when it carries them: the headline then
   *  says how many we FOUND, not the net. */
  moves: MatchedMoves | null;
  firstCrawl: boolean;
  filtered: boolean;
}) {
  const fig = (n: number, cls: string) => (
    <span className={cn("font-semibold tabular-nums", cls)}>{n.toLocaleString()}</span>
  );
  const pub = (n: number) => fig(n, "text-primary");
  const app = (n: number) => fig(n, "text-app");
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const morePubs = publishersDelta && publishersDelta.abs > 0 ? publishersDelta.abs : 0;
  const moreApps = appsDelta && appsDelta.abs > 0 ? appsDelta.abs : 0;
  const foundPubs = moves?.developers?.found ?? 0;
  const foundApps = moves?.apps?.found ?? null;

  let line: ReactNode;
  if (filtered) {
    line = (
      <>
        {pub(publishers)} {plural(publishers, "publisher", "publishers")} and {app(apps)}{" "}
        {plural(apps, "app", "apps")} carry the selected lines.
      </>
    );
  } else if (firstCrawl) {
    line = (
      <>
        Your first crawl found {pub(publishers)} {plural(publishers, "publisher", "publishers")} and{" "}
        {app(apps)} {plural(apps, "app", "apps")} carrying your seats.
      </>
    );
  } else if (moves && (foundPubs > 0 || (foundApps ?? 0) > 0)) {
    // What we FOUND, not the net: the value of the week (David, 2026-10-05).
    line =
      foundPubs === 0 ? (
        <>
          This week we found {app(foundApps ?? 0)} new {plural(foundApps ?? 0, "app", "apps")}{" "}
          carrying your seats, across {pub(publishers)} {plural(publishers, "publisher", "publishers")}.
        </>
      ) : foundApps != null && foundApps > 0 ? (
        <>
          This week we found {pub(foundPubs)} new {plural(foundPubs, "publisher", "publishers")} and{" "}
          {app(foundApps)} new {plural(foundApps, "app", "apps")} carrying your seats.
        </>
      ) : (
        <>
          This week we found {pub(foundPubs)} new {plural(foundPubs, "publisher", "publishers")}{" "}
          carrying your seats, {app(apps)} {plural(apps, "app", "apps")} in all.
        </>
      );
  } else if (morePubs > 0 && moreApps > 0) {
    line = (
      <>
        This week we found {pub(morePubs)} more {plural(morePubs, "publisher", "publishers")} and{" "}
        {app(moreApps)} more {plural(moreApps, "app", "apps")} carrying your seats.
      </>
    );
  } else if (morePubs > 0 || moreApps > 0) {
    line = morePubs > 0 ? (
      <>
        This week we found {pub(morePubs)} more {plural(morePubs, "publisher", "publishers")}{" "}
        carrying your seats, {app(apps)} {plural(apps, "app", "apps")} in all.
      </>
    ) : (
      <>
        This week we found {app(moreApps)} more {plural(moreApps, "app", "apps")} carrying your
        seats, across {pub(publishers)} {plural(publishers, "publisher", "publishers")}.
      </>
    );
  } else {
    line = (
      <>
        {pub(publishers)} {plural(publishers, "publisher", "publishers")} and {app(apps)}{" "}
        {plural(apps, "app", "apps")} carry your seats this week.
      </>
    );
  }
  return (
    <p className="mt-3 max-w-3xl text-[15px] leading-snug text-slate-700 sm:text-base">
      {line}
    </p>
  );
}

/**
 * Two big numbers side by side inside a hero card, divided by a hairline.
 * Same visual weight both sides so the eye reads them as peers.
 */
/** A delta chip: green ▲ or red ▼ with signed integer + percentage. */
export type Delta = { abs: number; pct: number };

export function computeDelta(current: number, previous: number): Delta {
  const abs = current - previous;
  const pct = previous === 0 ? 0 : (abs / previous) * 100;
  return { abs, pct };
}

function DeltaChip({ delta }: { delta: Delta }) {
  if (delta.abs === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
        no change vs last week
      </span>
    );
  }
  const tone = delta.abs > 0 ? "text-ok" : "text-critical";
  const glyph = delta.abs > 0 ? "▲" : "▼";
  const sign = delta.abs > 0 ? "+" : "";
  const pctDisplay = Math.abs(delta.pct) >= 0.1
    ? `${sign}${delta.pct.toFixed(1)}%`
    : `${sign}${delta.pct.toFixed(2)}%`;
  /* TWO UNBREAKABLE HALVES THAT WRAP AS WHOLES. On a phone a stat tile is
     ~150px wide and the chip is wider than that. As one non-wrapping row
     every piece shrank at once: the figures ran into each other and
     "vs last week" broke over two lines on top of them. Now the figures
     stay together on one line and "vs last week" drops beneath them. */
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1 text-[11px] font-medium",
        tone,
      )}
    >
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span className="text-[9px]">{glyph}</span>
        <span className="font-mono tabular-nums">
          {sign}
          {delta.abs.toLocaleString()}
        </span>
        <span className="font-mono tabular-nums text-slate-500">
          ({pctDisplay})
        </span>
      </span>
      <span className="whitespace-nowrap text-slate-500">vs last week</span>
    </span>
  );
}

/**
 * Tone -> number colour. Publisher is the brand green (text-primary) and app
 * is the pink app tone, so a stat coloured here matches the overview's matched
 * publisher and app cards; info and special line up with the Declarations
 * page's owner and inventory-partner cards.
 */
export type StatTone =
  | "ok"
  | "critical"
  | "warn"
  | "info"
  | "special"
  | "app"
  | "publisher"
  | "declIpd"
  | "declOwner"
  | "declManager";

const STAT_TONE_TEXT: Record<StatTone, string> = {
  ok: "text-ok",
  critical: "text-critical",
  warn: "text-warn",
  info: "text-info",
  special: "text-special",
  app: "text-app",
  publisher: "text-primary",
  declIpd: "text-declIpd",
  declOwner: "text-declOwner",
  declManager: "text-declManager",
};

export function SplitStat({
  number,
  label,
  hint,
  prefix,
  suffix,
  tone,
  linkTo,
  delta,
  note,
  active,
  onClick,
  caption,
  className,
  hintClassName,
  delayMs = 0,
}: {
  number: number;
  label: string;
  hint?: string;
  /** One short muted line under the label saying what the number counts,
   *  for a label that cannot say it alone. */
  caption?: string;
  /** Colour for the hint, when the hint is news rather than a footnote. */
  hintClassName?: string;
  /** When this figure starts rolling, so a page can land its KPIs in beats. */
  delayMs?: number;
  /** Ground for a stat that leads its row, e.g. a tinted "New this week". */
  className?: string;
  prefix?: string;
  /** Said after the number, smaller and muted: "/ 3" in "2 / 3". */
  suffix?: string;
  tone?: StatTone;
  linkTo?: string;
  delta?: Delta | null;
  /** What the delta slot says when there is no delta to say, e.g. under
   *  a seat-line filter. The slot keeps its height either way. */
  note?: string;
  /** Set with onClick: the list below is showing what this stat counts. */
  active?: boolean;
  /** Makes the stat a button that opens the list below on its lines. */
  onClick?: () => void;
}) {
  const numberCls = tone ? STAT_TONE_TEXT[tone] : "text-slate-900";
  const body = (
    <>
      <div className="flex items-baseline gap-1">
        {prefix && (
          <span
            className={cn(
              "font-mono text-2xl font-semibold tabular-nums sm:text-3xl",
              numberCls,
            )}
          >
            {prefix}
          </span>
        )}
        <span
          // Keyed on the value: a new figure counts up again.
          key={number}
          className={cn(
            "font-mono text-3xl font-semibold leading-none tabular-nums tracking-tight sm:text-4xl",
            numberCls,
          )}
        >
          <CountUp value={number} delayMs={delayMs} />
        </span>
        {suffix && (
          <span className="font-mono text-lg font-medium tabular-nums text-slate-400 sm:text-xl">{suffix}</span>
        )}
      </div>
      <div className="mt-2 text-[12px] font-medium text-slate-700">{label}</div>
      {caption && (
        <div className="text-[11px] leading-[15px] text-slate-500">{caption}</div>
      )}
      {/* ONE SLOT, ALWAYS THE SAME HEIGHT. A delta, a hint, a note, or
          nothing: the tile never grows or shrinks when the filter changes,
          so the page above the list does not move. */}
      <div
        key={number}
        className="min-h-[17px] text-[11px] leading-[17px]"
        // The change line is the payoff: it rises in once the figure lands.
        style={payoffStyle(delayMs + landsAfterMs())}
      >
        {delta ? (
          <DeltaChip delta={delta} />
        ) : hint ? (
          <span className={hintClassName ?? "text-slate-500"}>{hint}</span>
        ) : note ? (
          <span className="text-slate-400">{note}</span>
        ) : null}
      </div>
    </>
  );
  if (onClick) {
    // Toned to the stat when its lines are the ones listed below, so the
    // card and the tab it opened read as one selection.
    const activeGround =
      tone === "critical" ? "bg-critical-bg/60" : tone === "ok" ? "bg-ok-bg/60" : "bg-muted/50";
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          "group block w-full px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          active ? activeGround : "hover:bg-muted/40",
        )}
      >
        {body}
      </button>
    );
  }
  if (linkTo) {
    return (
      <Link
        to={linkTo}
        className="block px-5 py-4 transition-colors hover:bg-muted/40"
      >
        {body}
      </Link>
    );
  }
  return <div className={cn("px-5 py-4", className)}>{body}</div>;
}

/**
 * A matched-inventory tile that doubles as the selector for the list below.
 * Publishers wear the brand's racing green, apps the pink `app` tone.
 *
 * ONE RHYTHM WITH THE LINES TILES ON THE LEFT (David, 2026-10-25, "1000%
 * symmetric"): the same padding, corner radius and big-number row as
 * SplitStat, the label on the same second line, the same 17px quiet slot
 * under it, so all four tiles stand at one height. What this tile adds is
 * found and lost this week (the value found, never only the net;
 * kpis-show-value-found), in the tile's top-right corner: a tiny "This
 * week" caption over "▲ 380 found" and "▼ 29 lost", small muted type, the
 * figures softly tinted, shorter than the number and label beside it.
 * Last week's count is not printed, it is the number minus the move: it
 * lives in a hint above the move line. The selected tile carries its
 * tint, as the Lines tiles do.
 */
export function MatchedTile({
  tone,
  icon: Icon,
  number,
  label,
  delta,
  previous,
  note,
  move,
  active,
  onClick,
  delayMs = 0,
}: {
  tone: "publisher" | "app";
  /** Found / lost behind the net, when the report has them. */
  move?: MatchedMove | null;
  icon: typeof Globe;
  number: number;
  label: string;
  delta?: Delta | null;
  /** When this figure starts rolling (the overview's second beat). */
  delayMs?: number;
  /** Last week's count. With it the move line says the week's move and
   *  keeps last week's figure in its tooltip. */
  previous?: number | null;
  /** Said in the quiet slot when there is no delta; the slot keeps its
   *  height either way so the tile never moves. */
  note?: string;
  active: boolean;
  onClick: () => void;
}) {
  const isApp = tone === "app";
  // The pair the move line reads, narrowed once for the type checker.
  const w = delta != null && previous != null ? { delta, previous } : null;
  const numberCls = isApp ? "text-app" : "text-primary";
  const iconCls = isApp ? "text-app" : "text-primary";
  // Toned to the tile when its list is the one below, as SplitStat does.
  const activeGround = isApp ? "bg-app-bg/70" : "bg-ok-bg/60";
  const idleGround = "hover:bg-muted/40";
  // The change lines are the payoff: they rise in once the figure lands.
  const payoff = payoffStyle(delayMs + landsAfterMs());
  const numberRow = (
    // The Lines tiles' number row to the pixel: the same baseline row, its
    // sign slot present but empty and zero wide, so the row stands at the
    // same height as "+127" over there.
    <span className="flex items-baseline">
      <span aria-hidden className="invisible w-0 select-none font-mono text-2xl font-semibold tabular-nums sm:text-3xl">
        +
      </span>
      <span
        // Keyed on the value: a new figure counts up again.
        key={number}
        className={cn(
          "font-mono text-3xl font-semibold leading-none tabular-nums tracking-tight sm:text-4xl",
          numberCls,
        )}
      >
        <CountUp value={number} delayMs={delayMs} />
      </span>
    </span>
  );
  const labelRow = (
    <span className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
      <Icon aria-hidden className={cn("h-3.5 w-3.5 flex-shrink-0", iconCls)} />
      {label}
    </span>
  );
  const moveLine = w ? (
    // Last week's count rides in a hint anchored to this line (a native
    // title floats wherever the pointer is, half a card away).
    <HoverHint text={`${w.previous.toLocaleString()} last week`}>
      <span className="text-slate-500">
        {w.delta.abs === 0 ? (
          "no change vs last week"
        ) : (
          <>
            <span className="font-mono font-medium tabular-nums text-slate-600">{moveText(w.delta)}</span>{" "}
            vs last week
          </>
        )}
      </span>
    </HoverHint>
  ) : delta ? (
    <DeltaChip delta={delta} />
  ) : note ? (
    <span className="text-slate-400">{note}</span>
  ) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "mtile group block w-full px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active ? activeGround : idleGround,
      )}
    >
      {/* A small grid (index.css, .mtile-grid): the number and the label
          in the first column, the corner in the second, a fixed gap
          between, never overlapping. The corner is shorter than the two
          rows beside it, so the tile keeps the Lines tiles' height. Too
          narrow for the two columns (a phone), the corner moves under the
          label. */}
      <span className="mtile-grid">
        <span className="mtile-num">{numberRow}</span>
        <span className="mtile-label">{labelRow}</span>
        {w && move && <FoundLostCorner move={move} style={payoff} />}
      </span>
      {/* ONE SLOT, ALWAYS THE SAME HEIGHT, as on the Lines tiles. */}
      <span key={number} className="block min-h-[17px] text-[11px] leading-[17px]" style={payoff}>
        {moveLine}
      </span>
    </button>
  );
}

/** The signed move and its percentage, "+351 (+4.4%)". */
function moveText(delta: Delta): string {
  const sign = delta.abs > 0 ? "+" : delta.abs < 0 ? "-" : "";
  return `${sign}${Math.abs(delta.abs).toLocaleString()} (${pctText(delta.pct)})`;
}

/** Soft tints for the quiet lines: easy on the eye, never saturated. */
const SOFT_OK = "text-[hsl(152_38%_38%)]";
const SOFT_CRITICAL = "text-[hsl(0_46%_54%)]";

/**
 * The tile's corner: a tiny muted "This week" over "▲ 380 found" and
 * "▼ 29 lost", short right-aligned lines in small muted type, the figures
 * softly tinted. "This week" is a caption rather than on each line so the
 * corner stays narrow enough to sit beside the number on a 1,280px window.
 */
function FoundLostCorner({ move, style }: { move: MatchedMove; style?: React.CSSProperties }) {
  const line = (glyph: string, n: number, word: string, tint: string) => (
    <span className="whitespace-nowrap">
      <span className={cn("text-[8px]", n > 0 ? tint : "text-slate-400")}>{glyph}</span>{" "}
      <span className={cn("font-mono font-medium tabular-nums", n > 0 ? tint : "text-slate-400")}>
        {n.toLocaleString()}
      </span>{" "}
      {word}
    </span>
  );
  return (
    <span data-found-lost className="mtile-corner flex flex-col items-end text-right text-[10px] leading-[1.6] text-slate-500" style={style}>
      <span className="text-[9px] leading-[1.4] text-slate-400">This week</span>
      {line("▲", move.found, "found", SOFT_OK)}
      {line("▼", move.lost, "lost", SOFT_CRITICAL)}
    </span>
  );
}

/** "+4.4%", "-0.03%": one decimal, two when one would round to zero. */
function pctText(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "-" : "";
  const abs = Math.abs(pct);
  return `${sign}${abs >= 0.1 ? abs.toFixed(1) : abs.toFixed(2)}%`;
}

/**
 * The rows of the sample workbook the mock Export hands back: a plain-language
 * snapshot of this crawl, built from the summary already on screen. The live
 * report downloads the crawler-baked workbook instead, so this exists only to
 * make the button produce a real, openable file under VITE_MOCK.
 */
function sampleWorkbook(summary: Summary): { name: string; rows: (string | number)[][] }[] {
  const t = summary.hero_diff.line_totals;
  const finished = summary.finished_at
    ? new Date(summary.finished_at).toISOString().slice(0, 10)
    : "";
  return [
    {
      name: "Summary",
      rows: [
        ["PathFinder results export (sample)"],
        ["Crawl", summary.crawl_id],
        ["Status", summary.status],
        ["Finished", finished],
        [],
        ["Metric", "Count"],
        ["Matched publishers", summary.counters.matched.developers],
        ["Matched apps", summary.counters.matched.apps],
        ["Matched lines", summary.counters.matched.lines],
        ["Lines added this week", t.added],
        ["Lines removed this week", t.removed],
        ["Cert changes this week", t.cert_changed],
      ],
    },
  ];
}

/**
 * The Overview's one action: download the customer workbook for this run.
 *
 * Live mode navigates to api.exportUrl(token), the xlsx the crawler bakes per
 * crawl, as an ordinary same-origin navigation so the browser saves the file
 * and the session cookie rides along. MOCK mode has no backend, so it builds a
 * real, valid xlsx client side from the summary on screen (see lib/xlsx), which
 * keeps the button exercisable end to end under VITE_MOCK=true: a click
 * downloads a spreadsheet a customer can actually open, not a stub.
 */
/** The report's date as it appears in a filename, from the crawl's finish. */
/** An ISO time as a Date, or null when absent or unreadable. */
function validDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function reportDate(summary: { finished_at: string | null }): string {
  return summary.finished_at
    ? new Date(summary.finished_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
}

/**
 * Why Export is a zip, naming the list the way the Excel's Summary does.
 * Its rows are one per app per seat line, so the count can be several
 * times the Matched apps number on the card; the sentence says so.
 */
export function zipExplanation(info: ExportInfo): string {
  const limit = (info.excel_row_limit ?? 1_048_576).toLocaleString();
  const rows = info.apps_rows
    ? `${info.apps_rows.toLocaleString()} rows (one per app per seat line), `
    : "";
  return (
    `Export gives a zip: the Matched apps list has ${rows}more than Excel allows ` +
    `(${limit} rows in one tab), so it comes as a CSV file next to the Excel.`
  );
}

function ExportResultsButton({
  token,
  summary,
  lines,
  info,
}: {
  token: string;
  summary: Summary;
  lines: string[];
  info: ExportInfo;
}) {
  // Under a line filter the download carries only those lines, when the
  // report can be cut that way (the crawler says so in export-info). An
  // older report exports whole, and the button says so rather than hand
  // over a file that looks filtered and is not.
  const narrowed = lines.length > 0 && info.line_export;
  const title = narrowed
    ? "Downloads only the selected lines"
    : lines.length > 0 && info.format !== "zip"
      ? "This report downloads in full"
      : info.format === "zip"
        ? zipExplanation(info)
        : undefined;
  const onClick = async () => {
    if (MOCK) {
      const { buildXlsxBlob } = await import("../lib/xlsx");
      const { MOCK_CUSTOMER_DOMAIN } = await import("../lib/mockData");
      const url = URL.createObjectURL(buildXlsxBlob(sampleWorkbook(summary)));
      const a = document.createElement("a");
      a.href = url;
      // Same name the crawler puts on the real file: the customer's
      // domain and the report's date.
      a.download = `${MOCK_CUSTOMER_DOMAIN}-${reportDate(summary)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }
    window.location.href = api.exportUrl(token, narrowed ? lines : []);
  };
  /* THE ONE ACTION ON THE PAGE LOOKS LIKE ONE (David, 2026-10-02: "a green
     tempting button"). It was a white pill the same weight as the line
     filter beside it, so the thing a customer came to take away read as
     chrome. Solid brand green, white type, a lift on hover.

     The label says what the file is. "Export complete report" whenever the
     download is the whole report, which includes a filter this report
     cannot be cut by; only a download that really carries just the
     selected lines says so instead, because calling that file complete
     would be false. */
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-tour="export"
      className="inline-flex h-9 flex-shrink-0 items-center gap-2 self-start rounded-full bg-gradient-to-b from-[hsl(152_50%_32%)] to-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-md shadow-primary/25 ring-1 ring-inset ring-white/10 transition-all duration-150 hover:-translate-y-px hover:shadow-lg hover:shadow-primary/30 hover:brightness-110 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Download aria-hidden className="h-4 w-4" />
      {narrowed ? "Export selected lines" : "Export complete report"}
    </button>
  );
}

/** "inactive" is the Inactive section (it replaced No longer live). */
type DrillTab = "all" | "added" | "removed" | "changed" | ScopeTab | "inactive";

/** A list's change counts (crawler #361): a watch tab shows only when its
 *  count is above zero and the API filters by it (David, 2026-10-27). */
type ChangeCounts = Partial<Record<ListChange, number>>;

/** What a list's count calls its rows, per tab. */
function tabNoun(tab: DrillTab, view: "publishers" | "apps"): { many: string; one?: string } {
  if (tab === "added" || tab === "removed" || tab === "changed") return { many: "with changes" };
  return view === "apps" ? { many: "apps", one: "app" } : { many: "publishers", one: "publisher" };
}

/** The quiet line a watch tab carries under its controls. */
const SCOPE_NOTE: Record<ScopeTab, string> = {
  started:
    "Lines you started watching this week. Not counted as added: the publishers carrying them did not change.",
  stopped:
    "Lines you stopped watching this week. Not counted as removed: the publishers carrying them did not change.",
  unconfirmed:
    "Lines this crawl could not verify, each with its reason. Kept as matched, never counted as added or removed.",
};

/** What the two lists need for their Inactive tab; null when nothing is
 *  inactive (the tab then does not exist). */
type InactiveTab = {
  counts: InactiveCounts;
  kind: InactiveKind;
  setKind: (kind: InactiveKind) => void;
  legacy: Summary["gone"];
  /** "since Aug 18, 2026", or "since the compared crawl". */
  since: string;
} | null;

/**
 * The list's heading. On the Inactive tab it says what the list now is:
 * a separate section, apart from the matched rows and their numbers.
 */
function ListHead({
  inactive,
  title,
  blurb,
  right,
}: {
  inactive: boolean;
  title: string;
  blurb: string;
  /** The view control, at the head's right (below it on a phone). */
  right?: ReactNode;
}) {
  return (
    <div
      className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
      data-tour="overview-list-head"
    >
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">
          {inactive ? "Inactive" : title}
        </h2>
        <p className="text-sm text-slate-500">
          {inactive
            ? "Publishers and apps that went inactive between these two crawls, with the date and the reason. Nothing is deleted."
            : blurb}
        </p>
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}

export type ListView = "publishers" | "apps";

const VIEW_TITLE: Record<ListView, { title: string; blurb: string }> = {
  publishers: {
    title: "Matched publishers",
    blurb:
      "Every publisher whose ads.txt matched your seats. Click a row to see the exact seat lines it carried, and what moved this week.",
  },
  apps: {
    title: "Matched apps",
    blurb:
      "Every app whose app-ads.txt matched your seats, with the publisher that owns it. Click a row to see the exact seat lines it carried, and what moved this week.",
  },
};

/* ── POPULAR (David, 2026-10-27) ─────────────────────────────────────
   Each choice opens a list on one of its tabs. */
type PopularId =
  | "apps-removed"
  | "apps-added"
  | "pubs-lost"
  | "pubs-new"
  | "cert"
  | "ipd"
  | "started"
  | "stopped"
  | "unconfirmed";

type PopularTarget = { view: ListView; tab: DrillTab; matchType: MatchTypeFilter };

const POPULAR: Record<PopularId, { label: string; target: PopularTarget }> = {
  // EVERY LABEL NAMES WHAT ITS COUNT COUNTS, the rows of its tab (reviews
  // of #75): never a word the tiles use for their own numbers. "All
  // removed apps" read as the Matched apps tile's "lost" (apps no longer
  // matched at all, 82) while it counted apps whose lines were removed
  // (1,671); "New publishers this week" counted publishers that added
  // lines; "Cert changes" counted publishers, not the card's lines.
  "apps-removed": { label: "Apps that lost lines", target: { view: "apps", tab: "removed", matchType: "all" } },
  "apps-added": { label: "Apps that added lines", target: { view: "apps", tab: "added", matchType: "all" } },
  "pubs-lost": { label: "Publishers that lost lines", target: { view: "publishers", tab: "removed", matchType: "all" } },
  "pubs-new": { label: "Publishers that added lines", target: { view: "publishers", tab: "added", matchType: "all" } },
  cert: { label: "Publishers with cert changes", target: { view: "publishers", tab: "changed", matchType: "all" } },
  ipd: { label: "Publishers matched via IPD", target: { view: "publishers", tab: "all", matchType: "ipd" } },
  started: { label: "Publishers with newly watched lines", target: { view: "publishers", tab: "started", matchType: "all" } },
  stopped: { label: "Publishers with lines no longer watched", target: { view: "publishers", tab: "stopped", matchType: "all" } },
  unconfirmed: { label: "Publishers with unconfirmed lines", target: { view: "publishers", tab: "unconfirmed", matchType: "all" } },
};
const POPULAR_ORDER: PopularId[] = [
  "apps-removed",
  "apps-added",
  "pubs-lost",
  "pubs-new",
  "cert",
  "ipd",
  "started",
  "stopped",
  "unconfirmed",
];

function targetMatches(
  t: PopularTarget,
  now: { view: ListView; tab: DrillTab; matchType: MatchTypeFilter },
): boolean {
  return t.view === now.view && t.tab === now.tab && t.matchType === now.matchType;
}

/**
 * Each choice's count: the rows its tab lists. Publishers that gained,
 * lost or re-certified a line and IPD matches from their lists' answers;
 * apps only from an API that filters apps by change (an older one names no
 * number, so no choice); the watch tabs' publishers from the list's change
 * counts (crawler #361). Undefined while they are on the way; null: no
 * choice.
 */
function usePopularCounts(
  token: string,
  lines: string[],
  summary: Summary | null,
): Partial<Record<PopularId, number | null>> | undefined {
  const [counts, setCounts] = useState<Partial<Record<PopularId, number | null>> | undefined>(undefined);
  const key = lines.join(",");
  const first = summary?.previous_job_id === null;
  useEffect(() => {
    let cancelled = false;
    setCounts(undefined);
    const safe = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
    Promise.all([
      safe(api.developerEvents(token, "added", 1, "", lines)),
      safe(api.developerEvents(token, "removed", 1, "", lines)),
      safe(api.developerEvents(token, "changed", 1, "", lines)),
      safe(api.matchedApps(token, 1, "", lines, "all", "added")),
      safe(api.matchedApps(token, 1, "", lines, "all", "removed")),
      safe(api.matchedDevelopers(token, 1, "", lines, "all")),
    ]).then(([pubsAdded, pubsRemoved, pubsChanged, appsAdded, appsRemoved, matched]) => {
      if (cancelled) return;
      // The watch tabs' publishers, from the list's own change counts
      // (crawler #361); an API without them offers no such tab or choice.
      const watch = (k: ListChange) => (first ? null : (matched?.change_counts?.[k] ?? null));
      setCounts({
        "pubs-new": pubsAdded?.total ?? null,
        "pubs-lost": pubsRemoved?.total ?? null,
        cert: pubsChanged?.total ?? null,
        "apps-added": appsAdded && appsAdded.change === "added" ? appsAdded.total : null,
        "apps-removed": appsRemoved && appsRemoved.change === "removed" ? appsRemoved.total : null,
        ipd: matched?.match_type_counts?.ipd ?? null,
        started: watch("started_watching"),
        stopped: watch("stopped_watching"),
        unconfirmed: watch("unconfirmed"),
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, key, first]);
  return counts;
}

/**
 * "6 publishers and 7 apps went inactive since Aug 18, 2026, not counted
 * above." A report is the difference between two crawls (David,
 * 2026-10-08), so this is what went inactive between them, said quietly,
 * with the way to see it. The headline numbers count active only. Never a
 * card: a side finding is a line or a tab.
 */
export function inactiveSentence(counts: InactiveCounts, since: string): string {
  const noun = { publishers: ["publisher", "publishers"], apps: ["app", "apps"] } as const;
  const parts = (["publishers", "apps"] as const)
    .filter((k) => counts[k] > 0)
    .map((k) => `${counts[k].toLocaleString()} ${noun[k][counts[k] === 1 ? 0 : 1]}`);
  if (parts.length === 0) return "";
  return `${parts.join(" and ")} went inactive ${since}`;
}

function InactiveQuietLine({
  counts,
  since,
  filtered,
  onShow,
}: {
  counts: InactiveCounts;
  since: string;
  filtered: boolean;
  onShow: () => void;
}) {
  const said = inactiveSentence(counts, since);
  if (!said) return null;
  return (
    <p data-testid="inactive-quiet" className="mt-3 text-[12px] leading-snug text-slate-500">
      {said}
      {filtered ? ", across all your seat lines" : ""}, not counted above.{" "}
      <button
        type="button"
        onClick={onShow}
        className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-critical hover:decoration-critical/40"
      >
        See them
      </button>
    </p>
  );
}

/**
 * Opens a list's first row after `nonce` bumps, as soon as the list is
 * `ready` (its rows are the ones the bump asked for). A list mounted with
 * a non-zero nonce does not open anything: only a new bump does.
 */
function useOpenFirst<K>(
  nonce: number,
  ready: boolean,
  firstKey: K | null,
  open: (key: K) => void,
) {
  const seen = useRef(nonce);
  const pending = useRef(false);
  useEffect(() => {
    if (nonce !== seen.current) {
      seen.current = nonce;
      pending.current = true;
    }
  }, [nonce]);
  useEffect(() => {
    // An empty list spends the bump too, or it would open a row in
    // whatever list lands next.
    if (pending.current && ready) {
      pending.current = false;
      if (firstKey != null) open(firstKey);
    }
  }, [nonce, ready, firstKey, open]);
}

/** Whether a list offers a watch tab: its API counts the filter and the
 *  count is above zero, and it never answered the filter unfiltered. */
function watchTabOn(counts: ChangeCounts | null, off: boolean, tab: ScopeTab): boolean {
  return !off && (counts?.[WATCH_CHANGE[tab]] ?? 0) > 0;
}

/** The watch tabs a list offers: only those with rows this week. */
function ScopeTriggers({ counts, off }: { counts: ChangeCounts | null; off: boolean }) {
  return (
    <>
      {watchTabOn(counts, off, "started") && <TabsTrigger value="started">Started watching</TabsTrigger>}
      {watchTabOn(counts, off, "stopped") && <TabsTrigger value="stopped">Stopped watching</TabsTrigger>}
      {watchTabOn(counts, off, "unconfirmed") && <TabsTrigger value="unconfirmed">Unconfirmed</TabsTrigger>}
    </>
  );
}

/** A list's split by a switch, only from an API that filtered the whole
 *  list by it (it echoes the choice) and counted it; else null: no switch,
 *  and never a page filtered on its own. */
function splitOf<C>(counts: C | null | undefined, echoed: string | null | undefined, asked: string): C | null {
  if (!counts) return null;
  if (asked !== "all" && echoed !== asked) return null;
  return counts;
}

/** A matched publisher as the list renders it; on a watch tab it carries
 *  the tab (its lines of the kind are read when the row opens). */
function developerRow(d: MatchedDeveloper, watch?: { tab: ScopeTab; filter: string[] }): Row {
  return {
    ...(watch ? { scope: { tab: watch.tab, filter: watch.filter, lines: watchLinesOf(d, watch.tab) } } : {}),
    developer_id: d.developer_id,
    developer_name: d.name,
    developer_domain: d.domain,
    developer_platform: d.platform,
    prev: null,
    current: d.line_count,
    added: d.lines_added ?? 0,
    removed: d.lines_removed ?? 0,
    cert_changed: d.lines_cert_changed ?? 0,
    matched_lines: d.matched_lines ?? [],
    added_lines: d.added_lines ?? [],
    removed_lines: d.removed_lines ?? [],
    cert_changed_lines: d.cert_changed_lines ?? [],
    file_hosts: d.file_hosts ?? [],
    ...matchTypeFieldsOf(d),
  };
}

/** A publisher on Added, Removed or Changed. */
function eventRow(d: DeveloperEvent): Row {
  return {
    developer_id: d.developer_id,
    developer_name: d.developer_name,
    developer_domain: d.developer_domain,
    developer_platform: d.developer_platform,
    prev: d.matched_lines_prev,
    current: d.matched_lines_current,
    added: d.lines_added,
    removed: d.lines_removed,
    cert_changed: d.lines_cert_changed,
    matched_lines: d.matched_lines ?? [],
    added_lines: d.added_lines ?? [],
    removed_lines: d.removed_lines ?? [],
    cert_changed_lines: Array.isArray(d.cert_changed_lines) ? d.cert_changed_lines : [],
    // A change row names no hosts: the standing row does.
    file_hosts: [],
    ...matchTypeFieldsOf(d),
  };
}

/** A Changed row's lines with the cert each had before, when the row's
 *  cert changes have been read (its own, on open). */
function withOldCerts(
  lines: MatchedSeatLine[],
  certs: CertChanges | null | undefined,
  /** The publisher's domain: the host of a line that names none. */
  ownHost?: string | null,
): MatchedSeatLine[] {
  if (!certs || !Array.isArray(lines)) return Array.isArray(lines) ? lines : [];
  return lines.map((l) => {
    if (!l || typeof l !== "object") return l;
    // By seat AND place (re-review of #75): the same seat in two files
    // gets each file's own old cert.
    const c = certChangeOf(certs, l, ownHost);
    return c ? { ...l, old_cert_id: c.old ?? "", cert_id: l.cert_id || c.next || undefined } : l;
  });
}

/** A row's cert changes, read when it opens on a Changed window. */
function useRowCerts(read: CertRead | undefined) {
  const [certs, setCerts] = useState<CertChanges | null>(null);
  const key = read ? `${read.token}|${read.developerId}|${read.filter.join(",")}` : "";
  useEffect(() => {
    if (!read) return;
    let cancelled = false;
    rowCertChanges(read.token, read.developerId, read.filter)
      .then((m) => !cancelled && setCerts(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return certs;
}

/** Who a Changed window's old certs are read for. */
type CertRead = { token: string; developerId: number; filter: string[] };

/** The file a line event was read from, in the page's words. */
function fileLabelOf(kind: string | null | undefined): string {
  const k = String(kind ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (k === "appadstxt") return "app-ads.txt";
  if (k === "adstxt") return "ads.txt";
  return String(kind ?? "");
}

const SCOPE_WINDOW: Record<ScopeTab, { title: string; text: string; head: string; border: string }> = {
  started: { title: "Started watching", text: "text-info", head: "bg-info-bg/60", border: "border-info-border" },
  stopped: { title: "Stopped watching", text: "text-warn", head: "bg-warn-bg/60", border: "border-warn-border" },
  unconfirmed: { title: "Unconfirmed lines", text: "text-slate-600", head: "bg-muted/60", border: "border-border" },
};

/**
 * A watch tab's expansion: the publisher's lines of that kind, one row per
 * distinct line (its partners beside it), each with why (the reason the
 * crawler gave) and, for an unconfirmed line, when it was last seen, read
 * and verified. The Changes page's roster, said per publisher.
 */
function ScopeWindow({
  token,
  mark,
  developerId,
  publisherDomain,
}: {
  token: string;
  mark: WatchMark;
  /** Whose lines: the publisher (an app's, on the apps list). */
  developerId: number | null | undefined;
  publisherDomain?: string | null;
}) {
  const tab = mark.tab;
  const filterKey = mark.filter.join(",");
  const [events, setEvents] = useState<LineEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (developerId == null) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    setEvents(null);
    setFailed(false);
    watchEvents(token, tab, developerId, filterKey ? filterKey.split(",") : [])
      .then((e) => !cancelled && setEvents(e))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [token, tab, developerId, filterKey]);
  if (failed) return <p className="text-xs text-slate-500">Could not load these lines.</p>;
  if (events === null) return <SeatLinesSkeleton label={`Loading ${SCOPE_WINDOW[tab].title.toLowerCase()}`} />;
  if (events.length === 0)
    return <p className="text-xs text-slate-500">No {SCOPE_WINDOW[tab].title.toLowerCase()} on record for this row.</p>;
  const s = SCOPE_WINDOW[tab];
  const groups: { e: LineEvent; partners: string[]; own: boolean }[] = [];
  const byKey = new Map<string, (typeof groups)[number]>();
  // Only the partners' copies of a line fold; an own copy per host and
  // file stays its own row (review of #75).
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || typeof e !== "object") continue;
    const partner = e.match_type === "ipd" && typeof e.ipd_partner === "string" && e.ipd_partner ? e.ipd_partner : null;
    const k = `${seatKey(e)}|${partner === null ? `own|${placeKey(e.host, e.file_kind)}` : "ipd"}`;
    let g = byKey.get(k);
    if (!g) {
      g = { e, partners: [], own: partner === null };
      byKey.set(k, g);
      groups.push(g);
    }
    if (partner && !g.partners.includes(partner)) g.partners.push(partner);
  }
  const digits = gutterDigits(groups.length);
  return (
    <section data-scope-window className={cn("overflow-hidden rounded-lg border bg-white shadow-sm", s.border)}>
      <div className={cn("flex items-baseline justify-between gap-2 border-b px-3 py-1.5", s.border, s.head)}>
        <span className={cn("text-xs font-medium", s.text)}>{s.title}</span>
        <span className={cn("font-mono text-[11px] font-semibold tabular-nums", s.text)}>{groups.length}</span>
      </div>
      <ul className="bl-lines-in divide-y divide-border">
        {groups.map(({ e, partners, own }, i) => {
          const reason =
            tab === "unconfirmed" ? scopeReasonText(e.reason) || "No reason recorded." : scopeReasonText(e.reason);
          return (
            <SeatLineRow
              key={`${seatKey(e)}:${i}`}
              n={i + 1}
              digits={digits}
              line={{
                ssp_domain: e.ssp_domain,
                publisher_id: e.publisher_id,
                relationship: e.relationship,
                cert_id: e.new_cert_id || e.old_cert_id || (e as { cert_id?: string }).cert_id || undefined,
                found_in: fileLabelOf(e.file_kind),
                host: e.host ?? null,
                date_source: e.date_source,
              }}
              partners={partners}
              own={own}
              gone={tab === "stopped"}
              muted={tab === "stopped"}
              publisherDomain={publisherDomain}
              notes={reason ? <RowNote tone="reason" data-line-reason>{reason}</RowNote> : null}
              dates={tab === "unconfirmed" ? unconfirmedDates(e) : null}
            />
          );
        })}
      </ul>
    </section>
  );
}

/* ── EXPORT THIS LIST (David, 2026-10-27) ──────────────────────────── */
const TAB_SLUG: Record<DrillTab, string> = {
  all: "all-matched",
  added: "added",
  removed: "removed",
  changed: "changed",
  started: "started-watching",
  stopped: "stopped-watching",
  unconfirmed: "unconfirmed",
  inactive: "inactive",
};

const lineCell = (l: Pick<MatchedSeatLine, "ssp_domain" | "publisher_id" | "relationship" | "cert_id">) =>
  [l.ssp_domain, l.publisher_id, l.relationship, l.cert_id].filter((v) => v != null && String(v).trim()).join(", ");

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x && !!x.trim()))];

/** A row's lines for the tab it is on, one per distinct line, and why. */
function tabLines(
  tab: DrillTab,
  lists: { matched: MatchedSeatLine[]; added: MatchedSeatLine[]; removed: MatchedSeatLine[]; cert: MatchedSeatLine[] },
  rowPartner: string | null,
  scope?: WatchMark,
): { lines: string; reasons: string } {
  if (scope) {
    // A watch row's lines of its kind, when the crawler sends them with it.
    const groups = groupSeatLines(scope.lines ?? [], rowPartner);
    return {
      lines: groups.map((g) => (g.partners.length ? `${lineCell(g.line)} via ${g.partners.join(" ")}` : lineCell(g.line))).join("; "),
      reasons: uniq(groups.map((g) => scopeReasonText((g.line as { reason?: string | null }).reason))).join("; "),
    };
  }
  const src = tab === "added" ? lists.added : tab === "removed" ? lists.removed : tab === "changed" ? lists.cert : lists.matched;
  const groups = groupSeatLines(src, rowPartner);
  return {
    lines: groups
      .map((g) => {
        const base = lineCell(g.line);
        if (tab === "changed" && typeof g.line.old_cert_id === "string")
          return `${base} (cert ${g.line.old_cert_id || "not set"} -> ${g.line.cert_id || "not set"})`;
        return g.partners.length ? `${base} via ${g.partners.join(" ")}` : base;
      })
      .join("; "),
    reasons: tab === "removed" ? uniq(groups.map((g) => removalReasonText(g.line))).join("; ") : "",
  };
}

/* THE FILE SPEAKS THE WORKBOOK'S WORDS (parity audit of #75): the
 * columns the customer's Excel also has carry its headers and its values
 * (run_export.py: "Publisher domain", "Publisher", "Matched via" Own / IPD,
 * "IPD partner" "Via <partner>, inventory partner of <publisher>", "App",
 * "Bundle / store ID"); the list's own columns are named in the same
 * plain words. */

/** "Matched via", as the workbook writes it: Own or IPD. */
function matchedViaCell(mt: string | null | undefined): string {
  return mt === "ipd" ? "IPD" : mt === "own" ? "Own" : "";
}

/** "IPD partner", as the workbook writes it. The workbook names the
 *  platform from the crawler's registry, else the publisher's domain;
 *  the list knows the publisher's name, else its domain. */
function ipdPartnerCell(
  mt: string | null | undefined,
  partner: string | null | undefined,
  name: string | null | undefined,
  domain: string | null | undefined,
): string {
  if (mt !== "ipd" || !partner) return "";
  const of = (typeof name === "string" && name.trim()) || (typeof domain === "string" ? domain : "");
  return of ? `Via ${partner}, inventory partner of ${of}` : `Via ${partner}`;
}

const PUBLISHER_CSV = [
  "Publisher domain",
  "Publisher",
  "Matched via",
  "IPD partner",
  "Lines this week",
  "Lines last week",
  "Lines added",
  "Lines removed",
  "Certs changed",
  "Seat lines",
  "Reason",
];

function publisherCells(r: Row, tab: DrillTab): CsvCell[] {
  const t = tabLines(
    tab,
    { matched: r.matched_lines, added: r.added_lines, removed: r.removed_lines, cert: r.cert_changed_lines },
    rowPartnerOf(r),
    r.scope,
  );
  return [
    r.developer_domain,
    r.developer_name,
    matchedViaCell(r.match_type),
    ipdPartnerCell(r.match_type, r.ipd_partner, r.developer_name, r.developer_domain),
    r.current,
    r.prev ?? "",
    r.added,
    r.removed,
    r.cert_changed,
    t.lines,
    t.reasons,
  ];
}

const APP_CSV = [
  "App",
  "Store",
  "Bundle / store ID",
  "Publisher domain",
  "Publisher",
  "Matched via",
  "IPD partner",
  "File",
  "Lines",
  "Lines added",
  "Lines removed",
  "Certs changed",
  "Seat lines",
  "Reason",
];

function appCells(a: AppRow, tab: DrillTab): CsvCell[] {
  const t = tabLines(
    tab,
    {
      matched: a.matched_lines ?? [],
      added: a.added_lines ?? [],
      removed: a.removed_lines ?? [],
      cert: a.cert_changed_lines ?? [],
    },
    rowPartnerOf(a),
    a.scope,
  );
  return [
    a.app_name,
    storeLabel(a.store),
    a.bundle_id,
    a.owner_domain,
    a.owner_name,
    matchedViaCell(a.match_type),
    ipdPartnerCell(a.match_type, a.ipd_partner, a.owner_name, a.owner_domain),
    appFileLine(a.file_host, a.file_source) ?? "",
    a.line_count,
    a.lines_added ?? 0,
    a.lines_removed ?? 0,
    a.lines_cert_changed ?? 0,
    t.lines,
    t.reasons,
  ];
}

/** What a quiet tab says (David, 2026-10-27: "No publishers on this
 *  report." under Removed was wrong; "on this report" is for an empty All
 *  matched only). */
const EMPTY_TAB: Record<"publishers" | "apps", Partial<Record<DrillTab, string>>> = {
  publishers: {
    added: "No publishers gained a line this week.",
    removed: "No publishers lost a line this week.",
    changed: "No cert changes this week.",
    started: "No lines started being watched this week.",
    stopped: "No lines stopped being watched this week.",
    unconfirmed: "Every line was confirmed this week.",
  },
  apps: {
    added: "No apps gained a line this week.",
    removed: "No apps lost a line this week.",
    changed: "No cert changes this week.",
    started: "No apps carry a line that started being watched this week.",
    stopped: "No apps carry a line that stopped being watched this week.",
    unconfirmed: "No apps carry an unconfirmed line this week.",
  },
};

/** Uniform shape both tabs render into. */
type Row = {
  developer_id: number;
  developer_name: string | null;
  developer_domain: string | null;
  developer_platform: string | null;
  prev: number | null;
  current: number;
  added: number;
  removed: number;
  cert_changed: number;
  /** The seat line(s) this publisher matched, shown verbatim in the expanded
   *  row when it held steady this week (the stable, flat-list case). */
  matched_lines: MatchedSeatLine[];
  /** The seat lines behind the change counts, shown when the row moved. Each
   *  array's length equals its count, so the header badge and the expansion
   *  agree (added_lines.length === added, and so on). */
  added_lines: MatchedSeatLine[];
  removed_lines: MatchedSeatLine[];
  cert_changed_lines: MatchedSeatLine[];
  /** The declared hosts whose app-ads.txt hold some of this publisher's
   *  lines (2026-10-21); empty on its own file alone or on an older report. */
  file_hosts: string[];
  /** Set on a watch tab: which tab, under which line filter, and the
   *  row's lines of the kind when the crawler sends them with the row. */
  scope?: WatchMark;
} & MatchTypeFields;

/** What marks a row of a watch tab. */
type WatchMark = { tab: ScopeTab; filter: string[]; lines: MatchedSeatLine[] | null };

/** A watch row's lines of its kind, when the crawler embeds them (as
 *  developer-events does, ``<filter>_lines``); null otherwise. */
function watchLinesOf(row: object, tab: ScopeTab): MatchedSeatLine[] | null {
  const r = row as Record<string, unknown>;
  const v = r[`${WATCH_CHANGE[tab]}_lines`];
  return Array.isArray(v) ? (v as MatchedSeatLine[]) : null;
}

/** An IPD row's partner: the file its lines sit in when a report does not
 *  name the partner per line. Null on an own row. */
function rowPartnerOf(row: MatchTypeFields): string | null {
  return row.match_type === "ipd" && row.ipd_partner ? row.ipd_partner : null;
}

/** How many partners other than the row's own named one carry its lines
 *  (the row face says "Via X and 13 other inventory partners"). */
function otherPartners(row: MatchTypeFields, lines: MatchedSeatLine[] | null | undefined): number {
  if (row.match_type !== "ipd" || !row.ipd_partner) return 0;
  const all = new Set(groupSeatLines(lines, row.ipd_partner).flatMap((g) => g.partners));
  all.delete(row.ipd_partner);
  return all.size;
}

/** The contract's per-row match type fields, copied as they came: absent
 *  stays absent, so an old report's row carries none of them. */
function matchTypeFieldsOf(d: MatchTypeFields): MatchTypeFields {
  const out: MatchTypeFields = {};
  if (d.match_type !== undefined) out.match_type = d.match_type;
  if (d.ipd_partner !== undefined) out.ipd_partner = d.ipd_partner;
  if (d.ipd_platform !== undefined) out.ipd_platform = d.ipd_platform;
  if (d.declared_in !== undefined) out.declared_in = d.declared_in;
  return out;
}

/* ── THE LIST'S CONTROLS, TWO ROWS AND NOTHING ELSE (David, 2026-10-25) ──
   Row 1: the status tabs on the left; "Match type" and its pills on the
   right, the tabs' height. Row 2: the search box on the left, held to a
   sensible width; "1–25 of 262 publishers" and the pager on the right,
   centred on the search box. The count lives on row 2 only (the pills
   keep theirs in their tooltips), and the standalone count-and-pager line
   that used to sit above the rows is gone; the pager under the list
   stays. On a phone row 1 wraps the pills under the tabs and row 2 stacks
   the search above the count and pager. Nothing in either row moves when
   a tab or a pill changes: the tabs and pills have fixed widths, the
   search box keeps its width whatever lands on its right, and the right
   side is right-aligned so only its left edge grows. Without match types
   (every report frozen before crawler #348) row 1's right side is empty. */
export function ListTabsRow({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">{left}</div>
      {right}
    </div>
  );
}

export function ListSearchRow({
  query,
  setQuery,
  placeholder,
  label,
  right,
}: {
  query: string;
  setQuery: (next: string) => void;
  placeholder: string;
  label: string;
  /** The count and pager; null while nothing has landed (the row keeps its
   *  height: the search box is as tall as the pager). */
  right: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-x-6">
      {/* PREVIEW (2026-10-25): the search stretches to the count and pager,
          a comfortable gap between, never narrower than 12rem. */}
      <div className="relative w-full min-w-0 sm:min-w-[12rem] sm:flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="h-10 w-full rounded-full border border-border bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary/40"
        />
      </div>
      {right && (
        <div data-list-count className="flex min-h-10 items-center justify-end sm:ml-auto sm:flex-shrink-0">
          {right}
        </div>
      )}
    </div>
  );
}

/** The plain count for a list that cannot be paged here: a trial's cut
 *  list, or the app change tabs, which filter the loaded page in the
 *  browser. */
function CountLine({ count, noun }: { count: number; noun: string }) {
  return (
    <p className="whitespace-nowrap text-xs tabular-nums text-slate-500">
      {count.toLocaleString()} {noun}
    </p>
  );
}

/** The count and pager's place while a list waits for its rows: the
 *  skeleton's tone, at the pager's height, so nothing moves when the
 *  real count lands and no old number stands under a new filter. */
export function CountSkeleton() {
  return (
    <div data-count-skeleton aria-hidden className="flex h-10 items-center">
      <Skeleton className="h-3.5 w-44 rounded-md" />
    </div>
  );
}

function DrilldownList({
  token,
  lines,
  caps,
  inactive,
  tab,
  setTab,
  openFirst,
  matchType,
  setMatchType,
  foundIn,
  setFoundIn,
  searchReset,
  known,
}: {
  token: string;
  lines: string[];
  /** The trial's caps, on a trial: the unlock card stands on every tab. */
  caps: TrialCaps | null;
  /** The Inactive tab's wiring; null when nothing is inactive (no tab). */
  inactive: InactiveTab;
  /** Owned by the page, so the line cards above can pick the tab. */
  tab: DrillTab;
  setTab: (tab: DrillTab) => void;
  /** Each bump opens the first row of the next list to land. */
  openFirst: number;
  /** All / Own / IPD, owned by the page (survives the view switch). */
  matchType: MatchTypeFilter;
  setMatchType: (next: MatchTypeFilter) => void;
  /** All / ads.txt / app-ads.txt / Both, the page's too. */
  foundIn: FoundInFilter;
  setFoundIn: (next: FoundInFilter) => void;
  /** Bumped by a Popular choice: the search clears. */
  searchReset: number;
  /** Counts the page read for the Popular choices (expectedRows). */
  known?: Record<string, number> | null;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  // The list's split by file (crawler PR): null, no Found in switch.
  const [foundInCounts, setFoundInCounts] = useState<FoundInCounts | null>(null);
  // THE WATCH TABS (crawler #361): the list's change counts, from the last
  // answer that carried them; and whether the API ever answered a watch
  // filter unfiltered (an API without it: those tabs are not offered).
  const [changeCounts, setChangeCounts] = useState<ChangeCounts | null>(null);
  const [watchOff, setWatchOff] = useState(false);
  // The list's split and its inconclusive IPD matches (crawler #348).
  // Null on a report without match types: no pills, no note.
  const [typeCounts, setTypeCounts] = useState<MatchTypeCounts | null>(null);
  const [inconclusive, setInconclusive] = useState<IpdInconclusive | null>(null);
  const cache = usePageCache<unknown>();
  // The tab the rows on screen were read for. Lags `tab` until a new tab's
  // list lands, so a freshly picked tab never opens last tab's first row.
  const [rowsTab, setRowsTab] = useState<DrillTab>(tab);
  // The match type the rows on screen were read for: the note under the
  // list follows the rows, not the pill, so it changes with them.
  const [rowsMatchType, setRowsMatchType] = useState<MatchTypeFilter>(matchType);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const paging = usePaging(setPage);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (searchReset) setQuery("");
  }, [searchReset]);
  const [truncated, setTruncated] = useState(false);
  /** The cut this trial report made to the list, or null on a full report. */
  const [trial, setTrial] = useState<TrialSlice | null>(null);
  // Bumps each time a list lands: the rows are replaced on it.
  const [settled, setSettled] = useState(0);
  // The size of the list last read, for the skeleton's row count.
  const [landed, setLanded] = useState<Landed | null>(null);

  // A new search, a new tab or a new line selection is a new list, so it
  // starts at its first page. Without this, searching from page 7 asks
  // for page 7 of a result that may have one page, and the reader gets an
  // empty list for a term that matches.
  useEffect(() => {
    setPage(1);
  }, [tab, query, lines, matchType, foundIn]);

  // ONE WAY TO WAIT (David, 2026-10-27, replacing the dimmed swap of
  // 2026-10-26). Whenever the list waits for new rows (a new tab, line
  // selection, match type, search or page) it shows the same skeleton as
  // the cold open, never last answer's rows dimmed under a "..." sign. A
  // page already read (read ahead, or seen before) lands at once, never
  // dimmed. Coming back from Inactive, whose section took
  // the list's place, starts the list afresh.
  const prevTab = useRef(tab);
  useEffect(() => {
    if (prevTab.current === "inactive" && tab !== "inactive") setSettled(0);
    prevTab.current = tab;
  }, [tab]);

  useEffect(() => {
    // The Inactive section reads its own lists.
    if (tab === "inactive") return;
    const event = tab;
    let cancelled = false;
    const load = (pg: number) =>
      event === "all" || isScopeTab(event)
        ? api
            .matchedDevelopers(token, pg, query, lines, matchType, PAGE_SIZE, isScopeTab(event) ? WATCH_CHANGE[event] : undefined, foundIn)
            .then((r) => ({
            foundInCounts: splitOf(r.found_in_counts, r.found_in, foundIn),
            // A watch filter the API did not echo was not applied: the
            // tab is not offered, and these rows are never shown under it.
            unfiltered: isScopeTab(event) && r.change !== WATCH_CHANGE[event],
            changeCounts: r.change_counts ?? null,
            rows: r.rows.map((d) => developerRow(d, isScopeTab(event) ? { tab: event, filter: lines } : undefined)),
            total: r.total,
            truncated: r.truncated ?? false,
            trial: r.trial ?? null,
            typeCounts: r.match_type_counts ?? null,
            inconclusive: r.ipd_inconclusive ?? null,
          }))
        : api.developerEvents(token, event, pg, query, lines, matchType, PAGE_SIZE, foundIn).then((r) => ({
            foundInCounts: splitOf(r.found_in_counts, r.found_in, foundIn),
            unfiltered: false,
            changeCounts: r.change_counts ?? null,
            rows: r.rows.map((d) => eventRow(d)),
            total: r.total,
            truncated: false,
            trial: r.trial ?? null,
            typeCounts: r.match_type_counts ?? null,
            inconclusive: r.ipd_inconclusive ?? null,
          }));
    type Loaded = Awaited<ReturnType<typeof load>>;
    const keyFor = (pg: number) => [tab, pg, query, lines.join(","), matchType, foundIn].join("|");
    const apply = (data: Loaded) => {
      setLanded({ tab, query, lines: lines.join(","), matchType, filter: foundIn, total: data.total });
      if (data.changeCounts) setChangeCounts(data.changeCounts);
      if (data.unfiltered) {
        // Never a list filtered here on its own: no watch tabs at all.
        setWatchOff(true);
        setTab("all");
        return;
      }
      // A list that does not say how it splits has no pills, so it must
      // not stay filtered by them either: back to every match.
      if (!data.typeCounts && matchType !== "all") setMatchType("all");
      if (!data.foundInCounts && foundIn !== "all") setFoundIn("all");
      setFoundInCounts(data.foundInCounts);
      setRows(data.rows);
      setTypeCounts(data.typeCounts);
      setInconclusive(data.inconclusive);
      setRowsTab(tab);
      setRowsMatchType(data.typeCounts ? matchType : "all");
      setTotal(data.total);
      setTruncated(data.truncated);
      setTrial(data.trial);
      setSettled((n) => n + 1);
    };
    // Read the next page while this one is on screen. Not while a search
    // is being typed: every keystroke is a new list, and reading ahead of
    // each would double the requests for pages nobody opens.
    const readAhead = (data: Loaded) => {
      if (!query && page * PAGE_SIZE < data.total) {
        cache.prefetch(keyFor(page + 1), () => load(page + 1));
      }
    };
    setError(null);
    setExpanded(null);
    const kept = cache.get(keyFor(page)) as Loaded | undefined;
    if (kept) {
      apply(kept);
      setLoading(false);
      readAhead(kept);
      return;
    }
    setLoading(true);
    load(page)
      .then((data) => {
        cache.put(keyFor(page), data);
        if (cancelled) return;
        apply(data);
        readAhead(data);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, tab, page, query, lines, matchType, setMatchType, foundIn, setFoundIn, setTab, cache]);

  // A watch tab whose count says it is empty (or an API without the
  // filter) is not offered: a page left on it reads as All matched.
  useEffect(() => {
    if (isScopeTab(tab) && (watchOff || (changeCounts && !watchTabOn(changeCounts, watchOff, tab)))) setTab("all");
  }, [tab, changeCounts, watchOff, setTab]);

  useOpenFirst(
    openFirst,
    !loading && settled > 0 && rowsTab === tab,
    rows[0]?.developer_id ?? null,
    setExpanded,
  );

  // EXPORT THIS LIST: every page of what the tab, filters and search show,
  // each page into the file as it arrives.
  const exportList = async (sink: CsvSink, progress: Progress, signal: AbortSignal): Promise<string> => {
    const t = rowsTab;
    const mt = rowsMatchType;
    const fi: FoundInFilter = foundInCounts ? foundIn : "all";
    sink.header(PUBLISHER_CSV);
    if (t === "all" || isScopeTab(t))
      await eachPage(
        (pg) => api.matchedDevelopers(token, pg, query, lines, mt, 100, isScopeTab(t) ? WATCH_CHANGE[t] : undefined, fi),
        100,
        (page) =>
          sink.rows(page.map((d) => publisherCells(developerRow(d, isScopeTab(t) ? { tab: t, filter: lines } : undefined), t))),
        progress,
        signal,
      );
    else if (t !== "inactive") {
      // THE CHANGED TAB'S FILE SAYS OLD TO NEW, as its rows do (re-review
      // of #75): the cert changes are read for the file, every page, only
      // when a reader asks for it.
      const certsBy = t === "changed" ? await allCertChanges(token, lines, undefined, signal) : null;
      const withCerts = (r: Row): Row =>
        certsBy
          ? { ...r, cert_changed_lines: withOldCerts(r.cert_changed_lines, certsBy.get(r.developer_id), r.developer_domain) }
          : r;
      await eachPage(
        (pg) => api.developerEvents(token, t, pg, query, lines, mt, 200, fi),
        200,
        (page) => sink.rows(page.map((d) => publisherCells(withCerts(eventRow(d)), t))),
        progress,
        signal,
      );
    }
    return csvName(
      "publishers",
      TAB_SLUG[t],
      fi !== "all" ? `found in ${fi.replace(/_/g, " ")}` : null,
      mt !== "all" ? mt : null,
      query ? `search ${query}` : null,
    );
  };

  return (
    <div>
      {/* The two control rows (see ListTabsRow). A page turned from the
          pager under the list scrolls back up to here. */}
      <div ref={paging.topRef} className="mb-3 space-y-2">
        <ListTabsRow
          left={
            <>
          <Tabs value={tab} onValueChange={(v) => setTab(v as DrillTab)} className="max-w-full">
            {/* Scrolls sideways on a narrow phone rather than pushing the page wider. */}
            <TabsList className="max-w-full justify-start overflow-x-auto">
              <TabsTrigger value="all">All matched</TabsTrigger>
              <TabsTrigger value="added">Added</TabsTrigger>
              <TabsTrigger value="removed">Removed</TabsTrigger>
              <TabsTrigger value="changed">Changed</TabsTrigger>
              <ScopeTriggers counts={changeCounts} off={watchOff} />
              {inactive && <TabsTrigger value="inactive">Inactive</TabsTrigger>}
            </TabsList>
          </Tabs>
            </>
          }
          right={
            // Not on Inactive: those lists are not split by these.
            tab !== "inactive" && (typeCounts || foundInCounts) && (
              <span className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                {foundInCounts && <FoundInControl value={foundIn} onChange={setFoundIn} counts={foundInCounts} />}
                {typeCounts && <MatchTypeControl value={matchType} onChange={setMatchType} counts={typeCounts} />}
              </span>
            )
          }
        />
        {isScopeTab(tab) && <p data-scope-note className="text-[12px] leading-relaxed text-slate-500">{SCOPE_NOTE[tab]}</p>}
        {tab !== "inactive" && (
          <ListSearchRow
            query={query}
            setQuery={setQuery}
            placeholder="Search publishers"
            label="Search matched publishers"
            right={
              // While new rows are on the way the count waits with them (a
              // skeleton in its place: no number for the old filter under
              // the new one). Then it is the count of the rows on screen,
              // worded for the tab they were read for.
              loading
                ? <CountSkeleton />
                : settled > 0 && !error && rows.length > 0
                ? trial || caps
                  // A trial's list is cut: the count, no pages, no export.
                  ? <CountLine count={total} noun={tabNoun(rowsTab, "publishers").many} />
                  : (
                    <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                      <ExportListButton run={exportList} />
                      <Pager
                        placement="inline"
                        page={page}
                        pageSize={PAGE_SIZE}
                        total={total}
                        onPage={paging.onPage}
                        noun={tabNoun(rowsTab, "publishers").many}
                        nounOne={tabNoun(rowsTab, "publishers").one}
                      />
                    </span>
                  )
                : null
            }
          />
        )}
      </div>
      {/* The skeleton whenever the list waits for its rows, the cold open
          and every change after it (tab, seat lines, match type, search,
          page) alike, never the old rows dimmed. A page already read lands at
          once. The
          trial card, the pager under the list and the IPD note ride inside
          it, so they come and go with the rows. */}
      {tab === "inactive" && inactive ? (
        <InactiveSection
          token={token}
          lines={lines}
          caps={caps}
          counts={inactive.counts}
          kind={inactive.kind}
          setKind={inactive.setKind}
          legacy={inactive.legacy}
          since={inactive.since}
          cards={INACTIVE_CARDS}
        />
      ) : (
      <div>
        {loading && (
          <SkeletonRows
            rows={skeletonRowCount(
              expectedRows(
                { tab, query, lines: lines.join(","), matchType, filter: foundIn },
                { landed, typeCounts, filterCounts: foundInCounts, changeCounts, changeOf: (t) => appChangeOf(t as DrillTab), known },
                page,
                PAGE_SIZE,
              ),
            )}
            label="Loading matched publishers"
          />
        )}
        {error && <p className="text-sm text-critical">{error}</p>}
        {/* `settled > 0`: nothing to show before a first list lands. */}
        {settled > 0 && !error && !loading && (
          <div data-list-rows key={settled}>
            {rows.length === 0 ? (
              <EmptyResult query={query} noun="publishers" quiet={EMPTY_TAB.publishers[rowsTab]} />
            ) : (
              <div className="space-y-3">
                {rows.map((r, i) => (
                  <Settle key={r.developer_id} index={i}>
                    <PublisherCard
                      row={r}
                      token={token}
                      lineFilter={lines}
                      open={expanded === r.developer_id}
                      onToggle={() =>
                        setExpanded(expanded === r.developer_id ? null : r.developer_id)
                      }
                    />
                  </Settle>
                ))}
              </div>
            )}
            {/* On a trial the card stands on every tab, rows or none: the way to
                the full report never depends on the tab the reader is on. */}
            {(caps || trial) && (
              <LockedTail
                slice={trial}
                caps={caps}
                noun={rowsTab === "all" ? "matched publishers" : "publishers with changes"}
                detail="publisher, every line it carries and every change, week after week"
              />
            )}
            {/* The pager under the list, for the reader who has scrolled past
                every row. On a single page it would only repeat the count the
                search row already carries, so it stands only when there are
                pages to turn. */}
            {rows.length > 0 && !trial && !caps && (
              <div className="mt-4">
                {total > PAGE_SIZE && (
                  <Pager
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={total}
                    onPage={paging.onPage}
                    noun={rowsTab === "all" ? "publishers" : "with changes"}
                  />
                )}
                {truncated && <TruncatedNotice shown={total} noun="publishers" />}
              </div>
            )}
            {/* IPD matches this crawl could not confirm: not rows, not
                counted, one quiet line (All matched, never under Own). */}
            {rowsTab === "all" && rowsMatchType !== "own" && (
              <IpdInconclusiveNote data={inconclusive} view="publishers" />
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

/**
 * The right-aligned "Change" column shared by the matched publisher and app
 * rows. Rendered on EVERY row, moved or not, so the emphasised figure to its
 * left ("This week" / "Matched lines") holds the same horizontal position all
 * the way down the list. A row that held steady this week keeps the column's
 * width with a muted placeholder, the one place the house style allows a dash,
 * rather than dropping the column and letting the figures slide right. The
 * +added / -removed / ↻cert grammar is the same one the cards have always used.
 */
function ChangeCell({
  added,
  removed,
  certChanged,
}: {
  added: number;
  removed: number;
  certChanged: number;
}) {
  const moved = added > 0 || removed > 0 || certChanged > 0;
  return (
    <div className="w-[112px]">
      <div className="text-[10px] font-medium tracking-wide text-slate-500">
        Change
      </div>
      {moved ? (
        <div className="font-mono text-sm tabular-nums">
          {added > 0 || removed > 0 ? (
            <>
              <span className="text-ok">+{added}</span>
              <span className="mx-1 text-slate-400">/</span>
              <span className="text-critical">-{removed}</span>
              {certChanged > 0 && (
                <span className="ml-1 text-warn">↻{certChanged}</span>
              )}
            </>
          ) : (
            <span className="text-warn">↻{certChanged}</span>
          )}
        </div>
      ) : (
        <div className="font-mono text-sm tabular-nums text-slate-300">—</div>
      )}
    </div>
  );
}

/**
 * One publisher row, styled the same way as bottomlines-app's
 * HierarchyCard: rounded-3xl white card with generous padding, a
 * colored disc on the left carrying the initial, the identity in the
 * middle, and right-aligned mini stats. Click anywhere on the row to
 * expand, chevron in the corner turns to indicate state. The expanded
 * body picks up a subtle accent tint so it reads as one connected
 * piece rather than two stacked cards.
 */
function PublisherCard({
  row,
  token,
  open,
  onToggle,
  inactive,
  lineFilter = [],
}: {
  row: Row;
  token: string;
  open: boolean;
  onToggle: () => void;
  /** Set on the Inactive tab: the same card, greyed, with its strip. */
  inactive?: InactiveMark & { apps: number | null };
  /** The page's line filter, for what an opened row reads. */
  lineFilter?: string[];
}) {
  const initial = (
    (row.developer_name || row.developer_domain || "?")
      .replace(/^www\./i, "")
      .charAt(0) || "?"
  ).toUpperCase();
  // Embedded line arrays drive the change-aware windows: mock always embeds
  // them, and real data will once the backend does. Today the live
  // matched-developers payload carries only a line_count and none of these
  // arrays, so an embedded-only expansion goes blank. When nothing is embedded,
  // fall back to the lazy per-publisher fetch the shipped viewer used, which
  // restores the flat matched-seat-lines list. The check is on the ARRAYS, not
  // the change counts: absent arrays are the real-data signal.
  // The circle, the name and the domain are one link to the publisher's
  // site: hovering any of them lights the circle and the name together.
  const [siteHover, setSiteHover] = useState(false);
  const hasEmbeddedLines =
    row.matched_lines.length > 0 ||
    row.added_lines.length > 0 ||
    row.removed_lines.length > 0 ||
    row.cert_changed_lines.length > 0;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border shadow-sm transition-colors",
        inactive ? "border-slate-200 bg-slate-50" : "border-border bg-white",
        open && "shadow-md",
      )}
    >
      {/* The header is a real button laid over the row, with the
          publisher's links above it: a link may not sit inside a button,
          for the browser or for a screen reader. The content lets clicks
          through to the button; the links (NESTED) keep theirs. */}
      <div className="relative">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} the seat lines of ${row.developer_name || row.developer_domain || "this publisher"}`}
          className="absolute inset-0 z-0 rounded-t-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
        />
        {inactive && <InactiveStrip mark={inactive} />}
      <div className="pointer-events-none flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5">
        {row.developer_domain ? (
          <PublisherAvatarLink
            domain={row.developer_domain}
            name={row.developer_name || row.developer_domain}
            hover={siteHover}
            onHoverChange={setSiteHover}
          >
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full text-base font-semibold",
                inactive ? "bg-slate-200 text-slate-500" : "bg-accent text-primary",
              )}
            >
              {initial}
            </div>
          </PublisherAvatarLink>
        ) : (
          <div
            className={cn(
              "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-base font-semibold",
              inactive ? "bg-slate-200 text-slate-500" : "bg-accent text-primary",
            )}
          >
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-base font-semibold tracking-tight text-slate-900">
              {/* Never the internal id (David, 2026-10-06: a customer read
                  "Publisher #567486"): the name, else the domain, else a
                  plain word. The API names every row it can. */}
              {row.developer_domain ? (
                // The name links to the publisher's site, like the domain.
                <PublisherDomainLink
                  domain={row.developer_domain}
                  label={row.developer_name || row.developer_domain}
                  active={siteHover}
                  onHoverChange={setSiteHover}
                />
              ) : (
                row.developer_name || "Unnamed publisher"
              )}
            </span>
            {/* The IPD badge only: a publisher carries no platform label
                anywhere in the viewer (David, 2026-10-27); an app says its
                store, and its list splits by platform. */}
            {!inactive && <IpdChip row={row} others={otherPartners(row, row.matched_lines)} />}
            {inactive && <InactiveChip />}
          </div>
          {row.developer_domain && row.developer_name && (
            <div className="flex min-w-0 text-xs text-slate-500">
              <PublisherDomainLink
                domain={row.developer_domain}
                onHoverChange={setSiteHover}
              />
            </div>
          )}
          {/* WHERE ITS FILES ARE (2026-10-21): the declared hosts whose
              app-ads.txt hold some of this publisher's lines. One quiet
              line, only when there are any; the lines below say which. */}
          {!inactive && <IpdWhere row={row} others={otherPartners(row, row.matched_lines)} />}
          {fileHostsLabel(row.file_hosts) && (
            <div data-file-hosts className="truncate text-[11px] text-slate-400">
              {fileHostsLabel(row.file_hosts)}
            </div>
          )}
        </div>
        {inactive ? (
          <div className="hidden items-center gap-6 text-right sm:flex">
            <div className="w-[84px]">
              <MiniStat label="Your lines" value={row.current} emphasis />
            </div>
            <div className="w-[112px]">
              <MiniStat label="Apps" value={inactive.apps ?? 0} />
            </div>
          </div>
        ) : (
        <div className="hidden items-center gap-6 text-right sm:flex">
          {row.prev != null && (
            <div className="w-[84px]">
              <MiniStat label="Last week" value={row.prev} />
            </div>
          )}
          <div className="w-[84px]">
            <MiniStat label="This week" value={row.current} emphasis />
          </div>
          <ChangeCell
            added={row.added}
            removed={row.removed}
            certChanged={row.cert_changed}
          />
        </div>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </div>
      </div>
      <Collapse open={open}>
        <div
          className={cn(
            "border-t px-4 pb-4 pt-3 sm:px-5",
            inactive ? "border-slate-200 bg-slate-100/50" : "border-border bg-accent/30",
          )}
        >
          {inactive ? (
            row.matched_lines.length > 0 ? (
              <MatchedSeatLines
                title="Your seat lines it carried"
                lines={row.matched_lines}
                publisherDomain={row.developer_domain}
              />
            ) : (
              <p className="text-xs text-slate-500">No seat lines on record for this publisher.</p>
            )
          ) : (
            <>
              {row.scope ? (
                <ScopeWindow token={token} mark={row.scope} developerId={row.developer_id} publisherDomain={row.developer_domain} />
              ) : hasEmbeddedLines ? (
                <ChangeExpansion
                  added={row.added_lines}
                  removed={row.removed_lines}
                  certChanged={row.cert_changed_lines}
                  matched={row.matched_lines}
                  // Own lines open the publisher's file; each partner's
                  // lines open that partner's ads.txt.
                  publisherDomain={row.developer_domain}
                  rowPartner={rowPartnerOf(row)}
                  certRead={
                    row.cert_changed_lines.length > 0
                      ? { token, developerId: row.developer_id, filter: lineFilter }
                      : undefined
                  }
                />
              ) : (
                <LazyMatchedSeatLines
                  token={token}
                  developerId={row.developer_id}
                  publisherDomain={row.developer_domain}
                  rowPartner={rowPartnerOf(row)}
                />
              )}
            </>
          )}
        </div>
      </Collapse>
    </div>
  );
}

/** One change kind a card's expansion can show. */
type ChangeKind = "added" | "removed" | "cert";

/** How many lines a window prints before it tails the rest as "plus N more". */
const CHANGE_LINE_CAP = 8;

/**
 * Per-kind window styling, written as whole literal class strings so Tailwind
 * keeps them: `added` wears the green ok/publisher tone, `removed` the muted
 * red critical tone, `cert` the amber warn tone the suite uses for a rotation.
 */
const CHANGE_WINDOW: Record<
  ChangeKind,
  {
    title: string;
    glyph: string;
    text: string;
    head: string;
    border: string;
    muted?: boolean;
  }
> = {
  added: {
    title: "Added lines",
    glyph: "+",
    text: "text-ok",
    head: "bg-ok-bg/60",
    border: "border-ok-border",
  },
  removed: {
    title: "Removed lines",
    glyph: "-",
    text: "text-critical",
    head: "bg-critical-bg/60",
    border: "border-critical-border",
    muted: true,
  },
  cert: {
    title: "Cert changes",
    glyph: "↻",
    text: "text-warn",
    head: "bg-warn-bg/60",
    border: "border-warn-border",
  },
};

/**
 * One seat line in the mono grammar the whole report prints a line in:
 * `ssp_domain, publisher_id, RELATIONSHIP` with an optional dimmed cert hash.
 * `muted` dims a removed line so it reads as gone without losing legibility.
 * Shared by the change windows, the flat matched-seat-lines list AND the
 * Changes page's expanded cards (David, 2026-10-27: one look for matched
 * seat lines on both pages), so a row looks identical wherever it appears.
 * Each row leads with its gutter number (`n`), its place in its own list.
 */
export function SeatLineRow({
  line,
  n,
  digits,
  muted,
  gone,
  publisherDomain,
  change,
  label,
  notes,
  dates: givenDates,
  partners = [],
  own,
}: {
  line: MatchedSeatLine;
  /** The row's place in its list (1, 2, 3 ...), and the width of the
   *  list's longest number, so the gutter is one right-aligned column. */
  n: number;
  digits: number;
  muted?: boolean;
  /** The line has left the publisher's file: a click copies it. */
  gone?: boolean;
  /** Whose line this is: with it, the line opens their file at it. */
  publisherDomain?: string | null;
  /** Set inside a change window: the row says WHEN, under the line. A
   *  removed line says when it was last seen and first not found, an added
   *  one when it was first seen and last absent, a cert change when the new
   *  cert was seen. A date the report does not carry reads "date not
   *  available", never the crawl's time dressed up as the file's. */
  change?: ChangeKind;
  /** The row's text when it is not the line itself (the Changes page's
   *  cards name the publisher; the line is the card's own title). */
  label?: ReactNode;
  /** Notes under the text, before the dates (a reason, in the caller's
   *  words). */
  notes?: ReactNode;
  /** The dates, when the caller knows them better than `change` does. */
  dates?: string | null;
  /** The inventory partners whose ads.txt carries the line (2026-10-27:
   *  one row per distinct line, its partners beside it). */
  partners?: string[];
  /** Whether the line is (also) in the publisher's own file, or the host
   *  file named on it. Default: when no partner carries it. */
  own?: boolean;
}) {
  const inOwn = own ?? partners.length === 0;
  const dates =
    givenDates !== undefined
      ? givenDates
      : change === "removed"
        ? removedDates(line)
        : change === "added"
          ? addedDates(line)
          : change === "cert"
            ? certDates(line)
            : null;
  // Why it was removed, when the report says (2026-10-26).
  const removal = change === "removed" ? removalReasonText(line) : null;
  const text = (
    <div className="min-w-0 flex-1">
      {label ?? (
        <RowText muted={muted}>
          {line.ssp_domain}, {line.publisher_id}, {line.relationship}
          {line.cert_id && <span className="font-normal text-slate-400">, {line.cert_id}</span>}
        </RowText>
      )}
      {notes}
      {change === "cert" && typeof line.old_cert_id === "string" && (
        <RowNote data-cert-change>
          cert <code className="font-mono">{line.old_cert_id || "not set"}</code> {"\u2192"}{" "}
          <code className="font-mono text-slate-700">{line.cert_id || "not set"}</code>
        </RowNote>
      )}
      {removal && (
        <RowNote tone="reason" data-removal-reason>
          {removal}
        </RowNote>
      )}
      {dates && (
        <RowNote data-line-dates title={dateTitle(line.date_source)}>
          {dates}
        </RowNote>
      )}
    </div>
  );
  const gutter = <LineNo n={n} digits={digits} />;
  // THE FILE'S HOST (2026-10-21): a line credited from a declared host's
  // app-ads.txt lives in THAT file, so the row opens it there and says so
  // at the margin, after the file name. The publisher's own file, or a
  // host that is the publisher's domain, says nothing extra. A line only
  // a partner carries opens that partner's ads.txt (2026-10-27: every line
  // used to open the row's first partner's file, whoever carried it).
  const fileDomain = inOwn ? line.host || publisherDomain : partners[0];
  const foundIn = inOwn ? line.found_in : "ads.txt";
  const hostLabel = inOwn ? lineHostLabel(line.host, publisherDomain) : null;
  const host = hostLabel && (
    <span data-line-host className={ROW_MARGIN}>
      {hostLabel}
    </span>
  );
  // ON A PHONE THE PARTNERS GO UNDER THE LINE (David, 2026-10-27): at
  // the right margin they took the width and cut the line to "st...". Below
  // the sm breakpoint they are a line of their own under it, at the line
  // text's left edge (a spacer the gutter's width); from sm up the wrapper
  // is `display: contents`, so they sit at the margin exactly as before.
  const via = partners.length > 0 && (
    <span data-line-via-row className="order-last flex min-w-0 basis-full gap-3 sm:contents">
      <span aria-hidden className="flex-shrink-0 font-mono text-[11px] leading-4 sm:hidden" style={{ width: `${Math.max(4, digits)}ch` }} />
      <PartnerLinks
        partners={partners}
        line={line}
        gone={gone}
        className="text-[10px] leading-4 text-slate-400 max-sm:min-w-0 max-sm:max-w-none max-sm:flex-shrink max-sm:whitespace-normal max-sm:break-words max-sm:text-left"
      />
    </span>
  );
  // The row may wrap on a phone (the partners' own line); never wider up.
  const rowClass = cn(SEAT_ROW, "flex-wrap gap-y-0.5 sm:flex-nowrap");
  // A removed line copies on click (David, 2026-10-20): it is no longer in
  // the file, so the file opens from its own link at the margin instead.
  if (gone)
    return (
      <CopyableLine line={line} className={rowClass}>
        {gutter}
        {text}
        {inOwn && <FoundInLinks publisherDomain={fileDomain} foundIn={foundIn} className={ROW_MARGIN} />}
        {host}
        {via}
      </CopyableLine>
    );
  return (
    // THE FILE GOES TO THE RIGHT MARGIN (David, 2026-09-26). Trailing the
    // line, it read as a fourth field of the ads.txt record, which it is
    // not, and it moved with the length of the cert so no two rows agreed
    // on where it sat. At the margin it forms a column the eye can run
    // down. The cert stays inline, because that one IS part of the line.
    <ActionableLine
      line={line}
      publisherDomain={fileDomain}
      foundIn={foundIn}
      className={rowClass}
    >
      {gutter}
      {text}
      {inOwn && foundInLabel(foundIn) && <span className={ROW_MARGIN}>{foundInLabel(foundIn)}</span>}
      {host}
      {via}
    </ActionableLine>
  );
}

/**
 * One titled window of change lines: a toned header carrying the count, above a
 * white list of the lines. Used full width on its own for a single-kind change,
 * and as a tile in the side-by-side grid for a mixed one. The header count is
 * the honest total; a long list prints the first few and tails the rest.
 */
function ChangeWindow({
  kind,
  lines,
  publisherDomain,
  rowPartner,
  certRead,
}: {
  kind: ChangeKind;
  lines: MatchedSeatLine[];
  publisherDomain?: string | null;
  rowPartner?: string | null;
  /** A cert window: whose old certs to read (the row's own, on open). */
  certRead?: CertRead;
}) {
  const s = CHANGE_WINDOW[kind];
  // THE CERT, OLD TO NEW (David, 2026-10-27), read for this row only.
  const certs = useRowCerts(kind === "cert" ? certRead : undefined);
  // One row per distinct line, its partners beside it (2026-10-27).
  const groups = groupSeatLines(withOldCerts(lines, certs, publisherDomain), rowPartner);
  const shown = groups.slice(0, CHANGE_LINE_CAP);
  const extra = groups.length - shown.length;
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border bg-white shadow-sm",
        s.border,
      )}
    >
      <div
        className={cn(
          "flex items-baseline justify-between gap-2 border-b px-3 py-1.5",
          s.border,
          s.head,
        )}
      >
        <span
          className={cn("flex items-baseline gap-1.5 text-xs font-medium", s.text)}
        >
          <span className="font-mono">{s.glyph}</span>
          {s.title}
        </span>
        <span
          className={cn(
            "font-mono text-[11px] font-semibold tabular-nums",
            s.text,
          )}
        >
          {groups.length}
        </span>
      </div>
      {/* Why a removal carries two dates, said once where the dates are. */}
      {kind === "removed" && (
        <p className="border-b border-border px-3 py-1 text-[10px] leading-snug text-slate-500">
          {WEEKLY_READ_NOTE}
        </p>
      )}
      <ul className="bl-lines-in divide-y divide-border">
        {shown.map((g, i) => (
          <SeatLineRow
            key={`${seatKey(g.line)}:${i}`}
            line={g.line}
            partners={g.partners}
            own={g.own}
            n={i + 1}
            digits={gutterDigits(shown.length)}
            muted={s.muted}
            gone={kind === "removed"}
            publisherDomain={publisherDomain}
            change={kind}
          />
        ))}
      </ul>
      {extra > 0 && (
        <p className="border-t border-border px-3 py-1 text-[10px] text-slate-500">
          Plus {extra} more.
        </p>
      )}
    </section>
  );
}

/**
 * The expand body under a matched publisher or app row, shaped to WHAT changed
 * this week for that subject:
 *
 *   - only lines added   → one green "Added lines" window
 *   - only lines removed  → one muted-red "Removed lines" window
 *   - a mix (and/or a cert rotation) → the windows side by side on desktop,
 *     stacked on mobile, each listing its own lines
 *   - nothing moved (matched but steady) → the flat "Matched seat lines" list,
 *     unchanged from before
 *
 * The windows are driven by the same arrays whose lengths feed the card's
 * header badge, so the badge and the expansion can never disagree.
 */
function ChangeExpansion({
  added,
  removed,
  certChanged,
  matched,
  publisherDomain,
  rowPartner,
  certRead,
}: {
  added: MatchedSeatLine[];
  removed: MatchedSeatLine[];
  certChanged: MatchedSeatLine[];
  matched: MatchedSeatLine[];
  /** Whose lines these are, so each copies and opens their file. */
  publisherDomain?: string | null;
  /** An IPD row's partner, for lines from a report that does not say
   *  per line which partner carried them. */
  rowPartner?: string | null;
  /** A row with cert changes: whose old certs its Changed window reads. */
  certRead?: CertRead;
}) {
  const sections: { kind: ChangeKind; lines: MatchedSeatLine[] }[] = [];
  if (added.length) sections.push({ kind: "added", lines: added });
  if (removed.length) sections.push({ kind: "removed", lines: removed });
  if (certChanged.length) sections.push({ kind: "cert", lines: certChanged });

  // Nothing moved this week: keep the standing matched-seat-lines list as-is.
  if (sections.length === 0) {
    if (matched.length > 0)
      return <MatchedSeatLines lines={matched} publisherDomain={publisherDomain} rowPartner={rowPartner} />;
    return (
      <p className="text-xs text-slate-500">
        No matched seat lines on record for this row.
      </p>
    );
  }

  // A single kind of change: one full-width window.
  if (sections.length === 1) {
    return (
      <ChangeWindow
        kind={sections[0].kind}
        lines={sections[0].lines}
        publisherDomain={publisherDomain}
        rowPartner={rowPartner}
        certRead={sections[0].kind === "cert" ? certRead : undefined}
      />
    );
  }

  // A mixed change: windows side by side on desktop, stacked on mobile. With
  // three (added + removed + a cert rotation), the cert window spans the row
  // beneath the added / removed pair so the two headline columns stay aligned.
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {sections.map((sec, i) => (
        <div
          key={sec.kind}
          className={cn(sections.length === 3 && i === 2 && "sm:col-span-2")}
        >
          <ChangeWindow
            kind={sec.kind}
            lines={sec.lines}
            publisherDomain={publisherDomain}
            rowPartner={rowPartner}
            certRead={sec.kind === "cert" ? certRead : undefined}
          />
        </div>
      ))}
    </div>
  );
}

// MiniStat lives in its own module so the No longer live cards can use it
// without importing this route (no import cycle); re-exported for the pages.
export { MiniStat };

/**
 * The matched seat line(s) block, in the same mono line style the Changes and
 * Discovery pages use. Shared by the publisher expansion and the app
 * expansion so a line reads identically wherever it appears. Renders nothing
 * when there are no lines, so callers can drop it in unconditionally.
 */
function MatchedSeatLines({
  lines,
  publisherDomain,
  rowPartner,
  title = "Matched seat lines",
}: {
  lines: MatchedSeatLine[];
  publisherDomain?: string | null;
  /** An IPD row's partner, for lines that do not name their own. */
  rowPartner?: string | null;
  /** The block's heading; the Inactive cards say whose lines these were. */
  title?: string;
}) {
  // One row per distinct line, its partners beside it (David, 2026-10-27):
  // the count and the numbers count lines, as "This week" does.
  const groups = groupSeatLines(lines, rowPartner);
  if (groups.length === 0) return null;
  const digits = gutterDigits(groups.length);
  return (
    <div>
      <SeatLinesHead title={title} count={groups.length} />
      <SeatLinesFrame>
        {groups.map((g, i) => (
          <SeatLineRow
            key={`${seatKey(g.line)}:${i}`}
            line={g.line}
            partners={g.partners}
            own={g.own}
            n={i + 1}
            digits={digits}
            publisherDomain={publisherDomain}
          />
        ))}
      </SeatLinesFrame>
    </div>
  );
}

/**
 * Seat lines for a matched publisher, fetched lazily when the row embeds none.
 *
 * The overview's matched-developers payload embeds a publisher's seat lines
 * under mock (and will on the backend once it embeds them), and PublisherCard
 * renders those directly through the change-aware ChangeExpansion. The live
 * backend today sends only a line_count with no embedded arrays, so this
 * restores the shipped viewer's behaviour: on expand, pull the publisher's seat
 * lines from the line-events endpoint (api.linesForDeveloper) and render them as
 * the same flat "matched seat lines" list a steady row shows. Quiet while it
 * loads, quiet if it returns nothing, quiet if the request fails, never a thrown
 * error or a blank expansion.
 */
function LazyMatchedSeatLines({
  token,
  developerId,
  publisherDomain,
  rowPartner,
}: {
  token: string;
  developerId: number;
  publisherDomain?: string | null;
  rowPartner?: string | null;
}) {
  const [lines, setLines] = useState<MatchedSeatLine[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLines(null);
    setFailed(false);
    api
      .linesForDeveloper(token, developerId)
      .then((page) => {
        if (!cancelled) setLines(page.rows.map(lineEventToSeatLine));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, developerId]);

  if (failed) {
    return (
      <p className="text-xs text-slate-500">
        Could not load the seat lines for this publisher.
      </p>
    );
  }
  // The same loading state as a Changes card (David, 2026-10-27): the
  // block's own shape in the theme's muted tone, never a word.
  if (lines === null) {
    return <SeatLinesSkeleton label="Loading seat lines" />;
  }
  if (lines.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No matched seat lines on record for this row.
      </p>
    );
  }
  return <MatchedSeatLines lines={lines} publisherDomain={publisherDomain} rowPartner={rowPartner} />;
}

/**
 * Map a lazily fetched line event onto the seat-line shape the flat list
 * renders. The live line-events endpoint carries the cert in old/new_cert_id;
 * the current cert (new, else old) is the one a standing seat line shows, and an
 * empty string collapses to no cert exactly as an embedded line would.
 */
function lineEventToSeatLine(e: LineEvent): MatchedSeatLine {
  return {
    ssp_domain: e.ssp_domain,
    publisher_id: e.publisher_id,
    relationship: e.relationship,
    cert_id: e.new_cert_id || e.old_cert_id || undefined,
    // The file's host: the publisher's own domain on its own file, which
    // the row then keeps quiet about.
    ...(e.host ? { host: e.host } : {}),
    // And the file (re-review of #75): without it the same seat in the
    // ads.txt and the app-ads.txt folded into one row on this path.
    ...(typeof e.file_kind === "string" && e.file_kind ? { found_in: fileLabelOf(e.file_kind) } : {}),
    // Which partner carried it, when the event says (2026-10-27).
    ...(e.match_type ? { match_type: e.match_type } : {}),
    ...(e.ipd_partner ? { ipd_partner: e.ipd_partner } : {}),
  };
}

/** The change tabs, as the crawler's ``?change=`` names them. */
function appChangeOf(tab: DrillTab): AppChange | undefined {
  if (isScopeTab(tab)) return WATCH_CHANGE[tab];
  return tab === "added" || tab === "removed" || tab === "changed" ? tab : undefined;
}
/** The same filter in the browser, for an API that ignores ``?change=``. */
function appMoved(a: MatchedApp, change: AppChange): boolean {
  if (change === "added") return (a.lines_added ?? 0) > 0;
  if (change === "removed") return (a.lines_removed ?? 0) > 0;
  if (change === "changed") return (a.lines_cert_changed ?? 0) > 0;
  // A watch filter is the server's only: never applied to a page here.
  return true;
}

/**
 * The matched APPS list, shown when the pink "Matched apps" card is selected.
 * A card-per-app list, the pink sibling of the publisher drilldown: same
 * shape, same expansion, same Added / Removed / Changed tabs, a different
 * family colour. An app that did not move this week appears under "All
 * matched" only.
 *
 * The change tabs ask the server for the WHOLE list filtered by the change
 * (``?change=``), paged and counted like All matched. An API from before
 * that filter ignores the parameter (it echoes no ``change``): the tab then
 * filters the page it got, and its count says it covers that page only,
 * never the whole list (Select Media, 2026-10-26: "0 with changes" on a
 * report with 82 apps lost).
 */
/** An app row; on a watch tab it carries its publisher's lines of that
 *  kind. */
type AppRow = MatchedApp & { scope?: WatchMark };

function MatchedAppsList({
  token,
  lines,
  caps,
  inactive,
  tab,
  setTab,
  openFirst,
  matchType,
  setMatchType,
  platform,
  setPlatform,
  searchReset,
  known,
}: {
  token: string;
  lines: string[];
  caps: TrialCaps | null;
  /** The Inactive tab's wiring; null when nothing is inactive (no tab). */
  inactive: InactiveTab;
  /** Owned by the page, so the line cards above can pick the tab. */
  tab: DrillTab;
  setTab: (tab: DrillTab) => void;
  /** Each bump opens the first row of the next list to land. */
  openFirst: number;
  /** All / Own / IPD, owned by the page (survives the view switch). */
  matchType: MatchTypeFilter;
  setMatchType: (next: MatchTypeFilter) => void;
  /** All / CTV / Mobile / Web, the page's too (apps only). */
  platform: PlatformFilter;
  setPlatform: (next: PlatformFilter) => void;
  /** Bumped by a Popular choice: the search clears. */
  searchReset: number;
  /** Counts the page read for the Popular choices (expectedRows). */
  known?: Record<string, number> | null;
}) {
  const [allRows, setAllRows] = useState<AppRow[]>([]);
  // The list's split by platform (crawler PR): null, no Platform switch.
  const [platformCounts, setPlatformCounts] = useState<PlatformCounts | null>(null);
  // The watch tabs (crawler #361), as on the publishers list.
  const [changeCounts, setChangeCounts] = useState<ChangeCounts | null>(null);
  const [watchOff, setWatchOff] = useState(false);
  // The list's split and its inconclusive IPD matches (crawler #348).
  const [typeCounts, setTypeCounts] = useState<MatchTypeCounts | null>(null);
  const [inconclusive, setInconclusive] = useState<IpdInconclusive | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const paging = usePaging(setPage);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (searchReset) setQuery("");
  }, [searchReset]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  /** The cut this trial report made to the list, or null on a full report. */
  const [trial, setTrial] = useState<TrialSlice | null>(null);

  const keyOf = (a: AppRow) => `${a.store}:${a.bundle_id}`;
  const appCache = usePageCache<unknown>();
  const [settled, setSettled] = useState(0);
  // The size of the list last read, for the skeleton's row count.
  const [landed, setLanded] = useState<Landed | null>(null);
  // The tab the rows on screen were read for, and whether the server
  // filtered them for it (it echoed ``change``). Both lag `tab` until the
  // new tab's list lands.
  const [rowsTab, setRowsTab] = useState<DrillTab>(tab);
  const [serverFiltered, setServerFiltered] = useState(false);
  // The match type the rows on screen were read for (the note follows it).
  const [rowsMatchType, setRowsMatchType] = useState<MatchTypeFilter>(matchType);

  // A new search, a new tab or a new line selection is a new list and
  // starts at its first page.
  useEffect(() => {
    setPage(1);
  }, [tab, query, lines, matchType, platform]);

  // Same rule as the publishers list above: whenever the list waits for
  // rows it shows the skeleton. Under Inactive the rows stay as they were
  // (that section reads its own lists).

  useEffect(() => {
    if (tab === "inactive") return;
    let cancelled = false;
    const change = appChangeOf(tab);
    // A WATCH TAB (crawler #361): the server's filter, one list like any
    // other; each app carries the tab, its publisher's lines read on open.
    const load = (pg: number): Promise<MatchedAppsPage & { rows: AppRow[] }> =>
      api.matchedApps(token, pg, query, lines, matchType, change, PAGE_SIZE, platform).then((r) =>
        isScopeTab(tab) ? { ...r, rows: (r.rows ?? []).map((a) => ({ ...a, scope: { tab, filter: lines, lines: watchLinesOf(a, tab) } })) } : r,
      );
    type Loaded = Awaited<ReturnType<typeof load>>;
    const keyFor = (pg: number) =>
      [isScopeTab(tab) ? tab : change ?? "all", pg, query, lines.join(","), matchType, platform].join("|");
    const apply = (r: Loaded) => {
      setLanded({ tab, query, lines: lines.join(","), matchType, filter: platform, total: r.total ?? 0 });
      if (r.change_counts) setChangeCounts(r.change_counts);
      if (isScopeTab(tab) && r.change !== change) {
        // A watch filter the API did not apply: no watch tabs at all, and
        // never a list filtered here on its own.
        setWatchOff(true);
        setTab("all");
        return;
      }
      // No split said, no pills: and no filter left on from them.
      if (!r.match_type_counts && matchType !== "all") setMatchType("all");
      const split = splitOf(r.platform_counts, r.platform, platform);
      if (!split && platform !== "all") setPlatform("all");
      setPlatformCounts(split);
      setRowsTab(tab);
      setServerFiltered(!!change && r.change === change);
      setAllRows(r.rows ?? []);
      setTypeCounts(r.match_type_counts ?? null);
      setInconclusive(r.ipd_inconclusive ?? null);
      setRowsMatchType(r.match_type_counts ? matchType : "all");
      setTotal(r.total ?? 0);
      setTruncated(r.truncated ?? false);
      setTrial(r.trial ?? null);
      setSettled((n) => n + 1);
    };
    // Same read-ahead as the publishers list, and the same pause while a
    // search is being typed.
    const readAhead = (r: Loaded) => {
      if (!query && page * PAGE_SIZE < (r.total ?? 0)) {
        appCache.prefetch(keyFor(page + 1), () => load(page + 1));
      }
    };
    setFailed(false);
    setExpanded(null);
    const kept = appCache.get(keyFor(page)) as Loaded | undefined;
    if (kept) {
      apply(kept);
      setLoading(false);
      readAhead(kept);
      return;
    }
    setLoading(true);
    load(page)
      .then((r) => {
        appCache.put(keyFor(page), r);
        if (!cancelled) {
          apply(r);
          readAhead(r);
        }
      })
      .catch(() => {
        // The matched-apps endpoint is not on the backend yet, so a failed
        // fetch is the expected real-data case, not an error to shout about.
        // Degrade to an empty list and a quiet empty state below rather than a
        // red error or a blank card region. The "Matched apps" KPI is unaffected:
        // its number comes from the summary, not this list.
        if (!cancelled) {
          setRowsTab(tab);
          setServerFiltered(false);
          setAllRows([]);
          setTypeCounts(null);
          setInconclusive(null);
          setTotal(0);
          setFailed(true);
          setSettled((n) => n + 1);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, tab, page, query, lines, matchType, setMatchType, platform, setPlatform, setTab, appCache]);

  // A watch tab its count says is empty (or an API without the filter) is
  // not offered: a page left on it reads as All matched.
  useEffect(() => {
    if (isScopeTab(tab) && (watchOff || (changeCounts && !watchTabOn(changeCounts, watchOff, tab)))) setTab("all");
  }, [tab, changeCounts, watchOff, setTab]);

  // A card held open from one tab must not appear under another.
  useEffect(() => setExpanded(null), [tab]);

  // The server's rows are the answer when it filtered them; otherwise (an
  // API that ignores ?change=) the change tab filters the page it got.
  const rowsChange = appChangeOf(rowsTab);
  // Only Added, Removed and Changed ever fall back to the page; a watch
  // tab without the server's filter is not offered at all.
  const pageFiltered = !!rowsChange && !serverFiltered && !isScopeTab(rowsTab);
  const rows = useMemo(
    () => (pageFiltered && rowsChange ? allRows.filter((a) => appMoved(a, rowsChange)) : allRows),
    [allRows, pageFiltered, rowsChange],
  );
  // What the count and the pager call the rows they count.
  const noun = tabNoun(rowsTab, "apps").many;

  useOpenFirst(
    openFirst,
    !loading && settled > 0 && rowsTab === tab,
    rows[0] ? keyOf(rows[0]) : null,
    setExpanded,
  );

  // EXPORT THIS LIST: every page of what the tab, filters and search show,
  // each page into the file as it arrives. Offered only where the server
  // filtered the list (never on a page-filtered change tab).
  const exportList = async (sink: CsvSink, progress: Progress, signal: AbortSignal): Promise<string> => {
    const t = rowsTab;
    const mt = rowsMatchType;
    const pf: PlatformFilter = platformCounts ? platform : "all";
    const change = appChangeOf(t);
    sink.header(APP_CSV);
    // Old to new on the Changed tab, as on the page (see the publishers').
    const certsBy = t === "changed" ? await allCertChanges(token, lines, undefined, signal) : null;
    const withCerts = (a: AppRow): AppRow =>
      certsBy && a.developer_id != null
        ? { ...a, cert_changed_lines: withOldCerts(a.cert_changed_lines ?? [], certsBy.get(a.developer_id), a.owner_domain) }
        : a;
    if (t !== "inactive")
      await eachPage(
        async (pg) => {
          const r = await api.matchedApps(token, pg, query, lines, mt, change, READ_PAGE, pf);
          if (change && r.change !== change) throw new Error("This list cannot be exported here.");
          return r;
        },
        READ_PAGE,
        (page) =>
          sink.rows(
            page.map((a) =>
              appCells(isScopeTab(t) ? { ...a, scope: { tab: t, filter: lines, lines: watchLinesOf(a, t) } } : withCerts(a), t),
            ),
          ),
        progress,
        signal,
      );
    return csvName("apps", TAB_SLUG[t], pf !== "all" ? pf : null, mt !== "all" ? mt : null, query ? `search ${query}` : null);
  };

  return (
    <div>
      {/* The two control rows, as on the publishers list. */}
      <div ref={paging.topRef} className="mb-3 space-y-2">
        <ListTabsRow
          left={
            <>
          <Tabs value={tab} onValueChange={(v) => setTab(v as DrillTab)} className="max-w-full">
            {/* Scrolls sideways on a narrow phone rather than pushing the page wider. */}
            <TabsList className="max-w-full justify-start overflow-x-auto">
              <TabsTrigger value="all">All matched</TabsTrigger>
              <TabsTrigger value="added">Added</TabsTrigger>
              <TabsTrigger value="removed">Removed</TabsTrigger>
              <TabsTrigger value="changed">Changed</TabsTrigger>
              <ScopeTriggers counts={changeCounts} off={watchOff} />
              {inactive && <TabsTrigger value="inactive">Inactive</TabsTrigger>}
            </TabsList>
          </Tabs>
            </>
          }
          right={
            tab !== "inactive" && (typeCounts || platformCounts) && (
              <span className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                {platformCounts && <PlatformControl value={platform} onChange={setPlatform} counts={platformCounts} />}
                {typeCounts && (
                  <MatchTypeControl
                    value={matchType}
                    onChange={setMatchType}
                    // The server's split is known to count All matched only:
                    // no number in the change tabs' tooltips rather than a
                    // wrong one.
                    counts={tab === "all" || isScopeTab(tab) ? typeCounts : null}
                  />
                )}
              </span>
            )
          }
        />
        {isScopeTab(tab) && <p data-scope-note className="text-[12px] leading-relaxed text-slate-500">{SCOPE_NOTE[tab]}</p>}
        {tab !== "inactive" && (
          <ListSearchRow
            query={query}
            setQuery={setQuery}
            placeholder="Search apps"
            label="Search matched apps"
            right={
              // The pager counts the SERVER's total: All matched, or a
              // change tab the server filtered. A change tab filtered in
              // the browser counts the page it got, says so, and pages
              // nothing: paging it would be a claim the data cannot support.
              loading
                ? <CountSkeleton />
                : settled > 0 && !failed && rows.length > 0
                ? trial || caps
                  ? <CountLine count={pageFiltered ? rows.length : total} noun={pageFiltered ? "on this page" : noun} />
                  : (
                    <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                      {!pageFiltered && <ExportListButton run={exportList} />}
                      {pageFiltered ? (
                        <CountLine count={rows.length} noun="on this page" />
                      ) : (
                        <Pager
                          placement="inline"
                          page={page}
                          pageSize={PAGE_SIZE}
                          total={total}
                          onPage={paging.onPage}
                          noun={noun}
                          nounOne={tabNoun(rowsTab, "apps").one}
                        />
                      )}
                    </span>
                  )
                : null
            }
          />
        )}
      </div>
      {tab === "inactive" && inactive ? (
        <InactiveSection
          token={token}
          lines={lines}
          caps={caps}
          counts={inactive.counts}
          kind={inactive.kind}
          setKind={inactive.setKind}
          legacy={inactive.legacy}
          since={inactive.since}
          cards={INACTIVE_CARDS}
        />
      ) : (
      <>
      {loading && (
        <SkeletonRows
          rows={skeletonRowCount(
            expectedRows(
              { tab, query, lines: lines.join(","), matchType, filter: platform },
              { landed, typeCounts, filterCounts: platformCounts, changeCounts, changeOf: (t) => appChangeOf(t as DrillTab), known },
              page,
              PAGE_SIZE,
            ),
          )}
          label="Loading matched apps"
        />
      )}
      {/* The skeleton while the rows are on the way, as on the publishers
          list; a page already read lands at once. */}
      {settled > 0 && !loading && (
        <div data-list-rows key={settled}>
          {rows.length === 0 ? (
            failed ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-slate-500">
                No matched apps to show yet.
              </p>
            ) : pageFiltered ? (
              <EmptyResult query={query} noun="apps with changes" onPage />
            ) : (
              <EmptyResult query={query} noun="apps" quiet={EMPTY_TAB.apps[rowsTab]} />
            )
          ) : (
            <div className="space-y-3">
              {rows.map((a, i) => (
                <Settle key={keyOf(a)} index={i}>
                  <MatchedAppCard
                    app={a}
                    lineFilter={lines}
                    open={expanded === keyOf(a)}
                    onToggle={() =>
                      setExpanded(expanded === keyOf(a) ? null : keyOf(a))
                    }
                    token={token}
                  />
                </Settle>
              ))}
            </div>
          )}
          {!failed && (caps || trial) && (
            <LockedTail
              slice={trial}
              caps={caps}
              noun="matched apps"
              detail="app, its store listing and every line it carries"
            />
          )}
          {/* The pager under the list, only when there are pages to turn (the
              search row carries the count). */}
          {!failed && !pageFiltered && rows.length > 0 && !trial && !caps && (
            <div className="mt-4">
              {total > PAGE_SIZE && (
                <Pager
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={total}
                  onPage={paging.onPage}
                  noun={noun}
                />
              )}
              {rowsTab === "all" && truncated && <TruncatedNotice shown={total} noun="apps" />}
            </div>
          )}
          {!failed && rowsTab === "all" && rowsMatchType !== "own" && (
            <IpdInconclusiveNote data={inconclusive} view="apps" />
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}

/**
 * One matched app row, the pink sibling of PublisherCard: same rounded-3xl
 * card, same 44px disc, same right-aligned MiniStat, same chevron, same
 * tinted expansion. The face carries the app name, its store tag, and the
 * PUBLISHER that owns it, labelled so an app is always tied back to a
 * publisher the reader can also find under Matched publishers. When the app
 * moved this week it also shows the change. Expanding reflects WHAT moved,
 * through the shared ChangeExpansion: added and removed windows when it moved,
 * or the flat matched-seat-lines block when it held steady.
 */
function MatchedAppCard({
  app,
  open,
  onToggle,
  token,
  inactive,
  lineFilter = [],
}: {
  app: AppRow;
  open: boolean;
  onToggle: () => void;
  token: string;
  /** Set on the Inactive tab: the same card, greyed, with its strip.
   *  `publisherLive` says whether the app's publisher is still live (null:
   *  not known). */
  inactive?: InactiveMark & { publisherLive: boolean | null };
  /** The page's line filter, for what an opened row reads. */
  lineFilter?: string[];
}) {
  const lines = app.matched_lines ?? [];
  const added = app.lines_added ?? 0;
  const removed = app.lines_removed ?? 0;
  const certChanged = app.lines_cert_changed ?? 0;
  // Real-data rows carry no embedded line arrays (the list stays cheap); when
  // none are present we lazy-fetch the owning developer's seat lines, exactly
  // as PublisherCard does. Mock rows embed them, so the change windows render.
  const hasEmbeddedLines =
    lines.length > 0 ||
    (app.added_lines ?? []).length > 0 ||
    (app.removed_lines ?? []).length > 0 ||
    (app.cert_changed_lines ?? []).length > 0;
  // WHICH FILE CREDITED THIS APP (2026-10-21): the app-ads.txt at the host
  // its store listing declares, or the publisher's own, in plain words.
  // Null on a report frozen before the crawler said.
  const fileLine = appFileLine(app.file_host, app.file_source);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border shadow-sm transition-colors",
        inactive
          ? cn("border-slate-200 bg-slate-50", open && "shadow-md")
          : open
            ? "border-app-border bg-app-bg/40 shadow-md"
            : "border-border bg-white",
      )}
    >
      {/* A real button laid over the row, the publisher's links above it
          (see PublisherCard). */}
      <div className="relative">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} the seat lines of ${app.app_name}`}
          className="absolute inset-0 z-0 rounded-t-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app/30"
        />
        {inactive && <InactiveStrip mark={inactive} />}
      <div className="pointer-events-none flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5">
        <div
          className={cn(
            "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full",
            inactive ? "bg-slate-200 text-slate-500" : "bg-app-bg text-app",
          )}
        >
          <Smartphone aria-hidden className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-semibold tracking-tight text-slate-900">
              {app.app_name}
            </span>
            <span
              className={cn(
                "flex-shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium",
                inactive ? "border-slate-300 bg-white text-slate-500" : "border-app-border bg-app-bg text-app",
              )}
            >
              {storeLabel(app.store)}
            </span>
            {!inactive && <IpdChip row={app} subject={appSubject(app)} others={otherPartners(app, app.matched_lines)} />}
            {inactive && <InactiveChip />}
          </div>
          {/* A trial withholds an inactive app's publisher (the crawler
              sends ""): no "publisher:" with nothing after it. */}
          {(!inactive || app.owner_domain) && (
            // Inactive, it wraps on a phone: whether the publisher is still
            // live is the point of the line and must not be cut off.
            <div className={cn("text-xs text-slate-500", inactive ? "break-words sm:truncate" : "truncate")}>
              publisher:{" "}
              {app.owner_domain ? (
                <PublisherDomainLink domain={app.owner_domain} className="text-slate-600" arrow={false} />
              ) : null}
              {app.owner_name ? (
                <span className="text-slate-400">, {app.owner_name}</span>
              ) : null}
              {inactive && inactive.publisherLive != null && (
                <span className={inactive.publisherLive ? "text-slate-500" : "text-critical"}>
                  , {inactive.publisherLive ? "still live" : "inactive too"}
                </span>
              )}
            </div>
          )}
          {!inactive && <IpdWhere row={app} subject={appSubject(app)} others={otherPartners(app, app.matched_lines)} />}
          {fileLine && (
            <div data-app-file className="truncate text-[11px] text-slate-400">
              {fileLine}
            </div>
          )}
        </div>
        {inactive ? (
          app.matched_lines != null && (
            <div className="hidden items-center gap-6 text-right sm:flex">
              <div className="w-[84px] whitespace-nowrap">
                <MiniStat label="Your lines" value={app.line_count} emphasis />
              </div>
            </div>
          )
        ) : (
        <div className="hidden items-center gap-6 text-right sm:flex">
          <div className="w-[84px] whitespace-nowrap">
            <MiniStat label="Matched lines" value={app.line_count} emphasis />
          </div>
          <ChangeCell added={added} removed={removed} certChanged={certChanged} />
        </div>
        )}
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 flex-shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </div>
      </div>
      <Collapse open={open}>
        <div
          className={cn(
            "border-t px-4 pb-4 pt-3 sm:px-5",
            inactive ? "border-slate-200 bg-slate-100/50" : "border-app-border bg-app-bg/30",
          )}
        >
          {/* An inactive app's row carries its publisher's lines (even
              none): shown as they are, never fetched again. Only a row
              frozen without them reads them by developer_id below. */}
          {inactive && app.matched_lines != null ? (
            lines.length > 0 ? (
              <MatchedSeatLines
                title="Your seat lines its publisher carries"
                lines={lines}
                publisherDomain={app.owner_domain}
              />
            ) : (
              <p className="text-xs text-slate-500">No seat lines on record for this app.</p>
            )
          ) : inactive && app.developer_id == null ? (
            <p className="text-xs text-slate-500">
              {app.owner_domain
                ? "No seat lines on record for this app."
                : "Its publisher and the lines it carries are in your full report."}
            </p>
          ) : (
            <>
              {app.scope ? (
                <ScopeWindow token={token} mark={app.scope} developerId={app.developer_id} publisherDomain={app.owner_domain} />
              ) : !hasEmbeddedLines && app.developer_id != null ? (
                <LazyMatchedSeatLines
                  token={token}
                  developerId={app.developer_id}
                  publisherDomain={app.owner_domain}
                  rowPartner={rowPartnerOf(app)}
                />
              ) : (
                <ChangeExpansion
                  added={app.added_lines ?? []}
                  removed={app.removed_lines ?? []}
                  certChanged={app.cert_changed_lines ?? []}
                  matched={lines}
                  // Own lines open the publisher's file; each partner's
                  // lines open that partner's ads.txt.
                  publisherDomain={app.owner_domain}
                  rowPartner={rowPartnerOf(app)}
                  certRead={
                    (app.cert_changed_lines ?? []).length > 0 && app.developer_id != null
                      ? { token, developerId: app.developer_id, filter: lineFilter }
                      : undefined
                  }
                />
              )}
            </>
          )}
        </div>
      </Collapse>
    </div>
  );
}

/* ── INACTIVE CARDS (David, 2026-10-08) ─────────────────────────────
   The Inactive tab shows the very cards the matched lists use, greyed,
   with an Inactive chip and a strip on top: "Inactive since <date>:
   <reason>", the evidence quiet beneath. A publisher shows the lines of
   yours it carried; an app its publisher (and whether that publisher is
   still live) and the lines of yours that publisher carries. */

/** What turns a matched card into an inactive one. */
type InactiveMark = {
  since: string | null;
  reason: string;
  evidence?: string | null;
};

/** The strip on top of an inactive card: since when, why, and the proof. */
function InactiveStrip({ mark }: { mark: InactiveMark }) {
  const day = inactiveDay(mark.since);
  return (
    <div
      data-testid="inactive-strip"
      className="pointer-events-none rounded-t-3xl border-b border-slate-200 bg-slate-100/80 px-4 py-2 sm:px-5"
    >
      <p className="text-xs font-medium text-slate-700">
        {day ? `Inactive since ${day}: ` : ""}
        {mark.reason}
      </p>
      {mark.evidence && <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{mark.evidence}</p>}
    </div>
  );
}

function InactiveChip() {
  return (
    <span className="flex-shrink-0 rounded-full border border-slate-300 bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-600">
      Inactive
    </span>
  );
}

const inactiveSeatLine = (l: InactivePublisherLine): MatchedSeatLine => ({
  ssp_domain: l.ssp_domain,
  publisher_id: l.publisher_id,
  relationship: l.relationship,
  ...(l.file ? { found_in: l.file } : {}),
  ...(l.host ? { host: l.host } : {}),
});

function InactivePublisherCard({
  pub,
  open,
  onToggle,
  token,
}: {
  pub: InactivePublisher;
  open: boolean;
  onToggle: () => void;
  token: string;
}) {
  const lines = (pub.lines ?? []).map(inactiveSeatLine);
  const row: Row = {
    developer_id: pub.developer_id ?? 0,
    developer_name: pub.name && pub.name !== pub.domain ? pub.name : null,
    developer_domain: pub.domain,
    developer_platform: null,
    prev: null,
    current: lines.length,
    added: 0,
    removed: 0,
    cert_changed: 0,
    matched_lines: lines,
    added_lines: [],
    removed_lines: [],
    cert_changed_lines: [],
    file_hosts: [],
  };
  return (
    <PublisherCard
      row={row}
      token={token}
      open={open}
      onToggle={onToggle}
      inactive={{
        since: pub.inactive_since,
        reason: reasonText(pub),
        evidence: pub.evidence_summary,
        apps: pub.apps,
      }}
    />
  );
}

function InactiveAppCard({
  app,
  open,
  onToggle,
  token,
}: {
  app: InactiveApp;
  open: boolean;
  onToggle: () => void;
  token: string;
}) {
  const lines = app.lines ? app.lines.map(inactiveSeatLine) : undefined;
  const asMatched: MatchedApp = {
    store: app.store,
    bundle_id: app.bundle,
    app_name: app.name || app.bundle,
    owner_domain: app.publisher,
    owner_name: app.publisher_name && app.publisher_name !== app.publisher ? app.publisher_name : null,
    line_count: lines?.length ?? 0,
    ...(app.developer_id != null ? { developer_id: app.developer_id } : {}),
    ...(lines ? { matched_lines: lines } : {}),
    ...(app.file_host !== undefined ? { file_host: app.file_host } : {}),
    ...(app.file_source ? { file_source: app.file_source } : {}),
  };
  return (
    <MatchedAppCard
      app={asMatched}
      token={token}
      open={open}
      onToggle={onToggle}
      inactive={{
        since: app.inactive_since,
        reason: reasonText(app),
        evidence: app.evidence_summary,
        publisherLive: !app.publisher || app.publisher_inactive == null ? null : !app.publisher_inactive,
      }}
    />
  );
}

const INACTIVE_CARDS: InactiveCards = { Publisher: InactivePublisherCard, App: InactiveAppCard };
