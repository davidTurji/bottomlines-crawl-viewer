import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Download, Radar, RotateCw, Search } from "lucide-react";

import { api, type DiscoveredLine, type Summary } from "../lib/api";
import { formatWeek } from "@/components/WeekContextBadge";
import { useReportScope } from "@/lib/reportScope";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * DISCOVERED LINES page.
 *
 * A crawl can keep a line for two different reasons, and the reader deserves
 * to see which one applied. Results and Line changes both answer "where do my
 * exact seat lines appear". This page answers the other question: "who is
 * carrying this SSP at all", which is what a discovery crawl is for. A run
 * that lists carambola.com and carambo.la as discovery domains and no seat
 * lines produces rows here and nowhere else, so without this section that
 * crawl looks empty on every screen.
 *
 * Columns mirror the Discovered sheet of the export workbook exactly
 * (DISCOVERED_COLUMNS in bottomlines-crawl services/run_export.py), in the
 * same order, so the screen and the file a reader downloads agree line for
 * line. Ordering mirrors _DISCOVERED_SQL: developer domain, SSP domain,
 * publisher id.
 */

const PAGE_SIZE = 50;

/** Column order and headers, straight from DISCOVERED_COLUMNS. */
const COLUMNS: { key: keyof DiscoveredLine; label: string }[] = [
  { key: "developer_domain", label: "Developer domain" },
  { key: "developer_name", label: "Developer" },
  { key: "developer_platform", label: "Platform" },
  { key: "ssp_domain", label: "SSP domain" },
  { key: "publisher_id", label: "Publisher ID" },
  { key: "relationship", label: "Relationship" },
  { key: "cert_id", label: "Cert ID" },
  { key: "found_in", label: "Found in" },
  { key: "developer_app_count", label: "Apps" },
];

