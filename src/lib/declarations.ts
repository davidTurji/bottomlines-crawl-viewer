/**
 * DECLARATIONS, NORMALISED.
 *
 * The declarations endpoint has answered in two shapes over the product's
 * life, and links minted under either must keep opening:
 *
 *   - customer reports (2026-09 onward) freeze the Excel sheet's rows:
 *     `{ rows: [{declaration, declared_domain, declared_by, country,
 *     found_in}], total }`. Three kinds of declaration, flat.
 *   - older run-wide reports froze a grouped payload: `{ totals, ipd,
 *     owner_claims, relationship_mismatches }`, capped at 50 declarers per
 *     subject.
 *
 * The page and the sidebar read ONE shape, built here. Everything is
 * grouped by kind, then by the declared domain (the subject), with every
 * file that named it underneath. A payload of neither shape, or nothing at
 * all, normalises to "no declarations" rather than throwing: an older
 * report simply has no tab.
 */

import { foundInLabel } from "./utils";
import type {
  TrialSlice,
  DeclarationRow,
  Declarations,
  DeclarationsPayload,
  RelationshipMismatch,
} from "./api";

/** The three ads.txt variables that name another company, in page order. */
export const DECLARATION_KINDS = [
  "inventory partner",
  "owner domain",
  "manager domain",
] as const;
export type DeclarationKind = (typeof DECLARATION_KINDS)[number];

/** What each kind means, in the customer's terms. */
export const KIND_COPY: Record<
  DeclarationKind,
  { title: string; variable: string; blurb: string; noun: string }
> = {
  "inventory partner": {
    title: "Inventory partners",
    variable: "INVENTORYPARTNERDOMAIN",
    blurb:
      "Domains a publisher file names as a partner selling inventory on its behalf. A file vouching for another domain's supply.",
    noun: "inventory partner",
  },
  "owner domain": {
    title: "Owner domains",
    variable: "OWNERDOMAIN",
    blurb:
      "Domains a publisher file names as the business that owns the inventory.",
    noun: "owner domain",
  },
  "manager domain": {
    title: "Manager domains",
    variable: "MANAGERDOMAIN",
    blurb:
      "Domains a publisher file names as the sales house monetising it, sometimes scoped to one country.",
    noun: "manager domain",
  },
};

/**
 * One publisher that made a declaration. ONE PER PUBLISHER, whichever of
 * its files said it: a publisher naming you in both ads.txt and app-ads.txt
 * made one declaration in two places, not two declarations, so the rows
 * the sheet carries per file are merged here and the files listed.
 */
export type Declarer = {
  domain: string;
  /** Which of the publisher's files said it, in ads.txt, app-ads.txt order. */
  files: string[];
  /** Display-ready, the overview's wording: "Found in ads.txt",
   *  "Found in app-ads.txt" or "Found in ads.txt + app-ads.txt". */
  found_in: string;
  /** ISO 3166-1 alpha-2 for a country-scoped manager domain, joined with
   *  ", " when the files scope it to more than one; else "". */
  country: string;
  /** Not named by this publisher last week. False when the report does not
   *  say (see `NormalizedDeclarations.new_total`). */
  is_new: boolean;
};

/** One declared domain and everyone who declared it. */
export type DeclarationSubject = {
  kind: DeclarationKind;
  domain: string;
  declarers: Declarer[];
  /** Publishers that named it, the honest count; `declarers` may be capped
   *  on the legacy shape. */
  total: number;
  /** How many of those publishers said it in each file. A publisher saying
   *  it in both counts in both, so these two can add up past `total`. */
  ads_txt: number;
  app_ads_txt: number;
  /** Publishers naming it this week that did not last week. */
  new_count: number;
  /** Nobody named it last week: the whole domain is new. */
  is_new: boolean;
  /** Distinct countries named, manager domains only. */
  countries: string[];
};

export type DeclarationSection = {
  kind: DeclarationKind;
  subjects: DeclarationSubject[];
  /** Declarations, one per publisher per declared domain. */
  declarations: number;
  /** Of those, the ones new this week. */
  new_declarations: number;
};

