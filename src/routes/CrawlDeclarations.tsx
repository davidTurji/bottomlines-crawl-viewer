import { Pager, usePaging } from "@/components/ListControls";
import { Collapse, Settle } from "@/components/Motion";
import LockedTail from "@/components/LockedTail";
import TrialBanner from "@/components/TrialBanner";
import { DeclarationsSkeleton } from "@/components/Skeleton";
import { SourceFileButton, PublisherDomainLink } from "@/components/PublisherLinks";
import { ReportButton } from "@/components/ReportButton";
import { ReportDescription } from "@/components/ReportDescription";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Download } from "lucide-react";

import { api, type RelationshipMismatch, type Summary } from "../lib/api";
import {
  DECLARATION_KINDS,
  KIND_COPY,
  countryName,
  downloadCsv,
  normalizeDeclarations,
  subjectCsv,
  type DeclarationKind,
  type DeclarationSection,
  type DeclarationSubject,
  type NormalizedDeclarations,
} from "../lib/declarations";
import { FilterBar, FilterGroup, FilterSearch, FilterSelect } from "@/components/FilterBar";
import { PageShell } from "@/components/PageShell";
import { formatWeek, WeekLine } from "@/components/WeekLine";
import { PAGE_SIZE } from "@/lib/paging";
import { useReportScope } from "@/lib/reportScope";
import { cn } from "@/lib/utils";
import { MiniStat, SplitStat, reportDate, type StatTone } from "./CrawlReport";

/**
 * DECLARATIONS.
 *
 * The other list pages show what the crawled files CARRY: lines, and how
 * they moved. This page shows what the files SAY about other companies.
 * ads.txt gives a publisher three variables that name somebody else:
 *
 *   INVENTORYPARTNERDOMAIN   a partner selling inventory on its behalf
 *   OWNERDOMAIN              the business that owns the inventory
 *   MANAGERDOMAIN            the sales house monetising it, optionally
 *                            scoped to one country
 *
 * Three sections, in that order, sectioned by kind because the reader's
 * question is "who names ME as their partner / owner / manager", and the
 * three answers mean different things commercially. Each section is a
 * card list in the Discovery page's grammar: a disc, the declared domain
 * dominant, right-aligned counts, click-to-expand roster of the files that
 * said it. The cards wear three shades of yellow, one per kind, because a
 * declaration is a claim a file makes rather than a line we found: the
 * register changes, and so does the colour.
 *
 * The payload is the frozen Excel sheet (flat rows), grouped client-side
 * by `normalizeDeclarations`, which also reads the older grouped shape so
 * every link ever minted keeps opening. Nothing here asks the crawler.
 */


type KindFilter = "all" | DeclarationKind;
type SortKey = "files" | "name";

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All kinds" },
  { value: "inventory partner", label: "Inventory partners" },
  { value: "owner domain", label: "Owner domains" },
  { value: "manager domain", label: "Manager domains" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "files", label: "Most files first" },
  { value: "name", label: "A to Z" },
];

/** The yellow each kind wears: foreground, tint, hairline, solid disc. */
const KIND_TONE: Record<
  DeclarationKind,
  { stat: StatTone; text: string; bg: string; border: string; solid: string; tint: string }
> = {
  "inventory partner": {
    stat: "declIpd",
    text: "text-declIpd",
    bg: "bg-declIpd-bg",
    border: "border-declIpd-border",
    solid: "bg-declIpd text-white",
    tint: "bg-declIpd-bg/50",
  },
  "owner domain": {
    stat: "declOwner",
    text: "text-declOwner",
    bg: "bg-declOwner-bg",
    border: "border-declOwner-border",
    solid: "bg-declOwner text-white",
    tint: "bg-declOwner-bg/50",
  },
  "manager domain": {
    stat: "declManager",
    text: "text-declManager",
    bg: "bg-declManager-bg",
    border: "border-declManager-border",
    solid: "bg-declManager text-white",
    tint: "bg-declManager-bg/50",
  },
};

