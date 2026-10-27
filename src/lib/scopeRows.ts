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

/** A line's cert before and after the week. */
export type CertChange = { old: string | null; next: string | null };

/**
 * A publisher's cert changes, findable by line (re-review of #75): the
 * same seat can sit in two files (its ads.txt and its app-ads.txt, or a
 * declared host's), each with its own cert change, so a change is keyed by
 * the seat AND its place. Three grains, finest first: seat + host + file,
 * seat + file, seat. A grain two changes share in different places is
 * ambiguous (null) and never guessed; a line that names no host or file
 * is matched at the finest grain it can name.
 */
export type CertChanges = Map<string, { change: CertChange; place: string } | null>;

const fileWord = (v: unknown): string => {
  const k = (typeof v === "string" ? v : "").toLowerCase().replace(/[^a-z]/g, "");
  return k === "appadstxt" ? "app-ads.txt" : k === "adstxt" ? "ads.txt" : k;
};
const hostWord = (v: unknown): string => (typeof v === "string" ? v.trim().toLowerCase() : "");

function certGrains(seat: string, host: string, file: string): string[] {
  const out: string[] = [];
  if (host && file) out.push(`x|${seat}|${host}|${file}`);
  if (file) out.push(`f|${seat}|${file}`);
  out.push(`s|${seat}`);
  return out;
}

/** Adds one cert_changed event (its host and `file_kind`). */
export function addCertChange(map: CertChanges, e: LineEvent): void {
  if (!e || typeof e !== "object") return;
  const host = hostWord(e.host);
  const file = fileWord(e.file_kind);
  const place = `${host}|${file}`;
  const change: CertChange = {
    old: typeof e.old_cert_id === "string" ? e.old_cert_id : null,
    next: typeof e.new_cert_id === "string" ? e.new_cert_id : null,
  };
  for (const k of certGrains(certKey(e), host, file)) {
    const had = map.get(k);
    if (had === undefined) map.set(k, { change, place });
    else if (had !== null && had.place !== place) map.set(k, null);
  }
}

/** The cert change of one line (its host, or the publisher's domain when
 *  it names none, and its `found_in`), or null when none or ambiguous. */
export function certChangeOf(
  map: CertChanges | null | undefined,
  l: { ssp_domain?: unknown; publisher_id?: unknown; relationship?: unknown; host?: unknown; found_in?: unknown },
  ownHost?: string | null,
): CertChange | null {
  if (!map || !l || typeof l !== "object") return null;
  const host = hostWord(l.host) || hostWord(ownHost);
  for (const k of certGrains(certKey(l), host, fileWord(l.found_in))) {
    const had = map.get(k);
    if (had === null) return null; // ambiguous here, and so at every coarser grain
    if (had) return had.change;
  }
  return null;
}

const certs = new Map<string, Promise<CertChanges>>();

/** One publisher's cert changes of the week (see CertChanges), read when
 *  its row opens on the Changed tab (never the whole list: review of
 *  #75). */
export function rowCertChanges(token: string, developerId: number, lines: string[]): Promise<CertChanges> {
  const key = `${token}|${developerId}|${lines.join(",")}`;
  let p = certs.get(key);
  if (!p) {
    const read = readAllPages(
      (page) => api.lineEvents(token, { event: "cert_changed", developer_id: developerId, page, page_size: READ_PAGE, lines }),
      READ_PAGE,
    ).then((rows) => {
      const out: CertChanges = new Map();
      for (const e of rows) addCertChange(out, e);
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

/**
 * Every publisher's cert changes on the list (for the Changed tab's
 * export, which carries old to new as the page does): every page of the
 * report's cert_changed events under the line filter, by publisher. Only
 * when a reader asks for the file, never to show the tab.
 */
export async function allCertChanges(
  token: string,
  lines: string[],
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<Map<number, CertChanges>> {
  const out = new Map<number, CertChanges>();
  await eachPage(
    (page) => api.lineEvents(token, { event: "cert_changed", page, page_size: READ_PAGE, lines }),
    READ_PAGE,
    (rows) => {
      for (const e of rows) {
        if (!e || typeof e !== "object" || typeof e.developer_id !== "number") continue;
        let m = out.get(e.developer_id);
        if (!m) out.set(e.developer_id, (m = new Map()));
        addCertChange(m, e);
      }
    },
    onProgress,
    signal,
  );
  return out;
}
