import { Search } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";

import { EmptyResult, Pager, TruncatedNotice, usePaging } from "@/components/ListControls";
import LockedTail from "@/components/LockedTail";
import { Settle } from "@/components/Motion";
import { SkeletonRows, skeletonRowCount } from "@/components/Skeleton";
import { expectedRows, knownKey, type Landed } from "@/lib/expectedRows";
import {
  api,
  type GoneInventory,
  type InactiveApp,
  type InactiveCounts,
  type InactiveKind,
  type InactivePage,
  type InactivePublisher,
  type TrialCaps,
} from "@/lib/api";
import { INACTIVE_KINDS, inactiveNoun, reasonText } from "@/lib/inactive";
import { csvName, ExportListButton, type CsvSink } from "@/components/ExportList";
import { eachPage, READ_PAGE, type Progress } from "@/lib/scopeRows";
import { usePageCache } from "@/lib/pageCache";
import { PAGE_SIZE } from "@/lib/paging";
import { cn, storeName } from "@/lib/utils";

/**
 * THE INACTIVE TAB of the matched list (David, 2026-10-08), which replaced
 * No longer live. A report is the difference between two crawls, and so is
 * this tab: the publishers whose site died and the apps their store stopped
 * listing BETWEEN the compared crawl and this one, each with the date, the
 * reason and the evidence behind it. Nothing is deleted. The lists above
 * and the headline numbers count active only.
 *
 * Two lists, Publishers and Apps, on THE SAME CARDS as the matched lists
 * (David, 2026-10-08), greyed, with an Inactive chip and a strip on top
 * saying since when and why. The cards are the page's, handed in as
 * `cards`, so this section never imports the route. Searched and paged on
 * the server like the matched lists, the same pager, the same locked tail
 * on a trial. Which list is open is the page's, so it survives switching
 * between the publishers and apps views.
 */

/** The matched cards, in their inactive dress. */
export type InactiveCards = {
  Publisher: ComponentType<{ pub: InactivePublisher; open: boolean; onToggle: () => void; token: string }>;
  App: ComponentType<{ app: InactiveApp; open: boolean; onToggle: () => void; token: string }>;
};

const LABEL: Record<InactiveKind, string> = { publishers: "Publishers", apps: "Apps" };

/** The intro over each list; `since` is "since Aug 18, 2026" or "since the
 *  compared crawl". */
function intro(kind: InactiveKind, since: string): string {
  return kind === "publishers"
    ? `Publishers that carried your seat lines and went inactive ${since}, for example the domain is gone or the site stopped answering.`
    : `Apps that carried your seat lines and that their store stopped listing ${since}, checked more than once.`;
}

const EMPTY: Record<InactiveKind, string> = {
  publishers: "No publishers went inactive between these two crawls.",
  apps: "No apps went inactive between these two crawls.",
};

/** Said when neither list has a row (or the report has no section). */
const NOTHING_INACTIVE = "Nothing went inactive between these two crawls.";

type Loaded = InactivePage;