export default function CrawlDeclarations() {
  const { token } = useReportScope();
  const [summary, setSummary] = useState<Summary | null>(null);
  // Whether the summary request has SETTLED, success or failure — which
  // is not the same question as whether a summary arrived. Every page here
  // swallows a summary failure (the week line is the only thing that reads
  // it, and a page whose own numbers are fine should not die for a missing
  // date), so `summary` stays null forever on an old artifact whose summary
  // does not load. Reserving the week line's space on `!summary` would then
  // shimmer a skeleton bar for ever on exactly those older links.
  const [summarySettled, setSummarySettled] = useState(false);
  const [previous, setPrevious] = useState<Summary | null>(null);
  const [data, setData] = useState<NormalizedDeclarations | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("files");
  const [focusKind, setFocusKind] = useState<KindFilter | null>(null);
  const focusPending = useRef(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pages, setPages] = useState<Record<DeclarationKind, number>>({
    "inventory partner": 1,
    "owner domain": 1,
    "manager domain": 1,
  });

  useEffect(() => {
    let cancelled = false;
    api
      .summary(token)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => {})
      .finally(() => !cancelled && setSummarySettled(true));
    // Only for the week line's "compared with" date; the page's own numbers
    // never depend on it, so a failure costs the date and nothing else.
    api
      .previousSummary(token)
      .then((p) => !cancelled && setPrevious(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnavailable(false);
    api
      .declarations(token)
      .then((d) => {
        if (cancelled) return;
        const normalized = normalizeDeclarations(d);
        setData(normalized);
        // A customer report names the customer's own few domains, so each
        // section is a handful of cards whose roster IS the content. Those
        // open on arrival; a long list (an older run-wide report) stays
        // collapsed, like the Discovery page.
        setOpen(
          new Set(
            normalized.sections
              .filter((sec) => sec.subjects.length <= 3)
              .flatMap((sec) => sec.subjects.map((sub) => `${sub.kind}|${sub.domain}`)),
          ),
        );
      })
      .catch(() => {
        // A report frozen before declarations existed answers an error
        // here. That is a fact about the report's age, not a fault, and
        // the page says so instead of showing a red line.
        if (cancelled) return;
        setData(normalizeDeclarations(null));
        setUnavailable(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // A new filter is a new list; a page number held over from the old one
  // would open on an empty page.
  useEffect(() => {
    setPages({ "inventory partner": 1, "owner domain": 1, "manager domain": 1 });
  }, [query, kind, sort]);

  const toggle = useCallback((key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const needle = query.trim().toLowerCase();

  /** The sections after the filter bar, sorted as asked. The search matches
   *  the declared domain OR any file that declared it, so "who names
   *  selectmedia" and "what does kedoo.com declare" are the same box. */
  const visible = useMemo<DeclarationSection[]>(() => {
    if (!data) return [];
    return data.sections
      .filter((s) => kind === "all" || s.kind === kind)
      .map((s) => {
        let subjects = s.subjects;
        if (needle) {
          subjects = subjects.filter(
            (sub) =>
              sub.domain.includes(needle) ||
              sub.declarers.some((d) => d.domain.includes(needle)),
          );
        }
        if (sort === "name") {
          subjects = [...subjects].sort((a, b) => a.domain.localeCompare(b.domain));
        }
        return { ...s, subjects };
      });
  }, [data, kind, needle, sort]);

  const focusSection = (target: KindFilter) => {
    setQuery(""); setKind("all");
    setFocusKind(target); focusPending.current = true;
  };
  useEffect(() => {
    if (!focusPending.current || focusKind === null) return;
    focusPending.current = false;
    const id = focusKind === "all" ? data?.sections.find(section => section.new_declarations > 0)?.kind ?? data?.sections[0]?.kind : focusKind;
    const target = document.querySelector<HTMLElement>(`[data-declaration-section="${id}"]`);
    if (!target) return;
    const scroller = target.closest<HTMLElement>("[data-report-main]");
    if (scroller) scroller.scrollBy({ top: target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    target.focus({ preventScroll: true });
    const timer = window.setTimeout(() => setFocusKind(null), 1600);
    return () => window.clearTimeout(timer);
  }, [focusKind, data, kind, query]);

  const weekLabel = summary?.finished_at
    ? formatWeek(new Date(summary.finished_at))
    : null;
  const prevWeekLabel = previous?.finished_at
    ? formatWeek(new Date(previous.finished_at))
    : null;

  const nothingAtAll = !loading && data !== null && data.total === 0;

  return (
    <PageShell>
      {summary?.trial && <TrialBanner caps={summary.trial} summary={summary} />}
      <div className="min-w-0" data-tour="declarations-header">
        <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
          Declarations
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Publisher files that name your domain.
        </p>
        <WeekLine
          week={weekLabel}
          previousWeek={prevWeekLabel}
          isFirstCrawl={summary?.previous_job_id === null}
          pending={!summarySettled}
          className="mt-1.5"
        />
      </div>

      {/* One KPI card, full width, same shape as the Discovery page's. The
          numbers are declarations (one file naming one domain, once per
          file), which is the count the Excel sheet has; the domains named
          sit underneath as the hint. */}
      {!loading && data && data.total > 0 && (
        <div className="report-panel declaration-kpis rounded-2xl border border-border bg-white p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <div className="font-display text-sm font-medium text-slate-700">
                Declared this crawl
              </div>
              <div className="text-[11px] text-slate-500">
                {data.total.toLocaleString()} declarations. A publisher naming
                you in both files counts once.
              </div>
            </div>
          </div>
          {/* NEW THIS WEEK LEADS, in the brand green every "added" figure
              in the report wears; each kind below says its own share of it
              in its own yellow. Publishers naming the customer for the
              first time are the week's news on this page. Only when the report marks new
              rows; otherwise the three kinds stand alone. */}
          <div
            className={cn(
              "grid gap-px overflow-hidden rounded-xl border border-border bg-border",
              data.new_total != null
                ? "grid-cols-2 sm:grid-cols-[1.3fr_1fr_1fr_1fr]"
                : "grid-cols-3",
            )}
          >
            {data.new_total != null && (
              <SplitStat
                tone="ok"
                prefix={data.new_total > 0 ? "+" : undefined}
                number={data.new_total}
                label="New this week"
                caption="Declarations no publisher made last week"
                className="bg-white"
                onClick={() => focusSection("all")}
              />
            )}
            {data.sections.map((s) => (
              <SplitStat
                key={s.kind}
                className="bg-white"
                tone={s.declarations > 0 ? KIND_TONE[s.kind].stat : undefined}
                number={s.declarations}
                label={KIND_COPY[s.kind].title}
                onClick={() => focusSection(s.kind)}
                {...kindHint(s, data.legacy, data.new_total != null)}
              />
            ))}
          </div>
        </div>
      )}



      {loading && (
        <DeclarationsSkeleton />
      )}

      {unavailable && (
        <SectionEmpty>
          Declarations were not captured for this report. Reports generated
          from now on carry them.
        </SectionEmpty>
      )}

      {nothingAtAll && !unavailable && (
        <SectionEmpty>
          No publisher file named your domain this crawl.
        </SectionEmpty>
      )}

      {!loading && data && data.total > 0 && (
        <>
          {visible
            // Older reports were frozen before manager domains were read at
            // all. An empty section there would claim "no file named one",
            // which is not known; the tile above says "not captured".
            .filter((s) => !(data.legacy && s.kind === "manager domain"))
            .map((section) => (
            <KindSection
              key={section.kind}
              focused={focusKind === section.kind || (focusKind === "all" && section.new_declarations > 0)}
              section={section}
              controls={
                <>
                  <FilterSearch value={query} onChange={setQuery} placeholder="Filter by domain, named or naming" />
                  <FilterGroup>
                    <FilterSelect value={kind} onChange={setKind} options={KIND_OPTIONS} leading="Kind" ariaLabel="Which declarations to show" />
                    <FilterSelect value={sort} onChange={setSort} options={SORT_OPTIONS} leading="Sort" ariaLabel="Sort declared domains" />
                  </FilterGroup>
                </>
              }
              fileDate={reportDate({ finished_at: summary?.finished_at ?? null })}
              filtered={needle.length > 0}
              page={pages[section.kind]}
              onPage={(n) => setPages((p) => ({ ...p, [section.kind]: n }))}
              open={open}
              onToggle={toggle}
              capped={data.legacy}
            />
          ))}
          {(summary?.trial || data.trial) && (
            <LockedTail
              slice={data.trial ?? null}
              caps={summary?.trial ?? null}
              // The cut is per file listing, the page groups per publisher:
              // the tail names the unit it counts.
              noun="file listings"
              detail="file that names your domain, who declared it and where"
            />
          )}

          {/* Only the older grouped payload carries these. Kept so those
              links show exactly what they always did. */}
          {data.mismatches.length > 0 && kind === "all" && !needle && (
            <div>
              <div className="mb-3">
                <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">
                  Seats with a different relationship
                </h2>
                <p className="text-sm text-slate-500">
                  The line matched your seat, but the file carries a different
                  relationship than your watchlist wants.
                </p>
              </div>
              <div className="space-y-3">
                {data.mismatches.map((m, i) => (
                  <MismatchCard
                    key={`${m.developer_domain}|${m.ssp_domain}|${m.publisher_id}|${i}`}
                    row={m}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

/**
 * What a kind's stat says under its label. With "new" marked on the
 * report: how many domains it names as the caption, and this kind's share
 * of the week's new declarations as the hint, in the kind's own yellow.
 * Without: the domain count alone, as before.
 */
function kindHint(
  s: DeclarationSection,
  legacy: boolean,
  marked: boolean,
): { hint: string; caption?: string; hintClassName?: string } {
  const named =
    s.subjects.length > 0
      ? `${s.subjects.length.toLocaleString()} ${
          s.subjects.length === 1 ? "domain" : "domains"
        } named`
      : legacy && s.kind === "manager domain"
        ? "not captured for this report"
        : "none named";
  if (!marked) return { hint: named };
  return s.new_declarations > 0
    ? {
        caption: named,
        hint: `+${s.new_declarations.toLocaleString()} new this week`,
        hintClassName: cn("font-medium", KIND_TONE[s.kind].text),
      }
    : { caption: named, hint: "none new this week" };
}

/* ── One kind: heading, cards, pager ───────────────────────────────── */

function KindSection({
  focused,
  controls,
  section,
  fileDate,
  filtered,
  page,
  onPage,
  open,
  onToggle,
  capped,
}: {
  focused: boolean;
  controls: React.ReactNode;
  section: DeclarationSection;
  /** The report's date, for the CSV filenames. */
  fileDate: string;
  filtered: boolean;
  page: number;
  onPage: (n: number) => void;
  open: Set<string>;
  onToggle: (key: string) => void;
  capped: boolean;
}) {
  const copy = KIND_COPY[section.kind];
  const tone = KIND_TONE[section.kind];
  const paging = usePaging(onPage);
  const total = section.subjects.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const slice = section.subjects.slice(start, start + PAGE_SIZE);

  return (
    <section tabIndex={-1} data-declaration-section={section.kind} data-focused={focused} className="declaration-section outline-none">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="flex items-center gap-2 font-display text-base font-semibold tracking-tight text-slate-900"
            title={copy.variable}
          >
            <span
              aria-hidden
              className={cn("h-2.5 w-2.5 flex-shrink-0 rounded-full", tone.solid)}
            />
            {copy.title}
          </h2>
          <ReportDescription className="mt-0.5" label={copy.title}
            summary={section.kind === "inventory partner" ? "Partners named in publisher files." : section.kind === "owner domain" ? "Owners named in publisher files." : "Sales managers named in publisher files."}>
            {copy.blurb}
          </ReportDescription>
        </div>
        {total > 0 && (
          <div className="hidden flex-shrink-0 text-right text-xs text-slate-500 sm:block">
            <span className="font-sans tabular-nums text-slate-700">
              {total.toLocaleString()}
            </span>{" "}
            {total === 1 ? "domain" : "domains"}
          </div>
        )}
      </div>

      <div ref={paging.topRef} className="mb-3">
        <FilterBar>
          {controls}
          <Pager placement="inline" className="list-toolbar-pager" page={page} pageSize={PAGE_SIZE}
            total={total} onPage={paging.onPage} noun="domains" nounOne="domain" />
        </FilterBar>
      </div>

      {total === 0 ? (
        <SectionEmpty>
          {filtered
            ? "Nothing matches that filter."
            : "None this crawl."}
        </SectionEmpty>
      ) : (
        <div className="space-y-3">
          {slice.map((s, i) => (
            <Settle key={`${s.kind}|${s.domain}`} index={i}>
              <SubjectCard
                subject={s}
                fileDate={fileDate}
                capped={capped}
                open={open.has(`${s.kind}|${s.domain}`)}
                onToggle={() => onToggle(`${s.kind}|${s.domain}`)}
              />
            </Settle>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <Pager
          className="mt-3 border-t border-border/70 pt-3"
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={paging.onPage}
          noun="domains" nounOne="domain"
        />
      )}
    </section>
  );
}

/* ── The card ──────────────────────────────────────────────────────── */

/**
 * One declared domain, a deliberate sibling of the Discovery page's
 * LineCard: rounded-3xl, a 44px disc, the subject dominant in mono,
 * right-aligned counts, a chevron, and a neutral expanded body. The
 * section heading supplies the kind accent; the roster stays easy to read.
 */
function SubjectCard({
  subject,
  fileDate,
  capped,
  open,
  onToggle,
}: {
  subject: DeclarationSubject;
  fileDate: string;
  /** Legacy payloads cap the roster at 50; the count stays honest. */
  capped: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const tone = KIND_TONE[subject.kind];
  const initial = (subject.domain.replace(/^www\./i, "").charAt(0) || "?")
    .toUpperCase();
  const notShown = Math.max(0, subject.total - subject.declarers.length);
  const both = subject.ads_txt > 0 && subject.app_ads_txt > 0;

  return (
    <div
      className={cn(
        "report-row declaration-card overflow-hidden rounded-xl border border-border bg-white transition-colors",
      )}
      data-declaration-kind={subject.kind}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5"
      >
        <div
          className={cn(
            "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-base font-semibold",
            tone.bg, tone.text,
          )}
        >
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <code className="block truncate font-mono text-[13px] font-semibold tracking-tight text-slate-900 sm:text-[15px]">
            {subject.domain}
          </code>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            {/* What's new on this domain, in words: the whole domain when
                nobody named it last week, else how many publishers are new
                to naming it. */}
            {subject.is_new ? (
              <NewMark className={tone.text}>new this week</NewMark>
            ) : subject.new_count > 0 ? (
              <NewMark className={tone.text}>
                +{subject.new_count.toLocaleString()} new this week
              </NewMark>
            ) : null}
            {/* The count lives in the Declarations column from sm up. */}
            <span className="sm:hidden">
              <span className="font-sans tabular-nums text-slate-700">
                {subject.total.toLocaleString()}
              </span>{" "}
              {subject.total === 1 ? "publisher" : "publishers"}
            </span>
            <span className="text-slate-400">
              {both ? "ads.txt, app-ads.txt" : subject.app_ads_txt > 0 ? "app-ads.txt" : "ads.txt"}
            </span>
            {subject.countries.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {subject.countries.map((c) => (
                  <span
                    key={c}
                    className={cn(
                      "rounded-full border px-1.5 py-px font-mono text-[10px]",
                      tone.border, tone.text,
                    )}
                    title={countryName(c)}
                  >
                    {c}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>

        {/* Reserved columns, like every card list here: a subject with no
            app-ads.txt declarers leaves its slot empty rather than sliding
            the other numbers across. */}
        <div className="hidden items-center gap-6 text-right sm:flex">
          <div className="w-[76px]">
            <MiniStat label="Publishers" value={subject.total} emphasis />
          </div>
          <div className="w-[64px]">
            <MiniStat label="ads.txt" value={subject.ads_txt} />
          </div>
          <div className="w-[76px]">
            <MiniStat label="app-ads.txt" value={subject.app_ads_txt} />
          </div>
        </div>

        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 flex-shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <Collapse open={open}>
        <div className="declaration-detail border-t border-border px-4 pb-4 pt-3 sm:px-5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-slate-700">
              Named by{" "}
              <span className="font-sans tabular-nums text-slate-500">
                {subject.total.toLocaleString()}
              </span>{" "}
              {subject.total === 1 ? "publisher" : "publishers"}
            </span>
            {/* Every publisher that named this domain, which file, and the
                country: the workbook's Declarations sheet, for this one
                domain and kind. Built from the frozen payload in the
                browser, so it costs no request and works while the
                crawler sleeps. */}
            <ReportButton
              title={notShown > 0 ? `Download the ${subject.declarers.length} publishers captured in this older report` : "Download every publisher that names this domain"}
              onClick={(e) => {
                e.stopPropagation();
                // Named like the workbook: the customer's domain, the
                // kind, and the report's date.
                downloadCsv(
                  `${subject.domain.replace(/^www\./i, "")}-${subject.kind.replace(/ /g, "-")}s-${fileDate}.csv`,
                  subjectCsv(subject),
                );
              }}
              className="report-download-action"
            >
              <Download className="h-3 w-3" />
              Export CSV
            </ReportButton>
          </div>
          {/* Three rows tall, the rest by scrolling inside the card (David,
              2026-09-15), so a domain named by forty files does not push
              the next section off screen. */}
          <div className="scroll-y max-h-[13rem] overflow-y-auto rounded-md border border-border bg-white">
            <ul className="divide-y divide-border">
              {/* One row per publisher, its files on the right in the
                  overview's wording ("Found in ads.txt + app-ads.txt"): the
                  same declaration in two files is one declaration, said in
                  two places. */}
              {subject.declarers.map((d, i) => (
                <li
                  key={`${d.domain}|${i}`}
                  className="declaration-publisher text-xs tabular-nums"
                >
                  <span className="declaration-match-number" aria-label={`Publisher ${i + 1}`}>{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <PublisherDomainLink domain={d.domain} className="break-all font-medium text-slate-800" />
                      {d.is_new && <NewMark className="text-primary">new</NewMark>}
                      {d.country && (
                        <span className={cn("flex-shrink-0 text-[10px]", tone.text)} title={countryName(d.country)}>
                          {d.country}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {d.files.length > 0 ? `${d.files.length} ${d.files.length === 1 ? "file" : "files"} · ${d.files.join(" + ")}` : "Source file not recorded"}
                    </div>
                  </div>
                  <div className="declaration-publisher-actions">
                    <SourceFileButton domain={d.domain} foundIn={d.files.length > 1 ? "both" : d.files[0]} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {capped && notShown > 0 && (
            <p className="mt-1 text-[10px] text-slate-500">
              {notShown.toLocaleString()} more were not captured in this older report. CSV includes the captured publishers only.
            </p>
          )}
        </div>
      </Collapse>
    </div>
  );
}

/**
 * One mismatched seat, from the older grouped payload. No expansion: the
 * card already carries the whole fact, which is the two relationships side
 * by side.
 */
function MismatchCard({ row }: { row: RelationshipMismatch }) {
  const initial = (row.ssp_domain.replace(/^www\./i, "").charAt(0) || "?")
    .toUpperCase();
  return (
    <div className="report-row overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="flex w-full items-center gap-4 px-4 py-4 sm:px-5">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-warn-bg text-base font-semibold text-warn">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <code className="block truncate font-mono text-[13px] font-semibold tracking-tight text-slate-900 sm:text-[15px]">
            {row.ssp_domain}, {row.publisher_id}
          </code>
          <div className="mt-1 truncate text-xs text-slate-500">
            watchlist says{" "}
            <span className="font-mono text-slate-700">{row.wanted_relationship}</span>
            , file says{" "}
            <span className="font-mono font-semibold text-warn">
              {row.found_relationship}
            </span>
            <span className="sm:hidden">
              {" "}
              in {row.found_in} on {row.developer_domain}
            </span>
          </div>
        </div>
        <div className="hidden min-w-0 flex-shrink-0 text-right sm:block">
          <div className="truncate text-xs text-slate-700">{row.developer_domain}</div>
          <div className="text-[10px] text-slate-400">{row.found_in}</div>
        </div>
      </div>
    </div>
  );
}

/** The "new" marker: words in the card's own yellow, no pill, no fill,
 *  so "new" reads as part of the card rather than a sticker on it. */
function NewMark({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={cn("flex-shrink-0 font-sans text-[11px] font-semibold", className)}>
      {children}
    </span>
  );
}

/* ── Empty state ───────────────────────────────────────────────────── */

/** A section with nothing in it is a normal result, said plainly. */
function SectionEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-8 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

export { DECLARATION_KINDS };
