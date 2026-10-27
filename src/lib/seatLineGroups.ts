/**
 * ONE ROW PER DISTINCT SEAT LINE (David, 2026-10-27).
 *
 * A report lists a publisher's matched lines once per place it found them:
 * its own file, and the ads.txt of every inventory partner that carries
 * the same line. tclchannel.com said "This week 9" over 20 rows, the same
 * "streamvantage.tv, 10020, RESELLER" five times, once per partner. Here
 * the inventory partners' copies fold into one row per line, carrying every
 * partner it came through, so the rows count what "This week" counts.
 *
 * ONLY PARTNER COPIES FOLD (review of #75, 2026-10-27). The same seat in
 * the publisher's root file and in a declared host's file, or in its
 * ads.txt and its app-ads.txt, are two lines for the crawler (its key holds
 * the host and the file), so they stay two rows, each opening its own file.
 */
import type { MatchedSeatLine } from "./api";

export type SeatLineGroup = {
  /** The line the row prints (its file, host and dates). */
  line: MatchedSeatLine;
  /** Found in the publisher's own file (or the host file named on it); a
   *  partners' row is never also an own row. */
  own: boolean;
  /** The inventory partners whose ads.txt carries it, first seen first. */
  partners: string[];
};

/** The seat line itself: SSP, seller ID, relationship and cert. */
export function seatKey(l: { ssp_domain?: unknown; publisher_id?: unknown; relationship?: unknown; cert_id?: unknown }): string {
  return [
    String(l.ssp_domain ?? "").trim().toLowerCase(),
    String(l.publisher_id ?? "").trim(),
    String(l.relationship ?? "").trim().toUpperCase(),
    String(l.cert_id ?? "").trim().toLowerCase(),
  ].join("|");
}

/**
 * The partner a line came through. The line's own word when it has one
 * (``match_type`` per line); on a report frozen before lines said it, the
 * row's: an IPD row's lines are all its partner's.
 */
export function partnerOf(l: MatchedSeatLine, rowPartner: string | null | undefined): string | null {
  const own = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  if (l.match_type === "ipd") return own(l.ipd_partner) ?? own(rowPartner);
  if (l.match_type === "own") return null;
  return own(rowPartner);
}

/** Where an own copy of a line sits: its host and its file. Two copies
 *  that differ in either are two lines. */
export function placeKey(host: unknown, file: unknown): string {
  const h = typeof host === "string" ? host.trim().toLowerCase() : "";
  const f = typeof file === "string" ? file.trim().toLowerCase().replace(/[^a-z]/g, "") : "";
  return `${h}|${f}`;
}

/** The list's lines, one group per line and place, in first-seen order:
 *  an own copy per host and file, the partners' copies of a line as one. */
export function groupSeatLines(
  lines: MatchedSeatLine[] | null | undefined,
  rowPartner?: string | null,
): SeatLineGroup[] {
  const out: SeatLineGroup[] = [];
  const byKey = new Map<string, SeatLineGroup>();
  for (const l of Array.isArray(lines) ? lines : []) {
    if (!l || typeof l !== "object") continue;
    const partner = partnerOf(l, rowPartner);
    const key = `${seatKey(l)}|${partner === null ? `own|${placeKey(l.host, l.found_in)}` : "ipd"}`;
    let g = byKey.get(key);
    if (!g) {
      g = { line: l, own: partner === null, partners: [] };
      byKey.set(key, g);
      out.push(g);
    }
    if (partner && !g.partners.includes(partner)) g.partners.push(partner);
  }
  return out;
}
