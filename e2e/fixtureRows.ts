/** Read a complete generated fixture once. Paginating a generator rebuilds
 * its entire catalogue for every page: the public demo has tens of thousands
 * of rows. This is only the fixture adapter; API responses remain paginated.
 * Fail on truncation so a larger fixture cannot silently reduce coverage. */
export function fixtureRows<T>(read: (page: number, size: number) => { rows: T[]; total: number }): T[] {
  const result = read(1, 100_000);
  if (result.rows.length !== result.total) {
    throw new Error(`Incomplete fixture: ${result.rows.length} rows of ${result.total}`);
  }
  return result.rows;
}
