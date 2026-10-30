import {
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Download,
  EyeOff,
  Info,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { EntryDiff, JsonDiff } from "@/components/JsonDiff";
import { Collapse, Settle, glideTo, toggleWithoutJump } from "@/components/Motion";
import { ReportButton } from "@/components/ReportButton";
import { ReportDisclosure } from "@/components/ReportDisclosure";
import { PageShell } from "@/components/PageShell";
import SellerRoles from "@/components/SellerRoles";
import { ActionableLine, LineActionGroup, fileUrl, filesOf, linkable, PublisherDomainLink, ShownLink, siteUrl } from "@/components/PublisherLinks";
import { SkeletonRows, SkeletonStatCards } from "@/components/Skeleton";
import { formatWeek, WeekLine } from "@/components/WeekLine";
import { useReportScope } from "@/lib/reportScope";
import {
  buildExport,
  fillInFields,
  isEntry,
  norm,
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
 * "Skip" and the reader switches on what they want.
 */

type GroupKey = "add" | "fix" | "remove";

/** Each group's sign and ink, the Changes page's grammar: + green, a fix
 *  amber. A seller no crawled file lists is amber too, never red (David,
 *  2026-10-11): the IAB spec does not ask a seller to appear in any ads.txt,
 *  so "not seen" is a reason to check, not proof the entry is wrong. */
const GROUP: Record<GroupKey, { title: string; icon: typeof Plus; disc: string; text: string }> = {
  add: { title: "Add", icon: Plus, disc: "bg-ok-bg text-ok", text: "text-ok" },
  fix: { title: "Fix", icon: RefreshCw, disc: "bg-warn-bg text-warn", text: "text-warn" },
  remove: { title: "Not seen, check first", icon: EyeOff, disc: "bg-warn-bg text-warn", text: "text-warn" },
};

/** The customer's live sellers.json, opened at one seller ID when given.
 *  The highlight is a text fragment on the ID as the file writes it: in its
 *  quotes when it is text, so "1" cannot land on "version": "1.0" or an
 *  is_confidential 1 (review, 2026-10-11). An ID written as a number is
 *  highlighted bare only when it is long enough to be unlikely elsewhere.
 *  A browser without text fragments opens the file at the top. */
function sellersJsonUrl(fileHref: string, id?: string, raw?: unknown): string {
  const t = (id ?? "").trim();
  if (!t) return fileHref;
  const needle = typeof raw === "number" ? (t.length >= 4 ? t : "") : `"${t}"`;
  return needle ? `${fileHref}#:~:text=${encodeURIComponent(needle).replace(/-/g, "%2D")}` : fileHref;
}

/** "6 Oct 2026": the day the live file was read. */
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

/** How many cards a group shows before "Show all". */
const PEEK = 3;
const SECTION_CARD = "report-panel rounded-2xl border border-border bg-white p-5";
const SECTION_TITLE = "flex items-center gap-2 font-display text-sm font-medium text-slate-700";
const SELLER_ROLE_GUIDE = "Publisher: owns inventory, paid directly. Intermediary: others’ inventory or indirect payment. Both: both roles. DIRECT/RESELLER does not determine the role.";

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
    () => (data ? suggest(data.file ?? { sellers: [] }, data.sightings, data.domain, data.file_checks ?? []) : []),
    [data],
  );
  const rows = useMemo(() => withEdits(plain, edits), [plain, edits]);

  // Every suggestion starts off; new suggestions start off again.
  useEffect(() => {
    setTicked(new Set());
  }, [plain]);

  const groupOf = (r: SellerRow): GroupKey | null => (r.kind === "keep" ? null : r.kind);

  /** An existing file with no version: fixed by a card of its own in Fix. */
  const versionMissing = !creating && data?.file != null && data.file.version !== "1.0";

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
  /** Where the customer's live file sits: where it was read, else the
   *  standard place. */
  const fileHref = data ? data.file_url || `https://${data.domain}/sellers.json` : "";
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
            <CopyButton text={exportText} label="Copy file" disabled={blocked} />
            <ExportButton onClick={download} label="Download file" disabled={blocked} />
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
          <div className="report-panel rounded-2xl border border-border bg-white p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                {creating ? (
                  // No file there to open: plain text, never a link to a 404.
                  <div className="font-display text-sm font-medium text-slate-700">{data.domain}/sellers.json</div>
                ) : (
                  <ShownLink
                    href={fileHref}
                    title={`Open ${fileHref.replace(/^https?:\/\//, "")} in a new tab`}
                    className="font-display text-sm font-medium"
                  >
                    {data.domain}/sellers.json
                  </ShownLink>
                )}
                <div className="text-[11px] text-slate-500">
                  {creating
                    ? `No file at ${data.domain}/sellers.json${readOn ? ` when we checked on ${readOn}` : ""}. Built from every ads.txt and app-ads.txt line naming ${data.domain}`
                    : `${readOn ? `Read on ${readOn}` : "Read"}${readFrom ? ` from ${readFrom}` : ""}, compared with crawl evidence and this report’s file checks`}
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
                  label="Selected"
                  caption="The ones you added"
                />
                <SplitStat
                  className="bg-white"
                  tone="warn"
                  number={counts.unnamed}
                  label="Missing names"
                  caption="Only you can say who they are"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
                <SplitStat
                  className="bg-white"
                  number={data.file?.sellers.length ?? 0}
                  label="In your file"
                  caption={readOn ? `As read on ${readOn}` : "As read for this report"}
                />
                <SplitStat
                  className="bg-white"
                  tone="ok"
                  prefix="+"
                  number={counts.add}
                  label="Missing sellers"
                  caption="Publishers list them, your file doesn't"
                />
                <SplitStat
                  className="bg-white"
                  tone="warn"
                  number={counts.fix}
                  label="Needs fixes"
                  caption="Written wrong, duplicated or disputed"
                />
                <SplitStat
                  className="bg-white"
                  tone={counts.remove ? "warn" : undefined}
                  number={counts.remove}
                  label="Not seen"
                  caption="Review before removing"
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
                flagged={new Set(issues.map((x) => x.sellerId).filter(Boolean) as string[])}
                domain={data.domain}
                fileHref={creating ? null : fileHref}
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

          {rows.some(r => r.unverified) && (
            <ReportDisclosure className={SECTION_CARD} testId="seller-info" summary={
                  <span>
                    <span className={SECTION_TITLE}>
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <Info aria-hidden className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                      Info
                      <span className="font-mono text-[12px] font-normal tabular-nums text-slate-400">
                        1
                      </span>
                    </span>
                    <span className="block text-[11px] text-slate-500">File status, no changes to your file</span>
                  </span>
              }>
              <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
                {rows.some(r => r.unverified) && <ReportDisclosure testId="seller-info-unreachable"
                  triggerClassName="px-4 py-3 text-[12.5px] font-medium text-slate-700" summary={
                    <span>Unreachable files <span className="ml-2 font-mono text-[11px] font-normal text-slate-400">{rows.filter(r => r.unverified).length} sellers kept</span></span>
                  }>
                  <div className="border-t border-border px-4 pb-3">
                    <p className="mt-3 text-xs text-slate-500">Some files couldn’t be fetched or verified. This does not mean the seller is missing; no removal recommendation is made.</p>
                    <div className="mt-2 divide-y divide-border">{rows.filter(r => r.unverified).slice(0, 50).map(r => <div key={r.seller_id} className="py-3 text-xs">
                      <span className="font-medium">{r.seller_id}</span> · <SellerWho seller={r.current}/>
                      <p className="mt-1 text-slate-500">{r.reason}</p>
                    </div>)}</div>
                    {rows.filter(r => r.unverified).length > 50 && <p className="text-xs text-slate-500">Showing the first 50; all unverified sellers are preserved.</p>}
                  </div>
                </ReportDisclosure>}

              </div>
            </ReportDisclosure>
          )}

          {/* THE FILE, after the panels that change it: live against the
              export, as GitHub shows a diff. Rebuilt on every tick and every
              fill-in above. */}
          <div className="report-panel rounded-2xl border border-border bg-white p-5">
            {/* WHAT YOU ARE EXPORTING, in one plain line (David, 2026-10-06:
                the chips and the verdict were clutter). Copy and Download
                sit at the top of the page; Add / Skip controls the downloaded file. */}
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
                <CopyButton text={exportText} label="Copy file" disabled={blocked} />
                <ExportButton onClick={download} label="Download file" disabled={blocked} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* SELLER ROLES (David, 2026-10-27): moved here from the Overview's
          expanded rows, a segment of its own, below the file. */}
      <SellerRoles token={token} summary={summary} settled={summarySettled} />
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
  flagged,
  domain,
  fileHref,
  headerFix,
}: {
  group: GroupKey;
  domain: string;
  /** The customer's live file, for the links to it; null when there is none. */
  fileHref: string | null;
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
  flagged: Set<string>;
}) {
  const g = GROUP[group];
  const Icon = g.icon;
  const taken = rows.filter((r) => ticked.has(r.seller_id)).length + (headerFix?.on ? 1 : 0);
  const total = rows.length + (headerFix ? 1 : 0);
  const shown = rows.slice(0, PEEK);
  const ids = rows.map((r) => r.seller_id);
  const renderRows = (items: SellerRow[], offset = 0) => items.map((r, i) => (
    <Settle key={r.seller_id} index={offset + i}>
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
        domain={domain}
        fileHref={fileHref}
      />
    </Settle>
  ));
  // Each group in its own card (David, 2026-10-06: Add, Fix and Remove
  // apart, each in a wrapper), in the report's own card grammar: the KPI
  // card's head (a quiet title and a line under it) over one bordered
  // list of plain rows, never boxes inside a box.
  return (
    <section className={SECTION_CARD}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={SECTION_TITLE}>
            <span className={cn("flex h-4 w-4 items-center justify-center rounded-full", g.disc)}>
              <Icon aria-hidden className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            {g.title}
            <span className="font-mono text-[12px] font-normal tabular-nums text-slate-400">{total}</span>
          </h2>
          <div className="text-[11px] text-slate-500">
            {group === "remove" ? `${taken} of ${total} taken out of your file` : `${taken} of ${total} going into your file`}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ReportButton
            variant="outline"
            size="sm"
            onClick={() => {
              onSet(ids, true);
              headerFix?.onSet(true);
            }}
          >
            Add all
          </ReportButton>
          <ReportButton
            variant="outline"
            size="sm"
            onClick={() => {
              onSet(ids, false);
              headerFix?.onSet(false);
            }}
          >
            Skip all
          </ReportButton>

        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="divide-y divide-border">
          {headerFix && <VersionCard on={headerFix.on} onSet={headerFix.onSet} />}
          {renderRows(shown)}
        </div>
        {rows.length > PEEK && <Collapse open={showAll}>
          <div className="divide-y divide-border border-t border-border">{showAll && renderRows(rows.slice(PEEK), PEEK)}</div>
        </Collapse>}
      </div>
      {rows.length > PEEK && (
        <ReportButton
          variant="outline"
          size="sm"
          onClick={event => showAll ? toggleWithoutJump(event.currentTarget, onShowAll) : onShowAll()}
          aria-expanded={showAll}
          className="mt-3"
        >
          {showAll ? "Show fewer" : `Show all ${rows.length}`}
          <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
        </ReportButton>
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
    s ? [s.name || null, s.domain || null, s.seller_type ? `${r.current ? "From your file" : "Selected type"}: ${s.seller_type}` : null].filter(Boolean).join(", ") : "";
  if (r.kind === "fix" && r.current && r.suggested) {
    const parts: string[] = [];
    if (r.dropped?.length) parts.push(`listed ${r.dropped.length + 1} times, kept once`);
    for (const f of ["seller_id", "name", "domain", "seller_type", "is_confidential", "is_passthrough"] as const) {
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
  domain,
  fileHref,
}: {
  row: SellerRow;
  group: GroupKey;
  domain: string;
  fileHref: string | null;
  /** What the reader typed into this card, as typed (the file gets it
   *  cleaned: trimmed, a domain made plain). */
  typed?: Edit;
  on: boolean;
  open: boolean;
  flagged: boolean;
  onOpen: () => void;
  onSet: (on: boolean) => void;
  onEdit: (field: FillField, value: string) => void;
}) {
  const formId = useId();
  const [roleHelpOpen, setRoleHelpOpen] = useState(false);
  const g = GROUP[group];
  const Icon = g.icon;
  const fields = fillInFields(row);
  const sourceCount = Math.max(row.listingsTotal ?? 0, row.listings.length);
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
        {/* The row opens the card from anywhere on it; the seller ID and the
            seller's domain on it are links of their own (David,
            2026-10-11: everything on this page clickable, like the other
            pages). One real button under the text, links above it. */}
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            aria-expanded={open}
            aria-label={`Seller ${row.seller_id || "with no seller_id"}, details`}
            className="absolute inset-0 z-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <span className="pointer-events-none relative flex min-w-0 items-baseline gap-2">
            {fileHref && row.current && row.seller_id ? (
              <ShownLink
                href={sellersJsonUrl(fileHref, row.seller_id, row.current.seller_id)}
                title={`Open ${domain}/sellers.json at seller ${row.seller_id}`}
                className="flex-shrink-0 font-mono text-[12.5px] font-semibold"
              >
                {row.seller_id}
              </ShownLink>
            ) : (
              <code className="flex-shrink-0 font-mono text-[12.5px] font-semibold text-slate-900">
                {row.seller_id || "no seller_id"}
              </code>
            )}
            <span className={cn("seller-header-summary min-w-0 truncate text-[12px] text-slate-600", row.kind === "remove" && on && "line-through")}>
              {row.kind === "fix" ? summaryOf(row) : <SellerWho seller={row.kind === "remove" ? row.current : row.suggested} fromFile={row.kind !== "add"} />}
            </span>
            {missing.length > 0 && (
              <span className="flex-shrink-0 text-[11px] font-medium text-warn">needs a {missing.join(" and a ")}</span>
            )}
            {row.check && <span className="flex-shrink-0 text-[11px] font-medium text-warn">check first</span>}
          </span>
          {/* Open, the card says the whole reason below; the short line
              would only say it twice. */}
          {!open && <span className="pointer-events-none relative block truncate text-[11px] text-slate-400">{row.reason}</span>}
          {/* THE ONE PLACE TO CHECK IT, on the row itself (David,
              2026-10-11): which link depends on what the row says. */}
          {!open && <RowLinks row={row} domain={domain} fileHref={fileHref} />}
        </div>
        {/* On a phone the worded choice takes its own row under the seller,
            so neither squeezes the other. */}
        <div className="order-last flex basis-full items-center gap-2 pl-10 sm:order-none sm:basis-auto sm:pl-0">
          <Decision on={on} onSet={onSet} id={row.seller_id} group={group} />
        </div>
        <ReportButton
          variant="outline"
          size="sm"
          onClick={onOpen}
          aria-expanded={open}
          aria-label={open ? "Close" : "Open"}
          className="w-8 flex-shrink-0 px-0 max-sm:w-11"
        >
          <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </ReportButton>
      </div>
      <Collapse open={open}>
        <div className="border-t border-border bg-slate-50/50 px-3 py-3 text-xs text-slate-600 sm:px-4 sm:py-4">
          <p className="mb-4 hidden leading-relaxed sm:block">{row.reason}</p>
          {fields.length > 0 && (
            <fieldset className="min-w-0 border-0 p-0">
              <legend className="sr-only text-[13px] font-semibold text-slate-900 sm:not-sr-only sm:mb-3 sm:block">Seller details</legend>
              <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2 sm:gap-y-3">
                {fields.map((f) => {
                  const inputId = `${formId}-${f}`;
                  return (
                    <div key={f} className={cn("min-w-0", f === "seller_type" && "sm:col-span-2")}>
                      <div className="mb-1.5 flex min-h-6 items-center justify-between gap-2 sm:min-h-0">
                        <label htmlFor={inputId} className="block text-xs font-medium text-slate-700">
                          <span className="sm:hidden">{f === "name" ? "Name" : f === "domain" ? "Domain" : "Role"}</span>
                          <span className="hidden sm:inline">{f === "name" ? "Seller name" : f === "domain" ? "Domain" : "Account role"}</span>
                        </label>
                        {f === "seller_type" && (
                          <ReportButton
                            variant="outline"
                            size="sm"
                            aria-label="About account roles"
                            aria-expanded={roleHelpOpen}
                            aria-controls={`${formId}-mobile-roles`}
                            onClick={event => toggleWithoutJump(event.currentTarget, () => setRoleHelpOpen(value => !value))}
                            className="h-6 w-6 border-transparent bg-transparent p-0 text-slate-500 max-sm:min-h-6 sm:hidden"
                          >
                            <Info aria-hidden className="h-3.5 w-3.5" />
                          </ReportButton>
                        )}
                      </div>
                      {f === "seller_type" ? (
                        <select
                          id={inputId}
                          value={typed?.seller_type ?? ""}
                          onChange={(e) => onEdit(f, e.target.value)}
                          aria-label={`Account role for seller ${row.seller_id}`}
                          aria-required="true"
                          aria-describedby={`${formId}-roles`}
                          className={cn(INPUT, "h-10 text-[13px]")}
                        >
                          <option value="" disabled>Choose a role</option>
                          {SELLER_TYPES.map((t) => (
                            <option key={t} value={t}>{t === "PUBLISHER" ? "Publisher" : t === "INTERMEDIARY" ? "Intermediary" : "Both"}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={inputId}
                          value={shownValue(f)}
                          onChange={(e) => onEdit(f, e.target.value)}
                          placeholder={f === "name" ? "Seller or company name" : "example.com"}
                          aria-label={`${f === "name" ? "Seller name" : "Domain"} for seller ${row.seller_id}`}
                          aria-required={f === "name"}
                          className={cn(INPUT, "h-10 text-[13px]")}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {fields.includes("seller_type") && (
                <>
                  <p id={`${formId}-roles`} className="mt-2 hidden text-[11px] leading-relaxed text-slate-500 sm:block">{SELLER_ROLE_GUIDE}</p>
                  <div className="sm:hidden">
                    <Collapse open={roleHelpOpen} id={`${formId}-mobile-roles`}>
                      <p className="pt-2 text-[11px] leading-relaxed text-slate-500">{SELLER_ROLE_GUIDE}</p>
                    </Collapse>
                  </div>
                </>
              )}
            </fieldset>
          )}
          <div className={cn("divide-y divide-border border-t border-border", fields.length > 0 && "mt-3 sm:mt-4")}>
            <ReportDisclosure
              summary={
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span>Source evidence</span>
                  <span className="text-[11px] font-normal text-slate-400">
                    {sourceCount.toLocaleString()} {sourceCount === 1 ? "line" : "lines"}
                  </span>
                </span>
              }
              triggerClassName="items-center py-2.5 text-xs font-medium text-slate-700 sm:py-3"
              testId="seller-source-evidence"
            >
              <div className="space-y-3 pb-3">
                <p className="leading-relaxed sm:hidden">{row.reason}</p>
                <CheckLinks row={row} domain={domain} fileHref={fileHref} />
                <ListingWindow row={row} domain={domain} group={group} sellerDomain={sellerDomainOf(row)} />
              </div>
            </ReportDisclosure>
            <ReportDisclosure
              summary="File preview"
              triggerClassName="items-center py-2.5 text-xs font-medium text-slate-700 sm:py-3"
              testId="seller-file-preview"
            >
              <div className="min-w-0 space-y-2 pb-3">
                <EntryOrRaw before={row.current} after={row.kind === "remove" ? null : row.suggested} />
                {row.dropped && row.dropped.length > 0 && (
                  <>
                    <div className="pt-1 text-[11px] font-medium text-slate-500">
                      {row.dropped.length === 1 ? "Its other copy, taken out" : `Its other ${row.dropped.length} copies, taken out`}
                    </div>
                    {row.dropped.map((d, i) => <EntryOrRaw key={i} before={d} after={null} />)}
                  </>
                )}
              </div>
            </ReportDisclosure>
          </div>
        </div>
      </Collapse>
    </div>
  );
}

/** A plain domain worth linking: no spaces, at least one dot. */
const linkableDomain = (d: unknown): string | null => {
  const t = String(d ?? "").trim();
  return t && /^[^\s/]+\.[^\s/]+/.test(t.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")) && linkable(t) ? norm(t) : null;
};

/** The seller's own domain, as the file (or the suggestion) writes it. */
function sellerDomainOf(r: SellerRow): string | null {
  return linkableDomain(r.current?.domain) ?? linkableDomain(r.suggested?.domain);
}

/** Who a seller is on the card's one line: name, domain (a link to their
 *  site) and type. */
function SellerWho({ seller, fromFile = true }: { seller: Seller | null; fromFile?: boolean }) {
  if (!seller || !isEntry(seller)) return null;
  const d = linkableDomain(seller.domain);
  const parts: React.ReactNode[] = [];
  if (seller.name) parts.push(String(seller.name));
  if (d) parts.push(<PublisherDomainLink key="d" domain={d} label={String(seller.domain)} shown />);
  else if (seller.domain) parts.push(String(seller.domain));
  if (seller.seller_type) parts.push(`${fromFile ? "From your file" : "Selected type"}: ${String(seller.seller_type)}`);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && ", "}
          {p}
        </span>
      ))}
    </>
  );
}

/**
 * CHECK IT YOURSELF (David, 2026-10-11): every claim on a card one click
 * from its source. The entry in the customer's live sellers.json, the
 * seller's site, and the seller's own ads.txt and app-ads.txt, opened at
 * the customer's line where it is there.
 */
function CheckLinks({ row, domain, fileHref }: { row: SellerRow; domain: string; fileHref: string | null }) {
  const sd = sellerDomainOf(row);
  const id = row.listedAs ?? row.seller_id;
  const items: React.ReactNode[] = [];
  if (fileHref && row.current && row.seller_id) {
    items.push(
      <ShownLink key="file" href={sellersJsonUrl(fileHref, row.seller_id, row.current.seller_id)}>
        {domain}/sellers.json at {row.seller_id}
      </ShownLink>,
    );
  }
  if (sd) {
    items.push(
      <ShownLink key="site" href={siteUrl(sd)}>
        {sd}
      </ShownLink>,
    );
    for (const f of ["ads.txt", "app-ads.txt"] as const) {
      items.push(
        <ShownLink key={f} href={fileUrl(sd, f, { ssp_domain: domain, publisher_id: id })}>
          {sd}/{f}
        </ShownLink>,
      );
    }
  }
  if (!items.length) return null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-slate-500">
      <span>Check it yourself:</span>
      {items}
    </p>
  );
}

/**
 * The link a row's problem points to, shown on the closed row (David,
 * 2026-10-11): where the reader sees the problem with their own eyes.
 *
 *   Not seen  the seller's own ads.txt and app-ads.txt, where a line naming
 *             the customer would be;
 *   Add       the publisher file where the line was found;
 *   Fix       the entry in the customer's sellers.json, and, when the fix
 *             rests on what publishers list ("check first"), their file.
 */
function RowLinks({ row, domain, fileHref }: { row: SellerRow; domain: string; fileHref: string | null }) {
  const id = row.listedAs ?? row.seller_id;
  const at = { ssp_domain: domain, publisher_id: id };
  const items: React.ReactNode[] = [];
  const firstListing = () => {
    const l = row.listings[0];
    if (!l || !linkable(l.publisher)) return;
    const f = filesOf(l.found_in)[0];
    items.push(
      <ShownLink key="pub" href={fileUrl(l.publisher, f, at)} title={`Open ${l.publisher}/${f} at ${domain}, ${id}`}>
        {l.publisher}/{f}
      </ShownLink>,
    );
    const more = Math.max(row.listingsTotal ?? 0, row.listings.length) - 1;
    if (more > 0) items.push(<span key="more" className="text-slate-400">and {more.toLocaleString()} more</span>);
  };
  const ownFile = () => {
    if (fileHref && row.current && row.seller_id) {
      items.push(
        <ShownLink key="file" href={sellersJsonUrl(fileHref, row.seller_id, row.current.seller_id)}>
          your sellers.json at {row.seller_id}
        </ShownLink>,
      );
    }
  };
  if (row.kind === "remove") {
    const sd = sellerDomainOf(row);
    if (sd) {
      for (const f of ["ads.txt", "app-ads.txt"] as const) {
        items.push(
          <ShownLink key={f} href={fileUrl(sd, f, at)} title={`Look for ${domain}, ${id} in ${sd}/${f}`}>
            {sd}/{f}
          </ShownLink>,
        );
      }
    } else {
      ownFile();
    }
  } else if (row.kind === "add") {
    firstListing();
  } else if (row.kind === "fix") {
    ownFile();
    firstListing();
  }
  if (!items.length) return null;
  return (
    <span className="pointer-events-none relative mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px]">
      {items}
    </span>
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
  remove: { glyph: "-", text: "text-warn", head: "bg-warn-bg/60", border: "border-warn-border" },
};

/**
 * The ads.txt and app-ads.txt lines naming this seller, printed the way the
 * whole report prints a line (`ssp_domain, publisher_id, RELATIONSHIP`),
 * with the publisher and the file at the right margin. A suggested removal
 * has none, and says so.
 */
function ListingWindow({
  row,
  domain,
  group,
  sellerDomain,
}: {
  row: SellerRow;
  domain: string;
  group: GroupKey;
  /** The seller's own domain, where a PUBLISHER or BOTH lists it DIRECT. */
  sellerDomain: string | null;
}) {
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
          {total ? "Source lines" : "No source lines"}
        </span>
        <span className={cn("font-mono text-[11px] font-semibold tabular-nums", w.text)}>{total.toLocaleString()}</span>
      </div>
      {total === 0 ? (
        <div className="space-y-1.5 px-3 py-2 text-[11px] text-slate-500">
          <p>
            No ads.txt or app-ads.txt we crawled carries{" "}
            <code className="font-mono text-slate-700">
              {domain}, {row.listedAs ?? row.seller_id}, …
            </code>
          </p>
          {/* Where to look with your own eyes: the seller's own files. A
              PUBLISHER or BOTH lists its own ID there as DIRECT; an
              intermediary's own files often do not, which is why this is a
              check and not a verdict. */}
          {sellerDomain && (
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span>Look in {sellerDomain}'s own files:</span>
              {(["ads.txt", "app-ads.txt"] as const).map((f) => (
                <ShownLink
                  key={f}
                  href={fileUrl(sellerDomain, f, { ssp_domain: domain, publisher_id: row.listedAs ?? row.seller_id })}
                >
                  {f}
                </ShownLink>
              ))}
            </p>
          )}
        </div>
      ) : (
        <LineActionGroup>
        <ul className="divide-y divide-border">
          {/* Each line opens the publisher's file at it, and the publisher's
              name opens their site, the way every other page's lines do. */}
          {shown.map((l, i) => (
            <ActionableLine
              key={`${l.publisher}:${l.relationship}:${i}`}
              selectionLabel={`Line ${i + 1}`}
              line={{ ssp_domain: domain, publisher_id: row.listedAs ?? row.seller_id, relationship: l.relationship }}
              publisherDomain={l.publisher}
              foundIn={l.found_in}
              shown
              className="flex items-baseline gap-3 px-3 py-1.5"
            >
              <code data-line-text className="min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums text-slate-800">
                {domain}, {row.listedAs ?? row.seller_id}, {l.relationship}
              </code>
              <span className="min-w-0 flex-shrink truncate text-[10px] text-slate-400">
                {l.own ? "in the seller's own file on " : "on "}
                <PublisherDomainLink domain={l.publisher} shown />
                {foundInLabel(l.found_in) ? `, ${foundInLabel(l.found_in)}` : ""}
              </span>
            </ActionableLine>
          ))}
        </ul>
        </LineActionGroup>
      )}
      {extra > 0 && <p className="border-t border-border px-3 py-1 text-[10px] text-slate-500">Plus {extra.toLocaleString()} more.</p>}
    </section>
  );
}

/** Add / Skip always selects or excludes the displayed suggestion,
 * including a removal. Keep its meaning in the title and its group color. */
const DECISION: Record<GroupKey, { action: string; solid: string }> = {
  add: { action: "addition", solid: "border-ok bg-ok text-white hover:bg-ok/90" },
  fix: { action: "fix", solid: "border-warn bg-warn text-white hover:bg-warn/90" },
  remove: { action: "removal", solid: "border-warn bg-warn text-white hover:bg-warn/90" },
};

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
  return (
    <div role="group" aria-label={`Seller ${id}`} className="inline-flex flex-shrink-0 gap-1.5">
      <ReportButton
        variant="outline"
        size="sm"
        onClick={() => onSet(true)}
        aria-pressed={on}
        title={`Include this ${d.action} suggestion in your downloaded file`}
        className={on ? d.solid : undefined}
      >
        <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
        Add
      </ReportButton>
      <ReportButton
        variant="outline"
        size="sm"
        onClick={() => onSet(false)}
        aria-pressed={!on}
        title={`Leave this ${d.action} suggestion out of your downloaded file`}
        className={!on ? "border-slate-300 bg-slate-100 text-slate-800" : undefined}
      >
        <X aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
        Skip
      </ReportButton>
    </div>
  );
}

function ExportButton({ onClick, label, disabled = false }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <ReportButton size="sm" onClick={onClick} disabled={disabled}>
      <Download aria-hidden className="h-4 w-4" />
      {label}
    </ReportButton>
  );
}

/** Copy the exact same selected file as Download. */
function CopyButton({ text, label, disabled = false }: { text: string; label: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <ReportButton
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
      disabled={disabled}
    >
      {copied ? <Check aria-hidden className="h-4 w-4 text-ok" /> : <Copy aria-hidden className="h-4 w-4" />}
      {copied ? "Copied" : label}
    </ReportButton>
  );
}


const INPUT =
  "h-9 w-full rounded-lg border border-border bg-white px-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15";

/** The few details a new file's header needs, asked only when there is no file. */
function HeaderForm({ header, onChange }: { header: Header; onChange: (h: Header) => void }) {
  const set = (k: keyof Header) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...header, [k]: e.target.value });
  return (
    <div className="report-panel rounded-2xl border border-border bg-white p-5">
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
            <span className="truncate text-[12px] text-slate-600">version → "1.0"</span>
          </span>
          <span className="block truncate text-[11px] text-slate-400">
            The file version must be the text "1.0".
          </span>
        </div>
        <div className="order-last flex basis-full items-center gap-2 pl-10 sm:order-none sm:basis-auto sm:pl-0">
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
        <span>No structural issues detected in the file you download. Confirm seller identities, account roles and domains before publishing.</span>
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
      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
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
                  <ReportButton variant="outline" size="sm" onClick={onAddVersion} className="border-warn bg-warn text-white hover:bg-warn/90">
                    Add version 1.0
                  </ReportButton>
                )
              ) : x.field === "contact_email" ? (
                <ReportButton variant="outline" size="sm" onClick={() => onGo(undefined, x.field)} className="flex-shrink-0">
                  Fill in
                </ReportButton>
              ) : row && needsInput ? (
                <ReportButton
                  variant="outline"
                  size="sm"
                  onClick={() => onGo(x.sellerId, undefined, true)}
                  className="flex-shrink-0"
                >
                  Fill in
                </ReportButton>
              ) : row && row.kind !== "keep" && !ticked.has(row.seller_id) ? (
                <ReportButton
                  variant="outline"
                  size="sm"
                  title={what}
                  onClick={() => onApply(row.seller_id)}
                  className="border-warn bg-warn text-white hover:bg-warn/90"
                >
                  Add
                </ReportButton>
              ) : null}
              {x.sellerId !== undefined && row && (
                <ReportButton variant="outline" size="sm" onClick={() => onGo(x.sellerId)}>
                  Show me
                </ReportButton>
              )}
              {x.field === "version" && (
                <ReportButton variant="outline" size="sm" onClick={() => onGo(undefined, "version")}>
                  Show me
                </ReportButton>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
