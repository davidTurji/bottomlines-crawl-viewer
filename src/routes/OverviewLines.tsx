import type { ChangeGroup, ChangeGroupsPage, TrialCaps } from "@/lib/api";
import { HoverHint } from "@/components/HoverHint";
import { Pager, usePaging } from "@/components/ListControls";
import { Collapse, Settle } from "@/components/Motion";
import LockedTail from "@/components/LockedTail";
import { SkeletonRows } from "@/components/Skeleton";
import { gutterDigits, RowNote, RowText, SeatLinesFrame, SeatLinesHead, SeatLinesSkeleton } from "@/components/SeatLines";
import { useEffect, useMemo, useRef, useState } from "react";
import { PAGE_SIZE } from "@/lib/paging";
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
} from "lucide-react";
import {
  addedDates,
  certDates,
  removedDates,
  removalReasonText,
  unconfirmedDates,
  WEEKLY_READ_NOTE,
} from "@/lib/changeDates";

import { api, type LineEvent, type Summary, type TrialSlice } from "../lib/api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, scopeReasonText } from "@/lib/utils";
import { PublisherDomainLink } from "@/components/PublisherLinks";
import { MiniStat } from "@/components/MiniStat";
import { CountSkeleton, ListSearchRow, ListTabsRow, SeatLineRow } from "./CrawlReport";

/**
 * THE LINES VIEW OF THE OVERVIEW (David, 2026-10-27: "fold the Changes page
 * into the Overview as a third view: Publishers, Apps, Lines"). Everything
 * the Changes page had, as one of the Overview's lists: one card per line,
 * the publishers it moved on behind each card, the Added / Removed / Cert
 * changes / Started watching / Stopped watching / Unconfirmed tabs, the SSP
 * search, paging and the per-line export. The page's own KPI cards are gone:
 * the Overview's "This week's changes" card above says the same week. The
 * old /changes links land here (main.tsx).
 *
 * What follows is the Changes page's own account of the card, kept.
 */

/*
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

export type Bucket = "all" | EventKind;
/** What happened to a line between the two crawls.
 *
 *  The first three describe the WILD. The last two describe OUR WATCHLIST
 *  moving, which means the line was not comparable across the two weeks at
 *  all: we either started looking at it or stopped. They are separate
 *  kinds, not a footnote on "added", because a seat that joined the
 *  watchlist had always been out there and calling that an addition told
 *  the customer their market moved when only our attention did. */
export type EventKind =
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


/** The tab a Lines bucket is on the publishers and apps lists, and back
 *  (owner rule: the tab survives a view switch). */
export function bucketOfTab(tab: "all" | "added" | "removed" | "changed" | "inactive"): Bucket {
  return tab === "changed" ? "cert_changed" : tab === "inactive" ? "all" : tab;
}
export function tabOfBucket(bucket: Bucket): "all" | "added" | "removed" | "changed" {
  return bucket === "cert_changed" ? "changed" : bucket === "added" || bucket === "removed" ? bucket : "all";
}

/** What an empty bucket says (David, 2026-10-27: never "on this report"
 *  for a tab that is merely quiet this week). */
const EMPTY_BUCKET: Record<Bucket, string> = {
  all: "No line changes this week.",
  added: "No lines were added this week.",
  removed: "No lines were removed this week.",
  cert_changed: "No cert changes this week.",
  newly_monitored: "No lines started being watched this week.",
  monitoring_stopped: "No lines stopped being watched this week.",
  first_appearance: "No first appearances this week.",
  unconfirmed: "Every line was confirmed this week.",
};

