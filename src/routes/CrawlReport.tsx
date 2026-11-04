import { requestReportDownload } from "@/lib/reportDownload";
import { ReportButton } from "@/components/ReportButton";
import { appPlatformOf, PlatformBadge, storeHint } from "@/components/StoreBadge";
import { FilterBar, FilterGroup, FilterInfo, FilterMultiSelect, FilterSearch, FilterSelect } from "@/components/FilterBar";
import InactiveSection, { type InactiveCards } from "@/components/InactiveSection";
import { MovesQuietLine, movesSentence, type MovesTab } from "@/components/MovesExplained";
import LockedTail from "@/components/LockedTail";
import { MiniStat } from "@/components/MiniStat";
import { Collapse, Settle, glideTo, prefersReducedMotion, preserveReportViewport, toggleWithoutJump } from "@/components/Motion";
import TrialBanner from "@/components/TrialBanner";
import {
  OverviewSkeleton,
  Skeleton,
  SkeletonRows,
  SkeletonStatCards,
  skeletonRowCount,
} from "@/components/Skeleton";
import { expectedRows, knownKey, type Landed } from "@/lib/expectedRows";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BEAT_PAUSE_MS, CountUp, landsAfterMs, payoffStyle } from "@/components/CountUp";
import { LineFilter } from "@/components/LineFilter";
import {
  appSubject,
  IpdChip,
  IpdInconclusiveNote,
  IpdWhere,
} from "@/components/MatchType";
import { PAGE_SIZE } from "@/lib/paging";
import { usePageCache } from "@/lib/pageCache";
import { useLineFilter } from "@/lib/lineFilter";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, CircleHelp, Download, Eye, EyeOff, FileText, Globe, Minus, MonitorSmartphone, Plus, PowerOff, RefreshCw, RotateCcw, SlidersHorizontal, Smartphone, Tv } from "lucide-react";
import { FOLD_OPEN, FOLD_SLACK, FOLD_STEP, easeListHeight } from "@/components/FoldedList";
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
  type ListFilters,
  type ListFiltersApplied,
  type MatchedMove,
  type MatchedMoves,
  type InactiveApp,
  type InactiveCounts,
  type InactiveKind,
  type InactivePublisher,
  type InactivePublisherLine,
  FOUND_IN_FILES,
  foundInFiles,
  foundInOf,
  WEB_PUBLISHERS,
} from "../lib/api";
import { rowFilesOf, type FileWord } from "@/lib/rowFiles";
import { foldChangeEvents, withKeptLines } from "@/lib/changeLines";
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
import { appFileLine, cn, fileHostsLabel, foundInLabel, lineHostLabel, scopeReasonText, storeName } from "@/lib/utils";
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
  fileUrl,
  filesOf,
  linkable,
  LineActionGroup,
  PublisherAvatarLink,
  PublisherDomainLink,
} from "@/components/PublisherLinks";
import { groupSeatLines, placeKey, seatKey } from "@/lib/seatLineGroups";
import {
  hasOldCerts,
  mapLimit,
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
import { csvName, ExportListButton, type CsvCell, type CsvSink, type ExportDone } from "@/components/ExportList";
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

// Hidden for the current design review; keep the shortcuts available to revisit.
const RECOMMENDATIONS_ENABLED = false;

/** Whether the crawler takes several files in one ``found_in`` (crawler
 *  PR, 2026-11-01), asked once per report with one small read: it echoes
 *  ``ads_txt,both`` back. False until it answers yes, and on any refusal. */
function useFoundInMulti(token: string): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setOk(false);
    api.matchedDevelopers(token, 1, "", [], "all", 1, undefined, WEB_PUBLISHERS)
      .then((r) => { if (!cancelled) setOk(r.found_in === WEB_PUBLISHERS); })
      .catch(() => { if (!cancelled) setOk(false); });
    return () => { cancelled = true; };
  }, [token]);
  return ok;
}

/** Each filter's ⓘ line (David, 2026-11-02): which list it is for, short. */
const FILTER_INFO = {
  platform: "Apps: CTV or Mobile. Web: publishers with your line in ads.txt.",
  foundIn: "Publishers only. The file your line is in.",
  foundInOnApps: "Publishers only. Picking a file opens Matched publishers.",
  matchType: "Publishers and apps. Own file, or via an inventory partner (IPD).",
} as const;

/** A Platform pick opened the other list: its menu and trigger went with
 *  the old list, so focus lands on the new list's Platform once it stands
 *  (or its Filters button on a narrow screen). Never taken from somewhere
 *  the reader has since moved to. */
