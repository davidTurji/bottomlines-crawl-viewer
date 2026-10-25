/**
 * MATCH TYPE: own or IPD (crawler PR #348, inventory sharing).
 *
 * IPD matches stay inside Matches, under the one Matched count. The Match
 * type pills only split a list: All, Own (the publisher's own file) or IPD
 * (the line sits in an inventory partner's ads.txt that the publisher's
 * app-ads.txt names). An own row carries no chip; an IPD row a small chip
 * and one quiet line, "<partner> on <platform>". An IPD match whose
 * partner's ads.txt this crawl could not read is never a row and never
 * counted: one quiet note under the list.
 *
 * Everything here renders NOTHING on a report frozen before match types:
 * no counts means no pills, no ``match_type`` means no chip. Old links
 * look exactly as they did (links are forever).
 */
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
 * "Match type": All / Own / IPD as pill buttons at the right end of the
 * status tabs' row, the tabs' own height so the row reads as one designed
 * line. Counts sit in each pill's tooltip, not its label, so the pills keep
 * one width on every tab and every choice. `counts` null: the pills still
 * filter, the tooltips name no number (a list counted in the browser). On a
 * phone the group wraps under the tabs.
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
  return (
    <div className="flex items-center gap-2" data-testid="match-type">
      <span id="match-type-label" className="text-xs font-medium text-slate-500">
        Match type
      </span>
      <div role="group" aria-labelledby="match-type-label" className="flex items-center gap-1.5">
        {OPTIONS.map((o) => {
          const on = value === o.value;
          const n = counts?.[o.value];
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              title={typeof n === "number" ? `${n.toLocaleString()} ${o.noun}` : undefined}
              className={cn(
                "inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                on
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-white text-slate-600 hover:bg-muted hover:text-slate-900",
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

/** "lanternworks.tv on Pebblecast TV": where an IPD row's lines sit. */
export function ipdWhere(row: MatchTypeFields): string | null {
  if (row.match_type !== "ipd" || !row.ipd_partner) return null;
  return row.ipd_platform ? `${row.ipd_partner} on ${row.ipd_platform}` : row.ipd_partner;
}

/** The domain whose file holds a row's lines: the partner's for an IPD
 *  row (its ads.txt), the row's own otherwise. */
export function linesDomain(row: MatchTypeFields, own: string | null | undefined): string | null {
  return row.match_type === "ipd" && row.ipd_partner ? row.ipd_partner : (own ?? null);
}

function ipdTitle(row: MatchTypeFields): string | undefined {
  const where = ipdWhere(row);
  const parts = [where, row.declared_in ? `Declared in ${row.declared_in}` : null].filter(Boolean);
  return parts.length ? parts.join(". ") : undefined;
}

/** The small "IPD" chip beside the name; nothing on an own row. */
export function IpdChip({ row }: { row: MatchTypeFields }) {
  if (row.match_type !== "ipd") return null;
  return (
    <span
      data-ipd-chip
      title={ipdTitle(row)}
      className="inline-flex flex-shrink-0 items-center rounded-full border border-info-border bg-info-bg px-1.5 py-px text-[10px] font-semibold text-info"
    >
      IPD
    </span>
  );
}

/** The partner and platform, one quiet line under the name. */
export function IpdWhere({ row }: { row: MatchTypeFields }) {
  const where = ipdWhere(row);
  if (!where) return null;
  return (
    <div data-ipd-where title={ipdTitle(row)} className="truncate text-[11px] text-slate-500">
      {where}
    </div>
  );
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Not counted: 2 inconclusive IPD apps (northfold-tv.com on Tidewick
 *  TV). This crawl could not read northfold-tv.com's ads.txt." */
export function inconclusiveSentence(
  data: IpdInconclusive,
  noun: { one: string; many: string },
): string {
  const examples = (data.examples ?? []).filter((e) => e && e.partner);
  const where = examples.map((e) => (e.platform ? `${e.partner} on ${e.platform}` : e.partner));
  const partners = [...new Set(examples.map((e) => e.partner))];
  const n = data.count;
  const head = `Not counted: ${n.toLocaleString()} inconclusive IPD ${n === 1 ? noun.one : noun.many}`;
  // The examples are partner/platform pairs, not one per app: the count
  // and the pairs are different units, so no "and others" is inferred.
  const list = where.length ? ` (${where.join(", ")})` : "";
  const why = partners.length
    ? ` This crawl could not read ${joinAnd(partners.map((p) => `${p}'s ads.txt`))}.`
    : " This crawl could not read the partner's ads.txt.";
  return `${head}${list}.${why}`;
}

/** The quiet note under a list: IPD matches not confirmed, not counted. */
export function IpdInconclusiveNote({
  data,
  noun,
}: {
  data: IpdInconclusive | null | undefined;
  noun: { one: string; many: string };
}) {
  if (!data || !(data.count > 0)) return null;
  return (
    <p data-ipd-inconclusive className="mt-3 text-xs text-slate-500">
      {inconclusiveSentence(data, noun)}
    </p>
  );
}

/** "not in sellers.json" stays as it is after its first letter. */
function roleLabel(role: string): string {
  const r = role.trim();
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : r;
}

/**
 * Seller role, Managed by, Partner inventory on and the Alert, at the top
 * of an expanded row. Nothing when the row carries none of them (every
 * report frozen before the crawler sent them).
 */
export function RowRoles({ row }: { row: MatchTypeFields }) {
  const partnerOn = (row.partner_inventory_on ?? []).filter(Boolean);
  const facts: [string, string][] = [];
  if (row.seller_role) facts.push(["Seller role", roleLabel(row.seller_role)]);
  if (row.managed_by) facts.push(["Managed by", row.managed_by]);
  if (partnerOn.length) facts.push(["Partner inventory on", partnerOn.join(", ")]);
  if (facts.length === 0 && !row.alert) return null;
  return (
    <div data-row-roles className="mb-3 space-y-2">
      {facts.length > 0 && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {facts.map(([k, v]) => (
            <div key={k} className="flex min-w-0 gap-1">
              <dt className="flex-shrink-0 text-slate-500">{k}:</dt>
              <dd className="min-w-0 break-words font-medium text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {row.alert && (
        <p
          data-row-alert
          role="note"
          className="rounded-lg border border-warn-border bg-warn-bg px-3 py-2 text-xs text-warn"
        >
          {row.alert}
        </p>
      )}
    </div>
  );
}
