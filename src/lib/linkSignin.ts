/**
 * The weekly email's button signs the reader in (David, 2026-10-04).
 *
 * Its link carries `#signin=<base64url("username:password")>`. The part
 * of a link after `#` is never sent to a server: not to ours, not to a log,
 * not to the link scanner a mail provider runs on every button. It is read
 * once, the moment the app loads, and wiped from the address bar and from
 * the history entry before anything renders, so it never sits in the URL
 * bar, a bookmark, or a link the reader copies and shares.
 *
 * The username and password are the ones the same email shows in plain
 * text; the link adds no new secret, it only saves the typing.
 */

export interface LinkSignin {
  username: string;
  password: string;
}

let pending: LinkSignin | null = null;

function decode(value: string): LinkSignin | null {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    const colon = text.indexOf(":");
    if (colon <= 0 || colon === text.length - 1) return null;
    return { username: text.slice(0, colon), password: text.slice(colon + 1) };
  } catch {
    return null;
  }
}

/** Read the sign-in off the address and wipe it. Called once, before the
 *  first render (main.tsx). Anything else after `#` is kept as it was. */
export function captureLinkSignin(): void {
  if (typeof window === "undefined") return;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return;
  const params = new URLSearchParams(hash);
  const raw = params.get("signin");
  if (raw === null) return;
  pending = decode(raw);
  params.delete("signin");
  const rest = params.toString();
  const clean = window.location.pathname + window.location.search + (rest ? `#${rest}` : "");
  window.history.replaceState(window.history.state, "", clean);
}

/** The captured sign-in, or null. */
export function peekLinkSignin(): LinkSignin | null {
  return pending;
}

export function hasLinkSignin(): boolean {
  return pending !== null;
}

let attempt: Promise<void> | null = null;

/** Sign in with the captured credentials exactly once, however many times
 *  a component's effect runs (React's development double run included).
 *  Null when the link carried none. */
export function signInFromLink(run: (c: LinkSignin) => Promise<void>): Promise<void> | null {
  if (!pending) return null;
  if (!attempt) attempt = run(pending);
  return attempt;
}
