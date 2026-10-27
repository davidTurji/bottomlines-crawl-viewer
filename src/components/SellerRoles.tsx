/**
 * SELLER ROLES, ON THE SELLERS.JSON PAGE ONLY (David, 2026-10-27: "I don't
 * want to see any sellers in the overview page. It should all go to the
 * Sellers.json page. Segment it."). The matched lists are about matching
 * and removing; what the seats' sellers.json files say of each matched
 * publisher lives here, as one segment of plain rows: the seller role and
 * who manages it. Searchable and paged on the server, the skeleton while a
 * page loads. The sellers.json alerts ("Listed as DIRECT, but sellers.json
 * names ...") and "Partner inventory on" are shown nowhere in the viewer
 * (David, 2026-10-27).
 *
 * ONLY ON A REPORT THAT READ SELLERS.JSON FIRST. Before crawler #364 the
 * roles were derived without a recent read of the exchanges' files, so a
 * seller ID that IS in sellers.json could read "not in sellers.json". A
 * report carries #364's read summary (``sellers_json_reads`` on its
 * summary) or this segment is one quiet line and nothing else.
 */
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Pager, usePaging } from "@/components/ListControls";
import { gutterDigits, LineNo, SEAT_ROW, SeatLinesFrame } from "@/components/SeatLines";
import { SkeletonInlineRows } from "@/components/Skeleton";
import { api, type MatchedDeveloper, type SellersJsonReads, type Summary } from "@/lib/api";
import { PAGE_SIZE } from "@/lib/paging";

/** "not in sellers.json; owner; reseller" reads "Not in sellers.json; owner;
 *  reseller": the first letter up, the rest as the crawler wrote it. */
function roleText(value: unknown): string {
  const r = typeof value === "string" ? value.trim() : "";
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : "";
}

/** The read summary, when the report carries one (crawler #364). */
export function sellersReadsOf(summary: Summary | null | undefined): SellersJsonReads | null {
  const r: unknown = summary?.sellers_json_reads;
  return r && typeof r === "object" && !Array.isArray(r) ? (r as SellersJsonReads) : null;
}

/** A crawl time as the workbook prints one (run_export.utc_label):
 *  "2026-10-18 11:29 UTC"; the text itself when it is not a time. */
export function utcLabel(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return value;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())} UTC`;
}

/** The crawler's own budget for the build's re-read, when the record
 *  does not say (sellers_json_cache.REPORT_READ_BUDGET_S). */
const READ_BUDGET_S = 600;

/**
 * THE WORKBOOK'S OWN SENTENCE (parity audit of #75): the "Sellers.json
 * read" line of the customer's Excel Summary, built the same way from the
 * same frozen record (crawler #364, run_export.sellers_reads_text, the
 * customer's words): "For 11 of 14 exchanges your seats name (as of
 * 2026-10-18 11:29 UTC). Not read: a.example (never read); b.example
 * (refused us, HTTP 403)." Same N of M, same reasons, same date.
 */
export function readsSentence(reads: SellersJsonReads): string {
  if (reads.unavailable === true)
    return "Not summarised for this report. The seller role says, row by row, whether that exchange's sellers.json was read.";
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);
  const total = n(reads.exchanges);
  const read = n(reads.read);
  if (total === 0) return "None: your seats name no exchange";
  let text = `For ${read} of ${total} exchanges your seats name`;
  const asOf = utcLabel(reads.oldest_read);
  if (read && asOf) text += ` (as of ${asOf})`;
  text += ".";
  const missing = (Array.isArray(reads.not_read) ? reads.not_read : []).filter(
    (m): m is { domain: string; why?: string } => !!m && typeof m === "object" && typeof m.domain === "string",
  );
  if (missing.length) text += ` Not read: ${missing.map((m) => `${m.domain} (${typeof m.why === "string" ? m.why : ""})`).join("; ")}.`;
  const again = (Array.isArray(reads.not_reread) ? reads.not_reread : []).filter((d): d is string => typeof d === "string");
  if (again.length) {
    const budget = Math.trunc(typeof reads.budget_s === "number" && reads.budget_s > 0 ? reads.budget_s : READ_BUDGET_S);
    text += ` Not read again because this report's ${budget} s limit was reached, an earlier read is used: ${again.join(", ")}.`;
  }
  return text;
}

export const ROLES_LATER = "Seller roles will appear here from the next report.";

