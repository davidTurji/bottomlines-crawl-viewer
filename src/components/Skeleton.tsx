/**
 * SKELETONS: THE LOADING STATE IS A PLAN OF THE PAGE.
 *
 * Every report page used to load the same way: a spinner in an empty
 * column, left-aligned on three of the four pages and centred on the
 * fourth, so navigating between tabs made the loading state itself move
 * around the screen. A spinner also says nothing except "wait" — the page
 * arrives all at once, and the layout jumps into place underneath it.
 *
 * These render the SHAPE of the page that is coming: the same cards, the
 * same row rhythm, the same widths. Three rules hold the whole thing
 * together and are worth keeping:
 *
 *   1. A skeleton is only ever drawn for content that is genuinely coming.
 *      Never sketch a card the payload may not contain — a skeleton that
 *      resolves to nothing is a promise the page then breaks.
 *   2. The block geometry MATCHES the real thing (h-11 w-11 disc, h-10
 *      filter bar, rounded-3xl row) so the real content lands in the space
 *      its own outline already occupied, with no reflow.
 *   3. Rows cascade. `stagger(i)` hands each row an increasing delay, so
 *      the shimmer runs down the list rather than flashing as a block.
 *
 * The animation itself lives in index.css (`.bl-skeleton`, `bl-sweep`),
 * including the reduced-motion stilling, so the visual language is defined
 * once and cannot drift between pages.
 */

import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

/** Each row enters the sweep a beat after the one above it. */
const stagger = (i: number): CSSProperties =>
  ({ "--bl-delay": `${i * 90}ms` }) as CSSProperties;

/**
 * One shimmering block. Decorative by definition: the accessible name for
 * a loading page is announced once, by the page skeleton's live region,
 * not by each of its forty blocks.
 */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div aria-hidden className={cn("bl-skeleton", className)} style={style} />
  );
}

/**
 * The wrapper every page skeleton uses. It is the one thing that speaks:
 * a polite live region carrying the label, so a screen reader hears
 * "Loading declarations" once instead of nothing at all.
 *
 * `animate-in fade-in` on a short duration keeps the skeleton itself from
 * snapping in on a fast connection, where it may only exist for a frame.
 */
function SkeletonScreen({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="animate-in fade-in space-y-5 duration-500"
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/* ── Shared pieces ─────────────────────────────────────────────────── */

/** The h1, its subtitle and the week line, at their real widths. */
function HeaderBlock() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-52 rounded-lg" />
      <Skeleton className="h-4 w-72 max-w-full rounded-md" style={stagger(1)} />
      <Skeleton className="h-3 w-60 max-w-full rounded-md" style={stagger(2)} />
    </div>
  );
}

/**
 * A KPI card: title, hint, a right-aligned note, and an inner grid of
 * `columns` split stats. The real cards are rounded-2xl white on a
 * hairline with the stat grid boxed inside them, and this is that, so the
 * numbers land exactly where their outlines were.
 */
