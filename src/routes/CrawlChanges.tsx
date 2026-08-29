import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, RotateCw, ShieldCheck } from "lucide-react";

import { api, type LineEvent, type Summary } from "../lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * LINE CHANGES page.
 *
 * One bucket at a time via a tab bar (All, Added, Removed, Cert changes),
 * one full-width Table underneath. The prior three-column layout crammed
 * every row of every bucket into ~400px each and half of every publisher
 * ID was clipped off the right; the tab layout gives every column enough
 * room to render truthfully.
 *
 * Filter row on top: "My seats only" toggle + SSP text filter. Server-
 * side pagination beneath the table.
 */

type Bucket = "all" | "added" | "removed" | "cert_changed";

export default function CrawlChanges() {
  const { token = "" } = useParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [previous, setPrevious] = useState<Summary | null>(null);
  const [bucket, setBucket] = useState<Bucket>("all");
  const [matchedSeatOnly, setMatchedSeatOnly] = useState(false);
  const [ssp, setSsp] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .summary(token)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => {});
    api
      .previousSummary(token)
      .then((p) => !cancelled && setPrevious(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!summary) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  const finishedAt = summary.finished_at ? new Date(summary.finished_at) : null;
  const weekLabel = finishedAt
    ? finishedAt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : `crawl #${summary.crawl_id}`;
  const prevFinished = previous?.finished_at
    ? new Date(previous.finished_at)
    : null;
  const prevWeekLabel = prevFinished
    ? prevFinished.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const totals = summary.hero_diff.line_totals;
  const totalAll = totals.added + totals.removed + totals.cert_changed;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:py-8">
      {/* Header. Plain sentence with the week, no floating chip. */}
      <div>
        <h1 className="font-display text-xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-2xl">
          Line changes
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Every ads.txt and app-ads.txt line that appeared or disappeared this
          week compared to {prevWeekLabel ?? "the previous crawl"}. Week of{" "}
          {weekLabel}.
        </p>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 sm:px-4">
        <label className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm">
          <input
            type="checkbox"
            className="accent-primary"
            checked={matchedSeatOnly}
            onChange={(e) => setMatchedSeatOnly(e.target.checked)}
          />
          My seats only
        </label>
        <input
          type="text"
          placeholder="Filter by SSP domain"
          value={ssp}
          onChange={(e) => setSsp(e.target.value)}
          className="h-9 min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>

      {/* Tabs. One bucket at a time so each row has room to render. */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Tabs value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
            <TabsList>
              <TabsTrigger value="all">
                All <span className="ml-1 font-mono tabular-nums text-slate-500">{totalAll.toLocaleString()}</span>
              </TabsTrigger>
              <TabsTrigger value="added">
                Added <span className="ml-1 font-mono tabular-nums text-ok">+{totals.added.toLocaleString()}</span>
              </TabsTrigger>
              <TabsTrigger value="removed">
                Removed <span className="ml-1 font-mono tabular-nums text-critical">-{totals.removed.toLocaleString()}</span>
              </TabsTrigger>
              <TabsTrigger value="cert_changed">
                Cert changes <span className="ml-1 font-mono tabular-nums text-warn">{totals.cert_changed.toLocaleString()}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <LinesTable
          token={token}
          bucket={bucket}
          ssp={ssp}
          matchedSeatOnly={matchedSeatOnly}
        />
      </div>
    </div>
  );
}

function LinesTable({
  token,
  bucket,
  ssp,
  matchedSeatOnly,
}: {
  token: string;
  bucket: Bucket;
  ssp: string;
  matchedSeatOnly: boolean;
}) {
  const [rows, setRows] = useState<LineEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 50;

  useEffect(() => setPage(1), [bucket, ssp, matchedSeatOnly]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .lineEvents(token, {
        event:
          bucket === "all"
            ? undefined
            : (bucket as "added" | "removed" | "cert_changed"),
        ssp_domain: ssp || undefined,
        matched_seat_only: matchedSeatOnly || undefined,
        page,
      })
      .then((r) => {
        if (cancelled) return;
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, bucket, ssp, matchedSeatOnly, page]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(total, page * pageSize);

  return (
    <div>
      {loading && (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <RotateCw className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      )}
      {error && <p className="py-4 text-sm text-critical">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-slate-500">
          No line changes match this filter.
        </p>
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>SSP</TableHead>
                <TableHead>Publisher ID</TableHead>
                <TableHead>Publisher</TableHead>
                <TableHead>Cert</TableHead>
                <TableHead className="text-right">Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow
                  key={`${r.developer_id}:${r.ssp_domain}:${r.publisher_id}:${r.relationship}:${i}`}
                >
                  <TableCell>
                    <EventGlyph event={r.event} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-900">
                        {r.ssp_domain}
                      </span>
                      {r.matched_seat && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-info">
                          your seat
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-slate-700">
                    {r.publisher_id}
                  </TableCell>
                  <TableCell>
                    <div className="truncate text-sm">
                      {r.developer_name ?? `#${r.developer_id}`}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {r.developer_domain ?? ""}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-slate-500">
                    {r.event === "removed"
                      ? r.old_cert_id
                      : r.event === "added"
                        ? r.new_cert_id
                        : (
                          <span>
                            <span className="text-slate-400 line-through">
                              {r.old_cert_id}
                            </span>
                            <span className="mx-1 text-slate-400">→</span>
                            <span className="text-slate-700">{r.new_cert_id}</span>
                          </span>
                        )}
                  </TableCell>
                  <TableCell className="text-right text-[10px] uppercase tracking-wide text-slate-500">
                    <div>{r.relationship}</div>
                    <div className="text-slate-400">{r.file_kind}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {total > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {startRow.toLocaleString()}-{endRow.toLocaleString()} of{" "}
            {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-border bg-white px-2.5 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="font-mono tabular-nums">
              {page} / {pageCount.toLocaleString()}
            </span>
            <button
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-border bg-white px-2.5 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EventGlyph({ event }: { event: string }) {
  if (event === "added") {
    return <ArrowUp className={cn("h-4 w-4 text-ok")} aria-label="added" />;
  }
  if (event === "removed") {
    return (
      <ArrowDown className={cn("h-4 w-4 text-critical")} aria-label="removed" />
    );
  }
  return (
    <ShieldCheck className={cn("h-4 w-4 text-warn")} aria-label="cert change" />
  );
}
