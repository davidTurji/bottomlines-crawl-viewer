import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { FOLD_OPEN, useFoldedList } from "@/components/FoldedList";
import { Collapse } from "@/components/Motion";
import { PublisherDomainLink } from "@/components/PublisherLinks";
import { api, type MatchedMoves, type MoveRow, type MovesPage } from "@/lib/api";
import { cn, storeLabel } from "@/lib/utils";

/**
 * WHY A PUBLISHER WAS FOUND OR LOST WHEN NO LINE MOVED (David, 2026-11-04).
 *
 * A publisher that stops naming its inventory partner loses every app the
 * partner covered, while the reader's line stays in the partner's ads.txt:
 * apps lost, 0 lines removed (stackup-ai.com, crawl 64: denverpost.com
 * stopped naming wurl.com, 23 apps gone, tiles said "0 lost"). The tiles
 * now count those publishers; this says why in one short line under them,
 * and "See them" opens every publisher found and lost, each with its
 * reason and every app it carried (first 5, then "Show all").
 *
 * Shown only when the report counted a partner move: an older report, a
 * filtered view (found / lost are not computed under a line filter) or a
 * week with no partner move shows nothing, as before.
 */
export function MovesQuietLine({ moves, token }: { moves: MatchedMoves | null; token: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const said = movesSentence(moves);
  if (!said) return null;
  return (
    <div data-testid="moves-quiet">
      <p className="mt-2 text-[12px] leading-snug text-slate-500">
        {said}{" "}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary/40"
        >
          {open ? "Hide them" : "See them"}
        </button>
      </p>
      <Collapse open={open} id={panelId}>
        {open && <MovesPanel token={token} />}
      </Collapse>
    </div>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** "4 publishers and 23 apps were lost because ..." or null. */
export function movesSentence(moves: MatchedMoves | null): string | null {
  if (!moves) return null;
  const dropped = moves.developers.partner_dropped ?? 0;
  const found = moves.developers.partner_found ?? 0;
  const parts: string[] = [];
  if (dropped > 0) {
    const apps = moves.apps?.partner_dropped;
    const who = apps == null
      ? plural(dropped, "publisher was", "publishers were")
      : `${plural(dropped, "publisher", "publishers")} and ${plural(apps, "app", "apps")} were`;
    parts.push(`${who} lost because the publisher stopped naming its inventory partner. No line was removed.`);
  }
  if (found > 0) {
    const apps = moves.apps?.partner_found;
    const who = apps == null
      ? plural(found, "publisher was", "publishers were")
      : `${plural(found, "publisher", "publishers")} and ${plural(apps, "app", "apps")} were`;
    parts.push(`${who} found through an inventory partner.`);
  }
  return parts.length ? parts.join(" ") : null;
}

const PANEL_PAGE = 50;

type Side = { rows: MoveRow[]; total: number; page: number; loading: boolean; failed: boolean; available: boolean };

const EMPTY: Side = { rows: [], total: 0, page: 0, loading: true, failed: false, available: true };

/** Every publisher found and lost, lost first (that is the news to act on). */
function MovesPanel({ token }: { token: string }) {
  const [lost, setLost] = useState<Side>(EMPTY);
  const [found, setFound] = useState<Side>(EMPTY);

  const load = (side: "lost" | "found", page: number) => {
    const set = side === "lost" ? setLost : setFound;
    set((s) => ({ ...s, loading: true, failed: false }));
    api
      .moves(token, side, { page, pageSize: PANEL_PAGE })
      .then((p: MovesPage) =>
        set((s) => ({
          rows: page === 1 ? p.rows ?? [] : [...s.rows, ...(p.rows ?? [])],
          total: p.total ?? 0,
          page,
          loading: false,
          failed: false,
          available: p.available,
        })),
      )
      .catch(() => set((s) => ({ ...s, loading: false, failed: true })));
  };

  useEffect(() => {
    load("lost", 1);
    load("found", 1);
    // Loaded once per opening; the report is frozen.
  }, [token]);

  if (!lost.loading && !found.loading && !lost.available && !found.available) {
    return (
      <p className="mt-2 text-[12px] text-slate-500">
        This report was built before it kept the list of publishers found and lost.
      </p>
    );
  }
  return (
    <div data-testid="moves-panel" className="mt-3 max-h-[32rem] space-y-4 overflow-y-auto overscroll-contain rounded-lg border border-border bg-white p-3">
      <MovesSide title="Lost" tone="lost" side={lost} onMore={() => load("lost", lost.page + 1)} />
      <MovesSide title="Found" tone="found" side={found} onMore={() => load("found", found.page + 1)} />
    </div>
  );
}

function MovesSide({
  title,
  tone,
  side,
  onMore,
}: {
  title: string;
  tone: "lost" | "found";
  side: Side;
  onMore: () => void;
}) {
  if (!side.available) return null;
  if (side.loading && side.rows.length === 0) {
    return <p className="text-[12px] text-slate-400">Loading {title.toLowerCase()} publishers</p>;
  }
  if (side.failed && side.rows.length === 0) {
    return <p className="text-[12px] text-slate-500">The {title.toLowerCase()} publishers could not load. Open this again in a moment.</p>;
  }
  if (side.total === 0) return null;
  return (
    <section data-moves-side={tone}>
      <h3 className="mb-1.5 flex items-baseline gap-1.5 text-[12px] font-medium text-slate-700">
        {title}
        <span className={cn("tabular-nums", tone === "lost" ? "text-critical" : "text-ok")}>
          {plural(side.total, "publisher", "publishers")}
        </span>
      </h3>
      <ul className="divide-y divide-border rounded-md border border-border">
        {side.rows.map((r) => (
          <MoveCard key={`${tone}:${r.developer_id}`} row={r} />
        ))}
      </ul>
      {side.rows.length < side.total && (
        <button
          type="button"
          onClick={onMore}
          disabled={side.loading}
          className="mt-1.5 w-full rounded-md border border-border px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-muted/60 disabled:opacity-60"
        >
          {side.loading
            ? "Loading"
            : `Showing ${side.rows.length.toLocaleString()} of ${side.total.toLocaleString()} publishers, show more`}
        </button>
      )}
    </section>
  );
}

function MoveCard({ row }: { row: MoveRow }) {
  const apps = row.apps ?? [];
  const fold = useFoldedList(apps.length);
  const listId = useId();
  const shown = apps.slice(0, fold.rows);
  const label = row.name && row.name.toLowerCase() !== row.domain.toLowerCase() ? row.name : undefined;
  return (
    <li data-move-row={row.how} className="px-3 py-2">
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span className="min-w-0 truncate font-medium text-slate-800">
          {row.domain ? <PublisherDomainLink domain={row.domain} arrow={false} /> : row.name}
          {label && <span className="ml-1.5 font-normal text-slate-400">{label}</span>}
        </span>
        <span className="flex-shrink-0 tabular-nums text-[11px] text-slate-500">
          {row.apps == null ? "" : plural(apps.length, "app", "apps")}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{row.reason}</p>
      {row.partners.length > 3 && (
        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{row.partners.join(", ")}</p>
      )}
      {apps.length > 0 && (
        <div className="mt-1.5 overflow-hidden rounded border border-border">
          <div
            ref={fold.scroller}
            id={listId}
            className={cn(fold.open && fold.folds && "max-h-[16rem] overflow-y-auto overscroll-contain")}
          >
            <ul className="divide-y divide-border">
              {shown.map(([store, bundle, name], i) => (
                <li key={`${store}:${bundle}:${i}`} className="flex items-baseline gap-3 px-2.5 py-1 text-[11px]">
                  <span className="min-w-0 flex-1 truncate text-slate-700">{name || bundle}</span>
                  <span className="flex-shrink-0 text-slate-400">{storeLabel(store)}</span>
                  <code className="max-w-[40%] flex-shrink truncate font-mono text-[10px] text-slate-400">{bundle}</code>
                </li>
              ))}
            </ul>
            {fold.open && fold.drawn < apps.length && (
              <button
                ref={fold.more}
                type="button"
                onClick={fold.drawMore}
                className="w-full border-t border-border px-2.5 py-1 text-[11px] text-slate-500 hover:bg-muted/60"
              >
                Showing {fold.drawn.toLocaleString()} of {apps.length.toLocaleString()} apps, scroll for more
              </button>
            )}
          </div>
          {fold.folds && (
            <button
              type="button"
              aria-expanded={fold.open}
              aria-controls={listId}
              onClick={fold.toggle}
              className="flex w-full items-center justify-center gap-1 border-t border-border px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-muted/60"
            >
              <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform", fold.open && "rotate-180")} />
              {fold.open ? `Show the first ${FOLD_OPEN}` : `Show all ${apps.length.toLocaleString()} apps`}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