function StatCard({
  columns = 2,
  delay = 0,
}: {
  columns?: 2 | 3;
  delay?: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-36 rounded-md" style={stagger(delay)} />
          <Skeleton className="h-3 w-28 rounded-md" style={stagger(delay + 1)} />
        </div>
        <Skeleton className="h-3 w-24 rounded-md" style={stagger(delay + 1)} />
      </div>
      <div
        className={cn(
          "grid divide-x divide-border overflow-hidden rounded-xl border border-border",
          columns === 3 ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        {Array.from({ length: columns }).map((_, i) => (
          // The real tile is SplitStat: px-5 py-4, a 4xl figure on the
          // left, its label 8px under it, then a 17px slot for the delta
          // that is reserved whether or not there is one. Matching that
          // rhythm block for block is what stops the numbers from landing
          // somewhere other than where their outlines were.
          <div key={i} className="px-5 py-4">
            <Skeleton
              className="h-9 w-24 rounded-lg"
              style={stagger(delay + i)}
            />
            <Skeleton
              className="mt-2 h-4 w-28 rounded-md"
              style={stagger(delay + i + 1)}
            />
            <Skeleton
              className="mt-1 h-3 w-32 rounded-md"
              style={stagger(delay + i + 2)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The search-and-sort bar: one full-width pill at the real 40px height. */
function FilterBarBlock({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex w-full items-center gap-2 rounded-full border border-border bg-white p-1.5">
      <Skeleton className="h-7 flex-1 rounded-full" />
      {Array.from({ length: actions }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-7 w-28 rounded-full"
          style={stagger(i + 1)}
        />
      ))}
    </div>
  );
}

/**
 * One list row. Every list on the report wears the same card — a 44px
 * disc, an identity line with a subtitle under it, stats on the right and
 * a chevron — so one row skeleton serves all three list pages.
 *
 * The identity line's width varies with the index rather than being
 * uniform: a column of forty identical bars reads as a pattern, a ragged
 * one reads as text that has not arrived yet.
 */
function RowBlock({ i }: { i: number }) {
  const widths = ["w-[42%]", "w-[58%]", "w-[35%]", "w-[50%]", "w-[64%]"];
  return (
    <div className="rounded-3xl border border-border bg-white px-4 py-4 shadow-sm sm:px-5">
      <div className="flex items-center gap-4">
        <Skeleton
          className="h-11 w-11 flex-shrink-0 rounded-full"
          style={stagger(i)}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton
            className={cn("h-4 max-w-full rounded-md", widths[i % widths.length])}
            style={stagger(i)}
          />
          <Skeleton
            className="h-3 w-28 rounded-md"
            style={stagger(i + 1)}
          />
        </div>
        <div className="hidden flex-shrink-0 items-center gap-6 sm:flex">
          <div className="space-y-1.5 text-right">
            {/* Caption over figure, the order the real row uses. */}
            <Skeleton className="ml-auto h-3 w-16 rounded-md" style={stagger(i)} />
            <Skeleton className="ml-auto h-4 w-10 rounded-md" style={stagger(i + 1)} />
          </div>
          <Skeleton className="h-4 w-4 rounded" style={stagger(i + 1)} />
        </div>
      </div>
    </div>
  );
}

/** A run of rows, cascading. */
function RowList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <RowBlock key={i} i={i} />
      ))}
    </div>
  );
}

/* ── Page skeletons ────────────────────────────────────────────────
 *
 * A page's loading state is assembled from these in the SLOTS the real
 * blocks occupy, not dropped in one lump where the old spinner stood. The
 * KPI card sits above the filter bar on Discovery and above the tabs on
 * Changes, so a single all-in-one skeleton rendered at the spinner's
 * position would put the cards underneath the controls and then jump them
 * back over on arrival. Hence the two loose pieces below.
 */

/**
 * The KPI slot: one full-width card, or a pair side by side on desktop.
 * Rendered where the real cards are declared, so nothing moves when they
 * land.
 */
export function SkeletonStatCards({
  count = 1,
  columns = 2,
}: {
  count?: 1 | 2;
  columns?: 2 | 3;
}) {
  if (count === 1) {
    return (
      <div aria-hidden>
        <StatCard columns={columns} />
      </div>
    );
  }
  return (
    <div aria-hidden className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <StatCard columns={columns} />
      <StatCard columns={columns} delay={1} />
    </div>
  );
}

/**
 * The list slot. This piece carries the live region for the page, because
 * it is the one every loading page renders and the last thing to resolve.
 */
export function SkeletonRows({
  rows = 6,
  label,
}: {
  rows?: number;
  label: string;
}) {
  return (
    <SkeletonScreen label={label}>
      <RowList rows={rows} />
    </SkeletonScreen>
  );
}

/**
 * The overview, whole. Unlike the other three this one replaces a
 * full-screen spinner on a page that has painted nothing at all yet, so it
 * carries its own header, hero cards and list.
 */
export function OverviewSkeleton() {
  return (
    <SkeletonScreen label="Loading your crawl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <HeaderBlock />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-32 rounded-full" style={stagger(1)} />
          <Skeleton className="h-9 w-36 rounded-full" style={stagger(2)} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatCard />
        <StatCard delay={1} />
      </div>
      <Skeleton className="h-9 w-72 max-w-full rounded-full" />
      <RowList rows={5} />
    </SkeletonScreen>
  );
}

/**
 * Declarations, whole. Here the KPI card, the filter bar and the sections
 * are gated together on the payload, so all three are missing at once and
 * one block in their place keeps the real order.
 */
export function DeclarationsSkeleton() {
  return (
    <SkeletonScreen label="Loading declarations">
      <StatCard columns={3} />
      <FilterBarBlock actions={2} />
      <RowList rows={5} />
    </SkeletonScreen>
  );
}

/**
 * The inline list inside an expanded row, while its publishers are
 * fetched. Small and bounded: this sits INSIDE a card the reader has just
 * opened, so it is a few rows in the scroller's own frame, never a
 * full-page treatment.
 */
export function SkeletonInlineRows({
  rows = 4,
  label,
}: {
  rows?: number;
  label: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="animate-in fade-in rounded-md border border-border bg-white duration-500"
    >
      <span className="sr-only">{label}</span>
      <ul className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-2.5 px-3 py-2">
            <Skeleton
              className="h-3 flex-1 rounded-md"
              style={stagger(i)}
            />
            <Skeleton
              className="h-3 w-16 flex-shrink-0 rounded-md"
              style={stagger(i + 1)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
