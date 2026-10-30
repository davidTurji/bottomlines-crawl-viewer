/**
 * MATCH TYPE: own or IPD (crawler PR #348, inventory sharing).
 *
 * IPD matches stay inside Matches, under the one Matched count. The Match
 * type pills only split a list: All, Own (the publisher's own file) or IPD
 * (the line sits in an inventory partner's ads.txt that the publisher's
 * app-ads.txt names). An own row carries no chip; an IPD row a small chip
 * and one quiet line that depends on the list (David, 2026-10-25): on a
 * publisher row "Via failarmy.tv, inventory partner of this publisher", on
 * an app row "Via failarmy.tv, inventory partner of Samsung TV Plus" (the
 * app's publisher). An IPD match whose partner's ads.txt this crawl could
 * not read is never a row and never counted: one quiet note under the
 * list, in the same shape per view.
 *
 * Everything here renders NOTHING on a report frozen before match types:
 * no counts means no pills, no ``match_type`` means no chip. Old links
 * look exactly as they did (links are forever).
 */
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Collapse, toggleWithoutJump } from "@/components/Motion";

import type {
  IpdInconclusive,
  MatchTypeCounts,
  MatchTypeFields,
  MatchTypeFilter,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const OPTIONS: { value: MatchTypeFilter; label: string; noun: string }[] = [
  { value: "all", label: "All", noun: "matched" },
  { value: "own", label: "Own", noun: "own" },
  { value: "ipd", label: "IPD", noun: "IPD" },
];

/**
 * "Match type": All / Own / IPD as one slim segmented control at the right
 * end of the status tabs' row, centred on the tabs' height so the row reads
 * as one designed line. Counts sit in each option's tooltip, not its label,
 * so the control keeps one width on every tab and every choice. `counts`
 * null: the options still filter, the tooltips name no number (a list
 * counted in the browser). On a phone the control wraps under the tabs.
 *
 * ONE TRACK, ONE THUMB (David, 2026-10-26: "more premium, system theme").
 * The three options are equal segments of one rounded track in the theme's
 * muted tone; a single raised thumb in the card colour slides under the
 * chosen one (220 ms, the list swap's easing) while the labels' colours
 * cross over, the same raised-on-muted look as the status tabs beside it.
 * Equal segments, so the thumb moves by whole segment widths in CSS and
 * never needs measuring. Arrow keys, Home and End move the choice like the
 * tabs do; the control is one stop in the Tab order. Less motion asked
 * for: the thumb jumps.
 */
export function MatchTypeControl({
  value,
  onChange,
  counts,
}: {
  value: MatchTypeFilter;
  onChange: (next: MatchTypeFilter) => void;
  counts: MatchTypeCounts | null;
}) {
  const index = Math.max(0, OPTIONS.findIndex((o) => o.value === value));
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = OPTIONS.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? index === last ? 0 : index + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? index === 0 ? last : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    buttons.current[next]?.focus();
    if (next !== index) onChange(OPTIONS[next].value);
  };
  return (
    // On a phone the label sits above the pills, as on Found in and
    // Platform (demo of #75).
    <div
      className="flex flex-col items-start gap-1 tabular-nums sm:flex-row sm:items-center sm:gap-2"
      data-testid="match-type"
    >
      <span id="match-type-label" className="whitespace-nowrap text-[10px] font-medium text-slate-500">
        Match type
      </span>
      <div
        role="group"
        aria-labelledby="match-type-label"
        onKeyDown={onKeyDown}
        className="relative grid h-8 grid-cols-3 items-center rounded-full border border-border bg-muted p-[3px]"
      >
        <span
          aria-hidden
          data-match-type-thumb={OPTIONS[index].value}
          className="pointer-events-none absolute inset-y-[3px] left-[3px] w-[calc((100%-6px)/3)] rounded-full bg-card shadow-[0_1px_2px_hsl(150_30%_8%/0.08),0_1px_1px_hsl(150_30%_8%/0.04)] ring-1 ring-border/70 transition-transform [transition-duration:220ms] [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {OPTIONS.map((o, i) => {
          const on = i === index;
          const n = counts?.[o.value];
          return (
            <button
              key={o.value}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              aria-pressed={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.value)}
              title={typeof n === "number" ? `${n.toLocaleString()} ${o.noun}` : undefined}
              className={cn(
                "relative z-10 inline-flex h-full w-16 items-center justify-center rounded-full text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Which list a row or a note is on: the words differ (see the top). */
export type MatchTypeView = "publishers" | "apps";

/**
 * "Via failarmy.tv, inventory partner of this publisher" (a publisher row)
 * or "Via failarmy.tv, inventory partner of Samsung TV Plus" (an app row,
 * `subject` = the app's publisher). The partner first, then whose
 * inventory partner it is.
 */
export function ipdWhere(
  row: MatchTypeFields,
  subject: string | null | undefined,
  /** How many OTHER partners carry the row's lines (2026-10-27: a row named
   *  only the first of 14). */
  others = 0,
): string | null {
  if (row.match_type !== "ipd" || !row.ipd_partner) return null;
  const of = (subject ?? "").trim();
  if (others > 0) {
    const more = `${row.ipd_partner} and ${others.toLocaleString()} other inventory ${others === 1 ? "partner" : "partners"}`;
    return of ? `Via ${more} of ${of}` : `Via ${more}`;
  }
  return of ? `Via ${row.ipd_partner}, inventory partner of ${of}` : `Via ${row.ipd_partner}`;
}

/** The app row's subject: its publisher, by name, else by domain, else
 *  the platform the crawler named. */
export function appSubject(app: {
  owner_name?: string | null;
  owner_domain?: string | null;
  ipd_platform?: string | null;
}): string | null {
  return app.owner_name || app.owner_domain || app.ipd_platform || null;
}

const PUBLISHER_SUBJECT = "this publisher";

/** The domain whose file holds a row's lines: the partner's for an IPD
 *  row (its ads.txt), the row's own otherwise. */
export function linesDomain(row: MatchTypeFields, own: string | null | undefined): string | null {
  return row.match_type === "ipd" && row.ipd_partner ? row.ipd_partner : (own ?? null);
}

function ipdTitle(row: MatchTypeFields, subject: string | null | undefined, others = 0): string | undefined {
  const where = ipdWhere(row, subject, others);
  const parts = [where, row.declared_in ? `Declared in ${row.declared_in}` : null].filter(Boolean);
  return parts.length ? parts.join(". ") : undefined;
}


/**
 * A publisher's platform as the page shows it: CTV, Mobile or Web, spelled
 * once, the way the crawler's own exports spell it (domain/platforms.py).
 * Anything else, including the internal "ipd_partner" of partner rows the
 * IPD chase added, is a platform we cannot name: null, so no badge.
 */
export function platformLabel(raw: unknown): "CTV" | "Mobile" | "Web" | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "ctv") return "CTV";
  if (v === "mobile") return "Mobile";
  if (v === "web" || v === "website") return "Web";
  return null;
}

/** The small "IPD" chip beside the name; nothing on an own row. `subject`
 *  as on IpdWhere; absent means a publisher row. */
export function IpdChip({
  row,
  subject = PUBLISHER_SUBJECT,
  others = 0,
}: {
  row: MatchTypeFields;
  subject?: string | null;
  others?: number;
}) {
  if (row.match_type !== "ipd") return null;
  return (
    <span
      data-ipd-chip
      title={ipdTitle(row, subject, others)}
      className="inline-flex flex-shrink-0 items-center rounded-full border border-info-border bg-info-bg px-1.5 py-px text-[10px] font-semibold text-info"
    >
      IPD
    </span>
  );
}

/** The quiet line under the name. `subject`: the app's publisher on an
 *  app row; absent means a publisher row ("this publisher"). */
export function IpdWhere({
  row,
  subject = PUBLISHER_SUBJECT,
  others = 0,
}: {
  row: MatchTypeFields;
  subject?: string | null;
  others?: number;
}) {
  const where = ipdWhere(row, subject, others);
  if (!where) return null;
  return (
    <div data-ipd-where title={ipdTitle(row, subject, others)} className="truncate text-[11px] text-slate-500">
      {where}
    </div>
  );
}

/**
 * A list field as the crawler really sends it (2026-10-27): the frozen
 * reports carry ``verdict_alerts`` as ONE string ("" when there is nothing
 * to say, several alerts joined by " | "), not the array the contract
 * described. A string, an array, or anything else is read safely here, so
 * a row can never throw on it (a crash took the whole section down on
 * every report link). Kept for any list field the page reads.
 */
export function textList(value: unknown, split: RegExp = /\s\|\s|\n/): string[] {
  const parts: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(split)
      : [];
  return parts
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim())
    .filter(Boolean);
}

const NOUNS: Record<MatchTypeView, { one: string; many: string }> = {
  publishers: { one: "publisher", many: "publishers" },
  apps: { one: "app", many: "apps" },
};

/**
 * THE INCONCLUSIVE NOTE, ONE SHORT QUIET LINE (David, 2026-10-27: the long
 * "Not counted: 55 inconclusive IPD publishers (1015vibe.com, via
 * gustotv.com; ...)" sentence confused him). What could not be checked, and
 * why, in plain words; the names wait behind "Show them":
 *
 *   "55 publishers could not be checked this week: their inventory partner
 *    gustotv.com's ads.txt could not be read."
 *   "55 publishers could not be checked this week: their inventory
 *    partners' ads.txt files (gustotv.com and 2 more) could not be read."
 *
 * The apps view says the same of apps. Never part of any count.
 */
export function inconclusiveSentence(data: IpdInconclusive, view: MatchTypeView): string {
  const noun = NOUNS[view];
  const n = data.count;
  const one = n === 1;
  const its = one ? "its" : "their";
  const partners = [...new Set(inconclusivePairs(data).map((e) => e.partner))];
  const why =
    partners.length === 1
      ? `${its} inventory partner ${partners[0]}'s ads.txt could not be read`
      : partners.length > 1
        ? `${its} inventory partners' ads.txt files (${partners[0]} and ${partners.length - 1} more) could not be read`
        : `${its} inventory partner's ads.txt could not be read`;
  return `${n.toLocaleString()} ${one ? noun.one : noun.many} could not be checked this week: ${why}.`;
}

/** The pairs the note can name, safely read (never throws on a bad item). */
function inconclusivePairs(data: IpdInconclusive): { partner: string; platform: string }[] {
  const raw: unknown = data.examples;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is { partner: unknown; platform: unknown } => !!e && typeof e === "object")
    .map((e) => ({
      partner: typeof e.partner === "string" ? e.partner.trim() : "",
      platform: typeof e.platform === "string" ? e.platform.trim() : "",
    }))
    .filter((e) => e.partner);
}

