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

const PLATFORM_ICON = { CTV: Tv, Mobile: Smartphone, Web: Globe } as const;

/**
 * THE PLATFORM BADGE (David, 2026-11-01): every app wears its platform,
 * CTV or Mobile, filled in the platform's colour like the IPD badge, so a
 * reader sees at a glance what kind of app it is. Only apps: a publisher
 * never has a platform.
 */
export function PlatformBadge({ row, inactive = false }: { row: { platform?: unknown; store?: string | null }; inactive?: boolean }) {
  const platform = appPlatformOf(row);
  if (!platform) return null;
  const Icon = PLATFORM_ICON[platform];
  return (
    <span data-app-platform={platform.toLowerCase()} data-inactive={inactive || undefined} className="platform-badge" title={`Platform: ${platform}`}>
      <Icon aria-hidden className="h-3 w-3" />
      {platform}
    </span>
  );
}
