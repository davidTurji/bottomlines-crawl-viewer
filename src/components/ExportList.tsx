/**
 * "EXPORT THIS LIST" (David, 2026-10-27): a small CSV of exactly what the
 * list on screen holds, its tab, filters and search, every page of it, not
 * the one on screen. Built the way the Changes page's per-line export was:
 * read the list's own pages one after another (politely, never in
 * parallel), refuse if the list changes during the read, then hand the
 * browser a file. It reads only the list's endpoints, so it never uses or
 * counts against the report's metered full export.
 */
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type CsvCell = string | number | null | undefined;
export type CsvTable = { filename: string; header: string[]; rows: CsvCell[][] };

/** RFC 4180: every cell quoted, quotes doubled, CRLF between rows. */
export function csvText(header: string[], rows: CsvCell[][]): string {
  const cell = (v: CsvCell) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

function download(t: CsvTable) {
  const url = URL.createObjectURL(new Blob([csvText(t.header, t.rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = t.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

export function ExportListButton({
  run,
  className,
}: {
  /** Reads the whole list and shapes it; reports its pages as it goes. */
  run: (onProgress: (done: number, of: number) => void, signal: AbortSignal) => Promise<CsvTable>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const go = async () => {
    if (busy) return;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const table = await run((done, of) => !c.signal.aborted && setProgress({ done, of }), c.signal);
      if (!c.signal.aborted) download(table);
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
    </span>
  );
}
