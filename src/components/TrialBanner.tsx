import { Sparkles } from "lucide-react";

import ContactUs from "@/components/ContactUs";
import type { Summary, TrialCaps } from "@/lib/api";

/**
 * The strip at the top of every page of a trial report.
 *
 * It says, in one breath, what this is and what it is not: a real report
 * about the reader's domain, cut to a few rows per list, with the full
 * counts in plain sight. The counts are the hook; they are never capped.
 */
export default function TrialBanner({ caps, summary }: { caps: TrialCaps; summary: Summary }) {
  const devs = summary.counters.matched.developers;
  const apps = summary.counters.matched.apps;
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-900">
            Trial report: a taste of your domain's full picture.
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">
            You see the first {caps.publishers} matched publishers, {caps.apps} apps,{" "}
            {caps.declarations} declarations and {caps.discovered_lines} discovered lines. Your
            full report holds{" "}
            <strong className="font-semibold text-slate-900">
              {devs.toLocaleString()} matched publishers
            </strong>{" "}
            and{" "}
            <strong className="font-semibold text-slate-900">{apps.toLocaleString()} apps</strong>
            , refreshed every week.
          </p>
        </div>
      </div>
      <div className="flex-shrink-0">
        <ContactUs compact label="See the full report" />
      </div>
    </div>
  );
}
