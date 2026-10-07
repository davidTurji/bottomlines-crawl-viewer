import { ChevronDown, Smartphone } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Collapse, Settle } from "@/components/Motion";
import type { GoneApp, GoneInventory as Gone, GonePublisher } from "@/lib/api";
import { cn, storeLabel } from "@/lib/utils";
import { MiniStat } from "@/components/MiniStat";

/**
 * NO LONGER LIVE (David, 2026-10-06): publishers and apps that carried the
 * reader's seat lines and are gone: a publisher whose domain no longer
 * exists or whose site stopped answering, an app its store no longer lists
 * (checked twice). Never counted in matched inventory: a line on a dead
 * property sells nothing, and knowing which ones went is itself a finding.
 *
 * Frozen with the report (``summary.gone``). A tab of the matched list, not
 * a card of its own (David, 2026-10-07: "a big KPI is overkill for that"):
 * the publishers view lists gone publishers, the apps view gone apps, on the
 * SAME cards as the matched rows (PublisherCard, MatchedAppCard), tinted red
 * (David, 2026-10-07). The tab exists only when something is gone.
 */

export type GoneKind = "publishers" | "apps";

/** How many cards show before "Show all". */
const PEEK = 25;

const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

/** How many are gone for this view: the full total, not the frozen rows. */
export function goneCount(gone: Gone | null | undefined, kind: GoneKind): number {
  if (!gone) return 0;
  return gone.totals?.[kind] ?? gone[kind]?.length ?? 0;
}

export default function GoneList({
  gone,
  kind,
  filtered = false,
}: {
  gone: Gone | null | undefined;
  kind: GoneKind;
  /** A seat-line filter is on. This list is frozen for the whole watchlist,
   *  so it says so instead of passing for a filtered list (review). */
  filtered?: boolean;
}) {
  const [all, setAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pubs = gone?.publishers ?? [];
  const apps = gone?.apps ?? [];
  const rows = kind === "publishers" ? pubs.length : apps.length;
  const hidden = goneCount(gone, kind) - rows;
  const toggle = (key: string) => setExpanded((k) => (k === key ? null : key));

  return (
    <div data-testid="no-longer-live">
      <p className="mb-3 text-sm text-slate-500">
        {kind === "publishers"
          ? "Publishers that carried your seat lines and are gone: the domain no longer exists or the site stopped answering."
          : "Apps that carried your seat lines and their store no longer lists, checked twice."}{" "}
        Not counted in your matched totals.
        {filtered && " Shown for all your seat lines, not only the selected ones."}
      </p>
      {rows === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-slate-500">
          {kind === "publishers" ? "No publisher of yours is gone." : "No app of yours is gone from its store."}
        </p>
      ) : (
        <div className="space-y-3">
          {kind === "publishers"
            ? pubs.slice(0, all ? undefined : PEEK).map((p, i) => (
                <Settle key={p.domain} index={i}>
                  <GonePublisherCard pub={p} open={expanded === p.domain} onToggle={() => toggle(p.domain)} />
                </Settle>
              ))
            : apps.slice(0, all ? undefined : PEEK).map((a, i) => {
                const key = `${a.store}:${a.bundle}`;
                return (
                  <Settle key={key} index={i}>
                    <GoneAppCard app={a} open={expanded === key} onToggle={() => toggle(key)} />
                  </Settle>
                );
              })}
        </div>
      )}
      {(rows > PEEK || hidden > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {rows > PEEK && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-primary"
            >
              {all ? "Show fewer" : `Show all ${rows}`}
              <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform", all && "rotate-180")} />
            </button>
          )}
          {hidden > 0 && (
            <span className="text-[11px] text-slate-400">{hidden.toLocaleString()} more not listed here.</span>
          )}
        </div>
      )}
    </div>
  );
}

/** The right-hand "Gone since" column, in ChangeCell's width and rhythm. */
function GoneSince({ since }: { since: string | null }) {
  return (
    <div className="w-[112px]">
      <div className="text-[10px] font-medium tracking-wide text-slate-500">Gone since</div>
      <div className="font-mono text-sm tabular-nums text-critical">{day(since) ?? "\u2014"}</div>
    </div>
  );
}

/**
 * One titled box inside an open card, the "Removed lines" window of the
 * matched cards (CrawlReport ChangeWindow): toned header with its count,
 * white rows underneath. Same look, so a gone card reads as one of ours.
 */
