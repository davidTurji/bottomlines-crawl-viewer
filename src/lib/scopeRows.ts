/**
 * THE WATCH TABS: Started watching, Stopped watching, Unconfirmed (David,
 * 2026-10-27: the Changes page's statuses as tabs on the matched lists).
 *
 * The crawler answers these per LINE (line-events), not per publisher, so
 * the lists are built here: every line event of the kind, read page by
 * page (politely, one request after another), grouped by publisher. The
 * apps tabs then list the matched apps whose publisher carries such a line,
 * read from the full matched apps list the same way. Both reads are kept
 * per report and filter, so switching between the tabs reads nothing twice.
 */
import { api, type LineEvent, type LineEventKind, type MatchedApp, type MatchTypeFilter } from "./api";
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

const events = new Map<string, Promise<LineEvent[]>>();

/** Every line event of a watch tab's kind, under the line filter. */
export function scopeEvents(token: string, tab: ScopeTab, lines: string[], onProgress?: Progress): Promise<LineEvent[]> {
  const key = `${token}|${tab}|${lines.join(",")}`;
  let p = events.get(key);
  if (!p) {
    const read = readAllPages(
      (page) => api.lineEvents(token, { event: SCOPE_EVENT[tab], page, page_size: READ_PAGE, lines }),
      READ_PAGE,
      onProgress,
    );
    p = read;
    read.catch(() => {
      if (events.get(key) === read) events.delete(key);
    });
    events.set(key, read);
  }
  return p;
}

/** A publisher on a watch tab, with its lines of that kind. */
export type ScopeRow = {
  developer_id: number;
  developer_name: string | null;
  developer_domain: string | null;
  developer_platform: string | null;
  events: LineEvent[];
  /** Some line in its own file (or a host file of its own). */
  own: boolean;
  /** Some line through an inventory partner; the first partner named. */
  ipd: boolean;
  partner: string | null;
};

/** The events, one row per publisher, in the order the crawler sent them. */
export function groupScope(list: LineEvent[]): ScopeRow[] {
  const out: ScopeRow[] = [];
  const byId = new Map<number, ScopeRow>();
  for (const e of list) {
    if (!e || typeof e !== "object") continue;
    let r = byId.get(e.developer_id);
    if (!r) {
      r = {
        developer_id: e.developer_id,
        developer_name: e.developer_name ?? null,
        developer_domain: e.developer_domain ?? null,
        developer_platform: (e as { developer_platform?: string | null }).developer_platform ?? null,
        events: [],
        own: false,
        ipd: false,
        partner: null,
      };
      byId.set(e.developer_id, r);
      out.push(r);
    }
    r.events.push(e);
    if (e.match_type === "ipd" && e.ipd_partner) {
      r.ipd = true;
      r.partner = r.partner ?? e.ipd_partner;
    } else r.own = true;
  }
  return out;
}

/** Search the way the matched lists do: names and domains, any case. */
export function scopeSearch<T extends { developer_name?: string | null; developer_domain?: string | null }>(
  rows: T[],
  q: string,
): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) =>
    [r.developer_name, r.developer_domain].some((v) => typeof v === "string" && v.toLowerCase().includes(needle)),
  );
}

const apps = new Map<string, Promise<MatchedApp[]>>();

/** Every matched app under a search, a line filter and a match type, for
 *  the apps' watch tabs (the crawler cannot filter apps by these yet). */
export function allApps(
  token: string,
  q: string,
  lines: string[],
  matchType: MatchTypeFilter,
  onProgress?: Progress,
): Promise<MatchedApp[]> {
  const key = `${token}|${q}|${lines.join(",")}|${matchType}`;
  let p = apps.get(key);
  if (!p) {
    const read = readAllPages(
      (page) => api.matchedApps(token, page, q, lines, matchType, undefined, READ_PAGE),
      READ_PAGE,
      onProgress,
    );
    p = read;
    read.catch(() => {
      if (apps.get(key) === read) apps.delete(key);
    });
    apps.set(key, read);
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
