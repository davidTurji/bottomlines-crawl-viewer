import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, CircleAlert, Clock, Download, Globe, Landmark, Loader2, Lock, Play, RefreshCw, Search, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import ContactUs from "@/components/ContactUs";
import { PageShell } from "@/components/PageShell";
import SchainHowItWorks from "@/components/SchainHowItWorks";
import { Pager, usePaging } from "@/components/ListControls";
import LockedTail from "@/components/LockedTail";
import { SkeletonRows, SkeletonStatCards } from "@/components/Skeleton";
import TrialBanner from "@/components/TrialBanner";
import { formatWeek, WeekLine } from "@/components/WeekLine";
import { lineKey, lineLabel, sourceHint } from "@/lib/lineFilter";
import { useReportScope } from "@/lib/reportScope";
import { PAGE_SIZE } from "@/lib/paging";
import { cn, foundInLabel, storeLabel } from "@/lib/utils";

import {
  api,
  ApiError,
  type SchainOverview,
  type SchainPreview,
  type SchainPublisherRow,
  type SchainRow,
  type SchainSdk,
  type SchainSdkRead,
  type SchainSeatCount,
  type SchainSelection,
  type Summary,
} from "../lib/api";
import { MatchedTile, MiniStat, SplitStat } from "./CrawlReport";

/**
 * SCHAIN EXPORT.
 *
 * The customer builds their own schain file from this week's report: pick an
 * SDK from their own sellers.json, one of their seat lines and the reseller
 * line (their domain plus the SDK's Seller ID there), run it, and download.
 * Three downloads per link; the same selection again is free.
 *
 * Everything is frozen at bake time except one thing: the SDK's sellers.json
 * is read live the moment it is picked, because step 3 (the SDK vouches for
 * the publisher's account) should be true of the SDK's file today.
 *
 * MINIMAL ON PURPOSE (David, 2026-10-04): one KPI card, one builder, and
 * after Run one result card. The step-by-step lives behind How it works.
 */
/** Every builder panel is this tall, whatever it holds; each scrolls
 *  inside itself rather than growing the row (David, 2026-10-04). */
const PANEL = "flex h-[440px] min-h-0 flex-col p-4 sm:p-5";