export type NormalizedDeclarations = {
  /** Every declaration counted once. Zero hides the sidebar entry. */
  total: number;
  /** Declarations new this week, or null when the report does not say
   *  (older reports, and every live one until the crawler marks rows):
   *  the page then shows no "new" anywhere rather than a false zero. */
  new_total: number | null;
  sections: DeclarationSection[];
  /** Only the legacy grouped shape carries these. */
  mismatches: RelationshipMismatch[];
  /** True when the payload was the capped legacy shape. */
  legacy: boolean;
  /** Present on a trial report: the rows were cut (see ``TrialSlice``). */
  trial?: TrialSlice | null;
};

export const EMPTY_DECLARATIONS: NormalizedDeclarations = {
  total: 0,
  new_total: null,
  sections: DECLARATION_KINDS.map((kind) => ({
    kind, subjects: [], declarations: 0, new_declarations: 0,
  })),
  mismatches: [],
  legacy: false,
};

function fileLabelOf(value: string | undefined | null): string {
  const k = String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (k === "appadstxt") return "app-ads.txt";
  if (k === "adstxt") return "ads.txt";
  return String(value ?? "");
}

function kindOf(value: string | undefined | null): DeclarationKind | null {
  const k = String(value ?? "").trim().toLowerCase();
  if (k === "inventory partner" || k === "ipd" || k === "inventorypartnerdomain") {
    return "inventory partner";
  }
  if (k === "owner domain" || k === "ownerdomain" || k === "owner") return "owner domain";
  if (k === "manager domain" || k === "managerdomain" || k === "manager") {
    return "manager domain";
  }
  return null;
}

function sortSubjects(subjects: DeclarationSubject[]): DeclarationSubject[] {
  return subjects.sort(
    (a, b) => b.total - a.total || a.domain.localeCompare(b.domain),
  );
}

/** One file's raw row, before publishers are merged. */
type RawDeclarer = { domain: string; file: string; country: string; is_new: boolean };

const FILE_ORDER = ["ads.txt", "app-ads.txt"];

/** The overview's wording: "Found in ads.txt + app-ads.txt", or one file. */
function foundInText(files: string[]): string {
  return foundInLabel(files.length > 1 ? "both" : files[0]) ?? "";
}

/** One Declarer per publisher, the publisher's rows merged. */
function mergeDeclarers(raw: RawDeclarer[]): Declarer[] {
  const by = new Map<string, { files: Set<string>; countries: Set<string>; is_new: boolean }>();
  for (const r of raw) {
    let d = by.get(r.domain);
    if (!d) {
      d = { files: new Set(), countries: new Set(), is_new: true };
      by.set(r.domain, d);
    }
    if (r.file) d.files.add(r.file);
    if (r.country) d.countries.add(r.country);
    // New only if every file's row is new: a publisher that already named
    // you in ads.txt and now also does in app-ads.txt is not a new name.
    d.is_new = d.is_new && r.is_new;
  }
  const out = Array.from(by, ([domain, d]) => {
    const files = Array.from(d.files).sort(
      (a, b) => FILE_ORDER.indexOf(a) - FILE_ORDER.indexOf(b),
    );
    return {
      domain,
      files,
      found_in: foundInText(files),
      country: Array.from(d.countries).sort().join(", "),
      is_new: d.is_new,
    };
  });
  // New names first: they are what a weekly reader came to see.
  return out.sort((a, b) => Number(b.is_new) - Number(a.is_new));
}

function finish(
  kind: DeclarationKind,
  domain: string,
  raw: RawDeclarer[],
  /** Legacy only: the server's row count when `raw` was capped. */
  rowTotal?: number,
): DeclarationSubject {
  const declarers = mergeDeclarers(raw);
  const countries = Array.from(
    new Set(raw.map((d) => d.country).filter(Boolean)),
  ).sort();
  // A capped legacy roster: the rows not shown cannot be merged, so the
  // count drops only by the doubles actually seen.
  const total = rowTotal != null
    ? Math.max(declarers.length, rowTotal - (raw.length - declarers.length))
    : declarers.length;
  const new_count = declarers.filter((d) => d.is_new).length;
  return {
    kind,
    domain,
    declarers,
    total,
    ads_txt: declarers.filter((d) => d.files.includes("ads.txt")).length,
    app_ads_txt: declarers.filter((d) => d.files.includes("app-ads.txt")).length,
    countries,
    new_count,
    is_new: declarers.length > 0 && new_count === declarers.length,
  };
}

