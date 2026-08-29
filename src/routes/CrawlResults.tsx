import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CalendarClock,
  ChevronRight,
  Download,
  Search,
} from "lucide-react";
import {
  api,
  type LineEvent,
  type MatchedBundle,
  type MatchedDeveloper,
  type Summary,
} from "../lib/api";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatWeek } from "@/components/WeekContextBadge";

/**
 * RESULTS page, "Matched inventory".
 *
 * Layout mirrors the "Your Bottom Line" template from bottomlines-app: a page
 * header with a date chip, two side-by-side hero cards each with a big number
 * and a segmented bar underneath, and then a nested developer list where each
 * row expands to reveal the specific SSP lines that authorized this developer
 * and the app bundles under it.
 *
 * The old flat developers and bundles tables were split, which made the
 * developer-to-app relationship invisible. The nested list keeps that
 * relationship on screen: click a developer, see their lines and their apps.
 */

/** Platforms the crawler cares about. Order matches the top-of-page bar. */
const PLATFORMS = [
  "Web",
  "iOS",
  "Android",
  "Roku",
  "Samsung",
  "Vizio",
  "CTV",
  "FireTV",
  "tvOS",
] as const;

export default function CrawlResults() {
  const { token = "" } = useParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [devs, setDevs] = useState<MatchedDeveloper[]>([]);
  const [bundles, setBundles] = useState<MatchedBundle[]>([]);
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.summary(token).catch(() => null),
      api.matchedDevelopers(token, 1),
      api.matchedBundles(token, 1),
    ])
      .then(([s, d, b]) => {
        if (cancelled) return;
        setSummary(s);
        setDevs(d.rows);
        setBundles(b.rows);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const weekLabel = summary?.finished_at
    ? formatWeek(new Date(summary.finished_at))
    : null;

  const totalDevs = devs.length;
  const totalBundles = bundles.length;

  const bundlesByDeveloper = useMemo(() => {
    const m: Record<number, MatchedBundle[]> = {};
    for (const b of bundles) {
      (m[b.developer_id] ??= []).push(b);
    }
    return m;
  }, [bundles]);

  const filteredDevs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return devs.filter((d) => {
      if (platform !== "all" && d.platform !== platform) return false;
      if (!needle) return true;
      const name = (d.name ?? "").toLowerCase();
      const domain = (d.domain ?? "").toLowerCase();
      return name.includes(needle) || domain.includes(needle);
    });
  }, [devs, search, platform]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      {/* Page header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            Matched inventory
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Every publisher and app whose ads.txt authorized one of your seats this
            week.
          </p>
        </div>
        {weekLabel && (
          <div className="inline-flex flex-shrink-0 items-center gap-2 self-start rounded-full border border-border bg-white/60 px-3 py-1 text-[12px] text-slate-600 shadow-sm sm:self-auto">
            <CalendarClock className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-slate-800">{weekLabel}</span>
          </div>
        )}
      </div>

      {/* One slim hero card. Two big numbers side by side, no bars, no
          pills. Matches the pattern on the Overview page: only stuff
          that provides data. */}
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              What matched this week
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Every publisher whose ads.txt authorized one of your seats, and
              the app bundles underneath them.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border border-border">
          <div className="px-5 py-4">
            <div className="font-mono text-3xl font-semibold leading-none tabular-nums tracking-tight text-slate-900 sm:text-4xl">
              {totalDevs.toLocaleString()}
            </div>
            <div className="mt-2 text-[12px] font-medium text-slate-700">
              Matched developers
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="font-mono text-3xl font-semibold leading-none tabular-nums tracking-tight text-slate-900 sm:text-4xl">
              {totalBundles.toLocaleString()}
            </div>
            <div className="mt-2 text-[12px] font-medium text-slate-700">
              Matched applications
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar + nested list */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search publishers by name or domain"
                className="h-9 min-w-[260px] rounded-full border border-border bg-white pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary/40"
              />
            </div>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="h-9 rounded-full border border-border bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary/40"
            >
              <option value="all">All platforms</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => downloadCsv(token, "developers")}
            className="inline-flex items-center gap-1.5 self-start rounded-full border border-primary/25 bg-white px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground">Loading publishers...</p>
        )}
        {!loading && filteredDevs.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            No publishers match this search.
          </p>
        )}
        {!loading && filteredDevs.length > 0 && (
          <div className="divide-y divide-border rounded-lg border border-border">
            {filteredDevs.map((d) => (
              <DeveloperRow
                key={d.developer_id}
                token={token}
                dev={d}
                bundles={bundlesByDeveloper[d.developer_id] ?? []}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

/**
 * One row in the nested list. The header row shows name, domain, platform
 * and matched line count. The click expands a nested block with the SSP
 * lines that matched, plus the app bundles under this developer.
 */
function DeveloperRow({
  token,
  dev,
  bundles,
}: {
  token: string;
  dev: MatchedDeveloper;
  bundles: MatchedBundle[];
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<LineEvent[] | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);

  useEffect(() => {
    if (!open || lines !== null) return;
    setLoadingLines(true);
    api
      .linesForDeveloper(token, dev.developer_id)
      .then((r) => setLines(r.rows))
      .catch(() => setLines([]))
      .finally(() => setLoadingLines(false));
  }, [open, lines, token, dev.developer_id]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40">
          <ChevronRight
            className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${
              open ? "rotate-90" : ""
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-900">
              {dev.name ?? `Publisher #${dev.developer_id}`}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {dev.domain ?? "no domain on file"}
            </div>
          </div>
          {dev.platform && (
            <span className="hidden rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">
              {dev.platform}
            </span>
          )}
          <div className="text-right">
            <div className="font-mono text-sm font-semibold tabular-nums text-slate-900">
              {dev.line_count.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground">matched lines</div>
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid grid-cols-1 gap-4 border-t border-border bg-muted/20 px-4 py-4 lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Lines that matched this week
            </h3>
            {loadingLines && (
              <p className="mt-2 text-xs text-muted-foreground">Loading lines...</p>
            )}
            {!loadingLines && lines && lines.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                No line-level changes for this publisher this week.
              </p>
            )}
            {!loadingLines && lines && lines.length > 0 && (
              <ul className="mt-2 space-y-1.5 font-mono text-[11.5px] text-slate-700">
                {lines.map((l, i) => (
                  <li
                    key={`${l.ssp_domain}:${l.publisher_id}:${l.relationship}:${i}`}
                    className="rounded-md border border-border bg-white px-2.5 py-1.5"
                  >
                    {l.ssp_domain}, publisher {l.publisher_id}, {l.relationship}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Apps under this publisher
            </h3>
            {bundles.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No matched apps for this publisher this week.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-[12px]">
                {bundles.map((b) => (
                  <li
                    key={`${b.store}:${b.bundle_id}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-white px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-900">
                        {b.app_name ?? "unnamed app"}
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {b.store}, {b.bundle_id}
                      </div>
                    </div>
                    <div className="font-mono text-xs tabular-nums text-slate-700">
                      {b.line_count}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// CSV export walks all pages, same as the previous implementation.
async function downloadCsv(token: string, tab: "developers" | "bundles") {
  const acc: unknown[] = [];
  let header: string[] = [];
  let pageNo = 1;
  const cap = 20;
  while (pageNo <= cap) {
    const r =
      tab === "developers"
        ? await api.matchedDevelopers(token, pageNo)
        : await api.matchedBundles(token, pageNo);
    if (pageNo === 1) {
      header =
        tab === "developers"
          ? ["developer_id", "name", "domain", "platform", "line_count"]
          : [
              "store",
              "bundle_id",
              "app_name",
              "developer_id",
              "developer_name",
              "developer_domain",
              "line_count",
            ];
    }
    acc.push(...(r.rows as unknown[]));
    if (r.rows.length < r.page_size) break;
    pageNo += 1;
  }
  const csv = [
    header.join(","),
    ...acc.map((row) =>
      header
        .map((h) => JSON.stringify(((row as Record<string, unknown>)[h]) ?? ""))
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bottomlines-crawl-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
