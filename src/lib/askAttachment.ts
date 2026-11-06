/** Bind an answer's download to the exact upload, including across reattachment. */
export async function attachmentId(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Recognise a short identifier list, while leaving ordinary multiline questions editable. */
export function isPastedList(text: string): boolean {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length >= 5 || text.length > 400) return true;
  if (lines.length < 2) return false;
  const identifier = /^(?:https?:\/\/\S+|[a-z0-9_-]+(?:\.[a-z0-9_-]+)+\/?|\d+|B0[A-Z0-9]{8}|G\d+)$/i;
  const firstCell = (line: string) => line.split(/[,\t]/)[0].trim().replace(/^"|"$/g, "");
  const cells = lines.map(firstCell);
  const header = /^(?:bundle(?: id)?|app(?: id)?|domain|publisher domain|seller(?: id)?|store (?:url|link))$/i;
  return cells.every((cell, i) => identifier.test(cell) || (i === 0 && header.test(cell)));
}

export function matchesAttachment(
  message: { downloadId?: string; downloadFile?: string },
  attachment: { id?: string; name: string; state: string } | null,
): boolean {
  return Boolean(
    attachment?.state === "ready" && message.downloadId &&
    message.downloadId === attachment.id && message.downloadFile === attachment.name,
  );
}
