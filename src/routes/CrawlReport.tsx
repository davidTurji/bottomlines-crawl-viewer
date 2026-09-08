import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronDown, Download, Smartphone } from "lucide-react";
import {
  api,
  ApiError,
  ENABLE_CHAT,
  MOCK,
  type Summary,
  type DeveloperEvent,
  type MatchedDeveloper,
  type MatchedApp,
  type MatchedSeatLine,
} from "../lib/api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import InlineAskAI from "@/components/InlineAskAI";
import { PageShell } from "@/components/PageShell";
import { formatWeek } from "@/components/WeekLine";
import { cn, storeLabel } from "@/lib/utils";
import { useReportScope } from "@/lib/reportScope";

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
  const [error, setError] = useState<string | null>(null);
  // Which matched list the section below shows. The two matched-inventory
  // cards act as its selector; publishers is the default.
  const [matchedView, setMatchedView] = useState<"publishers" | "apps">(
    "publishers",
  );

  useEffect(() => {
    let cancelled = false;
    api
      .summary(token)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((e: ApiError) => {
        if (!cancelled) setError(e.message);
      });
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
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-sm text-muted-foreground">Loading your crawl...</p>
      </div>
    );
  }

  const finishedAt = summary.finished_at ? new Date(summary.finished_at) : null;
  const weekLabel = finishedAt ? formatWeek(finishedAt) : `crawl #${summary.crawl_id}`;
  const prevFinishedAt = previous?.finished_at ? new Date(previous.finished_at) : null;
  const prevWeekLabel = prevFinishedAt ? formatWeek(prevFinishedAt) : null;

  const added = summary.hero_diff.line_totals.added;
  const removed = summary.hero_diff.line_totals.removed;
  const certChanged = summary.hero_diff.line_totals.cert_changed;

  const matchedDevs = summary.counters.matched.developers;
  const matchedApps = summary.counters.matched.apps;
  const prevMatchedDevs = previous?.counters.matched.developers ?? null;
  const prevMatchedApps = previous?.counters.matched.apps ?? null;

  // Last week's OWN added/removed totals, so "+32 lines added" can say
  // whether 32 is a busy week or a quiet one. Comparing this week's added
  // against last week's added is like for like; comparing it against last
  // week's matched inventory would not be.
  const prevAdded = previous?.hero_diff.line_totals.added ?? null;
  const prevRemoved = previous?.hero_diff.line_totals.removed ?? null;

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

  return (
    <PageShell className="space-y-5">
      {/* Page header. One line summary of what got scanned, no floating
          date chip. The h1 and its subtitle already carry the week. The
          export sits top right, the one action this page offers. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            Your weekly crawl
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Week of {weekLabel}
            {prevWeekLabel && `, compared with ${prevWeekLabel}`}.
          </p>
        </div>
        <ExportResultsButton token={token} summary={summary} />
      </div>

      {/* Two hero cards, side by side. Left = this week's plus/minus
          lines. Right = matched inventory, as two premium tone tiles:
          publishers in green, apps in pink. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <div className="font-display text-sm font-medium text-slate-700">
                This week&apos;s changes
              </div>
              <div className="text-[11px] text-slate-500">
                {isFirstCrawl ? "Your first crawl" : "Relative to last week"}
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
            />
            <SplitStat
              tone="critical"
              prefix="-"
              number={removed}
              label="Lines removed"
              delta={
                prevRemoved != null ? computeDelta(removed, prevRemoved) : null
              }
            />
          </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <div className="font-display text-sm font-medium text-slate-700">
                Matched inventory
              </div>
              <div className="text-[11px] text-slate-500">
                {isFirstCrawl
                  ? "First crawl, no prior week to compare against"
                  : "Relative to last week"}
              </div>
            </div>
            <span className="text-xs text-slate-500">
              {summary.counters.matched.lines.toLocaleString()} lines total
            </span>
          </div>
          {/* Two premium tiles that double as the selector for the list
              below: publishers in the brand's racing green, apps in pink.
              Same number, label and delta rhythm as the left card's split
              stats, so the two hero panels line up. Click one to switch the
              list underneath; the selected tile carries a toned ring. */}
          <div className="grid grid-cols-2 gap-3">
            <MatchedTile
              tone="publisher"
              icon={Building2}
              number={matchedDevs}
              label="Matched publishers"
              delta={matchedDevsDelta}
              active={matchedView === "publishers"}
              onClick={() => setMatchedView("publishers")}
            />
            <MatchedTile
              tone="app"
              icon={Smartphone}
              number={matchedApps}
              label="Matched apps"
              delta={matchedAppsDelta}
              active={matchedView === "apps"}
              onClick={() => setMatchedView("apps")}
            />
          </div>
        </div>
      </div>

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
      {matchedView === "publishers" ? (
        <div>
          <div className="mb-3">
            <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">
              Matched publishers
            </h2>
            <p className="text-sm text-slate-500">
              Every publisher whose ads.txt matched your seats. Click a row to
              see the exact seat lines it carried, and what moved this week.
            </p>
          </div>
          <DrilldownList token={token} />
        </div>
      ) : (
        <div>
          <div className="mb-3">
            <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">
              Matched apps
            </h2>
            <p className="text-sm text-slate-500">
              Every app whose app-ads.txt matched your seats, with the
              publisher that owns it. Click a row to see the exact seat lines
              it carried, and what moved this week.
            </p>
          </div>
          <MatchedAppsList token={token} />
        </div>
      )}
    </PageShell>
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
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", tone)}>
      <span className="text-[9px]">{glyph}</span>
      <span className="font-mono tabular-nums">
        {sign}
        {delta.abs.toLocaleString()}
      </span>
      <span className="font-mono tabular-nums text-slate-500">
        ({pctDisplay})
      </span>
      <span className="text-slate-500">vs last week</span>
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
  | "publisher";

const STAT_TONE_TEXT: Record<StatTone, string> = {
  ok: "text-ok",
  critical: "text-critical",
  warn: "text-warn",
  info: "text-info",
  special: "text-special",
  app: "text-app",
  publisher: "text-primary",
};

export function SplitStat({
  number,
  label,
  hint,
  prefix,
  tone,
  linkTo,
  delta,
}: {
  number: number;
  label: string;
  hint?: string;
  prefix?: string;
  tone?: StatTone;
  linkTo?: string;
  delta?: Delta | null;
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
          className={cn(
            "font-mono text-3xl font-semibold leading-none tabular-nums tracking-tight sm:text-4xl",
            numberCls,
          )}
        >
          {number.toLocaleString()}
        </span>
      </div>
      <div className="mt-2 text-[12px] font-medium text-slate-700">{label}</div>
      {delta ? <DeltaChip delta={delta} /> : null}
      {hint && !delta && (
        <div className="text-[11px] text-slate-500">{hint}</div>
      )}
    </>
  );
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
  return <div className="px-5 py-4">{body}</div>;
}

/**
 * A premium matched-inventory tile that doubles as the selector for the list
 * below. Publishers wear the brand's racing green, apps wear the pink `app`
 * tone. The number, label and delta rhythm matches the left card's SplitStat
 * so the two hero panels line up: the number leads, the label follows with a
 * small toned icon beside it (never over the number, so the figures share a
 * baseline across both panels), then the delta. The selected tile carries a
 * toned ring and a deeper tint; the idle one is plain white and hoverable.
 */
function MatchedTile({
  tone,
  icon: Icon,
  number,
  label,
  delta,
  active,
  onClick,
}: {
  tone: "publisher" | "app";
  icon: typeof Building2;
  number: number;
  label: string;
  delta?: Delta | null;
  active: boolean;
  onClick: () => void;
}) {
  const isApp = tone === "app";
  const numberCls = isApp ? "text-app" : "text-primary";
  const iconCls = isApp ? "text-app" : "text-primary";
  const activeGround = isApp
    ? "border-app-border bg-app-bg/70 ring-1 ring-app/40"
    : "border-ok-border bg-ok-bg/60 ring-1 ring-primary/30";
  const idleGround =
    "border-border bg-white hover:border-primary/20 hover:bg-muted/30";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col rounded-xl border px-5 py-4 text-left shadow-sm transition-colors",
        active ? activeGround : idleGround,
      )}
    >
      <span
        className={cn(
          "font-mono text-3xl font-semibold leading-none tabular-nums tracking-tight sm:text-4xl",
          numberCls,
        )}
      >
        {number.toLocaleString()}
      </span>
      <span className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
        <Icon aria-hidden className={cn("h-3.5 w-3.5 flex-shrink-0", iconCls)} />
        {label}
      </span>
      {delta ? <DeltaChip delta={delta} /> : null}
    </button>
  );
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
function ExportResultsButton({ token, summary }: { token: string; summary: Summary }) {
  const onClick = async () => {
    if (MOCK) {
      const { buildXlsxBlob } = await import("../lib/xlsx");
      const url = URL.createObjectURL(buildXlsxBlob(sampleWorkbook(summary)));
      const a = document.createElement("a");
      a.href = url;
      a.download = "pathfinder-results-sample.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }
    window.location.href = api.exportUrl(token);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 flex-shrink-0 items-center gap-2 self-start rounded-full border border-border bg-white px-4 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-primary/30 hover:text-primary"
    >
      <Download aria-hidden className="h-3.5 w-3.5" />
      Export results
    </button>
  );
}

type DrillTab = "all" | "added" | "removed" | "changed";

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
};

