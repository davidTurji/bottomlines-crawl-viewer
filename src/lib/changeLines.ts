/**
 * EVERY LINE OF A CHANGE, ON A REPORT THAT KEPT ONLY 200 (David, 2026-11-02:
 * "we should be able to show all removed lines").
 *
 * Reports frozen before 2026-10-28 kept at most 200 added and 200 removed
 * lines per publisher (the crawler's ``_EVENT_LINES_PER_DEV``); every report
 * since keeps them all. The report's line events always held every one, one
 * per file, so a window that was cut reads them and folds them the way the
 * crawler folds a row's lines (``customer_snapshot._event_lines``): one line
 * per seat and file host, "both" when it moved in ads.txt and app-ads.txt,
 * and an inventory partner's copy in that partner's ads.txt, one per partner
 * (the window folds the partners). A line in both files keeps the first
 * file's dates, and its removal reason only when both files give the same
 * one, as the crawler does.
 */
import type { LineEvent, MatchedSeatLine } from "./api";

/** The dated fields a line carries over from its event. */
const DATED = [
  "last_seen_at",
  "not_found_at",
  "first_seen_at",
  "last_absent_at",
  "seen_at",
  "date_source",
  "last_confirmed",
] as const;

/** Why a removed line left: kept on a "both" line only when its two files agree. */
const REMOVAL = ["removal_reason", "removal_detail"] as const;

/** A change's line events (any order, any page) as the window's lines. */
export function foldChangeEvents(events: readonly LineEvent[]): MatchedSeatLine[] {
  const out = new Map<string, MatchedSeatLine>();
  for (const e of events) {
    if (!e || typeof e !== "object" || e.matched_seat === false) continue;
    const ipd = e.match_type === "ipd";
    const file = e.file_kind === "app_ads_txt" ? "app-ads.txt" : "ads.txt";
    const seat = [
      String(e.ssp_domain ?? "").trim().toLowerCase(),
      String(e.publisher_id ?? "").trim().toLowerCase(),
      String(e.relationship ?? "").trim().toUpperCase(),
    ].join("|");
    const host = String(e.host ?? "").trim().toLowerCase();
    const key = ipd ? `${seat}|ipd|${String(e.ipd_partner ?? "").trim().toLowerCase()}` : `${seat}|own|${host}`;
    const have = out.get(key);
    if (have) {
      if (!ipd && have.found_in !== file) have.found_in = "both";
      const extra = e as Record<string, unknown>;
      const kept = have as Record<string, unknown>;
      for (const f of REMOVAL) if (kept[f] !== extra[f]) delete kept[f];
      continue;
    }
    const line: MatchedSeatLine = {
      ssp_domain: e.ssp_domain,
      publisher_id: e.publisher_id,
      relationship: e.relationship,
      cert_id: e.new_cert_id || e.cert_id || e.old_cert_id || undefined,
      found_in: ipd ? "ads.txt" : file,
      host: e.host ?? null,
      ...(ipd ? { match_type: "ipd" as const, ipd_partner: e.ipd_partner ?? null } : {}),
    };
    const source = e as Record<string, unknown>;
    const target = line as Record<string, unknown>;
    for (const f of [...DATED, ...REMOVAL]) if (source[f] !== undefined) target[f] = source[f];
    out.set(key, line);
  }
  return [...out.values()];
}
