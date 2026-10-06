import {
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Download,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EntryDiff, JsonDiff } from "@/components/JsonDiff";
import { Collapse, Settle, glideTo } from "@/components/Motion";
import { PageShell } from "@/components/PageShell";
import { SkeletonRows, SkeletonStatCards } from "@/components/Skeleton";
import { formatWeek, WeekLine } from "@/components/WeekLine";
import { useReportScope } from "@/lib/reportScope";
import {
  buildExport,
  fillInFields,
  isEntry,
  SELLER_TYPES,
  suggest,
  unsafeNumbers,
  validate,
  withEdits,
  type Edit,
  type FillField,
  type Issue,
  type Seller,
  type SellerRow,
  type SellersFile,
} from "@/lib/sellersFix";
import { cn, foundInLabel } from "@/lib/utils";

import { api, type SellersFixPayload, type Summary } from "../lib/api";
import { SplitStat } from "./CrawlReport";

/**
 * SELLERS.JSON.
 *
 * The customer's sellers.json held against what publishers actually list
 * under their domain (Discovery's lines). Suggestions come as thin cards in
 * three groups, Add (+), Fix and Remove (-), three of each shown and the
 * rest a click away; each card is taken or skipped with two worded buttons
 * and opens for the detail. Below them the file itself, live against the
 * export, coloured and lined up the way GitHub shows a diff.
 *
 * A customer with no sellers.json yet gets one built from scratch: their
 * few header details plus every seller found under their domain.
 * "Needs your input" lists whatever stands between the file and a
 * compliant one, each fixable on the page.
 *
 * WE NEVER PUBLISH THE FILE (David, 2026-10-05): the reader downloads it
 * or copies it, and publishes it themselves. Publishing on their behalf
 * was mocked and taken out; it is not something the platform does.
 *
 * EVERYTHING STARTS OFF (David, 2026-10-06): every suggestion opens as
 * "Don't" and the reader switches on what they want.
 */

type GroupKey = "add" | "fix" | "remove";

/** Each group's sign and ink, the Changes page's grammar: + green, - red,
 *  a fix amber. */
const GROUP: Record<GroupKey, { title: string; icon: typeof Plus; disc: string; text: string }> = {
  add: { title: "Add", icon: Plus, disc: "bg-ok-bg text-ok", text: "text-ok" },
  fix: { title: "Fix", icon: RefreshCw, disc: "bg-warn-bg text-warn", text: "text-warn" },
  remove: { title: "Remove", icon: Minus, disc: "bg-critical-bg text-critical", text: "text-critical" },
};

/** "6 Oct 2026": the day the live file was read. */
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

/** How many cards a group shows before "Show all". */
const PEEK = 3;

type Header = { contact_email: string; contact_address: string; tag_id: string };

