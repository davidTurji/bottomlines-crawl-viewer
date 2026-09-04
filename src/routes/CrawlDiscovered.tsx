import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  Download,
  Radar,
  RotateCw,
  Search,
} from "lucide-react";

import {
  api,
  type DiscoveredLine,
  type DiscoveredLineKey,
  type DiscoveredPlacement,
  type DiscoveredTotals,
  type Summary,
} from "../lib/api";
import { formatWeek } from "@/components/WeekContextBadge";
import { useReportScope } from "@/lib/reportScope";

/**
 * DISCOVERED LINES.
 *
 * The unit on this page is THE LINE, not the publisher. A discovery crawl
 * asks one question ("who is carrying carambola.com at all?") and the answer
 * is a set of ads.txt lines, each of which turns up on some number of
 * publishers. The previous draft flattened that into a (publisher x line)
 * grid, which is the right shape for the export workbook and the wrong shape
 * for a reader: the same line repeated four hundred times buried the only
 * fact a WEEKLY crawl exists to deliver, which is whether that line is on
 * more publishers than it was seven days ago.
 *
 * So: one card per line. The card's face carries the line itself, the number
 * of publishers, and the week-over-week move. Nothing else. Clicking it
 * opens the roster of publishers carrying it, and which of their two files
 * it was found in.
 *
 * Data contract, including the exact endpoints this page wants built, is
 * documented on api.discoveredLines in src/lib/api.ts.
 */

const PAGE_SIZE = 50;

