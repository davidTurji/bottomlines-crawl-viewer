/**
 * An app's dates: first seen, last seen, removed on (David, 2026-10-14).
 *
 * The crawler stamps these on the app rows of reports frozen from
 * 2026-10-14 (matched apps, inactive apps, app placements) and on its API
 * answers. Every field is optional: a report frozen before them has none,
 * and its pages must read exactly as they did (links are forever), so a
 * list shows a date column only when at least one of its rows has that
 * date, and a list with none shows no column at all.
 */

/** Where an app's first-seen date comes from. */
export type FirstSeenSource = "store_listing" | "discovered" | "catalogue_add";

/** The optional date fields an app row may carry. All absent on old reports. */
export type AppDates = {
  /** When the app was first seen (ISO). */
  first_seen_at?: string | null;
  first_seen_source?: FirstSeenSource | string | null;
  /** When a crawl last saw the app live (ISO). */
  last_seen_at?: string | null;
  /** When the app was removed (ISO); null while it is active. */
  removed_at?: string | null;
  /** The date its store listing gives (a day). Not shown on its own. */
  listed_on?: string | null;
};

export type AppDateKey = "first_seen_at" | "last_seen_at" | "removed_at";

/** The columns, in the order they show. */
export const APP_DATE_COLUMNS: { key: AppDateKey; label: string }[] = [
  { key: "first_seen_at", label: "First seen" },
  { key: "last_seen_at", label: "Last seen" },
  { key: "removed_at", label: "Removed on" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Oct 2026", read by UTC day so no time zone moves it a day; null
 *  for anything that is not a date. Spelled by hand: browsers disagree on
 *  "Sep" and "Sept". */
export function appDay(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.length < 10) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** What a first-seen date means, said on hover. */
export function firstSeenHint(source: string | null | undefined): string | undefined {
  switch (source) {
    case "store_listing":
      return "The date its store listing gives";
    case "discovered":
      return "When we first found it";
    case "catalogue_add":
      return "When we added it to our app list";
    default:
      return undefined;
  }
}

/**
 * The dates a row shows, as readable days. An inactive app's card already
 * says "Inactive since <day>" on its strip, so a removal on that same day
 * is not said twice.
 */
export function shownAppDates(
  row: (AppDates & { inactive_since?: string | null }) | null | undefined,
): Partial<Record<AppDateKey, string>> {
  const out: Partial<Record<AppDateKey, string>> = {};
  if (!row) return out;
  for (const { key } of APP_DATE_COLUMNS) {
    const day = appDay(row[key]);
    if (day) out[key] = day;
  }
  if (out.removed_at && row.inactive_since && out.removed_at === appDay(row.inactive_since)) {
    delete out.removed_at;
  }
  return out;
}

/** The date columns a list shows: only those at least one row has. */
export function appDateColumns(
  rows: readonly ((AppDates & { inactive_since?: string | null }) | null | undefined)[],
): AppDateKey[] {
  const seen = new Set<AppDateKey>();
  for (const r of rows) {
    for (const k of Object.keys(shownAppDates(r)) as AppDateKey[]) seen.add(k);
    if (seen.size === APP_DATE_COLUMNS.length) break;
  }
  return APP_DATE_COLUMNS.map((c) => c.key).filter((k) => seen.has(k));
}

/** "First seen 3 Oct 2026, last seen 14 Oct 2026": the row's dates in one
 *  sentence-case line, for a narrow screen; null when it has none. */
export function appDatesSentence(
  row: (AppDates & { inactive_since?: string | null }) | null | undefined,
): string | null {
  const days = shownAppDates(row);
  const parts = APP_DATE_COLUMNS.filter((c) => days[c.key]).map(
    (c, i) => `${i === 0 ? c.label : c.label.toLowerCase()} ${days[c.key]}`,
  );
  return parts.length ? parts.join(", ") : null;
}