export function LinesList({
  token,
  lines,
  summary,
  caps,
  bucket,
  setBucket,
}: {
  token: string;
  /** The seat-line filter (the page's, in the URL). */
  lines: string[];
  /** This week's summary, under the same filter. */
  summary: Summary;
  caps: TrialCaps | null;
  bucket: Bucket;
  setBucket: (b: Bucket) => void;
}) {
  // Which scope tabs this week earns, from the crawl-wide totals.
  const scopeTabs = useMemo<[EventKind, string][]>(() => {
    const t = summary.hero_diff?.line_totals;
    if (!t) return [];
    return (["newly_monitored", "monitoring_stopped"] as const)
      .filter((k) => (t[k] ?? 0) > 0)
      .map((k) => [k, TONES[k].label]);
  }, [summary]);
  // UNCONFIRMED (2026-10-20): its tab exists only while something is
  // unconfirmed; a page left on it falls back to All.
  const unconfirmedCount = summary.hero_diff?.line_totals?.unconfirmed ?? 0;
  const scopeOn = (k: Bucket) => scopeTabs.some(([s]) => s === k);
  useEffect(() => {
    if (bucket === "unconfirmed" && unconfirmedCount === 0) setBucket("all");
    if ((bucket === "newly_monitored" || bucket === "monitoring_stopped") && !scopeOn(bucket)) setBucket("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, unconfirmedCount, scopeTabs]);
  const [ssp, setSsp] = useState("");
  const [filter, setFilter] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setFilter(ssp.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [ssp]);
  const [result, setResult] = useState<ChangeGroupsPage | null>(null);
  const rows = result?.rows ?? [];
  const [trial, setTrial] = useState<TrialSlice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const paging = usePaging(setPage);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Bumps each time a list lands, so the new cards ease in as one piece.
  const [settled, setSettled] = useState(0);
  const isFirstCrawl = summary.previous_job_id === null;

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
      })
      .catch((e: Error) => !controller.signal.aborted && setError(changeErrorMessage(e)))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [token, filter, lines, bucket, page]);

  useEffect(() => setPage(1), [bucket, filter, lines]);
  // The skeleton whenever the list waits for its rows (David, 2026-10-27).
  const waiting = !error && (loading || result?.page !== page);
  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div>
      <div ref={paging.topRef} className="mb-3 space-y-2" data-tour="lines-controls">
        {/* THE NOTE SITS WITH THE TABS IT IS ABOUT. */}
        {!isFirstCrawl && scopeTabs.length > 0 && (
          <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-slate-500">
            <Eye aria-hidden className="mt-[3px] h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            <span>
              Lines you started or stopped watching are on their own tabs, and are not counted as
              added or removed: the publishers carrying them did not change.
            </span>
          </p>
        )}
        <ListTabsRow
          left={
            // ON A PHONE, A WEEK WITH SIX TABS IS WIDER THAN THE SCREEN: the
            // row scrolls sideways on its own, never the page.
            <div className="min-w-0 max-w-full overflow-x-auto">
              <Tabs value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
                <TabsList className="w-max max-w-none">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="added">Added</TabsTrigger>
                  <TabsTrigger value="removed">Removed</TabsTrigger>
                  <TabsTrigger value="cert_changed">Cert changes</TabsTrigger>
                  {scopeTabs.map(([kind, label]) => (
                    <TabsTrigger key={kind} value={kind}>
                      {label}
                    </TabsTrigger>
                  ))}
                  {!isFirstCrawl && unconfirmedCount > 0 && <TabsTrigger value="unconfirmed">Unconfirmed</TabsTrigger>}
                </TabsList>
              </Tabs>
            </div>
          }
          right={null}
        />
        {/* Why every removal carries two dates, said once where they are. */}
        {!isFirstCrawl && bucket === "removed" && (
          <p className="text-[12px] leading-relaxed text-slate-500">{WEEKLY_READ_NOTE}</p>
        )}
        <ListSearchRow
          query={ssp}
          setQuery={setSsp}
          placeholder="Filter by SSP domain"
          label="Filter by SSP domain"
          right={
            waiting ? (
              <CountSkeleton />
            ) : !error && total > 0 ? (
              <Pager
                placement="inline"
                page={safePage}
                pageSize={PAGE_SIZE}
                total={total}
                onPage={paging.onPage}
                noun="lines"
                nounOne="line"
              />
            ) : null
          }
        />
      </div>

      {waiting && <SkeletonRows rows={5} label="Loading line changes" />}
      {error && <p className="py-4 text-sm text-critical">{error}</p>}

      {/* An empty list has two very different causes and they must not share
          a sentence: a first crawl has nothing to compare against yet. */}
      {!waiting && !error && rows.length === 0 && isFirstCrawl && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <div className="text-sm font-medium text-slate-700">This is your first crawl</div>
          <p className="mx-auto mt-1 max-w-lg text-[13px] leading-relaxed text-slate-500">
            There is no earlier week to compare against yet, so nothing is listed here. Everything found
            this week becomes the baseline, and the next crawl will show what moved against it.
          </p>
        </div>
      )}
      {!waiting && !error && rows.length === 0 && !isFirstCrawl && (
        <p
          data-empty-list
          className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-slate-600"
        >
          {filter ? `No line changes match "${filter}".` : EMPTY_BUCKET[bucket]}
        </p>
      )}

      {!waiting && !error && rows.length > 0 && (
        <div key={settled} className="animate-in fade-in space-y-3">
          {rows.map((g, i) => (
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

      {!waiting && (caps || trial) && (
        <LockedTail
          slice={trial}
          caps={caps}
          noun="line changes"
          detail="change, on every publisher, week after week"
        />
      )}
      {!waiting && total > PAGE_SIZE && (
        <div className="mt-4">
          <Pager page={safePage} pageSize={PAGE_SIZE} total={total} onPage={paging.onPage} noun="lines" />
        </div>
      )}
    </div>
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
  // ONE ROW PER PUBLISHER (2026-10-27): a publisher whose file and
  // partners carry the line comes once, its partners beside it.
  const roster = useMemo(() => {
    const out: { event: LineEvent; partners: string[]; own: boolean }[] = [];
    const byKey = new Map<string, (typeof out)[number]>();
    for (const p of publishers) {
      const key = `${p.developer_id}|${p.file_kind}`;
      const partner = p.match_type === "ipd" && p.ipd_partner ? p.ipd_partner : null;
      let r = byKey.get(key);
      if (!r) {
        r = { event: p, partners: [], own: partner === null };
        byKey.set(key, r);
        out.push(r);
      } else if (partner === null && !r.own) {
        r.event = p;
        r.own = true;
      }
      if (partner && !r.partners.includes(partner)) r.partners.push(partner);
    }
    return out;
  }, [publishers]);
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
                {roster.map(({ event: p, partners, own }, i) => (
                  // Click the row: the line is copied and this publisher's
                  // file opens at it (David, 2026-10-06); a line that has
                  // left the file copies, and its file opens from the margin
                  // (as on the Overview). A line an inventory partner carries
                  // opens THAT partner's ads.txt, the partners named beside
                  // it. The domain itself links to their site.
                  <SeatLineRow
                    key={`${p.developer_id}|${p.file_kind}|${i}`}
                    partners={partners}
                    own={own}
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
