import { ChevronDown, Globe, Smartphone } from "lucide-react";
import { useState } from "react";

import { Collapse } from "@/components/Motion";
import type { GoneInventory as Gone } from "@/lib/api";
import { cn, storeLabel } from "@/lib/utils";
import { SplitStat } from "@/routes/CrawlReport";

/**
 * NO LONGER LIVE (David, 2026-10-06): publishers and apps that carried the
 * reader's seat lines and are gone: a publisher whose domain no longer
 * exists or whose site stopped answering, an app its store no longer lists
 * (checked twice). Never counted in matched inventory: a line on a dead
 * property sells nothing, and knowing which ones went is itself a finding.
 *
 * Frozen with the report (``summary.gone``). Shown only when something is
 * gone; an older link without the block shows nothing.
 */

/** How many rows show before "Show all". */
const PEEK = 4;

const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

export default function GoneInventory({ gone }: { gone: Gone | null | undefined }) {
  const pubs = gone?.publishers ?? [];
  const apps = gone?.apps ?? [];
  const totalPubs = gone?.totals?.publishers ?? pubs.length;
  const totalApps = gone?.totals?.apps ?? apps.length;
  const [view, setView] = useState<"publishers" | "apps">(totalApps > 0 ? "apps" : "publishers");
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  if (totalPubs + totalApps === 0) return null;
  const rows = view === "publishers" ? pubs.length : apps.length;
  const hidden = (view === "publishers" ? totalPubs : totalApps) - rows;

  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm" data-testid="no-longer-live">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-display text-sm font-medium text-slate-700">No longer live</div>
          <div className="text-[11px] text-slate-500">
            Carried your seat lines, now gone. Not counted in matched inventory.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1 text-[11.5px] font-medium text-slate-700 shadow-sm transition-colors hover:bg-muted"
        >
          {open ? "Hide" : "Show them"}
          <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border border-border">
        <SplitStat
          tone="critical"
          number={totalPubs}
          label="Publishers gone"
          caption="Domain gone or site down"
          active={open && view === "publishers"}
          onClick={() => {
            setView("publishers");
            setOpen(true);
            setAll(false);
          }}
        />
        <SplitStat
          tone="critical"
          number={totalApps}
          label="Apps gone from their store"
          caption="Checked against the store, twice"
          active={open && view === "apps"}
          onClick={() => {
            setView("apps");
            setOpen(true);
            setAll(false);
          }}
        />
      </div>

      <Collapse open={open}>
        <div className="mt-4">
          {rows === 0 ? (
            <p className="text-[12px] text-slate-500">
              {view === "publishers" ? "No publisher of yours is gone." : "No app of yours is gone from its store."}
            </p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {view === "publishers"
                ? pubs.slice(0, all ? undefined : PEEK).map((p) => (
                    <div key={p.domain} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-critical-bg text-critical">
                        <Globe aria-hidden className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate font-mono text-[12.5px] font-semibold text-slate-900">{p.domain}</span>
                          {p.name && p.name !== p.domain && (
                            <span className="hidden truncate text-[12px] text-slate-500 sm:inline">{p.name}</span>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-slate-500">
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
                    <div key={`${a.store}:${a.bundle}`} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-critical-bg text-critical">
                        <Smartphone aria-hidden className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate text-[12.5px] font-semibold text-slate-900">{a.name || a.bundle}</span>
                          <span className="flex-shrink-0 text-[11px] text-slate-400">
                            {storeLabel(a.store)}, <span className="font-mono">{a.bundle}</span>
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-slate-500">
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
                <span className="text-[11px] text-slate-400">
                  {hidden.toLocaleString()} more not listed here.
                </span>
              )}
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
}
