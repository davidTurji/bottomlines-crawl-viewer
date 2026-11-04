import { Globe, Smartphone, Tv } from "lucide-react";

import { storeName } from "@/lib/utils";

/** Consistent platform metadata; the report's own store label takes precedence. */
export function StoreBadge({ row, inactive = false }: { row: { store?: string | null; store_label?: unknown }; inactive?: boolean }) {
  const label = storeName(row);
  return <span data-store-badge data-platform={row.store?.trim().toLowerCase() || "unknown"} data-inactive={inactive || undefined} className="store-badge" title={`Platform: ${label}`}>{label}</span>;
}

/** The crawler's store map (domain/platforms.py STORE_PLATFORM), read only
 *  when the API did not send the app's platform (one from before it). */
const STORE_PLATFORM: Record<string, "CTV" | "Mobile"> = {
  ios: "Mobile", android: "Mobile",
  googleplay: "CTV", tvos: "CTV", roku: "CTV", firetv: "CTV", samsung: "CTV", lg: "CTV", vizio: "CTV",
};

export type AppPlatform = "CTV" | "Mobile" | "Web";

/** An app's platform: the one the crawler sent (its Platform filter's
 *  rule), else by its store; null for a store neither knows. */
export function appPlatformOf(row: { platform?: unknown; store?: string | null }): AppPlatform | null {
  const sent = typeof row.platform === "string" ? row.platform.trim().toLowerCase() : null;
  if (sent !== null) return sent === "ctv" ? "CTV" : sent === "mobile" ? "Mobile" : sent === "web" ? "Web" : null;
  const store = String(row.store ?? "").trim().toLowerCase();
  return store === "website" ? "Web" : STORE_PLATFORM[store] ?? null;
}

/**
 * THE PLATFORM BADGE (David, 2026-11-01): every app wears its platform,
 * CTV or Mobile, so a reader sees at a glance what kind of app it is. Only
 * apps: a publisher never has a platform.
 *
 * Soft, not filled (David, 2026-11-02: "too violent and too big"): the
 * system's own tone wash with its ink, square like IPD, no icon (the row's
 * round icon already draws the TV or the phone). The filled navy stays
 * IPD's alone, so the one badge that is a match fact still stands out.
 */
/** The badge's small icon: a phone, a TV, a globe. */
const PLATFORM_ICON = { Mobile: Smartphone, CTV: Tv, Web: Globe } as const;

/**
 * THE PLATFORM BADGE (David, 2026-11-04: "full background, more premium").
 * A solid chip in the platform's colour with white text and a small icon,
 * the same shape as the IPD badge beside it: Mobile deep teal, CTV deep
 * plum, Web slate.
 */
export function PlatformBadge({ row, inactive = false }: { row: { platform?: unknown; store?: string | null }; inactive?: boolean }) {
  const platform = appPlatformOf(row);
  if (!platform) return null;
  const Icon = PLATFORM_ICON[platform as keyof typeof PLATFORM_ICON];
  return (
    <span data-app-platform={platform.toLowerCase()} data-inactive={inactive || undefined} className="platform-badge" title={`Platform: ${platform}`}>
      {Icon && <Icon aria-hidden className="platform-badge-icon" strokeWidth={2.25} />}
      {platform}
    </span>
  );
}

/**
 * The app's store, said in words on the line under its name ("On Apple
 * TV"): a detail of the platform badge beside the name, so plain text,
 * never a second badge. Null for a website row (its Web badge says it
 * all), and for a store the report names only by a platform word ("CTV")
 * or not at all: the badge already says that much.
 */
export function storeHint(row: { store?: string | null; store_label?: unknown }): string | null {
  const store = String(row.store ?? "").trim().toLowerCase();
  if (!store || store === "website") return null;
  const label = storeName(row).trim();
  return label && !["app", "ctv", "mobile", "unknown"].includes(label.toLowerCase()) ? label : null;
}
