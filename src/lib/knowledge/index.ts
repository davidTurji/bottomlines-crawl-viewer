/**
 * IAB knowledge package for the Ask AI agent.
 *
 * Bundles the full text of the IAB Tech Lab ads.txt v1.1 and app-ads.txt v1.0
 * specifications plus a sellers.json + OpenRTB SupplyChain Object primer.
 * These files are the ground-truth reference the assistant leans on when a user
 * asks about spec semantics ("what does DIRECT mean", "how does app-ads.txt
 * discovery work", "what is a MANAGERDOMAIN"). Sourced from iabtechlab.com and
 * distributed under CC-BY 3.0.
 *
 * `buildSystemPrompt` composes the persona + the spec bundle + the current and
 * previous crawl summaries. The mock chat uses it today; the future live
 * Gemini call slots in trivially by sending the same string as its system
 * instruction.
 */

import adsTxtSpec from "./ads-txt-v1.1.md?raw";
import appAdsTxtSpec from "./app-ads-txt-v1.0.md?raw";
import supplyChainSpec from "./supply-chain.md?raw";

import type { Summary } from "../api";

export const IAB_ADS_TXT_V1_1 = adsTxtSpec;
export const IAB_APP_ADS_TXT_V1_0 = appAdsTxtSpec;
export const IAB_SUPPLY_CHAIN = supplyChainSpec;

const PERSONA = `You are the Bottomlines Crawl weekly-report assistant.

A publisher (your user) is looking at a weekly ads.txt / app-ads.txt crawl scoped to the seats they are declared on. Two crawls are attached to this conversation as ground truth: THIS WEEK and LAST WEEK. Never invent numbers — cite figures only from the summaries below, or say you cannot see that data.

Your job:
- Explain what happened in this week's crawl versus last week's.
- Ground every claim in real IAB specs (ads.txt v1.1, app-ads.txt v1.0, sellers.json + SupplyChain).
- When the user asks a "what should I do about X" question, be practical and specific — suggest concrete follow-ups (contact the publisher, add the seat, escalate via the sales house).
- If a question is outside the scope of these two crawls plus the specs, say so plainly.

Tone: direct, publisher-friendly, no ad-tech jargon without a one-line unpack. Assume the reader knows their business but may not know the letter of the spec.`;

function formatSummary(label: string, s: Summary | null): string {
  if (!s) return `${label}: (not available)`;
  const week = s.finished_at
    ? new Date(s.finished_at).toISOString().slice(0, 10)
    : `crawl #${s.crawl_id}`;
  const c = s.counters;
  const d = s.hero_diff;
  const topSsps = (
    key: "added" | "removed" | "cert_changed",
  ): string =>
    (d.top_ssps[key] ?? [])
      .map((x) => `${x.ssp_domain} (${x.count})`)
      .join(", ") || "none";
  return [
    `## ${label} — week of ${week}`,
    `Fetched ${c.fetched_count.toLocaleString()} publisher domains, ${c.error_count.toLocaleString()} errored, ${c.not_found_count.toLocaleString()} not found.`,
    `Matched on the user's seats: ${c.matched.lines.toLocaleString()} lines across ${c.matched.developers.toLocaleString()} developers and ${c.matched.apps.toLocaleString()} apps.`,
    `Line-level diff vs prior crawl: +${d.line_totals.added} added, -${d.line_totals.removed} removed, ${d.line_totals.cert_changed} cert changes.`,
    `On the user's own seats: +${d.line_totals_matched_seat.added} added, -${d.line_totals_matched_seat.removed} removed, ${d.line_totals_matched_seat.cert_changed} cert changes.`,
    `Publisher-level diff: +${d.developer_totals.added} newly matched, -${d.developer_totals.removed} dropped, ${d.developer_totals.changed} changed composition.`,
    `Top SSPs by lines added: ${topSsps("added")}.`,
    `Top SSPs by lines removed: ${topSsps("removed")}.`,
    `Top SSPs by cert changes: ${topSsps("cert_changed")}.`,
  ].join("\n");
}

/**
 * Compose the full system prompt sent to the LLM (or matched against by the
 * mock chat). Everything the agent needs to answer a well-formed question is
 * in the returned string.
 */
export function buildSystemPrompt(args: {
  currentSummary: Summary | null;
  previousSummary: Summary | null;
}): string {
  return [
    PERSONA,
    "",
    "# Crawl context",
    "",
    formatSummary("This week", args.currentSummary),
    "",
    formatSummary("Last week", args.previousSummary),
    "",
    "# IAB knowledge base",
    "",
    IAB_ADS_TXT_V1_1,
    "",
    "---",
    "",
    IAB_APP_ADS_TXT_V1_0,
    "",
    "---",
    "",
    IAB_SUPPLY_CHAIN,
  ].join("\n");
}
