import { ChevronDown, Globe, Smartphone } from "lucide-react";
import { useState } from "react";

import type { GoneInventory as Gone } from "@/lib/api";
import { cn, storeLabel } from "@/lib/utils";

/**
 * NO LONGER LIVE (David, 2026-10-06): publishers and apps that carried the
 * reader's seat lines and are gone: a publisher whose domain no longer
 * exists or whose site stopped answering, an app its store no longer lists
 * (checked twice). Never counted in matched inventory: a line on a dead
 * property sells nothing, and knowing which ones went is itself a finding.
 *
 * Frozen with the report (``summary.gone``). A tab of the matched list, not
 * a card of its own (David, 2026-10-07: "a big KPI is overkill for that"):
 * the publishers view lists gone publishers, the apps view gone apps. The
 * tab exists only when something is gone; an older link has no tab.
 */

export type GoneKind = "publishers" | "apps";

/** How many rows show before "Show all". */
const PEEK = 10;

const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

/** How many are gone for this view: the full total, not the frozen rows. */
export function goneCount(gone: Gone | null | undefined, kind: GoneKind): number {
  if (!gone) return 0;
  return gone.totals?.[kind] ?? gone[kind]?.length ?? 0;
}

export default function GoneList({ gone, kind }: { gone: Gone | null | undefined; kind: GoneKind }) {
  const [all, setAll] = useState(false);
  const pubs = gone?.publishers ?? [];
  const apps = gone?.apps ?? [];
  const rows = kind === "publishers" ? pubs.length : apps.length;
  const hidden = goneCount(gone, kind) - rows;

  return (
    <div data-testid="no-longer-live">
      <p className="mb-3 text-sm text-slate-500">
        {kind === "publishers"
          ? "Publishers that carried your seat lines and are gone: the domain no longer exists or the site stopped answering."
          : "Apps that carried your seat lines and their store no longer lists, checked twice."}{" "}
        Not counted in your matched totals.
      </p>
      {rows === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-slate-500">
          {kind === "publishers" ? "No publisher of yours is gone." : "No app of yours is gone from its store."}
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          {kind === "publishers"
            ? pubs.slice(0, all ? undefined : PEEK).map((p) => (
                <div key={p.domain} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-slate-500">
                    <Globe aria-hidden className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate font-mono text-[13px] font-semibold text-slate-900">{p.domain}</span>
                      {p.name && p.name !== p.domain && (
                        <span className="hidden truncate text-[12px] text-slate-500 sm:inline">{p.name}</span>
                      )}
                    </div>
                    <div className="truncate text-[12px] text-slate-500">
                      {p.reason}
                      {day(p.since) ? `, since ${day(p.since)}` : ""}
                      {p.apps > 0 ? `, ${p.apps} ${p.apps === 1 ? "app" : "apps"} with it` : ""}
                    </div>
                  </div>
                  {p.lines[0] && (
                    <code className="hidden flex-shrink-0 font-mono text-[11px] text-slate-500 md:block">
                      {p.lines[0]}
                      {p.lines.length > 1 ? ` +${p.lines.length - 1}` : ""}
                    </code>
                  )}
                </div>
              ))
            : apps.slice(0, all ? undefined : PEEK).map((a) => (
                <div key={`${a.store}:${a.bundle}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-slate-500">
                    <Smartphone aria-hidden className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate text-[13px] font-semibold text-slate-900">{a.name || a.bundle}</span>
                      <span className="flex-shrink-0 text-[11px] text-slate-400">
                        {storeLabel(a.store)}, <span className="font-mono">{a.bundle}</span>
                      </span>
                    </div>
                    <div className="truncate text-[12px] text-slate-500">
                      {a.reason}
                      {day(a.since) ? `, since ${day(a.since)}` : ""}, from{" "}
                      <span className="font-mono">{a.publisher}</span>
                    </div>
                  </div>
                </div>
              ))}
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
