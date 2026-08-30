import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { ChevronDown, Maximize2, Search, X } from "lucide-react";
import {
  api,
  ApiError,
  type DeveloperEvent,
  type LineEvent,
  type MatchedBundle,
  type Summary,
} from "../lib/api";
import { Card } from "@/components/ui/card";
import InlineAskAI from "@/components/InlineAskAI";
import { AskAIDrawer, type AskAIDrawerHandle } from "@/components/AskAIDrawer";
import { formatWeek } from "@/components/WeekContextBadge";
import { cn } from "@/lib/utils";

/**
 * Build the Ask AI chip list.
 *
 * Two chips carry a specific example pulled from THIS tenant's actual
 * crawl data so the example reads as real, not as a static demo:
 *
 * - the eligibility chip names a real matched **app** (top row in
 *   matchedBundles by line count) — "Am I still eligible to sell X?"
 * - the retro authorization chip names a real de-authorized **publisher**
 *   (top developer that lost the most matched lines this week) —
 *   "Was I authorized on Y last week?"
 *
 * Both fall back to generic phrasing while the data loads, and both
 * fallbacks are guaranteed to hit a curated answer in CHAT_ENTRIES
 * (mockData.ts) so the chip never lands on the default.
 */
function buildSuggestions(
  topMatchedAppName: string | null,
  topDroppedDeveloperName: string | null,
): string[] {
  const eligibleChip = topMatchedAppName
    ? `Am I still eligible to sell ${topMatchedAppName}?`
    : "Am I still eligible to sell my top matched app?";
  const wasAuthChip = topDroppedDeveloperName
    ? `Was I authorized on ${topDroppedDeveloperName} last week?`
    : "Was I authorized last week on a publisher I lost?";
  return [
    // Eligibility / compliance
    eligibleChip,
    wasAuthChip,
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
}

/**
 * OVERVIEW page, "Your weekly crawl".
 *
 * Layout mirrors bottomlines-app's PerformanceDashboard "Your Bottom Line"
 * template: a page header with a date chip, then two side-by-side hero
 * cards (this week's changes + since your crawl started), a horizontal
 * segmented bar with labelled chips underneath the left card, and an
 * inline Ask AI composer with suggestion chip buttons that grows an
 * answer thread inline below. The publisher movement panels follow.
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
  // Dynamic Ask-AI chip examples pulled from this tenant's actual crawl.
  const [topMatchedAppName, setTopMatchedAppName] = useState<string | null>(null);
  const [topDroppedDeveloperName, setTopDroppedDeveloperName] = useState<
    string | null
  >(null);

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
    // Top matched app by line count → seeds the "Am I still eligible to
    // sell X?" chip with a real app name from this crawl.
    api
      .matchedBundles(token, 1)
      .then((r) => {
        if (cancelled) return;
        const top = r.rows[0];
        if (top?.app_name) setTopMatchedAppName(top.app_name);
      })
      .catch(() => {});
    // Top developer that lost the most matched lines → seeds the "Was I
    // authorized on Y last week?" chip. developerEvents(event="removed")
    // is already ordered by lines_removed desc on both mock + live paths.
    api
      .developerEvents(token, "removed", 1)
      .then((r) => {
        if (cancelled) return;
        const top = r.rows[0];
        if (top?.developer_name) setTopDroppedDeveloperName(top.developer_name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const suggestions = useMemo(
    () => buildSuggestions(topMatchedAppName, topDroppedDeveloperName),
    [topMatchedAppName, topDroppedDeveloperName],
  );
  // Ref lets the on-page composer + chip rail open the drawer with the
  // question already flying, so a click reads as one gesture instead of
  // "type here, then find the drawer to see the answer".
  const drawerRef = useRef<AskAIDrawerHandle>(null);
  const ask = (q: string) => drawerRef.current?.askAndOpen(q);

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
    <div className="mx-auto w-full max-w-[1680px] space-y-5 px-4 py-6 sm:px-6 lg:py-8">
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
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
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

        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
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
            />
            <SplitStat
              number={matchedApps}
              label="Matched applications"
              delta={
                prevMatchedApps != null
                  ? computeDelta(matchedApps, prevMatchedApps)
                  : null
              }
            />
          </div>
        </div>
      </div>

      {/* Ask AI, matching the console: on-page pill composer + chip rail
          is the visible trigger; the actual conversation happens in a
          right-side drawer that opens on submit or chip click. Pill
          launcher hidden — the composer above IS the visible trigger. */}
      <InlineAskAI
        suggestions={suggestions}
        onAsk={ask}
        placeholder="Ask about your crawl"
      />
      <AskAIDrawer
        ref={drawerRef}
        token={token}
        suggestions={suggestions}
        hideLauncher
      />

      {/* Publisher movement. Three panels relative to last week: who
          newly matched (green), who removed you (red), who held steady
          (neutral). Each row expands to a git-style line diff plus the
          apps under that publisher. */}
      <div>
        <div className="mb-3">
          <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">
            Matched publishers
          </h2>
          <p className="text-sm text-slate-500">
            Results are relative to last week. Click a row for the lines
            that moved and the apps underneath.
          </p>
        </div>
        <PublisherMovement token={token} />
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
    <span className={cn("inline-flex flex-wrap items-center gap-x-1 gap-y-0 text-[11px] font-medium", tone)}>
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
  delta,
}: {
  number: number;
  label: string;
  hint?: string;
  prefix?: string;
  tone?: "ok" | "critical";
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
      <div className="flex min-w-0 items-baseline gap-1">
        {prefix && (
          <span
            className={cn(
              "font-mono text-[clamp(1.125rem,5.5vw,1.5rem)] font-semibold tabular-nums sm:text-2xl lg:text-3xl",
              numberCls,
            )}
          >
            {prefix}
          </span>
        )}
        <span
          className={cn(
            "font-mono text-[clamp(1.375rem,7vw,1.875rem)] font-semibold leading-none tabular-nums tracking-tight sm:text-3xl lg:text-4xl",
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
  return <div className="min-w-0 px-3 py-3.5 sm:px-5 sm:py-4">{body}</div>;
}

// ─────────────────────────────────────────────────────────────────
// Publisher movement: three panels relative to last week
// ─────────────────────────────────────────────────────────────────

type Tone = "ok" | "critical" | "neutral";

/** Uniform row shape all three panels render into. */
type MovementRow = {
  developer_id: number;
  name: string | null;
  domain: string | null;
  platform: string | null;
  prev: number;
  current: number;
  added: number;
  removed: number;
  certChanged: number;
};

const eventToRow = (d: DeveloperEvent): MovementRow => ({
  developer_id: d.developer_id,
  name: d.developer_name,
  domain: d.developer_domain,
  platform: d.developer_platform,
  prev: d.matched_lines_prev,
  current: d.matched_lines_current,
  added: d.lines_added,
  removed: d.lines_removed,
  certChanged: d.lines_cert_changed,
});

/**
 * Fetches the three developer-event buckets plus the matched roster and
 * splits them into the panel layout:
 *
 * - gained  = "added" bucket ∪ changed developers that gained lines
 * - lost    = "removed" bucket ∪ changed developers that lost lines
 * - steady  = matched roster minus every developer with any event
 *
 * A changed developer that both gained and lost appears on BOTH sides —
 * that is the truth of its week, and each side shows only the movement
 * that put it there. The expansion always shows the full diff.
 */
function PublisherMovement({ token }: { token: string }) {
  const [gained, setGained] = useState<MovementRow[]>([]);
  const [lost, setLost] = useState<MovementRow[]>([]);
  const [steady, setSteady] = useState<MovementRow[]>([]);
  const [matchedTotal, setMatchedTotal] = useState(0);
  const [matchedShown, setMatchedShown] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.developerEvents(token, "added", 1),
      api.developerEvents(token, "removed", 1),
      api.developerEvents(token, "changed", 1),
      api.matchedDevelopers(token, 1),
    ])
      .then(([addedP, removedP, changedP, matched]) => {
        if (cancelled) return;
        const gainedRows = [
          ...addedP.rows,
          ...changedP.rows.filter((d) => d.lines_added > 0),
        ]
          .map(eventToRow)
          .sort((a, b) => b.added - a.added);
        const lostRows = [
          ...removedP.rows,
          ...changedP.rows.filter((d) => d.lines_removed > 0),
        ]
          .map(eventToRow)
          .sort((a, b) => b.removed - a.removed);
        const eventIds = new Set(
          [...addedP.rows, ...removedP.rows, ...changedP.rows].map(
            (d) => d.developer_id,
          ),
        );
        const steadyRows = matched.rows
          .filter((d) => !eventIds.has(d.developer_id))
          .map(
            (d): MovementRow => ({
              developer_id: d.developer_id,
              name: d.name,
              domain: d.domain,
              platform: d.platform,
              prev: d.line_count,
              current: d.line_count,
              added: 0,
              removed: 0,
              certChanged: 0,
            }),
          );
        setGained(gainedRows);
        setLost(lostRows);
        setSteady(steadyRows);
        setMatchedTotal(matched.total);
        setMatchedShown(matched.rows.length);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading publishers...</p>;
  }
  if (error) {
    return <p className="text-sm text-critical">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MovementPanel
          tone="ok"
          title="Publishers that added you"
          emptyText="No publishers newly matched you this week."
          rows={gained}
          token={token}
        />
        <MovementPanel
          tone="critical"
          title="Publishers that removed you"
          emptyText="No publishers removed you this week. Clean week."
          rows={lost}
          token={token}
        />
      </div>
      <MovementPanel
        tone="neutral"
        title="Publishers that held steady"
        emptyText="Every matched publisher moved this week."
        rows={steady}
        token={token}
        layout="grid"
        footnote={
          matchedTotal > matchedShown
            ? `Showing the first ${steady.length.toLocaleString()} of ${matchedTotal.toLocaleString()} matched publishers.`
            : undefined
        }
      />
    </div>
  );
}

const PANEL_DOT: Record<Tone, string> = {
  ok: "bg-ok",
  critical: "bg-critical",
  neutral: "bg-slate-300",
};

const PANEL_COUNT_PILL: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  critical: "bg-critical-bg text-critical",
  neutral: "bg-muted text-slate-600",
};

