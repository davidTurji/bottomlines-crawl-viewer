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
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

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

/** The arrows: quiet round buttons inside the bar, faded out at the ends. */
const ARROW =
  "flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 active:scale-95 disabled:pointer-events-none disabled:opacity-30";

/**
 * Which page numbers the bar shows. Seven slots once there are more than
 * seven pages, always seven, so the bar keeps one width as the reader moves
 * through it and nothing slides out from under the cursor:
 *
 *   1 2 3 4 5 … 951     near the start
 *   1 … 6 7 8 … 951     in the middle
 *   1 … 947 … 951       near the end, mirrored
 *
 * The first and last page are always one click away, which is what the old
 * first and last buttons were for.
 */
export function pageSlots(page: number, pages: number): (number | "gap-l" | "gap-r")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "gap-r", pages];
  if (page >= pages - 3) return [1, "gap-l", pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, "gap-l", page - 1, page, page + 1, "gap-r", pages];
}

/**
 * The pager for a list that can be genuinely long.
 *
 * A regenerated Boldwin report carries 18,665 publishers and 57,582 apps.
 * At 25 a page that is 747 and 2,304 pages, and prev/next alone would mean
 * clicking Next 2,303 times to reach the end of the alphabet.
 *
 * ONE ROUNDED BAR, NOT A ROW OF BOXES (David, 2026-10-02: "it looks very
 * clunky"). It was four square buttons and a text box. It is now arrows and
 * page numbers inside a single pill, the current page in the brand green:
 * the shape every reader already knows from search results, so nothing on
 * it needs reading.
 *
 * Typing a page survives, because it is what makes page 1,400 of 2,304
 * reachable in one action, and how somebody returns to where they were
 * after following a link away. It lives behind the "…": press it and it
 * becomes a box, type a number, Enter.
 *
 * EVERY PAGED LIST WEARS IT TWICE, above the rows and below them (David,
 * 2026-10-02: "it should show on top and on bottom"). With it only at the
 * bottom, turning a page meant scrolling past every row first. Pair the two
 * with `usePaging`, which also brings the reader back to the top of the new
 * page when they turned it from the bottom.
 */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  noun,
  placement = "bottom",
  anchorRef,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (next: number) => void;
  /** Plural noun for the count line, e.g. "publishers". */
  noun: string;
  /** The copy above the rows says nothing on a single page: the one below
   *  already carries the count, and saying it twice is noise. */
  placement?: "top" | "bottom";
  /** `usePaging`'s topRef, on the top pager: where a turn from the bottom
   *  scrolls back to. */
  anchorRef?: React.Ref<HTMLDivElement>;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  /** Which "…" is open as a type-a-page box, if either. */
  const [jumping, setJumping] = useState<"gap-l" | "gap-r" | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => setJumping(null), [page]);

  const go = () => {
    const n = Number.parseInt(draft, 10);
    setJumping(null);
    // Out of range snaps to the nearest real page rather than refusing.
    // Typing 9999 clearly means "the end", and an error message there would
    // be pedantry about a number the reader does not know the bound of.
    if (!Number.isFinite(n)) return;
    const target = Math.min(pages, Math.max(1, n));
    if (target !== page) onPage(target);
  };

  // One page of results needs no controls, but the count still helps: it is
  // the difference between "3 matches" and "the list is broken".
  if (pages <= 1) {
    if (placement === "top") return null;
    return (
      <p className="px-1 text-xs text-slate-500">
        {total.toLocaleString()} {noun}
      </p>
    );
  }

  return (
    <div
      ref={anchorRef}
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1",
        className,
      )}
    >
      <p className="text-xs text-slate-500">
        <span className="font-semibold tabular-nums text-slate-800">
          {first.toLocaleString()}&ndash;{last.toLocaleString()}
        </span>{" "}
        of <span className="tabular-nums">{total.toLocaleString()}</span> {noun}
      </p>
      <nav
        aria-label="Pages"
        className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-1 shadow-sm"
      >
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={ARROW}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageSlots(page, pages).map((slot) =>
          typeof slot === "number" ? (
            <button
              key={slot}
              type="button"
              onClick={() => slot !== page && onPage(slot)}
              aria-label={`Page ${slot}`}
              aria-current={slot === page ? "page" : undefined}
              className={cn(
                "h-8 min-w-8 rounded-full px-2 text-xs font-semibold tabular-nums transition-all duration-200 active:scale-95",
                slot === page
                  ? "bg-gradient-to-b from-[hsl(152_50%_32%)] to-primary text-white shadow-sm shadow-primary/30"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              {slot.toLocaleString()}
            </button>
          ) : jumping === slot ? (
            <input
              key={slot}
              autoFocus
              type="text"
              inputMode="numeric"
              value={draft}
              placeholder="#"
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={go}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setDraft("");
                  setJumping(null);
                }
              }}
              aria-label={`Go to page, 1 to ${pages.toLocaleString()}`}
              className="h-8 w-12 rounded-full border border-primary/40 bg-white text-center text-xs font-semibold tabular-nums text-slate-900 outline-none ring-2 ring-primary/15 animate-in fade-in zoom-in-95 duration-150 placeholder:text-slate-300"
            />
          ) : (
            <button
              key={slot}
              type="button"
              onClick={() => {
                setDraft("");
                setJumping(slot);
              }}
              aria-label="Go to a page"
              title="Go to a page"
              className="h-8 w-8 rounded-full text-xs font-semibold text-slate-400 transition-all duration-200 hover:bg-slate-100 hover:text-slate-700"
            >
              &hellip;
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
          className={ARROW}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}