function DrilldownList({ token }: { token: string }) {
  const [tab, setTab] = useState<DrillTab>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpanded(null);
    const p =
      tab === "all"
        ? api.matchedDevelopers(token, 1).then((r) => ({
            rows: r.rows.map(
              (d: MatchedDeveloper): Row => ({
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
              }),
            ),
            total: r.total,
          }))
        : api.developerEvents(token, tab, 1).then((r) => ({
            rows: r.rows.map(
              (d: DeveloperEvent): Row => ({
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
                cert_changed_lines: d.cert_changed_lines ?? [],
              }),
            ),
            total: r.total,
          }));
    p.then((data) => {
      if (cancelled) return;
      setRows(data.rows);
      setTotal(data.total);
    })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, tab]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as DrillTab)}>
          <TabsList>
            <TabsTrigger value="all">All matched</TabsTrigger>
            <TabsTrigger value="added">Added</TabsTrigger>
            <TabsTrigger value="removed">Removed</TabsTrigger>
            <TabsTrigger value="changed">Changed</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="ml-auto text-xs text-slate-500">
          {total.toLocaleString()}{" "}
          {tab === "all" ? "matched" : "with changes"}
        </span>
      </div>
      <div>
        {loading && <p className="text-sm text-slate-500">Loading...</p>}
        {error && <p className="text-sm text-critical">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-slate-500">
            {tab === "all"
              ? "No publishers matched your seats this week."
              : "No publishers in this bucket."}
          </p>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((r) => (
              <PublisherCard
                key={r.developer_id}
                row={r}
                open={expanded === r.developer_id}
                onToggle={() =>
                  setExpanded(expanded === r.developer_id ? null : r.developer_id)
                }
              />
            ))}
          </div>
        )}
        {total > rows.length && (
          <p className="mt-3 text-xs text-slate-500">
            Showing the first {rows.length} of {total.toLocaleString()}.
          </p>
        )}
      </div>
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
  open,
  onToggle,
}: {
  row: Row;
  open: boolean;
  onToggle: () => void;
}) {
  const initial = (
    (row.developer_name ?? row.developer_domain ?? "?")
      .replace(/^www\./i, "")
      .charAt(0) || "?"
  ).toUpperCase();
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
        className="flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5"
      >
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold text-primary">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-base font-semibold tracking-tight text-slate-900">
              {row.developer_name ?? `Publisher #${row.developer_id}`}
            </span>
            {row.developer_platform && (
              <span className="flex-shrink-0 text-[11px] text-slate-400">
                {row.developer_platform}
              </span>
            )}
          </div>
          {row.developer_domain && (
            <div className="truncate text-xs text-slate-500">
              {row.developer_domain}
            </div>
          )}
        </div>
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
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border bg-accent/30 px-4 pb-4 pt-3 sm:px-5">
          <ChangeExpansion
            added={row.added_lines}
            removed={row.removed_lines}
            certChanged={row.cert_changed_lines}
            matched={row.matched_lines}
          />
        </div>
      )}
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
 * Shared by the change windows and the flat matched-seat-lines list so a line
 * looks identical wherever it appears.
 */
