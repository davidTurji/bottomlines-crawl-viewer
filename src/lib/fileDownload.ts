/** Let the browser start the file handoff before releasing its local URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari starts the download after the click returns: let it go first.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
