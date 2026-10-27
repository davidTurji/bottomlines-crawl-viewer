/**
 * COUNT CHECKS for the click-everything walk (real-user QA, David,
 * 2026-10-27): a number the reader is shown must be the number of rows the
 * report lists for it.
 *
 *   - The Overview's Matched publishers and Matched apps tiles are the
 *     totals of their lists (All matched, match type All, no search).
 *   - Every tab, match type pill, Found in / Platform choice and Popular
 *     choice: the count it names is the total the list then shows, and the
 *     list's "1-25 of N" is the number of rows on screen, on the first page
 *     and on sampled later pages (the last one and one in the middle).
 *   - Inactive: the quiet line's counts, the Publishers / Apps pills and
 *     the list under them agree, and its pager counts the rows shown.
 *
 * These are reads of the page as it stands, one DOM pass each (a locator
 * text scan of a big page takes minutes). They never click: the walk does
 * the clicking, so every click is still checked for crashes. A count the
 * page does not show (an older report, a trial's cut list, a tooltip with
 * no number) is not checked, never guessed.
 */
import type { Page } from "@playwright/test";

import { PAGE_SIZE } from "../src/lib/paging";

/** A list's count line, as the reader reads it. */
export type ListCount = {
  /** "1-25 of 1,234": first and last row of this page; a single page
   *  ("12 publishers", "12 on this page") is 1 to its count. */
  first: number;
  last: number;
  total: number;
  /** The page the pager marks as current (1 without a pager). */
  page: number;
  /** "N on this page": a change tab the browser filtered (never paged). */
  onPage: boolean;
  /** A range was printed (the list has pages). */
  paged: boolean;
};

export type ListState = {
  count: ListCount | null;
  /** Row cards on screen; null when the list has not landed. */
  rows: number | null;
  /** A trial's cut list: its count is the full total, its rows the cap. */
  trial: boolean;
  tab: string | null;
  matchType: string | null;
  query: string;
  /** Found in / Platform: the chosen option's label, null without one. */
  split: string | null;
};

/** The Overview list (publishers or apps) as it stands. */
export async function listState(page: Page): Promise<ListState | null> {
  return page
    .evaluate(() => {
      const n = (s: string) => Number(s.replace(/[^\d]/g, ""));
      const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
      const list = document.querySelector('[data-tour="overview-list"]');
      if (!list) return null;
      const box = list.querySelector("[data-list-count]");
      let count: ListCount | null = null;
      if (box && box.getClientRects().length) {
        const current = box.querySelector('[aria-current="page"]');
        const page = current ? n(text(current)) : 1;
        // The count is one line of its own (the pager's, or the plain
        // count's): "1-25 of 1,234 publishers", "12 publishers", "12 on
        // this page". The Export button and the page numbers beside it
        // are not read.
        for (const p of box.querySelectorAll("p")) {
          const t = text(p);
          const range = t.match(/^([\d,]+)\s*[–-]\s*([\d,]+)\s+of\s+([\d,]+)\b/);
          const onPage = t.match(/^([\d,]+)\s+on this page$/);
          const single = t.match(/^([\d,]+)\s+\D+$/);
          if (range) count = { first: n(range[1]), last: n(range[2]), total: n(range[3]), page, onPage: false, paged: true };
          else if (onPage) count = { first: 1, last: n(onPage[1]), total: n(onPage[1]), page: 1, onPage: true, paged: false };
          else if (single) count = { first: n(single[1]) ? 1 : 0, last: n(single[1]), total: n(single[1]), page: 1, onPage: false, paged: false };
          if (count) break;
        }
      }
      const rowsBox = list.querySelector("[data-list-rows]");
      const rows = rowsBox ? rowsBox.querySelectorAll(":scope > div > [data-row-in]").length : null;
      const trial = rowsBox ? /This trial shows|trial view of your/.test(text(rowsBox)) : false;
      const tab = text(list.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]')) || null;
      const matchType = text(list.querySelector('[data-testid="match-type"] button[aria-pressed="true"]')) || null;
      const search = list.querySelector<HTMLInputElement>('input[aria-label^="Search matched"]');
      const splitOn = list.querySelector('[data-testid="found-in"] button[aria-pressed="true"], [data-testid="platform"] button[aria-pressed="true"]');
      // The option's label is its first text; its count rides in a span.
      const split = splitOn ? (splitOn.firstChild?.textContent ?? "").trim() || null : null;
      return { count, rows, trial, tab, matchType, query: search?.value ?? "", split };
    })
    .catch(() => null);
}

