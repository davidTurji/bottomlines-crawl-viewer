import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  Minus,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
} from "lucide-react";

import { api, type LineEvent, type Summary } from "../lib/api";
import { formatWeek } from "@/components/WeekContextBadge";
import { useReportScope } from "@/lib/reportScope";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { MiniStat } from "./CrawlReport";

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

const PAGE_SIZE = 40;

/** How many pages of line events to walk before giving up. */
const FETCH_CAP = 12;
const FETCH_PAGE_SIZE = 500;

type Bucket = "all" | "added" | "removed" | "cert_changed";
type EventKind = "added" | "removed" | "cert_changed";

export default function CrawlChanges() {
  const { token } = useReportScope();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [previous, setPrevious] = useState<Summary | null>(null);
  const [bucket, setBucket] = useState<Bucket>("all");
  const [matchedSeatOnly, setMatchedSeatOnly] = useState(false);
  const [ssp, setSsp] = useState("");
  const [rows, setRows] = useState<LineEvent[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const filter = ssp.trim();

  useEffect(() => {
    let cancelled = false;
    api
      .summary(token)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => {});
    api
      .previousSummary(token)
      .then((p) => !cancelled && setPrevious(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  // One fetch covers every bucket. The page groups rows into lines, and a
  // line's placements can straddle a server page boundary, so grouping a
  // single 50-row window would invent lines that are smaller than they are.
  // Switching tabs is then instant and the tab counts describe exactly the
  // cards underneath them.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAllEvents(token, {
      ssp_domain: filter || undefined,
      matched_seat_only: matchedSeatOnly || undefined,
    })
      .then((r) => {
        if (cancelled) return;
        setRows(r.rows);
        setTruncated(r.truncated);
        setOpen(new Set());
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, filter, matchedSeatOnly]);

  useEffect(() => setPage(1), [bucket, filter, matchedSeatOnly]);

  const groups = useMemo(() => groupByLine(rows), [rows]);

  const counts = useMemo(
    () => ({
      all: groups.length,
      added: groups.filter((g) => g.event === "added").length,
      removed: groups.filter((g) => g.event === "removed").length,
      cert_changed: groups.filter((g) => g.event === "cert_changed").length,
    }),
    [groups],
  );

  // In All the three buckets are woven together in proportion, so the first
  // screen shows added, removed and cert changes side by side instead of the
  // server's added-then-removed-then-cert ordering. Within a bucket the
  // widest changes come first.
  const visible = useMemo(
    () =>
      bucket === "all"
        ? interleave(groups)
        : sortBucket(groups.filter((g) => g.event === bucket)),
    [groups, bucket],
  );

  const total = visible.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const shown = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const startRow = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endRow = Math.min(total, safePage * PAGE_SIZE);

  const weekLabel = summary?.finished_at
    ? formatWeek(new Date(summary.finished_at))
    : null;
  const prevWeekLabel = previous?.finished_at
    ? formatWeek(new Date(previous.finished_at))
    : null;

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7 px-4 py-6 sm:px-6 lg:py-10">
      {/* Page header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            Line changes
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
            Every ads.txt and app-ads.txt line that appeared, disappeared, or
            had its cert rotated since{" "}
            {prevWeekLabel
              ? `the crawl of ${prevWeekLabel}`
              : "the previous crawl"}
            . Open a line to see the publishers it moved on.
          </p>
        </div>
        {weekLabel && (
          <div className="inline-flex flex-shrink-0 items-center gap-2 self-start rounded-full border border-border bg-white/60 px-3 py-1 text-[12px] text-slate-600 shadow-sm">
            <CalendarClock className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-slate-800">{weekLabel}</span>
          </div>
        )}
      </div>

      {/* One calm row: how many lines moved, and how many publisher records
          that adds up to. Both are counted from the cards on screen, so the
          row always describes what is underneath it. */}
      {!loading && !error && (
        <SummaryRow
          lines={counts.all}
          placements={rows.length}
          filtered={Boolean(filter) || matchedSeatOnly}
        />
      )}

      {/* Controls: the bucket, the seat toggle, the SSP filter. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
          <TabsList className="h-auto flex-wrap justify-start rounded-full bg-muted p-1">
            <BucketTab value="all" label="All" count={counts.all} />
            <BucketTab
              value="added"
              label="Added"
              count={counts.added}
              tone="text-ok"
            />
            <BucketTab
              value="removed"
              label="Removed"
              count={counts.removed}
              tone="text-critical"
            />
            <BucketTab
              value="cert_changed"
              label="Cert changes"
              count={counts.cert_changed}
              tone="text-warn"
            />
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMatchedSeatOnly((v) => !v)}
            aria-pressed={matchedSeatOnly}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition-colors",
              matchedSeatOnly
                ? "border-info-border bg-info-bg text-info"
                : "border-border bg-white text-slate-600 hover:border-primary/30 hover:text-primary",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                matchedSeatOnly ? "bg-info" : "bg-slate-300",
              )}
            />
            My seats only
          </button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={ssp}
              onChange={(e) => setSsp(e.target.value)}
              placeholder="Filter by SSP domain"
              aria-label="Filter by SSP domain"
              className="h-9 w-full rounded-full border border-border bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary/40 sm:w-[240px]"
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <RotateCw className="h-4 w-4 animate-spin" />
          Loading line changes...
        </div>
      )}
      {error && <p className="py-4 text-sm text-critical">{error}</p>}

      {!loading && !error && shown.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center text-sm text-slate-500">
          No line changes match this filter.
        </p>
      )}

      {!loading && !error && shown.length > 0 && (
        <div className="space-y-3">
          {shown.map((g) => (
            <ChangeCard
              key={g.key}
              group={g}
              open={open.has(g.key)}
              onToggle={() => toggle(g.key)}
            />
          ))}
        </div>
      )}

      {truncated && !loading && (
        <p className="text-xs text-slate-400">
          Showing the first {(FETCH_CAP * FETCH_PAGE_SIZE).toLocaleString()}{" "}
          line events for this crawl.
        </p>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-border/70 pt-4 text-xs text-slate-500">
          <span>
            Showing {startRow.toLocaleString()} to {endRow.toLocaleString()} of{" "}
            {total.toLocaleString()} {total === 1 ? "line" : "lines"}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-full border border-border bg-white px-3 py-1 transition-colors hover:border-primary/30 disabled:opacity-40 disabled:hover:border-border"
            >
              Previous
            </button>
            <span className="font-mono tabular-nums">
              {safePage} / {pageCount.toLocaleString()}
            </span>
            <button
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full border border-border bg-white px-3 py-1 transition-colors hover:border-primary/30 disabled:opacity-40 disabled:hover:border-border"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── The card ──────────────────────────────────────────────────────── */

/**
 * One changed line, built as a deliberate sibling of PublisherCard and of
 * the Discovered lines card: same rounded-3xl white card, same shadow, same
 * 44px disc, same right-aligned MiniStats, same chevron, same tinted body.
 *
 * The difference is that the disc, the chip and the tint all carry the tone
 * of the EVENT, because on this page the event is the fact the reader came
 * for. The chip spells it out in words; the disc and tint mean a card's
 * event is readable from the edge of vision, before any word is read.
 */
function ChangeCard({
  group,
  open,
  onToggle,
}: {
  group: ChangeGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const tone = TONES[group.event];
  const Icon = tone.icon;
  const count = group.publishers.length;
  const seats = group.publishers.filter((p) => p.matched_seat).length;

  // The cert that belongs to the line as it stands. A rotation has two, and
  // gets its own row below rather than a fourth field that cannot show a
  // change.
  const inlineCert =
    group.event === "added"
      ? group.new_cert_id
      : group.event === "removed"
        ? group.old_cert_id
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
        <div
          className={cn(
            "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full",
            tone.disc,
          )}
        >
          <Icon aria-hidden className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          {/*
            The line, verbatim and dominant, cert included: that string IS
            the unit of this page. It truncates rather than wraps, so a card
            keeps its height whatever the length of a cert id.
          */}
          <code className="block truncate font-mono text-[13px] font-semibold tracking-tight text-slate-900 sm:text-[15px]">
            {group.ssp_domain}, {group.publisher_id}, {group.relationship}
            {inlineCert && (
              <span className="font-normal text-slate-400">, {inlineCert}</span>
            )}
          </code>

          {/* The event, in words, in its tone. This is the fact the old
              table hid in an unlabelled arrow column. */}
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span
              className={cn(
                "inline-flex flex-shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                tone.chip,
              )}
            >
              {tone.label}
            </span>
            <span className="truncate">
              {tone.preposition}{" "}
              <span className="font-mono tabular-nums text-slate-700">
                {count.toLocaleString()}
              </span>{" "}
              {count === 1 ? "publisher" : "publishers"}
            </span>
            {seats > 0 && (
              <span className="inline-flex flex-shrink-0 items-center gap-1.5 text-info">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-info" />
                your seat
              </span>
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
          <div className="w-[76px]">
            {seats > 0 && <MiniStat label="Your seats" value={seats} />}
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
            tone.tint,
          )}
        >
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-slate-700">
              {tone.expandedTitle}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-slate-500">
              {count.toLocaleString()}
            </span>
          </div>
          {/* Capped and scrollable: a line that moved on hundreds of
              publishers would otherwise push every other card off screen. */}
          <div className="scroll-y max-h-[320px] overflow-y-auto rounded-md border border-border bg-white">
            <ul className="divide-y divide-border">
              {group.publishers.map((p, i) => (
                <li
                  key={`${p.developer_id}|${p.file_kind}|${i}`}
                  className="flex items-baseline gap-3 px-3 py-1.5 text-[11px]"
                >
                  <span className="truncate font-mono tabular-nums text-slate-800">
                    {p.developer_domain || `#${p.developer_id}`}
                  </span>
                  <span className="hidden truncate text-slate-500 sm:inline">
                    {p.developer_name ?? ""}
                  </span>
                  {p.matched_seat && (
                    <span className="flex-shrink-0 text-[10px] text-info">
                      your seat
                    </span>
                  )}
                  {/* Rendered, never the raw enum: this is a customer's
                      screen, and "APP_ADS_TXT" is not a file name. */}
                  <span className="ml-auto flex-shrink-0 text-[10px] text-slate-400">
                    {fileLabel(p.file_kind)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
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
    chip: string;
    tint: string;
    icon: typeof Plus;
  }
> = {
  added: {
    label: "added",
    preposition: "to",
    expandedTitle: "Publishers this line was added to",
    disc: "bg-ok-bg text-ok",
    chip: "border-ok-border bg-ok-bg text-ok",
    tint: "bg-ok-bg/40",
    icon: Plus,
  },
  removed: {
    label: "removed",
    preposition: "from",
    expandedTitle: "Publishers this line was removed from",
    disc: "bg-critical-bg text-critical",
    chip: "border-critical-border bg-critical-bg text-critical",
    tint: "bg-critical-bg/40",
    icon: Minus,
  },
  cert_changed: {
    label: "cert changed",
    preposition: "on",
    expandedTitle: "Publishers carrying the rotated cert",
    disc: "bg-warn-bg text-warn",
    chip: "border-warn-border bg-warn-bg text-warn",
    tint: "bg-warn-bg/40",
    icon: RefreshCw,
  },
};

/* ── Bucket tab ────────────────────────────────────────────────────── */

function BucketTab({
  value,
  label,
  count,
  tone,
}: {
  value: Bucket;
  label: string;
  count: number;
  tone?: string;
}) {
  return (
    <TabsTrigger value={value} className="rounded-full px-3.5">
      {label}
      <span
        className={cn("ml-1.5 font-mono tabular-nums", tone ?? "text-slate-500")}
      >
        {count.toLocaleString()}
      </span>
    </TabsTrigger>
  );
}

/* ── Summary ───────────────────────────────────────────────────────── */

function SummaryRow({
  lines,
  placements,
  filtered,
}: {
  lines: number;
  placements: number;
  filtered: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-y border-border/70 py-4">
      <Figure value={lines} label={lines === 1 ? "line moved" : "lines moved"} />
      <Figure
        value={placements}
        label={placements === 1 ? "publisher record" : "publisher records"}
      />
      <span className="text-[12px] leading-relaxed text-slate-400">
        each card is one line, opened to the publishers it moved on
        {filtered && <span> (this filter)</span>}
      </span>
    </div>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="font-mono text-xl font-semibold tabular-nums tracking-tight text-slate-900">
        {value.toLocaleString()}
      </span>
      <span className="text-[12px] text-slate-500">{label}</span>
    </span>
  );
}

/* ── Grouping ──────────────────────────────────────────────────────── */

type ChangeGroup = {
  key: string;
  event: EventKind;
  ssp_domain: string;
  publisher_id: string;
  relationship: string;
  old_cert_id: string | null;
  new_cert_id: string | null;
  publishers: LineEvent[];
};

/** Anything that is not an add or a removal is a cert rotation. */
function eventKind(raw: string): EventKind {
  if (raw === "added") return "added";
  if (raw === "removed") return "removed";
  return "cert_changed";
}

/**
 * (line x publisher) rows in, one group per line out. The identity of a
 * line is the four fields of the file plus what happened to it: the same
 * ads.txt line added on one publisher and removed on another is two facts,
 * not one, and must not collapse into a single card.
 */
function groupByLine(rows: LineEvent[]): ChangeGroup[] {
  const byKey = new Map<string, ChangeGroup>();
  for (const r of rows) {
    const event = eventKind(r.event);
    const key = [
      event,
      r.ssp_domain,
      r.publisher_id,
      r.relationship,
      r.old_cert_id ?? "",
      r.new_cert_id ?? "",
    ].join("|");
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        event,
        ssp_domain: r.ssp_domain,
        publisher_id: r.publisher_id,
        relationship: r.relationship,
        old_cert_id: r.old_cert_id,
        new_cert_id: r.new_cert_id,
        publishers: [],
      };
      byKey.set(key, g);
    }
    g.publishers.push(r);
  }
  return [...byKey.values()];
}

/** Widest change first, then a stable alphabetical tiebreak. */
function sortBucket(groups: ChangeGroup[]): ChangeGroup[] {
  return [...groups].sort(
    (a, b) =>
      b.publishers.length - a.publishers.length ||
      a.ssp_domain.localeCompare(b.ssp_domain) ||
      a.publisher_id.localeCompare(b.publisher_id),
  );
}

/**
 * Weave the three buckets together in proportion.
 *
 * The endpoint returns its rows grouped by event, so a naive All tab is a
 * run of added cards, then a run of removed cards, then the cert changes,
 * and a reader who never scrolls past the first screen concludes that
 * nothing was removed. Giving every card a position of (index + 0.5) /
 * bucket size and sorting on it spreads each bucket evenly across the whole
 * list, so any window of cards holds roughly the week's real mix.
 */
function interleave(groups: ChangeGroup[]): ChangeGroup[] {
  const order: EventKind[] = ["added", "removed", "cert_changed"];
  const placed: { g: ChangeGroup; pos: number; rank: number }[] = [];
  order.forEach((event, rank) => {
    const bucket = sortBucket(groups.filter((g) => g.event === event));
    bucket.forEach((g, i) => {
      placed.push({ g, pos: (i + 0.5) / bucket.length, rank });
    });
  });
  placed.sort((a, b) => a.pos - b.pos || a.rank - b.rank);
  return placed.map((p) => p.g);
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

/**
 * Every line event for the crawl, under the active filters. Walks the pages
 * with the same cap the sibling pages use; `truncated` says whether the cap
 * was hit, so the page can admit it rather than quietly under-report.
 */
async function fetchAllEvents(
  token: string,
  filters: { ssp_domain?: string; matched_seat_only?: boolean },
): Promise<{ rows: LineEvent[]; truncated: boolean }> {
  const acc: LineEvent[] = [];
  for (let p = 1; p <= FETCH_CAP; p += 1) {
    const r = await api.lineEvents(token, {
      ...filters,
      page: p,
      page_size: FETCH_PAGE_SIZE,
    });
    acc.push(...r.rows);
    if (r.rows.length < FETCH_PAGE_SIZE) {
      return { rows: acc, truncated: false };
    }
  }
  return { rows: acc, truncated: true };
}
