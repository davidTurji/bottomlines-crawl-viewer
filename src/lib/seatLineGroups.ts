/**
 * ONE ROW PER DISTINCT SEAT LINE (David, 2026-10-27).
 *
 * A report lists a publisher's matched lines once per place it found them:
 * its own file, and the ads.txt of every inventory partner that carries
 * the same line. tclchannel.com said "This week 9" over 20 rows, the same
 * "streamvantage.tv, 10020, RESELLER" five times, once per partner. Here
 * the copies fold into one row per line, carrying every partner it came
 * through, so the rows count what "This week" counts.
 */
import type { MatchedSeatLine } from "./api";

export type SeatLineGroup = {
  /** The line the row prints: its own-file copy when there is one (its
   *  file, host and dates), else the first copy. */
  line: MatchedSeatLine;
  /** Found in the publisher's own file (or the host file named on it). */
  own: boolean;
  /** The inventory partners whose ads.txt carries it, first seen first. */
  partners: string[];
};

/** The seat line itself: SSP, seller ID, relationship and cert. */
export function seatKey(l: Pick<MatchedSeatLine, "ssp_domain" | "publisher_id" | "relationship" | "cert_id">): string {
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

/** The list's lines, one group per distinct line, in first-seen order. */
export function groupSeatLines(
  lines: MatchedSeatLine[] | null | undefined,
  rowPartner?: string | null,
): SeatLineGroup[] {
  const out: SeatLineGroup[] = [];
  const byKey = new Map<string, SeatLineGroup>();
  for (const l of Array.isArray(lines) ? lines : []) {
    if (!l || typeof l !== "object") continue;
    const key = seatKey(l);
    const partner = partnerOf(l, rowPartner);
    let g = byKey.get(key);
    if (!g) {
      g = { line: l, own: partner === null, partners: [] };
      byKey.set(key, g);
      out.push(g);
    } else if (partner === null && !g.own) {
      // The own-file copy speaks for the row: its file, host and dates.
      g.line = l;
      g.own = true;
    }
    if (partner && !g.partners.includes(partner)) g.partners.push(partner);
  }
  return out;
}
