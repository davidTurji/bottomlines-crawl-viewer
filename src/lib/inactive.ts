/**
 * INACTIVE, NEVER DELETED (David, 2026-10-08; crawler docs/INACTIVE.md).
 *
 * A report is the difference between two crawls, and so is this: the
 * publishers and apps that carried the reader's lines and WENT INACTIVE
 * BETWEEN the compared crawl and this one, each with the date, the reason
 * and the evidence. The headline numbers count active only; these live in
 * the Inactive tab of the matched list, two lists, and in one quiet "N went
 * inactive since" line.
 *
 * Helpers shared by the section, the quiet line, the API client's fallback
 * for older APIs and the mock.
 */
import type {
  GoneInventory,
  InactiveApp,
  InactiveCounts,
  InactiveKind,
  InactivePage,
  InactivePublisher,
  InactiveRow,
  Summary,
} from "./api";
import { lineKey } from "./lineFilter";

export const INACTIVE_KINDS: InactiveKind[] = ["publishers", "apps"];

/**
 * How many are inactive, for the quiet line and the tab. A report frozen
 * with the section carries ``inactive_counts``; an older one only its No
 * longer live block, which was already per report. Null when the report
 * has neither.
 */
export function inactiveCountsOf(
  summary: Pick<Summary, "inactive_counts" | "gone"> | null | undefined,
): InactiveCounts | null {
  if (!summary) return null;
  const c = summary.inactive_counts;
  if (c) {
    return { publishers: c.publishers ?? 0, apps: c.apps ?? 0 };
  }
  const g = summary.gone;
  if (!g) return null;
  return {
    publishers: g.totals?.publishers ?? g.publishers?.length ?? 0,
    apps: g.totals?.apps ?? g.apps?.length ?? 0,
  };
}

export function inactiveTotal(c: InactiveCounts | null | undefined): number {
  return c ? c.publishers + c.apps : 0;
}

/** "21 Sep", or "21 Sep 2025" outside the current year: these rows are
 *  kept for good, so an old one must not pass for this year's. */
/** The two crawls a report compares: what the Inactive section covers. */
export type CrawlWindow = {
  /** When the compared crawl ran; null when the report does not say. */
  from: string | null;
  /** When this crawl ran. */
  to: string | null;
};

/**
 * Did this row go inactive between the two compared crawls: after the
 * compared crawl and up to this one. By UTC day, the grain of
 * ``inactive_since``: a row found dead BY the compared crawl carries that
 * crawl's day and belongs to the report before. An open end is no bound.
 */
export function inWindow(since: string | null | undefined, w: CrawlWindow): boolean {
  if (!since) return false;
  const day = since.slice(0, 10);
  if (w.from && day <= w.from.slice(0, 10)) return false;
  if (w.to && day > w.to.slice(0, 10)) return false;
  return true;
}

export function inactiveDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/** The customer sentence for a reason code, when a row carries the code
 *  but not the sentence. */
const REASONS: Record<string, string> = {
  domain_gone: "The domain no longer exists",
  certificate_broken: "The website's security certificate is broken",
  site_refuses: "The website refuses connections",
  site_silent: "The website stopped answering",
  no_file: "The website no longer serves an ads.txt or app-ads.txt file",
  retired_by_operator: "Retired by our team",
  removed_by_operator: "Retired by our team",
  unlisted_from_store: "No longer in its store",
  inactive: "No longer active",
};

export function reasonText(row: { reason?: string | null; reason_code?: string | null }): string {
  const said = (row.reason ?? "").trim();
  if (said) return said;
  return REASONS[row.reason_code ?? ""] ?? "No longer active";
}

/** A line the way the customer wrote it: "ssp, seller, DIRECT". */
export function lineText(l: { ssp_domain: string; publisher_id: string; relationship: string }): string {
  return `${l.ssp_domain}, ${l.publisher_id}, ${l.relationship}`;
}

/** Plural noun per list, for counts, pagers and the trial card. */
export function inactiveNoun(kind: InactiveKind, n = 2): string {
  const one = n === 1;
  if (kind === "publishers") return one ? "inactive publisher" : "inactive publishers";
  return one ? "inactive app" : "inactive apps";
}

/** Text a search runs over, the same fields the crawler searches. */
function searchText(kind: InactiveKind, r: InactiveRow): string {
  const parts =
    kind === "publishers"
      ? [(r as InactivePublisher).domain, (r as InactivePublisher).name]
      : [(r as InactiveApp).name, (r as InactiveApp).bundle, (r as InactiveApp).store, (r as InactiveApp).publisher];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * One page of a list, cut the way the crawler cuts it: search, then the
 * seat-line filter (publishers by any of their lines, apps never hidden by
 * it), then the page. Used by the mock and by the
 * fallback for an API older than the /inactive route.
 */
export function pageRows<R extends InactiveRow>(
  kind: InactiveKind,
  rows: R[],
  opts: { page: number; pageSize: number; q?: string; lines?: string[] },
): { rows: R[]; total: number } {
  let out = rows;
  const needle = (opts.q ?? "").trim().toLowerCase();
  if (needle) out = out.filter((r) => searchText(kind, r).includes(needle));
  const want = new Set(opts.lines ?? []);
  if (want.size && kind === "publishers") {
    out = out.filter((r) => ((r as InactivePublisher).lines ?? []).some((l) => want.has(lineKey(l))));
  }
  const start = (opts.page - 1) * opts.pageSize;
  return { rows: out.slice(start, start + opts.pageSize), total: out.length };
}

/**
 * An older report on an API from before the /inactive route (it answers
 * 404): the section is built from the summary's No longer live block, the
 * same derivation the crawler makes for an old link (``derived_from:
 * "gone"``). That block was already per report, so it is shown as it is.
 */
export function pageFromGone(
  gone: GoneInventory | null | undefined,
  kind: InactiveKind,
  opts: { page: number; pageSize: number; q?: string; lines?: string[] },
): InactivePage {
  const counts = inactiveCountsOf({ gone }) ?? { publishers: 0, apps: 0 };
  const base = { kind, page: opts.page, page_size: opts.pageSize, counts, truncated: false };
  if (!gone) return { ...base, total: 0, rows: [], available: false };
  const all: InactiveRow[] =
    kind === "publishers"
      ? (gone.publishers ?? []).map(
          (p): InactivePublisher => ({
            domain: p.domain,
            name: p.name,
            inactive_since: p.since,
            reason_code: null,
            reason: p.reason,
            evidence_summary: "",
            apps: p.apps,
            lines: (p.lines ?? []).map((raw) => {
              const [ssp_domain = "", publisher_id = "", relationship = ""] = raw
                .split(",", 3)
                .map((x) => x.trim());
              return { ssp_domain, publisher_id, relationship };
            }),
          }),
        )
      : (gone.apps ?? []).map(
          (a): InactiveApp => ({
            store: a.store,
            bundle: a.bundle,
            name: a.name,
            publisher: a.publisher,
            inactive_since: a.since,
            reason_code: null,
            reason: a.reason,
            evidence_summary: "",
          }),
        );
  const { rows, total } = pageRows(kind, all, opts);
  return { ...base, total, rows, available: true, derived_from: "gone" };
}