export default function CrawlSellers() {
  const { token } = useReportScope();
  const [data, setData] = useState<SellersFixPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summarySettled, setSummarySettled] = useState(false);
  const [previous, setPrevious] = useState<Summary | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  // Header fields the reader adds to an existing file (a missing version).
  const [headerPatch, setHeaderPatch] = useState<{ version?: string }>({});
  /** The list of what is still wrong in the file, open under its line. */
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<GroupKey>>(new Set());
  // Only asked for when there is no file yet; an existing file keeps its own.
  const [header, setHeader] = useState<Header>({ contact_email: "", contact_address: "", tag_id: "" });

  useEffect(() => {
    let cancelled = false;
    api
      .summary(token)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => {})
      .finally(() => !cancelled && setSummarySettled(true));
    api
      .previousSummary(token)
      .then((p) => !cancelled && setPrevious(p))
      .catch(() => {});
    api
      .sellersFix(token)
      .then((d) => {
        if (cancelled) return;
        // No page for this report: say so, never wait forever.
        if (d) setData(d);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const creating = data != null && data.file == null;

  /** The file the suggestions start from: the customer's own, or, with
   *  none, an empty one carrying the details they type in. */
  const base = useMemo<SellersFile | null>(() => {
    if (!data) return null;
    if (data.file) return headerPatch.version ? { ...data.file, version: headerPatch.version } : data.file;
    const file: SellersFile = {
      contact_email: header.contact_email.trim(),
      ...(header.contact_address.trim() ? { contact_address: header.contact_address.trim() } : {}),
      version: "1.0",
      sellers: [],
    };
    if (header.tag_id.trim()) file.identifiers = [{ name: "TAG-ID", value: header.tag_id.trim() }];
    return file;
  }, [data, header, headerPatch]);

  // The suggestions themselves do not depend on the header, so typing an
  // email does not reset the reader's ticks.
  const plain = useMemo(
    () => (data ? suggest(data.file ?? { sellers: [] }, data.sightings, data.domain) : []),
    [data],
  );
  const rows = useMemo(() => withEdits(plain, edits), [plain, edits]);

  // Every suggestion starts off; new suggestions start off again.
  useEffect(() => {
    setTicked(new Set());
  }, [plain]);

  /** Whether the reader has touched a suggestion: switched it on, or typed
   *  into it. */
  const changed = (id: string) => ticked.has(id) || Boolean(edits[id]);
  /** Back to off, for these sellers (David, 2026-10-06: a reset everywhere a
   *  choice is made). */
  const reset = (ids: string[]) => {
    setTicked((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    setEdits((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  };
  const allIds = plain.map((r) => r.seller_id);
  const anyChanged = allIds.some(changed) || Boolean(headerPatch.version);
  const resetAll = () => {
    reset(allIds);
    setHeaderPatch({});
  };

  const groupOf = (r: SellerRow): GroupKey | null => (r.kind === "keep" ? null : r.kind);

  /** An existing file with no version: fixed by a card of its own in Fix. */
  const versionMissing = !creating && data?.file != null && !String(data.file.version ?? "").trim();

  const groups = useMemo(() => {
    const keys: GroupKey[] = ["add", "fix", "remove"];
    return keys
      .map((key) => ({ key, rows: rows.filter((r) => r.kind === key) }))
      .filter((g) => g.rows.length > 0 || (g.key === "fix" && versionMissing));
  }, [rows, versionMissing]);

  const counts = useMemo(
    () => ({
      add: rows.filter((r) => r.kind === "add").length,
      fix: rows.filter((r) => r.kind === "fix").length + (versionMissing ? 1 : 0),
      remove: rows.filter((r) => r.kind === "remove").length,
      // Added sellers still waiting for the name only the reader knows.
      unnamed: rows.filter((r) => r.kind === "add" && !String(r.suggested?.name ?? "").trim()).length,
    }),
    [rows, versionMissing],
  );
  const applied = (headerPatch.version ? 1 : 0) + rows.filter((r) => r.kind !== "keep" && ticked.has(r.seller_id)).length;
  /** What went into the file you take away, by kind. */
  const taken = useMemo(() => {
    const on = (k: SellerRow["kind"]) => rows.filter((r) => r.kind === k && ticked.has(r.seller_id)).length;
    const add = on("add");
    const fix = on("fix");
    const remove = on("remove");
    // A taken duplicate fix keeps one entry and takes its other copies out,
    // so the count before and after adds up.
    const copies = rows
      .filter((r) => r.kind !== "add" && ticked.has(r.seller_id))
      .reduce((n, r) => n + (r.dropped?.length ?? 0), 0);
    return { add, fix, remove, copies };
  }, [rows, ticked]);

  const exportFile = useMemo(
    () => (base ? buildExport(base, rows, ticked) : null),
    [base, rows, ticked],
  );
  const issues = useMemo(() => (exportFile ? validate(exportFile, { creating }) : []), [exportFile, creating]);
  // Numbers a browser cannot copy exactly: exporting from here would change
  // them, so Copy and Download wait until the live file writes them as text.
  const unsafe = useMemo(() => (data?.file ? unsafeNumbers(data.file) : []), [data]);
  const blocked = unsafe.length > 0;
  const readOn = day(data?.checked_at);
  const readFrom =
    data?.file_url && data.file_url.replace(/^https?:\/\//, "") !== `${data.domain}/sellers.json`
      ? data.file_url.replace(/^https?:\/\//, "")
      : null;
  const exportText = useMemo(
    () => (exportFile ? JSON.stringify(exportFile, null, 2) + "\n" : ""),
    [exportFile],
  );

  /** Which live entry each taken fix replaces, so the comparison lines the
   *  kept copy up with its fix. */
  const pairs = useMemo(() => {
    const m = new Map<Seller, Seller>();
    for (const r of rows) {
      if (r.kind === "fix" && r.current && r.suggested && ticked.has(r.seller_id)) m.set(r.current, r.suggested);
    }
    return m;
  }, [rows, ticked]);

  const download = () => {
    if (blocked) return;
    if (!data || !exportFile) return;
    const blob = new Blob([exportText], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.domain}-sellers.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const setOn = (ids: string[], on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const edit = (id: string, field: FillField, value: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    // Filling in who a seller is says the reader wants it in the file.
    setTicked((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  };

  const flip = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  /** Take the reader to what an issue is about: open its group and its
   *  card, then glide there. */
  const goTo = (sellerId?: string, field?: string, fill = false) => {
    if (field === "version") {
      setOpenGroups((prev) => new Set(prev).add("fix"));
      window.setTimeout(() => glideTo(document.getElementById("file-version"), 140), 60);
      return;
    }
    if (field) {
      const el = document.getElementById(`sellers-${field}`);
      glideTo(el, 120);
      window.setTimeout(() => el?.focus(), 700);
      return;
    }
    const r = rows.find((x) => x.seller_id === sellerId);
    const g = r ? groupOf(r) : null;
    if (!r || !g) return;
    setOpenGroups((prev) => new Set(prev).add(g));
    setOpenCards((prev) => new Set(prev).add(r.seller_id));
    window.setTimeout(() => glideTo(document.getElementById(`seller-${r.seller_id}`), 140), 60);
    if (fill) {
      // The card opens (and its group may unfold) first: try until its
      // input is there, for a second and a half at most.
      let tries = 0;
      const focusInput = () => {
        const input = document
          .getElementById(`seller-${r.seller_id}`)
          ?.querySelector<HTMLElement>("input, select");
        if (input && input.offsetParent !== null) {
          input.focus({ preventScroll: true });
        } else if (tries++ < 12) {
          window.setTimeout(focusInput, 125);
        }
      };
      window.setTimeout(focusInput, 400);
    }
  };

  const weekLabel = summary?.finished_at ? formatWeek(new Date(summary.finished_at)) : null;
  const prevWeekLabel = previous?.finished_at ? formatWeek(new Date(previous.finished_at)) : null;

  return (
    <PageShell>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            Sellers.json
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {creating
              ? "Your sellers.json, built from every seller publishers list under your domain."
              : "Your sellers.json against what publishers list under your domain."}
          </p>
          <WeekLine
            week={weekLabel}
            previousWeek={prevWeekLabel}
            isFirstCrawl={summary?.previous_job_id === null}
            pending={!summarySettled}
            className="mt-1.5"
          />
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2 self-start">
            <CopyButton text={exportText} label={creating ? "Copy new file" : "Copy fixed file"} disabled={blocked} />
            <ExportButton onClick={download} label={creating ? "Download new sellers.json" : "Download fixed sellers.json"} disabled={blocked} />
          </div>
        )}
      </div>

      {failed && (
        <p className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center text-sm text-slate-500">
          Sellers.json suggestions are not part of this report yet.
        </p>
      )}

      {!data && !failed && (
        <>
          <SkeletonStatCards />
          <SkeletonRows rows={6} label="Loading your sellers.json" />
        </>
      )}

      {data && exportFile && (
        <>
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <div className="font-display text-sm font-medium text-slate-700">
                  {data.domain}/sellers.json
                </div>
                <div className="text-[11px] text-slate-500">
                  {creating
                    ? `No file at ${data.domain}/sellers.json${readOn ? ` when we checked on ${readOn}` : ""}. Built from every ads.txt and app-ads.txt line naming ${data.domain}`
                    : `${readOn ? `Read on ${readOn}` : "Read"}${readFrom ? ` from ${readFrom}` : ""}, checked against every ads.txt and app-ads.txt line naming ${data.domain}`}
                </div>
              </div>
              <span className="text-xs text-slate-500">
                {applied.toLocaleString()} {applied === 1 ? "change" : "changes"} chosen
              </span>
            </div>
            {creating ? (
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
                <SplitStat
                  className="bg-white"
                  tone="ok"
                  number={counts.add}
                  label="Sellers found"
                  caption="Listed under your domain by publishers"
                />
                <SplitStat
                  className="bg-white"
                  number={taken.add}
                  label="In your new file"
                  caption="The ones you added"
                />
                <SplitStat
                  className="bg-white"
                  tone="warn"
                  number={counts.unnamed}
                  label="Need a name"
                  caption="Only you can say who they are"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
                <SplitStat
                  className="bg-white"
                  number={data.file?.sellers.length ?? 0}
                  label="Sellers in your file"
                  caption={readOn ? `As read on ${readOn}` : "As read for this report"}
                />
                <SplitStat
                  className="bg-white"
                  tone="ok"
                  prefix="+"
                  number={counts.add}
                  label="To add"
                  caption="Publishers list them, your file doesn't"
                />
                <SplitStat
                  className="bg-white"
                  tone="warn"
                  number={counts.fix}
                  label="To fix"
                  caption="Written wrong, duplicated or disputed"
                />
                <SplitStat
                  className="bg-white"
                  tone="critical"
                  number={counts.remove}
                  label="Suggested removals"
                  caption="Listed nowhere we crawled"
                />
              </div>
            )}
          </div>

          {creating && <HeaderForm header={header} onChange={setHeader} />}

          {blocked && (
            <div className="rounded-2xl border border-critical-border bg-critical-bg/40 p-5 text-[13px] text-slate-700">
              <div className="mb-1 flex items-center gap-2 font-display text-sm font-medium text-slate-800">
                <CircleAlert aria-hidden className="h-4 w-4 flex-shrink-0 text-critical" />
                Copy and Download are off for this file
              </div>
              Your live file has {unsafe.length === 1 ? "a number" : "numbers"} too long for a browser to copy
              exactly ({unsafe.slice(0, 3).join(", ")}
              {unsafe.length > 3 ? `, and ${unsafe.length - 3} more` : ""}). Write {unsafe.length === 1 ? "it" : "them"} in
              quotes in your live sellers.json first; a copy made here would change {unsafe.length === 1 ? "it" : "them"}.
            </div>
          )}

          {(data.file_warnings?.length ?? 0) > 0 && (
            <div className="rounded-2xl border border-warn-border bg-warn-bg/30 p-5">
              <div className="mb-1 flex items-center gap-2 font-display text-sm font-medium text-slate-800">
                <CircleAlert aria-hidden className="h-4 w-4 flex-shrink-0 text-warn" />
                About your live file
              </div>
              <ul className="space-y-1 text-[13px] text-slate-700">
                {data.file_warnings!.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* The promise the page rests on, said where the reader decides. */}
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-500">
            <ShieldCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
            <span>
              Nothing here changes your live sellers.json. Download the file or copy it, and publish it
              yourself at {data.domain}/sellers.json.
            </span>
          </p>

          {/* THE SUGGESTIONS FIRST, as thin cards in their groups: the only
              place a change is made. */}
          <div className="space-y-5">
            {groups.map((g) => (
              <SuggestionGroup
                key={g.key}
                group={g.key}
                rows={g.rows}
                ticked={ticked}
                showAll={openGroups.has(g.key)}
                onShowAll={() => setOpenGroups((prev) => flip(prev, g.key))}
                openCards={openCards}
                onOpen={(id) => setOpenCards((prev) => flip(prev, id))}
                onSet={setOn}
                onEdit={edit}
                edits={edits}
                changed={changed}
                onReset={reset}
                flagged={new Set(issues.map((x) => x.sellerId).filter(Boolean) as string[])}
                domain={data.domain}
                headerFix={
                  g.key === "fix" && versionMissing
                    ? {
                        on: Boolean(headerPatch.version),
                        onSet: (on: boolean) => setHeaderPatch(on ? { version: "1.0" } : {}),
                      }
                    : undefined
                }
              />
            ))}
          </div>

          {/* THE FILE, after the panels that change it: live against the
              export, as GitHub shows a diff. Rebuilt on every tick and every
              fill-in above. */}
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            {/* WHAT YOU ARE EXPORTING, in one plain line (David, 2026-10-06:
                the chips and the verdict were clutter). Copy and Download
                sit at the top of the page; Reset puts every pick back. */}
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-base font-semibold tracking-tight text-slate-900">
                  {creating ? "Your new sellers.json" : "Your fixed sellers.json"}
                </div>
                <div className="mt-0.5 text-[12.5px] text-slate-500">
                  {exportFile.sellers.length.toLocaleString()}{" "}
                  {exportFile.sellers.length === 1 ? "seller" : "sellers"}
                  {(() => {
                    const parts = [
                      taken.add > 0 ? `${taken.add} added` : null,
                      taken.fix > 0 ? `${taken.fix} fixed` : null,
                      taken.remove > 0 ? `${taken.remove} removed` : null,
                      taken.copies > 0 ? `${taken.copies} duplicate ${taken.copies === 1 ? "copy" : "copies"} taken out` : null,
                    ].filter(Boolean);
                    return creating ? "" : parts.length ? `: ${parts.join(", ")}` : ", nothing changed";
                  })()}
                </div>
              </div>
              <ResetButton disabled={!anyChanged} onClick={resetAll} label="Reset all" />
            </div>
            {/* One comparison, read only (David, 2026-10-06): the live file on
                the left, the file with the changes taken above on the right.
                Changes are made in the Add, Fix and Remove panels only. */}
            <JsonDiff
              live={data.file}
              next={exportFile}
              domain={data.domain}
              liveLabel={readOn ? `As read on ${readOn}` : "As read"}
              nextLabel={creating ? "New file" : "With your changes"}
              nextNote="what you download or copy"
              pairs={pairs}
            />
            {/* Take it away from where it was just read (David, 2026-10-06:
                Copy and Download at the bottom too). */}
            {/* WHAT IS STILL WRONG IN THE FILE YOU TAKE AWAY, one line that
                opens into the list, each problem fixable from where it is
                (David, 2026-10-06: the box on top only repeated the cards). */}
            <div
              className={cn(
                "mt-4 overflow-hidden rounded-xl border",
                issues.length ? "border-warn-border bg-warn-bg/40" : "border-ok-border bg-ok-bg/40",
              )}
            >
              <ProblemsLine issues={issues} open={problemsOpen} onToggle={() => setProblemsOpen((v) => !v)} />
              <Collapse open={problemsOpen && issues.length > 0}>
                <ProblemsList
                  issues={issues}
                  rows={rows}
                  ticked={ticked}
                  versionOn={Boolean(headerPatch.version)}
                  onApply={(id) => setOn([id], true)}
                  onAddVersion={() => setHeaderPatch({ version: "1.0" })}
                  onGo={goTo}
                />
              </Collapse>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-[12px] text-slate-500">
                {!creating && readOn
                  ? `Built on your file as read on ${readOn}. If you changed it since, check those changes are still in this one before you publish it.`
                  : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton text={exportText} label={creating ? "Copy new file" : "Copy fixed file"} disabled={blocked} />
                <ExportButton onClick={download} label={creating ? "Download new sellers.json" : "Download fixed sellers.json"} disabled={blocked} />
              </div>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}

/**
 * One group of suggestions: its sign and count, a way to take or skip the
 * lot, three cards, and the rest behind "Show all".
 */
function SuggestionGroup({
  group,
  rows,
  ticked,
  showAll,
  onShowAll,
  openCards,
  onOpen,
  onSet,
  onEdit,
  edits,
  changed,
  onReset,
  flagged,
  domain,
  headerFix,
}: {
  group: GroupKey;
  domain: string;
  /** A fix to the file's header (a missing version), shown first. */
  headerFix?: { on: boolean; onSet: (on: boolean) => void };
  edits: Record<string, Edit>;
  rows: SellerRow[];
  ticked: Set<string>;
  showAll: boolean;
  onShowAll: () => void;
  openCards: Set<string>;
  onOpen: (id: string) => void;
  onSet: (ids: string[], on: boolean) => void;
  onEdit: (id: string, field: FillField, value: string) => void;
  changed: (id: string) => boolean;
  onReset: (ids: string[]) => void;
  flagged: Set<string>;
}) {
  const g = GROUP[group];
  const Icon = g.icon;
  const taken = rows.filter((r) => ticked.has(r.seller_id)).length + (headerFix?.on ? 1 : 0);
  const total = rows.length + (headerFix ? 1 : 0);
  const shown = showAll ? rows : rows.slice(0, PEEK);
  const ids = rows.map((r) => r.seller_id);
  // Each group in its own card (David, 2026-10-06: Add, Fix and Remove
  // apart, each in a wrapper), in the report's own card grammar: the KPI
  // card's head (a quiet title and a line under it) over one bordered
  // list of plain rows, never boxes inside a box.
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-sm font-medium text-slate-700">
            <span className={cn("flex h-4 w-4 items-center justify-center rounded-full", g.disc)}>
              <Icon aria-hidden className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            {g.title}
            <span className="font-mono text-[12px] font-normal tabular-nums text-slate-400">{total}</span>
          </h2>
          <div className="text-[11px] text-slate-500">
            {taken} of {total} going into your file
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <button
            type="button"
            onClick={() => {
              onSet(ids, true);
              headerFix?.onSet(true);
            }}
            className="font-medium text-slate-700 hover:text-primary"
          >
            Take all
          </button>
          <button
            type="button"
            onClick={() => {
              onSet(ids, false);
              headerFix?.onSet(false);
            }}
            className="font-medium text-slate-700 hover:text-primary"
          >
            Skip all
          </button>
          <ResetButton
            disabled={!ids.some(changed) && !headerFix?.on}
            onClick={() => {
              onReset(ids);
              headerFix?.onSet(false);
            }}
            label="Reset"
            quiet
          />
        </div>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {headerFix && <VersionCard on={headerFix.on} onSet={headerFix.onSet} />}
        {shown.map((r, i) => (
          <Settle key={r.seller_id} index={i}>
            <SuggestionCard
              row={r}
              group={group}
              on={ticked.has(r.seller_id)}
              open={openCards.has(r.seller_id)}
              flagged={flagged.has(r.seller_id)}
              onOpen={() => onOpen(r.seller_id)}
              onSet={(on) => onSet([r.seller_id], on)}
              onEdit={(field, value) => onEdit(r.seller_id, field, value)}
              typed={edits[r.seller_id]}
              changed={changed(r.seller_id)}
              onReset={() => onReset([r.seller_id])}
              domain={domain}
            />
          </Settle>
        ))}
      </div>
      {rows.length > PEEK && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-primary"
        >
          {showAll ? "Show fewer" : `Show all ${rows.length}`}
          <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
        </button>
      )}
    </section>
  );
}

/** A value as the summary line prints it: quoted where the quotes are the
 *  point (spaces around it, a number written as text). */
function shown(v: unknown, quote: boolean): string {
  if (v === undefined || v === "") return "none";
  const t = String(v);
  return quote || t !== t.trim() ? JSON.stringify(v) : t;
}

/** What a card says on its one line: who the seller is, or what changes
 *  (read off the entry itself, so a typed-in name or domain shows too). */
function summaryOf(r: SellerRow): string {
  const who = (s: SellerRow["current"]) =>
    s ? [s.name || null, s.domain || null, s.seller_type || null].filter(Boolean).join(", ") : "";
  if (r.kind === "fix" && r.current && r.suggested) {
    const parts: string[] = [];
    if (r.dropped?.length) parts.push(`listed ${r.dropped.length + 1} times, kept once`);
    for (const f of ["seller_id", "name", "domain", "seller_type"] as const) {
      const a = r.current[f];
      const b = r.suggested[f];
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      parts.push(`${f}: ${shown(a, f === "seller_id")} → ${b === undefined ? "taken out" : shown(b, f === "seller_id")}`);
    }
    return parts.join(", ") || who(r.current);
  }
  return who(r.kind === "remove" ? r.current : r.suggested);
}

/**
 * One suggestion, thin: its sign, the seller, one line of why, and a tick
 * or a cross. Opens for the whole reason, who lists it, and (when only the
 * reader can say who a seller is) the name and domain to fill in.
 */
function SuggestionCard({
  row,
  group,
  on,
  open,
  flagged,
  onOpen,
  onSet,
  onEdit,
  typed,
  changed,
  onReset,
  domain,
}: {
  row: SellerRow;
  group: GroupKey;
  domain: string;
  /** What the reader typed into this card, as typed (the file gets it
   *  cleaned: trimmed, a domain made plain). */
  typed?: Edit;
  on: boolean;
  open: boolean;
  flagged: boolean;
  onOpen: () => void;
  onSet: (on: boolean) => void;
  onEdit: (field: FillField, value: string) => void;
  changed: boolean;
  onReset: () => void;
}) {
  const g = GROUP[group];
  const Icon = g.icon;
  const fields = fillInFields(row);
  // What is still missing: an add needs at least a name; a fix needs what
  // it asks for.
  const wanted = row.kind === "add" ? fields.filter((f) => f === "name") : fields;
  const missing = wanted.filter((f) => !String(typed?.[f] ?? "").trim());
  /** What an input shows: what the reader typed, else (on an add) the
   *  domain we could fill, else nothing. */
  const shownValue = (f: FillField) =>
    typed?.[f] ?? (row.kind === "add" && f === "domain" ? String(row.suggested?.domain ?? "") : "");
  return (
    <div
      id={`seller-${row.seller_id}`}
      className={cn(
        // A row of the group's list, not a box of its own (David,
        // 2026-10-06). Off is where every row starts, so it is not dimmed;
        // the filled choice on the right says which way it went. Taken, a
        // row whose problem is still in the file keeps a warm left edge.
        "relative scroll-mt-24 bg-white transition-colors hover:bg-muted/30",
        flagged && on && "shadow-[inset_3px_0_0_hsl(var(--tone-warn))]",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:flex-nowrap">
        <span className={cn("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full", g.disc)}>
          <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
        <button type="button" onClick={onOpen} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className="flex min-w-0 items-baseline gap-2">
            <code className="flex-shrink-0 font-mono text-[12.5px] font-semibold text-slate-900">
              {row.seller_id || "no seller_id"}
            </code>
            <span className={cn("truncate text-[12px] text-slate-600", row.kind === "remove" && on && "line-through")}>
              {summaryOf(row)}
            </span>
            {missing.length > 0 && (
              <span className="flex-shrink-0 text-[11px] font-medium text-warn">needs a {missing.join(" and a ")}</span>
            )}
            {row.check && <span className="flex-shrink-0 text-[11px] font-medium text-warn">check first</span>}
          </span>
          {/* Open, the card says the whole reason below; the short line
              would only say it twice. */}
          {!open && <span className="block truncate text-[11px] text-slate-400">{row.reason}</span>}
        </button>
        {/* On a phone the worded choice takes its own row under the seller,
            so neither squeezes the other. */}
        <div className="order-last flex basis-full items-center gap-2 pl-10 sm:order-none sm:basis-auto sm:pl-0">
          {changed && <ResetButton onClick={onReset} label="Reset" quiet />}
          <Decision on={on} onSet={onSet} id={row.seller_id} group={group} />
        </div>
        <button
          type="button"
          onClick={onOpen}
          aria-label={open ? "Close" : "Open"}
          className="flex-shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-muted hover:text-slate-600"
        >
          <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      <Collapse open={open}>
        <div className="space-y-3 border-t border-border bg-muted/20 px-4 py-3 text-[12px] text-slate-600">
          <p className="leading-snug">{row.reason}</p>
          {/* The entry as it changes in the file, and the ads.txt lines
              behind it, side by side. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <div className="text-[11px] font-medium text-slate-500">In your sellers.json</div>
              <EntryOrRaw before={row.current} after={row.kind === "remove" ? null : row.suggested} />
              {/* A duplicate's other copies, which the change takes out. */}
              {row.dropped && row.dropped.length > 0 && (
                <>
                  <div className="pt-1 text-[11px] font-medium text-slate-500">
                    {row.dropped.length === 1 ? "Its other copy, taken out" : `Its other ${row.dropped.length} copies, taken out`}
                  </div>
                  {row.dropped.map((d, i) => (
                    <EntryOrRaw key={i} before={d} after={null} />
                  ))}
                </>
              )}
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-medium text-slate-500">In publishers' files</div>
              <ListingWindow row={row} domain={domain} group={group} />
            </div>
          </div>
          {/* What only the reader can say: who an add is, or the name or
              domain a fix needs. */}
          {fields.length > 0 && (
            <div className={cn("grid grid-cols-1 gap-2", fields.length > 1 && "sm:grid-cols-2")}>
              {fields.map((f) =>
                f === "seller_type" ? (
                  <select
                    key={f}
                    value={typed?.seller_type ?? ""}
                    onChange={(e) => onEdit(f, e.target.value)}
                    aria-label={`seller_type for seller ${row.seller_id}`}
                    className={cn(INPUT, "h-8 font-mono text-[12px]", fields.length === 1 && "sm:max-w-xs")}
                  >
                    <option value="" disabled>
                      Pick a seller_type
                    </option>
                    {SELLER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    key={f}
                    value={shownValue(f)}
                    onChange={(e) => onEdit(f, e.target.value)}
                    placeholder={f === "name" ? "Seller name" : "their-domain.com"}
                    aria-label={`${f === "name" ? "Name" : "Domain"} for seller ${row.seller_id}`}
                    className={cn(INPUT, "h-8 text-[12px]", f === "domain" && "font-mono", fields.length === 1 && "sm:max-w-xs")}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
}

/** An entry's change, or, for something in the list that is not an entry
 *  at all (a null, a number), that value as one removed line. */
function EntryOrRaw({ before, after }: { before: Seller | null; after: Seller | null }) {
  if (before !== null && !isEntry(before)) {
    return (
      <div className="overflow-hidden rounded-lg border border-[#d1d9e0] bg-white">
        <pre className="m-0 flex bg-[#ffebe9] py-1 font-mono text-[11px] leading-[18px]">
          <span className="w-6 flex-shrink-0 select-none text-center text-[#cf222e]">−</span>
          <span className="whitespace-pre pr-3 text-[#1f2328]">{JSON.stringify(before)}</span>
        </pre>
      </div>
    );
  }
  return <EntryDiff before={before} after={after} />;
}

/** Window tone per group, the change windows' grammar on the overview. */
const WINDOW: Record<GroupKey, { glyph: string; text: string; head: string; border: string }> = {
  add: { glyph: "+", text: "text-ok", head: "bg-ok-bg/60", border: "border-ok-border" },
  fix: { glyph: "↻", text: "text-warn", head: "bg-warn-bg/60", border: "border-warn-border" },
  remove: { glyph: "-", text: "text-critical", head: "bg-critical-bg/60", border: "border-critical-border" },
};

/**
 * The ads.txt and app-ads.txt lines naming this seller, printed the way the
 * whole report prints a line (`ssp_domain, publisher_id, RELATIONSHIP`),
 * with the publisher and the file at the right margin. A suggested removal
 * has none, and says so.
 */
function ListingWindow({ row, domain, group }: { row: SellerRow; domain: string; group: GroupKey }) {
  const w = WINDOW[group];
  const cap = 6;
  const shown = row.listings.slice(0, cap);
  // The whole count, not the list's length: the list may be the first of
  // many.
  const total = Math.max(row.listingsTotal ?? 0, row.listings.length);
  const extra = total - shown.length;
  return (
    <section className={cn("overflow-hidden rounded-lg border bg-white shadow-sm", w.border)}>
      <div className={cn("flex items-baseline justify-between gap-2 border-b px-3 py-1.5", w.border, w.head)}>
        <span className={cn("flex items-baseline gap-1.5 text-xs font-medium", w.text)}>
          <span className="font-mono">{w.glyph}</span>
          {total ? "Lines naming this seller" : "No line names this seller"}
        </span>
        <span className={cn("font-mono text-[11px] font-semibold tabular-nums", w.text)}>{total.toLocaleString()}</span>
      </div>
      {total === 0 ? (
        <p className="px-3 py-2 text-[11px] text-slate-500">
          No ads.txt or app-ads.txt we crawled carries{" "}
          <code className="font-mono text-slate-700">
            {domain}, {row.listedAs ?? row.seller_id}, …
          </code>
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((l, i) => (
            <li key={`${l.publisher}:${l.relationship}:${i}`} className="flex items-baseline gap-3 px-3 py-1.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums text-slate-800">
                {domain}, {row.listedAs ?? row.seller_id}, {l.relationship}
              </code>
              <span className="min-w-0 flex-shrink truncate text-[10px] text-slate-400">
                on {l.publisher}
                {foundInLabel(l.found_in) ? `, ${foundInLabel(l.found_in)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {extra > 0 && <p className="border-t border-border px-3 py-1 text-[10px] text-slate-500">Plus {extra.toLocaleString()} more.</p>}
    </section>
  );
}

/**
 * TAKE IT OR NOT, IN WORDS (David, 2026-10-05: a bare tick and cross did
 * not say which was chosen). Each side names what it does to the file for
 * this kind of suggestion; the chosen side is filled, in the kind's ink
 * when it goes into the file and in slate when it stays out.
 */
// The tick always means "do what we suggest" and the cross "don't", so
// every label is the suggestion or its negation (David, 2026-10-05: a
// tick beside "Remove" and a cross beside "Keep" read backwards).
const DECISION: Record<GroupKey, { take: string; skip: string; solid: string }> = {
  add: { take: "Add to file", skip: "Don't add", solid: "bg-ok text-white" },
  fix: { take: "Apply fix", skip: "Don't fix", solid: "bg-warn text-white" },
  remove: { take: "Remove from file", skip: "Don't remove", solid: "bg-critical text-white" },
};

/** Puts picks back where the suggestions started. Quiet in a group or a
 *  card; a pill for the whole file. */
function ResetButton({
  onClick,
  label,
  disabled = false,
  quiet = false,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Back to the suggested choices"
      className={cn(
        "inline-flex items-center gap-1 font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
        quiet
          ? "text-[12px] text-slate-500 hover:text-primary"
          : "h-9 rounded-full border border-border bg-white px-3.5 text-[12.5px] text-slate-700 hover:bg-slate-50",
      )}
    >
      <RotateCcw aria-hidden className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Decision({
  on,
  onSet,
  id,
  group,
}: {
  on: boolean;
  onSet: (on: boolean) => void;
  id: string;
  group: GroupKey;
}) {
  const d = DECISION[group];
  const side = "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold transition-colors";
  return (
    <div role="group" aria-label={`Seller ${id}`} className="inline-flex flex-shrink-0 rounded-full border border-border bg-white p-0.5">
      <button
        type="button"
        onClick={() => onSet(true)}
        aria-pressed={on}
        className={cn(side, on ? d.solid : "text-slate-500 hover:bg-muted hover:text-slate-700")}
      >
        <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
        {d.take}
      </button>
      <button
        type="button"
        onClick={() => onSet(false)}
        aria-pressed={!on}
        // Off is where every card starts (2026-10-06): a quiet fill, so the
        // ones switched on are what stand out.
        className={cn(side, !on ? "bg-slate-200 text-slate-800" : "text-slate-500 hover:bg-muted hover:text-slate-700")}
      >
        <X aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
        {d.skip}
      </button>
    </div>
  );
}

function ExportButton({ onClick, label, disabled = false }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="disabled:pointer-events-none disabled:opacity-40 inline-flex h-9 flex-shrink-0 items-center gap-2 self-start rounded-full bg-gradient-to-b from-[hsl(152_50%_32%)] to-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-md shadow-primary/25 ring-1 ring-inset ring-white/10 transition-all duration-150 hover:-translate-y-px hover:shadow-lg hover:shadow-primary/30 hover:brightness-110 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Download aria-hidden className="h-4 w-4" />
      {label}
    </button>
  );
}

/** Copies the file with the reader's picks, for pasting straight into
 *  wherever they publish it. Says so for a moment, then settles back. */
function CopyButton({ text, label, disabled = false }: { text: string; label: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
      disabled={disabled}
      className="disabled:pointer-events-none disabled:opacity-40 inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-full border border-border bg-white px-4 text-[13px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-primary/30"
    >
      {copied ? <Check aria-hidden className="h-4 w-4 text-ok" /> : <Copy aria-hidden className="h-4 w-4" />}
      {copied ? "Copied" : label}
    </button>
  );
}


const INPUT =
  "h-9 w-full rounded-lg border border-border bg-white px-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15";

/** The few details a new file's header needs, asked only when there is no file. */
function HeaderForm({ header, onChange }: { header: Header; onChange: (h: Header) => void }) {
  const set = (k: keyof Header) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...header, [k]: e.target.value });
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="font-display text-sm font-medium text-slate-700">Your details</div>
      <div className="mb-3 text-[11px] text-slate-500">
        The top of the file. Version is set to 1.0 for you.
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-slate-600">Contact email</span>
          <input id="sellers-contact_email" type="email" value={header.contact_email} onChange={set("contact_email")} placeholder="sellers@madeupmedia.com" className={INPUT} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-slate-600">Contact address (optional)</span>
          <input value={header.contact_address} onChange={set("contact_address")} placeholder="Street, city, country" className={INPUT} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-slate-600">TAG ID (optional)</span>
          <input value={header.tag_id} onChange={set("tag_id")} placeholder="Your TAG certification ID" className={INPUT} />
        </label>
      </div>
    </div>
  );
}

/** The file's header has no version: a fix of its own, first in Fix. */
function VersionCard({ on, onSet }: { on: boolean; onSet: (on: boolean) => void }) {
  const g = GROUP.fix;
  const Icon = g.icon;
  return (
    <div id="file-version" className="scroll-mt-24 bg-white transition-colors hover:bg-muted/30">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:flex-nowrap">
        <span className={cn("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full", g.disc)}>
          <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <code className="flex-shrink-0 font-mono text-[12.5px] font-semibold text-slate-900">version</code>
            <span className="truncate text-[12px] text-slate-600">version: none → "1.0"</span>
          </span>
          <span className="block truncate text-[11px] text-slate-400">
            The top of your file has no version. sellers.json is version 1.0.
          </span>
        </div>
        <div className="order-last flex basis-full items-center gap-2 pl-10 sm:order-none sm:basis-auto sm:pl-0">
          {on && <ResetButton onClick={() => onSet(false)} label="Reset" quiet />}
          <Decision on={on} onSet={onSet} id="version" group="fix" />
        </div>
        {/* Nothing to open: the space of the other cards' arrow, so the
            choices line up. */}
        <span aria-hidden className="hidden h-6 w-6 flex-shrink-0 sm:block" />
      </div>
    </div>
  );
}

/** One line under the file: how many problems the file you take away still
 *  has, opening into their list; or that it has none. */
function ProblemsLine({
  issues,
  open,
  onToggle,
}: {
  issues: Issue[];
  open: boolean;
  onToggle: () => void;
}) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-slate-800">
        <Check aria-hidden className="h-4 w-4 flex-shrink-0 text-ok" />
        No known problems in the file you download
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-warn-bg/60"
    >
      <CircleAlert aria-hidden className="h-4 w-4 flex-shrink-0 text-warn" />
      <span className="min-w-0 flex-1 text-[13px] font-medium text-slate-800">
        {issues.length} {issues.length === 1 ? "thing is" : "things are"} still wrong in the file you download
      </span>
      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-border bg-white px-3 py-1 text-[11.5px] font-medium text-slate-700 shadow-sm">
        {open ? "Hide" : "Show them"}
        <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </span>
    </button>
  );
}

/**
 * Everything still wrong in the file you take away, each fixable from here:
 * switch its fix on, open its card at the input only you can fill, or add
 * the version. A problem leaves the list the moment the file no longer has
 * it. Nothing here is switched on by itself (David, 2026-10-06).
 */
function ProblemsList({
  issues,
  rows,
  ticked,
  versionOn,
  onApply,
  onAddVersion,
  onGo,
}: {
  issues: Issue[];
  rows: SellerRow[];
  ticked: Set<string>;
  versionOn: boolean;
  onApply: (sellerId: string) => void;
  onAddVersion: () => void;
  onGo: (sellerId?: string, field?: string, fill?: boolean) => void;
}) {
  const byId = new Map(rows.map((r) => [r.seller_id, r]));
  const pill =
    "flex-shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors";
  return (
    <ul className="divide-y divide-border border-t border-warn-border bg-white">
      {issues.map((x) => {
        const row = x.sellerId !== undefined ? byId.get(x.sellerId) : undefined;
        const needsInput = Boolean(row?.ask?.length);
        // What the row's fix does, said on hover before it is switched on.
        const what = row && row.kind !== "keep" ? summaryOf(row) || row.reason : "";
        return (
          <li key={x.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5">
            <span className="min-w-0 flex-1 text-[12.5px] text-slate-700">{x.text}</span>
            <span className="flex flex-shrink-0 items-center gap-2">
              {x.field === "version" ? (
                !versionOn && (
                  <button type="button" onClick={onAddVersion} className={cn(pill, "border-warn bg-warn text-white hover:brightness-110")}>
                    Add version 1.0
                  </button>
                )
              ) : x.field === "contact_email" ? (
                <button type="button" onClick={() => onGo(undefined, x.field)} className={cn(pill, "border-border bg-white text-slate-700 hover:border-primary/30")}>
                  Fill in
                </button>
              ) : row && needsInput ? (
                <button
                  type="button"
                  onClick={() => onGo(x.sellerId, undefined, true)}
                  className={cn(pill, "border-border bg-white text-slate-700 hover:border-primary/30")}
                >
                  Fill in
                </button>
              ) : row && row.kind !== "keep" && !ticked.has(row.seller_id) ? (
                <button
                  type="button"
                  title={what}
                  onClick={() => onApply(row.seller_id)}
                  className={cn(
                    pill,
                    row.kind === "remove"
                      ? "border-critical bg-critical text-white hover:brightness-110"
                      : "border-warn bg-warn text-white hover:brightness-110",
                  )}
                >
                  {row.kind === "remove" ? "Remove" : "Apply fix"}
                </button>
              ) : null}
              {x.sellerId !== undefined && row && (
                <button type="button" onClick={() => onGo(x.sellerId)} className="text-[11px] font-medium text-slate-500 hover:text-primary">
                  Show me
                </button>
              )}
              {x.field === "version" && (
                <button type="button" onClick={() => onGo(undefined, "version")} className="text-[11px] font-medium text-slate-500 hover:text-primary">
                  Show me
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