/** The chosen Matched tile ("Matched publishers" or "Matched apps"), the
 *  one whose list is on screen, and its figure. */
export async function activeTile(page: Page): Promise<{ label: string; n: number } | null> {
  return page
    .evaluate(() => {
      const b = document.querySelector('button.mtile[aria-pressed="true"]');
      if (!b) return null;
      const label = (b.querySelector(".mtile-label")?.textContent ?? "").replace(/\s+/g, " ").trim();
      const num = b.querySelector(".mtile-num");
      // A figure still counting up keeps its value for screen readers.
      const said = num?.querySelector(".sr-only") ?? num;
      const digits = (said?.textContent ?? "").replace(/[^\d]/g, "");
      return label && digits ? { label, n: Number(digits) } : null;
    })
    .catch(() => null);
}

/** The number a match type pill names in its tooltip ("1,234 own"). */
export async function matchTypeCount(page: Page, label: string): Promise<number | null> {
  return page
    .evaluate((label) => {
      for (const b of document.querySelectorAll('[data-tour="overview-list"] [data-testid="match-type"] button')) {
        if ((b.textContent ?? "").trim() !== label) continue;
        const m = (b.getAttribute("title") ?? "").match(/^([\d,]+)\s/);
        return m ? Number(m[1].replace(/[^\d]/g, "")) : null;
      }
      return null;
    }, label)
    .catch(() => null);
}

/** The count a Found in / Platform option carries, by its first word. */
export async function splitCount(page: Page, testId: string, word: string): Promise<number | null> {
  return page
    .evaluate(
      ([testId, word]) => {
        for (const b of document.querySelectorAll(`[data-tour="overview-list"] [data-testid="${testId}"] button`)) {
          if ((b.firstChild?.textContent ?? "").trim() !== word) continue;
          const digits = (b.querySelector("[data-split-count]")?.textContent ?? "").replace(/[^\d]/g, "");
          return digits ? Number(digits) : null;
        }
        return null;
      },
      [testId, word] as const,
    )
    .catch(() => null);
}

/** The count a Popular choice carries. */
export async function popularCount(page: Page, id: string): Promise<number | null> {
  return page
    .evaluate((id) => {
      const spans = document.querySelector(`[data-popular="${id}"]`)?.querySelectorAll("span");
      const digits = (spans?.[spans.length - 1]?.textContent ?? "").replace(/[^\d]/g, "");
      return digits ? Number(digits) : null;
    }, id)
    .catch(() => null);
}

export type InactiveState = {
  /** A trial's cut list (no pager): not counted. */
  trial: boolean;
  /** The quiet line under the tiles: "6 publishers and 7 apps went inactive". */
  quiet: { publishers: number; apps: number } | null;
  /** The Publishers / Apps pills and which is chosen. */
  kinds: Record<string, number>;
  kind: string | null;
  count: ListCount | null;
  rows: number;
};

