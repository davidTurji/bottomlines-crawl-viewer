import type { DiscoveredLine } from "./api";

/**
 * ORDERING FOR DISCOVERED LINES.
 *
 * Lives in its own module because two very different callers need the same
 * order and must not be allowed to drift apart:
 *
 *   1. The mock endpoint (src/lib/mockData.ts), which sorts the whole pool
 *      before it slices a page, standing in for the ORDER BY the real
 *      endpoint owes us (documented on api.discoveredLines).
 *   2. The page's local sort control (src/routes/CrawlDiscovered.tsx),
 *      which re-sorts the rows it has already loaded.
 *
 * Because the default sort here IS the endpoint's order, choosing it in the
 * control is a no-op rather than a second, conflicting opinion about the
 * list. Every other option is a genuinely local reordering, and the page
 * says so on screen.
 */

/**
 * A line's week-over-week move, as a number the comparators can use.
 * `null` means the line is NEW: it has no previous week, so it has no delta,
 * and ranking it against a number would be inventing data.
 */
export function deltaValue(l: DiscoveredLine): number | null {
  if (l.previous_placements_count == null) return null;
  return l.placements_count - l.previous_placements_count;
}

/**
 * The full four-tuple identity, in order, as the final tiebreak. The brief
 * asked for ssp_domain then publisher_id; relationship and cert_id are
 * appended because those two alone are NOT unique (a publisher rotating a
 * cert is two distinct lines with the same ssp_domain and publisher_id) and
 * a comparator that ties on real rows is not a total order, which is exactly
 * how rows go missing or repeat across a paged list.
 */
function byIdentity(a: DiscoveredLine, b: DiscoveredLine): number {
  return (
    a.ssp_domain.localeCompare(b.ssp_domain) ||
    a.publisher_id.localeCompare(b.publisher_id) ||
    a.relationship.localeCompare(b.relationship) ||
    a.cert_id.localeCompare(b.cert_id)
  );
}

/** Widest line first. The old default, still what "Most publishers" means. */
function byCount(a: DiscoveredLine, b: DiscoveredLine): number {
  return b.placements_count - a.placements_count;
}

/**
 * THE DEFAULT ORDER, in three bands:
 *
 *   band 0  new this week      → no previous count, so no delta; ranked
 *                                among themselves by placements_count DESC
 *   band 1  grew this week     → delta DESC (+29 above +18 above +2),
 *                                then placements_count DESC
 *   band 2  flat or shrank     → placements_count DESC
 *
 * The reasoning is the reason the page exists: a weekly crawl is opened to
 * find out what changed, and a line that did not exist seven days ago is the
 * largest possible change. A line that merely got wider is the next largest.
 * Everything that held still or receded is the standing picture, and the
 * standing picture is best read widest-first, which is the order this page
 * has always used.
 */
export function compareDefault(a: DiscoveredLine, b: DiscoveredLine): number {
  const da = deltaValue(a);
  const db = deltaValue(b);
  const bandOf = (d: number | null) => (d == null ? 0 : d > 0 ? 1 : 2);
  const ba = bandOf(da);
  const bb = bandOf(db);
  if (ba !== bb) return ba - bb;
  // Inside the growth band the size of the move leads; everywhere else
  // there is no move to rank by, so width does.
  if (ba === 1 && da !== db) return (db as number) - (da as number);
  return byCount(a, b) || byIdentity(a, b);
}

export type SortKey =
  | "default"
  | "most_publishers"
  | "biggest_increase"
  | "biggest_decrease"
  | "ssp_az";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "default", label: "New and biggest gains" },
  { value: "most_publishers", label: "Most publishers" },
  { value: "biggest_increase", label: "Biggest increase" },
  { value: "biggest_decrease", label: "Biggest decrease" },
  { value: "ssp_az", label: "SSP domain (A-Z)" },
];

/**
 * On the two delta sorts a new line has no delta at all, so it is parked
 * after every line that has one rather than being scored as a zero: a line
 * that appeared from nowhere on 198 publishers did not "increase by 0", and
 * sorting it as if it had would put it in the middle of a list the reader is
 * scanning for real movement.
 */
const COMPARATORS: Record<
  SortKey,
  (a: DiscoveredLine, b: DiscoveredLine) => number
> = {
  default: compareDefault,
  most_publishers: (a, b) => byCount(a, b) || byIdentity(a, b),
  biggest_increase: (a, b) => {
    const da = deltaValue(a);
    const db = deltaValue(b);
    if (da == null || db == null) {
      if (da !== db) return da == null ? 1 : -1;
      return byCount(a, b) || byIdentity(a, b);
    }
    return db - da || byCount(a, b) || byIdentity(a, b);
  },
  biggest_decrease: (a, b) => {
    const da = deltaValue(a);
    const db = deltaValue(b);
    if (da == null || db == null) {
      if (da !== db) return da == null ? 1 : -1;
      return byCount(a, b) || byIdentity(a, b);
    }
    return da - db || byCount(a, b) || byIdentity(a, b);
  },
  ssp_az: (a, b) =>
    a.ssp_domain.localeCompare(b.ssp_domain) ||
    byCount(a, b) ||
    byIdentity(a, b),
};

/** A new array, sorted. Never mutates the caller's rows. */
export function sortDiscoveredLines(
  rows: DiscoveredLine[],
  key: SortKey,
): DiscoveredLine[] {
  return [...rows].sort(COMPARATORS[key]);
}