function GoneWindow({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-critical-border bg-white shadow-sm">
      <div className="flex items-baseline justify-between gap-2 border-b border-critical-border bg-critical-bg/60 px-3 py-1.5">
        <span className="text-xs font-medium text-critical">{title}</span>
        {count != null && (
          <span className="font-mono text-[11px] font-semibold tabular-nums text-critical">{count}</span>
        )}
      </div>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

/** A label and its value on one row of a GoneWindow. */
function Fact({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3 px-3 py-1.5">
      <span className="flex-shrink-0 text-[11px] text-slate-500">{label}</span>
      <span className={cn("min-w-0 truncate text-right text-[11px] text-slate-800", mono && "font-mono tabular-nums")}>
        {value}
      </span>
    </li>
  );
}

/** Shell shared by both cards: PublisherCard's shape, with a red wash. */
function GoneCard({
  label,
  open,
  onToggle,
  face,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  face: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-critical-border bg-gradient-to-r from-critical-bg/80 via-white to-white shadow-sm transition-shadow",
        open && "shadow-md",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} details of ${label}`}
        className="flex w-full items-center gap-4 rounded-t-3xl px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-critical/30 sm:px-5"
      >
        {face}
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 flex-shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>
      <Collapse open={open}>
        <div className="border-t border-critical-border bg-critical-bg/20 px-4 pb-4 pt-3 sm:px-5">{children}</div>
      </Collapse>
    </div>
  );
}

function GonePublisherCard({ pub, open, onToggle }: { pub: GonePublisher; open: boolean; onToggle: () => void }) {
  const named = pub.name && pub.name !== pub.domain;
  const initial = (pub.name || pub.domain || "?").replace(/^www\./i, "").charAt(0).toUpperCase() || "?";
  return (
    <GoneCard
      label={pub.name || pub.domain}
      open={open}
      onToggle={onToggle}
      face={
        <>
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-critical-bg text-base font-semibold text-critical ring-1 ring-critical-border">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold tracking-tight text-slate-900">
              {named ? pub.name : pub.domain}
            </div>
            <div className="truncate text-xs text-slate-500">
              {named && <span>{pub.domain}, </span>}
              <span className="text-critical">{pub.reason}</span>
            </div>
          </div>
          <div className="hidden items-center gap-6 text-right sm:flex">
            <div className="w-[84px]">
              <MiniStat label="Your lines" value={pub.lines.length} emphasis />
            </div>
            <div className="w-[84px]">
              <MiniStat label="Apps" value={pub.apps} />
            </div>
            <GoneSince since={pub.since} />
          </div>
        </>
      }
    >
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <GoneWindow title="Your seat lines it carried" count={pub.lines.length}>
          {pub.lines.map((l) => (
            <li key={l} className="px-3 py-1.5">
              <code className="block truncate font-mono text-[11px] tabular-nums text-slate-800">{l}</code>
            </li>
          ))}
        </GoneWindow>
        <GoneWindow title="Why it is gone">
          <Fact label="Reason" value={pub.reason} />
          <Fact label="Publisher" value={pub.domain} mono />
          <Fact label="Gone since" value={day(pub.since) ?? "\u2014"} />
          <Fact label="Apps with it" value={pub.apps.toLocaleString()} mono />
        </GoneWindow>
      </div>
    </GoneCard>
  );
}

function GoneAppCard({ app, open, onToggle }: { app: GoneApp; open: boolean; onToggle: () => void }) {
  return (
    <GoneCard
      label={app.name || app.bundle}
      open={open}
      onToggle={onToggle}
      face={
        <>
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-critical-bg text-critical ring-1 ring-critical-border">
            <Smartphone aria-hidden className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-base font-semibold tracking-tight text-slate-900">
                {app.name || app.bundle}
              </span>
              <span className="flex-shrink-0 rounded-full border border-critical-border bg-critical-bg px-1.5 py-px text-[10px] font-medium text-critical">
                {storeLabel(app.store)}
              </span>
            </div>
            <div className="truncate text-xs text-slate-500">
              {/* A trial does not name the publisher (crawler viewer_frozen). */}
              {app.publisher && (
                <>
                  publisher: <span className="text-slate-600">{app.publisher}</span>,{" "}
                </>
              )}
              <span className="text-critical">{app.reason}</span>
            </div>
          </div>
          <div className="hidden items-center gap-6 text-right sm:flex">
            <GoneSince since={app.since} />
          </div>
        </>
      }
    >
      <div className="sm:max-w-[50%]">
        <GoneWindow title="Why it is gone">
          <Fact label="Reason" value={`${app.reason}, checked twice`} />
          <Fact label="Store" value={storeLabel(app.store)} />
          <Fact label="Store id" value={app.bundle} mono />
          {app.publisher && <Fact label="Publisher" value={app.publisher} mono />}
          <Fact label="Gone since" value={day(app.since) ?? "\u2014"} />
        </GoneWindow>
      </div>
    </GoneCard>
  );
}
