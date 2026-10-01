import { Lock } from "lucide-react";
import { useEffect } from "react";

import ContactUs from "@/components/ContactUs";
import type { Summary, TrialCaps } from "@/lib/api";

/**
 * The always-visible way out of a trial: a slim bar pinned to the bottom of
 * the viewport on every trial page, so the number behind the cut and the
 * button that unlocks it never depend on scrolling. The locked tails at the
 * end of each list say the same thing in place; this one is there before
 * the reader gets that far.
 */
export default function TrialDock({ caps, summary }: { caps: TrialCaps; summary: Summary }) {
  const devs = summary.counters.matched.developers;
  const apps = summary.counters.matched.apps;
  const shownDevs = Math.min(caps.publishers, devs);
  const shownApps = Math.min(caps.apps, apps);

  // Room for the bar, so the last rows of any page stay readable above it.
  useEffect(() => {
    const previous = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "88px";
    return () => {
      document.body.style.paddingBottom = previous;
    };
  }, []);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-primary/20 bg-white/95 px-4 py-3 shadow-[0_-8px_28px_rgba(15,23,42,0.10)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex min-w-0 items-center gap-2 text-[13px] text-slate-700">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            Trial: {shownDevs} of{" "}
            <strong className="font-semibold text-slate-900">{devs.toLocaleString()}</strong>{" "}
            matched publishers and {shownApps} of{" "}
            <strong className="font-semibold text-slate-900">{apps.toLocaleString()}</strong>{" "}
            apps are shown. The full report is one call away.
          </span>
        </p>
        <div className="flex-shrink-0">
          <ContactUs compact label="See the full report" />
        </div>
      </div>
    </div>
  );
}
