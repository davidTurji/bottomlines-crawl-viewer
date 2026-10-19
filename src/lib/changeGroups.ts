import type {
  LineEvent,
  LineEventKind,
  ChangeFilters,
  ChangeGroupsPage,
  TrialSlice,
} from "./api";

export type LocalChangeGroup = {
  key: string;
  event: LineEventKind;
  /** Earliest known sighting of this line, across its publishers. */
  first_seen_at: string | null;
  ssp_domain: string;
  publisher_id: string;
  relationship: string;
  old_cert_id: string | null;
  new_cert_id: string | null;
  /** How the line was tied to its developer. Absent on old data is "file",
   *  which is also the case that gets no chip. */
  matched_via: "file" | "ipd" | "subdomain";
  /** Domains whose files vouched for this line's developer as their
   *  inventory partner. Non-empty even on "file" matches sometimes. */
  ipd_declared_by: string[];
  publishers: LineEvent[];
};

function eventKind(raw: string): LineEventKind {
  if (raw === "added") return "added";
  if (raw === "removed") return "removed";
  if (raw === "newly_monitored") return "newly_monitored";
  if (raw === "monitoring_stopped") return "monitoring_stopped";
  if (raw === "first_appearance") return "first_appearance";
  return "cert_changed";
}

export function groupByLine(rows: LineEvent[]): LocalChangeGroup[] {
  const byKey = new Map<string, LocalChangeGroup>();
  for (const r of rows) {
    const event = eventKind(r.event);
    const key = [
      event,
      r.ssp_domain,
      r.publisher_id,
      r.relationship,
      r.old_cert_id ?? "",
      r.new_cert_id ?? "",
    ].join("|");
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        event,
        ssp_domain: r.ssp_domain,
        publisher_id: r.publisher_id,
        relationship: r.relationship,
        old_cert_id: r.old_cert_id,
        new_cert_id: r.new_cert_id,
        first_seen_at: r.first_seen_at ?? null,
        matched_via: r.matched_via ?? "file",
        ipd_declared_by: r.ipd_declared_by ?? [],
        publishers: [],
      };
      byKey.set(key, g);
    }
    // The EARLIEST sighting across the line's publishers. The card speaks
    // for the whole line, so "already live since" has to be the date the
    // line was first seen anywhere, not on whichever publisher happened to
    // sort first.
    if (
      r.first_seen_at &&
      (!g.first_seen_at || r.first_seen_at < g.first_seen_at)
    ) {
      g.first_seen_at = r.first_seen_at;
    }
    // Same idea for provenance: the card speaks for the line, so if ANY of
    // its rows arrived via a declaration, the chip says so, and the first
    // roster that names declarers wins over an empty one.
    if (g.matched_via === "file" && r.matched_via && r.matched_via !== "file") {
      g.matched_via = r.matched_via;
    }
    if (g.ipd_declared_by.length === 0 && r.ipd_declared_by?.length) {
      g.ipd_declared_by = r.ipd_declared_by;
    }
    g.publishers.push(r);
  }
  return [...byKey.values()];
}

/** Widest change first, then a stable alphabetical tiebreak. */
export function sortBucket(groups: LocalChangeGroup[]): LocalChangeGroup[] {
  return [...groups].sort(
    (a, b) =>
      b.publishers.length - a.publishers.length ||
      a.ssp_domain.localeCompare(b.ssp_domain) ||
      a.publisher_id.localeCompare(b.publisher_id),
  );
}

/**
 * Weave the three buckets together in proportion.
 *
 * The endpoint returns its rows grouped by event, so a naive All tab is a
 * run of added cards, then a run of removed cards, then the cert changes,
 * and a reader who never scrolls past the first screen concludes that
 * nothing was removed. Giving every card a position of (index + 0.5) /
 * bucket size and sorting on it spreads each bucket evenly across the whole
 * list, so any window of cards holds roughly the week's real mix.
 */
export function interleave(groups: LocalChangeGroup[]): LocalChangeGroup[] {
  // Scope kinds sort last: they are context for the week, not its news.
  const order: LineEventKind[] = [
    "added",
    "removed",
    "cert_changed",
    "newly_monitored",
    "monitoring_stopped",
    "first_appearance",
  ];
  const placed: { g: LocalChangeGroup; pos: number; rank: number }[] = [];
  order.forEach((event, rank) => {
    const bucket = sortBucket(groups.filter((g) => g.event === event));
    bucket.forEach((g, i) => {
      placed.push({ g, pos: (i + 0.5) / bucket.length, rank });
    });
  });
  placed.sort((a, b) => a.pos - b.pos || a.rank - b.rank);
  return placed.map((p) => p.g);
}

const CHANGE_EVENTS: LineEventKind[] = [
  "added",
  "removed",
  "cert_changed",
  "newly_monitored",
  "monitoring_stopped",
  "first_appearance",
];
const changeKind = eventKind;
const PAGE_SIZE = 25;
export function pageChangeGroups(
  rows: LineEvent[],
  filters: ChangeFilters,
  trial: TrialSlice | null = null,
): ChangeGroupsPage {
  const groups = groupByLine(rows);
  const selected = filters.event
    ? sortBucket(groups.filter((g) => g.event === filters.event))
    : interleave(groups);
  const chosen = selected.flatMap((g) => g.publishers);
  const byEvent = Object.fromEntries(
    CHANGE_EVENTS.map((e) => [
      e,
      chosen.filter((r) => changeKind(r.event) === e).length,
    ]),
  ) as Record<LineEventKind, number>;
  const counts = Object.fromEntries(
    CHANGE_EVENTS.map((e) => [e, groups.filter((g) => g.event === e).length]),
  ) as Record<LineEventKind, number>;
  const page = filters.page ?? 1,
    size = filters.page_size ?? PAGE_SIZE;
  return {
    page,
    page_size: size,
    total: selected.length,
    counts,
    rows: selected
      .slice((page - 1) * size, page * size)
      .map(({ publishers, ...g }) => ({
        ...g,
        publisher_count: publishers.length,
      })),
    kpi: {
      lines: selected.length,
      placements: chosen.length,
      byEvent,
      publishers: new Set(
        chosen.map((r) => r.developer_domain ?? String(r.developer_id)),
      ).size,
      apps: new Set(
        chosen
          .filter(
            (r) =>
              r.file_kind.toLowerCase().replace(/[^a-z]/g, "") === "appadstxt",
          )
          .map((r) => r.developer_domain ?? String(r.developer_id)),
      ).size,
    },
    trial,
  };
}