export async function inactiveState(page: Page): Promise<InactiveState | null> {
  return page
    .evaluate(() => {
      const n = (s: string) => Number(s.replace(/[^\d]/g, ""));
      const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
      const section = document.querySelector('[data-testid="inactive-section"]');
      if (!section) return null;
      const quietLine = text(document.querySelector('[data-testid="inactive-quiet"]'));
      const quiet = quietLine
        ? {
            publishers: n(quietLine.match(/([\d,]+) publishers?\b/)?.[1] ?? "0"),
            apps: n(quietLine.match(/([\d,]+) apps?\b/)?.[1] ?? "0"),
          }
        : null;
      const kinds: Record<string, number> = {};
      let kind: string | null = null;
      for (const t of section.querySelectorAll('[role="tablist"][aria-label="Inactive lists"] [role="tab"]')) {
        const m = text(t).match(/^(\D+?)\s*([\d,]+)$/);
        if (!m) continue;
        kinds[m[1].toLowerCase()] = n(m[2]);
        if (t.getAttribute("aria-selected") === "true") kind = m[1].toLowerCase();
      }
      // The pager under the rows always carries the count; the one above
      // only when there are pages.
      let count: ListCount | null = null;
      for (const p of section.querySelectorAll("p")) {
        const t = text(p);
        const range = t.match(/^([\d,]+)\s*[–-]\s*([\d,]+)\s+of\s+([\d,]+)\s+inactive/);
        const single = t.match(/^([\d,]+)\s+inactive (publishers?|apps?)$/);
        const current = p.parentElement?.querySelector('[aria-current="page"]');
        if (range)
          count = { first: n(range[1]), last: n(range[2]), total: n(range[3]), page: current ? n(text(current)) : 1, onPage: false, paged: true };
        else if (single) count = { first: 1, last: n(single[1]), total: n(single[1]), page: 1, onPage: false, paged: false };
      }
      const rows = section.querySelectorAll(":scope > div > [data-row-in]").length;
      const trial = /This trial shows|trial view of your/.test(text(section));
      return { trial, quiet, kinds, kind, count, rows };
    })
    .catch(() => null);
}

/** Pages worth sampling past the first: the last, and one in the middle
 *  the pager offers from page 1 (it always shows 1 to 5 and the last). */
export function laterPages(total: number): number[] {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return [];
  return pages >= 3 ? [Math.min(3, pages - 1), pages] : [pages];
}

/** The rows a page of a list must hold: 25, the remainder on the last. */
export function rowsOnPage(total: number, page: number): { first: number; last: number } {
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  return { first, last: Math.min(page * PAGE_SIZE, total) };
}

const fmt = (c: ListCount) => (c.paged ? `${c.first}-${c.last} of ${c.total}` : c.onPage ? `${c.total} on this page` : `${c.total}`);

/**
 * What is wrong between a count line and the rows under it, or null.
 * `want`: the total the control clicked named (a tile, a pill, a choice)
 * and which control (`by`, "the Own pill"); `pageNo`: the page the walk
 * asked for.
 */
export function listProblem(
  s: Pick<ListState, "count" | "rows" | "trial">,
  want?: { n: number; by: string },
  pageNo?: number,
): string | null {
  const rows = s.rows ?? 0;
  const c = s.count;
  if (!c) {
    // Nothing counted: the list is empty, or has not landed (the walk's
    // own checks catch a list that never lands or shows an error).
    if (rows > 0) return `${rows} rows on screen and no count`;
    if (want && want.n > 0) return `${want.by} says ${want.n.toLocaleString()}, the list shows no rows`;
    return null;
  }
  if (want && c.total !== want.n) return `${want.by} says ${want.n.toLocaleString()}, the list says ${fmt(c)}`;
  if (s.trial) return rows > c.total ? `${rows} rows on screen, the list says ${fmt(c)}` : null;
  if (!c.paged && !c.onPage && c.total > PAGE_SIZE) return `${c.total.toLocaleString()} counted with no pages (${rows} rows on screen)`;
  if (pageNo != null && c.page !== pageNo) return `asked for page ${pageNo}, the pager is on page ${c.page}`;
  const expect = rowsOnPage(c.total, c.page);
  if (c.paged && (c.first !== expect.first || c.last !== expect.last))
    return `page ${c.page} says ${fmt(c)}, a page of ${PAGE_SIZE} would be ${expect.first}-${expect.last}`;
  const shown = c.last - c.first + 1;
  if (rows !== shown) return `the list says ${fmt(c)}, ${rows} rows on screen`;
  return null;
}
