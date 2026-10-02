/**
 * THE SEAT-LINE FILTER, shared by the overview and the Changes page.
 *
 * A customer's report is built from a handful of seat lines. Picking one
 * or more of them narrows everything on the page to what carries those
 * lines: the matched publishers, the matched apps, the week's events, and
 * the two headline numbers above them. The selection lives in the URL
 * (`?lines=`), so it survives a refresh and travels between the two pages
 * through the rail's links.
 *
 * A line's identity is the triple the customer wrote: SSP domain, seller
 * id, relationship. The cert id is deliberately not part of it; a
 * customer thinks of "magnite.com, 1045, DIRECT" as one line whether or
 * not a file appends the certification authority.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { MatchedSeatLine } from "./api";

export const LINES_PARAM = "lines";

/** One line's identity: "ssp|seller|RELATIONSHIP", lowercased where it does not matter. */
export function lineKey(l: {
  ssp_domain: string;
  publisher_id: string;
  relationship: string;
}): string {
  return `${l.ssp_domain.trim().toLowerCase()}|${l.publisher_id.trim()}|${l.relationship
    .trim()
    .toUpperCase()}`;
}

/** The line as the customer wrote it, for a label. */
export function lineLabel(l: {
  ssp_domain: string;
  publisher_id: string;
  relationship: string;
}): string {
  return `${l.ssp_domain}, ${l.publisher_id}, ${l.relationship.toUpperCase()}`;
}

/**
 * WHERE A LINE CAME FROM, AND WHEN — SAID IN ONE PLACE.
 *
 * Every watched line carries a source and the day it was added. It is
 * hinted in the line filter, which is the one surface that lists every
 * line the report watched, and deliberately nowhere else: the publisher
 * and app lists repeat a line once per row, and restating its provenance
 * on each would be the same fact tens of thousands of times over.
 *
 * Two of the four sources are one idea reached by two buttons in the
 * console, so both read "Found by discovery". A line we found for the
 * customer is the one worth picking out of the list, so it reads blue;
 * the lines they gave us read plain.
 */
const SOURCE_LABELS: Record<string, string> = {
  sellers_json: "From sellers.json",
  manual: "Added manually",
  signal: "Found by discovery",
  discovered: "Found by discovery",
};

/** True for a line we found for the customer rather than one they gave. */
export function isDiscovered(l: { source?: string | null }): boolean {
  return l.source === "discovered" || l.source === "signal";
}

/** "30 Aug 2026", or null when the artifact carries no date. */
export function addedDay(l: { added_at?: string | null }): string | null {
  return formatAdded(l, "numeric");
}

/** "30 Aug 26". The short year buys back the width the seat line wants,
 *  and a report only ever spans a year or two, so the century is noise. */
export function addedDayShort(l: { added_at?: string | null }): string | null {
  return formatAdded(l, "2-digit");
}

function formatAdded(
  l: { added_at?: string | null }, year: "numeric" | "2-digit",
): string | null {
  const raw = l.added_at;
  if (!raw) return null;
  const d = new Date(raw.length === 10 ? `${raw}T00:00:00Z` : raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year,
    timeZone: "UTC",
  });
}

/**
 * "From sellers.json, 30 Aug 2026". Null when the line says nothing about
 * itself, which is every line on an artifact frozen before provenance
 * existed: no hint at all beats a guess.
 */
export function sourceHint(l: {
  source?: string | null;
  added_at?: string | null;
}): string | null {
  const label = SOURCE_LABELS[l.source ?? ""] ?? null;
  const day = addedDay(l);
  if (!label) return day && `Added ${day}`;
  return day ? `${label}, ${day}` : label;
}

export function parseLinesParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => decodeURIComponent(s).trim())
    .filter(Boolean);
}

export function serializeLines(keys: string[]): string {
  return keys.map((k) => encodeURIComponent(k)).join(",");
}

/** True when nothing is selected (every line) or any of `lines` is selected. */
export function carriesSelected(
  lines: MatchedSeatLine[] | undefined | null,
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  if (!lines || lines.length === 0) return false;
  const want = new Set(selected);
  return lines.some((l) => want.has(lineKey(l)));
}

/** Only the lines that are selected; everything when nothing is. */
export function onlySelected(
  lines: MatchedSeatLine[],
  selected: string[],
): MatchedSeatLine[] {
  if (selected.length === 0) return lines;
  const want = new Set(selected);
  return lines.filter((l) => want.has(lineKey(l)));
}

/** The selection, read from and written to the URL. */
export function useLineFilter(): {
  selected: string[];
  setSelected: (keys: string[]) => void;
  active: boolean;
} {
  const [params, setParams] = useSearchParams();
  const raw = params.get(LINES_PARAM);
  const selected = useMemo(() => parseLinesParam(raw), [raw]);
  const setSelected = useCallback(
    (keys: string[]) => {
      const next = new URLSearchParams(params);
      if (keys.length === 0) next.delete(LINES_PARAM);
      else next.set(LINES_PARAM, serializeLines(keys));
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  return { selected, setSelected, active: selected.length > 0 };
}

/** The query-string fragment the API calls append. Empty when unfiltered. */
export function linesQuery(selected: string[] | undefined): string {
  if (!selected || selected.length === 0) return "";
  return `&${LINES_PARAM}=${serializeLines(selected)}`;
}
