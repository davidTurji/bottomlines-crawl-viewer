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

export { eachPage, type Progress } from "./completePages";
import { eachPage, type PageAnswer, type Progress } from "./completePages";

/** Every page of a paged list, kept (see eachPage). */
export async function readAllPages<T>(
  fetchPage: (page: number) => Promise<PageAnswer<T>>,
  asked: number,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<T[]> {
  const out: T[] = [];
  await eachPage(
    fetchPage,
    asked,
    (rows) => {
      out.push(...rows);
    },
    onProgress,
    signal,
  );
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
  // `cert_id` is the event's cert from crawler #370 on; `new_cert_id`
  // before it.
  const now = (e as { cert_id?: unknown }).cert_id;
  const change: CertChange = {
    old: typeof e.old_cert_id === "string" ? e.old_cert_id : null,
    next: typeof e.new_cert_id === "string" ? e.new_cert_id : typeof now === "string" ? now : null,
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

/** True when every line already says its old cert (crawler #370's lines
 *  and events carry `old_cert_id`): no read needed for them. */
export function hasOldCerts(lines: unknown): boolean {
  return (
    Array.isArray(lines) &&
    lines.length > 0 &&
    lines.every((l) => !!l && typeof l === "object" && typeof (l as { old_cert_id?: unknown }).old_cert_id === "string")
  );
}

/** `fn` over `xs`, at most `limit` at a time, in order; stops on abort. */
export async function mapLimit<T, U>(xs: T[], limit: number, fn: (x: T) => Promise<U>, signal?: AbortSignal): Promise<U[]> {
  const out = new Array<U>(xs.length);
  let next = 0;
  const worker = async () => {
    while (next < xs.length) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const i = next++;
      out[i] = await fn(xs[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, xs.length) }, worker));
  return out;
}
