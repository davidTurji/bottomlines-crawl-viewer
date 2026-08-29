import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import {
  api,
  ApiError,
  type Summary,
  type DeveloperEvent,
  type MatchedDeveloper,
} from "../lib/api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import InlineAskAI from "@/components/InlineAskAI";
import { formatWeek } from "@/components/WeekContextBadge";
import { cn } from "@/lib/utils";

const OVERVIEW_SUGGESTIONS = [
  // Eligibility / compliance — the questions a publisher's ad-ops person
  // actually asks: "am I allowed to sell this?", "was I allowed last week?",
  // "what broke?". Every chip below is guaranteed to hit a curated answer
  // in CHAT_ENTRIES (mockData.ts) — verified by the chip-match simulation.
  "Am I still eligible to sell Chomp Studios?",
  "Was I authorized on Kite Interactive last week?",
  "Which of my seats became non-compliant this week?",
  "Which publishers newly authorized me this week?",
  "Which publishers de-authorized me?",
  "How many seats am I compliant on right now?",
  "Am I at risk of being filtered by buyers next week?",
  "What broke my compliance this week?",
  "Which DIRECT lines did I lose?",
  "Am I on legit inventory or arbitrage?",
  "What should I do to restore compliance?",
  // Data / crawl movement
  "Compare this week to last week for me.",
  "Which publisher lost the most?",
  "What's the biggest change on CTV this week?",
  "Which cert IDs changed and does it matter?",
  "Show me all new resellers.",
  // IAB knowledge
  "What does DIRECT vs RESELLER mean?",
  "What is OWNERDOMAIN?",
  "What is the SupplyChain object?",
  "How does app-ads.txt discovery work?",
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
  const { token = "" } = useParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [previous, setPrevious] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const addedOnSeat = summary.hero_diff.line_totals_matched_seat.added;
  const removedOnSeat = summary.hero_diff.line_totals_matched_seat.removed;

  const matchedDevs = summary.counters.matched.developers;
  const matchedApps = summary.counters.matched.apps;
  const prevMatchedDevs = previous?.counters.matched.developers ?? null;
  const prevMatchedApps = previous?.counters.matched.apps ?? null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:py-8">
      {/* Page header. One line summary of what got scanned, no floating
          date chip. The h1 and its subtitle already carry the week. */}
      <div>
        <h1 className="font-display text-xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-2xl">
          Your weekly crawl
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Week of {weekLabel}
          {prevWeekLabel && `, compared to ${prevWeekLabel}`}. We scanned{" "}
          <span className="font-medium text-slate-800">
            {summary.counters.developer_count.toLocaleString()}
          </span>{" "}
          publisher domains for you.
        </p>
      </div>

      {/* Two hero cards, side by side. Left = this week's plus/minus
          lines. Right = matched inventory (each number links to Results). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <div className="font-display text-sm font-medium text-slate-700">
                This week&apos;s changes
              </div>
              <div className="text-[11px] text-slate-500">
                Relative to last week
              </div>
            </div>
            <span className="text-xs text-slate-500">
              {certChanged.toLocaleString()} cert changes
            </span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border border-border">
            <SplitStat
              tone="ok"
              prefix="+"
              number={added}
              label="Lines added"
              hint={`${addedOnSeat.toLocaleString()} on your seats`}
            />
            <SplitStat
              tone="critical"
              prefix="-"
              number={removed}
              label="Lines removed"
              hint={`${removedOnSeat.toLocaleString()} on your seats`}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <div className="font-display text-sm font-medium text-slate-700">
                Matched inventory
              </div>
              <div className="text-[11px] text-slate-500">
                Relative to last week
              </div>
            </div>
            <span className="text-xs text-slate-500">
              {summary.counters.matched.lines.toLocaleString()} lines total
            </span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border border-border">
            <SplitStat
              number={matchedDevs}
              label="Matched developers"
              delta={
                prevMatchedDevs != null
                  ? computeDelta(matchedDevs, prevMatchedDevs)
                  : null
              }
              linkTo={`/crawl-report/${token}/results`}
            />
            <SplitStat
              number={matchedApps}
              label="Matched applications"
              delta={
                prevMatchedApps != null
                  ? computeDelta(matchedApps, prevMatchedApps)
                  : null
              }
              linkTo={`/crawl-report/${token}/results`}
            />
          </div>
        </div>
      </div>

      {/* Ask AI, inline, between the KPIs and the drilldown. Same shape
          bottomlines-app uses on the "Your Bottom Line" page: pill input
          with a sparkle glyph + horizontal suggestion rail; answers grow
          in a thread below the composer. */}
      <InlineAskAI
        token={token}
        suggestions={OVERVIEW_SUGGESTIONS}
        placeholder="Ask about your crawl"
      />

      {/* Matched developer drilldown. Card-per-publisher list styled the
          same way as bottomlines-app's HierarchyCard: colored disc,
          generous padding, right-aligned stats, tinted expansion. */}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">
              Matched publishers
            </h2>
            <p className="text-sm text-slate-500">
              Every publisher whose ads.txt matched your seats. Click a row to
              see the exact lines that moved this week.
            </p>
          </div>
        </div>
        <DrilldownList token={token} />
      </div>
    </div>
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

function SplitStat({
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
  tone?: "ok" | "critical";
  linkTo?: string;
  delta?: Delta | null;
}) {
  const numberCls =
    tone === "ok"
      ? "text-ok"
      : tone === "critical"
        ? "text-critical"
        : "text-slate-900";
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
                added: 0,
                removed: 0,
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
                token={token}
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
  token,
}: {
  row: Row;
  open: boolean;
  onToggle: () => void;
  token: string;
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
          {row.prev != null && <MiniStat label="Last week" value={row.prev} />}
          <MiniStat label="This week" value={row.current} emphasis />
          {(row.added > 0 || row.removed > 0) && (
            <div className="min-w-[92px]">
              <div className="text-[10px] font-medium text-slate-500">
                Change
              </div>
              <div className="font-mono text-sm tabular-nums">
                <span className="text-ok">+{row.added}</span>
                <span className="mx-1 text-slate-400">/</span>
                <span className="text-critical">-{row.removed}</span>
              </div>
            </div>
          )}
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
          <ExpandedLines token={token} developerId={row.developer_id} />
        </div>
      )}
    </div>
  );
}

