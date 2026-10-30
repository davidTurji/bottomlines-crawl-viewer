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
import { Download, Info, Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { cn } from "@/lib/utils";

import { csvLine, downloadCsvParts, type CsvCell } from "@/lib/csvDownload";
export { csvCell, csvLine, type CsvCell } from "@/lib/csvDownload";

/** Where an export writes: its header once, then each page's rows. */
export type CsvSink = { header: (cols: string[]) => void; rows: (rows: CsvCell[][]) => void };

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
  noun = "results",
}: {
  /** Reads the whole list into the sink, page by page, reporting its pages
   *  as it goes; answers the file's name. */
  run: (sink: CsvSink, onProgress: (done: number, of: number) => void, signal: AbortSignal) => Promise<ExportDone>;
  className?: string;
  noun?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const helpId = useId();
  const explanation = `Current ${noun} view as CSV. All matching pages, with filters applied.`;
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
        downloadCsvParts(parts, filename);
        if (typeof done === "object" && done.note) setNote(done.note);
      }
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error && e.message ? e.message : "Could not export this list.");
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };

  return (
    <span className={cn("list-export-options", className)}>
      <span id={helpId} className="sr-only">{explanation}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" data-export-list disabled={busy} aria-label={busy ? "Preparing CSV download" : "Download"}
            aria-describedby={helpId} title={busy ? "Preparing CSV download" : explanation} className="list-options-trigger report-download-action">
            {busy ? <Loader2 aria-hidden className="list-download-icon h-3.5 w-3.5 animate-spin" /> : <Download aria-hidden className="list-download-icon h-3.5 w-3.5" />}
            <span>{busy ? "Preparing" : "Download"}</span>
            <Info aria-hidden className="list-download-info h-3.5 w-3.5 flex-none opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="px-2 pb-1 pt-2 text-xs font-medium text-slate-800">What this downloads</DropdownMenuLabel>
          <p className="px-2 pb-3 text-xs leading-relaxed text-slate-500">{explanation}</p>
          <DropdownMenuItem onSelect={() => void go()} className="cursor-pointer gap-2">
            <Download aria-hidden className="h-4 w-4" /> Download {noun} (CSV)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {busy && <span role="status" className="sr-only">{progress ? `Preparing ${progress.done} of ${progress.of}` : "Preparing CSV download"}</span>}
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
