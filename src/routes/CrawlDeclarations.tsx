import BLoader from "@/components/BLoader";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { FilterBar, FilterSearch, FilterSelect } from "@/components/FilterBar";
import { PageShell } from "@/components/PageShell";
import { formatWeek, WeekLine } from "@/components/WeekLine";
import { useReportScope } from "@/lib/reportScope";
import { cn } from "@/lib/utils";
import { MiniStat, SplitStat, type StatTone } from "./CrawlReport";

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

const PAGE_SIZE = 25;

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
  const [previous, setPrevious] = useState<Summary | null>(null);
  const [data, setData] = useState<NormalizedDeclarations | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("files");
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
      .catch(() => {});
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

  const weekLabel = summary?.finished_at
    ? formatWeek(new Date(summary.finished_at))
    : null;
  const prevWeekLabel = previous?.finished_at
    ? formatWeek(new Date(previous.finished_at))
    : null;

  const nothingAtAll = !loading && data !== null && data.total === 0;

  return (
    <PageShell>
      <div className="min-w-0">
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
          className="mt-1.5"
        />
      </div>

      {/* One KPI card, full width, same shape as the Discovery page's. The
          numbers are declarations (one file naming one domain, once per
          file), which is the count the Excel sheet has; the domains named
          sit underneath as the hint. */}
      {!loading && data && data.total > 0 && (
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <div className="font-display text-sm font-medium text-slate-700">
                Declared this crawl
              </div>
              <div className="text-[11px] text-slate-500">
                {data.total.toLocaleString()} declarations
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border">
            {data.sections.map((s) => (
              <SplitStat
                key={s.kind}
                tone={s.declarations > 0 ? KIND_TONE[s.kind].stat : undefined}
                number={s.declarations}
                label={KIND_COPY[s.kind].title}
                hint={
                  s.subjects.length > 0
                    ? `${s.subjects.length.toLocaleString()} ${
                        s.subjects.length === 1 ? "domain" : "domains"
                      } named`
                    : data.legacy && s.kind === "manager domain"
                      ? "not captured for this report"
                      : "none named"
                }
              />
            ))}
          </div>
        </div>
      )}

      {!loading && data && data.total > 0 && (
        <FilterBar className="w-full min-w-0">
          <FilterSearch
            value={query}
            onChange={setQuery}
            placeholder="Filter by domain, named or naming"
          />
          <FilterSelect
            value={kind}
            onChange={setKind}
            options={KIND_OPTIONS}
            leading="Kind"
            ariaLabel="Which declarations to show"
          />
          <FilterSelect
            value={sort}
            onChange={setSort}
            options={SORT_OPTIONS}
            leading="Sort"
            ariaLabel="Sort declared domains"
          />
        </FilterBar>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <BLoader label="Loading" size={140} />
          Loading declarations...
        </div>
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
              section={section}
              filtered={needle.length > 0}
              page={pages[section.kind]}
              onPage={(n) => setPages((p) => ({ ...p, [section.kind]: n }))}
              open={open}
              onToggle={toggle}
              capped={data.legacy}
            />
          ))}

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

/* ── One kind: heading, cards, pager ───────────────────────────────── */

