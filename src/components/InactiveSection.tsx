import { ChevronDown, ListX, Search, Smartphone } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Dots } from "@/components/Dots";
import { EmptyResult, Pager, TruncatedNotice, usePaging } from "@/components/ListControls";
import LockedTail from "@/components/LockedTail";
import { MiniStat } from "@/components/MiniStat";
import { Collapse, Settle } from "@/components/Motion";
import { SkeletonRows } from "@/components/Skeleton";
import {
  api,
  type GoneInventory,
  type InactiveApp,
  type InactiveCounts,
  type InactiveKind,
  type InactiveLine,
  type InactivePage,
  type InactivePublisher,
  type TrialCaps,
} from "@/lib/api";
import { INACTIVE_KINDS, inactiveDay, inactiveNoun, lineText, reasonText } from "@/lib/inactive";
import { usePageCache } from "@/lib/pageCache";
import { PAGE_SIZE } from "@/lib/paging";
import { cn, foundInLabel, storeLabel } from "@/lib/utils";

/**
 * THE INACTIVE TAB of the matched list (David, 2026-10-08), which replaced
 * No longer live. Nothing is deleted: a publisher whose site died, an app
 * its store stopped listing and a seat line that ended are kept here with
 * the date and the reason, and the evidence behind it. The lists above and
 * the headline numbers count active only.
 *
 * Three lists, Publishers, Apps and Lines, on the cards No longer live
 * used (the matched cards' shape, tinted red, David 2026-10-07). Searched
 * and paged on the server like the matched lists, the same pager, the same
 * locked tail on a trial. Which list is open is the page's, so it survives
 * switching between the publishers and apps views.
 */

const LABEL: Record<InactiveKind, string> = { publishers: "Publishers", apps: "Apps", lines: "Lines" };

const INTRO: Record<InactiveKind, string> = {
  publishers:
    "Publishers that carried your seat lines and stopped counting, for example the domain is gone or the site stopped answering.",
  apps: "Apps that carried your seat lines and that their store no longer lists, checked more than once.",
  lines: "Seat lines a publisher no longer carries: removed from its file, or the whole file is gone.",
};

const EMPTY: Record<InactiveKind, string> = {
  publishers: "No inactive publishers. Every publisher with your lines is still live.",
  apps: "No inactive apps. Every app with your lines is still in its store.",
  lines: "No inactive lines. Every line we matched is still in its file.",
};

type Loaded = InactivePage;