/** One item of the list behind "Show them": the publisher (on the apps
 *  view, the publisher whose apps they are) and the partner. */
export function inconclusiveItem(e: { partner: string; platform: string }, view: MatchTypeView): string {
  if (!e.platform) return `Via ${e.partner}`;
  return view === "apps" ? `Apps of ${e.platform}, via ${e.partner}` : `${e.platform}, via ${e.partner}`;
}

/** The quiet note under a list: IPD matches not confirmed, not counted,
 *  with the names one click away. */
export function IpdInconclusiveNote({
  data,
  view,
}: {
  data: IpdInconclusive | null | undefined;
  view: MatchTypeView;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (!data || !(data.count > 0)) return null;
  const pairs = inconclusivePairs(data);
  // The report keeps a few examples, not every one: on the publishers view
  // the rest is counted ("Plus 30 more."). On the apps view the examples
  // are publishers, not apps, so no app number is put beside them.
  const more = view === "publishers" ? Math.max(0, data.count - pairs.length) : 0;
  return (
    <div data-ipd-inconclusive-note className="mt-3">
      <p className="text-xs text-slate-500">
        <span data-ipd-inconclusive>{inconclusiveSentence(data, view)}</span>
        {pairs.length > 0 && (
          <>
            {" "}
            <button
              type="button"
              aria-expanded={open}
              aria-controls={listId}
              onClick={event => toggleWithoutJump(event.currentTarget, () => setOpen(value => !value))}
              className="rounded-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {open ? "Hide them" : "Show them"}
            </button>
          </>
        )}
      </p>
      <Collapse open={open && pairs.length > 0} id={listId}>
        <div data-ipd-inconclusive-list className="mt-2 max-w-xl">
          <ul className="divide-y divide-border rounded-md border border-border bg-white">
            {pairs.map((e, i) => (
              <li key={`${e.partner}|${e.platform}|${i}`} className="px-3 py-1.5 text-[11px] text-slate-700">
                {inconclusiveItem(e, view)}
              </li>
            ))}
          </ul>
          {more > 0 && (
            <p className="mt-1 text-[10px] text-slate-500">Plus {more.toLocaleString()} more.</p>
          )}
        </div>
      </Collapse>
    </div>
  );
}