/**
 * The expand body under a publisher row. Fetches this publisher's line
 * events on demand (lazy) and renders them as a compact list, grouped
 * by what happened: added, removed, cert changes. The list uses one
 * mono line per event so the reader can quickly scan which SSPs moved.
 * Falls back to a plain "no changes this week" note when a publisher
 * matches but did not move.
 */
function ExpandedLines({
  token,
  developerId,
}: {
  token: string;
  developerId: number;
}) {
  const [rows, setRows] = useState<import("../lib/api").LineEvent[] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .linesForDeveloper(token, developerId)
      .then((r) => !cancelled && setRows(r.rows))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, developerId]);

  return (
    <div>
      {loading && <p className="text-xs text-slate-500">Loading lines...</p>}
      {error && <p className="text-xs text-critical">{error}</p>}
      {!loading && !error && rows && rows.length === 0 && (
        <p className="text-xs text-slate-500">
          This publisher matched your seats, but no lines moved this week.
        </p>
      )}
      {!loading && !error && rows && rows.length > 0 && (
        <div className="space-y-3">
          <LinesGroup rows={rows} kind="added" />
          <LinesGroup rows={rows} kind="removed" />
          <LinesGroup rows={rows} kind="cert_changed" />
        </div>
      )}
    </div>
  );
}

function LinesGroup({
  rows,
  kind,
}: {
  rows: import("../lib/api").LineEvent[];
  kind: "added" | "removed" | "cert_changed";
}) {
  const filtered = rows.filter((r) => r.event === kind);
  if (filtered.length === 0) return null;
  const heading =
    kind === "added"
      ? "Lines added"
      : kind === "removed"
        ? "Lines removed"
        : "Cert changes";
  const glyph =
    kind === "added" ? "+" : kind === "removed" ? "-" : "↻"; // curved arrow
  const tone =
    kind === "added"
      ? "text-ok"
      : kind === "removed"
        ? "text-critical"
        : "text-warn";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-700">{heading}</span>
        <span className="font-mono text-[11px] tabular-nums text-slate-500">
          {filtered.length}
        </span>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border bg-white">
        {filtered.slice(0, 8).map((r, i) => (
          <li
            key={`${r.ssp_domain}:${r.publisher_id}:${r.relationship}:${i}`}
            className="flex items-baseline gap-3 px-3 py-1.5 font-mono text-[11px] tabular-nums"
          >
            <span className={cn("w-3 flex-shrink-0", tone)}>{glyph}</span>
            <span className="truncate text-slate-800">{r.ssp_domain}</span>
            <span className="text-slate-500">publisher {r.publisher_id}</span>
            <span className="ml-auto text-[10px] text-slate-400">
              {r.relationship}
            </span>
          </li>
        ))}
      </ul>
      {filtered.length > 8 && (
        <p className="mt-1 text-[10px] text-slate-500">
          Plus {filtered.length - 8} more.
        </p>
      )}
    </div>
  );
}

/** Small right-aligned number pair used on the drilldown row header. */
function MiniStat({
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
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
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
