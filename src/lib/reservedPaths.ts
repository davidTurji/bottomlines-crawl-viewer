/**
 * First URL segments that must never be read as a customer slug.
 *
 * /:slug/:shortId is the readable report shape, and it is greedy: any
 * two-segment path that is not a more specific route lands on it. That is
 * fine for /selectmedia/0904-0644, and wrong for /assets/index-abc123.js,
 * which is a real file the SPA fallback only reaches when the file is
 * missing. Without this list a missing asset would fire a resolve call
 * against the crawler API and then render the report shell.
 *
 * The list is an audit of everything served at a first segment:
 *
 *   api            nginx.conf.template `location /api/` reverse proxy
 *   assets         nginx.conf.template `location /assets/`, i.e. every
 *                  hashed Vite chunk in dist/assets plus dist/assets/images
 *   crawl-report   the tokened route in main.tsx, which must keep its own
 *                  not-found behaviour rather than being resolved as a slug
 *   index.html     the SPA shell itself
 *   static         conventional static mount, reserved ahead of need
 *   favicon.ico    browsers request it unprompted at the root
 *   favicon.png    what index.html actually links (via /assets/images)
 *   robots.txt     crawler convention, requested unprompted
 *   sitemap.xml    crawler convention, requested unprompted
 *   health         health probe conventions, reserved so a probe can be
 *   healthz        added to nginx later without breaking the router
 *   .well-known    RFC 8615 path, requested by browsers and ACME clients
 *   manifest.json  PWA manifest convention
 *   sw.js          service worker convention
 *
 * Compared case-insensitively; a reserved first segment falls through to
 * the catch-all instead of attempting a resolve.
 */
export const RESERVED_FIRST_SEGMENTS: ReadonlySet<string> = new Set([
  "api",
  "assets",
  "crawl-report",
  "index.html",
  "static",
  "favicon.ico",
  "favicon.png",
  "robots.txt",
  "sitemap.xml",
  "health",
  "healthz",
  ".well-known",
  "manifest.json",
  "sw.js",
]);

/** True when this first segment is an app path, not a customer slug. */
export function isReservedFirstSegment(segment: string): boolean {
  return RESERVED_FIRST_SEGMENTS.has(segment.trim().toLowerCase());
}