export default function SellerRoles({
  token,
  summary,
  settled,
}: {
  token: string;
  summary: Summary | null;
  /** Whether the summary request has answered (or failed). */
  settled: boolean;
}) {
  if (!settled) return null;
  const reads = sellersReadsOf(summary);
  if (!reads) {
    return (
      <p data-testid="seller-roles-later" className="text-[12px] text-slate-500">
        {ROLES_LATER}
      </p>
    );
  }
  return <RolesList token={token} reads={reads} />;
}

function RolesList({ token, reads }: { token: string; reads: SellersJsonReads }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const paging = usePaging(setPage);
  const [rows, setRows] = useState<MatchedDeveloper[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setFilter(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);
  useEffect(() => setPage(1), [filter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .matchedDevelopers(token, page, filter)
      .then((r) => {
        if (cancelled) return;
        setRows(Array.isArray(r.rows) ? r.rows.filter((x) => !!x && typeof x === "object") : []);
        setTotal(typeof r.total === "number" ? r.total : 0);
      })
      .catch(() => !cancelled && setError("Could not load the seller roles. Please try again."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, page, filter]);

  const first = (page - 1) * PAGE_SIZE;
  const digits = gutterDigits(first + Math.max(rows.length, 1));
  return (
    <section data-testid="seller-roles" ref={paging.topRef} className="space-y-3">
      <div>
        <h2 className="font-display text-sm font-medium text-slate-700">Seller roles</h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
          What your seats&apos; sellers.json files say of each matched publisher: its role and who manages it.
        </p>
        <p data-testid="seller-roles-read" className="text-[11px] leading-relaxed text-slate-400">
          {readsSentence(reads)}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-x-6">
        <div className="relative w-full min-w-0 sm:min-w-[12rem] sm:flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search publishers"
            aria-label="Search seller roles"
            className="h-10 w-full rounded-full border border-border bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary/40"
          />
        </div>
        {/* No count while a page is on the way: never the old one under a
            new search. */}
        {!loading && !error && total > 0 && (
          <div className="flex min-h-10 items-center justify-end sm:ml-auto sm:flex-shrink-0">
            <Pager
              placement="inline"
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPage={paging.onPage}
              noun="publishers"
              nounOne="publisher"
            />
          </div>
        )}
      </div>
      {loading ? (
        <SkeletonInlineRows rows={6} label="Loading seller roles" />
      ) : error ? (
        <p className="text-sm text-critical">{error}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-slate-500">
          {filter ? `No publishers match "${filter}".` : "No matched publishers in this report."}
        </p>
      ) : (
        <SeatLinesFrame>
          {rows.map((r, i) => (
            <RoleRow key={r.developer_id} row={r} n={first + i + 1} digits={digits} />
          ))}
        </SeatLinesFrame>
      )}
      {!loading && !error && total > PAGE_SIZE && (
        <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={paging.onPage} noun="publishers" />
      )}
    </section>
  );
}

function RoleRow({ row, n, digits }: { row: MatchedDeveloper; n: number; digits: number }) {
  const role = roleText(row.seller_role);
  const managedBy = typeof row.managed_by === "string" ? row.managed_by.trim() : "";
  const name = row.domain || row.name || "Unnamed publisher";
  return (
    <li data-seller-role-row className={SEAT_ROW}>
      <LineNo n={n} digits={digits} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <code className="truncate font-mono text-[11px] leading-4 text-slate-800">{name}</code>
          {row.name && row.domain && row.name !== row.domain && (
            <span className="hidden truncate text-[11px] text-slate-500 sm:inline">{row.name}</span>
          )}
        </div>
        {role || managedBy ? (
          <dl className="flex flex-wrap gap-x-5 gap-y-0.5 text-[11px]">
            {role && (
              <div className="flex min-w-0 gap-1">
                <dt className="flex-shrink-0 text-slate-500">Seller role:</dt>
                <dd className="min-w-0 break-words text-slate-700">{role}</dd>
              </div>
            )}
            {managedBy && (
              <div className="flex min-w-0 gap-1">
                <dt className="flex-shrink-0 text-slate-500">Managed by:</dt>
                <dd className="min-w-0 break-words text-slate-700">{managedBy}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-[11px] text-slate-400">No seller role recorded.</p>
        )}
      </div>
    </li>
  );
}
