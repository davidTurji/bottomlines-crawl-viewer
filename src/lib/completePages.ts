export type Progress = (done: number, of: number) => void;

export type PageAnswer<T> = { rows?: T[] | null; total?: number | null; page_size?: number | null; truncated?: boolean; cut?: boolean };

/** One page, retried with a growing pause when the read fails (a passing
 *  503, a dropped connection); never once the reader has cancelled. */
async function readPage<T>(fetchPage: (page: number) => Promise<PageAnswer<T>>, page: number, signal?: AbortSignal) {
  const pauses = [400, 1200, 3000];
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fetchPage(page);
    } catch (e) {
      if (signal?.aborted || attempt >= pauses.length) throw e;
      await new Promise((r) => setTimeout(r, pauses[attempt]));
    }
  }
}

/**
 * Every page of a paged list, one after another (never in parallel), each
 * handed on as it arrives, until its rows add up to its total. Refused, and
 * said: a total that moves between pages (the list changed under the read),
 * and rows that fall short of the total (a report that keeps a shorter copy
 * than it counts). Returns how many rows were read.
 */
export async function eachPage<T>(
  fetchPage: (page: number) => Promise<PageAnswer<T>>,
  asked: number,
  onRows: (rows: T[]) => void | Promise<void>,
  onProgress?: Progress,
  signal?: AbortSignal,
  options: { expectedTotal?: number; key?: (row: T) => string } = {},
): Promise<number> {
  let seen = 0;
  const identities = options.key ? new Set<string>() : null;
  let total: number | null = null;
  for (let page = 1; page <= 100_000; page++) {
    const r = await readPage(fetchPage, page, signal);
    const rows = Array.isArray(r.rows) ? r.rows : [];
    if (r.cut || r.truncated) throw new Error("This report contains an incomplete list. Nothing was exported.");
    const t = r.total;
    if (typeof t !== "number" || !Number.isSafeInteger(t) || t < 0)
      throw new Error("The full list size could not be verified. Nothing was exported.");
    if (options.expectedTotal != null && t !== options.expectedTotal)
      throw new Error("This list does not contain all the rows counted by the report. Nothing was exported.");
    if (total === null) total = t;
    else if (t !== total) throw new Error("The list changed while it was being read. Reload and try again.");
    if (rows.length === 0 && seen < total)
      throw new Error(
        `This list counts ${total.toLocaleString()} rows but only ${seen.toLocaleString()} could be read. Nothing was exported.`,
      );
    if (seen + rows.length > total) throw new Error("The list returned more rows than its total. Nothing was exported.");
    if (identities && options.key) {
      for (const row of rows) {
        const key = options.key(row);
        if (identities.has(key)) throw new Error("The list repeated a row. Nothing was exported.");
        identities.add(key);
      }
    }
    seen += rows.length;
    await onRows(rows);
    const size = Math.max(1, r.page_size || asked);
    onProgress?.(page, Math.max(page, Math.ceil(total / size)));
    if (seen >= total) return seen;
  }
  // The API's own ceiling (100,000 pages): said, never a silent cut.
  throw new Error("This list is longer than one read can take (100,000 pages). Narrow it with a search or the line filter.");
}