function SeatLineRow({ line, muted }: { line: MatchedSeatLine; muted?: boolean }) {
  return (
    <li className="px-3 py-1.5">
      <code
        className={cn(
          "block truncate font-mono text-[11px] tabular-nums",
          muted ? "text-slate-500" : "text-slate-800",
        )}
      >
        {line.ssp_domain}, {line.publisher_id}, {line.relationship}
        {line.cert_id && (
          <span className="font-normal text-slate-400">, {line.cert_id}</span>
        )}
      </code>
    </li>
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
}: {
  kind: ChangeKind;
  lines: MatchedSeatLine[];
}) {
  const s = CHANGE_WINDOW[kind];
  const shown = lines.slice(0, CHANGE_LINE_CAP);
  const extra = lines.length - shown.length;
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
          {lines.length}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {shown.map((l, i) => (
          <SeatLineRow
            key={`${l.ssp_domain}:${l.publisher_id}:${l.relationship}:${l.cert_id ?? ""}:${i}`}
            line={l}
            muted={s.muted}
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
}: {
  added: MatchedSeatLine[];
  removed: MatchedSeatLine[];
  certChanged: MatchedSeatLine[];
  matched: MatchedSeatLine[];
}) {
  const sections: { kind: ChangeKind; lines: MatchedSeatLine[] }[] = [];
  if (added.length) sections.push({ kind: "added", lines: added });
  if (removed.length) sections.push({ kind: "removed", lines: removed });
  if (certChanged.length) sections.push({ kind: "cert", lines: certChanged });

  // Nothing moved this week: keep the standing matched-seat-lines list as-is.
  if (sections.length === 0) {
    if (matched.length > 0) return <MatchedSeatLines lines={matched} />;
    return (
      <p className="text-xs text-slate-500">
        No matched seat lines on record for this row.
      </p>
    );
  }

  // A single kind of change: one full-width window.
  if (sections.length === 1) {
    return <ChangeWindow kind={sections[0].kind} lines={sections[0].lines} />;
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
          <ChangeWindow kind={sec.kind} lines={sec.lines} />
        </div>
      ))}
    </div>
  );
}