export default function InactiveSection({
  token,
  lines,
  caps,
  counts,
  kind,
  setKind,
  legacy,
}: {
  token: string;
  /** The seat-line filter: narrows publishers and lines, never apps. */
  lines: string[];
  /** The trial's caps, on a trial: the unlock card stands on every list. */
  caps: TrialCaps | null;
  /** Whole counts for the three switches (the summary's). */
  counts: InactiveCounts;
  /** Owned by the page, so the open list survives a view switch. */
  kind: InactiveKind;
  setKind: (kind: InactiveKind) => void;
  /** The summary's No longer live block: what an older API's report is
   *  built from when it has no /inactive route. */
  legacy: GoneInventory | null | undefined;
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
  const linesKey = lines.join(",");

  useEffect(() => setPage(1), [kind, query, linesKey]);
  // A new list or a new line selection gets the skeleton; a keystroke dims.
  useEffect(() => setSettled(0), [kind, linesKey]);

  useEffect(() => {
    let cancelled = false;
    const load = (pg: number) => api.inactive(token, kind, { page: pg, q: query, lines }, legacy);
    const keyFor = (pg: number) => [kind, pg, query, linesKey].join("|");
    const apply = (d: Loaded) => {
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
  const fromGone = ready && data.derived_from === "gone";
  const noun = inactiveNoun(kind);
  const toggle = (key: string) => setExpanded((k) => (k === key ? null : key));

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
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-critical/30",
                  on
                    ? "border-critical-border bg-critical-bg text-critical"
                    : "border-border bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                )}
              >
                {LABEL[k]}
                <span className={cn("tabular-nums", on ? "text-critical/70" : "text-slate-400")}>
                  {counts[k].toLocaleString()}
                </span>
              </button>
            );
          })}
          {loading && settled > 0 && <Dots />}
        </div>
        <p className="text-sm text-slate-500">
          {INTRO[kind]} Not counted in your totals.
          {lines.length > 0 &&
            (kind === "apps"
              ? " Apps carry no seat line, so all of them show whatever lines you select."
              : " Showing only those with the selected lines.")}
        </p>
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${noun}`}
            aria-label={`Search ${noun}`}
            className="h-10 w-full rounded-full border border-border bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-critical/30"
          />
        </div>
      </div>

      {loading && settled === 0 && <SkeletonRows rows={4} label={`Loading ${noun}`} />}
      {error && <p className="text-sm text-critical">{error}</p>}

      {ready && rows.length === 0 && (
        <div className={cn("transition-opacity duration-300", loading && "opacity-60")}>
          {query ? (
            <EmptyResult query={query} noun={noun} />
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-slate-500">
              {kind === "lines" && (fromGone || !data?.available)
                ? "This report was made before ended lines were kept. Newer reports list them here."
                : lines.length > 0 && kind !== "apps"
                  ? `No ${noun} with the selected lines.`
                  : EMPTY[kind]}
            </p>
          )}
        </div>
      )}

      {ready && rows.length > 0 && !locked && (
        <Pager
          placement="top"
          anchorRef={paging.topRef}
          className="mb-3"
          page={page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPage={paging.onPage}
          noun={noun}
        />
      )}

      {ready && rows.length > 0 && (
        <div
          key={settled}
          className={cn(
            "animate-in fade-in space-y-3 transition-opacity duration-300 ease-out",
            loading && "opacity-60",
          )}
        >
          {kind === "publishers" &&
            (rows as InactivePublisher[]).map((p, i) => {
              const key = `p:${p.developer_id ?? p.domain}`;
              return (
                <Settle key={key} index={i}>
                  <PublisherCard pub={p} open={expanded === key} onToggle={() => toggle(key)} />
                </Settle>
              );
            })}
          {kind === "apps" &&
            (rows as InactiveApp[]).map((a, i) => {
              const key = `a:${a.store}:${a.bundle}`;
              return (
                <Settle key={key} index={i}>
                  <AppCard app={a} open={expanded === key} onToggle={() => toggle(key)} />
                </Settle>
              );
            })}
          {kind === "lines" &&
            (rows as InactiveLine[]).map((l, i) => {
              const key = `l:${i}:${l.publisher}:${l.file}:${lineText(l)}:${l.ended_at}`;
              return (
                <Settle key={key} index={i}>
                  <LineCard line={l} open={expanded === key} onToggle={() => toggle(key)} />
                </Settle>
              );
            })}
        </div>
      )}

      {ready && locked && (
        <LockedTail
          slice={trial}
          caps={caps}
          noun={noun}
          detail="inactive publisher, app and line, with the date and the reason"
        />
      )}
      {ready && rows.length > 0 && !locked && (
        <div className="mt-4">
          <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={paging.onPage} noun={noun} />
          {data.truncated && <TruncatedNotice shown={data.total} noun={noun} />}
        </div>
      )}
    </div>
  );
}

/** The right-hand "Inactive since" column, in the matched cards' rhythm. */
function Since({ iso }: { iso: string | null | undefined }) {
  return (
    <div className="w-[112px]">
      <div className="text-[10px] font-medium tracking-wide text-slate-500">Inactive since</div>
      <div className="font-mono text-sm tabular-nums text-critical">{inactiveDay(iso) ?? "—"}</div>
    </div>
  );
}

/** Under the reason on a phone, where the right-hand column is hidden. */
function SinceInline({ iso }: { iso: string | null | undefined }) {
  const d = inactiveDay(iso);
  if (!d) return null;
  return <div className="truncate text-[11px] text-critical sm:hidden">Inactive since {d}</div>;
}

/** The evidence, quiet, one line on the card face. */
function Evidence({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <div className="text-[11px] text-slate-400 sm:truncate">{text}</div>;
}

/** One titled box inside an open card: the matched cards' line window. */
function Window({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-critical-border bg-white shadow-sm">
      <div className="flex items-baseline justify-between gap-2 border-b border-critical-border bg-critical-bg/60 px-3 py-1.5">
        <span className="text-xs font-medium text-critical">{title}</span>
        {count != null && (
          <span className="font-mono text-[11px] font-semibold tabular-nums text-critical">{count}</span>
        )}
      </div>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

/** A label and its value on one row of a Window. Long values wrap. */
function Fact({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3 px-3 py-1.5">
      <span className="flex-shrink-0 text-[11px] text-slate-500">{label}</span>
      <span
        className={cn(
          "min-w-0 break-words text-right text-[11px] text-slate-800",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </span>
    </li>
  );
}

/** Shell shared by the three cards: the matched card's shape, red wash. */
function Card({
  label,
  open,
  onToggle,
  face,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  face: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-critical-border bg-gradient-to-r from-critical-bg/80 via-white to-white shadow-sm transition-shadow",
        open && "shadow-md",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} details of ${label}`}
        className="flex w-full items-center gap-3 rounded-t-3xl px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-critical/30 sm:gap-4 sm:px-5"
      >
        {face}
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 flex-shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>
      <Collapse open={open}>
        <div className="border-t border-critical-border bg-critical-bg/20 px-4 pb-4 pt-3 sm:px-5">{children}</div>
      </Collapse>
    </div>
  );
}

