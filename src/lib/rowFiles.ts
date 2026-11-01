/**
 * WHERE A PUBLISHER'S LINES ARE (David, 2026-11-01): ads.txt, app-ads.txt or
 * both. The row tag says it, and it must say exactly what the crawler's
 * Found in filter decided (viewer_frozen ``_line_bits`` / ``_event_bits``),
 * so a row the filter kept never wears a tag that contradicts it.
 */

export type FileWord = "ads.txt" | "app-ads.txt" | "both";

type LineLike = {
  found_in?: unknown;
  file_kind?: unknown;
  match_type?: unknown;
  ipd_partner?: unknown;
  ssp_domain?: unknown;
  publisher_id?: unknown;
  relationship?: unknown;
} | null | undefined;

const BITS_OF_WORD: Record<string, number> = { "ads.txt": 1, "app-ads.txt": 2, both: 3 };

/** One line's file bits (1 ads.txt, 2 app-ads.txt, 3 both, 0 unknown), the
 *  crawler's rule: its ``found_in`` word, else its ``file_kind``; a line
 *  through an inventory partner sits in the partner's ads.txt. */
export function lineFileBits(l: LineLike): number {
  if (!l || typeof l !== "object") return 0;
  const ipd = l.match_type === "ipd" || Boolean(l.ipd_partner);
  const files = BITS_OF_WORD[String(l.found_in ?? "").trim().toLowerCase()] ?? 0;
  if (files) return files;
  const kind = l.file_kind;
  return kind === "app_ads_txt" ? 2 : kind === "ads_txt" || ipd ? 1 : 0;
}

/** A seat line's key as the crawler folds it (``seat_key``): the Seller ID
 *  lower-cased, so a selection and a line always meet. */
export function seatKeyOf(l: { ssp_domain?: unknown; publisher_id?: unknown; relationship?: unknown }): string {
  return `${String(l.ssp_domain ?? "").trim().toLowerCase()}|${String(l.publisher_id ?? "").trim().toLowerCase()}|${String(l.relationship ?? "").trim().toUpperCase()}`;
}

function foldKey(key: string): string {
  const [ssp = "", seller = "", rel = ""] = key.split("|");
  return seatKeyOf({ ssp_domain: ssp, publisher_id: seller, relationship: rel });
}

/**
 * The row's files: its frozen ``found_in_all`` when it has one, else its
 * lines. ``seats`` (the page's seat-line filter, on a change tab): only the
 * lines on those seats count, as the server decides a change row from the
 * tab's events on the selected seats. From lines that may be cut
 * (``whole`` false) only "both" is certain.
 */
export function rowFilesOf(
  lines: readonly LineLike[] | null | undefined,
  whole: boolean,
  frozen?: string | null,
  seats?: readonly string[],
): FileWord | null {
  const word = String(frozen ?? "").trim().toLowerCase();
  if (word === "ads.txt" || word === "app-ads.txt" || word === "both") return word;
  const keep = seats && seats.length ? new Set(seats.map(foldKey)) : null;
  let bits = 0;
  for (const l of Array.isArray(lines) ? lines : []) {
    if (!l || typeof l !== "object") continue;
    if (keep && !keep.has(seatKeyOf(l))) continue;
    bits |= lineFileBits(l);
  }
  if (bits === 3) return "both";
  if (!whole) return null;
  return bits === 1 ? "ads.txt" : bits === 2 ? "app-ads.txt" : null;
}
