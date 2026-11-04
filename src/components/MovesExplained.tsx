import type { MatchedMoves } from "@/lib/api";

/**
 * FOUND OR LOST THROUGH AN INVENTORY PARTNER, WITH NO LINE MOVED (David,
 * 2026-11-04).
 *
 * A publisher that stops naming its inventory partner loses every app the
 * partner covered while the reader's line stays in the partner's ads.txt:
 * apps lost, 0 lines removed (stackup-ai.com, crawl 64: 4 publishers, 23
 * apps, the tiles said "0 lost"). The tiles count them; this one line under
 * them gives the figures, and its links open the list below on the status
 * that holds them (Stopped watching, Started watching), every app together,
 * each line with its one-line reason. Nothing opens inside the KPIs.
 *
 * Shown only when the report counted a partner move: an older report, a
 * filtered view (found / lost are not computed under a line filter) or a
 * week with no partner move shows nothing, as before.
 */
export type MovesTab = "stopped" | "started";

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** "23 apps lost (4 publishers)", or "4 publishers lost" when the apps
 *  were not counted. */
function side(pubs: number, apps: number | null | undefined, word: string): string {
  if (apps == null) return `${plural(pubs, "publisher", "publishers")} ${word}`;
  return `${plural(apps, "app", "apps")} ${word} (${plural(pubs, "publisher", "publishers")})`;
}

/** The line's words, or null when there is no partner move to explain. */
export function movesSentence(moves: MatchedMoves | null): string | null {
  if (!moves) return null;
  const lost = moves.developers.partner_dropped ?? 0;
  const found = moves.developers.partner_found ?? 0;
  if (!lost && !found) return null;
  // "No line removed" is proven for the lost (the crawler counts a partner
  // drop only when the declaration is gone and the line is not); the found
  // make no line claim (a partner may have added the seat to its own file).
  const parts = [
    lost ? `${side(lost, moves.apps?.partner_dropped, "lost")} with no line removed` : null,
    found ? side(found, moves.apps?.partner_found, "found") : null,
  ].filter(Boolean);
  return `Through inventory partners: ${parts.join(", and ")}.`;
}

export function MovesQuietLine({
  moves,
  onShow,
}: {
  moves: MatchedMoves | null;
  onShow: (tab: MovesTab) => void;
}) {
  const said = movesSentence(moves);
  if (!said || !moves) return null;
  const lost = (moves.developers.partner_dropped ?? 0) > 0;
  const found = (moves.developers.partner_found ?? 0) > 0;
  const link = (label: string, tab: MovesTab) => (
    <button
      type="button"
      onClick={() => onShow(tab)}
      className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary/40"
    >
      {label}
    </button>
  );
  return (
    <p data-testid="moves-quiet" className="mt-2 text-[12px] leading-snug text-slate-500">
      {said}{" "}
      {lost && found ? (
        <>
          {link("See lost", "stopped")}
          {", "}
          {link("See found", "started")}
        </>
      ) : (
        link("See them", lost ? "stopped" : "started")
      )}
    </p>
  );
}
