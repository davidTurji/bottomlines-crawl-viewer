import { FilterBar, FilterSearch } from "@/components/FilterBar";
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
import { inactiveNoun, reasonText } from "@/lib/inactive";
import { csvName, ExportListButton, type CsvSink } from "@/components/ExportList";
import { eachPage, READ_PAGE, type Progress } from "@/lib/scopeRows";
import { usePageCache } from "@/lib/pageCache";
import { PAGE_SIZE } from "@/lib/paging";
import { storeName } from "@/lib/utils";

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


/** The intro over each list; `since` is "since Aug 18, 2026" or "since the
 *  compared crawl". */
function intro(kind: InactiveKind, since: string): string {
  return kind === "publishers"
    ? `Publishers that went inactive ${since}.`
    : `Apps no longer listed in stores ${since}.`;
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
  /** Whole counts for the two inventory views (the summary's). */
  counts: InactiveCounts;
  /** Follows the main Matched publishers / Matched apps view. */
  kind: InactiveKind;
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
        <p className="text-sm text-slate-500">
          {intro(kind, since)} Excluded from matched totals.
          {lines.length > 0 &&
            (kind === "apps"
              ? " Showing only apps whose publisher carries the selected lines."
              : " Showing only those with the selected lines.")}
        </p>
        <div ref={paging.topRef}>
          <FilterBar actions={ready && !loading && rows.length > 0 && !locked ? <ExportListButton run={exportList} noun={kind} status="inactive" query={query} filtered={lines.length > 0} /> : null}>
            <FilterSearch value={query} onChange={setQuery} placeholder={`Search ${noun}`} />
            {ready && !loading && rows.length > 0 && !locked && <>
              <Pager placement="inline" className="list-toolbar-pager" page={page} pageSize={PAGE_SIZE}
                total={data.total} onPage={paging.onPage} noun={noun} nounOne={nounOne} />
            </>}
          </FilterBar>
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
