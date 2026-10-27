/**
 * "EXPORT THIS LIST" (David, 2026-10-27): a small CSV of exactly what the
 * list on screen holds, its tab, filters and search, every page of it, not
 * the one on screen. Built the way the Changes page's per-line export was:
 * read the list's own pages one after another (politely, never in
 * parallel, each retried on a passing failure), refuse if the list changes
 * during the read or falls short of its count, then hand the browser a
 * file. Each page goes into the file as it arrives (never one string of the
 * whole list). It reads only the list's endpoints, so it never uses or
 * counts against the report's metered full export.
 *
 * Safe to open in a spreadsheet: a cell that starts with = + - @ or a tab
 * or return is written with a leading ' so it is never run as a formula;
 * the file starts with a UTF-8 byte order mark so accents survive Excel.
 */
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type CsvCell = string | number | null | undefined;

/** Where an export writes: its header once, then each page's rows. */
export type CsvSink = { header: (cols: string[]) => void; rows: (rows: CsvCell[][]) => void };

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

function download(parts: string[], filename: string) {
  const url = URL.createObjectURL(new Blob(parts, { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari starts the download after the click returns: let it go first.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** A file name from words: lower case, dashes, ".csv". */
export function csvName(...parts: (string | null | undefined)[]): string {
  const slug = parts
    .filter((p): p is string => !!p && !!p.trim())
    .map((p) => p.trim().toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("-");
  return `${slug || "list"}.csv`;
}

/** What a run answers: the file's name, and a note to say beside the
 *  button when the file is whole but says less than the page (the
 *  Changed tab's old certs that could not be read). */
export type ExportDone = string | { name: string; note?: string };

export function ExportListButton({
  run,
  className,
}: {
  /** Reads the whole list into the sink, page by page, reporting its pages
   *  as it goes; answers the file's name. */
  run: (sink: CsvSink, onProgress: (done: number, of: number) => void, signal: AbortSignal) => Promise<ExportDone>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const go = async () => {
    if (busy) return;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError(null);
    setNote(null);
    setProgress(null);
    // The file, a part per page: a byte order mark, the header, the rows.
    const parts: string[] = ["\uFEFF"];
    let lines = 0;
    const sink: CsvSink = {
      header: (cols) => {
        parts.push(csvLine(cols));
        lines++;
      },
      rows: (rows) => {
        if (!rows.length) return;
        parts.push("\r\n" + rows.map(csvLine).join("\r\n"));
        lines += rows.length;
      },
    };
    try {
      const done = await run(sink, (n, of) => !c.signal.aborted && setProgress({ done: n, of }), c.signal);
      const filename = typeof done === "string" ? done : done.name;
      if (!c.signal.aborted && lines > 0) {
        download(parts, filename);
        if (typeof done === "object" && done.note) setNote(done.note);
      }
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error && e.message ? e.message : "Could not export this list.");
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };

  return (
    <span className={cn("inline-flex flex-shrink-0 items-center gap-2", className)}>
      <button
        type="button"
        data-export-list
        onClick={go}
        disabled={busy}
        title="A CSV of this list as it stands: its tab, filters and search, every page"
        className="inline-flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-white px-3 text-[12px] font-medium text-slate-600 shadow-sm transition-colors hover:bg-muted disabled:cursor-progress"
      >
        <Download aria-hidden className="h-3.5 w-3.5" />
        {busy
          ? progress && progress.of > 1
            ? `Preparing ${progress.done.toLocaleString()} of ${progress.of.toLocaleString()}`
            : "Preparing…"
          : "Export this list"}
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-critical">
          {error}
        </span>
      )}
      {note && !error && (
        <span data-export-note className="max-w-[18rem] text-[11px] leading-snug text-slate-500">
          {note}
        </span>
      )}
    </span>
  );
}
