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
