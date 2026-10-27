/**
 * HOW MANY ROWS A LIST WILL LAND WITH, when the page already knows
 * (re-review of #75: a tab, a Popular choice or a search drew a full
 * screen of skeleton rows for a list that landed with 2). Every count the
 * page holds is tried, the one that answers this exact list first:
 *
 *   - a page of the list already read (a page change): its total;
 *   - one switch moved from the list on screen: that list's own split
 *     (its match type pills, its Found in or Platform pills, its change
 *     counts for the tabs);
 *   - counts read for the Popular choices (no search, no switch);
 *   - a search that narrows the last one: no more than that list had.
 *
 * Null when nothing known answers: the skeleton then fills the screen.
 */

/** What makes a list: its tab, search, line filter, match type and its
 *  own switch (Found in on publishers, Platform on apps). */
export type ListShape = { tab: string; query: string; lines: string; matchType: string; filter: string };

/** The list last landed, with its total. */
export type Landed = ListShape & { total: number };

export type KnownCounts = {
  landed: Landed | null;
  /** The landed list's split by match type, by its switch, by change. */
  typeCounts?: Partial<Record<string, number>> | null;
  filterCounts?: Partial<Record<string, number>> | null;
  changeCounts?: Partial<Record<string, number>> | null;
  /** The name a tab is counted under in `changeCounts`. */
  changeOf?: (tab: string) => string | undefined;
  /** Counts read elsewhere (the Popular choices), by `knownKey`, for the
   *  list with no search and its switch on All. */
  known?: Record<string, number> | null;
};

/** The key of a count in `KnownCounts.known`. */
export function knownKey(tab: string, matchType: string, lines: string): string {
  return `${tab}|${matchType}|${lines}`;
}

const KEYS: (keyof ListShape)[] = ["tab", "query", "lines", "matchType", "filter"];
const sameBut = (a: ListShape, b: ListShape, but?: keyof ListShape) => KEYS.every((k) => k === but || a[k] === b[k]);
const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** The rows the list will show on `page` (a page change of the list on
 *  screen), or on its first page (any other change, which starts the list
 *  over), or null when nothing known answers. */
export function expectedRows(now: ListShape, k: KnownCounts, page: number, pageSize: number): number | null {
  const l = k.landed;
  if (l && sameBut(now, l)) return Math.max(0, Math.min(pageSize, l.total - (page - 1) * pageSize));
  const t = expectedTotal(now, k);
  return t === null ? null : Math.min(pageSize, t);
}

export function expectedTotal(now: ListShape, k: KnownCounts): number | null {
  const l = k.landed;
  if (l && sameBut(now, l)) return l.total;
  if (l && sameBut(now, l, "matchType")) {
    const n = count(k.typeCounts?.[now.matchType]);
    if (n !== null) return n;
  }
  if (l && sameBut(now, l, "filter")) {
    const n = count(k.filterCounts?.[now.filter]);
    if (n !== null) return n;
  }
  if (l && sameBut(now, l, "tab") && k.changeOf) {
    const c = k.changeOf(now.tab);
    const n = c ? count(k.changeCounts?.[c]) : null;
    if (n !== null) return n;
  }
  if (!now.query && now.filter === "all") {
    const n = count(k.known?.[knownKey(now.tab, now.matchType, now.lines)]);
    if (n !== null) return n;
  }
  if (l && sameBut(now, l, "query") && now.query.toLowerCase().includes(l.query.toLowerCase())) return l.total;
  return null;
}