function Disc({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-critical-bg text-base font-semibold text-critical ring-1 ring-critical-border sm:h-11 sm:w-11">
      {children}
    </div>
  );
}

function PublisherCard({ pub, open, onToggle }: { pub: InactivePublisher; open: boolean; onToggle: () => void }) {
  const named = Boolean(pub.name && pub.name !== pub.domain);
  const initial = (pub.name || pub.domain || "?").replace(/^www\./i, "").charAt(0).toUpperCase() || "?";
  const reason = reasonText(pub);
  const seatLines = pub.lines ?? [];
  return (
    <Card
      label={pub.name || pub.domain}
      open={open}
      onToggle={onToggle}
      face={
        <>
          <Disc>{initial}</Disc>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold tracking-tight text-slate-900">
              {named ? pub.name : pub.domain}
            </div>
            <div className="text-xs text-slate-500 sm:truncate">
              {named && <span>{pub.domain}, </span>}
              <span className="text-critical">{reason}</span>
            </div>
            <SinceInline iso={pub.inactive_since} />
            <Evidence text={pub.evidence_summary} />
          </div>
          <div className="hidden items-center gap-6 text-right sm:flex">
            <div className="w-[84px]">
              <MiniStat label="Your lines" value={seatLines.length} emphasis />
            </div>
            <div className="w-[64px]">
              <MiniStat label="Apps" value={pub.apps ?? 0} />
            </div>
            <Since iso={pub.inactive_since} />
          </div>
        </>
      }
    >
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Window title="Your seat lines it carried" count={seatLines.length}>
          {seatLines.length === 0 ? (
            <li className="px-3 py-1.5 text-[11px] text-slate-500">None listed.</li>
          ) : (
            seatLines.map((l, i) => {
              const where = foundInLabel(l.file);
              const last = inactiveDay(l.last_seen);
              return (
                <li key={`${lineText(l)}:${l.file ?? ""}:${i}`} className="px-3 py-1.5">
                  <code className="block truncate font-mono text-[11px] tabular-nums text-slate-800">
                    {lineText(l)}
                  </code>
                  {(where || last) && (
                    <span className="block truncate text-[10px] text-slate-500">
                      {[where, last && `last seen ${last}`].filter(Boolean).join(", ")}
                    </span>
                  )}
                </li>
              );
            })
          )}
        </Window>
        <Window title="Why it is inactive">
          <Fact label="Reason" value={reason} />
          {pub.evidence_summary && <Fact label="Evidence" value={pub.evidence_summary} />}
          <Fact label="Publisher" value={pub.domain} mono />
          <Fact label="Inactive since" value={inactiveDay(pub.inactive_since) ?? "—"} />
          {pub.apps != null && <Fact label="Apps with it" value={pub.apps.toLocaleString()} mono />}
        </Window>
      </div>
    </Card>
  );
}

