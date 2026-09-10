/**
 * The search box and pager that sit above and below a long matched list.
 *
 * Shared by Matched publishers and Matched apps so the two behave
 * identically. They are the same act from the reader's side -- find the row
 * you care about in a list far too long to scroll -- and they were both
 * showing only the first page of a list whose remainder had no route to it
 * at all.
 *
 * SIZE OF THE PROBLEM, MEASURED. Boldwin matched 18,665 publishers and
 * 57,582 apps; the frozen artifact used to cap those sections at 2,000 and
 * 5,000 rows, and the page rendered only the first 100 of what survived. So
 * a customer could reach roughly 0.2% of their own apps.
 *
 * Searching and paging are both SERVER-side against the frozen snapshot, so
 * the phone holds one page at a time and the report still never opens a
 * database connection.
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";

/** How long to wait after the last keystroke before asking the server. */
const DEBOUNCE_MS = 250;

export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
}) {
  // Local state so the input stays responsive while the committed value
  // (the one that triggers a fetch) lags behind by the debounce.
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const id = window.setTimeout(() => onChange(draft), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [draft, value, onChange]);

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-8 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
      />
      {draft !== "" && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-muted hover:text-slate-600"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
  noun,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (next: number) => void;
  /** Plural noun for the count line, e.g. "publishers". */
  noun: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  // One page of results needs no controls, but the count still helps: it is
  // the difference between "3 matches" and "the list is broken".
  if (pages <= 1) {
    return (
      <p className="px-1 text-xs text-slate-500">
        {total.toLocaleString()} {noun}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
      <p className="text-xs tabular-nums text-slate-500">
        {first.toLocaleString()}&ndash;{last.toLocaleString()} of{" "}
        {total.toLocaleString()} {noun}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-slate-600 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[5.5rem] text-center text-xs tabular-nums text-slate-600">
          Page {page.toLocaleString()} of {pages.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-slate-600 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** What an empty result should say, which depends on WHY it is empty. */
export function EmptyResult({ query, noun }: { query: string; noun: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
      <p className="text-sm text-slate-600">
        {query
          ? `No ${noun} match "${query}".`
          : `No ${noun} on this report.`}
      </p>
      {query && (
        <p className="mt-1 text-xs text-slate-500">
          Search covers names and domains.
        </p>
      )}
    </div>
  );
}
