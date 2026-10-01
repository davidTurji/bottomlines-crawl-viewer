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
/** `caps` is accepted for the callers' sake; the banner no longer lists them,
 *  the locked tails under each list do. */
export default function TrialBanner({ summary }: { caps?: TrialCaps; summary: Summary }) {
  const devs = summary.counters.matched.developers;
  const apps = summary.counters.matched.apps;
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] leading-relaxed text-slate-700">
            <strong className="font-semibold text-slate-900">Just a glimpse of what we found.</strong>{" "}
            Your full report contains{" "}
            <strong className="font-semibold text-slate-900">{devs.toLocaleString()} publishers</strong>
            {" + "}
            <strong className="font-semibold text-slate-900">{apps.toLocaleString()} apps</strong>,
            refreshed weekly.
          </p>
        </div>
      </div>
      <div className="flex-shrink-0">
        <ContactUs label="Unlock Now" />
      </div>
    </div>
  );
}
