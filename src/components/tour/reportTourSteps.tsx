/**
 * The report walkthrough: what it says, and in what order.
 *
 * Content lives apart from the runner so the copy can be reviewed as copy.
 * The rules follow the console tour's (bottomlines-app, productTourSteps.tsx):
 *
 * 1. **Point, do not describe.** Every step names a `data-tour` anchor on its
 *    page, kept small: one card, one control. A missing anchor degrades to a
 *    centered card rather than breaking.
 * 2. **Only describe what the page does.** Every label below was read off the
 *    page it describes. A walkthrough that promises a feature is worse than
 *    none, because the reader trusts it.
 * 3. **Follow the rail.** Overview, Changes, Discovery, Declarations, the
 *    sidebar's own order, so finishing leaves the reader able to find things
 *    again without it.
 * 4. **One line each.** A dozen words, the words that matter in bold
 *    (David, 2026-10-02: "super short text"). The reader is looking at the
 *    page; the card only has to say what to look at.
 * 5. **Only steps this report can show.** Discovery is in the rail only when
 *    the crawl discovered something, the line filter only when the report
 *    carries its watchlist, Export only when there is a file to hand over, and
 *    the preview note only on a trial. A step about something that is not on
 *    screen is a question the walkthrough cannot answer.
 *
 * No em dashes in anything a reader sees (house copy rule).
 */

import type { TourStep } from "./TourOverlay";

/** The report page a step is about, relative to the report's base path. */
export type ReportPage = "" | "changes" | "discovery" | "declarations";

export interface ReportTourStep extends TourStep {
  /** The runner navigates here when the step opens. */
  page: ReportPage;
}

/** What this particular report has on screen, read once when the walkthrough opens. */
export interface ReportFeatures {
  /** The crawl discovered lines, so the rail lists Discovery. */
  hasDiscovery: boolean;
  /** The report carries its watchlist, so the line filter renders. */
  hasLineFilter: boolean;
  /** There is a file behind Export (never on a trial). */
  canExport: boolean;
  /** A trial report: first rows of every list, full counts. */
  trial: boolean;
}

/** Every step this report can show, in reading order. */
export function reportTourSteps(f: ReportFeatures): ReportTourStep[] {
  const pages = ["Overview", "Changes", ...(f.hasDiscovery ? ["Discovery"] : []), "Declarations"];
  const pageList = `${pages.slice(0, -1).join(", ")} and ${pages[pages.length - 1]}`;

  const steps: (ReportTourStep | false)[] = [
    {
      id: "welcome",
      page: "",
      anchor: "overview-header",
      eyebrow: "Overview",
      title: "Your weekly crawl",
      body: (
        <p>
          Who carries <strong>your seat lines</strong>, and what <strong>changed</strong> since last week.
        </p>
      ),
    },
    f.trial && {
      id: "trial",
      page: "",
      anchor: "trial-banner",
      eyebrow: "Overview",
      title: "A preview",
      body: (
        <p>
          First rows only. <strong>Unlock Now</strong> gets the full report.
        </p>
      ),
    },
    {
      id: "week-changes",
      page: "",
      anchor: "overview-changes",
      eyebrow: "Overview",
      title: "What moved",
      body: (
        <p>
          Lines <strong>added</strong> and <strong>removed</strong> since last week. A first crawl is your <strong>baseline</strong>.
        </p>
      ),
    },
    {
      id: "matched",
      page: "",
      anchor: "overview-matched",
      eyebrow: "Overview",
      title: "Matched inventory",
      body: (
        <p>
          <strong>Publishers</strong> and <strong>apps</strong> carrying your lines. Tap a tile to switch the list.
        </p>
      ),
    },
    {
      id: "matched-list",
      page: "",
      anchor: "overview-list",
      // The whole list is taller than a phone, so a highlight of it covers
      // the screen and points at nothing. On a phone, its heading.
      mobileAnchor: "overview-list-head",
      eyebrow: "Overview",
      title: "Every match",
      body: (
        <p>
          <strong>Click a row</strong> to see its exact lines and this week&apos;s moves.
        </p>
      ),
    },
    f.hasLineFilter && {
      id: "line-filter",
      page: "",
      anchor: "line-filter",
      eyebrow: "Overview",
      title: "Filter by line",
      body: (
        <p>
          Pick lines, press <strong>Apply</strong>. The whole report follows.
        </p>
      ),
    },
    f.canExport && {
      id: "export",
      page: "",
      anchor: "export",
      eyebrow: "Overview",
      title: "Export",
      body: (
        <p>
          The <strong>complete report</strong> as Excel. Very large lists come as a <strong>zip</strong>.
        </p>
      ),
    },
    {
      id: "pages",
      page: "",
      anchor: "report-nav",
      mobileAnchor: "nav-trigger",
      eyebrow: "Getting around",
      title: "Your pages",
      body: (
        <p>
          <strong>{pageList}</strong>. Next, a quick look at each.
        </p>
      ),
    },
    {
      id: "changes",
      page: "changes",
      anchor: "changes-controls",
      eyebrow: "Changes",
      title: "Lines that moved",
      body: (
        <p>
          One card per line. Narrow it by <strong>tab</strong> or <strong>SSP</strong>.
        </p>
      ),
    },
    f.hasDiscovery && {
      id: "discovery",
      page: "discovery",
      anchor: "discovery-kpi",
      eyebrow: "Discovery",
      title: "Who carries your domains",
      body: (
        <p>
          Every matching line on the open web, <strong>newest first</strong>.
        </p>
      ),
    },
    {
      id: "declarations",
      page: "declarations",
      anchor: "declarations-header",
      eyebrow: "Declarations",
      title: "Who names you",
      body: (
        <p>
          Files naming your domain as <strong>partner</strong>, <strong>owner</strong> or <strong>manager</strong>.
        </p>
      ),
    },
    {
      id: "finish",
      page: "",
      anchor: "walkthrough-button",
      eyebrow: "Done",
      title: "All set",
      body: (
        <p>
          Replay anytime from <strong>How this works</strong>.
        </p>
      ),
    },
  ];

  return steps.filter((s): s is ReportTourStep => Boolean(s));
}
