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

/** A line's ssp|id|REL, read safely whatever the fields hold. */
export function certKey(l: { ssp_domain?: unknown; publisher_id?: unknown; relationship?: unknown }): string {
  const t = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");
  return `${t(l.ssp_domain).toLowerCase()}|${t(l.publisher_id)}|${t(l.relationship).toUpperCase()}`;
}

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

type PageAnswer<T> = { rows?: T[] | null; total?: number | null; page_size?: number | null };

/** One page, retried with a growing pause when the read fails (a passing
 *  503, a dropped connection); never once the reader has cancelled. */
async function readPage<T>(fetchPage: (page: number) => Promise<PageAnswer<T>>, page: number, signal?: AbortSignal) {
  const pauses = [400, 1200, 3000];
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fetchPage(page);
    } catch (e) {
      if (signal?.aborted || attempt >= pauses.length) throw e;
      await new Promise((r) => setTimeout(r, pauses[attempt]));
    }
  }
}

/**
 * Every page of a paged list, one after another (never in parallel), each
 * handed on as it arrives, until its rows add up to its total. Refused, and
 * said: a total that moves between pages (the list changed under the read),
 * and rows that fall short of the total (a report that keeps a shorter copy
 * than it counts). Returns how many rows were read.
 */
export async function eachPage<T>(
  fetchPage: (page: number) => Promise<PageAnswer<T>>,
  asked: number,
  onRows: (rows: T[]) => void,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<number> {
  let seen = 0;
  let total: number | null = null;
  for (let page = 1; page <= 100_000; page++) {
    const r = await readPage(fetchPage, page, signal);
    const rows = Array.isArray(r.rows) ? r.rows : [];
    const t = typeof r.total === "number" ? r.total : seen + rows.length;
    if (total === null) total = t;
    else if (t !== total) throw new Error("The list changed while it was being read. Reload and try again.");
    if (rows.length === 0 && seen < total)
      throw new Error(
        `This list counts ${total.toLocaleString()} rows but only ${seen.toLocaleString()} could be read. Nothing was exported.`,
      );
    seen += rows.length;
    onRows(rows);
    const size = Math.max(1, r.page_size || asked);
    onProgress?.(page, Math.max(page, Math.ceil(total / size)));
    if (seen >= total) return seen;
  }
  // The API's own ceiling (100,000 pages): said, never a silent cut.
  throw new Error("This list is longer than one read can take (100,000 pages). Narrow it with a search or the line filter.");
}

/** Every page of a paged list, kept (see eachPage). */
export async function readAllPages<T>(
  fetchPage: (page: number) => Promise<PageAnswer<T>>,
  asked: number,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<T[]> {
  const out: T[] = [];
  await eachPage(fetchPage, asked, (rows) => out.push(...rows), onProgress, signal);
  return out;
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

/** One publisher's cert changes of the week, by line (ssp|id|REL): its old
 *  and new cert, read when its row opens on the Changed tab (never the
 *  whole list: review of #75). */
export function rowCertChanges(
  token: string,
  developerId: number,
  lines: string[],
): Promise<Map<string, { old: string | null; next: string | null }>> {
  const key = `${token}|${developerId}|${lines.join(",")}`;
  let p = certs.get(key);
  if (!p) {
    const read = readAllPages(
      (page) => api.lineEvents(token, { event: "cert_changed", developer_id: developerId, page, page_size: READ_PAGE, lines }),
      READ_PAGE,
    ).then((rows) => {
      const out = new Map<string, { old: string | null; next: string | null }>();
      for (const e of rows) {
        if (!e || typeof e !== "object") continue;
        const k = certKey(e);
        if (!out.has(k))
          out.set(k, {
            old: typeof e.old_cert_id === "string" ? e.old_cert_id : null,
            next: typeof e.new_cert_id === "string" ? e.new_cert_id : null,
          });
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