function KindSection({
  section,
  filtered,
  page,
  onPage,
  open,
  onToggle,
  capped,
}: {
  section: DeclarationSection;
  filtered: boolean;
  page: number;
  onPage: (n: number) => void;
  open: Set<string>;
  onToggle: (key: string) => void;
  capped: boolean;
}) {
  const copy = KIND_COPY[section.kind];
  const tone = KIND_TONE[section.kind];
  const total = section.subjects.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const slice = section.subjects.slice(start, start + PAGE_SIZE);

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="flex items-center gap-2 font-display text-base font-semibold tracking-tight text-slate-900"
            title={`${copy.variable}: ${copy.blurb}`}
          >
            <span
              aria-hidden
              className={cn("h-2.5 w-2.5 flex-shrink-0 rounded-full", tone.solid)}
            />
            {copy.title}
          </h2>
        </div>
        {total > 0 && (
          <div className="hidden flex-shrink-0 text-right text-xs text-slate-500 sm:block">
            <span className="font-mono tabular-nums text-slate-700">
              {total.toLocaleString()}
            </span>{" "}
            {total === 1 ? "domain" : "domains"}
          </div>
        )}
      </div>

      {total === 0 ? (
        <SectionEmpty>
          {filtered
            ? "Nothing matches that filter."
            : "None this crawl."}
        </SectionEmpty>
      ) : (
        <div className="space-y-3">
          {slice.map((s) => (
            <SubjectCard
              key={`${s.kind}|${s.domain}`}
              subject={s}
              capped={capped}
              open={open.has(`${s.kind}|${s.domain}`)}
              onToggle={() => onToggle(`${s.kind}|${s.domain}`)}
            />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3 text-xs text-slate-500">
          <span>
            Showing {(start + 1).toLocaleString()} to{" "}
            {Math.min(start + PAGE_SIZE, total).toLocaleString()} of{" "}
            {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              className="rounded-full border border-border bg-white px-3 py-1 transition-colors hover:border-primary/30 disabled:opacity-40 disabled:hover:border-border"
            >
              Previous
            </button>
            <span className="font-mono tabular-nums">
              {page} / {pageCount.toLocaleString()}
            </span>
            <button
              disabled={page >= pageCount}
              onClick={() => onPage(page + 1)}
              className="rounded-full border border-border bg-white px-3 py-1 transition-colors hover:border-primary/30 disabled:opacity-40 disabled:hover:border-border"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── The card ──────────────────────────────────────────────────────── */

/**
 * One declared domain, a deliberate sibling of the Discovery page's
 * LineCard: rounded-3xl, a 44px disc, the subject dominant in mono,
 * right-aligned counts, a chevron, a tinted expanded body. The card ground
 * is the kind's yellow at a tint and the hairline its border, so a run of
 * inventory partners reads as one gold band, owner domains as a paler one,
 * manager domains as the deepest. The disc is solid, the strongest yellow
 * on the card, and carries the initial.
 */
function SubjectCard({
  subject,
  capped,
  open,
  onToggle,
}: {
  subject: DeclarationSubject;
  /** Legacy payloads cap the roster at 50; the count stays honest. */
  capped: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const tone = KIND_TONE[subject.kind];
  const initial = (subject.domain.replace(/^www\./i, "").charAt(0) || "?")
    .toUpperCase();
  const files = new Set(subject.declarers.map((d) => d.domain)).size;
  const notShown = Math.max(0, subject.total - subject.declarers.length);
  const both = subject.ads_txt > 0 && subject.app_ads_txt > 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border shadow-sm transition-colors",
        tone.border,
        open ? cn(tone.bg, "shadow-md") : cn(tone.tint),
      )}
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
            tone.solid,
          )}
        >
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <code className="block truncate font-mono text-[13px] font-semibold tracking-tight text-slate-900 sm:text-[15px]">
            {subject.domain}
          </code>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            <span>
              <span className="font-mono tabular-nums text-slate-700">
                {files.toLocaleString()}
              </span>{" "}
              {files === 1 ? "publisher" : "publishers"}
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
            <MiniStat label="Declarations" value={subject.total} emphasis />
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

      {open && (
        <div className={cn("border-t px-4 pb-4 pt-3 sm:px-5", tone.border)}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-slate-700">
              Named by{" "}
              <span className="font-mono tabular-nums text-slate-500">
                {subject.total.toLocaleString()}
              </span>
            </span>
            {/* Every publisher that named this domain, which file, and the
                country: the workbook's Declarations sheet, for this one
                domain and kind. Built from the frozen payload in the
                browser, so it costs no request and works while the
                crawler sleeps. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                downloadCsv(
                  `declarations-${subject.kind.replace(/ /g, "-")}-${subject.domain}.csv`,
                  subjectCsv(subject),
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-[11px] text-slate-700 transition-colors hover:border-primary/30"
            >
              <Download className="h-3 w-3" />
              Export CSV
            </button>
          </div>
          {/* Three rows tall, the rest by scrolling inside the card (David,
              2026-09-15), so a domain named by forty files does not push
              the next section off screen. */}
          <div className="scroll-y max-h-[6.6rem] overflow-y-auto rounded-md border border-border bg-white">
            <ul className="divide-y divide-border">
              {subject.declarers.map((d, i) => (
                <li
                  key={`${d.domain}|${d.found_in}|${d.country}|${i}`}
                  className="flex items-baseline gap-3 px-3 py-1.5 font-mono text-[11px] tabular-nums"
                >
                  <span className="truncate text-slate-800">{d.domain}</span>
                  {d.country && (
                    <span
                      className={cn("flex-shrink-0 text-[10px]", tone.text)}
                      title={countryName(d.country)}
                    >
                      {d.country}
                    </span>
                  )}
                  <span className="ml-auto flex-shrink-0 text-[10px] text-slate-400">
                    {d.found_in}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {capped && notShown > 0 && (
            <p className="mt-1 text-[10px] text-slate-500">
              and {notShown.toLocaleString()} more
            </p>
          )}
        </div>
      )}
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
    <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-sm">
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
