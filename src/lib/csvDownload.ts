import { downloadBlob } from "./fileDownload";

export type CsvCell = string | number | null | undefined;

/** One cell, RFC 4180 quoted, never a formula. */
export function csvCell(v: CsvCell): string {
  const t = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** One CSV line (no line end). */
export function csvLine(cells: CsvCell[]): string {
  return cells.map(csvCell).join(",");
}

export function downloadCsvParts(parts: string[], filename: string) {
  downloadBlob(new Blob(parts, { type: "text/csv;charset=utf-8" }), filename);
}
