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

import type {
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

/** One file that named the subject. */
export type Declarer = {
  domain: string;
  /** Display-ready: "ads.txt" or "app-ads.txt". */
  found_in: string;
  /** ISO 3166-1 alpha-2 for a country-scoped manager domain, else "". */
  country: string;
};

/** One declared domain and everyone who declared it. */
export type DeclarationSubject = {
  kind: DeclarationKind;
  domain: string;
  declarers: Declarer[];
  /** The honest count; `declarers` may be capped on the legacy shape. */
  total: number;
  /** How many distinct files, split by kind, for the card's right column. */
  ads_txt: number;
  app_ads_txt: number;
  /** Distinct countries named, manager domains only. */
  countries: string[];
};

export type DeclarationSection = {
  kind: DeclarationKind;
  subjects: DeclarationSubject[];
  /** Individual declarations (rows), the number the Excel sheet has. */
  declarations: number;
};

export type NormalizedDeclarations = {
  /** Every declaration counted once. Zero hides the sidebar entry. */
  total: number;
  sections: DeclarationSection[];
  /** Only the legacy grouped shape carries these. */
  mismatches: RelationshipMismatch[];
  /** True when the payload was the capped legacy shape. */
  legacy: boolean;
};

export const EMPTY_DECLARATIONS: NormalizedDeclarations = {
  total: 0,
  sections: DECLARATION_KINDS.map((kind) => ({ kind, subjects: [], declarations: 0 })),
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

function finish(subject: DeclarationSubject): DeclarationSubject {
  const countries = Array.from(
    new Set(subject.declarers.map((d) => d.country).filter(Boolean)),
  ).sort();
  return {
    ...subject,
    ads_txt: subject.declarers.filter((d) => d.found_in === "ads.txt").length,
    app_ads_txt: subject.declarers.filter((d) => d.found_in === "app-ads.txt").length,
    countries,
  };
}

function fromRows(rows: DeclarationRow[]): NormalizedDeclarations {
  const byKind = new Map<DeclarationKind, Map<string, DeclarationSubject>>();
  let total = 0;
  for (const row of rows) {
    const kind = kindOf(row?.declaration);
    const domain = String(row?.declared_domain ?? "").trim().toLowerCase();
    const by = String(row?.declared_by ?? "").trim().toLowerCase();
    if (!kind || !domain || !by) continue;
    total += 1;
    let subjects = byKind.get(kind);
    if (!subjects) {
      subjects = new Map();
      byKind.set(kind, subjects);
    }
    let subject = subjects.get(domain);
    if (!subject) {
      subject = {
        kind, domain, declarers: [], total: 0, ads_txt: 0, app_ads_txt: 0, countries: [],
      };
      subjects.set(domain, subject);
    }
    subject.declarers.push({
      domain: by,
      found_in: fileLabelOf(row.found_in),
      country: String(row.country ?? "").trim().toUpperCase(),
    });
    subject.total += 1;
  }
  return {
    total,
    legacy: false,
    mismatches: [],
    sections: DECLARATION_KINDS.map((kind) => {
      const subjects = sortSubjects(
        Array.from(byKind.get(kind)?.values() ?? []).map(finish),
      );
      return {
        kind,
        subjects,
        declarations: subjects.reduce((n, s) => n + s.total, 0),
      };
    }),
  };
}

function fromLegacy(d: Declarations): NormalizedDeclarations {
  const ipd: DeclarationSubject[] = (d.ipd ?? []).map((p) =>
    finish({
      kind: "inventory partner",
      domain: p.partner_domain,
      declarers: (p.declared_by ?? []).map((s) => ({
        domain: s.domain, found_in: fileLabelOf(s.file_kind), country: "",
      })),
      total: p.declarer_total ?? (p.declared_by ?? []).length,
      ads_txt: 0, app_ads_txt: 0, countries: [],
    }),
  );
  const owners: DeclarationSubject[] = (d.owner_claims ?? []).map((c) =>
    finish({
      kind: "owner domain",
      domain: c.owner_domain,
      declarers: (c.claimed_by ?? []).map((s) => ({
        domain: s.domain, found_in: fileLabelOf(s.file_kind), country: "",
      })),
      total: c.claimant_total ?? (c.claimed_by ?? []).length,
      ads_txt: 0, app_ads_txt: 0, countries: [],
    }),
  );
  const sections: DeclarationSection[] = [
    { kind: "inventory partner", subjects: sortSubjects(ipd),
      declarations: ipd.reduce((n, s) => n + s.total, 0) },
    { kind: "owner domain", subjects: sortSubjects(owners),
      declarations: owners.reduce((n, s) => n + s.total, 0) },
    { kind: "manager domain", subjects: [], declarations: 0 },
  ];
  const mismatches = d.relationship_mismatches ?? [];
  return {
    total: sections.reduce((n, s) => n + s.declarations, 0) + mismatches.length,
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
    return fromRows((payload as { rows: DeclarationRow[] }).rows);
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
      [subject.kind, subject.domain, d.domain, d.country, d.found_in].map(esc).join(","),
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