export default function CrawlSchain() {
  const { token } = useReportScope();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summarySettled, setSummarySettled] = useState(false);
  const [overview, setOverview] = useState<SchainOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sdk, setSdk] = useState<SchainSdk | null>(null);
  const [read, setRead] = useState<SchainSdkRead | "reading" | null>(null);
  const [counts, setCounts] = useState<SchainSeatCount[] | null>(null);
  const [seat, setSeat] = useState<string | null>(null);
  const [sid2, setSid2] = useState<string | null>(null);
  /** The selection the last Run was made with; the result shows only while
   *  the picks still match it. */
  const [ran, setRan] = useState<SchainSelection | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .summary(token)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => {})
      .finally(() => !cancelled && setSummarySettled(true));
    api
      .schain(token)
      .then((o) => !cancelled && setOverview(o))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Picking an SDK takes the copy of its sellers.json saved with this
  // report, then counts what closes through it per seat line. Refresh
  // re-reads it live. A pick made while a read is in flight wins.
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    const refresh = refreshTick > 0;
    setRead("reading");
    setCounts(null);
    if (!refresh) setSid2(sdk.seller_ids.length === 1 ? sdk.seller_ids[0] : null);
    // A refreshed file can change who passes step 3: an old result would
    // be a claim about a file we no longer use.
    setRan(null);
    api
      .schainReadSdk(token, sdk.domain, { refresh })
      .then(async (r) => {
        if (cancelled) return;
        setRead(r);
        if (!r.ok) return;
        const c = await api.schainSeatCounts(token, sdk.domain, r.source === "live");
        if (!cancelled) setCounts(c);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setRead({ ok: false, domain: sdk.domain, url: `https://${sdk.domain}/sellers.json`, reason: e.message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sdk, token, refreshTick]);

  const sdkReady = !!read && read !== "reading" && read.ok;
  const live = !!read && read !== "reading" && read.ok && read.source === "live";
  // Memoised: the result card refetches when its selection changes, and a
  // fresh object every render would read as a change on every render.
  const sdkDomain = sdk?.domain ?? null;
  const selection: SchainSelection | null = useMemo(
    () => (sdkDomain && sdkReady && seat && sid2 ? { sdk: sdkDomain, seat, sid2, live } : null),
    [sdkDomain, sdkReady, seat, sid2, live],
  );
  const selKey = selection ? `${selection.sdk}|${selection.seat}|${selection.sid2}` : null;
  const ranKey = ran ? `${ran.sdk}|${ran.seat}|${ran.sid2}` : null;
  const showResult = !!selection && selKey === ranKey;

  const seatLine = useMemo(() => {
    if (!seat) return null;
    const [ssp, pid, rel] = seat.split("|");
    return `${ssp}, ${pid}, ${rel}`;
  }, [seat]);

  const weekLabel = summary?.finished_at ? formatWeek(new Date(summary.finished_at)) : null;
  const trial = !!overview?.trial || !!summary?.trial;

  const howCtx = {
    resellerDomain: overview?.reseller_domain ?? "your domain",
    sdk: sdk?.domain ?? null,
    seatLine,
    sid2,
    crawledOn: overview?.crawled_at ? shortDate(overview.crawled_at) : null,
    limit: overview?.downloads.limit ?? 3,
  };

  return (
    <PageShell>
      {summary?.trial && <TrialBanner caps={summary.trial} summary={summary} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" data-tour="schain-header">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            Schain
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            An schain file for one of your seat lines, through any SDK in your sellers.json.
          </p>
          <WeekLine week={weekLabel} pending={!summarySettled} className="mt-1.5" />
        </div>
        <span data-tour="schain-how" className="flex-shrink-0">
          <SchainHowItWorks ctx={howCtx} />
        </span>
      </div>

      {error && <p className="py-4 text-sm text-critical">{error}</p>}
      {!overview && !error && <SkeletonStatCards />}
      {overview && overview.status !== "ok" && <NotAvailable overview={overview} />}

      {overview && overview.status === "ok" && (
        <>
          <Kpis overview={overview} trial={trial} />

          <AsOf overview={overview} sdk={sdk} read={read} />

          <div className="rounded-2xl border border-border bg-white shadow-sm" data-tour="schain-builder">
            <div className="grid divide-y divide-border lg:grid-cols-[1fr_1.15fr_1.15fr] lg:divide-x lg:divide-y-0">
              <SdkStep
                overview={overview}
                selected={sdk}
                read={read}
                onPick={(s) => {
                  if (s.domain === sdk?.domain) return;
                  setRefreshTick(0);
                  setSdk(s);
                }}
                onRefresh={() => setRefreshTick((t) => t + 1)}
              />
              <SeatStep overview={overview} sdk={sdk} ready={sdkReady} counts={counts} selected={seat} onPick={setSeat} />
              <ChainStep
                overview={overview}
                sdk={sdk}
                ready={sdkReady}
                seatLine={seatLine}
                sid2={sid2}
                onPickSid2={setSid2}
              />
            </div>
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="min-w-0 truncate text-[12px] text-slate-500">
                {selection && seatLine ? (
                  <>
                    <span className="font-mono text-slate-700">{seatLine}</span>
                    <span className="mx-1.5 text-slate-300">via</span>
                    <span className="font-mono text-slate-700">{selection.sdk}</span>
                  </>
                ) : !sdk ? (
                  "Pick an SDK to start."
                ) : !sdkReady ? (
                  "Reading the SDK's sellers.json."
                ) : !seat ? (
                  "Pick a seat line."
                ) : (
                  "Pick the reseller line."
                )}
              </p>
              <button
                type="button"
                disabled={!selection || showResult}
                onClick={() => setRan(selection)}
                className="inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-[hsl(150_58%_22%)] px-5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:-translate-y-px hover:shadow-md disabled:pointer-events-none disabled:opacity-40"
              >
                <Play className="h-3.5 w-3.5" />
                Run report
              </button>
            </div>
          </div>

          {showResult && selection && sdk && seatLine && (
            <Result
              key={selKey!}
              token={token}
              overview={overview}
              selection={selection}
              sdk={sdk}
              seatLine={seatLine}
              trial={trial}
              summary={summary}
              asOf={asOfParts(overview, sdk, read)}
              onDownloaded={(used) =>
                setOverview((o) =>
                  o
                    ? {
                        ...o,
                        downloads: {
                          ...o.downloads,
                          used,
                          selections: Array.from(new Set([...o.downloads.selections, selKey!])),
                        },
                      }
                    : o,
                )
              }
            />
          )}
        </>
      )}
    </PageShell>
  );
}

/* ── KPIs ──────────────────────────────────────────────────────────── */

function Kpis({ overview, trial }: { overview: SchainOverview; trial: boolean }) {
  const ids = overview.sdks.reduce((n, s) => n + s.seller_ids.length, 0);
  const left = trial ? 0 : Math.max(0, overview.downloads.limit - overview.downloads.used);
  // Three left is green, two amber, one or none red.
  const leftTone = left >= 3 ? ("ok" as const) : left === 2 ? ("warn" as const) : ("critical" as const);
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm" data-tour="schain-kpi">
      <div className="mb-3">
        <div className="font-display text-sm font-medium text-slate-700">Your sellers.json</div>
        <div className="text-[11px] text-slate-500">
          {overview.reseller_domain}/sellers.json, read {shortDate(overview.sellers_json_read_at)}
        </div>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-xl border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <SplitStat
          tone="info"
          number={overview.sdks.length}
          label="SDKs in your sellers.json"
          hint={`of ${overview.sdk_catalog_size} popular SDKs we track`}
        />
        <SplitStat tone="special" number={ids} label="Seller IDs for them" hint="each one a reseller line" />
        <SplitStat
          tone={leftTone}
          number={left}
          label="Downloads left"
          hint={trial ? "with the full report" : `of ${overview.downloads.limit} on this link`}
        />
      </div>
    </div>
  );
}

/* ── As of ─────────────────────────────────────────────────────────── */

/**
 * WHAT MOMENT THIS LIST IS TRUE OF (David, 2026-10-04). A schain list is
 * only as current as the files behind it, so the page says which: this
 * week's crawl of the publishers' files, the customer's sellers.json as read
 * for the report, and the SDK's sellers.json, saved or refreshed.
 */
type AsOfPart = { label: string; value: string };

function asOfParts(overview: SchainOverview, sdk: SchainSdk | null, read: SchainSdkRead | "reading" | null) {
  const parts: AsOfPart[] = [
    { label: "Publisher files", value: `crawled ${shortDate(overview.crawled_at)}` },
    { label: "Your sellers.json", value: `read ${shortDate(overview.sellers_json_read_at)}` },
  ];
  if (sdk && read && read !== "reading" && read.ok) {
    parts.push({
      label: `${sdk.domain}/sellers.json`,
      value: read.source === "live" ? `read live ${stamp(read.read_at)}` : `read ${stamp(read.read_at)}`,
    });
  }
  return parts;
}

function AsOf({
  overview,
  sdk,
  read,
}: {
  overview: SchainOverview;
  sdk: SchainSdk | null;
  read: SchainSdkRead | "reading" | null;
}) {
  const parts = asOfParts(overview, sdk, read);
  return (
    <div
      data-tour="schain-asof"
      className="flex items-start gap-2.5 rounded-xl border border-warn-border bg-warn-bg/60 px-4 py-2.5 text-[12px] text-slate-700"
    >
      <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warn" />
      <p className="min-w-0 leading-relaxed">
        <span className="font-medium text-slate-900">This list is only true as of these dates. </span>
        {parts.map((p, i) => (
          <span key={p.label}>
            {p.label} {p.value}
            {i < parts.length - 1 ? ", " : "."}
          </span>
        ))}{" "}
        A publisher can change their file after that.
      </p>
    </div>
  );
}

/* ── The three steps ───────────────────────────────────────────────── */

function StepHead({ n, title, hint, done }: { n: number; title: string; hint: string; done: boolean }) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span
        className={cn(
          "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold",
          done ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-[11px] leading-snug text-slate-500">{hint}</div>
      </div>
    </div>
  );
}

function SdkStep({
  overview,
  selected,
  read,
  onPick,
  onRefresh,
}: {
  overview: SchainOverview;
  selected: SchainSdk | null;
  read: SchainSdkRead | "reading" | null;
  onPick: (s: SchainSdk) => void;
  onRefresh: () => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const tones = useMemo(() => tonesFor(overview.sdks.map((s) => s.domain)), [overview.sdks]);
  const list = needle
    ? overview.sdks.filter((s) => s.name.toLowerCase().includes(needle) || s.domain.includes(needle))
    : overview.sdks;
  return (
    <div className={PANEL}>
      <StepHead
        n={1}
        title="SDK"
        hint="From your sellers.json"
        done={!!selected && !!read && read !== "reading" && read.ok}
      />
      {overview.sdks.length > 6 && (
        <label className="mb-2 flex h-8 items-center gap-2 rounded-lg border border-border px-2.5 focus-within:border-primary/40">
          <Search aria-hidden className="h-3.5 w-3.5 text-slate-300" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find an SDK"
            aria-label="Find an SDK"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
          />
        </label>
      )}
      <div className="scroll-y min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-white">
        {list.map((s) => {
          const on = selected?.domain === s.domain;
          return (
            <button
              key={s.domain}
              type="button"
              onClick={() => onPick(s)}
              aria-pressed={on}
              className={cn(
                "flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0",
                on ? "bg-primary/[0.06]" : "hover:bg-muted/40",
              )}
            >
              <SdkAvatar name={s.name} tone={tones.get(s.domain) ?? AVATAR_HEX[0]} on={on} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-slate-900">{s.name}</span>
                <span className="block truncate font-mono text-[11px] text-slate-500">{s.domain}</span>
              </span>
              <span className="flex-shrink-0 text-right text-[10px] text-slate-400">
                Seller ID
                <span className="block font-mono text-[11px] text-slate-600">
                  {s.seller_ids.length === 1 ? s.seller_ids[0] : `${s.seller_ids.length} to pick from`}
                </span>
              </span>
            </button>
          );
        })}
        {list.length === 0 && <p className="px-2 py-3 text-xs text-slate-500">No SDK matches.</p>}
      </div>
      {selected && read && <SdkCopy read={read} onRefresh={onRefresh} />}
    </div>
  );
}

/**
 * An SDK's monogram, drawn exactly like the connector tiles in the
 * bottomlines app (src/components/ingestor/ConnectorBrand.tsx): a solid
 * brand colour, faded a touch toward the corner, a hairline white ring, and
 * two letters in white or ink, whichever reads on that colour. The colours
 * are the app's own connector colours.
 */
const AVATAR_HEX = [
  "#10B981", // green
  "#E11D48", // red
  "#EA580C", // orange
  "#7C3AED", // purple
  "#0B5CD5", // blue
  "#F59E0B", // amber
  "#0EA5E9", // sky
  "#8B5CF6", // violet
  "#1E40AF", // navy
  "#0071B2", // ocean
  "#0D9488", // teal
  "#DB2777", // pink
];

function hashOf(domain: string): number {
  let x = 0x811c9dc5;
  for (let i = 0; i < domain.length; i += 1) {
    x ^= domain.charCodeAt(i);
    x = Math.imul(x, 0x01000193);
  }
  return x >>> 0;
}

/** One colour per SDK, no two alike in the list while there are colours to
 *  go round: each SDK starts at its domain's colour and steps to the next
 *  free one, in domain order, so the answer is the same every load. */
function tonesFor(domains: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<number>();
  for (const d of [...domains].sort()) {
    let i = hashOf(d) % AVATAR_HEX.length;
    if (used.size < AVATAR_HEX.length) {
      while (used.has(i)) i = (i + 1) % AVATAR_HEX.length;
    }
    used.add(i);
    out.set(d, AVATAR_HEX[i]);
  }
  return out;
}

/** White on a dark colour, ink on a light one (ConnectorBrand's rule). */
function readableFg(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#0f172a" : "#ffffff";
}

function SdkAvatar({
  name,
  tone,
  on,
  size = "md",
}: {
  name: string;
  tone: string;
  on: boolean;
  size?: "md" | "lg";
}) {
  const letters = (name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "?").replace(
    /^(.)(.?)/,
    (_, a: string, b: string) => a.toUpperCase() + b.toLowerCase(),
  );
  return (
    <span
      className={cn(
        "flex flex-shrink-0 items-center justify-center rounded-full font-semibold tracking-tight shadow-sm ring-1 ring-inset ring-white/30",
        size === "lg" ? "h-9 w-9 text-[12px]" : "h-8 w-8 text-[11px]",
        on && "outline outline-2 outline-offset-2 outline-primary/60",
      )}
      style={{ color: readableFg(tone), background: `linear-gradient(135deg, ${tone} 0%, ${tone}b3 100%)` }}
    >
      {letters}
    </span>
  );
}

/**
 * Which copy of the SDK's sellers.json the checks use, and the way to a
 * fresher one. The copy saved with the report keeps the whole list true of
 * one moment; Refresh reads the SDK's file live. Never the customer's own
 * file, which is read once, when the report is made.
 */
function SdkCopy({ read, onRefresh }: { read: SchainSdkRead | "reading"; onRefresh: () => void }) {
  if (read === "reading") {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Reading its sellers.json
      </p>
    );
  }
  const refresh = (
    <button
      type="button"
      onClick={onRefresh}
      className="ml-auto inline-flex flex-shrink-0 items-center gap-1 font-medium text-primary hover:underline"
    >
      <RefreshCw className="h-3 w-3" />
      Refresh
    </button>
  );
  if (!read.ok) {
    return (
      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-critical">
        <CircleAlert className="mt-px h-3.5 w-3.5 flex-shrink-0" />
        <span className="min-w-0">Could not read {read.url.replace(/^https?:\/\//, "")}: {read.reason}</span>
        {refresh}
      </p>
    );
  }
  return (
    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
      <Check className="h-3.5 w-3.5 flex-shrink-0 text-ok" />
      <span className="min-w-0 truncate">
        {read.source === "live" ? "Read live just now" : `Saved with this report, ${stamp(read.read_at)}`},{" "}
        {read.sellers_count.toLocaleString()} sellers
      </span>
      {refresh}
    </p>
  );
}

function SeatStep({
  overview,
  sdk,
  ready,
  counts,
  selected,
  onPick,
}: {
  overview: SchainOverview;
  sdk: SchainSdk | null;
  ready: boolean;
  counts: SchainSeatCount[] | null;
  selected: string | null;
  onPick: (seat: string) => void;
}) {
  const byKey = new Map((counts ?? []).map((c) => [c.seat, c]));
  const counting = !!sdk && (!ready || counts === null);
  return (
    <div className={PANEL}>
      <StepHead
        n={2}
        title="Seat line"
        hint={sdk ? `Apps that close a chain through ${sdk.name}` : "Pick an SDK first"}
        done={!!selected && ready}
      />
      {/* Drawn as the overview's line filter draws a line: the line itself
          in mono, verbatim, a hint in words under it, a hairline between
          one line and the next. */}
      <LineList>
        {overview.seat_lines.map((l) => {
          const key = lineKey(l);
          const c = byKey.get(key);
          const empty = ready && counts !== null && (!c || c.apps === 0);
          const on = selected === key;
          const disabled = !ready || counts === null || empty;
          return (
            <LineRow
              key={key}
              on={on}
              disabled={disabled}
              faded={!sdk || empty}
              onPick={() => onPick(key)}
              line={lineLabel(l)}
              hint={
                counting ? null : !sdk ? (
                  sourceHint(l) ?? "\u00a0"
                ) : c && c.apps > 0 ? (
                  <>
                    <span className="tabular-nums text-slate-600">{c.apps.toLocaleString()}</span> apps from{" "}
                    <span className="tabular-nums text-slate-600">{c.publishers.toLocaleString()}</span> publishers
                  </>
                ) : (
                  `No chain through ${sdk.name}`
                )
              }
            />
          );
        })}
      </LineList>
    </div>
  );
}

/**
 * THE CHAIN, drawn as it fills in.
 *
 * The third panel used to be a reseller line to pick, but the SDK already
 * decides it (the SDK's Seller ID in the customer's sellers.json), so the
 * panel shows what the picks add up to: the hops every row of the file
 * proves, top to bottom, stretched to the panel's height.
 *
 *   - The publisher's app, with the three lines its app-ads.txt must carry.
 *     Each line wears the colour of the hop it opens: the DIRECT line the
 *     SDK's, the reseller line yours, the seat line your seat's.
 *   - Node 1: the SDK, its own mark, and the publisher's account there.
 *   - Node 2: you, and your Seller ID for the SDK. When the SDK is in the
 *     sellers.json under more than one ID, the one choice left is made here.
 *   - Your seat, the line you picked.
 *
 * A hop not yet known is a dashed placeholder; a connector turns solid once
 * both of its ends are known.
 */
function ChainStep({
  overview,
  sdk,
  ready,
  seatLine,
  sid2,
  onPickSid2,
}: {
  overview: SchainOverview;
  sdk: SchainSdk | null;
  ready: boolean;
  seatLine: string | null;
  sid2: string | null;
  onPickSid2: (id: string) => void;
}) {
  const tones = useMemo(() => tonesFor(overview.sdks.map((s) => s.domain)), [overview.sdks]);
  const sdkHex = sdk ? (tones.get(sdk.domain) ?? AVATAR_HEX[0]) : null;
  const many = !!sdk && sdk.seller_ids.length > 1;
  const done = !!sdk && ready && !!seatLine && !!sid2;
  const [ssp, seatId, seatRel] = seatLine ? seatLine.split(", ") : [];
  const SEAT_HEX = "#0B5CD5";

  return (
    <div className={PANEL}>
      <StepHead n={3} title="The chain" hint="What every row of your file proves" done={done} />

      <div className="scroll-y -mr-1 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        {/* 1. The publisher's app, and what it has to carry. */}
        <HopCard filled={!!sdk || !!seatLine}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-app-border bg-app-bg text-app">
              <Smartphone className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-slate-500">The publisher's app</div>
              <div className="text-[13px] font-semibold text-slate-900">Its app-ads.txt carries</div>
            </div>
          </div>
          <div className="mt-2.5 space-y-1 rounded-lg border border-border bg-muted/30 p-2 font-mono text-[11px] leading-[16px]">
            <FileLine hex={seatLine ? SEAT_HEX : null} text={seatLine ?? "<your seat line>"} />
            <FileLine
              hex={sdkHex}
              text={sdk ? `${sdk.domain}, <their id>, DIRECT` : "<sdk>, <their id>, DIRECT"}
            />
            <FileLine
              hex={sdk && sid2 ? "hsl(var(--primary))" : null}
              text={`${overview.reseller_domain}, ${sdk && sid2 ? sid2 : "<your id>"}, RESELLER`}
            />
          </div>
        </HopCard>

        <Connector on={!!sdk} hex={sdkHex} label="sells to" />

        {/* 2. Node 1: the SDK. */}
        <HopCard filled={!!sdk}>
          <div className="flex items-center gap-3">
            {sdk && sdkHex ? <SdkAvatar name={sdk.name} tone={sdkHex} on={false} size="lg" /> : <EmptyDisc />}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium text-slate-500">Node 1, the SDK</div>
              <div className={cn("truncate text-[13px] font-semibold", sdk ? "text-slate-900" : "text-slate-400")}>
                {sdk ? sdk.name : "Pick an SDK"}
              </div>
              <div className="truncate font-mono text-[11px] text-slate-500">
                {sdk ? `asi1 ${sdk.domain}, sid1 the publisher's id` : "asi1, sid1"}
              </div>
            </div>
          </div>
        </HopCard>

        <Connector on={!!sdk && !!sid2} hex="hsl(var(--primary))" label="sells to" />

        {/* 3. Node 2: you. */}
        <HopCard filled={!!sdk && !!sid2}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[hsl(150_58%_22%)] text-[11px] font-semibold text-primary-foreground shadow-sm ring-1 ring-inset ring-white/30">
              You
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium text-slate-500">Node 2, you</div>
              <div className="truncate text-[13px] font-semibold text-slate-900">{overview.customer_name}</div>
              {!many && (
                <div className="truncate font-mono text-[11px] text-slate-500">
                  asi2 {overview.reseller_domain}, sid2 {sdk && sid2 ? sid2 : "comes with the SDK"}
                </div>
              )}
            </div>
          </div>
          {many && sdk && (
            <div className="mt-2.5">
              <div className="text-[10px] text-slate-500">
                {sdk.name} is in your sellers.json under {sdk.seller_ids.length} IDs. Pick one
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {sdk.seller_ids.map((id) => (
                  <button
                    key={id}
                    type="button"
                    disabled={!ready}
                    onClick={() => onPickSid2(id)}
                    aria-pressed={sid2 === id}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] transition-colors",
                      sid2 === id
                        ? "border-primary/40 bg-primary/[0.08] text-slate-900"
                        : "border-border bg-white text-slate-600 hover:border-primary/30",
                      !ready && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <Radio on={sid2 === id} />
                    {id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </HopCard>

        <Connector on={!!seatLine && !!sid2} hex={SEAT_HEX} label="buys on" />

        {/* 4. Your seat. */}
        <HopCard filled={!!seatLine}>
          <div className="flex items-center gap-3">
            {seatLine ? (
              <span
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white shadow-sm ring-1 ring-inset ring-white/30"
                style={{ background: `linear-gradient(135deg, ${SEAT_HEX} 0%, ${SEAT_HEX}b3 100%)` }}
              >
                <Landmark className="h-4 w-4" />
              </span>
            ) : (
              <EmptyDisc />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium text-slate-500">Your seat</div>
              <div className={cn("truncate text-[13px] font-semibold", seatLine ? "text-slate-900" : "text-slate-400")}>
                {seatLine ? ssp : "Pick a seat line"}
              </div>
              <div className="truncate font-mono text-[11px] text-slate-500">
                {seatLine ? `${seatId}, ${seatRel}` : "ssp, seller id, relationship"}
              </div>
            </div>
          </div>
        </HopCard>
      </div>
    </div>
  );
}

function EmptyDisc() {
  return <span className="block h-9 w-9 flex-shrink-0 rounded-full border border-dashed border-slate-300 bg-white" />;
}

function HopCard({ filled, children }: { filled: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex-shrink-0 rounded-xl border px-3 py-2.5 transition-colors",
        filled ? "border-border bg-white shadow-sm" : "border-dashed border-slate-300 bg-white/60",
      )}
    >
      {children}
    </div>
  );
}

/** A connector that grows with the panel, so the chain fills its height. */
function Connector({ on, hex, label }: { on: boolean; hex: string | null; label: string }) {
  return (
    <div className="flex min-h-[22px] flex-1 flex-shrink-0 basis-[22px] items-stretch pl-[29px]">
      <div className="flex flex-col items-center">
        <span
          className={cn("w-0.5 flex-1 rounded-full", !on && "border-l-2 border-dashed border-slate-200 bg-transparent")}
          style={on && hex ? { background: hex, opacity: 0.55 } : undefined}
        />
        <span
          aria-hidden
          className="h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent"
          style={{ borderTopColor: on && hex ? hex : "#e2e8f0", opacity: on ? 0.75 : 1 }}
        />
      </div>
      <span className={cn("ml-2.5 self-center text-[10px]", on ? "text-slate-500" : "text-slate-300")}>{label}</span>
    </div>
  );
}

/** One line of the publisher's file, marked with the colour of the hop it opens. */
function FileLine({ hex, text }: { hex: string | null; text: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={cn("h-3 w-1 flex-shrink-0 rounded-full", !hex && "bg-slate-200")}
        style={hex ? { background: hex } : undefined}
      />
      <span className={cn("truncate", hex ? "text-slate-800" : "text-slate-400")}>{text}</span>
    </div>
  );
}

function LineList({ children }: { children: ReactNode }) {
  return (
    <div className="scroll-y min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-white">
      {children}
    </div>
  );
}

function LineRow({
  on,
  disabled,
  faded,
  onPick,
  line,
  hint,
}: {
  on: boolean;
  disabled: boolean;
  faded: boolean;
  onPick: () => void;
  line: string;
  /** null while counting: a shimmer holds the hint's place. */
  hint: ReactNode | null;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      aria-pressed={on}
      className={cn(
        "flex w-full items-start gap-2.5 border-b border-border px-3 py-2 text-left transition-colors last:border-b-0",
        on ? "bg-primary/[0.06]" : !disabled && "hover:bg-muted/40",
        disabled && "cursor-not-allowed",
        faded && "opacity-50",
      )}
    >
      <span className="mt-[2px]">
        <Radio on={on} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="truncate font-mono text-[12px] leading-[18px] text-slate-900">{line}</span>
        {hint === null ? (
          <span className="my-[3px] block h-2 w-32 animate-pulse rounded bg-muted" />
        ) : (
          <span className="truncate text-[10.5px] leading-[14px] text-slate-400">{hint}</span>
        )}
      </span>
    </button>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border",
        on ? "border-primary bg-primary" : "border-slate-300 bg-white",
      )}
    >
      {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
    </span>
  );
}

/* ── The result ────────────────────────────────────────────────────── */

type ListView = "publishers" | "apps";

function Result({
  token,
  overview,
  selection,
  sdk,
  seatLine,
  trial,
  summary,
  asOf,
  onDownloaded,
}: {
  token: string;
  overview: SchainOverview;
  selection: SchainSelection;
  sdk: SchainSdk;
  seatLine: string;
  trial: boolean;
  summary: Summary | null;
  asOf: AsOfPart[];
  onDownloaded: (used: number) => void;
}) {
  const [view, setView] = useState<ListView>("publishers");
  const [page, setPage] = useState(1);
  const paging = usePaging(setPage);
  const [preview, setPreview] = useState<SchainPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => setPage(1), [view]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setOpen(new Set());
    api
      .schainPreview(token, selection, { page, page_size: PAGE_SIZE, view })
      .then((p) => !cancelled && setPreview(p))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, selection, page, view]);

  if (error) return <p className="py-2 text-sm text-critical">{error}</p>;
  if (!preview) return <SkeletonStatCards />;

  const f = preview.funnel;
  const t = preview.totals;
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-6" data-tour="schain-result">
      {/* What was run, and the one way out of the page: the file. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 truncate text-[12px] text-slate-500">
          <span className="font-mono text-slate-700">{seatLine}</span> via{" "}
          <span className="font-mono text-slate-700">{sdk.domain}</span>, resold as{" "}
          <span className="font-mono text-slate-700">
            {overview.reseller_domain}, {selection.sid2}
          </span>
        </p>
        <Download3
          token={token}
          selection={selection}
          overview={overview}
          trial={trial}
          empty={t.apps === 0}
          seatLine={seatLine}
          sdk={sdk}
          asOf={asOf}
          onDownloaded={onDownloaded}
        />
      </div>

      {/* The overview's two KPI cards, in its own grammar: the checks as
          split stats on the left, the answer as the two tiles that switch
          the list on the right. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-3">
            <div className="font-display text-sm font-medium text-slate-700">The four checks</div>
            <div className="text-[11px] text-slate-500">Publishers left after each one</div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border lg:grid-cols-4 lg:divide-y-0">
            <SplitStat tone="info" number={f.seat_publishers} label="Carry your seat line" hint="Step 1 of 4" />
            <SplitStat tone="special" number={f.with_sdk_direct} label={`Sell ${sdk.name} directly`} hint="Step 2 of 4" />
            <SplitStat tone="warn" number={f.owned_by_them} label={`${sdk.name} vouches for them`} hint="Step 3 of 4" />
            <SplitStat tone="publisher" number={f.reseller_authorised} label="Carry your reseller line" hint="Step 4 of 4" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-3">
            <div className="font-display text-sm font-medium text-slate-700">In your file</div>
            <div className="text-[11px] text-slate-500">Click one to switch the list below</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MatchedTile
              tone="publisher"
              icon={Globe}
              number={t.publishers}
              label="Publishers close the chain"
              active={view === "publishers"}
              onClick={() => setView("publishers")}
            />
            <MatchedTile
              tone="app"
              icon={Smartphone}
              number={t.apps}
              label="Apps close the chain"
              active={view === "apps"}
              onClick={() => setView("apps")}
            />
          </div>
        </div>
      </div>

      {t.apps > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">
              {view === "publishers" ? "Publishers that close the chain" : "Apps that close the chain"}
            </h2>
            <p className="text-sm text-slate-500">
              {view === "publishers"
                ? "Click a row to see the exact lines its file carries."
                : "Click a row to see the chain the app sells through."}
            </p>
          </div>

          {!trial && preview.total > PAGE_SIZE && (
            <Pager
              placement="top"
              anchorRef={paging.topRef}
              page={page}
              pageSize={PAGE_SIZE}
              total={preview.total}
              onPage={paging.onPage}
              noun={view}
            />
          )}

          {loading ? (
            <SkeletonRows rows={5} label={`Loading ${view}`} />
          ) : (
            <div className="space-y-3">
              {view === "publishers"
                ? (preview.rows as SchainPublisherRow[]).map((r) => (
                    <SchainPublisherCard
                      key={r.publisher_domain}
                      row={r}
                      sdk={sdk}
                      open={open.has(r.publisher_domain)}
                      onToggle={() => toggle(r.publisher_domain)}
                    />
                  ))
                : (preview.rows as SchainRow[]).map((r, i) => {
                    const key = `${r.store}|${r.bundle_id}|${i}`;
                    return (
                      <SchainAppCard key={key} row={r} open={open.has(key)} onToggle={() => toggle(key)} />
                    );
                  })}
            </div>
          )}

          {trial ? (
            <LockedTail
              slice={preview.trial ?? null}
              caps={summary?.trial ?? null}
              noun={view}
              detail={view === "apps" ? "app that closes the chain, in the file" : "publisher that closes the chain, in the file"}
            />
          ) : (
            preview.total > PAGE_SIZE && (
              <Pager
                className="border-t border-border/70 pt-4"
                page={page}
                pageSize={PAGE_SIZE}
                total={preview.total}
                onPage={paging.onPage}
                noun={view}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

/* ── Result cards, in the overview's own card grammar ──────────────── */

/** One line as the report prints a line: mono, verbatim. */
function CardLine({ label, line }: { label: string; line: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="w-40 flex-shrink-0 text-[11px] text-slate-500">{label}</span>
      <code className="min-w-0 truncate font-mono text-[12px] text-slate-900">{line}</code>
    </div>
  );
}

/** A publisher in the file, drawn exactly as the overview draws a matched
 *  publisher: green disc, name and domain, right-aligned MiniStats, chevron,
 *  tinted expansion. The expansion shows the lines its file carries. */
function SchainPublisherCard({
  row,
  sdk,
  open,
  onToggle,
}: {
  row: SchainPublisherRow;
  sdk: SchainSdk;
  open: boolean;
  onToggle: () => void;
}) {
  const initial = (row.publisher_domain.replace(/^www\./i, "").charAt(0) || "?").toUpperCase();
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-border bg-white shadow-sm transition-colors",
        open && "shadow-md",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5"
      >
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold text-primary">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold tracking-tight text-slate-900">{row.publisher_domain}</div>
          <div className="truncate text-xs text-slate-500">{foundInLabel(row.found_in) ?? "Found in app-ads.txt"}</div>
        </div>
        <div className="hidden items-center gap-6 text-right sm:flex">
          <div className="w-[84px]">
            <MiniStat label="Apps" value={row.apps} emphasis />
          </div>
          <div className="w-[84px]">
            <MiniStat label={`Valid ${sdk.name} IDs`} value={row.valid_ids.length} />
          </div>
        </div>
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 flex-shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border bg-accent/30 px-4 pb-4 pt-3 sm:px-5">
          <CardLine label="Your seat line" line={row.seat_written} />
          {row.direct_written.map((l) => (
            <CardLine key={l} label={`Sells ${sdk.name} directly`} line={l} />
          ))}
          <CardLine label="Your reseller line" line={row.reseller_written} />
          <p className="pt-1 text-[11px] text-slate-500">
            {row.ids_checked > row.valid_ids.length
              ? `${row.ids_checked} ${sdk.name} accounts on the file, ${row.valid_ids.length} vouched for by ${sdk.domain}. `
              : ""}
            Checked in{" "}
            <a href={row.file_url} target="_blank" rel="noreferrer noopener" className="font-mono text-slate-600 hover:text-primary">
              {row.file_url.replace(/^https?:\/\//, "")}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

/** An app in the file, drawn exactly as the overview draws a matched app:
 *  pink disc, name with its store, the publisher under it, a stat on the
 *  right, tinted expansion with the chain the app sells through. */
function SchainAppCard({ row, open, onToggle }: { row: SchainRow; open: boolean; onToggle: () => void }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border shadow-sm transition-colors",
        open ? "border-app-border bg-app-bg/40 shadow-md" : "border-border bg-white",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5"
      >
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-app-bg text-app">
          <Smartphone aria-hidden className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-semibold tracking-tight text-slate-900">{row.app_name}</span>
            <span className="flex-shrink-0 rounded-full border border-app-border bg-app-bg px-1.5 py-px text-[10px] font-medium text-app">
              {storeLabel(row.store)}
            </span>
          </div>
          <div className="truncate text-xs text-slate-500">
            publisher: <span className="text-slate-600">{row.publisher_domain}</span>
          </div>
        </div>
        <div className="hidden text-right sm:block">
          <div className="text-[10px] font-medium tracking-wide text-slate-500">SDK ID</div>
          <div className="max-w-[160px] truncate font-mono text-sm tabular-nums text-slate-900">{row.sid1}</div>
        </div>
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 flex-shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-app-border bg-app-bg/30 px-4 pb-4 pt-3 sm:px-5">
          <CardLine label="Bundle / store ID" line={row.bundle_id} />
          <CardLine label="Node 1 (asi1, sid1)" line={`${row.asi1}, ${row.sid1}`} />
          <CardLine label="Node 2 (asi2, sid2)" line={`${row.asi2}, ${row.sid2}`} />
          {row.store_url && (
            <p className="pt-1 text-[11px] text-slate-500">
              <a href={row.store_url} target="_blank" rel="noreferrer noopener" className="hover:text-primary">
                Open in the store
              </a>
              {row.category ? `, ${row.category}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Download ──────────────────────────────────────────────────────── */

function Download3({
  token,
  selection,
  overview,
  trial,
  empty,
  seatLine,
  sdk,
  asOf,
  onDownloaded,
}: {
  token: string;
  selection: SchainSelection;
  overview: SchainOverview;
  trial: boolean;
  empty: boolean;
  seatLine: string;
  sdk: SchainSdk;
  asOf: AsOfPart[];
  onDownloaded: (used: number) => void;
}) {
  /** One Export button; the format is chosen in the confirm, Excel by default. */
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  /** The reader has said they understand the dates the list is true of. */
  const [agreed, setAgreed] = useState(false);
  useEffect(() => {
    if (open) {
      setAgreed(false);
      setFormat("xlsx");
    }
  }, [open]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `${selection.sdk}|${selection.seat}|${selection.sid2}`;
  const again = overview.downloads.selections.includes(key);
  const left = Math.max(0, overview.downloads.limit - overview.downloads.used);
  const out = !again && left === 0;

  if (trial) {
    return (
      <span className="inline-flex h-10 flex-shrink-0 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-slate-400">
        <Lock className="h-4 w-4" />
        Download with the full report
      </span>
    );
  }

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.schainExport(token, selection, format);
      onDownloaded(r.used);
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The download did not start. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-shrink-0 flex-col items-start gap-1.5 sm:items-end">
      <button
        type="button"
        disabled={empty || out}
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-br from-primary to-[hsl(150_58%_22%)] px-5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:-translate-y-px hover:shadow-md disabled:pointer-events-none disabled:opacity-40"
      >
        <Download className="h-4 w-4" />
        Export
      </button>
      <span className="text-[11px] text-slate-500">
        {again ? "Downloaded before, free again" : out ? "No downloads left on this link" : `${left} of ${overview.downloads.limit} downloads left`}
      </span>

      <Dialog.Root open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] data-[state=open]:animate-sheet-overlay-in data-[state=closed]:animate-sheet-overlay-out" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-white p-5 shadow-2xl outline-none data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out sm:p-6"
          >
            <Dialog.Title className="font-display text-[17px] font-semibold leading-snug tracking-tight text-slate-900">
              Download this schain file?
            </Dialog.Title>
            <p className="mt-2 truncate font-mono text-[12px] text-slate-600">
              {seatLine} via {sdk.domain}
            </p>
            <div className="mt-4" role="radiogroup" aria-label="File format">
              <div className="mb-1.5 text-[11px] font-medium text-slate-500">Format</div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["xlsx", "Excel", "Summary, Publishers, SDK IDs, Apps"],
                    ["csv", "CSV", "The Apps sheet only"],
                  ] as const
                ).map(([value, name, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={format === value}
                    onClick={() => setFormat(value)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      format === value
                        ? "border-primary/40 bg-primary/[0.06]"
                        : "border-border hover:border-primary/25 hover:bg-muted/30",
                    )}
                  >
                    <span className="mt-[2px]">
                      <Radio on={format === value} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-slate-900">
                        {name} <span className="font-mono text-[11px] text-slate-400">.{value}</span>
                      </span>
                      <span className="block text-[11px] leading-snug text-slate-500">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-slate-600">
              {again
                ? "You downloaded this one before, so it is free."
                : `This uses 1 of your ${overview.downloads.limit} downloads. The same file again later is free.`}
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-warn-border bg-warn-bg/60 p-3 text-[12px] leading-relaxed text-slate-700">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[hsl(var(--primary))]"
              />
              <span>
                I understand this list is only true as of:
                <span className="mt-1 block space-y-0.5">
                  {asOf.map((p) => (
                    <span key={p.label} className="block">
                      <span className="text-slate-500">{p.label}</span> {p.value}
                    </span>
                  ))}
                </span>
                <span className="mt-1 block text-slate-500">A publisher or SDK can change their file after that.</span>
              </span>
            </label>
            {error && <p className="mt-2 text-[12px] text-critical">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="h-10 rounded-full border border-border px-4 text-sm font-medium text-slate-700 hover:bg-muted/50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={go}
                disabled={busy || !agreed}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-br from-primary to-[hsl(150_58%_22%)] px-5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:-translate-y-px hover:shadow-md disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {busy ? "Preparing" : "Download"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/* ── Not available ─────────────────────────────────────────────────── */

function NotAvailable({ overview }: { overview: SchainOverview }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
      <h2 className="text-sm font-semibold text-slate-900">
        {overview.status === "no_sellers_json"
          ? "We could not read your sellers.json"
          : "Your sellers.json names no SDK we can check"}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
        The SDK list comes from <span className="font-mono">{overview.sellers_json_url}</span>.
      </p>
      <div className="mt-4 flex justify-center">
        <ContactUs compact label="Ask us" />
      </div>
    </div>
  );
}

/** "Oct 4, 13:20", for a read the same week. */
function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
