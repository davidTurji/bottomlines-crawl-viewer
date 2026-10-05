/**
 * THE FIXED SELLERS.JSON, worked out in the browser.
 *
 * A customer's sellers.json says who sells their inventory. Discovery says
 * what publishers' ads.txt and app-ads.txt files actually list under the
 * customer's domain: each seller ID, as DIRECT or RESELLER, and on which
 * publishers. Holding the two side by side shows where the file is wrong:
 *
 *   - add     an ID publishers list that the file does not have;
 *   - fix     an entry whose seller_type or domain disagrees with what
 *             publishers list;
 *   - remove  an entry no crawled file lists. Only ever SUGGESTED, off by
 *             default: the seller may sit on sites outside the crawl.
 *
 * Nothing here touches the customer's live file. The page shows the
 * suggestions; the reader ticks the ones they want; `buildExport` writes the
 * file they download and publish themselves (David, 2026-10-05).
 *
 * Kept pure (no React, no fetch) so the crawler can mirror the same rules
 * when it bakes this into a report.
 */

export type SellerType = "PUBLISHER" | "INTERMEDIARY" | "BOTH";

/** One entry of a sellers.json, as the IAB spec has it. Unknown keys are
 *  kept as they are, so an export never drops something the file had. */
export type Seller = {
  seller_id: string;
  name?: string;
  domain?: string;
  seller_type: string;
  is_confidential?: number;
  [key: string]: unknown;
};

export type SellersFile = {
  contact_email?: string;
  contact_address?: string;
  version?: string;
  identifiers?: unknown;
  sellers: Seller[];
  [key: string]: unknown;
};

/** One seller ID as publishers list it under the customer's domain. */
export type Sighting = {
  seller_id: string;
  relationship: "DIRECT" | "RESELLER";
  publishers: { domain: string; name?: string | null; found_in: string }[];
};

export type FieldChange = { field: "seller_type" | "domain"; from?: string; to: string };

export type SellerRow = {
  seller_id: string;
  kind: "add" | "fix" | "remove" | "keep";
  /** The entry in the file today; null for an add. */
  current: Seller | null;
  /** The entry we suggest; null for a removal. Same as current on a keep. */
  suggested: Seller | null;
  changes: FieldChange[];
  reason: string;
  /** Ticked when the page opens. Removals and unsure adds start unticked. */
  defaultOn: boolean;
  direct: string[];
  reseller: string[];
  /** Every ads.txt / app-ads.txt line naming this ID, one per publisher
   *  and relationship, so the page can print them as lines. */
  listings: Listing[];
};

export type Listing = {
  relationship: "DIRECT" | "RESELLER";
  publisher: string;
  found_in: string;
};

