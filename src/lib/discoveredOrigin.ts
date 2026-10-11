/**
 * WHO BROUGHT A DISCOVERED LINE (David, 2026-10-11).
 *
 * Discovery lists every line carrying the customer's domain, including the
 * ones they gave us. Each line says which it is:
 *
 *   given         "You gave us": a line in the list the customer handed
 *                 over, by hand or in the sellers.json we imported;
 *   found_listed  found by Path Finder, and in their list since;
 *   found         found by Path Finder, not in their list. `given_as`
 *                 names the relationship when they gave the same seller ID
 *                 the other way (DIRECT for RESELLER, or back).
 *
 * The API marks each row from the report's frozen watchlist. This is the
 * same rule in the browser, for an API that does not mark rows yet: the
 * summary carries the same watchlist, so the two can only agree. A line's
 * identity is the seat filter's: SSP, seller ID, relationship, never the
 * cert id (lineKey).
 */
import type { DiscoveredLine, MatchedSeatLine } from "./api";

/** lineFilter's lineKey, kept here so the mock and the e2e fake (which run
 *  in Node) need nothing from the router. */
const lineKey = (l: { ssp_domain: string; publisher_id: string; relationship: string }) =>
  `${l.ssp_domain.trim().toLowerCase()}|${l.publisher_id.trim()}|${l.relationship.trim().toUpperCase()}`;

export type Origin = {
  origin: "given" | "found_listed" | "found";
  origin_source?: string | null;
  origin_added_at?: string | null;
  given_as?: string;
};

const GIVEN = new Set(["sellers_json", "manual", ""]);
const FOUND = new Set(["signal", "discovered"]);

/** A function marking lines from a watchlist, or null without one. */
export function originsFrom(seats: MatchedSeatLine[] | null | undefined): ((l: DiscoveredLine) => Origin) | null {
  if (!seats) return null;
  const exact = new Map<string, MatchedSeatLine>();
  const byId = new Map<string, MatchedSeatLine[]>();
  for (const s of seats) {
    const k = lineKey(s);
    if (!exact.has(k) || GIVEN.has(s.source ?? "")) exact.set(k, s);
    const id = k.split("|").slice(0, 2).join("|");
    byId.set(id, [...(byId.get(id) ?? []), s]);
  }
  return (l) => {
    const k = lineKey(l);
    const seat = exact.get(k);
    if (seat) {
      const src = seat.source ?? "";
      return {
        origin: FOUND.has(src) ? "found_listed" : "given",
        origin_source: src || null,
        origin_added_at: seat.added_at ?? null,
      };
    }
    const [ssp, id, rel] = k.split("|");
    const other = [
      ...new Set(
        (byId.get(`${ssp}|${id}`) ?? [])
          .filter((s) => GIVEN.has(s.source ?? ""))
          .map((s) => s.relationship.trim().toUpperCase()),
      ),
    ]
      .filter((r) => r !== rel)
      .sort();
    return { origin: "found", ...(other.length ? { given_as: other[0] } : {}) };
  };
}

/** The row's own mark, else the browser's, else none. */
export function originOf(l: DiscoveredLine, fallback: ((l: DiscoveredLine) => Origin) | null): Origin | null {
  if (l.origin) return l as Origin & DiscoveredLine;
  return fallback ? fallback(l) : null;
}

/** "1 Oct 2026". */
function day(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** The pill's words and the line of detail beside it. */
export function originWords(o: Origin): { pill: string; detail: string } {
  const on = day(o.origin_added_at);
  if (o.origin === "given") {
    const how =
      o.origin_source === "sellers_json"
        ? "From your sellers.json"
        : o.origin_source === "manual"
          ? "You added it by hand"
          : "In the list you gave us";
    return { pill: "You gave us", detail: on ? `${how}, ${on}` : how };
  }
  if (o.origin === "found_listed") {
    return { pill: "Found by Path Finder", detail: on ? `In your list since ${on}` : "In your list since" };
  }
  return {
    pill: "Found by Path Finder",
    detail: o.given_as ? `You gave us this seller ID as ${o.given_as}` : "Not in the list you gave us",
  };
}
