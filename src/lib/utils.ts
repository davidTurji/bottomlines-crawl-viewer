import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { FileSource } from "./api";

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

/* ── WHICH FILE (2026-10-21) ──────────────────────────────────────────
   The crawler reads an app's app-ads.txt at the host its store listing
   declares (IAB app-ads.txt spec) and credits the app from that file
   only. Every surface that says where a line or an app came from says it
   through these helpers, so the words cannot drift between the overview,
   the Inactive cards and the Changes page. A report frozen before the
   fields existed carries none of them and every helper returns null. */

/** A host as it reads: no scheme, path, port or leading "www.". */
function plainHost(domain: string | null | undefined): string {
  return (domain ?? "")
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

/** True when the two name the same host. */
export function sameHost(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = plainHost(a);
  return x !== "" && x === plainHost(b);
}

/**
 * "at ftmj.fortunemo.com": where a seat line's file is, when it is a
 * declared host's file and not the publisher's own. Nothing when the line
 * carries no host or the host is the publisher's domain.
 */
export function lineHostLabel(
  host: string | null | undefined,
  publisherDomain: string | null | undefined,
): string | null {
  const h = (host ?? "").trim();
  if (!h || sameHost(h, publisherDomain)) return null;
  return `at ${h}`;
}

/** "Files at: a.example.com, b.example.com", or null with no hosts. */
export function fileHostsLabel(hosts: string[] | null | undefined): string | null {
  const named = (hosts ?? []).map((h) => h.trim()).filter(Boolean);
  if (named.length === 0) return null;
  return `Files at: ${named.join(", ")}`;
}

/** The plain words for each FileSource, exactly these (2026-10-21). */
export function fileSourceLabel(source: FileSource | string | null | undefined): string | null {
  switch (source) {
    case "own_domain":
      return "the publisher's app-ads.txt";
    case "host":
      return "its host's app-ads.txt";
    case "parent_no_file":
      return "the publisher's app-ads.txt (host has no file)";
    case "parent_host_unread":
      return "the publisher's app-ads.txt (host not read yet)";
    case "no_website":
      return "no website in the store listing";
    default:
      return null;
  }
}

/**
 * The quiet line under an app: "File: ftmj.fortunemo.com, its host's
 * app-ads.txt". An app whose store listing names no website is credited
 * with nothing, and says so without a host. Null on a report frozen
 * before the fields existed.
 */
export function appFileLine(
  host: string | null | undefined,
  source: FileSource | string | null | undefined,
): string | null {
  if (source === "no_website")
    return "No website in the store listing: no file applies";
  const label = fileSourceLabel(source);
  if (!label) return null;
  const h = (host ?? "").trim();
  return h ? `File: ${h}, ${label}` : `File: ${label}`;
}

/**
 * Why a line is newly monitored or no longer monitored, in plain words.
 * "host first read": the file at this host was read for the first time
 * this crawl, so its lines are newly monitored, not added. "host not
 * read": the file was not read this crawl, so its lines are no longer
 * monitored, not removed. Null (a watchlist change) prints nothing; any
 * other sentence the crawler sends prints as it is.
 */
export function scopeReasonText(reason: string | null | undefined): string | null {
  const raw = (reason ?? "").trim();
  if (!raw) return null;
  if (raw === "host first read") return "first read of this file this crawl";
  if (raw === "host not read") return "this file was not read this crawl";
  return raw;
}
