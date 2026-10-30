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
import { FilterBar, FilterSearch } from "@/components/FilterBar";
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

/** The crawler's own budget for the build's re-read, when the record
 *  does not say (sellers_json_cache.REPORT_READ_BUDGET_S). */
const READ_BUDGET_S = 600;

/**
 * THE "SELLERS.JSON READ" SENTENCE, the Excel Summary's line (reviews of
 * #75). In order:
 *
 *   1. `sentence` (crawler #370): the Excel's own string, frozen with the
 *      report, printed as is.
 *   2. The read's tallies (crawler #364's shape: wanted, fresh, read,
 *      failed_domains, over_budget_domains, budget_s), in the Excel's
 *      words (run_export.sellers_reads_text): "For 2 of 3 exchanges your
 *      seats name. Not read: a.example; b.example (left unread: this
 *      report's 600 s limit for reading sellers.json was reached)." A read
 *      that failed gives no reason in this shape, so none is printed (never
 *      "a.example ()"); the date of the oldest read is not in it either.
 *   3. Neither: null, nothing said (never a wrong "None").
 */
export function readsSentence(reads: SellersJsonReads): string | null {
  if (typeof reads.sentence === "string" && reads.sentence.trim()) return reads.sentence.trim();
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null);
  const wanted = num(reads.wanted);
  if (wanted === null) return null;
  if (wanted === 0) return "None: your seats name no exchange.";
  const usable = (num(reads.fresh) ?? 0) + (num(reads.read) ?? 0);
  let text = `For ${usable} of ${wanted} exchanges your seats name.`;
  const names = (v: unknown) =>
    (Array.isArray(v) ? v : []).filter((d): d is string => typeof d === "string" && !!d.trim()).map((d) => d.trim());
  const budget = Math.trunc(num(reads.budget_s) || READ_BUDGET_S);
  const missing = [
    ...names(reads.failed_domains),
    ...names(reads.over_budget_domains).map(
      (d) => `${d} (left unread: this report's ${budget} s limit for reading sellers.json was reached)`,
    ),
  ];
  if (missing.length) text += ` Not read: ${missing.join("; ")}.`;
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
        {readsSentence(reads) && (
          <p data-testid="seller-roles-read" className="text-[11px] leading-relaxed text-slate-400">
            {readsSentence(reads)}
          </p>
        )}
      </div>
      <FilterBar>
        <FilterSearch value={query} onChange={setQuery} placeholder="Search publishers" ariaLabel="Search seller roles" />
        {!loading && !error && total > 0 && <Pager placement="inline" className="list-toolbar-pager"
          page={page} pageSize={PAGE_SIZE} total={total} onPage={paging.onPage} noun="publishers" nounOne="publisher" />}
      </FilterBar>
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