function focusPlatformOf(root: HTMLElement | null, filter = "platform") {
  if (!root) return;
  const started = Date.now();
  const tick = () => {
    const active = document.activeElement;
    if (active && active !== document.body && root.contains(active)) return;
    if (active && active !== document.body && !active.closest("[role=menu]")) return;
    const platform = root.querySelector<HTMLElement>(`[data-testid="${filter}"]`);
    const visible = (el: HTMLElement | null) => (el && el.offsetParent !== null ? el : null);
    // The filter; else its folded button; and only once the list has
    // landed with no filter bar at all (Inactive), the status the reader
    // is on.
    const landedBare = !root.querySelector('[data-filter-skeleton], [aria-busy="true"], .list-toolbar-filters');
    const target = visible(platform)
      ?? visible(root.querySelector<HTMLElement>('button[aria-label="List filters"]'))
      ?? (landedBare ? visible(root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]'))
        ?? visible(root.querySelector<HTMLElement>('select[aria-label="Matched status"]')) : null);
    if (target && target.offsetParent !== null) target.focus({ preventScroll: true });
    else if (Date.now() - started < 4000) window.setTimeout(tick, 80);
  };
  window.setTimeout(tick, 0);
}

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
  /**
   * MOVING BETWEEN THE LISTS (David, 2026-11-02): a filter pick that opens
   * the other list says so first, in the walkthrough's card ("Moving to
   * Matched apps", and why), and holds MOVE_PAUSE_MS so the reader sees
   * where they are going; then the pick applies and the list moves. Any
   * other way of choosing a list (its card, a Popular choice) or another
   * pick in the meantime cancels it.
   */
  const [moving, setMoving] = useState<Moving | null>(null);
  // The pending move: its timer, and how long it still has to wait (a
  // hand on the card holds it, David 2026-11-02).
  const moveTimer = useRef<number | null>(null);
  const moveLeft = useRef({ ms: 0, since: 0, finish: () => {} });
  const movingNow = useRef(false);
  movingNow.current = moving != null;
  const cancelMove = useCallback(() => {
    if (moveTimer.current != null) window.clearTimeout(moveTimer.current);
    moveTimer.current = null;
    setMoving(null);
  }, []);
  useEffect(() => cancelMove, [cancelMove]);
  /** Shows a list; the tab stays (owner rule: tabs survive the publishers
   *  / apps switch), unless a tab is asked for. */
  const showView = (view: ListView, tab?: DrillTab) => {
    cancelMove();
    if (tab) setDrillTab(tab);
    setMatchedView(view);
  };
  const pickView = useCallback((view: ListView) => {
    cancelMove();
    preserveReportViewport(listRef.current, () => setMatchedView(view));
  }, [cancelMove]);
  const moveTo = useCallback((to: ListView, why: string, picked: string, focus: string, apply: () => void) => {
    cancelMove();
    setMoving({ to, why, picked, held: false });
    const finish = () => {
      moveTimer.current = null;
      // The pick and the move in one commit: the new list's first read is
      // already under the pick, never one under the old filter first.
      preserveReportViewport(listRef.current, () => {
        apply();
        setMatchedView(to);
        setMoving(null);
      });
      focusPlatformOf(listRef.current, focus);
    };
    moveLeft.current = { ms: MOVE_PAUSE_MS, since: Date.now(), finish };
    moveTimer.current = window.setTimeout(finish, MOVE_PAUSE_MS);
  }, [cancelMove]);
  /** A pointer on the card holds the move (the bar stops); off it, the
   *  move takes the time it had left. */
  const holdMove = useCallback((held: boolean) => {
    if (held) {
      if (moveTimer.current == null) return;
      window.clearTimeout(moveTimer.current);
      moveTimer.current = null;
      moveLeft.current.ms = Math.max(0, moveLeft.current.ms - (Date.now() - moveLeft.current.since));
    } else {
      if (moveTimer.current != null || !movingNow.current) return;
      moveLeft.current.since = Date.now();
      moveTimer.current = window.setTimeout(moveLeft.current.finish, moveLeft.current.ms);
    }
    setMoving((m) => (m ? { ...m, held } : m));
  }, []);
  /**
   * PLATFORM, ONE CHOICE FOR THE PAGE (David, 2026-11-01). It stands on both
   * lists and the last pick is what both say: CTV / Mobile filter the apps
   * (an app's platform, never a publisher's) and open them; Web is not an
   * app, it is the web publishers (Found in ads.txt + Both) and opens them;
   * All clears every platform and file choice. The tab, Match type and seat
   * lines stay. A pick that changes the list says so first (moveTo), then
   * hands focus to the new list's Platform, so a keyboard reader is not
   * dropped at the top of the page.
   */
  const matchedViewRef = useRef(matchedView);
  matchedViewRef.current = matchedView;
  const pickPlatform = useCallback((next: PlatformFilter) => {
    const here = matchedViewRef.current;
    const view: ListView = next === "web" ? "publishers" : next === "all" ? here : "apps";
    const apply = () => {
      setPlatform(next === "ctv" || next === "mobile" ? next : "all");
      // All on the publishers list clears any file choice; on the apps list
      // it leaves the publishers' own ticks alone unless they were Web.
      setFoundIn((was) =>
        next === "web" ? WEB_PUBLISHERS
          : was === WEB_PUBLISHERS || (next === "all" && here === "publishers") ? "all"
          : was);
    };
    if (view === here) {
      cancelMove();
      apply();
    } else {
      const key = next as "ctv" | "mobile" | "web";
      moveTo(view, MOVE_WHY[key], `Platform: ${key === "ctv" ? "CTV" : key === "mobile" ? "Mobile" : "Web"}`, "platform", apply);
    }
  }, [cancelMove, moveTo]);
  /**
   * FOUND IN FROM THE APPS LIST (David, 2026-11-02): the filter stands on
   * both lists, but a file is a publisher's, so on the apps list a choice
   * opens Matched publishers on it (focus on their Found in). The apps'
   * own Platform stays as the reader left it.
   */
  // Any other choice in the pause is the reader moving on: the move is off.
  const chooseFoundIn = useCallback((next: FoundInFilter) => { cancelMove(); setFoundIn(next); }, [cancelMove]);
  const chooseMatchType = useCallback((next: MatchTypeFilter) => { cancelMove(); setMatchType(next); }, [cancelMove]);
  const pickFoundIn = useCallback((next: FoundInFilter) => {
    if (matchedViewRef.current === "publishers") {
      cancelMove();
      setFoundIn(next);
      return;
    }
    moveTo("publishers", moveWhyOfFile(next), `Found in: ${FILE_WORD[next] ?? "All files"}`, "found-in", () => setFoundIn(next));
  }, [cancelMove, moveTo]);
  // Whether the crawler takes several files in one found_in (crawler PR):
  // asked once per report. Until it says yes, no Web choice and no tick
  // boxes ask it for two, so an older crawler never refuses the list.
  const foundInMulti = useFoundInMulti(token);
  const pickStatus = useCallback((tab: DrillTab) => preserveReportViewport(listRef.current, () => setDrillTab(tab)), []);
  // Bumped by those two cards: the list opens its first row once it has
  // landed, so the reader sees the lines the card counted, not just names.
  const [openFirst, setOpenFirst] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const showLinesOf = (tab: "added" | "removed") => {
    cancelMove();
    setDrillTab(tab);
    setOpenFirst((n) => n + 1);
    glideTo(listRef.current);
  };
  /** The quiet line's "See them": the Inactive tab, on a list that has rows. */
  const showInactive = (counts: InactiveCounts) => {
    cancelMove();
    setDrillTab("inactive");
    if (!counts[matchedView]) setMatchedView(matchedView === "publishers" ? "apps" : "publishers");
    glideTo(listRef.current);
  };
  /* The partner moves' line under the tiles: the list below on the status
     that holds them, on the apps (every app together, David 2026-11-04)
     unless the report did not count apps. */
  const showMoves = (tab: MovesTab) => {
    cancelMove();
    setDrillTab(tab);
    setMatchedView(summary?.counters.matched_moves?.apps ? "apps" : "publishers");
    glideTo(listRef.current);
  };
  /* THE SEAT-LINE FILTER. In the URL, so it survives a refresh and follows
     the reader across the lists. When set, the summary's matched
     counters, the publisher list and the app list are all re-read under
     it, so the two headline numbers and the rows beneath agree. */
  const { selected: lines, setSelected: setLines } = useLineFilter();
  // Which selection the summary on screen was read under. While it lags
  // the page's filters the cards show their skeleton, never last
  // selection's numbers under the new one.
  const linesKey = lines.join(",");
  /* THE CARDS FOLLOW THE LISTS' FILTERS TOO (David, 2026-11-04: "I pick
     IPD and Matched publishers, Matched apps, Lines added and Lines
     removed do not change"). Match type, Found in and Platform go with the
     seat lines to the summary, which re-counts each card the way its own
     list counts (crawler, viewer_frozen._recount_listed): Matched
     publishers by Match type and Found in, Matched apps by Match type and
     Platform, the line cards by Match type and Found in. */
  const listFilters = useMemo<ListFilters>(() => ({ matchType, foundIn, platform }), [matchType, foundIn, platform]);
  const filtersKey = `${token}|${linesKey}|${matchType}|${foundIn}|${platform}`;
  // The last summary read with no list filter, and under which seat lines:
  // what a failed list-filter re-read falls back to (whole figures, said
  // "not split"), and what the trial banner counts (review, 2026-11-04).
  const unlisted = useRef<{ summary: Summary; lines: string; token: string } | null>(null);
  const [settledFor, setSettledFor] = useState<{ key: string; lines: string } | null>(null);
  const refreshing = summary != null && settledFor?.key !== filtersKey;
  // The seat-line filter's own wait (its button says it is busy).
  const linesRefreshing = summary != null && settledFor?.lines !== linesKey;

  useEffect(() => {
    let cancelled = false;
    api
      .summary(token, lines, listFilters)
      .then((s) => {
        if (!cancelled) {
          if (listFilters.matchType === "all" && listFilters.foundIn === "all" && listFilters.platform === "all")
            unlisted.current = { summary: s, lines: linesKey, token };
          setSummary(s);
          setSettledFor({ key: filtersKey, lines: linesKey });
        }
      })
      .catch((e: ApiError) => {
        if (cancelled) return;
        // A list filter's re-read that fails never takes the report away:
        // the whole figures stand, each card saying it is not split.
        const fallback = unlisted.current;
        if (fallback && fallback.lines === linesKey && fallback.token === token) {
          setSummary(fallback.summary);
          setSettledFor({ key: filtersKey, lines: linesKey });
        } else setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, lines, linesKey, listFilters, filtersKey]);

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
  // The Found / Lost the unfiltered cards last showed: a filtered card keeps
  // that row's room with these very figures (same width, same wrap).
  const shownMoves = useRef<MatchedMoves | null>(null);
  const [popular, setPopular] = useState<PopularId | null>(null);
  // Bumped by a Popular choice: the lists clear their search.
  const [searchReset, setSearchReset] = useState(0);
  const popularState = { view: matchedView, tab: drillTab, matchType };
  // Any filter changed by hand clears the highlighted choice.
  useEffect(() => {
    if (popular && !targetMatches(POPULAR[popular].target, popularState)) setPopular(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popular, matchedView, drillTab, matchType]);
  /**
   * RESET (David, 2026-11-04: "a reset button for all filters, back to all
   * of it"). One press puts the page back to the whole report: every seat
   * line, Match type, Found in and Platform at All, the list on All matched
   * with no search. The list on screen (publishers or apps) stays.
   */
  const anyFilter = lines.length > 0 || matchType !== "all" || foundIn !== "all" || platform !== "all";
  const resetFilters = useCallback(() => {
    cancelMove();
    // Reset leaves the page once nothing is filtered: a keyboard reader's
    // focus goes on to the list's search, never back to the page's top.
    const byKeyboard = (document.activeElement as HTMLElement | null)?.matches?.(":focus-visible") ?? false;
    preserveReportViewport(listRef.current, () => {
      setLines([]);
      setMatchType("all");
      setFoundIn("all");
      setPlatform("all");
      setDrillTab("all");
      setPopular(null);
      setSearchReset((n) => n + 1);
    });
    if (byKeyboard)
      window.requestAnimationFrame(() =>
        listRef.current?.querySelector<HTMLInputElement>('input[aria-label^="Search matched"]')?.focus({ preventScroll: true }));
  }, [cancelMove, setLines]);
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
  // things ("-97%"). No delta is the honest answer there, and the same
  // under any list filter (Match type, Found in, Platform): each card then
  // says what it is filtered by instead.
  const filtered = lines.length > 0;
  const listFiltered = matchType !== "all" || foundIn !== "all" || platform !== "all";
  const cardsFiltered = filtered || listFiltered;
  const cuts = cardCuts(summary.list_filters ?? null, listFilters, filtered);
  if (!cardsFiltered && !refreshing && previous && summary.counters.matched_moves)
    shownMoves.current = summary.counters.matched_moves;
  const prevMatchedDevs = cardsFiltered ? null : (previous?.counters.matched.developers ?? null);
  const prevMatchedApps = cardsFiltered ? null : (previous?.counters.matched.apps ?? null);
  // Found and lost behind the net, when the report carries them (David,
  // 2026-10-05: "+351" alone hides the 380 we found). Never under a filter.
  const moves = cardsFiltered ? null : (summary.counters.matched_moves ?? null);
  // A card that showed Found / Lost keeps that row's room, with the very
  // figures it showed, while a filter hides it: the cards never change height.
  const reserveMoves = cardsFiltered || refreshing ? shownMoves.current : null;

  // Last week's OWN added/removed totals, so "+32 lines added" can say
  // whether 32 is a busy week or a quiet one. Comparing this week's added
  // against last week's added is like for like; comparing it against last
  // week's matched inventory would not be.
  const prevAdded = cardsFiltered ? null : (previous?.hero_diff.line_totals.added ?? null);
  const prevRemoved = cardsFiltered ? null : (previous?.hero_diff.line_totals.removed ?? null);

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
        kind: matchedView,
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
          {/* A crawl that did not finish says so, quietly, in the Excel's
              own words (crawler #370, `partial_line`). */}
          {typeof summary.partial_line === "string" && summary.partial_line.trim() && (
            <p data-partial-line className="mt-0.5 text-[12px] leading-relaxed text-slate-400">
              {summary.partial_line.trim()}
            </p>
          )}
          {/* While the figures re-read, the last sentence keeps its room
              (hidden, so it is never read as the new answer) under a
              skeleton bar: the header neither shrinks nor grows. */}
          <SteadyHeight className="relative">
            <div className={refreshing ? "invisible" : undefined} aria-hidden={refreshing || undefined}>
              <WeeklyWin
                publishers={matchedDevs}
                apps={matchedApps}
                publishersDelta={matchedDevsDelta}
                appsDelta={matchedAppsDelta}
                moves={moves}
                firstCrawl={isFirstCrawl}
                filtered={filtered}
                sides={cuts.sides}
              />
            </div>
            {refreshing && (
              <span aria-hidden className="absolute left-0 top-[15px] block h-4 w-full max-w-md animate-pulse rounded bg-muted" />
            )}
          </SteadyHeight>
        </div>
        <div className="report-header-actions flex flex-wrap items-center gap-2">
          <LineFilter
            seats={summary.watchlist?.seats ?? []}
            selected={lines}
            onChange={setLines}
            busy={linesRefreshing}
          />
          {exportInfo.format !== "none" && (
            <ExportResultsButton
              token={token}
              summary={summary}
              lines={lines}
              info={exportInfo}
            />
          )}
          {exportInfo.format === "none" && !summary.trial && !exportInfo.trial && (
            <p role="status" className="max-w-xs text-xs text-slate-500">The report download is not ready yet. Please refresh shortly.</p>
          )}
        </div>
      </div>
      {/* Reserved whether or not a filter is on, so toggling one never
          pushes the cards below down and back up. */}
      {summary.trial && (
        <TrialBanner
          caps={summary.trial}
          // The pitch counts the whole report, never a list filter's slice.
          summary={unlisted.current && unlisted.current.lines === linesKey && unlisted.current.token === token ? unlisted.current.summary : summary}
        />
      )}
      <p className="report-filter-note -mt-2 min-h-[18px] text-[12px] leading-[18px] text-slate-500">
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
      {/* A LIST FILTER (Match type, Found in, Platform) RE-COUNTS THE CARDS
          IN PLACE (2026-11-04): it is picked down in the list, so the cards
          keep their frame and each figure holds a skeleton of its own size
          while it is read; the list under the reader's hand never moves. */}
      {linesRefreshing ? (
        <SkeletonStatCards count={2} />
      ) : (
      <section className="overview-kpis space-y-2.5" aria-label="Weekly performance">
      {/* Under any filter the line says which, and Reset puts the whole
          report back in one press (David, 2026-11-04). */}
      {/* ONE LINE, ALWAYS (David, 2026-11-04): the words truncate before
          the line ever wraps, and Reset never leaves the line. */}
      <div data-kpi-comparison className="flex h-[18px] min-w-0 items-center gap-x-3 whitespace-nowrap text-xs leading-[18px] text-slate-500">
        {cardsFiltered ? (
          <span data-kpi-filter-words className="min-w-0 truncate" title={`Filtered: ${filterWords(listFilters, lines.length).join(", ")}`}>
            Filtered:{" "}
            <span className="hidden sm:inline">{filterWords(listFilters, lines.length).join(", ")}</span>
            <span className="sm:hidden">{filterWords(listFilters, lines.length, true).join(", ")}</span>
          </span>
        ) : (
          <span className="min-w-0 truncate">{isFirstCrawl ? "First crawl, no prior week to compare" : "Compared with last week"}</span>
        )}
        {anyFilter && <ResetFilters onReset={resetFilters} testId="reset-filters-cards" />}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div
          className="report-panel rounded-2xl border border-border bg-white p-5"
          data-tour="overview-changes"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <div className="font-display text-sm font-medium text-slate-700">
                This week&apos;s changes
              </div>
            </div>
            <span className="text-xs text-slate-500">
              {isFirstCrawl ? "baseline" : refreshing ? <Skeleton className="inline-block h-3 w-24 rounded-md align-middle" /> : `${certChanged.toLocaleString()} cert changes`}
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
          <div className="report-kpi-pair grid grid-cols-2 gap-2">
            <SplitStat
              tone="ok"
              number={added}
              sign="+"
              label="Lines added"
              delta={prevAdded != null ? computeDelta(added, prevAdded) : null}
              note={cuts.lines}
              pending={refreshing}
              active={drillTab === "added"}
              onClick={() => showLinesOf("added")}
            />
            <SplitStat
              tone="critical"
              number={removed}
              sign="−"
              label="Lines removed"
              delta={
                prevRemoved != null ? computeDelta(removed, prevRemoved) : null
              }
              note={cuts.lines}
              pending={refreshing}
              active={drillTab === "removed"}
              onClick={() => showLinesOf("removed")}
            />
          </div>
          )}
        </div>

        <div
          className="report-panel rounded-2xl border border-border bg-white p-5"
          data-tour="overview-matched"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <div className="font-display text-sm font-medium text-slate-700">
                Matched inventory
              </div>
            </div>
            <span className="text-xs text-slate-500">
              {refreshing ? <Skeleton className="inline-block h-3 w-28 rounded-md align-middle" /> : <span title="Matched line occurrences: your watched seat lines across publisher ads.txt and app-ads.txt files. A seat line can appear in many files; this is not a count of unique lines.">{summary.counters.matched.lines.toLocaleString()} line occurrences</span>}
            </span>
          </div>
          {/* Two tiles that double as the selector for the list below:
              publishers in the brand's racing green, apps in pink. THE SAME
              SPLIT AS THE LEFT CARD (David, 2026-10-25): one bordered box,
              a hairline between, the same padding, so all four tiles are
              the same width to the pixel and the two hero panels line up.
              Click one to switch the list underneath; the selected tile
              carries its tint. */}
          <div className="report-kpi-pair grid grid-cols-2 gap-2">
            <MatchedTile
              tone="publisher"
              icon={Globe}
              number={matchedDevs}
              label="Matched publishers"
              delayMs={secondBeat}
              delta={matchedDevsDelta}
              previous={prevMatchedDevs}
              move={moves?.developers ?? null}
              note={cuts.publishers}
              pending={refreshing}
              reserveMove={reserveMoves?.developers ?? null}
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
              note={cuts.apps}
              pending={refreshing}
              reserveMove={reserveMoves?.apps ?? null}
              active={matchedView === "apps"}
              // The tab stays (David, 2026-10-07): Added on publishers
              // is Added on apps, never a silent jump back to All matched.
              onClick={() => pickView("apps")}
            />
          </div>
        </div>
      </div>
      {/* THE SIDE FINDINGS, BELOW BOTH KPI CARDS (David, 2026-11-04: the
          KPI cards are always the same size; a line inside one of them made
          it taller). One quiet line each, never a card (2026-10-20): what
          could not be verified, what went inactive, what was found or lost
          through an inventory partner (its links open the list below on
          Stopped / Started watching; never under a line filter). */}
      {((!isFirstCrawl && unconfirmed > 0) || inactive || movesSentence(moves)) && (
        <div data-testid="kpi-notes" className="space-y-1 px-1">
          {!isFirstCrawl && unconfirmed > 0 && (
            <p data-testid="unconfirmed-quiet" className="text-[12px] leading-snug text-slate-500">
              {unconfirmedSentence(unconfirmed)}
            </p>
          )}
          {inactive && (
            <InactiveQuietLine
              counts={inactive.counts}
              since={inactive.since}
              filtered={filtered}
              onShow={() => showInactive(inactive.counts)}
            />
          )}
          <MovesQuietLine moves={moves} onShow={showMoves} />
        </div>
      )}
      </section>
      )}

      {/* Ask AI, inline, between the KPIs and the drilldown. Same shape
          bottomlines-app uses on the "Your Bottom Line" page: pill input
          with a sparkle glyph + horizontal suggestion rail; answers grow
          in a thread below the composer. The backend has no chat endpoint,
          so this is available only when both VITE_MOCK=true and
          VITE_ENABLE_CHAT=true are set for a local demo. */}
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
      {RECOMMENDATIONS_ENABLED && <PopularBar
        choices={popularChoices}
        active={popularActive}
        onPick={pickPopular}
        loading={popularCounts === undefined}
      />}

      {/* The matched list. Which one shows is driven by the two cards above:
          publishers by default, apps when the pink card is selected. Both are
          card-per-row lists in the same grammar as bottomlines-app's
          HierarchyCard: colored disc, generous padding, right-aligned stats,
          tinted expansion. Publishers are green, apps are pink. */}
      <div data-tour="overview-list" ref={listRef} data-moving={moving ? moving.to : undefined} className="relative scroll-mt-6"
        // A click or typing in the list during the pause: the reader moved
        // on, the move is off (a menu choice lives outside, in its portal).
        onPointerDownCapture={moving ? (event) => { if (!(event.target as Element).closest?.(".list-moving-card")) cancelMove(); } : undefined}
        onInputCapture={moving ? cancelMove : undefined}>
        {/* Always here, so a screen reader hears the move when it is said. */}
        <p role="status" aria-live="polite" data-list-moving-said className="sr-only">
          {moving ? `Moving to ${VIEW_TITLE[moving.to].title}. ${moving.why}` : ""}
        </p>
        {moving && <MovingCard moving={moving} list={listRef.current} onHold={holdMove} />}
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
            setTab={pickStatus}
            openFirst={openFirst}
            matchType={matchType}
            setMatchType={chooseMatchType}
            foundIn={foundIn}
            setFoundIn={chooseFoundIn}
            foundInMulti={foundInMulti}
            onPlatform={pickPlatform}
            searchReset={searchReset}
            known={knownFor("publishers")}
            pageFiltered={anyFilter}
            onReset={resetFilters}
          />
        ) : (
          <MatchedAppsList
            token={token}
            lines={lines}
            caps={summary.trial ?? null}
            inactive={inactive}
            tab={listTab}
            setTab={pickStatus}
            openFirst={openFirst}
            matchType={matchType}
            setMatchType={chooseMatchType}
            platform={platform}
            setPlatform={setPlatform}
            foundInMulti={foundInMulti}
            onPlatform={pickPlatform}
            onFoundIn={pickFoundIn}
            searchReset={searchReset}
            known={knownFor("apps")}
            pageFiltered={anyFilter}
            onReset={resetFilters}
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
  sides = null,
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
  /** Which figures a list filter (Match type, Found in, Platform) really
   *  cut, by the summary's own word (2026-11-04); null: none. */
  sides?: { publishers: boolean; apps: boolean } | null;
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
  if (sides && (sides.publishers || sides.apps)) {
    // Only the figures the filters cut are said to match them (Platform
    // never cuts publishers, Found in never cuts apps).
    const p = <>{pub(publishers)} {plural(publishers, "publisher", "publishers")}</>;
    const a = <>{app(apps)} {plural(apps, "app", "apps")}</>;
    line = sides.publishers && sides.apps ? <>{p} and {a} match your filters.</>
      : sides.publishers ? <>{p} {publishers === 1 ? "matches" : "match"} your filters.</>
      : <>{a} {apps === 1 ? "matches" : "match"} your filters.</>;
  } else if (filtered) {
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
/** The absolute and percentage change against the previous crawl. */
export type Delta = { abs: number; pct: number | null };

export function computeDelta(current: number, previous: number): Delta {
  const abs = current - previous;
  const pct = previous === 0 ? (current === 0 ? 0 : null) : (abs / previous) * 100;
  return { abs, pct };
}

function DeltaChip({ delta, tone, previous }: { delta: Delta; tone?: StatTone; previous?: number | null }) {
  const comparison = delta.abs === 0 ? "No change" : moveText(delta);
  const color = delta.abs === 0 ? "text-slate-600"
    : tone === "critical" ? (delta.abs > 0 ? "text-critical" : "text-ok")
    : tone === "ok" || tone === "publisher" || tone === "app"
      ? (delta.abs > 0 ? "text-ok" : "text-critical")
      : "text-slate-700";
  return (
    <span className="report-delta" title={`${comparison} vs ${previous != null ? `${previous.toLocaleString()} ` : ""}last week`}>
      <span className={cn("font-medium tabular-nums", color)}>{comparison}</span>
      <span className="report-delta-period">{delta.pct == null ? "vs 0 last week" : "vs last week"}</span>
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

/** A figure's place while it is re-counted: the skeleton's tone at the
 *  figure's own height (1em of its font), never last filter's number. */
function PendingFigure() {
  return <Skeleton className="inline-block h-[1em] w-[3.2ch] rounded-md align-[-0.1em]" />;
}

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
  sign,
  pending = false,
}: {
  number: number;
  label: string;
  /** The figure is being re-counted under a new filter: its place holds a
   *  skeleton of the figure's own size, so nothing on the page moves. */
  pending?: boolean;
  /** "+" or "−" stuck to the figure, its size and colour (lines added,
   *  lines removed: David, 2026-11-02); only above zero. */
  sign?: "+" | "−";
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
      <div className="report-stat-label text-[12px] font-medium text-slate-600">{label}</div>
      {pending ? (
        <div className="flex items-baseline gap-1">
          <span aria-hidden className="report-figure report-figure-value text-3xl font-medium leading-none tracking-tight sm:text-4xl">
            <PendingFigure />
          </span>
        </div>
      ) : (
      <div className="flex items-baseline gap-1">
        {sign && number > 0 && (
          <span
            data-figure-sign
            className={cn(
              "report-figure -mr-1 text-3xl font-medium leading-none tabular-nums tracking-tight sm:text-4xl",
              numberCls,
            )}
          >
            {sign}
          </span>
        )}
        {prefix && (
          <span
            className={cn(
              "report-figure text-2xl font-medium tabular-nums sm:text-3xl",
              numberCls,
            )}
          >
            {prefix}
          </span>
        )}
        <span
          // Keep the figure keyed to the selected report value.
          key={number}
          className={cn(
            "report-figure report-figure-value text-3xl font-medium leading-none tabular-nums tracking-tight sm:text-4xl",
            numberCls,
          )}
        >
          <CountUp value={number} delayMs={delayMs} />
        </span>
        {suffix && (
          <span className="font-display text-lg font-medium tabular-nums text-slate-400 sm:text-xl">{suffix}</span>
        )}
      </div>
      )}
      {caption && (
        <div className="report-stat-caption text-[11px] leading-[15px] text-slate-500">{caption}</div>
      )}
      {/* ONE SLOT, ALWAYS THE SAME HEIGHT. A delta, a hint, a note, or
          nothing: the tile never grows or shrinks when the filter changes,
          so the page above the list does not move. */}
      <div
        key={number}
        className="min-h-[17px] text-[11px] leading-[17px]"
        // Keep the shared timing interface; figures now appear immediately.
        style={payoffStyle(delayMs + landsAfterMs())}
      >
        {pending ? null : delta ? (
          <DeltaChip delta={delta} tone={tone} />
        ) : hint ? (
          <span className={hintClassName ?? "text-slate-500"}>{hint}</span>
        ) : note ? (
          <CardNote note={note} />
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
        aria-busy={pending || undefined}
        className={cn(
          "report-stat report-kpi-tile group block w-full px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          active ? activeGround : "hover:bg-muted/40",
          className,
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
        className="report-stat block px-5 py-4 transition-colors hover:bg-muted/40"
      >
        {body}
      </Link>
    );
  }
  return <div className={cn("report-stat px-5 py-4", className)}>{body}</div>;
}

/** A selector for the inventory below. Label, figure and comparison share
 *  SplitStat's rhythm; Found/Lost adds the detail behind the net change. */
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
  pending = false,
  reserveMove = null,
}: {
  tone: "publisher" | "app";
  /** Being re-counted under a new filter: a skeleton of the figure's size. */
  pending?: boolean;
  /** The Found / Lost this tile showed unfiltered: its room is kept, with
   *  these figures, while a filter hides it, so nothing moves. */
  reserveMove?: MatchedMove | null;
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
  // The change lines remain beside the corresponding figure.
  const payoff = payoffStyle(delayMs + landsAfterMs());
  const numberRow = (
    // The Lines tiles' number row to the pixel: the same baseline row, its
    // sign slot present but empty and zero wide, so the row stands at the
    // same height as "+127" over there.
    <span className="flex items-baseline">
      <span aria-hidden className="invisible w-0 select-none report-figure text-2xl font-medium tabular-nums sm:text-3xl">
        +
      </span>
      {pending ? (
        <span aria-hidden className="report-figure report-figure-value text-3xl font-medium leading-none tracking-tight sm:text-4xl">
          <PendingFigure />
        </span>
      ) : (
      <span
        // Keep the figure keyed to the selected report value.
        key={number}
        className={cn(
          "report-figure report-figure-value text-3xl font-medium leading-none tabular-nums tracking-tight sm:text-4xl",
          numberCls,
        )}
      >
        <CountUp value={number} delayMs={delayMs} />
      </span>
      )}
    </span>
  );
  const labelRow = (
    <span className="flex items-start gap-1.5 text-[12px] font-medium text-slate-600">
      <Icon aria-hidden className={cn("h-3.5 w-3.5 flex-shrink-0", iconCls)} />
      {label}
    </span>
  );
  const moveLine = pending ? null : w ? (
    <DeltaChip delta={w.delta} tone={tone} previous={w.previous} />
  ) : delta ? (
    <DeltaChip delta={delta} tone={tone} />
  ) : note ? (
    <CardNote note={note} />
  ) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-busy={pending || undefined}
      className={cn(
        "mtile report-stat report-kpi-tile group block w-full px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active ? activeGround : idleGround,
      )}
    >
      {/* Labels and primary values share the same rhythm as SplitStat.
          The weekly breakdown sits below the value at every width. */}
      <span className="mtile-grid">
        <span className="mtile-num">{numberRow}</span>
        <span className="mtile-label report-stat-label">{labelRow}</span>
      </span>
      {/* ONE SLOT, ALWAYS THE SAME HEIGHT, as on the Lines tiles. */}
      <span key={number} className="report-stat-comparison block min-h-[17px] text-[11px] leading-[17px]" style={payoff}>
        {moveLine}
      </span>
      {w && move && !pending ? <FoundLostCorner move={move} style={payoff} />
        : reserveMove ? <FoundLostCorner move={reserveMove} hidden /> : null}
    </button>
  );
}

/** The signed move and its percentage, "+351 (+4.4%)". */
function moveText(delta: Delta): string {
  const sign = delta.abs > 0 ? "+" : delta.abs < 0 ? "-" : "";
  return `${sign}${Math.abs(delta.abs).toLocaleString()}${delta.pct == null ? "" : ` (${pctText(delta.pct)})`}`;
}

/** Words carry direction; restrained green/red values reinforce it. */
function FoundLostCorner({ move, style, hidden = false }: { move: MatchedMove; style?: React.CSSProperties; hidden?: boolean }) {
  const row = (label: string, n: number) => (
    <span className="inventory-move-row">
      <span>{label}</span>{" "}
      <span className={cn("font-medium tabular-nums", label === "Found" ? "text-ok" : "text-critical")}>{n.toLocaleString()}</span>
    </span>
  );
  return (
    <span data-found-lost={hidden ? undefined : ""} aria-hidden={hidden || undefined} className={cn("mtile-corner inventory-movement", hidden && "invisible")} style={style}>
      {row("Found", move.found)}
      {row("Lost", move.lost)}
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
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadFrame = useRef<(() => void) | null>(null);
  const resetBusy = useRef<number>();
  const starting = useRef(false);
  useEffect(() => () => { downloadFrame.current?.(); window.clearTimeout(resetBusy.current); }, []);
  const onClick = async () => {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setDownloadError(null);
    const idle = () => { starting.current = false; setBusy(false); };
    window.clearTimeout(resetBusy.current);
    try {
      if (MOCK) {
        const { buildXlsxBlob } = await import("../lib/xlsx");
        const { MOCK_CUSTOMER_DOMAIN } = await import("../lib/mockData");
        const url = URL.createObjectURL(buildXlsxBlob(sampleWorkbook(summary)));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${MOCK_CUSTOMER_DOMAIN}-${reportDate(summary)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Safari starts saving after the click returns.
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        idle();
        return;
      }
      downloadFrame.current?.();
      downloadFrame.current = requestReportDownload(api.exportUrl(token, narrowed ? lines : []), message => {
        setDownloadError(message);
        idle();
      });
      // Attachments do not emit a document load. This only unlocks the
      // button; it does not claim the file finished saving.
      resetBusy.current = window.setTimeout(idle, 10_000);
    } catch {
      setDownloadError("The download could not start. Please try again.");
      idle();
    }
  };
  /* THE ONE ACTION ON THE PAGE LOOKS LIKE ONE (David, 2026-10-02: "a green
     tempting button"). It was a white pill the same weight as the line
     filter beside it, so the thing a customer came to take away read as
     chrome. Solid brand green, white type, a lift on hover.

     The label says what the file is. "Download full report" whenever the
     download is the whole report, which includes a filter this report
     cannot be cut by; only a download that really carries just the
     selected lines says so instead, because calling that file complete
     would be false. */
  return (
    <div className="report-download flex max-w-full flex-col items-start gap-1.5">
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      title={title}
      data-tour="export"
      className="inline-flex h-9 flex-shrink-0 items-center gap-2 self-start rounded-lg report-action bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Download aria-hidden className="h-4 w-4" />
      {busy ? "Preparing download…" : narrowed ? "Export selected lines" : "Download full report"}
    </button>
    {downloadError && <p role="alert" className="max-w-sm text-xs leading-relaxed text-critical">{downloadError}</p>}
    </div>
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

/**
 * A row's one-line reason on a watch tab (David, 2026-11-04: "the reason
 * should be a one-line sentence, very easy to understand"): the distinct
 * reasons of its lines that moved to the tab, said once. Null off a watch
 * tab or when the crawler sent none.
 */
function watchReason(row: object, tab: DrillTab): string | null {
  if (!isScopeTab(tab)) return null;
  // A publisher row keeps the lines that moved under ``scope`` (developerRow);
  // an app row has them as they came.
  const scoped = (row as { scope?: { lines?: unknown } }).scope?.lines;
  const lines = Array.isArray(scoped) ? scoped : (row as Record<string, unknown>)[`${WATCH_CHANGE[tab]}_lines`];
  if (!Array.isArray(lines)) return null;
  const said = [...new Set(lines.map((l) => scopeReasonText((l as { reason?: unknown } | null)?.reason)).filter(Boolean))];
  return said.length ? said.join(" ") : null;
}

/** The row's reason line, inside the card under its "Via" line; the full
 *  text on hover. */
function WatchReason({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <div data-watch-reason title={sentence(text)} className="truncate text-[11px] text-slate-600">
      {sentence(text)}
    </div>
  );
}

/** The quiet line a watch tab carries under its controls. */
const SCOPE_NOTE: Record<ScopeTab, string> = {
  // "Did not change" was untrue of a publisher that named or stopped naming
  // its inventory partner (2026-11-04): each row now says its own why.
  started: "Lines you started watching this week, each with why. Not counted as added.",
  stopped: "Lines you stopped watching this week, each with why. Not counted as removed.",
  unconfirmed:
    "Lines this crawl could not verify, each with its reason. Kept as matched, never counted as added or removed.",
};

/** What the two lists need for their Inactive tab; null when nothing is
 *  inactive (the tab then does not exist). */
type InactiveTab = {
  counts: InactiveCounts;
  kind: InactiveKind;
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
          {inactive ? title.replace("Matched", "Inactive") : title}
        </h2>
        {!inactive && <p className="text-sm text-slate-500">{blurb}</p>}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}

export type ListView = "publishers" | "apps";

// Both files match a publisher (demo of #75: "whose ads.txt" left out
// app-ads.txt, the Found in switch's other half); an app matches by its
// app-ads.txt, or by an inventory partner's ads.txt it names (IPD).
/** A move to the other list, said before it happens (MovingCard). */
type Moving = { to: ListView; why: string; picked: string; held: boolean };
/** How long the move's card holds before the list moves (David,
 *  2026-11-02: "a second and a half"); a pointer on it holds it longer. */
const MOVE_PAUSE_MS = 1500;
/** Why a Platform pick opens the other list, in one line. */
const MOVE_WHY = {
  ctv: "CTV is an app platform, so its matches are apps.",
  mobile: "Mobile is an app platform, so its matches are apps.",
  web: "Web is publishers: the ones with your line in ads.txt.",
} as const;
/** A single Found in choice as its menu says it. */
/** The page's filters in words, for the cards' line: "Match type: IPD,
 *  Found in: ads.txt + Both, 2 selected lines". */
function filterWords(f: ListFilters, seatLines: number, short = false): string[] {
  const out: string[] = [];
  // Short (a phone): the choices alone, "IPD, ads.txt, CTV, 2 lines".
  if (f.matchType !== "all") out.push(short ? MATCH_WORD[f.matchType] : `Match type: ${MATCH_WORD[f.matchType]}`);
  if (f.foundIn !== "all") out.push(short ? filesWord(f.foundIn) : `Found in: ${filesWord(f.foundIn)}`);
  if (f.platform !== "all") out.push(short ? PLATFORM_WORD[f.platform] : `Platform: ${PLATFORM_WORD[f.platform]}`);
  if (seatLines > 0) out.push(short ? `${seatLines} ${seatLines === 1 ? "line" : "lines"}` : seatLines === 1 ? "1 selected line" : `${seatLines} selected lines`);
  return out;
}

const MATCH_WORD: Record<"own" | "ipd", string> = { own: "Own", ipd: "IPD" };
const PLATFORM_WORD: Record<"ctv" | "mobile" | "web", string> = { ctv: "CTV", mobile: "Mobile", web: "Web" };

/** "ads.txt", "app-ads.txt", "Both", or ticked ones joined: "ads.txt + Both". */
function filesWord(foundIn: string): string {
  return foundIn.split(",").filter(Boolean)
    .map((f) => (f === "ads_txt" ? "ads.txt" : f === "app_ads_txt" ? "app-ads.txt" : "Both")).join(" + ");
}

/**
 * EACH CARD SAYS WHAT IT IS FILTERED BY (2026-11-04). A card is re-counted
 * only under the filters its own list takes: Matched publishers by Match
 * type and Found in, Matched apps by Match type and Platform, the line
 * cards by Match type and Found in (crawler, ``_recount_listed``). Read off
 * what the summary says it APPLIED, never the page's wish: an older API
 * answers the whole report, and the card then says it is not split. A card
 * a picked filter does not reach says so ("Not split by platform"), so an
 * unchanged figure never reads as a filter that did not work.
 */
function cardCuts(
  applied: ListFiltersApplied | null,
  asked: ListFilters,
  seatLines: boolean,
): { publishers?: string; apps?: string; lines?: string; sides: { publishers: boolean; apps: boolean } | null } {
  const mt = applied?.match_type ? MATCH_WORD[applied.match_type] : null;
  const fi = applied?.found_in ? filesWord(applied.found_in) : null;
  const pf = applied?.platform ? PLATFORM_WORD[applied.platform] : null;
  // Whether each card could be split at all (a list frozen as cut, a report
  // without line events: the server keeps the whole figure and says so).
  const pubsSplit = applied?.publishers !== false;
  const appsSplit = applied?.apps !== false;
  const linesSplit = applied?.line_totals !== false && pubsSplit;
  const seat = seatLines ? "selected lines" : null;
  const askedMt = asked.matchType !== "all";
  const askedFi = asked.foundIn !== "all";
  const askedPf = asked.platform !== "all";
  /** A filter the card takes that was not applied comes first: the figure
   *  must never pass for split when it is not. Then what cut it; then a
   *  picked filter the card does not take, by design. */
  const note = (missing: (string | false)[], on: (string | null)[], other: (string | false)[]): string | undefined => {
    const miss = missing.filter((w): w is string => !!w);
    if (miss.length) return `Not split by ${miss.join(" or ")}`;
    const by = on.filter((w): w is string => !!w);
    if (by.length) return `Filtered: ${by.join(", ")}`;
    const not = other.filter((w): w is string => !!w);
    return not.length ? `Not split by ${not.join(" or ")}` : undefined;
  };
  const listApplied = !!(mt || fi || pf);
  return {
    publishers: note(
      [askedMt && !(mt && pubsSplit) && "match type", askedFi && !(fi && pubsSplit) && "file"],
      pubsSplit ? [mt, fi, seat] : [seat], [askedPf && "platform"]),
    apps: note(
      [askedMt && !(mt && appsSplit) && "match type", askedPf && !(pf && appsSplit) && "platform"],
      appsSplit ? [mt, pf, seat] : [seat], [askedFi && "file"]),
    lines: note(
      [askedMt && !(mt && linesSplit) && "match type", askedFi && !(fi && linesSplit) && "file"],
      linesSplit ? [mt, fi, seat] : [seat], [askedPf && "platform"]),
    sides: listApplied
      ? { publishers: seatLines || (pubsSplit && !!(mt || fi)), apps: seatLines || (appsSplit && !!(mt || pf)) }
      : null,
  };
}

const FILE_WORD: Partial<Record<FoundInFilter, string>> = { all: "All files", ads_txt: "ads.txt", app_ads_txt: "app-ads.txt", both: "Both" };
/** Why a Found in pick on the apps list opens the publishers. */
function moveWhyOfFile(next: FoundInFilter): string {
  const files = foundInFiles(next);
  const said = files.length === 0 ? "either file"
    : files.map((f) => (f === "both" ? "both files" : f === "ads_txt" ? "ads.txt" : "app-ads.txt")).join(" or ");
  return `A file belongs to a publisher, so this shows the publishers found in ${said}.`;
}

/**
 * The move's card: the walkthrough's card (the pick as its eyebrow, then
 * where it goes and why) just under the list's search bar, with a thin bar
 * filling over the pause; a pointer on it (hover or finger) holds the pause
 * and the bar. Never in the way of a click around it; a screen reader hears
 * it from the list's own status line.
 */
function MovingCard({ moving, list, onHold }: { moving: Moving; list: HTMLElement | null; onHold: (held: boolean) => void }) {
  const [top, setTop] = useState<number | null>(null);
  // Where the mouse was first seen on the card: it holds once it moves.
  const firstAt = useRef<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const bar = list?.querySelector<HTMLElement>("[data-list-toolbar]");
    if (!list || !bar) { setTop(96); return; }
    setTop(bar.getBoundingClientRect().bottom - list.getBoundingClientRect().top + 14);
  }, [list]);
  return (
    <div data-list-moving={moving.to} data-held={moving.held || undefined} aria-hidden className="list-moving" style={{ top: top ?? 96 }}>
      {/* A mouse moving over it, or a finger on it, holds the move. Never
          just a pointer it appeared under (the menu's choice was there):
          only real movement or a press counts. */}
      <div className="list-moving-card animate-tour-card-in motion-reduce:animate-none"
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse" || moving.held) return;
          const from = firstAt.current;
          if (!from) firstAt.current = { x: e.clientX, y: e.clientY };
          else if (Math.abs(e.clientX - from.x) + Math.abs(e.clientY - from.y) > 2) onHold(true);
        }}
        onPointerDown={(e) => { if (e.pointerType !== "mouse") onHold(true); }}
        onPointerUp={(e) => { if (e.pointerType !== "mouse") onHold(false); }}
        onPointerLeave={() => { firstAt.current = null; onHold(false); }} onPointerCancel={() => onHold(false)}>
        <p className="mb-0.5 text-[11px] font-semibold text-primary">{moving.picked}</p>
        <h2 className="text-[14px] font-semibold leading-snug text-slate-900">Moving to {VIEW_TITLE[moving.to].title}</h2>
        <p className="mt-1 text-[12.5px] leading-snug text-slate-500">{moving.why}</p>
        <div aria-hidden className="list-moving-bar"><span style={{ animationDuration: `${MOVE_PAUSE_MS}ms` }} /></div>
      </div>
    </div>
  );
}

const VIEW_TITLE: Record<ListView, { title: string; blurb: string }> = {
  publishers: {
    title: "Matched publishers",
    blurb:
      "Your seats, matched directly or via inventory partners.",
  },
  apps: {
    title: "Matched apps",
    blurb:
      "Your seats, matched directly or via inventory partners.",
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
    <p data-testid="inactive-quiet" className="text-[12px] leading-snug text-slate-500">
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
 *  API supplies a numeric count, and it never answered the filter unfiltered. */
function watchTabOn(counts: ChangeCounts | null, off: boolean, tab: ScopeTab): boolean {
  return !off && typeof counts?.[WATCH_CHANGE[tab]] === "number";
}

/**
 * WHAT A STATUS MEANS, ON HOVER (David, 2026-11-04: "an information thing
 * on hover ... very hidden and nice"). Only the statuses that are not plain
 * file changes; the filters' own small mark and floating line.
 */
const STATUS_INFO: Partial<Record<DrillTab, string>> = {
  // Plain words, what the reader did or what we did, never the machinery
  // (David, 2026-11-04: Started watching is a new line to track, not a line
  // added to a file).
  started:
    "Lines we started tracking for you this week, such as a new seat added to your watchlist. They were already in the publisher's file, so they are not counted as added.",
  stopped:
    "Lines we stopped tracking for you this week, such as a seat taken off your watchlist. They are not counted as removed. Each row says why.",
  unconfirmed:
    "Lines we could not verify this crawl, because the file answered differently on each read. They stay matched until the next crawl settles them.",
  inactive:
    "Publishers and apps that went inactive this week, such as a site that stopped answering or an app removed from its store. Not counted in the totals.",
};

/** Keep supported watch statuses visible even when the current filter has no rows. */
/** Desktop tabs and a native phone selector share exactly the same status state. */
function StatusControls({ tab, setTab, counts, off, inactive }: {
  tab: DrillTab; setTab: (tab: DrillTab) => void; counts: ChangeCounts | null; off: boolean; inactive: boolean;
}) {
  const [expanded, setExpanded] = useState(!["all", "added", "removed", "changed"].includes(tab));
  // Folding back (David, 2026-11-04: "the closing ... smooth, short"): the
  // extra statuses narrow and fade away, then hide; the arrow glides back.
  const [closing, setClosing] = useState(false);
  const extraRef = useRef<HTMLSpanElement | null>(null);
  const finishClosing = useCallback(() => {
    setClosing(false);
    setExpanded(false);
  }, []);
  useEffect(() => {
    if (!closing) return;
    // Never stuck half-closed if the animation's end is not reported.
    const timer = window.setTimeout(finishClosing, 260);
    return () => window.clearTimeout(timer);
  }, [closing, finishClosing]);
  const toggleMore = () => {
    if (closing) return;
    if (!expanded) {
      setExpanded(true);
      return;
    }
    const el = extraRef.current;
    if (!el || prefersReducedMotion()) {
      setExpanded(false);
      return;
    }
    el.style.setProperty("--status-extra-w", `${el.scrollWidth}px`);
    setClosing(true);
  };
  const open = expanded && !closing;
  const moreId = useId();
  const primary: { value: DrillTab; label: string }[] = [
    { value: "all", label: "All matched" }, { value: "added", label: "Added" },
    { value: "removed", label: "Removed" }, { value: "changed", label: "Changed" },
  ];
  const extra: { value: DrillTab; label: string }[] = [
    ...(["started", "stopped", "unconfirmed"] as ScopeTab[]).filter(value => watchTabOn(counts, off, value))
      .map(value => ({ value, label: value === "started" ? "Started watching" : value === "stopped" ? "Stopped watching" : "Unconfirmed" })),
    ...(inactive ? [{ value: "inactive" as const, label: "Inactive" }] : []),
  ];
  const selectedExtra = extra.find(option => option.value === tab);
  useEffect(() => { if (!["all", "added", "removed", "changed"].includes(tab)) setExpanded(true); }, [tab]);
  // THE SLIDING HIGHLIGHT (David, 2026-11-04: "when you click a lot of
  // statuses, make it a smooth move"). One white pill glides under the
  // selected status instead of each tab lighting up on its own. Measured
  // from the selected tab after every change (tab, the extra statuses
  // opening, a resize); no animation on the first placement.
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [pillReady, setPillReady] = useState(false);
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const place = () => {
      const el = track.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (!el || el.offsetParent === null) {
        setPill(null);
        return;
      }
      setPill({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    place();
    const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    watch?.observe(track);
    return () => watch?.disconnect();
  }, [tab, expanded, extra.length]);
  useEffect(() => {
    if (!pill || pillReady) return;
    const frame = requestAnimationFrame(() => setPillReady(true));
    return () => cancelAnimationFrame(frame);
  }, [pill, pillReady]);
  return <>
    <label className="report-mobile-status" data-tour="list-tabs-mobile"><span>Status</span>
      <select aria-label="Matched status" value={tab} onChange={event => setTab(event.target.value as DrillTab)}>
        {[...primary, ...extra].map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <Tabs value={tab} onValueChange={value => setTab(value as DrillTab)} className="report-desktop-status max-w-full" data-tour="list-tabs">
      <TabsList ref={trackRef} aria-label="Matched statuses" className={cn("status-track h-auto max-w-full justify-start", pill && "has-pill")}>
        {pill && (
          <span
            aria-hidden
            className={cn("status-pill", pillReady && "is-ready")}
            style={{ transform: `translate(${pill.x}px, ${pill.y}px)`, width: pill.w, height: pill.h }}
          />
        )}
        {primary.map(option => <TabsTrigger key={option.value} value={option.value}>{option.label}</TabsTrigger>)}
        {extra.length > 0 && <span
          id={moreId}
          ref={extraRef}
          hidden={!expanded}
          className={cn("status-extra-inline", closing && "status-extra-out")}
          onAnimationEnd={(event) => { if (closing && event.animationName === "status-hide") finishClosing(); }}
        >
          {extra.map(option => (
            <TabsTrigger key={option.value} value={option.value} className="gap-1">
              {option.label}
              {STATUS_INFO[option.value] && <FilterInfo text={STATUS_INFO[option.value] as string} />}
            </TabsTrigger>
          ))}
        </span>}
        {extra.length > 0 && <button type="button" data-testid="status-toggle"
          className={cn("status-more", selectedExtra && "status-more-active")}
          aria-label={open ? "Hide additional statuses" : "Show additional statuses"}
          title={open ? "Hide additional statuses" : selectedExtra ? `${selectedExtra.label} selected, show additional statuses` : "Show additional statuses"}
          aria-expanded={open} aria-controls={moreId} onClick={toggleMore}>
          <ChevronRight aria-hidden className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          <span>{open ? "Fewer" : `+${extra.length} ${extra.length === 1 ? "status" : "statuses"}`}</span>
        </button>}
      </TabsList>
    </Tabs>
  </>;
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
  const moved = watch ? watchLinesOf(d, watch.tab) : null;
  return {
    ...(watch ? { scope: { tab: watch.tab, filter: watch.filter, lines: moved } } : {}),
    files: watch
      ? moved && rowFilesOf(moved, moved.length < EVENT_LINES_CAP)
      : rowFilesOf(d.matched_lines, (d.matched_lines?.length ?? 0) >= d.line_count && d.line_count < ROW_LINES_CAP, d.found_in_all),
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

/** A publisher on Added, Removed or Changed (``event``: its tab; ``seats``:
 *  the page's seat-line filter, which the server decides the row's file
 *  from on a change tab). */
function eventRow(d: DeveloperEvent, event?: string, seats?: string[]): Row {
  const raw = event ? (d as Record<string, unknown>)[event === "changed" ? "cert_changed_lines" : `${event}_lines`] : null;
  const moved = Array.isArray(raw) ? (raw as MatchedSeatLine[]) : null;
  return {
    files: moved && rowFilesOf(moved, moved.length < EVENT_LINES_CAP, null, seats),
    ...(event === "removed" ? { filesRemoved: true } : {}),
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
    // A line that says its old cert itself (crawler #370) keeps it.
    if (typeof l.old_cert_id === "string") return l;
    // By seat AND place (re-review of #75): the same seat in two files
    // gets each file's own old cert.
    const c = certChangeOf(certs, l, ownHost);
    return c ? { ...l, old_cert_id: c.old ?? "", cert_id: l.cert_id || c.next || undefined } : l;
  });
}

/**
 * THE CHANGED TAB'S FILE SAYS OLD TO NEW, as its rows do (reviews of #75):
 * each exported row's own cert changes (rowCertChanges, the read a row
 * makes when it opens), so the file reads only for the rows the tab, its
 * search and its match type list, never the report's whole list. Four at
 * a time, each counted as it lands. Lines that already say their old cert
 * (crawler #370) are not read for. A read that fails leaves that row's
 * lines with their new cert only, and the file's note says so; it never
 * fails the file.
 */
function changedCerts(token: string, lines: string[], signal: AbortSignal) {
  let missed = 0;
  return {
    rows: <R,>(
      rows: R[],
      of: (r: R) => { dev: number | null; lines: MatchedSeatLine[]; host: string | null | undefined },
      put: (r: R, lines: MatchedSeatLine[]) => R,
      counted: () => void,
    ): Promise<R[]> =>
      mapLimit(
        rows,
        4,
        async (r) => {
          const { dev, lines: certLines, host } = of(r);
          try {
            if (dev == null || !certLines.length || hasOldCerts(certLines)) return r;
            return put(r, withOldCerts(certLines, await rowCertChanges(token, dev, lines), host));
          } catch {
            if (signal.aborted) throw new DOMException("Aborted", "AbortError");
            missed++;
            return r;
          } finally {
            counted();
          }
        },
        signal,
      ),
    note: (): string | undefined =>
      missed
        ? `The old cert of ${missed.toLocaleString()} ${missed === 1 ? "row" : "rows"} could not be read: ${missed === 1 ? "its lines show" : "their lines show"} the new cert only.`
        : undefined,
  };
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
      <LineActionGroup>
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
      </LineActionGroup>
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

/** "IPD partner", as the workbook writes it: the API's own
 *  `ipd_partner_label` (crawler #370, the Excel's exact string) when it
 *  sends one. Before: the workbook names the platform from the crawler's
 *  registry, else the publisher's domain; the list knows the publisher's
 *  name, else its domain. */
function ipdPartnerCell(
  mt: string | null | undefined,
  partner: string | null | undefined,
  name: string | null | undefined,
  domain: string | null | undefined,
  label?: string | null,
): string {
  if (mt !== "ipd") return "";
  if (typeof label === "string" && label.trim()) return label.trim();
  if (!partner) return "";
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
    ipdPartnerCell(r.match_type, r.ipd_partner, r.developer_name, r.developer_domain, r.ipd_partner_label),
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
    storeName(a),
    a.bundle_id,
    a.owner_domain,
    a.owner_name,
    matchedViaCell(a.match_type),
    ipdPartnerCell(a.match_type, a.ipd_partner, a.owner_name, a.owner_domain, a.ipd_partner_label),
    // The Excel's own words for the file when the API sends them (#370).
    (typeof a.file_used === "string" && a.file_used.trim() ? a.file_used.trim() : appFileLine(a.file_host, a.file_source)) ?? "",
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
  /** Where its lines are, the file (never a platform): on the list, all of
   *  its matched lines; on a change tab, the lines that moved there. The
   *  Found in filter keeps the row by it. Null when the row cannot say. */
  files?: FileWord | null;
  /** Set on the Removed tab: ``files`` are the files its lines were removed
   *  from, and the row says so (David, 2026-11-02). */
  filesRemoved?: boolean;
  /** Set on a watch tab: which tab, under which line filter, and the
   *  row's lines of the kind when the crawler sends them with the row. */
  scope?: WatchMark;
} & MatchTypeFields;

/** The crawler's caps on the lines a frozen row keeps: a list row 5,000
 *  (``_ROW_LINES_CAP``), a change row 200 (``_EVENT_LINES_CAP``). */
const ROW_LINES_CAP = 5_000;
const EVENT_LINES_CAP = 200;

/**
 * Which file a publisher's lines are in, said in words after its domain
 * ("x.com, Found in ads.txt"): a detail, so the line's own quiet text and
 * never a badge (David, 2026-11-02), worded by ``foundInLabel`` exactly as
 * Sellers.json and Schain say it. On a phone it takes its own line, so a
 * long domain is never cut to make room for it.
 */
function FileHint({ files, after, removed }: { files: FileWord; after: boolean; removed?: boolean }) {
  return (
    <span data-file-tag={files} className="file-hint flex-none whitespace-nowrap">
      {after && <span className="file-hint-comma">, </span>}{foundInLabel(files, removed)}
    </span>
  );
}

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
  if (d.ipd_partner_label !== undefined) out.ipd_partner_label = d.ipd_partner_label;
  return out;
}

/* Status tabs navigate the list; its search, filters and paging share one bar. */
/**
 * RESET (David, 2026-11-04: "a reset button for all filters"). Stands at
 * the end of the list's status row and on the cards' line, only while
 * something narrows the report or the list: one press puts the seat lines,
 * Match type, Found in, Platform, the status and the search back to All.
 * Outside the filter bar on purpose: a fifth control there folds the
 * filters behind one button on a laptop screen.
 */
/**
 * A block that never shrinks while the page is the same width: its tallest
 * height so far is its floor (a new width starts over). The sentence under
 * the title wraps to two lines on a phone for the whole report and fits on
 * one under a filter; without this the header, and the list under the
 * reader's hand, would jump up when a filter lands (review, 2026-11-04).
 */
function SteadyHeight({ children, className }: { children: ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const width = useRef(0);
  const [floor, setFloor] = useState(0);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const box = el.getBoundingClientRect(); // fractional: a rounded floor moves the page by a sliver
    const w = box.width;
    const h = box.height;
    if (w !== width.current) {
      width.current = w;
      if (floor !== h) setFloor(h);
    } else if (h > floor) setFloor(h);
  });
  useEffect(() => {
    const again = () => { width.current = 0; setFloor(0); };
    window.addEventListener("resize", again);
    return () => window.removeEventListener("resize", again);
  }, []);
  return (
    <div className={className} style={floor ? { minHeight: floor } : undefined}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

/** A card's quiet line ("Filtered: IPD, ads.txt"): ONE LINE, ALWAYS (David,
 *  2026-11-04). It truncates before it would wrap; the whole of it is its
 *  title and what a screen reader hears. */
function CardNote({ note }: { note: string }) {
  // On a phone the line above the cards already says "Filtered:", so a card
  // names the choices alone and they fit whole ("IPD, ads.txt + Both").
  const short = note.replace(/^Filtered: /, "");
  return (
    <span data-card-note title={note} aria-label={note} className="block truncate text-slate-400">
      <span className="hidden sm:inline">{note}</span>
      <span className="sm:hidden">{short}</span>
    </span>
  );
}

function ResetFilters({ onReset, testId = "reset-filters", className }: { onReset: () => void; testId?: string; className?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onReset}
      className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <RotateCcw aria-hidden className="h-3 w-3" />
      Reset filters
    </button>
  );
}

export function ListTabsRow({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="list-tabs-left flex min-w-0 max-w-full flex-wrap items-center gap-3">{left}</div>
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
  filters,
  actions,
  loading,
}: {
  query: string;
  setQuery: (next: string) => void;
  placeholder: string;
  label: string;
  /** The count and pager; null while nothing has landed (the row keeps its
   *  height: the search box is as tall as the pager). */
  right: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  /** The rows are loading: the filters keep the fold they have landed with. */
  loading?: boolean;
}) {
  return (
    <FilterBar actions={actions}>
      <FilterSearch value={query} onChange={setQuery} placeholder={placeholder} ariaLabel={label} />
      {filters && <FilterGroup settling={loading}>{filters}</FilterGroup>}
      {right && <div data-list-count className="list-toolbar-results">{right}</div>}
    </FilterBar>
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

/** A filter's place while its counts are on the way: the skeleton's tone,
 *  a trigger's size, so nothing moves when the real filter lands. */
function FilterSkeleton({ width = "w-20" }: { width?: string }) {
  return (
    <>
      <div className="list-toolbar-divider" />
      <span aria-hidden data-filter-skeleton className="list-toolbar-select flex items-center px-3">
        <Skeleton className={cn("h-3 rounded-md", width)} />
      </span>
    </>
  );
}

/** The three filters' places on a list's first load (Platform, Found in,
 *  Match type), until it says how it splits. */
function FilterSkeletons() {
  return <><FilterSkeleton width="w-24" /><FilterSkeleton width="w-32" /><FilterSkeleton width="w-28" /></>;
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
  foundInMulti,
  onPlatform,
  searchReset,
  known,
  pageFiltered = false,
  onReset,
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
  /** All files, or ads.txt / app-ads.txt / Both ticked (any of them), the
   *  page's too. */
  foundIn: FoundInFilter;
  setFoundIn: (next: FoundInFilter) => void;
  /** Whether the API takes several files in one found_in (the page asks
   *  once): the tick boxes and Web need it. */
  foundInMulti: boolean;
  /** The page's one Platform pick (CTV / Mobile open the apps list). */
  onPlatform: (next: PlatformFilter) => void;
  /** Bumped by a Popular choice: the search clears. */
  searchReset: number;
  /** Counts the page read for the Popular choices (expectedRows). */
  known?: Record<string, number> | null;
  /** A page filter narrows the report (seat lines, Match type, Found in,
   *  Platform): Reset stands in the filters. */
  pageFiltered?: boolean;
  /** Puts every filter back to All (the page's, and this list's search). */
  onReset?: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  // The list's split by file (crawler PR): null, no Found in switch.
  const [foundInCounts, setFoundInCounts] = useState<FoundInCounts | null>(null);
  // PLATFORM ON THE PUBLISHERS LIST (David, 2026-11-01): a publisher has
  // none, so here CTV and Mobile are the APPS this tab holds on each, read
  // the way the apps list will read them, and open that list; Web is the
  // web publishers (ads.txt + Both), this list. Null: an API without the
  // apps' platform split, so no CTV or Mobile choice.
  const [appCounts, setAppCounts] = useState<PlatformCounts | null>(null);
  useEffect(() => {
    // Never last tab's numbers under this tab: none until these land.
    setAppCounts(null);
    if (tab === "inactive") return;
    let cancelled = false;
    const change = appChangeOf(tab);
    api.matchedApps(token, 1, "", lines, matchType, change, 1)
      .then((r) => {
        // Counts of this tab only: an API that did not filter by it (no
        // echo) would count the whole list.
        if (!cancelled) setAppCounts(!change || r.change === change ? r.platform_counts ?? null : null);
      })
      .catch(() => { if (!cancelled) setAppCounts(null); });
    return () => { cancelled = true; };
  }, [token, tab, lines, matchType]);
  // THE WATCH TABS (crawler #361): the list's change counts, from the last
  // answer that carried them; and whether the API ever answered a watch
  // filter unfiltered (an API without it: those tabs are not offered).
  const [changeCounts, setChangeCounts] = useState<ChangeCounts | null>(null);
  const [watchOff, setWatchOff] = useState(false);
  // Inactive, or a change tab (its events carry no status counts), can be
  // the first view mounted: a list card or a filter's move opens the list
  // on the tab the page is on. Read status capabilities without requiring
  // a detour through All matched, so the extra statuses never vanish.
  // Older reports still omit them.
  useEffect(() => {
    if (tab === "all" || isScopeTab(tab) || changeCounts !== null || watchOff) return;
    let cancelled = false;
    api.matchedDevelopers(token, 1, "", lines, matchType, 1)
      .then(result => { if (!cancelled && result.change_counts) setChangeCounts(result.change_counts); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, tab, lines, matchType, changeCounts, watchOff]);

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
            rows: r.rows.map((d) => eventRow(d, event, lines)),
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
  const exportList = async (sink: CsvSink, progress: Progress, signal: AbortSignal): Promise<ExportDone> => {
    const t = rowsTab;
    const mt = rowsMatchType;
    const fi: FoundInFilter = foundInCounts ? foundIn : "all";
    const certs = changedCerts(token, lines, signal);
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
      let total = 0;
      let done = 0;
      await eachPage(
        async (pg) => {
          const r = await api.developerEvents(token, t, pg, query, lines, mt, 200, fi);
          total = typeof r.total === "number" ? r.total : total;
          return r;
        },
        200,
        async (page) => {
          const rows = page.map((d) => eventRow(d));
          const out =
            t === "changed"
              ? await certs.rows(
                  rows,
                  (r) => ({ dev: r.developer_id, lines: r.cert_changed_lines, host: r.developer_domain }),
                  (r, cert_changed_lines) => ({ ...r, cert_changed_lines }),
                  () => progress(++done, total),
                )
              : rows;
          sink.rows(out.map((r) => publisherCells(r, t)));
        },
        // The Changed tab counts its rows as their certs are read.
        t === "changed" ? undefined : progress,
        signal,
      );
    }
    return {
      name: csvName(
        "publishers",
        TAB_SLUG[t],
        fi !== "all" ? `found in ${fi.replace(/_/g, " ")}` : null,
        mt !== "all" ? mt : null,
        query ? `search ${query}` : null,
      ),
      note: certs.note(),
    };
  };

  return (
    <div>
      {/* The two control rows (see ListTabsRow). A page turned from the
          pager under the list scrolls back up to here. */}
      <div ref={paging.topRef} className="mb-3 space-y-2">
        <ListTabsRow
          left={
            <>
          <StatusControls tab={tab} setTab={setTab} counts={changeCounts} off={watchOff} inactive={!!inactive} />
            </>
          }
          // Not on a phone: there it would take a row of its own and push the
          // list down as it comes and goes; the cards' line has the same Reset.
          right={onReset && (pageFiltered || query !== "" || tab !== "all") ? <ResetFilters onReset={onReset} className="hidden sm:inline-flex" /> : null}
        />
        {isScopeTab(tab) && <p data-scope-note className="text-[12px] leading-relaxed text-slate-500">{SCOPE_NOTE[tab]}</p>}
        {tab !== "inactive" && (
          <ListSearchRow
            query={query}
            setQuery={setQuery}
            placeholder="Search publishers"
            loading={loading}
            label="Search matched publishers"
            actions={!loading && settled > 0 && !error && rows.length > 0 && !trial && !caps ? <ExportListButton run={exportList} noun="publishers" status={rowsTab} query={query} filtered={lines.length > 0 || rowsMatchType !== "all" || foundIn !== "all"} /> : null}
            // A first load: the filters' places as skeletons (David,
            // 2026-11-02: every wait on the Overview is a skeleton).
            filters={loading && settled === 0 && !foundInCounts && !typeCounts ? <FilterSkeletons /> : <>
              {/* PLATFORM, first on both lists so it stands in one place. */}
              {(foundInCounts || appCounts) && <FilterSelect
                value={foundIn === WEB_PUBLISHERS ? "web" : "all"}
                onChange={onPlatform}
                leading="Platform" icon={MonitorSmartphone} ariaLabel="Platform" testId="platform" info={FILTER_INFO.platform}
                // Its Web is Found in's ads.txt + Both, counted there.
                narrows={false}
                options={[
                  // Every choice says what it counts and wears the arrow, in
                  // one look (David, 2026-11-02); CTV and Mobile say "apps",
                  // the list they open.
                  { value: "all" as const, label: "All", description: "Every matched publisher.",
                    countLabel: foundInCounts ? `${foundInCounts.all.toLocaleString()} publishers` : undefined, leads: true },
                  ...(["ctv", "mobile"] as const).filter((p) => (appCounts?.[p] ?? 0) > 0).map((p) => ({
                    value: p,
                    label: p === "ctv" ? "CTV" : "Mobile",
                    description: `An app platform. Opens Matched apps on ${p === "ctv" ? "CTV" : "Mobile"}.`,
                    countLabel: `${(appCounts?.[p] ?? 0).toLocaleString()} apps`,
                    leads: true,
                  })),
                  // Web needs two files in one found_in; the chosen Web stays
                  // listed even when nothing here is web, so the trigger
                  // always names what is applied.
                  ...(foundInMulti && foundInCounts && (foundIn === WEB_PUBLISHERS || foundInCounts.ads_txt + foundInCounts.both > 0) ? [{
                    value: "web" as const,
                    label: "Web",
                    description: "Web publishers: found in ads.txt + Both.",
                    countLabel: `${(foundInCounts.ads_txt + foundInCounts.both).toLocaleString()} publishers`,
                    leads: true,
                  }] : []),
                ]} />}
              {/* FOUND IN, TICK BOXES (David, 2026-11-01): any of the three
                  files at once; ads.txt + Both are the web publishers, what
                  Platform's Web picks. */}
              {foundInCounts && (foundInMulti ? <FilterMultiSelect value={foundInFiles(foundIn)} onChange={(files) => setFoundIn(foundInOf(files))} leading="Found in" icon={FileText} ariaLabel="Found in" testId="found-in" info={FILTER_INFO.foundIn}
                noun={foundIn === WEB_PUBLISHERS ? "web publishers" : "publishers"}
                allLabel="All files" allDescription="Publishers matched in either file." allCount={foundInCounts.all}
                choices={FOUND_IN_FILES}
                options={([
                  { value: "ads_txt", label: "ads.txt", description: "Matching lines in ads.txt only." },
                  { value: "app_ads_txt", label: "app-ads.txt", description: "Matching lines in app-ads.txt only." },
                  { value: "both", label: "Both", description: "Matching lines in both files." },
                ] as const).filter(o => foundInFiles(foundIn).includes(o.value) || (foundInCounts[o.value] ?? 0) > 0).map(o => ({ ...o, count: foundInCounts[o.value] }))} />
                // An API that takes one file at a time: one choice, as before.
                : <FilterSelect value={foundIn} onChange={setFoundIn} leading="Found in" icon={FileText} ariaLabel="Found in" testId="found-in" info={FILTER_INFO.foundIn} options={([
                  { value: "all", label: "All files", description: "Publishers matched in either source file." },
                  { value: "ads_txt", label: "ads.txt", description: "Publishers with matching lines in ads.txt." },
                  { value: "app_ads_txt", label: "app-ads.txt", description: "Publishers with matching lines in app-ads.txt." },
                  { value: "both", label: "Both", description: "Publishers with matching lines in both files." },
                ] as const).filter(o => o.value === "all" || o.value === foundIn || (foundInCounts[o.value] ?? 0) > 0).map(o => ({ ...o, count: foundInCounts[o.value] }))} />)}
              {typeCounts && <FilterSelect value={matchType} onChange={setMatchType} leading="Match type" icon={SlidersHorizontal} menuLabel="Filter by match type" ariaLabel="Match type" testId="match-type" info={FILTER_INFO.matchType} options={[
                { value: "all", label: "All", description: "Publisher files and inventory partners", count: typeCounts.all }, { value: "own", label: "Own", description: "In the publisher’s own file", count: typeCounts.own }, { value: "ipd", label: "IPD", description: "Via a declared inventory partner", count: typeCounts.ipd },
              ]} />}
            </>}
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
                  <Settle key={r.developer_id} index={i} tour={i === 0 ? "overview-first-row" : undefined}>
                    <PublisherCard
                      row={r}
                      watchNote={watchReason(r, tab)}
                      status={rowStatus(tab)}
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
  watchNote = null,
  status = null,
}: {
  row: Row;
  token: string;
  open: boolean;
  onToggle: () => void;
  /** Set on the Inactive tab: the same card, greyed, with its strip. */
  inactive?: InactiveMark & { apps: number | null };
  /** The page's line filter, for what an opened row reads. */
  lineFilter?: string[];
  /** On a watch tab: the row's one-line reason (``watchReason``). */
  watchNote?: string | null;
  /** The status tab the row is listed on: its avatar's tint and mark. */
  status?: RowStatus | null;
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
  // Every row on Stopped watching, whatever its reason (2026-11-04).
  // The row's look: its tab's status, or inactive on the Inactive list.
  const look: RowStatus | null = inactive ? "inactive" : status;
  const stopped = look === "stopped";
  const [siteHover, setSiteHover] = useState(false);
  const hasEmbeddedLines =
    row.matched_lines.length > 0 ||
    row.added_lines.length > 0 ||
    row.removed_lines.length > 0 ||
    row.cert_changed_lines.length > 0;
  return (
    <div
      className={cn(
        "report-row overflow-hidden rounded-xl border shadow-sm transition-colors",
        // Every status row is a white card; only its avatar carries the
        // status (David, 2026-11-04). The class keeps an inactive row's
        // phone layout.
        inactive ? "inactive-report-row border-border bg-white" : "border-border bg-white",
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
          onClick={(e) => toggleWithoutJump(e.currentTarget, onToggle)}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} the seat lines of ${row.developer_name || row.developer_domain || "this publisher"}`}
          className="absolute inset-0 z-0 rounded-t-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
        >
          <span className="report-expand-control">
            <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </span>
        </button>
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
                "relative flex h-11 w-11 items-center justify-center rounded-full text-base font-semibold",
                avatarTone(look, "bg-accent text-primary"),
              )}
            >
              {initial}
              {look && <StatusBadge status={look} />}
            </div>
          </PublisherAvatarLink>
        ) : (
          <div
            className={cn(
              "relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-base font-semibold",
              avatarTone(look, "bg-accent text-primary"),
            )}
          >
            {initial}
            {look && <StatusBadge status={look} />}
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
          </div>
          {((row.developer_domain && row.developer_name) || (!inactive && row.files)) && (
            <div className="publisher-subline flex min-w-0 items-center text-xs text-slate-500">
              {row.developer_domain && row.developer_name && (
                // In a sentence with the file, no hover arrow: it holds its
                // width and would stand the comma a blank away.
                <PublisherDomainLink
                  domain={row.developer_domain}
                  onHoverChange={setSiteHover}
                  arrow={Boolean(inactive) || !row.files}
                />
              )}
              {/* WHICH FILE (David, 2026-11-01): ads.txt, app-ads.txt or
                  both, what Found in keeps it by; a file, never a platform. */}
              {!inactive && row.files && <FileHint files={row.files} after={Boolean(row.developer_domain && row.developer_name)} removed={row.filesRemoved} />}
            </div>
          )}
          {/* WHERE ITS FILES ARE (2026-10-21): the declared hosts whose
              app-ads.txt hold some of this publisher's lines. One quiet
              line, only when there are any; the lines below say which. */}
          {!inactive && <IpdWhere row={row} others={otherPartners(row, row.matched_lines)} />}
          <WatchReason text={watchNote} />
          {inactive && <InactiveLine mark={inactive} />}
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
              <MiniStat label="Last week" value={row.prev} muted={stopped} />
            </div>
          )}
          <div className="w-[84px]">
            <MiniStat label="This week" value={row.current} emphasis muted={stopped} />
          </div>
          <ChangeCell
            added={row.added}
            removed={row.removed}
            certChanged={row.cert_changed}
          />
        </div>
        )}
        <span aria-hidden className="report-expand-space flex-shrink-0" />
      </div>
      </div>
      <Collapse open={open}>
        <div
          className={cn(
            "border-t px-4 pb-4 pt-3 sm:px-5",
            OPENED_AREA,
          )}
        >
          {inactive && <InactiveEvidence text={inactive.evidence} />}
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
                  counts={{ added: row.added, removed: row.removed, cert: row.cert_changed }}
                  loadAll={{
                    added: () => allChangeLines(token, row.developer_id, "added", row.developer_domain),
                    removed: () => allChangeLines(token, row.developer_id, "removed", row.developer_domain),
                    cert: () => allChangeLines(token, row.developer_id, "cert", row.developer_domain),
                  }}
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

/** Every line, one click away; one motion both ways (``FoldedList``). */
const CHANGE_LINES_OPEN = FOLD_OPEN;
const CHANGE_LINES_SLACK = FOLD_SLACK;
const CHANGE_LINES_STEP = FOLD_STEP;

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

/** "Not re-checked this crawl, last confirmed 20 Oct" for a line this
 *  crawl did not read again (crawler #370 `last_confirmed`, "YYYY-MM-DD");
 *  null for any other line, or a date it cannot read. */
export function lastConfirmedNote(day: unknown): string | null {
  if (typeof day !== "string") return null;
  const m = day.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1];
  if (!month) return null;
  return `Not re-checked this crawl, last confirmed ${Number(m[3])} ${month}`;
}

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
  /** The line has left the publisher's file; source links open the current file. */
  gone?: boolean;
  /** Whose source file the explicit Open control should use. */
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
            : addedDates(line);
  // Why it was removed, when the report says (2026-10-26).
  const removal = change === "removed" ? removalReasonText(line) : null;
  const unchecked = lastConfirmedNote(line.last_confirmed);
  // The parent card explains IPD. Keep each line focused on its record,
  // dates and source, while retaining its exact partner as the file target.
  const fileDomain = inOwn ? line.host || publisherDomain : partners[0];
  const foundIn = inOwn ? line.found_in : "ads.txt";
  const sourceKind = fileLabelOf(foundIn);
  const sourceFiles = ["ads.txt", "app-ads.txt", "both"].includes(sourceKind) ? filesOf(sourceKind) : [];
  // A removed line names the files it was removed from (David,
  // 2026-11-02), the way ``foundInLabel`` says it: counted once per file.
  const sourceLead = change === "removed" ? (dates ? ", removed from " : "Removed from ") : dates ? ", found in " : "Found in ";
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
      {/* NOT RE-CHECKED (crawler #370): a line this crawl did not read
          again says when it was last confirmed. */}
      {unchecked && <RowNote data-line-unchecked>{unchecked}</RowNote>}
      <RowNote data-line-dates title={dateTitle(line.date_source)}>
          {dates}
          {sourceFiles.length > 0 && <span data-line-source>{sourceLead}{sourceFiles.map((file, index) => (
            <span key={file}>{index > 0 && " + "}{linkable(fileDomain) ? (
              <a href={fileUrl(fileDomain, file, gone ? null : line)} target="_blank" rel="noopener noreferrer"
                onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
                className="line-source-reference" title={`Open ${fileDomain}/${file}`}>{file}</a>
            ) : <span className="line-source-reference">{file}</span>}</span>
          ))}</span>}
          {sourceFiles.length === 0 && <span data-line-source>{dates ? ", source file not recorded" : "Source file not recorded"}</span>}
      </RowNote>
    </div>
  );
  const gutter = <LineNo n={n} digits={digits} />;
  // THE FILE'S HOST (2026-10-21): a line credited from a declared host's
  // app-ads.txt lives in THAT file, so the row opens it there and says so
  // at the margin, after the file name. The publisher's own file, or a
  // host that is the publisher's domain, says nothing extra. A line only
  // a partner carries opens that partner's ads.txt (2026-10-27: every line
  // used to open the row's first partner's file, whoever carried it).
  const hostLabel = inOwn ? lineHostLabel(line.host, publisherDomain) : null;
  const host = hostLabel && (
    <span data-line-host className={ROW_MARGIN}>
      {hostLabel}
    </span>
  );
  const rowClass = SEAT_ROW;
  return (
    <ActionableLine
      line={line}
      selectionLabel={`Line ${n}`}
      publisherDomain={fileDomain}
      sourceDomains={inOwn ? undefined : partners}
      foundIn={foundIn}
      gone={gone}
      className={rowClass}
    >
      {gutter}
      {text}
      {host}
    </ActionableLine>
  );
}

/**
 * One titled window of change lines: a toned header carrying the count, above a
 * white list of the lines. Used full width on its own for a single-kind change,
 * and as a tile in the side-by-side grid for a mixed one. The header count is
 * the honest total; a long list prints the first few and tails the rest.
 *
 * THE COUNT IS THE ROW'S CHANGE COLUMN (David, 2026-11-02): a change counts
 * once per file it happened in, so a seat removed from ads.txt and app-ads.txt
 * is 2, listed once as "removed from ads.txt + app-ads.txt". The window used
 * to count its rows (1) under a Change of -2.
 */
function ChangeWindow({
  kind,
  lines,
  total,
  publisherDomain,
  rowPartner,
  certRead,
  loadAll,
}: {
  kind: ChangeKind;
  lines: MatchedSeatLine[];
  /** The row's own count of this kind, as its Change column says it; the
   *  rows listed when the row has none. */
  total?: number;
  publisherDomain?: string | null;
  rowPartner?: string | null;
  /** A cert window: whose old certs to read (the row's own, on open). */
  certRead?: CertRead;
  /** Every line of this change from the report's line events, for a row
   *  frozen before 2026-10-28 that kept only its first 200. */
  loadAll?: () => Promise<MatchedSeatLine[]>;
}) {
  const s = CHANGE_WINDOW[kind];
  const [open, setOpen] = useState(false);
  const [drawn, setDrawn] = useState(CHANGE_LINES_STEP);
  const [whole, setWhole] = useState<MatchedSeatLine[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const alive = useRef(true);
  // Set on every mount: React's development double mount runs the cleanup
  // once, and a flag left false would drop the answer (review, 2026-11-02).
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const listId = useId();
  const stopMotion = useRef<(() => void) | null>(null);
  // The list's height before it opened, eased from once the whole list is drawn.
  const openedFrom = useRef<number | null>(null);
  useEffect(() => () => stopMotion.current?.(), []);
  const source = whole ?? lines;
  // THE CERT, OLD TO NEW (David, 2026-10-27), read for this row only.
  // Lines that say their old cert themselves (crawler #370) need no read.
  const certs = useRowCerts(kind === "cert" && !hasOldCerts(source) ? certRead : undefined);
  // One row per distinct line, its partners beside it (2026-10-27).
  const groups = groupSeatLines(withOldCerts(source, certs, publisherDomain), rowPartner);
  // A row frozen before 2026-10-28 kept its first 200 own lines (its
  // inventory partners' copies were added after the cut): exactly 200 own
  // lines, counting fewer changes per file than the row's own count, was cut.
  const cut =
    Boolean(loadAll) && whole === null &&
    ownLineCount(lines) === EVENT_LINES_CAP && typeof total === "number" && perFileCount(lines) < total;
  const folds = cut || groups.length > CHANGE_LINES_OPEN + CHANGE_LINES_SLACK;
  const shown = !folds ? groups : groups.slice(0, open ? drawn : CHANGE_LINES_OPEN);
  const scroller = useRef<HTMLDivElement | null>(null);
  const more = useRef<HTMLButtonElement | null>(null);
  // Draw the next step as the reader nears the end of what is drawn.
  useEffect(() => {
    const el = more.current;
    if (!open || !el || drawn >= groups.length || typeof IntersectionObserver === "undefined") return;
    const seen = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setDrawn((d) => d + CHANGE_LINES_STEP),
      { root: scroller.current, rootMargin: "400px 0px" },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, [open, drawn, groups.length]);
  // Opening: the whole list is drawn, then its height eases up from where
  // the first lines left it, before the browser paints.
  useLayoutEffect(() => {
    const el = scroller.current;
    const from = openedFrom.current;
    openedFrom.current = null;
    if (el && !open) {
      // Closed: the first lines are drawn, so the held height lets go.
      el.style.height = "";
      el.style.overflow = "";
      return;
    }
    if (!open || !el || from === null) return;
    const to = el.getBoundingClientRect().height;
    if (to <= from) return;
    stopMotion.current?.();
    stopMotion.current = easeListHeight(el, from, to, () => { stopMotion.current = null; });
  }, [open]);
  const toggle = () => {
    const el = scroller.current;
    const still = prefersReducedMotion();
    if (open) {
      const finish = () => {
        stopMotion.current = null;
        if (el) el.scrollTop = 0;
        setOpen(false);
        setDrawn(CHANGE_LINES_STEP);
      };
      // Closing: the height eases down to the first lines, then the rest go.
      const firstRows = el ? (Array.from(el.querySelector("ul")?.children ?? []) as HTMLElement[]).slice(0, CHANGE_LINES_OPEN) : [];
      const to = firstRows.reduce((h, r) => h + r.offsetHeight, 0);
      stopMotion.current?.();
      if (!el || still || !to) {
        finish();
        return;
      }
      stopMotion.current = easeListHeight(el, el.getBoundingClientRect().height, to, finish, true);
      return;
    }
    stopMotion.current?.();
    stopMotion.current = null;
    if (el && !still) openedFrom.current = el.getBoundingClientRect().height;
    setOpen(true);
    // A cut row reads the rest each time it opens until it has them, so a
    // failed read is tried again on the next open.
    if (cut && loadAll && !loading) {
      setLoading(true);
      setLoadFailed(false);
      loadAll()
        .then((all) => {
          // The held lines stay as they were, and none is ever dropped.
          if (alive.current) setWhole(withKeptLines(all, lines, publisherDomain));
        })
        .catch(() => { if (alive.current) setLoadFailed(true); })
        .finally(() => { if (alive.current) setLoading(false); });
    }
  };
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
          data-window-count
          className={cn(
            "font-mono text-[11px] font-semibold tabular-nums",
            s.text,
          )}
        >
          {typeof total === "number" && total > 0 ? total : groups.length}
        </span>
      </div>
      {/* Why a removal carries two dates, said once where the dates are. */}
      {kind === "removed" && (
        <p className="border-b border-border px-3 py-1 text-[10px] leading-snug text-slate-500">
          {WEEKLY_READ_NOTE}
        </p>
      )}
      <LineActionGroup tone={kind}>
      <div
        ref={scroller}
        id={listId}
        data-window-lines
        className={cn(open && folds && "max-h-[32rem] overflow-y-auto overscroll-contain")}
      >
      <ul className="bl-lines-in divide-y divide-border">
        {shown.map((g, i) => (
          <SeatLineRow
            key={`${seatKey(g.line)}:${i}`}
            line={g.line}
            partners={g.partners}
            own={g.own}
            n={i + 1}
            digits={gutterDigits(groups.length)}
            muted={s.muted}
            gone={kind === "removed"}
            publisherDomain={publisherDomain}
            change={kind}
          />
        ))}
      </ul>
      {open && drawn < groups.length && (
        <button
          ref={more}
          type="button"
          data-window-more
          onClick={() => setDrawn((d) => d + CHANGE_LINES_STEP)}
          className="w-full border-t border-border px-3 py-1.5 text-[11px] text-slate-500 hover:bg-muted/60"
        >
          Showing {drawn.toLocaleString()} of {groups.length.toLocaleString()} lines, scroll for more
        </button>
      )}
      {open && loading && (
        <p role="status" data-window-loading className="border-t border-border px-3 py-1.5 text-[11px] text-slate-500">
          Loading every line
        </p>
      )}
      {open && loadFailed && (
        <p role="status" data-window-load-failed className="border-t border-border px-3 py-1.5 text-[11px] text-slate-500">
          Could not load the lines past the first {lines.length.toLocaleString()}. Close and open the list to try again, or download the report.
        </p>
      )}
      </div>
      </LineActionGroup>
      {folds && (
        <button
          type="button"
          data-window-toggle
          aria-expanded={open}
          aria-controls={listId}
          onClick={toggle}
          className="flex w-full items-center justify-center gap-1 border-t border-border px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
        >
          <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          {open
            ? `Show the first ${CHANGE_LINES_OPEN}`
            : cut
              ? "Show all lines"
              : `Show all ${groups.length.toLocaleString()} lines`}
        </button>
      )}
    </section>
  );
}

/** A window's own lines: not an inventory partner's copy. */
function ownLineCount(lines: readonly MatchedSeatLine[]): number {
  return lines.filter((l) => l && l.match_type !== "ipd" && !l.ipd_partner).length;
}

/** A window's lines counted the way its row counts them: once per file, a
 *  line in ads.txt and app-ads.txt twice, each partner's copy once. */
function perFileCount(lines: readonly MatchedSeatLine[]): number {
  return lines.reduce((n, l) => n + (String(l?.found_in ?? "").toLowerCase() === "both" ? 2 : 1), 0);
}

/** Every line event of one publisher's change of a kind, every page,
 *  folded into the window's lines (``lib/changeLines``). A cert change is
 *  stored as "changed", which the endpoint's event filter does not take:
 *  the publisher's events are read whole and kept by kind. */
async function allChangeLines(
  token: string,
  developerId: number,
  kind: ChangeKind,
  publisherDomain?: string | null,
): Promise<MatchedSeatLine[]> {
  const rows: LineEvent[] = [];
  for (let page = 1; page <= 10_000; page++) {
    const r = await api.lineEvents(token, {
      ...(kind === "cert" ? {} : { event: kind }),
      developer_id: developerId,
      page,
      page_size: 500,
    });
    const got = Array.isArray(r.rows) ? r.rows : [];
    rows.push(...got);
    if (!got.length || rows.length >= (r.total ?? 0)) break;
  }
  const mine = kind === "cert" ? rows.filter((e) => e && (e.event === "changed" || e.event === "cert_changed")) : rows;
  return foldChangeEvents(mine, { cert: kind === "cert", publisherDomain });
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
  counts,
  loadAll,
  publisherDomain,
  rowPartner,
  certRead,
}: {
  added: MatchedSeatLine[];
  removed: MatchedSeatLine[];
  certChanged: MatchedSeatLine[];
  matched: MatchedSeatLine[];
  /** The row's Change column, which each window's count says. */
  counts?: Partial<Record<ChangeKind, number>>;
  /** Every line of a kind, for a row frozen when it kept only 200. */
  loadAll?: Partial<Record<ChangeKind, () => Promise<MatchedSeatLine[]>>>;
  /** Whose files the source controls should open. */
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
        total={counts?.[sections[0].kind]}
        loadAll={loadAll?.[sections[0].kind]}
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
            total={counts?.[sec.kind]}
            loadAll={loadAll?.[sec.kind]}
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
      <LineActionGroup>
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
      </LineActionGroup>
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
    // The line's cert: `cert_id` from crawler #370 on, else the event's
    // new (or old) cert.
    cert_id: (typeof e.cert_id === "string" ? e.cert_id : null) || e.new_cert_id || e.old_cert_id || undefined,
    // The file's host: the publisher's own domain on its own file, which
    // the row then keeps quiet about.
    ...(e.host ? { host: e.host } : {}),
    // And the file (re-review of #75): without it the same seat in the
    // ads.txt and the app-ads.txt folded into one row on this path.
    ...(typeof e.file_kind === "string" && e.file_kind ? { found_in: fileLabelOf(e.file_kind) } : {}),
    first_seen_at: e.first_seen_at, last_absent_at: e.last_absent_at,
    last_seen_at: e.last_seen_at, not_found_at: e.not_found_at, seen_at: e.seen_at, date_source: e.date_source,
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

/**
 * The matched APPS list, shown when the pink "Matched apps" card is selected.
 * A card-per-app list, the pink sibling of the publisher drilldown: same
 * shape, same expansion, same Added / Removed / Changed tabs, a different
 * family colour. An app that did not move this week appears under "All
 * matched" only.
 *
 * The change tabs ask the server for the WHOLE list filtered by the change
 * (``?change=``), paged and counted like All matched. An API from before
 * that filter ignores the parameter (it echoes no ``change``): explain
 * that this view is unavailable and offer All matched. Never manufacture
 * a status list from the page already loaded.
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
  foundInMulti,
  onPlatform,
  onFoundIn,
  searchReset,
  known,
  pageFiltered = false,
  onReset,
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
  /** All / CTV / Mobile, the page's too (apps only). */
  platform: PlatformFilter;
  setPlatform: (next: PlatformFilter) => void;
  /** Whether the API takes several files in one found_in: Web needs it. */
  foundInMulti: boolean;
  /** The page's one Platform pick (Web opens the publishers list). */
  onPlatform: (next: PlatformFilter) => void;
  /** A Found in pick here: it opens the publishers list on that file. */
  onFoundIn: (next: FoundInFilter) => void;
  /** Bumped by a Popular choice: the search clears. */
  searchReset: number;
  /** Counts the page read for the Popular choices (expectedRows). */
  known?: Record<string, number> | null;
  /** A page filter narrows the report: Reset stands in the filters. */
  pageFiltered?: boolean;
  /** Puts every filter back to All (the page's, and this list's search). */
  onReset?: () => void;
}) {
  const [allRows, setAllRows] = useState<AppRow[]>([]);
  // The list's split by platform (crawler PR): null, no Platform switch.
  const [platformCounts, setPlatformCounts] = useState<PlatformCounts | null>(null);
  // WEB (David, 2026-11-01): web is not an app, so Platform's Web opens the
  // publishers list on its web publishers (ads.txt alone or with
  // app-ads.txt), on this tab under these filters. How many it opens, read
  // the way that list will read them; null, no Web choice: an API that
  // cannot ask for several files at once (it refuses, or does not echo),
  // or none to open.
  const [webPublishers, setWebPublishers] = useState<number | null>(null);
  // FOUND IN HERE (David, 2026-11-02): the publishers' split by file, read
  // the way their list reads it, for the Found in that opens them; null,
  // no Found in on this list (an API without the split).
  const [publisherFiles, setPublisherFiles] = useState<FoundInCounts | null>(null);
  // While it is read, Found in keeps its place as a skeleton, unless the
  // API has shown it has no split to give (no place to keep).
  const [filesPending, setFilesPending] = useState(false);
  const hadFiles = useRef<boolean | null>(null);
  // How many reads have landed on this list (the skeleton's cue too).
  const [settled, setSettled] = useState(0);
  const platformShown = platformCounts != null;
  // Read once the list has landed: it then says whether it has a Platform
  // (so the one read asks the right thing, never twice).
  const listLanded = settled > 0;
  useEffect(() => {
    // Never last tab's numbers under this tab: none until this one lands.
    setWebPublishers(null);
    setPublisherFiles(null);
    setFilesPending(tab !== "inactive" && listLanded);
    if (tab === "inactive" || !listLanded) return;
    let cancelled = false;
    const watch = isScopeTab(tab) ? WATCH_CHANGE[tab] : undefined;
    // One read: on Web (when the API takes two files and this list has a
    // Platform to offer it on), which also carries the split by file.
    const asked: FoundInFilter = foundInMulti && platformShown ? WEB_PUBLISHERS : "all";
    const read: Promise<{ total: number; found_in?: string | null; change?: string | null; found_in_counts?: FoundInCounts | null }> =
      tab === "all" || isScopeTab(tab)
        ? api.matchedDevelopers(token, 1, "", lines, matchType, 1, watch, asked)
        : api.developerEvents(token, tab, 1, "", lines, matchType, 1, asked);
    read
      .then((r) => {
        if (cancelled) return;
        // This tab's numbers only: a watch tab the API did not filter by
        // (no echo) would be the whole list's.
        const tabOk = !watch || r.change === watch;
        const web = asked === WEB_PUBLISHERS && r.found_in === WEB_PUBLISHERS && tabOk;
        setWebPublishers(web && r.total > 0 ? r.total : null);
        const files = tabOk ? splitOf(r.found_in_counts, r.found_in, asked) : null;
        hadFiles.current = r.found_in_counts != null;
        setPublisherFiles(files && files.all > 0 ? files : null);
        setFilesPending(false);
      })
      .catch(() => { if (!cancelled) { setWebPublishers(null); setPublisherFiles(null); setFilesPending(false); } });
    return () => { cancelled = true; };
  }, [token, tab, lines, matchType, foundInMulti, platformShown, listLanded]);
  // The watch tabs (crawler #361), as on the publishers list.
  const [changeCounts, setChangeCounts] = useState<ChangeCounts | null>(null);
  const [watchOff, setWatchOff] = useState(false);
  // As on the publishers list: a first mount on Inactive or a change tab
  // still learns which statuses there are.
  useEffect(() => {
    if (tab === "all" || isScopeTab(tab) || changeCounts !== null || watchOff) return;
    let cancelled = false;
    api.matchedApps(token, 1, "", lines, matchType, undefined, 1, platform)
      .then(result => { if (!cancelled && result.change_counts) setChangeCounts(result.change_counts); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, tab, lines, matchType, platform, changeCounts, watchOff]);

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
      if ((!change || r.change === change) && !query && page * PAGE_SIZE < (r.total ?? 0)) {
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

  // A change list is valid only when the backend confirms its scope.
  // Older APIs may ignore ?change; never filter their first page locally.
  const rowsChange = appChangeOf(rowsTab);
  const unsupportedChange = !!rowsChange && !serverFiltered && !isScopeTab(rowsTab);
  const rows = unsupportedChange ? [] : allRows;
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
  // filtered the list (never when the API ignored its change filter).
  const exportList = async (sink: CsvSink, progress: Progress, signal: AbortSignal): Promise<ExportDone> => {
    const t = rowsTab;
    const mt = rowsMatchType;
    const pf: PlatformFilter = platformCounts ? platform : "all";
    const change = appChangeOf(t);
    sink.header(APP_CSV);
    // Old to new on the Changed tab, as on the page (see the publishers').
    const certs = changedCerts(token, lines, signal);
    let total = 0;
    let done = 0;
    if (t !== "inactive")
      await eachPage(
        async (pg) => {
          const r = await api.matchedApps(token, pg, query, lines, mt, change, READ_PAGE, pf);
          if (change && r.change !== change) throw new Error("This list cannot be exported here.");
          total = typeof r.total === "number" ? r.total : total;
          return r;
        },
        READ_PAGE,
        async (page) => {
          const rows: AppRow[] = page.map((a) => (isScopeTab(t) ? { ...a, scope: { tab: t, filter: lines, lines: watchLinesOf(a, t) } } : a));
          const out =
            t === "changed"
              ? await certs.rows(
                  rows,
                  (a) => ({ dev: a.developer_id ?? null, lines: a.cert_changed_lines ?? [], host: a.owner_domain }),
                  (a, cert_changed_lines) => ({ ...a, cert_changed_lines }),
                  () => progress(++done, total),
                )
              : rows;
          sink.rows(out.map((a) => appCells(a, t)));
        },
        t === "changed" ? undefined : progress,
        signal,
      );
    return {
      name: csvName("apps", TAB_SLUG[t], pf !== "all" ? pf : null, mt !== "all" ? mt : null, query ? `search ${query}` : null),
      note: certs.note(),
    };
  };

  return (
    <div>
      {/* The two control rows, as on the publishers list. */}
      <div ref={paging.topRef} className="mb-3 space-y-2">
        <ListTabsRow
          left={
            <>
          <StatusControls tab={tab} setTab={setTab} counts={changeCounts} off={watchOff} inactive={!!inactive} />
            </>
          }
          // Not on a phone: there it would take a row of its own and push the
          // list down as it comes and goes; the cards' line has the same Reset.
          right={onReset && (pageFiltered || query !== "" || tab !== "all") ? <ResetFilters onReset={onReset} className="hidden sm:inline-flex" /> : null}
        />
        {isScopeTab(tab) && <p data-scope-note className="text-[12px] leading-relaxed text-slate-500">{SCOPE_NOTE[tab]}</p>}
        {tab !== "inactive" && (
          <ListSearchRow
            query={query}
            setQuery={setQuery}
            placeholder="Search apps"
            loading={loading}
            label="Search matched apps"
            actions={!loading && settled > 0 && !failed && rows.length > 0 && !trial && !caps && !unsupportedChange ? <ExportListButton run={exportList} noun="apps" status={rowsTab} query={query} filtered={lines.length > 0 || rowsMatchType !== "all" || platform !== "all"} /> : null}
            // A first load: the filters' places as skeletons until the list
            // itself says how it splits (a quicker side read never shows one
            // filter alone, the others popping in after).
            filters={loading && settled === 0 && !platformCounts && !typeCounts ? <FilterSkeletons /> : <>
              {/* PLATFORM: an app is CTV or Mobile, by its store. Web is not
                  an app (David, 2026-11-01): its choice says how many
                  publishers it opens and opens them, never filters apps. */}
              {platformCounts && <FilterSelect value={platform} onChange={onPlatform} leading="Platform" icon={MonitorSmartphone} ariaLabel="Platform" testId="platform" info={FILTER_INFO.platform} options={[
                ...([
                  { value: "all", label: "All", description: "Every app in this report." },
                  { value: "ctv", label: "CTV", description: "Connected TV apps and channels." },
                  { value: "mobile", label: "Mobile", description: "Mobile apps, iOS and Android." },
                ] as const).filter(o => o.value === "all" || o.value === platform || (platformCounts[o.value] ?? 0) > 0)
                  .map(o => ({ ...o, countLabel: `${(platformCounts[o.value] ?? 0).toLocaleString()} apps`, leads: true })),
                ...(webPublishers != null && foundInMulti ? [{
                  value: "web" as const,
                  label: "Web",
                  description: "Web is not an app. Opens the web publishers: found in ads.txt + Both.",
                  countLabel: `${webPublishers.toLocaleString()} publishers`,
                  leads: true,
                }] : []),
              ]} />}
              {/* FOUND IN HERE TOO (David, 2026-11-02): a file is a
                  publisher's, never an app's, so it filters no app: every
                  choice says how many publishers it opens and opens them. */}
              {!publisherFiles && filesPending && hadFiles.current !== false && <FilterSkeleton width="w-32" />}
              {publisherFiles && <FilterSelect value={"all" as FoundInFilter} onChange={onFoundIn} leading="Found in" icon={FileText} ariaLabel="Found in" testId="found-in" info={FILTER_INFO.foundInOnApps}
                options={([
                  { value: "all", label: "All files", description: "Opens every matched publisher." },
                  { value: "ads_txt", label: "ads.txt", description: "Opens the publishers with matching lines in ads.txt." },
                  { value: "app_ads_txt", label: "app-ads.txt", description: "Opens the publishers with matching lines in app-ads.txt." },
                  { value: "both", label: "Both", description: "Opens the publishers with matching lines in both files." },
                ] as const).filter((o) => o.value === "all" || publisherFiles[o.value] > 0)
                  .map((o) => ({ ...o, value: o.value as FoundInFilter, countLabel: `${publisherFiles[o.value].toLocaleString()} publishers`, leads: true }))} />}
              {typeCounts && <FilterSelect value={matchType} onChange={setMatchType} leading="Match type" icon={SlidersHorizontal} menuLabel="Filter by match type" ariaLabel="Match type" testId="match-type" info={FILTER_INFO.matchType} options={[
                { value: "all", label: "All", description: "Publisher files and inventory partners" }, { value: "own", label: "Own", description: "In the publisher’s own file" }, { value: "ipd", label: "IPD", description: "Via a declared inventory partner" },
              ].map(o => ({...o, value: o.value as typeof matchType, count: tab === "all" || isScopeTab(tab) ? typeCounts[o.value as keyof typeof typeCounts] : undefined}))} />}
            </>}
            right={
              // The pager counts the SERVER's total: All matched, or a
              // change tab the server filtered. An unsupported scope has
              // no count, rows, pager or download.
              loading
                ? <CountSkeleton />
                : settled > 0 && !failed && rows.length > 0
                ? trial || caps
                  ? <CountLine count={total} noun={noun} />
                  : (
                    <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                        <Pager
                          placement="inline"
                          page={page}
                          pageSize={PAGE_SIZE}
                          total={total}
                          onPage={paging.onPage}
                          noun={noun}
                          nounOne={tabNoun(rowsTab, "apps").one}
                        />
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
            ) : unsupportedChange ? (
              <div data-unsupported-app-change className="rounded-lg border border-border bg-white p-6 text-center text-sm text-slate-500">
                <p>This report cannot filter apps by this status.</p>
                <ReportButton variant="outline" className="mt-3" onClick={() => setTab("all")}>View all matched apps</ReportButton>
              </div>
            ) : (
              <EmptyResult query={query} noun="apps" quiet={EMPTY_TAB.apps[rowsTab]} />
            )
          ) : (
            <div className="space-y-3">
              {rows.map((a, i) => (
                <Settle key={keyOf(a)} index={i} tour={i === 0 ? "overview-first-row" : undefined}>
                  <MatchedAppCard
                    app={a}
                    watchNote={watchReason(a, tab)}
                    status={rowStatus(tab)}
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
          {!failed && !unsupportedChange && rows.length > 0 && !trial && !caps && (
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
  watchNote = null,
  status = null,
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
  /** On a watch tab: the row's one-line reason (``watchReason``). */
  watchNote?: string | null;
  /** The status tab the row is listed on: its avatar's tint and mark. */
  status?: RowStatus | null;
}) {
  // Every row on Stopped watching, whatever its reason (2026-11-04).
  // The row's look: its tab's status, or inactive on the Inactive list.
  const look: RowStatus | null = inactive ? "inactive" : status;
  const stopped = look === "stopped";
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
  // The API's own words for it when it sends them (crawler #370,
  // `file_used`, the Excel's File used), else ours.
  const fileLine =
    typeof app.file_used === "string" && app.file_used.trim() ? app.file_used.trim() : appFileLine(app.file_host, app.file_source);
  const store = storeHint(app);
  return (
    <div
      className={cn(
        "report-row overflow-hidden rounded-xl border shadow-sm transition-colors",
        inactive
          ? cn("inactive-report-row border-border bg-white", open && "shadow-md")
          : open
            // Open like a publisher card (David, 2026-11-04): the top stays
            // white; only the opened lines area below carries the tint.
            ? "border-border bg-white shadow-md"
            : "border-border bg-white",
      )}
    >
      {/* A real button laid over the row, the publisher's links above it
          (see PublisherCard). */}
      <div className="relative">
        <button
          type="button"
          onClick={(e) => toggleWithoutJump(e.currentTarget, onToggle)}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} the seat lines of ${app.app_name}`}
          className="absolute inset-0 z-0 rounded-t-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app/30"
        >
          <span className="report-expand-control">
            <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </span>
        </button>
      <div className="pointer-events-none flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5">
        <div
          className={cn(
            "relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full",
            avatarTone(look, "bg-app-bg text-app"),
          )}
        >
          {/* A website row (crawler #370: on new reports the apps list
              carries the matched websites, under Platform Web): a globe,
              never an app's phone. */}
          {String(app.store ?? "").toLowerCase() === "website" ? (
            <Globe aria-hidden data-website-icon className="h-5 w-5" />
          ) : appPlatformOf(app) === "CTV" ? (
            <Tv aria-hidden data-tv-icon className="h-5 w-5" />
          ) : (
            <Smartphone aria-hidden className="h-5 w-5" />
          )}
          {look && <StatusBadge status={look} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="matched-app-title flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-semibold tracking-tight text-slate-900">
              {app.app_name}
            </span>
            {/* The badges are the facts a reader scans by: the platform,
                and IPD. The store is the platform's detail, in words on the
                line below (David, 2026-11-02: not everything a badge). */}
            <PlatformBadge row={app} />
            {!inactive && <IpdChip row={app} subject={appSubject(app)} others={otherPartners(app, app.matched_lines)} />}
          </div>
          {/* A trial withholds an inactive app's publisher (the crawler
              sends ""): no "publisher:" with nothing after it. */}
          {(!inactive || app.owner_domain || store) && (
            // Inactive, it wraps on a phone: whether the publisher is still
            // live is the point of the line and must not be cut off.
            // On a phone the store takes its own line under the publisher's
            // (index.css .app-subline): one line would cut the publisher's
            // domain away whole, a link not being cut part way.
            <div data-wrap={inactive ? "" : undefined} className={cn("app-subline text-xs text-slate-500", inactive ? "break-words sm:truncate" : "truncate")}>
              {store && (
                <span data-store-hint data-platform={String(app.store ?? "").trim().toLowerCase()} className="app-store-hint">
                  On <span className="text-slate-600">{store}</span>
                  {(!inactive || app.owner_domain) && <span className="app-store-comma">, </span>}
                </span>
              )}
              {(!inactive || app.owner_domain) && (
                <span className="app-owner">
                  publisher:{" "}
                  {app.owner_domain ? (
                    <PublisherDomainLink domain={app.owner_domain} className="text-slate-600" arrow={false} />
                  ) : null}
                  {app.owner_name ? (
                    <span className="app-owner-name text-slate-400">, {app.owner_name}</span>
                  ) : null}
                  {inactive && inactive.publisherLive != null && (
                    <span className={inactive.publisherLive ? "text-slate-500" : "text-critical"}>
                      , {inactive.publisherLive ? "still live" : "inactive too"}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
          {!inactive && <IpdWhere row={app} subject={appSubject(app)} others={otherPartners(app, app.matched_lines)} />}
          <WatchReason text={watchNote} />
          {inactive && <InactiveLine mark={inactive} />}
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
            <MiniStat label="Matched lines" value={app.line_count} emphasis muted={stopped} />
          </div>
          <ChangeCell added={added} removed={removed} certChanged={certChanged} />
        </div>
        )}
        <span aria-hidden className="report-expand-space flex-shrink-0" />
      </div>
      </div>
      <Collapse open={open}>
        <div
          className={cn(
            "border-t px-4 pb-4 pt-3 sm:px-5",
            OPENED_AREA,
          )}
        >
          {inactive && <InactiveEvidence text={inactive.evidence} />}
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
                  counts={{ added, removed, cert: certChanged }}
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

/*
 * THE STATUS ROWS (David, 2026-11-04). Every status row is a white card
 * like Added / Removed; only its avatar carries the status (a soft tint and
 * a small mark), and one plain sentence inside the card says why. Never a
 * strip on top, a tinted card or a label repeating the tab:
 *   Stopped watching   grey avatar, crossed-out eye, grey figures
 *   Started watching   green avatar, open eye
 *   Unconfirmed        violet avatar, question mark
 *   Inactive           sand avatar, power-off mark (never Removed's red),
 *                      "Inactive since <day>: <why>."
 */
function sentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  // A domain opening the sentence keeps its case ("denverpost.com no
  // longer names ..."); words get their capital.
  const first = t.split(/\s/, 1)[0];
  const head = first.includes(".") ? t : t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(head) ? head : `${head}.`;
}

/** THE OPENED AREA (David, 2026-11-04: one stable rule): a card's opened
 *  lines area is one soft neutral on every status and both lists; the boxes
 *  inside carry the colours (Added green, Removed red, Cert changes
 *  yellow), so none of them sits on a clashing tint. */
export const OPENED_AREA = "border-border bg-[#f6f7f5]";

/** A row's status: the tab it is listed on (every tab but All matched),
 *  or inactive on the Inactive list. */
type RowStatus = "added" | "removed" | "changed" | ScopeTab | "inactive";

function rowStatus(tab: DrillTab): RowStatus | null {
  return tab === "all" ? null : tab;
}

/**
 * EVERY STATUS IN ITS COLOUR, ON THE AVATAR (David, 2026-11-04): the card
 * stays white; the avatar takes the status's tint and a small mark. All
 * matched keeps the list's own colours (publishers green, apps teal, as
 * the tiles). Inactive is orange, never Removed's red; Changed is yellow.
 */
const STATUS_LOOK: Record<RowStatus, { Mark: typeof Eye; tone: string }> = {
  added: { Mark: Plus, tone: "bg-accent text-primary" },
  removed: { Mark: Minus, tone: "bg-red-50 text-red-600" },
  changed: { Mark: RefreshCw, tone: "bg-yellow-100 text-yellow-700" },
  started: { Mark: Eye, tone: "bg-accent text-primary" },
  stopped: { Mark: EyeOff, tone: "bg-slate-200 text-slate-500" },
  unconfirmed: { Mark: CircleHelp, tone: "bg-violet-100 text-violet-600" },
  inactive: { Mark: PowerOff, tone: "bg-orange-100 text-orange-600" },
};

/** The avatar's tint: its status's, else the list's own. */
function avatarTone(look: RowStatus | null, regular: string): string {
  return cn("transition-colors duration-300", look ? STATUS_LOOK[look].tone : regular);
}

/** The status mark on the avatar: a small disc in the status's tint with
 *  a white ring (the eyes kept on Started / Stopped watching). */
function StatusBadge({ status }: { status: RowStatus }) {
  const { Mark, tone } = STATUS_LOOK[status];
  return (
    <span
      aria-hidden
      data-status-badge={status}
      className={cn(
        "status-badge-in absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full shadow-sm ring-2 ring-white",
        tone,
      )}
    >
      <Mark className="h-2.5 w-2.5" strokeWidth={2.5} />
    </span>
  );
}

/** The proof an inactive row carries ("Failed in 3 crawls in a row, from
 *  ... to ...", "Checked in US, CA, the store answered 404"), first thing in
 *  the opened card: the card itself says one sentence (David, 2026-11-04),
 *  the evidence stays one click away (owner, 2026-10-08: date, reason and
 *  evidence on every inactive row). */
function InactiveEvidence({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <p data-testid="inactive-evidence" className="mb-2.5 text-[11px] leading-snug text-slate-500">
      {text}
    </p>
  );
}

/** An inactive card's one sentence: since when and why; the store's or
 *  the site's evidence on hover and in the opened card. */
function InactiveLine({ mark }: { mark: InactiveMark }) {
  const day = inactiveDay(mark.since);
  const why = (mark.reason ?? "").trim();
  // "Inactive since Aug 25, 2026: the domain no longer exists." A reason
  // opening with a capitalised word is lowered after the colon; a name or
  // an acronym ("IPD", "Google Play" later on) keeps its case.
  const lowered = why && /^[A-Z][a-z]/.test(why) ? why.charAt(0).toLowerCase() + why.slice(1) : why;
  const text = day ? `Inactive since ${day}${lowered ? `: ${lowered}` : ""}` : why || "Inactive";
  return (
    <div data-testid="inactive-line" title={mark.evidence || undefined} className="truncate text-[11px] text-slate-600">
      {sentence(text)}
    </div>
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