const AVATAR_TONE: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok ring-1 ring-inset ring-ok-border",
  critical: "bg-critical-bg text-critical ring-1 ring-inset ring-critical-border",
  neutral: "bg-accent text-primary",
};

/** Grid preview size: three rows at the widest (4-column) breakpoint. */
const GRID_PREVIEW = 12;

/* Stat pill per tone: the tinted avatar and the pill carry the card's
   tone — no colored edges, they read as clutter. */
const STAT_PILL: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  critical: "bg-critical-bg text-critical",
  neutral: "bg-muted text-slate-700",
};

/**
 * One panel: tinted header with a live count, its own search box, and an
 * expandable row list. A single row expands at a time (accordion). Two
 * layouts: "list" (single column, height-capped with its own scroll) for
 * the movement panels, "grid" (dense multi-column tiles) for the steady
 * roster — an expanded tile takes the full row.
 */
function MovementPanel({
  tone,
  title,
  emptyText,
  rows,
  token,
  layout = "list",
  footnote,
}: {
  tone: Tone;
  title: string;
  emptyText: string;
  rows: MovementRow[];
  token: string;
  layout?: "list" | "grid";
  footnote?: string;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MovementRow | null>(null);
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        (r.name ?? "").toLowerCase().includes(needle) ||
        (r.domain ?? "").toLowerCase().includes(needle),
    );
  }, [rows, search]);

  // Grid layout previews ~3 rows (12 tiles at the widest column count)
  // behind a "View all" toggle; searching always searches the full set.
  const visible =
    layout === "grid" && !showAll ? filtered.slice(0, GRID_PREVIEW) : filtered;

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", PANEL_DOT[tone])} />
        <h3 className="font-display text-sm font-semibold tracking-tight text-slate-900">
          {title}
        </h3>
        {/* Search stretches through the header's remaining width; on a
            narrow panel it wraps to its own full-width line. The count
            badge anchors the far right edge. */}
        <div className="relative ml-auto min-w-[180px] flex-1 basis-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="h-8 w-full rounded-full border border-border bg-white pl-8 pr-3 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary/40"
          />
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums",
            PANEL_COUNT_PILL[tone],
          )}
        >
          {rows.length.toLocaleString()}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-center text-xs text-slate-500">
          {search ? "No publishers match this search." : emptyText}
        </p>
      ) : layout === "list" ? (
        <div className="scroll-y -mr-1.5 flex max-h-[26rem] flex-col gap-2.5 overflow-y-auto pb-1 pr-1.5">
          {filtered.map((r) => (
            <PublisherRow
              key={r.developer_id}
              row={r}
              tone={tone}
              onOpen={() => setSelected(r)}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((r) => (
              <PublisherRow
                key={r.developer_id}
                row={r}
                tone={tone}
                variant="tile"
                onOpen={() => setSelected(r)}
              />
            ))}
          </div>
          {filtered.length > GRID_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 inline-flex items-center gap-1 self-center text-xs font-medium text-primary hover:underline"
            >
              {showAll
                ? "View fewer"
                : `View all ${filtered.length.toLocaleString()}`}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")}
              />
            </button>
          )}
        </>
      )}
      {footnote && <p className="mt-2 text-[11px] text-slate-500">{footnote}</p>}
      {selected && (
        <PublisherModal
          token={token}
          row={selected}
          tone={tone}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/**
 * One publisher card. Tinted monogram disc (green = gained you, red =
 * removed you, neutral = steady), name + domain, one number. Clicking
 * opens the full-screen publisher spotlight over the blurred page.
 */
function PublisherRow({
  row,
  tone,
  onOpen,
  variant = "row",
}: {
  row: MovementRow;
  tone: Tone;
  onOpen: () => void;
  variant?: "row" | "tile";
}) {
  const initial = (
    (row.name ?? row.domain ?? "?").replace(/^www\./i, "").charAt(0) || "?"
  ).toUpperCase();
  const stat =
    tone === "ok"
      ? `+${row.added.toLocaleString()}`
      : tone === "critical"
        ? `-${row.removed.toLocaleString()}`
        : row.current.toLocaleString();

  return (
    <div
      // flex-shrink-0: inside the height-capped list column the cards
      // must overflow into scroll, never compress to fit. Console card
      // language: soft resting shadow, gentle lift on hover.
      className="flex-shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-border hover:shadow-md"
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "group flex w-full items-center text-left",
          variant === "row"
            ? "gap-3.5 px-4 py-3.5 sm:px-5"
            : "gap-3 px-3.5 py-3",
        )}
      >
        <div
          className={cn(
            "flex flex-shrink-0 items-center justify-center rounded-full font-semibold",
            variant === "row" ? "h-10 w-10 text-[15px]" : "h-9 w-9 text-sm",
            AVATAR_TONE[tone],
          )}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate font-semibold tracking-tight text-slate-900",
              variant === "row" ? "text-[15px]" : "text-sm",
            )}
          >
            {row.name ?? `Publisher #${row.developer_id}`}
          </div>
          {row.domain && (
            <div className="mt-0.5 truncate text-xs text-slate-500">
              {row.domain}
            </div>
          )}
        </div>
        <span
          className={cn(
            "flex-shrink-0 rounded-lg px-2.5 py-1.5 font-mono text-[13px] font-semibold leading-none tabular-nums",
            STAT_PILL[tone],
          )}
        >
          {stat}
        </span>
        <Maximize2 className="h-3.5 w-3.5 flex-shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
      </button>
    </div>
  );
}

