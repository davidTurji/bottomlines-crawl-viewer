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

/** One window line's identity: its seat, and where it sits (an own copy's
 *  file host, the publisher's own file whether it says its domain or
 *  nothing; an inventory partner's copy, that partner). */
export function changeLineKey(
  l: { ssp_domain?: unknown; publisher_id?: unknown; relationship?: unknown; host?: unknown; match_type?: unknown; ipd_partner?: unknown },
  publisherDomain?: string | null,
): string {
  const seat = [
    String(l.ssp_domain ?? "").trim().toLowerCase(),
    String(l.publisher_id ?? "").trim().toLowerCase(),
    String(l.relationship ?? "").trim().toUpperCase(),
  ].join("|");
  if (l.match_type === "ipd" || (typeof l.ipd_partner === "string" && l.ipd_partner.trim())) {
    return `${seat}|ipd|${String(l.ipd_partner ?? "").trim().toLowerCase()}`;
  }
  const host = String(l.host ?? "").trim().toLowerCase();
  const own = String(publisherDomain ?? "").trim().toLowerCase();
  return `${seat}|own|${host && host !== own ? host : ""}`;
}

/** A change's line events (any order, any page) as the window's lines.
 *  ``cert``: a cert window's lines, each saying its old cert too. */
export function foldChangeEvents(
  events: readonly LineEvent[],
  { cert = false, publisherDomain }: { cert?: boolean; publisherDomain?: string | null } = {},
): MatchedSeatLine[] {
  const out = new Map<string, MatchedSeatLine>();
  for (const e of events) {
    if (!e || typeof e !== "object" || e.matched_seat === false) continue;
    const ipd = e.match_type === "ipd";
    const file = e.file_kind === "app_ads_txt" ? "app-ads.txt" : "ads.txt";
    const key = changeLineKey(e, publisherDomain);
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
      ...(cert && typeof e.old_cert_id === "string" ? { old_cert_id: e.old_cert_id } : {}),
    };
    const source = e as Record<string, unknown>;
    const target = line as Record<string, unknown>;
    for (const f of [...DATED, ...REMOVAL]) if (source[f] !== undefined) target[f] = source[f];
    out.set(key, line);
  }
  return [...out.values()];
}

/**
 * The whole list, with the lines the row already held kept exactly as they
 * were: they carry what line events never did (the cert the crawler read
 * from the book, an inventory partner's platform), and a line the reader
 * was looking at must not change under them. A held line the events lack
 * is kept too: the whole list is never shorter than what was shown.
 */
export function withKeptLines(
  loaded: readonly MatchedSeatLine[],
  kept: readonly MatchedSeatLine[],
  publisherDomain?: string | null,
): MatchedSeatLine[] {
  const held = new Map<string, MatchedSeatLine>();
  for (const l of kept) if (l && typeof l === "object") held.set(changeLineKey(l, publisherDomain), l);
  const out: MatchedSeatLine[] = [];
  const used = new Set<string>();
  for (const l of loaded) {
    const k = changeLineKey(l, publisherDomain);
    out.push(held.get(k) ?? l);
    used.add(k);
  }
  for (const [k, l] of held) if (!used.has(k)) out.push(l);
  return out;
}