/** A domain as a plain host: no scheme, no www., no path, lowercase. */
const norm = (d: string | undefined | null) =>
  String(d ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function names(list: string[], max = 2) {
  if (list.length <= max) return list.join(" and ");
  return `${list.slice(0, max).join(", ")} and ${plural(list.length - max, "more", "more")}`;
}

function expectedType(direct: string[], reseller: string[]): SellerType {
  if (direct.length && reseller.length) return "BOTH";
  return direct.length ? "PUBLISHER" : "INTERMEDIARY";
}

/** A display name from a domain, for an added PUBLISHER entry with none. */
function nameFrom(domain: string) {
  const stem = domain.split(".")[0] ?? domain;
  return stem
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function suggest(file: SellersFile, sightings: Sighting[], ownDomain: string): SellerRow[] {
  const seen = new Map<string, { direct: Set<string>; reseller: Set<string>; names: Map<string, string>; listings: Listing[] }>();
  for (const s of sightings) {
    const id = String(s.seller_id);
    let e = seen.get(id);
    if (!e) {
      e = { direct: new Set(), reseller: new Set(), names: new Map(), listings: [] };
      seen.set(id, e);
    }
    for (const p of s.publishers) {
      const d = norm(p.domain);
      if (!d) continue;
      (s.relationship === "DIRECT" ? e.direct : e.reseller).add(d);
      e.listings.push({ relationship: s.relationship, publisher: d, found_in: p.found_in });
      if (p.name) e.names.set(d, p.name);
    }
  }

  const rows: SellerRow[] = [];
  const inFile = new Set<string>();

  for (const cur of file.sellers) {
    const id = String(cur.seller_id);
    inFile.add(id);
    const e = seen.get(id);
    if (!e) {
      rows.push({
        seller_id: id,
        kind: "remove",
        current: cur,
        suggested: null,
        changes: [],
        reason: `No ads.txt or app-ads.txt we crawled lists ID ${id} under ${ownDomain}. It may sit on sites outside this crawl, so it stays unless you tick it.`,
        defaultOn: false,
        direct: [],
        reseller: [],
        listings: [],
      });
      continue;
    }
    const direct = [...e.direct].sort();
    const reseller = [...e.reseller].sort();
    const changes: FieldChange[] = [];
    const reasons: string[] = [];

    const want = expectedType(direct, reseller);
    const had = String(cur.seller_type ?? "").toUpperCase();
    if (had !== want) {
      changes.push({ field: "seller_type", from: cur.seller_type, to: want });
      reasons.push(
        want === "BOTH"
          ? `Listed as DIRECT by ${plural(direct.length, "publisher", "publishers")} and as RESELLER by ${reseller.length.toLocaleString()}, so BOTH.`
          : want === "INTERMEDIARY"
            ? `Only ever listed as RESELLER (by ${plural(reseller.length, "publisher", "publishers")}), so INTERMEDIARY.`
            : `Only ever listed as DIRECT (by ${names(direct)}), so PUBLISHER.`,
      );
    }

    // The domain is only knowable for the seller who owns the inventory,
    // and only when exactly one publisher lists the ID as DIRECT. A
    // confidential entry keeps its domain out of the file on purpose.
    const confidential = Number(cur.is_confidential ?? 0) === 1;
    if (!confidential && want !== "INTERMEDIARY" && direct.length === 1 && String(cur.domain ?? "") !== direct[0]) {
      changes.push({ field: "domain", from: cur.domain, to: direct[0] });
      reasons.push(
        !cur.domain
          ? `Only ${direct[0]} lists it as DIRECT; your file has no domain for it.`
          : norm(cur.domain) === direct[0]
            ? `Written as a web address; sellers.json wants the plain domain.`
            : `Only ${direct[0]} lists it as DIRECT; your file says ${cur.domain}.`,
      );
    }

    if (!changes.length) {
      rows.push({
        seller_id: id,
        kind: "keep",
        current: cur,
        suggested: cur,
        changes,
        reason: "",
        defaultOn: false,
        direct,
        reseller,
        listings: e.listings,
      });
      continue;
    }
    const next: Seller = { ...cur };
    for (const c of changes) next[c.field] = c.to;
    rows.push({
      seller_id: id,
      kind: "fix",
      current: cur,
      suggested: next,
      changes,
      reason: reasons.join(" "),
      defaultOn: true,
      direct,
      reseller,
      listings: e.listings,
    });
  }

  const adds = [...seen.keys()].filter((id) => !inFile.has(id)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const id of adds) {
    const e = seen.get(id)!;
    const direct = [...e.direct].sort();
    const reseller = [...e.reseller].sort();
    const type = expectedType(direct, reseller);
    if (direct.length === 1) {
      const domain = direct[0];
      rows.push({
        seller_id: id,
        kind: "add",
        current: null,
        suggested: { seller_id: id, name: e.names.get(domain) ?? nameFrom(domain), domain, seller_type: type },
        changes: [],
        reason: `Listed as DIRECT by ${domain}, but missing from your file.`,
        defaultOn: true,
        direct,
        reseller,
        listings: e.listings,
      });
    } else if (direct.length > 1) {
      rows.push({
        seller_id: id,
        kind: "add",
        current: null,
        suggested: { seller_id: id, name: "", seller_type: type },
        changes: [],
        reason: `Listed as DIRECT by ${plural(direct.length, "publisher", "publishers")} (${names(direct)}), but missing from your file. Fill in who it is before adding.`,
        defaultOn: false,
        direct,
        reseller,
        listings: e.listings,
      });
    } else {
      rows.push({
        seller_id: id,
        kind: "add",
        current: null,
        suggested: { seller_id: id, name: "", seller_type: "INTERMEDIARY" },
        changes: [],
        reason: `Listed as RESELLER by ${plural(reseller.length, "publisher", "publishers")}, but missing from your file. We can't tell who the reseller is, so name and domain are left for you.`,
        defaultOn: false,
        direct,
        reseller,
        listings: e.listings,
      });
    }
  }
  return rows;
}

/**
 * The file to download: the customer's own file with exactly the ticked
 * suggestions applied. Entries keep their order and every key they had;
 * added sellers go at the end. The header (contact_email, version, ...) is
 * carried over untouched.
 */
export function buildExport(file: SellersFile, rows: SellerRow[], ticked: Set<string>): SellersFile {
  const byId = new Map(rows.map((r) => [r.seller_id, r]));
  const sellers: Seller[] = [];
  for (const cur of file.sellers) {
    const r = byId.get(String(cur.seller_id));
    if (r && ticked.has(r.seller_id)) {
      if (r.kind === "remove") continue;
      if (r.kind === "fix" && r.suggested) {
        sellers.push(r.suggested);
        continue;
      }
    }
    sellers.push(cur);
  }
  for (const r of rows) {
    if (r.kind === "add" && r.suggested && ticked.has(r.seller_id)) sellers.push(r.suggested);
  }
  return { ...file, sellers };
}

/* ── Compliance ─────────────────────────────────────────────────────── */

/** One thing standing between the file and a compliant sellers.json. */
export type Issue = {
  key: string;
  text: string;
  /** The seller it is about, so the page can take the reader to it. */
  sellerId?: string;
  /** A header field the reader fills in, e.g. "contact_email". */
  field?: "contact_email";
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * What the IAB sellers.json spec asks of a file, checked on the file the
 * reader is about to export: a contact email and version in the header;
 * per seller a unique ID, a known seller_type, and (unless confidential) a
 * name, plus a well-formed domain for a PUBLISHER or BOTH. A confidential
 * entry keeps its name and domain out of the file.
 */
export function validate(file: SellersFile): Issue[] {
  const issues: Issue[] = [];
  if (!EMAIL.test(String(file.contact_email ?? "").trim())) {
    issues.push({ key: "contact_email", field: "contact_email", text: "Add a contact email for the file's header." });
  }
  if (!String(file.version ?? "").trim()) {
    issues.push({ key: "version", text: "The file needs a version (1.0)." });
  }
  const seen = new Map<string, number>();
  for (const s of file.sellers) seen.set(String(s.seller_id), (seen.get(String(s.seller_id)) ?? 0) + 1);
  for (const [id, n] of seen) {
    if (n > 1) issues.push({ key: `dup-${id}`, sellerId: id, text: `Seller ID ${id} is listed ${n} times; keep one.` });
  }
  for (const s of file.sellers) {
    const id = String(s.seller_id);
    const type = String(s.seller_type ?? "").toUpperCase();
    const confidential = Number(s.is_confidential ?? 0) === 1;
    if (!["PUBLISHER", "INTERMEDIARY", "BOTH"].includes(type)) {
      issues.push({ key: `type-${id}`, sellerId: id, text: `Seller ${id} needs a seller_type of PUBLISHER, INTERMEDIARY or BOTH.` });
    }
    if (confidential) {
      if (s.domain) issues.push({ key: `conf-${id}`, sellerId: id, text: `Seller ${id} is confidential, so its domain stays out of the file.` });
      continue;
    }
    if (!String(s.name ?? "").trim()) {
      issues.push({ key: `name-${id}`, sellerId: id, text: `Seller ${id} needs a name.` });
    }
    const domain = String(s.domain ?? "").trim();
    if (type !== "INTERMEDIARY" && !domain) {
      issues.push({ key: `domain-${id}`, sellerId: id, text: `Seller ${id} needs its domain.` });
    } else if (domain && !DOMAIN.test(domain)) {
      issues.push({ key: `bad-${id}`, sellerId: id, text: `Seller ${id}'s domain "${domain}" is not a plain domain.` });
    }
  }
  return issues;
}

/** The reader's own fill-ins (name, domain) laid over our suggestions. */
export function withEdits(
  rows: SellerRow[],
  edits: Record<string, { name?: string; domain?: string }>,
): SellerRow[] {
  return rows.map((r) => {
    const e = edits[r.seller_id];
    if (!e || !r.suggested) return r;
    const next: Seller = { ...r.suggested };
    if (e.name !== undefined) next.name = e.name;
    if (e.domain !== undefined) {
      if (e.domain.trim()) next.domain = e.domain.trim().toLowerCase();
      else delete next.domain;
    }
    return { ...r, suggested: next };
  });
}

/** An add we could not fully identify: the reader fills in who it is. */
export function needsFillIn(r: SellerRow): boolean {
  return r.kind === "add" && !r.defaultOn;
}
