import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * The store code the crawler speaks, rendered to a name a reader knows.
 * Shared by the Discovery page's app placements and the overview's matched
 * apps list so both spell a store the same way.
 */
export function storeLabel(store?: string): string {
  switch ((store ?? "").toLowerCase()) {
    case "ios":
      return "iOS";
    case "android":
      return "Android";
    case "roku":
      return "Roku";
    case "samsung":
      return "Samsung";
    case "vizio":
      return "Vizio";
    case "firetv":
      return "Fire TV";
    case "ctv":
      return "CTV";
    default:
      return store || "app";
  }
}


/**
 * "Found in app-ads.txt", said the same way everywhere a matched line is
 * shown (David, 2026-09-26).
 *
 * Three surfaces print a line that came out of a file: the publisher
 * drilldown, the per-publisher rows under a change, and the placements
 * under a discovered line. Each had its own bare filename in grey, which
 * left the reader to work out what the filename was doing there. One
 * sentence, one helper, and the phrase cannot drift between the three.
 *
 * "both" is the deduped case: ads.txt and app-ads.txt agreeing is one
 * fact wearing one row, so it reads as the pair rather than as a word the
 * reader has to expand.
 */
export function foundInLabel(found: string | null | undefined): string | null {
  const raw = (found ?? "").trim();
  if (!raw) return null;
  return `Found in ${raw === "both" ? "ads.txt + app-ads.txt" : raw}`;
}