/* Spotlight header band per tone — a soft wash that fades into the
   white body, so the dialog opens with the movement's color. */
const MODAL_BAND: Record<Tone, string> = {
  ok: "bg-gradient-to-b from-ok-bg/70 to-transparent",
  critical: "bg-gradient-to-b from-critical-bg/60 to-transparent",
  neutral: "bg-gradient-to-b from-accent/50 to-transparent",
};

/**
 * Full-screen publisher spotlight. The page blurs away behind a scrim;
 * the dialog zooms up from the click with the publisher's identity, the
 * full git-style diff, and every app underneath, side by side. Escape,
 * backdrop click, or the X closes it.
 */
function PublisherModal({
  token,
  row,
  tone,
  onClose,
}: {
  token: string;
  row: MovementRow;
  tone: Tone;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const initial = (
    (row.name ?? row.domain ?? "?").replace(/^www\./i, "").charAt(0) || "?"
  ).toUpperCase();
  const stat =
    tone === "ok"
      ? `+${row.added.toLocaleString()} lines`
      : tone === "critical"
        ? `-${row.removed.toLocaleString()} lines`
        : `${row.current.toLocaleString()} lines`;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={row.name ?? `Publisher #${row.developer_id}`}
    >
      {/* Scrim: the whole page falls out of focus. */}
      <div
        className="animate-sheet-overlay-in absolute inset-0 bg-slate-900/40 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="animate-modal-pop relative flex max-h-[88dvh] w-[min(96vw,64rem)] flex-col overflow-hidden rounded-2xl border border-white/40 bg-white shadow-2xl">
        <div className={cn("flex-shrink-0 px-4 pb-4 pt-4 sm:px-6 sm:pt-5", MODAL_BAND[tone])}>
          <div className="flex items-center gap-3 sm:gap-4">
            <div
              className={cn(
                "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-lg font-semibold shadow-sm sm:h-14 sm:w-14 sm:text-xl",
                AVATAR_TONE[tone],
              )}
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-display text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                {row.name ?? `Publisher #${row.developer_id}`}
              </h3>
              <div className="flex min-w-0 items-baseline gap-2 text-xs text-slate-500 sm:text-sm">
                {row.domain && <span className="truncate">{row.domain}</span>}
                {row.platform && (
                  <span className="flex-shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 ring-1 ring-inset ring-border">
                    {row.platform}
                  </span>
                )}
              </div>
            </div>
            <span
              className={cn(
                "hidden flex-shrink-0 rounded-xl px-3 py-1.5 font-mono text-sm font-semibold tabular-nums shadow-sm xs:inline-block",
                STAT_PILL[tone],
              )}
            >
              {stat}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/80 text-slate-400 shadow-sm ring-1 ring-inset ring-border transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="scroll-y min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-1 sm:px-6">
          <RowExpansion token={token} row={row} tone={tone} inModal />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The spotlight body: a git-style diff of this publisher's moved lines,
 * then the apps under it. Steady rows skip the line fetch entirely — we
 * already know nothing moved — and go straight to the apps. In the
 * modal the diff and apps sit side by side and the diff opens in full.
 */
function RowExpansion({
  token,
  row,
  tone,
  inModal = false,
}: {
  token: string;
  row: MovementRow;
  tone: Tone;
  inModal?: boolean;
}) {
  const [lines, setLines] = useState<LineEvent[] | null>(null);
  const [apps, setApps] = useState<MatchedBundle[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const wantLines =
      tone !== "neutral"
        ? api.linesForDeveloper(token, row.developer_id).then((r) => r.rows)
        : Promise.resolve<LineEvent[]>([]);
    Promise.all([
      wantLines.catch(() => [] as LineEvent[]),
      api.bundlesForDeveloper(token, row.developer_id).catch(() => [] as MatchedBundle[]),
    ])
      .then(([l, a]) => {
        if (cancelled) return;
        setLines(l);
        setApps(a);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, row.developer_id, tone]);

  if (loading) {
    return <p className="text-xs text-slate-500">Loading details...</p>;
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        tone === "neutral"
          ? "lg:grid-cols-2"
          : inModal && "lg:grid-cols-[1.5fr_1fr] lg:gap-6",
      )}
    >
      {tone === "neutral" ? (
        <p className="self-start rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-slate-600">
          No line movement this week —{" "}
          <span className="font-mono font-medium tabular-nums">
            {row.current.toLocaleString()}
          </span>{" "}
          matched {row.current === 1 ? "line" : "lines"} held steady.
        </p>
      ) : (
        <DiffBlock row={row} lines={lines ?? []} defaultShowAll={inModal} />
      )}
      <AppsBlock apps={apps ?? []} tone={tone} />
    </div>
  );
}

const DIFF_STYLE: Record<
  string,
  { row: string; marker: string; glyph: string }
> = {
  added: { row: "bg-ok-bg/70", marker: "text-ok", glyph: "+" },
  removed: { row: "bg-critical-bg/60", marker: "text-critical", glyph: "-" },
  cert_changed: { row: "bg-warn-bg/60", marker: "text-warn", glyph: "~" },
};

const DIFF_ORDER = ["added", "removed", "cert_changed"] as const;
const DIFF_PREVIEW = 10;

/**
 * Git-style diff of one publisher's moved lines. A hunk header carries
 * the file name and the +/-/~ totals, then one tinted mono row per line
 * event, additions first. Long lists collapse to the first ten with a
 * "show all" toggle.
 */
function DiffBlock({
  row,
  lines,
  defaultShowAll = false,
}: {
  row: MovementRow;
  lines: LineEvent[];
  defaultShowAll?: boolean;
}) {
  const [showAll, setShowAll] = useState(defaultShowAll);

  const ordered = useMemo(
    () =>
      DIFF_ORDER.flatMap((kind) => lines.filter((l) => l.event === kind)),
    [lines],
  );

  if (ordered.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No line-level detail available for this publisher.
      </p>
    );
  }

  const fileLabel = ordered[0].file_kind === "ads_txt" ? "ads.txt" : "app-ads.txt";
  const addedN = lines.filter((l) => l.event === "added").length;
  const removedN = lines.filter((l) => l.event === "removed").length;
  const certN = lines.filter((l) => l.event === "cert_changed").length;
  const visible = showAll ? ordered : ordered.slice(0, DIFF_PREVIEW);

  return (
    <div className="min-w-0">
      <div className="overflow-hidden rounded-lg border border-border bg-white font-mono text-[11px] leading-relaxed">
        {/* Hunk header, git style. */}
        <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border bg-muted/60 px-2.5 py-1.5 text-slate-500">
          <span className="truncate">
            @@ {row.domain ?? row.name ?? "publisher"}/{fileLabel} @@
          </span>
          <span className="ml-auto flex flex-shrink-0 gap-2 tabular-nums">
            {addedN > 0 && <span className="text-ok">+{addedN}</span>}
            {removedN > 0 && <span className="text-critical">-{removedN}</span>}
            {certN > 0 && <span className="text-warn">~{certN}</span>}
          </span>
        </div>
        {visible.map((l, i) => {
          const style = DIFF_STYLE[l.event] ?? DIFF_STYLE.added;
          return (
            <div
              key={`${l.ssp_domain}:${l.publisher_id}:${l.event}:${i}`}
              className={cn("flex items-stretch", style.row)}
            >
              <span
                className={cn(
                  "w-6 flex-none select-none py-1 text-center font-semibold",
                  style.marker,
                )}
              >
                {style.glyph}
              </span>
              <span className="min-w-0 flex-1 break-all py-1 pl-1 pr-2 text-slate-800">
                {l.ssp_domain}, {l.publisher_id}, {l.relationship}
                {l.event === "cert_changed" ? (
                  <>
                    {", "}
                    <span className="text-slate-400 line-through">
                      {l.old_cert_id}
                    </span>
                    {" → "}
                    <span>{l.new_cert_id}</span>
                  </>
                ) : (
                  (l.event === "added" ? l.new_cert_id : l.old_cert_id) && (
                    <>, {l.event === "added" ? l.new_cert_id : l.old_cert_id}</>
                  )
                )}
              </span>
            </div>
          );
        })}
      </div>
      {ordered.length > DIFF_PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1.5 text-[11px] font-medium text-primary hover:underline"
        >
          {showAll
            ? "Show fewer"
            : `Show all ${ordered.length.toLocaleString()} lines`}
        </button>
      )}
    </div>
  );
}

/**
 * The apps under one publisher. For a publisher that removed you these
 * are the apps you were live on — worth naming, that's the inventory
 * you lost.
 */
function AppsBlock({ apps, tone }: { apps: MatchedBundle[]; tone: Tone }) {
  const heading =
    tone === "critical" ? "Apps you were live on" : "Apps under this publisher";
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {heading}
        </span>
        {apps.length > 0 && (
          <span className="font-mono text-[11px] tabular-nums text-slate-500">
            {apps.length}
          </span>
        )}
      </div>
      {apps.length === 0 ? (
        <p className="text-xs text-slate-500">
          {tone === "critical"
            ? "No apps on file for this publisher."
            : "No matched apps for this publisher this week."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {apps.map((a) => (
            <li
              key={`${a.store}:${a.bundle_id}`}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-white px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-slate-900">
                  {a.app_name ?? "unnamed app"}
                </div>
                <div className="truncate font-mono text-[10.5px] text-slate-500">
                  {a.store}, {a.bundle_id}
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="font-mono text-xs font-semibold tabular-nums text-slate-800">
                  {a.line_count}
                </div>
                <div className="text-[9px] text-slate-500">
                  {a.line_count === 1 ? "line" : "lines"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