export default function CrawlDiscovered() {
  const { token } = useReportScope();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<DiscoveredLine[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [ssp, setSsp] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Whether this crawl has any discovered lines at all, independent of the
  // filter. Without it an over-narrow filter would render the "this crawl
  // did not use discovery domains" card, which would be a lie about the
  // crawl rather than a fact about the filter.
  const [anyDiscovered, setAnyDiscovered] = useState<boolean | null>(null);

  const filter = ssp.trim();

  useEffect(() => {
    let cancelled = false;
    api
      .summary(token)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => setPage(1), [ssp]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .discovered(token, {
        page,
        page_size: PAGE_SIZE,
        ssp_domain: filter || undefined,
      })
      .then((r) => {
        if (cancelled) return;
        setRows(r.rows);
        setTotal(r.total);
        // An unfiltered answer settles the question for the whole crawl.
        if (!filter) setAnyDiscovered(r.total > 0);
        else if (r.total > 0) setAnyDiscovered(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, page, filter]);

  const weekLabel = summary?.finished_at
    ? formatWeek(new Date(summary.finished_at))
    : null;

  // Which discovery domains this page of rows actually carries. Deliberately
  // labelled "on this page": the endpoint pages the rows, so counting across
  // the whole crawl here would be a number the screen cannot stand behind.
  const sspsOnPage = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) seen.set(r.ssp_domain, (seen.get(r.ssp_domain) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endRow = Math.min(total, page * PAGE_SIZE);

  // No rows, no filter, and the crawl itself has none: a seat-line-only
  // crawl, which is a normal thing to be, not an error.
  const noDiscovery = !loading && !error && total === 0 && anyDiscovered === false;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      {/* Page header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            Discovered lines
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Lines this crawl kept because their SSP domain is one of the
            discovery domains you asked about, rather than because they matched
            one of your exact seat lines.
          </p>
        </div>
        {weekLabel && (
          <div className="inline-flex flex-shrink-0 items-center gap-2 self-start rounded-full border border-border bg-white/60 px-3 py-1 text-[12px] text-slate-600 shadow-sm sm:self-auto">
            <CalendarClock className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-slate-800">{weekLabel}</span>
          </div>
        )}
      </div>

      {!noDiscovery && (
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-4">
            {/* Sentence case, not the uppercase eyebrow the sibling page
                uses: a value like "Roku" or "app-ads.txt" has to read the
                way the workbook prints it, and a screen that shouts one
                label and not the next looks accidental. */}
            <div className="text-[11px] font-semibold tracking-wide text-slate-500">
              What discovery found
            </div>
            <p className="mt-1 text-xs text-slate-500">
              One row per publisher, SSP account and file, the same rows and the
              same columns as the Discovered sheet of the workbook.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border px-5 py-4">
            <div className="font-mono text-3xl font-semibold leading-none tabular-nums tracking-tight text-slate-900 sm:text-4xl">
              {total.toLocaleString()}
            </div>
            <div className="mt-2 text-[12px] font-medium text-slate-700">
              {filter ? "Discovered lines matching this filter" : "Discovered lines"}
            </div>
            {sspsOnPage.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500">
                  SSP domains on this page:
                </span>
                {sspsOnPage.map(([domain, count]) => (
                  <span
                    key={domain}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] text-slate-700"
                  >
                    <span className="font-medium">{domain}</span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toolbar + table */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        {!noDiscovery && (
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <input
                value={ssp}
                onChange={(e) => setSsp(e.target.value)}
                placeholder="Filter by SSP domain"
                className="h-9 min-w-[260px] rounded-full border border-border bg-white pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary/40"
              />
            </div>
            <button
              onClick={() => {
                setExporting(true);
                downloadCsv(token, filter).finally(() => setExporting(false));
              }}
              disabled={exporting || total === 0}
              className="inline-flex items-center gap-1.5 self-start rounded-full border border-primary/25 bg-white px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-primary"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Preparing..." : "Export CSV"}
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <RotateCw className="h-4 w-4 animate-spin" />
            Loading discovered lines...
          </div>
        )}
        {error && <p className="py-4 text-sm text-critical">{error}</p>}

        {noDiscovery && <NoDiscoveryCard />}

        {!loading && !error && !noDiscovery && rows.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-slate-500">
            No discovered lines match this filter.
          </p>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((c) => (
                    <TableHead
                      key={c.key}
                      className={`whitespace-nowrap ${
                        c.key === "developer_app_count" ? "text-right" : ""
                      }`}
                    >
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow
                    key={`${r.developer_domain}:${r.ssp_domain}:${r.publisher_id}:${r.relationship}:${r.found_in}:${i}`}
                  >
                    <TableCell className="font-medium text-slate-900">
                      {r.developer_domain || <Blank />}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      {r.developer_name || <Blank />}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {r.developer_platform || <Blank />}
                    </TableCell>
                    <TableCell className="text-slate-900">{r.ssp_domain}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-slate-700">
                      {r.publisher_id || <Blank />}
                    </TableCell>
                    <TableCell className="text-xs tracking-wide text-slate-500">
                      {r.relationship || <Blank />}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {r.cert_id || <Blank />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-slate-500">
                      {r.found_in || <Blank />}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-slate-700">
                      {r.developer_app_count.toLocaleString()}
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
    </div>
  );
}

/**
 * The seat-line-only crawl. An empty grid would read as "discovery ran and
 * found nothing", which is the opposite of the truth: discovery never ran,
 * because this crawl was asked to look for exact seat lines only.
 */
function NoDiscoveryCard() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white">
        <Radar className="h-5 w-5 text-slate-400" />
      </div>
      <h2 className="mt-4 text-sm font-semibold text-slate-900">
        This crawl did not use discovery domains
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
        It looked for your exact seat lines, so every line it kept is already on
        the Results and Line changes pages. Nothing was discovered because
        nothing was asked for.
      </p>
      <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">
        A discovery domain is an SSP you want to see in full, whatever the
        publisher account number. Add one to the next crawl and every publisher
        carrying it shows up here.
      </p>
    </div>
  );
}

/** Placeholder for a column the crawler had no value for. */
function Blank() {
  return <span className="text-slate-300">—</span>;
}

/**
 * CSV export. Walks the pages the same way the Results page does, with the
 * same 20-page cap, and carries the active SSP filter so the file matches
 * what is on screen. Header keys and order are DISCOVERED_COLUMNS.
 */
async function downloadCsv(token: string, ssp: string) {
  const header = COLUMNS.map((c) => c.key);
  const acc: DiscoveredLine[] = [];
  const pageSize = 200;
  const cap = 20;
  for (let pageNo = 1; pageNo <= cap; pageNo += 1) {
    const r = await api.discovered(token, {
      page: pageNo,
      page_size: pageSize,
      ssp_domain: ssp || undefined,
    });
    acc.push(...r.rows);
    if (r.rows.length < r.page_size) break;
  }
  const csv = [
    header.join(","),
    ...acc.map((row) =>
      header.map((h) => JSON.stringify(row[h] ?? "")).join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bottomlines-crawl-discovered-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
