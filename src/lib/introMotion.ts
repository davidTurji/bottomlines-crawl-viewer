/**
 * INTRO MOTION PLAYS ONCE, on the first page the reader opens.
 *
 * The count-ups, the change lines rising in and the rows settling are a
 * welcome, not a ritual: seen once they have done their job, and replayed
 * on every page move they get in the way (David, 2026-10-05). So they play
 * on the page the browser first opened (and again after a refresh, which
 * is a fresh open), and from the first move to another page on, every
 * figure and row simply shows. Going back to the first page does not
 * replay it either. In memory only: nothing is stored.
 */
let firstPath: string | null = null;
let moved = false;

export function introMotion(): boolean {
  if (moved) return false;
  // The line filter lives in the query string: changing it is a move too,
  // or every filter click would count the figures up from 0 again.
  const path =
    typeof window === "undefined" ? "" : window.location.pathname + window.location.search;
  if (firstPath === null) firstPath = path;
  if (path !== firstPath) moved = true;
  return !moved;
}
