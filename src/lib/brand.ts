// Single source of truth for the PathFinder logo asset, so the mark can be
// swapped in one place later.
//
// NOTE: the current file is a WIDE LOCKUP (the green "b" pathfinder mark on
// the left, then a mostly-white "bottomlines.Pathfinder" wordmark that is
// invisible on a light ground). Callers that want just the mark render it in
// a fixed overflow-hidden box clipped to the mark's left edge, and pair it
// with a real "PathFinder" text wordmark. Drop a square, mark-only asset in
// here later and the clip box still frames it.
import pathfinderLogo from "@/assets/pathfinder.png";

export { pathfinderLogo };
