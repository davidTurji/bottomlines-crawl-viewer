/**
 * THE DATES BEHIND A CHANGE (David, 2026-10-20: 1000 percent honesty).
 *
 * Files are read once a week, so a line is never "removed on Tuesday": it
 * was last seen in one read and not found in the next. Every removed and
 * added line says both dates, every cert change says when the new cert was
 * seen, and an unconfirmed line says when it was last seen, read and
 * verified. A date the report does not carry prints "date not available";
 * it is never guessed from the crawl's own time.
 *
 * One module, so the Overview's change windows, the Changes page's rosters
 * and the CSV export cannot drift in how they say a date.
 */
import type { LineDateSource, RemovalFields } from "./api";

/** "18 Oct 2026, 11:29": the reader's local date, 24 hour time. Null when
 *  the value is absent or unreadable. */
export function formatDateTime(iso: string | Date | null | undefined): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${day}, ${time}`;
}

export const DATE_NOT_AVAILABLE = "date not available";

/** The sentence, or the honest blank. */
export function dateText(iso: string | null | undefined): string {
  return formatDateTime(iso) ?? DATE_NOT_AVAILABLE;
}

/** The title a date fragment carries when the crawl's time stood in for
 *  the file's read time. */
export const CRAWL_TIME_TITLE = "crawl time, exact file read time not stored";

export function dateTitle(source: LineDateSource | undefined): string | undefined {
  return source === "crawl" ? CRAWL_TIME_TITLE : undefined;
}

/** The dated fields a line can carry, on a LineEvent or an embedded seat line. */
export type DatedLine = {
  first_seen_at?: string | null;
  last_absent_at?: string | null;
  last_seen_at?: string | null;
  not_found_at?: string | null;
  seen_at?: string | null;
  date_source?: LineDateSource;
};

/** "last seen 18 Oct 2026, 11:29, not found 25 Oct 2026, 11:31". */
export function removedDates(line: DatedLine): string {
  return `last seen ${dateText(line.last_seen_at)}, not found ${dateText(line.not_found_at)}`;
}

/** "first seen 25 Oct 2026, 11:31, last absent 18 Oct 2026, 11:29". A null
 *  last_absent_at (not a missing one) means the compared crawl did not read
 *  the file, and the line says so instead of a date. */
export function addedDates(line: DatedLine): string {
  const first = `first seen ${dateText(line.first_seen_at)}`;
  if (line.last_absent_at === null) return `${first}, not read in the compared crawl`;
  return `${first}, last absent ${dateText(line.last_absent_at)}`;
}

/** "seen 25 Oct 2026, 11:31". */
export function certDates(line: DatedLine): string {
  return `seen ${dateText(line.seen_at)}`;
}

/** The dated fields an unconfirmed row carries. */
export type UnconfirmedLine = {
  reason?: string | null;
  last_seen_at?: string | null;
  read_at?: string | null;
  verified_at?: string | null;
};

/** "last seen 18 Oct 2026, 11:29, read 25 Oct 2026, 11:31, not verified". */
export function unconfirmedDates(line: UnconfirmedLine): string {
  const verified = formatDateTime(line.verified_at);
  return [
    `last seen ${dateText(line.last_seen_at)}`,
    `read ${dateText(line.read_at)}`,
    verified ? `verified ${verified}` : "not verified",
  ].join(", ");
}

/** Why a removed line was removed, in the words the page prints: "Line no
 *  longer in the file", or "File not served", plus the crawler's detail
 *  when it sent one ("File not served: 404 on 3 reads"). Null when the
 *  report does not say (frozen before the field) or says something this
 *  page does not know: then the line says nothing about why. */
export function removalReasonText(line: RemovalFields): string | null {
  const label =
    line.removal_reason === "line_not_in_file"
      ? "Line no longer in the file"
      : line.removal_reason === "file_not_served"
        ? "File not served"
        : null;
  if (!label) return null;
  const detail = line.removal_detail?.trim();
  return detail ? `${label}: ${detail}` : label;
}

/** The one sentence that explains why every change carries two dates. */
export const WEEKLY_READ_NOTE =
  "Files are read once a week, so a change happened between the two dates shown.";

/** "12 lines could not be verified this crawl. They are kept as matched
 *  until a later read settles them." */
export function unconfirmedSentence(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? "line" : "lines"} could not be verified this crawl. ${
    n === 1 ? "It is" : "They are"
  } kept as matched until a later read settles ${n === 1 ? "it" : "them"}.`;
}