function sectionOf(kind: DeclarationKind, subjects: DeclarationSubject[]): DeclarationSection {
  return {
    kind,
    subjects: sortSubjects(subjects),
    declarations: subjects.reduce((n, s) => n + s.total, 0),
    new_declarations: subjects.reduce((n, s) => n + s.new_count, 0),
  };
}

function fromRows(rows: DeclarationRow[]): NormalizedDeclarations {
  const byKind = new Map<DeclarationKind, Map<string, RawDeclarer[]>>();
  // Whether the report marks new rows at all. A report that never says
  // shows no "new" anywhere; a false "0 new" would read as a quiet week.
  let marked = false;
  for (const row of rows) {
    const kind = kindOf(row?.declaration);
    const domain = String(row?.declared_domain ?? "").trim().toLowerCase();
    const by = String(row?.declared_by ?? "").trim().toLowerCase();
    if (!kind || !domain || !by) continue;
    if (typeof row.is_new === "boolean") marked = true;
    let subjects = byKind.get(kind);
    if (!subjects) {
      subjects = new Map();
      byKind.set(kind, subjects);
    }
    let raw = subjects.get(domain);
    if (!raw) {
      raw = [];
      subjects.set(domain, raw);
    }
    raw.push({
      domain: by,
      file: fileLabelOf(row.found_in),
      country: String(row.country ?? "").trim().toUpperCase(),
      is_new: row.is_new === true,
    });
  }
  const sections = DECLARATION_KINDS.map((kind) =>
    sectionOf(
      kind,
      Array.from(byKind.get(kind) ?? [], ([domain, raw]) => finish(kind, domain, raw)),
    ),
  );
  return {
    total: sections.reduce((n, s) => n + s.declarations, 0),
    new_total: marked ? sections.reduce((n, s) => n + s.new_declarations, 0) : null,
    legacy: false,
    mismatches: [],
    sections,
  };
}

function fromLegacy(d: Declarations): NormalizedDeclarations {
  const rawOf = (sources: { domain: string; file_kind: string }[] | undefined) =>
    (sources ?? []).map((src) => ({
      domain: src.domain, file: fileLabelOf(src.file_kind), country: "", is_new: false,
    }));
  const ipd = (d.ipd ?? []).map((p) =>
    finish(
      "inventory partner",
      p.partner_domain,
      rawOf(p.declared_by),
      p.declarer_total ?? (p.declared_by ?? []).length,
    ),
  );
  const owners = (d.owner_claims ?? []).map((c) =>
    finish(
      "owner domain",
      c.owner_domain,
      rawOf(c.claimed_by),
      c.claimant_total ?? (c.claimed_by ?? []).length,
    ),
  );
  const sections: DeclarationSection[] = [
    sectionOf("inventory partner", ipd),
    sectionOf("owner domain", owners),
    sectionOf("manager domain", []),
  ];
  const mismatches = d.relationship_mismatches ?? [];
  return {
    total: sections.reduce((n, s) => n + s.declarations, 0) + mismatches.length,
    new_total: null,
    sections,
    mismatches,
    legacy: true,
  };
}

/** Whatever the endpoint answered, as the one shape the page reads. */
export function normalizeDeclarations(
  payload: DeclarationsPayload | null | undefined,
): NormalizedDeclarations {
  if (!payload || typeof payload !== "object") return EMPTY_DECLARATIONS;
  if (Array.isArray((payload as { rows?: unknown }).rows)) {
    const rows = payload as { rows: DeclarationRow[]; trial?: TrialSlice | null };
    return { ...fromRows(rows.rows), trial: rows.trial ?? null };
  }
  const legacy = payload as Declarations;
  if (legacy.totals || legacy.ipd || legacy.owner_claims) return fromLegacy(legacy);
  return EMPTY_DECLARATIONS;
}

/** Country code to a name the reader recognises; the code when unknown. */
export function countryName(code: string): string {
  if (!code) return "";
  try {
    const names = new Intl.DisplayNames(undefined, { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** One declared domain's roster as a CSV in the Excel sheet's columns. */
export function subjectCsv(subject: DeclarationSubject): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ["Declaration,Domain declared,Declared by,Country,Found in"];
  for (const d of subject.declarers) {
    lines.push(
      [subject.kind, subject.domain, d.domain, d.country, d.files.join(" + ")]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/** Hand the browser a file. Same columns as the workbook's Declarations sheet. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