/**
 * Small right-aligned number pair used on the drilldown row header.
 *
 * Exported because the Discovered lines cards are deliberate siblings of
 * PublisherCard: same stat treatment, same label size, same tabular figures.
 * Copying it would let the two drift apart a pixel at a time.
 */
export function MiniStat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div>
      {/* Sentence case, never uppercase: the house rule is that labels read
          as words, not as shouting. */}
      <div className="text-[10px] font-medium tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-sm tabular-nums",
          emphasis ? "font-semibold text-slate-900" : "text-slate-700",
        )}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

/**
 * The matched seat line(s) block, in the same mono line style the Changes and
 * Discovery pages use. Shared by the publisher expansion and the app
 * expansion so a line reads identically wherever it appears. Renders nothing
 * when there are no lines, so callers can drop it in unconditionally.
 */
function MatchedSeatLines({ lines }: { lines: MatchedSeatLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-700">
          Matched seat lines
        </span>
        <span className="font-mono text-[11px] tabular-nums text-slate-500">
          {lines.length}
        </span>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border bg-white">
        {lines.map((l, i) => (
          <SeatLineRow
            key={`${l.ssp_domain}:${l.publisher_id}:${l.relationship}:${l.cert_id ?? ""}:${i}`}
            line={l}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * The matched APPS list, shown when the pink "Matched apps" card is selected.
 * A card-per-app list, the pink sibling of the publisher drilldown: same
 * shape, same expansion, same Added / Removed / Changed tabs, a different
 * family colour. The tabs filter the loaded apps by their weekly change; an
 * app that did not move this week appears under "All matched" only.
 */
function MatchedAppsList({ token }: { token: string }) {
  const [tab, setTab] = useState<DrillTab>("all");
  const [allRows, setAllRows] = useState<MatchedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const keyOf = (a: MatchedApp) => `${a.store}:${a.bundle_id}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpanded(null);
    api
      .matchedApps(token, 1)
      .then((r) => {
        if (!cancelled) setAllRows(r.rows);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // A card held open from one tab must not appear under another.
  useEffect(() => setExpanded(null), [tab]);

  const rows = useMemo(() => {
    if (tab === "added") return allRows.filter((a) => (a.lines_added ?? 0) > 0);
    if (tab === "removed")
      return allRows.filter((a) => (a.lines_removed ?? 0) > 0);
    if (tab === "changed")
      return allRows.filter((a) => (a.lines_cert_changed ?? 0) > 0);
    return allRows;
  }, [allRows, tab]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as DrillTab)}>
          <TabsList>
            <TabsTrigger value="all">All matched</TabsTrigger>
            <TabsTrigger value="added">Added</TabsTrigger>
            <TabsTrigger value="removed">Removed</TabsTrigger>
            <TabsTrigger value="changed">Changed</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="ml-auto text-xs text-slate-500">
          {rows.length.toLocaleString()}{" "}
          {tab === "all" ? "matched" : "with changes"}
        </span>
      </div>
      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {error && <p className="text-sm text-critical">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-slate-500">
          {tab === "all"
            ? "No apps matched your seats this week."
            : "No apps in this bucket."}
        </p>
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((a) => (
            <MatchedAppCard
              key={keyOf(a)}
              app={a}
              open={expanded === keyOf(a)}
              onToggle={() =>
                setExpanded(expanded === keyOf(a) ? null : keyOf(a))
              }
            />
          ))}
        </div>
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
}: {
  app: MatchedApp;
  open: boolean;
  onToggle: () => void;
}) {
  const lines = app.matched_lines ?? [];
  const added = app.lines_added ?? 0;
  const removed = app.lines_removed ?? 0;
  const certChanged = app.lines_cert_changed ?? 0;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border shadow-sm transition-colors",
        open ? "border-app-border bg-app-bg/40 shadow-md" : "border-border bg-white",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5"
      >
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-app-bg text-app">
          <Smartphone aria-hidden className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-semibold tracking-tight text-slate-900">
              {app.app_name}
            </span>
            <span className="flex-shrink-0 rounded-full border border-app-border bg-app-bg px-1.5 py-px text-[10px] font-medium text-app">
              {storeLabel(app.store)}
            </span>
          </div>
          <div className="truncate text-xs text-slate-500">
            publisher:{" "}
            <span className="text-slate-600">{app.owner_domain}</span>
            {app.owner_name ? (
              <span className="text-slate-400">, {app.owner_name}</span>
            ) : null}
          </div>
        </div>
        <div className="hidden items-center gap-6 text-right sm:flex">
          <div className="w-[84px] whitespace-nowrap">
            <MiniStat label="Matched lines" value={app.line_count} emphasis />
          </div>
          <ChangeCell added={added} removed={removed} certChanged={certChanged} />
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
        <div className="border-t border-app-border bg-app-bg/30 px-4 pb-4 pt-3 sm:px-5">
          <ChangeExpansion
            added={app.added_lines ?? []}
            removed={app.removed_lines ?? []}
            certChanged={app.cert_changed_lines ?? []}
            matched={lines}
          />
        </div>
      )}
    </div>
  );
}
