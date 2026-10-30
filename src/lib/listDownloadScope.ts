export type DownloadStatus = "all" | "added" | "removed" | "changed" | "started" | "stopped" | "unconfirmed" | "inactive";

/** Describe the same status/search/filter scope that the list exporter reads. */
export function listDownloadDescription(noun: string, status: DownloadStatus = "all", query = "", filtered = false): string {
  const scope = status === "changed" ? `all ${noun} with cert changes`
    : status === "started" ? `all ${noun} with lines you started watching`
    : status === "stopped" ? `all ${noun} with lines you stopped watching`
    : status === "unconfirmed" ? `all ${noun} with unconfirmed lines`
    : status === "all" ? `all ${filtered ? "selected" : "matched"} ${noun}`
    : `all ${status} ${noun}`;
  return `Downloads ${scope}${query.trim() ? ` matching “${query.trim()}”` : ""}${filtered ? ", using your filters" : ""}, across all pages (CSV).`;
}