function AppCard({ app, open, onToggle }: { app: InactiveApp; open: boolean; onToggle: () => void }) {
  const reason = reasonText(app);
  const fronts = app.evidence?.storefronts_checked ?? [];
  const http = app.evidence?.http_status;
  const pending = app.confirmed === false;
  return (
    <Card
      label={app.name || app.bundle}
      open={open}
      onToggle={onToggle}
      face={
        <>
          <Disc>
            <Smartphone aria-hidden className="h-5 w-5" />
          </Disc>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-base font-semibold tracking-tight text-slate-900">
                {app.name || app.bundle}
              </span>
              <span className="flex-shrink-0 rounded-full border border-critical-border bg-critical-bg px-1.5 py-px text-[10px] font-medium text-critical">
                {storeLabel(app.store)}
              </span>
              {pending && (
                <span className="hidden flex-shrink-0 rounded-full border border-border bg-white px-1.5 py-px text-[10px] font-medium text-slate-500 sm:inline">
                  Awaiting review
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 sm:truncate">
              {/* A trial does not name the publisher (the crawler sends ""). */}
              {app.publisher && (
                <>
                  publisher: <span className="text-slate-600">{app.publisher}</span>,{" "}
                </>
              )}
              <span className="text-critical">{reason}</span>
            </div>
            <SinceInline iso={app.inactive_since} />
            <Evidence text={app.evidence_summary} />
          </div>
          <div className="hidden items-center gap-6 text-right sm:flex">
            <Since iso={app.inactive_since} />
          </div>
        </>
      }
    >
      <div className="sm:max-w-[60%]">
        <Window title="Why it is inactive">
          <Fact label="Reason" value={reason} />
          {app.evidence_summary && <Fact label="Evidence" value={app.evidence_summary} />}
          {fronts.length > 0 && <Fact label="Checked in" value={fronts.join(", ")} mono />}
          {http != null && <Fact label="The store answered" value={String(http)} mono />}
          {pending && <Fact label="Status" value="Gone twice at the store, awaiting our review" />}
          <Fact label="Store" value={storeLabel(app.store)} />
          <Fact label="Store id" value={app.bundle} mono />
          {app.publisher && (
            <Fact
              label="Publisher"
              value={app.publisher_inactive ? `${app.publisher} (inactive too)` : app.publisher}
              mono
            />
          )}
          <Fact label="Inactive since" value={inactiveDay(app.inactive_since) ?? "—"} />
        </Window>
      </div>
    </Card>
  );
}

function LineCard({ line, open, onToggle }: { line: InactiveLine; open: boolean; onToggle: () => void }) {
  const reason = reasonText(line);
  const where = foundInLabel(line.file);
  const who = line.publisher_name && line.publisher_name !== line.publisher ? line.publisher_name : null;
  return (
    <Card
      label={lineText(line)}
      open={open}
      onToggle={onToggle}
      face={
        <>
          <Disc>
            <ListX aria-hidden className="h-5 w-5" />
          </Disc>
          <div className="min-w-0 flex-1">
            <code className="block truncate font-mono text-sm font-semibold tabular-nums text-slate-900">
              {lineText(line)}
            </code>
            <div className="text-xs text-slate-500 sm:truncate">
              {line.publisher && (
                <>
                  <span className="text-slate-600">{line.publisher}</span>,{" "}
                </>
              )}
              <span className="text-critical">{reason}</span>
            </div>
            <SinceInline iso={line.ended_at} />
            {where && <div className="truncate text-[11px] text-slate-400">{where}</div>}
          </div>
          <div className="hidden items-center gap-6 text-right sm:flex">
            <Since iso={line.ended_at} />
          </div>
        </>
      }
    >
      <div className="sm:max-w-[60%]">
        <Window title="Why it is inactive">
          <Fact label="Reason" value={reason} />
          {line.publisher && (
            <Fact
              label="Publisher"
              value={
                <>
                  {who && <span className="font-sans">{who}, </span>}
                  {line.publisher}
                  {line.publisher_inactive && <span className="font-sans"> (inactive)</span>}
                </>
              }
              mono
            />
          )}
          {line.file && <Fact label="File" value={line.file} mono />}
          {line.http_status != null && <Fact label="The site answered" value={String(line.http_status)} mono />}
          <Fact label="First seen" value={inactiveDay(line.first_seen) ?? "—"} />
          <Fact label="Last seen" value={inactiveDay(line.last_seen) ?? "—"} />
          <Fact label="Inactive since" value={inactiveDay(line.ended_at) ?? "—"} />
        </Window>
      </div>
    </Card>
  );
}
