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
import { listDownloadDescription, type DownloadStatus } from "@/lib/listDownloadScope";

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
  status = "all",
  query = "",
  filtered = false,
}: {
  /** Reads the whole list into the sink, page by page, reporting its pages
   *  as it goes; answers the file's name. */
  run: (sink: CsvSink, onProgress: (done: number, of: number) => void, signal: AbortSignal) => Promise<ExportDone>;
  className?: string;
  noun?: string;
  status?: DownloadStatus;
  query?: string;
  filtered?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const helpId = useId();
  const [showInfo, setShowInfo] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const infoButton = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const explanation = listDownloadDescription(noun, status, query, filtered);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!showInfo) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setShowInfo(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setShowInfo(false); infoButton.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [showInfo]);

  const go = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setShowInfo(false);
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
      inFlight.current = false;
      if (!c.signal.aborted) setBusy(false);
    }
  };

  return (
    <span ref={root} className={cn("list-export-options", className)}>
      <span id={helpId} className="sr-only">{explanation}</span>
      <span className="list-download-control">
          <button type="button" data-export-list disabled={busy} onClick={() => void go()} aria-label={busy ? "Preparing CSV download" : "Download"}
            aria-describedby={helpId} title={busy ? "Preparing CSV download" : explanation} className="list-options-trigger report-download-action">
            {busy ? <Loader2 aria-hidden className="list-download-icon h-3.5 w-3.5 animate-spin" /> : <Download aria-hidden className="list-download-icon h-3.5 w-3.5" />}
            <span>{busy ? "Preparing" : "Download"}</span>
          </button>
          <button ref={infoButton} type="button" className="download-info-trigger" aria-label="About this download"
            aria-expanded={showInfo} aria-controls={`${helpId}-info`} onClick={() => setShowInfo(value => !value)} title="What this downloads">
            <Info aria-hidden className="h-3.5 w-3.5" />
          </button>
      </span>
      {showInfo && <span id={`${helpId}-info`} role="note" aria-label="What this downloads" className="download-info-popover">{explanation}</span>}
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