export default function InactiveSection({
  token,
  lines,
  caps,
  counts,
  kind,
  setKind,
  legacy,
  since,
  cards,
}: {
  token: string;
  /** The seat-line filter: narrows publishers by their lines and apps by
   *  their publisher's lines. */
  lines: string[];
  /** The trial's caps, on a trial: the unlock card stands on every list. */
  caps: TrialCaps | null;
  /** Whole counts for the two switches (the summary's). */
  counts: InactiveCounts;
  /** Owned by the page, so the open list survives a view switch. */
  kind: InactiveKind;
  setKind: (kind: InactiveKind) => void;
  /** The summary's No longer live block: what an older API's report is
   *  built from when it has no /inactive route. */
  legacy: GoneInventory | null | undefined;
  /** The report's window, as words: "since Aug 18, 2026", or "since the
   *  compared crawl" when the report does not say when that ran. */
  since: string;
  cards: InactiveCards;
}) {
  const cache = usePageCache<Loaded>();
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const paging = usePaging(setPage);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  // Bumps each time a list lands; 0 means nothing for this list yet.
  const [settled, setSettled] = useState(0);
  // The size of the list last read, for the skeleton's row count.
  const [landed, setLanded] = useState<Landed | null>(null);
  const linesKey = lines.join(",");

  useEffect(() => setPage(1), [kind, query, linesKey]);
  // A new list or a new line selection gets the skeleton; a keystroke dims.
  useEffect(() => setSettled(0), [kind, linesKey]);

  useEffect(() => {
    let cancelled = false;
    const load = (pg: number) => api.inactive(token, kind, { page: pg, q: query, lines }, legacy);
    const keyFor = (pg: number) => [kind, pg, query, linesKey].join("|");
    const apply = (d: Loaded) => {
      setLanded({ tab: kind, query, lines: linesKey, matchType: "all", filter: "all", total: d.total });
      setData(d);
      setSettled((n) => n + 1);
    };
    const readAhead = (d: Loaded) => {
      if (!query && !d.trial && page * PAGE_SIZE < d.total) {
        cache.prefetch(keyFor(page + 1), () => load(page + 1));
      }
    };
    setError(null);
    setExpanded(null);
    const kept = cache.get(keyFor(page));
    if (kept) {
      apply(kept);
      setLoading(false);
      readAhead(kept);
      return;
    }
    setLoading(true);
    load(page)
      .then((d) => {
        cache.put(keyFor(page), d);
        if (cancelled) return;
        apply(d);
        readAhead(d);
      })
      .catch((e: Error) => !cancelled && setError(e.message || "Could not load this list."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // `lines` is read through linesKey: a new array with the same keys is
    // the same list.
  }, [token, kind, page, query, linesKey, legacy, cache]);

  const ready = settled > 0 && !error && data != null && data.kind === kind;
  const rows = ready ? data.rows : [];
  const trial = ready ? (data.trial ?? null) : null;
  const locked = Boolean(caps || trial);
  const noun = inactiveNoun(kind);
  const nounOne = inactiveNoun(kind, 1);
  const toggle = (key: string) => setExpanded((k) => (k === key ? null : key));

  const exportList = async (sink: CsvSink, progress: Progress, signal: AbortSignal): Promise<string> => {
    const lineText = (ls: unknown) =>
      (Array.isArray(ls) ? ls : [])
        .filter((l): l is { ssp_domain: string; publisher_id: string; relationship: string } => !!l && typeof l === "object")
        .map((l) => `${l.ssp_domain}, ${l.publisher_id}, ${l.relationship}`)
        .join("; ");
    // The workbook's Inactive sheet headers (run_export.py), parity audit
    // of #75; "Apps" as its publishers sheet says it.
    sink.header(
      kind === "publishers"
        ? ["Publisher domain", "Publisher", "Inactive since", "Reason", "Evidence", "Apps", "Line"]
        : ["App", "Store", "Bundle ID", "Publisher domain", "Publisher", "Inactive since", "Reason", "Evidence", "Line"],
    );
    await eachPage(
      (pg) => api.inactive(token, kind, { page: pg, q: query, lines, pageSize: READ_PAGE }, legacy),
      READ_PAGE,
      (page) =>
        sink.rows(
          kind === "publishers"
            ? (page as InactivePublisher[]).map((p) => [p.domain, p.name, p.inactive_since, reasonText(p), p.evidence_summary, p.apps, lineText(p.lines)])
            : (page as InactiveApp[]).map((a) => [
                a.name,
                storeName(a),
                a.bundle,
                a.publisher,
                a.publisher_name,
                a.inactive_since,
                reasonText(a),
                a.evidence_summary,
                lineText(a.lines),
              ]),
        ),
      progress,
      signal,
    );
    return csvName(kind === "publishers" ? "inactive publishers" : "inactive apps", query ? `search ${query}` : null);
  };

  return (
    <div data-testid="inactive-section">
      <div className="mb-3 space-y-2">
        <div role="tablist" aria-label="Inactive lists" className="flex flex-wrap items-center gap-2">
          {INACTIVE_KINDS.map((k) => {
            const on = k === kind;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setKind(k)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40",
                  on
                    ? "border-slate-300 bg-slate-100 text-slate-900"
                    : "border-border bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                )}
              >
                {LABEL[k]}
                <span className={cn("tabular-nums", on ? "text-slate-500" : "text-slate-400")}>
                  {counts[k].toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-slate-500">
          {intro(kind, since)} Not counted in your totals.
          {lines.length > 0 &&
            (kind === "apps"
              ? " Showing only apps whose publisher carries the selected lines."
              : " Showing only those with the selected lines.")}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${noun}`}
            aria-label={`Search ${noun}`}
            className="h-10 w-full rounded-full border border-border bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400/50"
          />
        </div>
        {/* EXPORT THIS LIST (David, 2026-10-27): every page of it. */}
        {ready && !loading && rows.length > 0 && !locked && <ExportListButton run={exportList} />}
        </div>
      </div>

      {/* The skeleton whenever the list waits for its rows, the first read
          and every search, page or list switch after it (David,
          2026-10-27), never last answer's rows dimmed. */}
      {loading && (
        <SkeletonRows
          rows={skeletonRowCount(
            expectedRows(
              { tab: kind, query, lines: linesKey, matchType: "all", filter: "all" },
              // The summary's whole counts answer the list unfiltered.
              { landed, known: { [knownKey("publishers", "all", "")]: counts.publishers, [knownKey("apps", "all", "")]: counts.apps } },
              page,
              PAGE_SIZE,
            ),
          )}
          label={`Loading ${noun}`}
        />
      )}
      {error && <p className="text-sm text-critical">{error}</p>}

      {ready && !loading && rows.length === 0 && (
        <div>
          {query ? (
            <EmptyResult query={query} noun={noun} />
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-slate-500">
              {!data?.available || counts.publishers + counts.apps === 0
                ? NOTHING_INACTIVE
                : lines.length > 0
                  ? `No ${noun} with the selected lines.`
                  : EMPTY[kind]}
            </p>
          )}
        </div>
      )}

      {ready && !loading && rows.length > 0 && !locked && (
        <Pager
          placement="top"
          anchorRef={paging.topRef}
          className="mb-3"
          page={page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPage={paging.onPage}
          noun={noun}
          nounOne={nounOne}
        />
      )}

      {ready && !loading && rows.length > 0 && (
        <div key={settled} className="animate-in fade-in space-y-3">
          {kind === "publishers" &&
            (rows as InactivePublisher[]).map((p, i) => {
              const key = `p:${p.developer_id ?? p.domain}`;
              return (
                <Settle key={key} index={i}>
                  <cards.Publisher pub={p} token={token} open={expanded === key} onToggle={() => toggle(key)} />
                </Settle>
              );
            })}
          {kind === "apps" &&
            (rows as InactiveApp[]).map((a, i) => {
              const key = `a:${a.store}:${a.bundle}`;
              return (
                <Settle key={key} index={i}>
                  <cards.App app={a} token={token} open={expanded === key} onToggle={() => toggle(key)} />
                </Settle>
              );
            })}
        </div>
      )}

      {ready && !loading && locked && (
        <LockedTail
          slice={trial}
          caps={caps}
          noun={noun}
          nounOne={nounOne}
          detail="inactive publisher and app, with the date and the reason"
        />
      )}
      {ready && !loading && rows.length > 0 && !locked && (
        <div className="mt-4">
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={data.total}
            onPage={paging.onPage}
            noun={noun}
            nounOne={nounOne}
          />
          {data.truncated && <TruncatedNotice shown={data.total} noun={noun} nounOne={nounOne} />}
        </div>
      )}
    </div>
  );
}
