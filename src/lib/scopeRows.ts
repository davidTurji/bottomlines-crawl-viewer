/**
 * THE WATCH TABS: Started watching, Stopped watching, Unconfirmed (David,
 * 2026-10-27: the Changes page's statuses as tabs on the matched lists).
 *
 * The crawler filters the matched lists by them (crawler #361:
 * ``change=started_watching|stopped_watching|unconfirmed`` on
 * matched-developers and matched-apps, echoed, with ``change_counts``), so a
 * watch tab is one server-filtered list like any other. An API without the
 * filter offers no such tab: the page never reads a list page by page to
 * build one. An opened row reads only its own lines of the kind (one small
 * line-events request), for their reasons and dates.
 */
import { api, type LineEvent, type LineEventKind, type WatchChange } from "./api";
import { lineKey } from "./lineFilter";

export type ScopeTab = "started" | "stopped" | "unconfirmed";

export const SCOPE_TABS: ScopeTab[] = ["started", "stopped", "unconfirmed"];

export const SCOPE_EVENT: Record<ScopeTab, LineEventKind> = {
  started: "newly_monitored",
  stopped: "monitoring_stopped",
  unconfirmed: "unconfirmed",
};

export function isScopeTab(tab: string): tab is ScopeTab {
  return tab === "started" || tab === "stopped" || tab === "unconfirmed";
}

/** The most rows one request may ask for (the crawler's line-events and
 *  matched-apps caps). */
export const READ_PAGE = 500;

export type Progress = (done: number, of: number) => void;

/**
 * Every page of a paged list, one after another, until its rows add up to
 * its total. A total that moves between pages is refused: the list changed
 * under the read, so what came back is not one list.
 */
export async function readAllPages<T>(
  fetchPage: (page: number) => Promise<{ rows?: T[] | null; total?: number | null; page_size?: number | null }>,
  asked: number,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<T[]> {
  const out: T[] = [];
  let total: number | null = null;
  for (let page = 1; page <= 100_000; page++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const r = await fetchPage(page);
    const rows = Array.isArray(r.rows) ? r.rows : [];
    const t = typeof r.total === "number" ? r.total : out.length + rows.length;
    if (total === null) total = t;
    else if (t !== total) throw new Error("The list changed while it was being read. Reload and try again.");
    out.push(...rows);
    const size = Math.max(1, r.page_size || asked);
    onProgress?.(page, Math.max(page, Math.ceil(total / size)));
    if (rows.length === 0 || out.length >= total) return out;
  }
  // The API's own ceiling (100,000 pages): said, never a silent cut.
  throw new Error("This list is longer than one read can take (100,000 pages). Narrow it with a search or the line filter.");
}

/** A watch tab's filter on the matched lists (crawler #361). */
export const WATCH_CHANGE: Record<ScopeTab, WatchChange> = {
  started: "started_watching",
  stopped: "stopped_watching",
  unconfirmed: "unconfirmed",
};

const rowEvents = new Map<string, Promise<LineEvent[]>>();

/** One publisher's lines of a watch kind (an opened row, or an app's
 *  publisher): every page, usually one. Kept per row and filter. */
export function watchEvents(token: string, tab: ScopeTab, developerId: number, lines: string[]): Promise<LineEvent[]> {
  const key = `${token}|${tab}|${developerId}|${lines.join(",")}`;
  let p = rowEvents.get(key);
  if (!p) {
    const read = readAllPages(
      (page) =>
        api.lineEvents(token, { event: SCOPE_EVENT[tab], developer_id: developerId, page, page_size: READ_PAGE, lines }),
      READ_PAGE,
    );
    p = read;
    read.catch(() => {
      if (rowEvents.get(key) === read) rowEvents.delete(key);
    });
    rowEvents.set(key, read);
  }
  return p;
}

const certs = new Map<string, Promise<Map<string, { old: string | null; next: string | null }>>>();

/** Every cert change of the week, by publisher and line (ssp|id|REL): its
 *  old and new cert, for the Changed tab's "old to new". */
export function certChanges(
  token: string,
  lines: string[],
): Promise<Map<string, { old: string | null; next: string | null }>> {
  const key = `${token}|${lines.join(",")}`;
  let p = certs.get(key);
  if (!p) {
    const read = readAllPages(
      (page) => api.lineEvents(token, { event: "cert_changed", page, page_size: READ_PAGE, lines }),
      READ_PAGE,
    ).then((rows) => {
      const out = new Map<string, { old: string | null; next: string | null }>();
      for (const e of rows) {
        const k = `${e.developer_id}|${lineKey(e)}`;
        if (!out.has(k)) out.set(k, { old: e.old_cert_id ?? null, next: e.new_cert_id ?? null });
      }
      return out;
    });
    p = read;
    read.catch(() => {
      if (certs.get(key) === read) certs.delete(key);
    });
    certs.set(key, read);
  }
  return p;
}