export default function CrawlDiscovered() {
  const { token } = useReportScope();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<DiscoveredLine[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<DiscoveredTotals | null>(null);
  const [page, setPage] = useState(1);
  const [ssp, setSsp] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Whether this crawl has any discovered lines at all, independent of the
  // filter. Without it an over-narrow filter would render the "this crawl
  // did not use discovery domains" card, which would be a lie about the
  // crawl rather than a fact about the filter.
  const [anyDiscovered, setAnyDiscovered] = useState<boolean | null>(null);

  const filter = ssp.trim();

  useEffect(() => {
    let cancelled = false;
    api
      .summary(token)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => setPage(1), [ssp]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .discoveredLines(token, {
        page,
        page_size: PAGE_SIZE,
        ssp_domain: filter || undefined,
      })
      .then((r) => {
        if (cancelled) return;
        setRows(r.rows);
        setTotal(r.total);
        setTotals(r.totals);
        // Changing page or filter re-renders a different set of cards, so
        // an expansion held open from the previous set would either vanish
        // or, worse, appear to belong to a line it does not.
        setOpen(new Set());
        // An unfiltered answer settles the question for the whole crawl.
        if (!filter) setAnyDiscovered(r.total > 0);
        else if (r.total > 0) setAnyDiscovered(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, page, filter]);

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

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endRow = Math.min(total, page * PAGE_SIZE);

  // No rows, no filter, and the crawl itself has none: a seat-line-only
  // crawl, which is a normal thing to be, not an error.
  const noDiscovery = !loading && !error && total === 0 && anyDiscovered === false;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-7 px-4 py-6 sm:px-6 lg:py-10">
      {/* Page header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            Discovered lines
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
            Every line this crawl found carrying one of your discovery
            domains, and how far each one moved since last week. Open a line
            to see the publishers carrying it.
          </p>
        </div>
        {weekLabel && (
          <div className="inline-flex flex-shrink-0 items-center gap-2 self-start rounded-full border border-border bg-white/60 px-3 py-1 text-[12px] text-slate-600 shadow-sm">
            <CalendarClock className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-slate-800">{weekLabel}</span>
          </div>
        )}
      </div>

      {/* One calm row, not a wall of stat cards: how many lines, how many
          placements those lines add up to, and which way the week went. */}
      {!noDiscovery && totals && (
        <SummaryRow totals={totals} filtered={Boolean(filter)} />
      )}

      {/* Filter + export. Deliberately quiet chrome: the cards are the page. */}
      {!noDiscovery && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={ssp}
              onChange={(e) => setSsp(e.target.value)}
              placeholder="Filter by SSP domain"
              aria-label="Filter by SSP domain"
              className="h-9 w-full rounded-full border border-border bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary/40 sm:w-[280px]"
            />
          </div>
          <button
            onClick={() => {
              setExporting(true);
              downloadCsv(token, filter).finally(() => setExporting(false));
            }}
            disabled={exporting || total === 0}
            className="inline-flex items-center gap-1.5 self-start rounded-full border border-border bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-slate-600"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Preparing..." : "Export CSV"}
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <RotateCw className="h-4 w-4 animate-spin" />
          Loading discovered lines...
        </div>
      )}
      {error && <p className="py-4 text-sm text-critical">{error}</p>}

      {noDiscovery && <NoDiscoveryCard />}

      {!loading && !error && !noDiscovery && rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center text-sm text-slate-500">
          No discovered lines match this filter.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-2.5">
          {rows.map((line) => {
            const key = lineKey(line);
            return (
              <LineCard
                key={key}
                token={token}
                line={line}
                open={open.has(key)}
                onToggle={() => toggle(key)}
              />
            );
          })}
        </div>
      )}

      {total > 0 && pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-border/70 pt-4 text-xs text-slate-500">
          <span>
            Showing {startRow.toLocaleString()} to {endRow.toLocaleString()} of{" "}
            {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-full border border-border bg-white px-3 py-1 transition-colors hover:border-primary/30 disabled:opacity-40 disabled:hover:border-border"
            >
              Previous
            </button>
            <span className="font-mono tabular-nums">
              {page} / {pageCount.toLocaleString()}
            </span>
            <button
              disabled={page >= pageCount}
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
 * One line. Collapsed, it shows the line and two facts about it. Expanded,
 * it shows every publisher carrying it.
 *
 * The whole face is the button, so a click anywhere opens it, and the
 * chevron is decoration rather than a second, smaller target.
 */
function LineCard({
  token,
  line,
  open,
  onToggle,
}: {
  token: string;
  line: DiscoveredLine;
  open: boolean;
  onToggle: () => void;
}) {
  // Embedded placements are authoritative when present; the wide lines
  // arrive without them and are fetched once, on first expand, then kept.
  const [fetched, setFetched] = useState<
    DiscoveredPlacement[] | "loading" | "error" | null
  >(null);
  const embedded = line.placements;
  const placements = embedded ?? fetched;
  const key = lineKey(line);

  // Liveness, not per-run cancellation. A `let cancelled` closure would be
  // wrong here: setFetched("loading") re-renders, which tears down the very
  // effect run that owns the in-flight request, and the response would then
  // be discarded as stale, leaving the panel on "Loading..." forever.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // One request per line, guarded by a ref rather than by state so the
  // effect does not depend on the value it sets.
  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (!open || embedded) return;
    if (requested.current === key) return;
    requested.current = key;
    setFetched("loading");
    const lineId: DiscoveredLineKey = {
      ssp_domain: line.ssp_domain,
      publisher_id: line.publisher_id,
      relationship: line.relationship,
      cert_id: line.cert_id,
    };
    api
      .discoveredLinePlacements(token, lineId, { page: 1, page_size: 500 })
      .then((r) => {
        if (alive.current) setFetched(r.rows);
      })
      .catch(() => {
        if (!alive.current) return;
        // Let a re-open try again rather than pinning the error forever.
        requested.current = null;
        setFetched("error");
      });
  }, [open, token, key, embedded, line]);

  const delta = deltaOf(line);

  return (
    <div
      className={[
        "overflow-hidden rounded-2xl border bg-card transition-colors duration-200",
        open
          ? "border-primary/25"
          : "border-border hover:border-slate-300",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-start gap-4 px-5 py-5 text-left sm:px-6"
      >
        <div className="min-w-0 flex-1">
          {/*
            The line, verbatim and dominant. The cert id is appended inside
            the same mono run rather than dropped onto a second line: it IS
            the fourth field of this one physical ads.txt line, and splitting
            it would misrepresent the file. Muting it instead lets the eye
            stop after the relationship, which is where the meaning ends,
            while the full line stays copyable as one string.
          */}
          {/* break-words, not break-all: a narrow screen should move the
              whole cert to the next line, never split a hex string down the
              middle, which stops it reading as one value. */}
          <code className="block break-words font-mono text-[13px] font-medium leading-relaxed text-slate-900 sm:text-[15px]">
            {line.ssp_domain}, {line.publisher_id}, {line.relationship}
            {line.cert_id && (
              <span className="font-normal text-slate-400">, {line.cert_id}</span>
            )}
          </code>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-[12px] text-slate-500">
              <span className="font-mono tabular-nums text-slate-700">
                {line.placements_count.toLocaleString()}
              </span>{" "}
              {line.placements_count === 1 ? "publisher" : "publishers"}
            </span>
            <DeltaChip delta={delta} />
          </div>
        </div>

        <ChevronDown
          aria-hidden
          strokeWidth={1.5}
          className={[
            "mt-1 h-4 w-4 flex-shrink-0 transition-[transform,color] duration-200",
            open
              ? "rotate-180 text-primary/70"
              : "text-slate-300 group-hover:text-slate-400",
          ].join(" ")}
        />
      </button>

      {open && (
        <div className="border-t border-border/70 bg-muted/30 px-5 py-4 sm:px-6">
          <div className="mb-3 text-[11px] text-slate-500">
            Where it was found
          </div>
          {placements === "loading" || placements === null ? (
            <p className="py-2 text-[12px] text-slate-400">Loading...</p>
          ) : placements === "error" ? (
            <p className="py-2 text-[12px] text-critical">
              Could not load the publishers for this line.
            </p>
          ) : placements.length === 0 ? (
            <p className="py-2 text-[12px] text-slate-400">
              No publishers recorded.
            </p>
          ) : (
            /* Capped and scrollable: a line on four hundred publishers would
               otherwise run for thousands of pixels and push every other
               card off the screen. Long lists fade out at the bottom edge
               rather than guillotining a row, which is both calmer and the
               only cue that there is more below (the scrollbar is hidden
               app-wide until you touch the track). */
            <div
              className={[
                "scroll-y max-h-[320px] overflow-y-auto pr-1",
                placements.length > 8
                  ? "[mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]"
                  : "",
              ].join(" ")}
            >
              <div className="relative space-y-1.5 pl-5">
                <span
                  aria-hidden
                  className="absolute bottom-4 left-[7px] top-0 w-px bg-border"
                />
                {placements.map((p, i) => (
                  <div
                    key={`${p.developer_domain}|${p.found_in}|${i}`}
                    className="relative flex w-full items-center gap-3 rounded-full border border-border/70 bg-white px-3.5 py-1.5"
                  >
                    <span
                      aria-hidden
                      className="absolute -left-[13px] top-1/2 h-px w-3 bg-border"
                    />
                    <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-800 sm:text-xs">
                      {p.developer_domain}
                    </code>
                    <span className="flex-shrink-0 text-[10px] text-slate-400">
                      {p.found_in}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Weekly delta ──────────────────────────────────────────────────── */

type Delta =
  | { kind: "new" }
  | { kind: "flat" }
  | { kind: "up"; n: number }
  | { kind: "down"; n: number };

function deltaOf(line: DiscoveredLine): Delta {
  if (line.previous_placements_count == null) return { kind: "new" };
  const d = line.placements_count - line.previous_placements_count;
  if (d > 0) return { kind: "up", n: d };
  if (d < 0) return { kind: "down", n: -d };
  return { kind: "flat" };
}

/**
 * The week-over-week move, and the only place on the card face that carries
 * colour.
 *
 *   up      racing green, the brand's own affirmative. More publishers
 *           carrying the line is the outcome the weekly crawl is run for.
 *   down    amber, not red. A publisher dropping a line is worth a reader's
 *           attention, but it is a normal fact about the market, not a
 *           failure or an error, and red would say otherwise.
 *   new     no fill and no arrow, just a green dot and the word. A line
 *           seen for the first time has no previous number, so any "+198"
 *           would be an invented comparison.
 *   flat    plain muted text. A grey badge for "nothing happened" is the
 *           loudest way to say nothing happened.
 */
function DeltaChip({ delta }: { delta: Delta }) {
  if (delta.kind === "flat") {
    return (
      <span className="text-[12px] text-slate-400">no change since last week</span>
    );
  }
  if (delta.kind === "new") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary/70" />
        new this week
      </span>
    );
  }
  const up = delta.kind === "up";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        up
          ? "border-ok-border bg-ok-bg text-ok"
          : "border-warn-border bg-warn-bg text-warn",
      ].join(" ")}
    >
      <Icon aria-hidden strokeWidth={2} className="h-3 w-3" />
      <span className="tabular-nums">
        {up ? "+" : "-"}
        {delta.n.toLocaleString()}
      </span>
      <span className="font-normal opacity-80">since last week</span>
    </span>
  );
}

/* ── Summary ───────────────────────────────────────────────────────── */

/**
 * One row, three facts, hairlines instead of cards. The counts come from
 * the endpoint's `totals` block, which is scoped to the active filter, so
 * this row always describes exactly the cards underneath it.
 */
function SummaryRow({
  totals,
  filtered,
}: {
  totals: DiscoveredTotals;
  filtered: boolean;
}) {
  const prev = totals.previous_placements;
  const moved = prev == null ? null : totals.placements - prev;

  return (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-y border-border/70 py-4">
      <Figure value={totals.lines} label={totals.lines === 1 ? "line" : "lines"} />
      <Figure
        value={totals.placements}
        label={totals.placements === 1 ? "placement" : "placements"}
      />
      <span className="text-[12px] leading-relaxed">
        {moved == null ? (
          <span className="text-slate-400">
            first crawl, no prior week to compare
          </span>
        ) : moved > 0 ? (
          <span className="text-ok">
            {moved.toLocaleString()} more placements than last week
          </span>
        ) : moved < 0 ? (
          <span className="text-warn">
            {Math.abs(moved).toLocaleString()} fewer placements than last week
          </span>
        ) : (
          <span className="text-slate-400">
            the same number of placements as last week
          </span>
        )}
        {filtered && <span className="text-slate-400"> (this filter)</span>}
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

/* ── Empty state ───────────────────────────────────────────────────── */

/**
 * The seat-line-only crawl. An empty list would read as "discovery ran and
 * found nothing", which is the opposite of the truth: discovery never ran,
 * because this crawl was asked to look for exact seat lines only.
 */
function NoDiscoveryCard() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white">
        <Radar className="h-5 w-5 text-slate-400" />
      </div>
      <h2 className="mt-4 text-sm font-semibold text-slate-900">
        This crawl did not use discovery domains
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
        It looked for your exact seat lines, so every line it kept is already
        on the Results and Line changes pages. Nothing was discovered because
        nothing was asked for.
      </p>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
        A discovery domain is an SSP you want to see in full, whatever the
        publisher account number. Add one to the next crawl and every line
        carrying it shows up here.
      </p>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────── */

/** A line's identity, and the React key for its card. */
function lineKey(l: DiscoveredLine): string {
  return [l.ssp_domain, l.publisher_id, l.relationship, l.cert_id].join("|");
}

/**
 * CSV export of what is on screen: one row per line, not per placement.
 * The screen groups, so the file groups, otherwise a reader who exports to
 * check a number finds a different set of rows than the one they were
 * looking at. Walks the pages with the same 20-page cap the sibling pages
 * use and carries the active SSP filter.
 */
async function downloadCsv(token: string, ssp: string) {
  const header = [
    "ssp_domain",
    "publisher_id",
    "relationship",
    "cert_id",
    "placements_count",
    "previous_placements_count",
  ] as const;
  const acc: DiscoveredLine[] = [];
  const pageSize = 200;
  const cap = 20;
  for (let pageNo = 1; pageNo <= cap; pageNo += 1) {
    const r = await api.discoveredLines(token, {
      page: pageNo,
      page_size: pageSize,
      ssp_domain: ssp || undefined,
    });
    acc.push(...r.rows);
    if (r.rows.length < r.page_size) break;
  }
  const csv = [
    header.join(","),
    ...acc.map((row) =>
      header
        .map((h) => JSON.stringify(row[h] ?? (h === "cert_id" ? "" : null)))
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bottomlines-crawl-discovered-lines-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