/**
 * The two pagers' shared wiring: one page handler for both, and a ref for
 * the top one.
 *
 * Turning the page from the BOTTOM pager used to leave the reader at the
 * bottom of the new page, looking at its last row. Now the list goes back to
 * the top pager, so the first row of the new page is the first thing in
 * view. From the top pager nothing moves: it is already in view, and a
 * scroll there would be a jolt for nothing.
 *
 * NEAR GLIDES, FAR JUMPS. A short way back is a smooth scroll. A long way
 * back (a page of 25 rows with cards open runs thousands of pixels) is an
 * instant jump, and not only because a 20,000px glide is a blur: the new page is often far
 * shorter than the old one (the last page is usually a partial one), the
 * list shrinks under a scroll still in flight, and the browser clamps it
 * short of the target. Measured: the glide stopped 70px above the top pager,
 * hiding it. A jump lands before the list changes, so nothing can cut it off.
 *
 * Scrolls the list's own scroller by a computed amount rather than calling
 * scrollIntoView, which also scrolls every overflow:hidden ancestor and can
 * slide the whole shell, header included, out from under the reader.
 */
export function usePaging(onPage: (next: number) => void) {
  const topRef = useRef<HTMLDivElement>(null);
  const turn = useCallback(
    (next: number) => {
      onPage(next);
      const el = topRef.current;
      if (!el) return;
      const scroller = scrollParentOf(el);
      const floor = scroller.getBoundingClientRect().top;
      const offset = el.getBoundingClientRect().top - floor - TOP_GAP;
      // Already in view: this was the top pager, or a list short enough
      // that the reader is looking at both pagers at once.
      if (offset >= -TOP_GAP) return;
      const far = -offset > scroller.clientHeight * 1.5;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      scroller.scrollBy({ top: offset, behavior: far || reduce ? "auto" : "smooth" });
    },
    [onPage],
  );
  return { topRef, onPage: turn };
}

/** Breathing room left above the top pager when the list lands on it. */
const TOP_GAP = 16;

/** The nearest ancestor that actually scrolls: the Layout's inner <main>. */
function scrollParentOf(el: Element): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (/(auto|scroll|overlay)/.test(overflowY) && p.scrollHeight > p.clientHeight + 1) {
      return p;
    }
  }
  return document.scrollingElement ?? document.documentElement;
}

/**
 * Shown when the artifact holds only a prefix of a list.
 *
 * Boldwin's delivered report says 18,665 matched publishers in its headline
 * and stores 2,000 rows, because it was frozen under the old cap. A reader
 * cannot tell 2,000 rows that ARE the answer from 2,000 rows that are the
 * first 2,000, and the difference decides whether they should ask for the
 * report to be regenerated. So the page says it.
 */
export function TruncatedNotice({
  shown,
  noun,
}: {
  shown: number;
  noun: string;
}) {
  return (
    <p className="mt-3 rounded-lg border border-dashed border-border px-4 py-3 text-xs leading-relaxed text-slate-500">
      This report was frozen with an earlier row limit, so it carries the
      first {shown.toLocaleString()} {noun} rather than all of them. Ask for
      the report to be regenerated to get the full list.
    </p>
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
