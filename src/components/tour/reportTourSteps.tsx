/**
 * The report walkthrough: what it says, and in what order.
 *
 * Content lives apart from the runner so the copy can be reviewed as copy.
 * The rules are the console tour's (bottomlines-app, productTourSteps.tsx):
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
 * 4. **Only steps this report can show.** Discovery is in the rail only when
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
      title: "Your weekly crawl report",
      body: (
        <p>
          Each week we read the ads.txt and app-ads.txt files of the publishers
          we scan and check which of them carry your seat lines. This page is
          the headline of that crawl, compared with the week before.
        </p>
      ),
    },
    f.trial && {
      id: "trial",
      page: "",
      anchor: "trial-banner",
      eyebrow: "Overview",
      title: "A preview of your report",
      body: (
        <p>
          This report shows the first rows of every list, while the counts
          show everything we found. Unlock Now asks us for the complete report.
        </p>
      ),
    },
    {
      id: "week-changes",
      page: "",
      anchor: "overview-changes",
      eyebrow: "Overview",
      title: "What moved this week",
      body: (
        <p>
          Seat lines publishers added or removed since last week, each compared
          with last week&apos;s own count. The corner counts lines whose
          certification ID changed. A first crawl is the baseline, so the
          comparison starts the week after.
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
          How many publishers and apps carry at least one of your seat lines,
          with the total lines in the corner. The two tiles are also a switch:
          they choose whether the list below shows publishers or apps.
        </p>
      ),
    },
    {
      id: "matched-list",
      page: "",
      anchor: "overview-list",
      eyebrow: "Overview",
      title: "Every match, one row each",
      body: (
        <p>
          One row per publisher, or per app when the Matched apps tile is
          selected. Click a row to see the exact seat lines it carries and what
          moved on it this week.
        </p>
      ),
    },
    f.hasLineFilter && {
      id: "line-filter",
      page: "",
      anchor: "line-filter",
      eyebrow: "Overview",
      title: "Focus on some of your lines",
      body: (
        <p>
          Tick one or more of your seat lines and press Apply. The numbers and
          lists re-read under that selection, and the Changes page follows the
          same filter.
        </p>
      ),
    },
    f.canExport && {
      id: "export",
      page: "",
      anchor: "export",
      eyebrow: "Overview",
      title: "Export the complete report",
      body: (
        <p>
          Downloads this crawl&apos;s full report as an Excel file, ready to
          share or work in. When the apps list is too big for Excel, it comes
          as a zip with that list as a CSV beside the workbook.
        </p>
      ),
    },
    {
      id: "pages",
      page: "",
      anchor: "report-nav",
      mobileAnchor: "nav-trigger",
      eyebrow: "Getting around",
      title: "The pages of your report",
      body: (
        <p>
          {pageList}. Each one answers a different question about the same
          crawl. Next, a quick look at each of them.
        </p>
      ),
    },
    {
      id: "changes",
      page: "changes",
      anchor: "changes-controls",
      eyebrow: "Changes",
      title: "Every line that moved",
      body: (
        <p>
          One card per seat line that publishers added, removed or
          re-certified this week. The tabs pick one kind of change, the search
          narrows to one SSP, and opening a card lists the publishers it moved
          on.
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
          Every line on the open web carrying one of your domains, and how many
          publishers carry it. New lines and the biggest weekly gains come
          first, and Export CSV downloads the list.
        </p>
      ),
    },
    {
      id: "declarations",
      page: "declarations",
      anchor: "declarations-header",
      eyebrow: "Declarations",
      title: "Who names you in their files",
      body: (
        <p>
          A publisher file can name another company as an inventory partner,
          as the owner of the inventory, or as the manager selling it. This
          page lists every file that names your domain, grouped by those three.
        </p>
      ),
    },
    {
      id: "finish",
      page: "",
      anchor: "walkthrough-button",
      eyebrow: "Done",
      title: "That's the walkthrough",
      body: (
        <p>
          You&apos;re back on the overview. Open the walkthrough again any time
          from this button.
        </p>
      ),
    },
  ];

  return steps.filter((s): s is ReportTourStep => Boolean(s));
}
