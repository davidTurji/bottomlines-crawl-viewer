/** Use a native download frame: signed redirects can serve very large files
 * without buffering them in JavaScript or requiring storage CORS. API refusals
 * stay on the report, where the reader can see and retry them. Never retry a
 * metered report download automatically. */
export function requestReportDownload(url: string, onError: (message: string) => void): () => void {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "Report download";
  frame.onload = () => {
    try {
      const doc = frame.contentDocument;
      if (!doc || doc.URL === "about:blank") return;
      const text = doc.body?.textContent?.trim() ?? "";
      let detail: unknown;
      try { detail = JSON.parse(text).detail; } catch { /* an unexpected HTML error */ }
      onError(typeof detail === "string" && detail.trim()
        ? detail.slice(0, 600)
        : "The report could not be downloaded. Please try again, or refresh to sign in again.");
    } catch {
      // A signed cross-origin attachment is handled by the browser. Its
      // document is intentionally inaccessible; don't fetch it a second time.
    }
  };
  frame.onerror = () => onError("The download could not start. Check your connection and try again.");
  frame.src = url;
  document.body.appendChild(frame);
  return () => frame.remove();
}
