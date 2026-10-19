/**
 * THE FIXED SELLERS.JSON, worked out in the browser.
 *
 * A customer's sellers.json says who sells their inventory. Discovery says
 * what publishers' ads.txt and app-ads.txt files actually list under the
 * customer's domain: each seller ID, as DIRECT or RESELLER, and on which
 * publishers. Holding the two side by side shows where the file is wrong:
 *
 *   - add     an ID publishers list that the file does not have;
 *   - fix     an entry that is written wrong (a duplicate ID, a domain
 *             written as a URL, an invalid seller_type, a missing
 *             value); account roles and identity require confirmation;
 *   - remove  an entry no crawled file lists. The page calls these "not
 *             seen, check first" (David, 2026-10-11): the IAB spec does not
 *             ask a seller to appear in any ads.txt, and one selling on apps
 *             or sites outside the crawl is not seen either. Taken, it is
 *             still removed from the file.
 *
 * EVERYTHING STARTS OFF (David, 2026-10-06): every suggestion opens as
 * "Don't", and the customer switches on what they want. Nothing is ever
 * invented for them: an added seller's name is typed by the customer.
 *
 * Nothing here touches the customer's live file. The page shows the
 * suggestions; the reader picks the ones they want; `buildExport` writes the
 * file they download and publish themselves (David, 2026-10-05).
 *
 * Kept pure (no React, no fetch) so the rules can be checked on their own.
 */

export type SellerType = "PUBLISHER" | "INTERMEDIARY" | "BOTH";

/** One entry of a sellers.json, as the IAB spec has it. Unknown keys are
 *  kept as they are, so an export never drops something the file had. */
export type Seller = {
  /** Text by the spec; files in the wild also carry numbers, which the
   *  page reads and fixes. */
  seller_id: string | number;
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
  /** Entries as published: a broken file can carry nulls or numbers here,
   *  which the page shows and offers to take out. */
  sellers: Seller[];
  [key: string]: unknown;
};

/** One seller ID as publishers list it under the customer's domain. */
export type Sighting = {
  seller_id: string;
  relationship: "DIRECT" | "RESELLER";
  /** The first publishers carrying it (the backend keeps up to fifty). */
  publishers: {
    domain: string;
    name?: string | null;
    found_in: string;
    /** Read at bake time from the seller's OWN file (2026-10-11): proof the
     *  seller is seen, never evidence for its type or domain. */
    own_file?: boolean;
  }[];
  /** How many publishers carry it, always whole; the list above may be cut. */
  publishers_total?: number;
};

/** One field the fix changes. ``to: null`` drops the key from the entry.
 *  The two flags are written back as the integers the spec asks for. */
export type FieldChange = {
  field: "seller_id" | "seller_type" | "domain" | "name" | "is_confidential" | "is_passthrough";
  from?: string;
  to: string | number | null;
};

/** The spec's two 0/1 flags on a seller. */
export const FLAGS = ["is_confidential", "is_passthrough"] as const;

/** A flag written another way that clearly means 0 or 1 (true, "1", "0"),
 *  as that integer; null when it is already 0 or 1, absent, or unreadable. */
function flagAsInt(v: unknown): 0 | 1 | null {
  if (v === undefined || v === null || v === 0 || v === 1) return null;
  if (v === true || v === "1" || (typeof v === "string" && v.trim().toLowerCase() === "true")) return 1;
  if (v === false || v === "0" || (typeof v === "string" && v.trim().toLowerCase() === "false")) return 0;
  return null;
}

/** True when a flag holds what the spec allows: absent, 0 or 1. */
const flagOk = (v: unknown) => v === undefined || v === 0 || v === 1;

/** What the reader can type on a row. */
export type FillField = "name" | "domain" | "seller_type";

export type FileCheck = { url: string; seller_ids: string[]; status: "checked" | "absent" | "unverified"; via?: string; http_status?: number | null; reason?: string | null };

export type SellerRow = {
  unverified?: boolean;
  seller_id: string;
  kind: "add" | "fix" | "remove" | "keep";
  /** The entry in the file today; null for an add. */
  current: Seller | null;
  /** The entry we suggest; null for a removal. Same as current on a keep. */
  suggested: Seller | null;
  changes: FieldChange[];
  reason: string;
  direct: string[];
  reseller: string[];
  /** Every ads.txt / app-ads.txt line naming this ID, one per publisher
   *  and relationship, so the page can print them as lines. */
  listings: Listing[];
  /** How many lines name it in all; ``listings`` may be the first of them. */
  listingsTotal?: number;
  /** A duplicate ID's other entries, which the fix takes out of the file
   *  (the kept one is ``current``). */
  dropped?: Seller[];
  /** What only the reader can fill in. */
  ask?: FillField[];
  /** The change replaces a value that looks fine: publishers disagree with
   *  it, which is evidence, not proof. The page says "check". */
  check?: boolean;
  /** How publishers write the ID, when only its case differs from the file. */
  listedAs?: string;
};

export type Listing = {
  relationship: "DIRECT" | "RESELLER";
  publisher: string;
  found_in: string;
  /** Found in the seller's own file, not on a publisher we crawl. */
  own?: boolean;
};

/** A real entry (an object), as opposed to a null or a number in the list. */
export const isEntry = (x: unknown): x is Seller => !!x && typeof x === "object" && !Array.isArray(x);

/** An entry's seller ID as the page keys it: trimmed text, "" for none. */
export const idOf = (x: unknown): string => (isEntry(x) ? String(x.seller_id ?? "").trim() : "");

/** A domain as a plain host: no scheme, no www., no path, no port, no
 *  trailing dot, lowercase. */
export const norm = (d: string | undefined | null) =>
  String(d ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.+$/, "");

/** What is wrong with a domain that normalising fixes, in plain words. */
function domainProblem(raw: string): string {
  const t = raw.trim();
  const what: string[] = [];
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) what.push("a web address (https://)");
  if (/^([a-z][a-z0-9+.-]*:\/\/)?www\./i.test(t)) what.push("www.");
  if (/^([a-z][a-z0-9+.-]*:\/\/)?[^/?#]+[/?#]/i.test(t)) what.push("a path");
  if (/:\d+([/?#]|$)/.test(t.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ""))) what.push("a port");
  if (t !== t.toLowerCase()) what.push("capital letters");
  if (/\.+([/?#:]|$)/.test(t.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ""))) what.push("a trailing dot");
  if (t !== raw) what.push("spaces");
  const list = what.length > 1 ? `${what.slice(0, -1).join(", ")} and ${what[what.length - 1]}` : what[0] ?? "extra characters";
  return `The domain "${raw}" has ${list}; sellers.json wants the plain domain.`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A plain domain, any script (an IDN is written in its own letters). */
const DOMAIN = /^(?!-)[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u;
const TYPES = ["PUBLISHER", "INTERMEDIARY", "BOTH"];

/** A number a browser cannot hold exactly: past 2^53 its last digits are
 *  lost on reading, so writing it back would change it. */
const unsafeNumber = (v: unknown) => typeof v === "number" && Number.isInteger(v) && !Number.isSafeInteger(v);

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** The first publishers by name and how many more, out of ``total``. */
function names(list: string[], total = list.length, max = 2) {
  if (total <= max && list.length >= total) return list.join(" and ");
  return `${list.slice(0, max).join(", ")} and ${plural(total - Math.min(max, list.length), "more", "more")}`;
}

type Seen = {
  direct: Set<string>;
  reseller: Set<string>;
  dN: number;
  rN: number;
  names: Map<string, string>;
  listings: Listing[];
};

export function suggest(file: SellersFile, sightings: Sighting[], ownDomain: string, checks?: FileCheck[]): SellerRow[] {
  // Per ID: the publishers we were sent, and how many there are in all
  // (the sent list may be the first of them; a count is never read off it).
  const seen = new Map<string, Seen>();
  for (const s of sightings) {
    const id = String(s.seller_id).trim().toLowerCase();
    let e = seen.get(id);
    if (!e) {
      e = { direct: new Set(), reseller: new Set(), dN: 0, rN: 0, names: new Map(), listings: [] };
      seen.set(id, e);
    }
    // A seller's own file proves it is seen, and is listed as such, but
    // says nothing about its type or domain: an ad network selling its own
    // site writes DIRECT there and is still an INTERMEDIARY or BOTH.
    const own = s.publishers.length > 0 && s.publishers.every((p) => p.own_file);
    const total = Math.max(Number(s.publishers_total ?? 0), s.publishers.length);
    if (!own) {
      if (s.relationship === "DIRECT") e.dN += total;
      else e.rN += total;
    }
    for (const p of s.publishers) {
      const d = norm(p.domain);
      if (!d) continue;
      if (!p.own_file) (s.relationship === "DIRECT" ? e.direct : e.reseller).add(d);
      e.listings.push({ relationship: s.relationship, publisher: d, found_in: p.found_in, ...(p.own_file ? { own: true } : {}) });
      if (p.name && !p.own_file) e.names.set(d, p.name);
    }
  }

  const rows: SellerRow[] = [];

  // Every entry of an ID together: a duplicate is ONE suggestion (keep one
  // entry), never two cards that each change both. Nulls and numbers in the
  // list have no ID and land with the entries that have none.
  const byId = new Map<string, Seller[]>();
  for (const cur of file.sellers as unknown[]) {
    const id = idOf(cur);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id)!.push(cur as Seller);
  }

  // Same comparison key as canonical_seller_id in the crawler. Keep the
  // file's spelling for display/export; fold only when joining evidence.
  const claimed = new Set([...byId.keys()].map((id) => id.toLowerCase()));

  for (const [id, entries] of byId) {
    const copies = entries.length;

    // Entries with no seller_id (or not entries at all): no ads.txt line
    // can point to them.
    if (!id) {
      rows.push({
        seller_id: id,
        kind: "remove",
        current: entries[0],
        suggested: null,
        changes: [],
        reason:
          copies === 1
            ? "This entry has no seller_id, so no ads.txt or app-ads.txt line can point to it."
            : `These ${copies} entries have no seller_id, so no ads.txt or app-ads.txt line can point to them.`,
        direct: [],
        reseller: [],
        listings: [],
        ...(copies > 1 ? { dropped: entries.slice(1) } : {}),
      });
      continue;
    }

    const evidenceId = id.toLowerCase();
    const e = seen.get(evidenceId);
    const direct = e ? [...e.direct].sort() : [];
    const reseller = e ? [...e.reseller].sort() : [];
    const dN = e ? Math.max(e.dN, direct.length) : 0;
    const rN = e ? Math.max(e.rN, reseller.length) : 0;
    const oneDirect = dN === 1 && direct.length === 1 ? direct[0] : null;

    // Prefer the most complete entry, with conflicting duplicates marked
    // for review. ads.txt does not establish the paid entity's identity.
    const complete = (x: Seller) =>
      (String(x.name ?? "").trim() ? 1 : 0) + (String(x.domain ?? "").trim() ? 1 : 0);
    const cur =
      [...entries].sort((a, b) => complete(b) - complete(a))[0];
    const dropped = entries.filter((x) => x !== cur);

    const changes: FieldChange[] = [];
    const reasons: string[] = [];
    const ask: FillField[] = [];
    let check = false;
    const change = (field: FieldChange["field"], to: string | number | null, why: string, isCheck = false) => {
      const from = cur[field];
      changes.push({ field, from: from === undefined ? undefined : String(from), to });
      reasons.push(why);
      if (isCheck) check = true;
    };

    if (copies > 1) {
      const differ = new Set(entries.map((x) => JSON.stringify({ ...x, seller_id: id }))).size > 1;
      reasons.push(
        !differ
          ? `Listed ${copies} times in your file; one entry is kept.`
          : `Listed ${copies} times with different details; check the paid legal entity before keeping the most complete entry.`,
      );
      if (differ) check = true;
    }

    // Preserve the file's ID case; trim surrounding whitespace only. An
    // unsafe number is never rewritten: its digits are already lost here.
    if (unsafeNumber(cur.seller_id)) {
      // Left as it is; see unsafeNumbers().
    } else if (typeof cur.seller_id !== "string") {
      change("seller_id", id, "The seller_id is a number; sellers.json wants it as text.");
    } else if (cur.seller_id !== id) {
      change("seller_id", id, "The seller_id has spaces around it.");
    }

    // THE FLAGS. is_confidential and is_passthrough are 0 or 1 by the
    // spec; true, "1" or "0" mean one of them plainly and are written back
    // as the integer. Anything else is left for the reader (validate).
    for (const f of FLAGS) {
      const to = flagAsInt(cur[f]);
      if (to !== null) change(f, to, `${f} is written ${JSON.stringify(cur[f])}; sellers.json wants ${to}.`);
    }

    // ads.txt relationships establish account control, not inventory ownership
    // or who gets paid. They cannot establish any seller_type, including BOTH.
    const confidential = Number(cur.is_confidential ?? 0) === 1;
    const typed = String(cur.seller_type ?? "").trim().toUpperCase();
    if (TYPES.includes(typed) && String(cur.seller_type) !== String(cur.seller_type).trim()) {
      change("seller_type", String(cur.seller_type).trim(), "The seller_type has spaces around it.");
    }
    if (!TYPES.includes(typed)) {
      ask.push("seller_type");
      reasons.push("Choose the account's seller_type from inventory ownership and payment arrangements. DIRECT and RESELLER declarations do not determine it.");
    }

    if (confidential) {
      // The spec lets a confidential entry carry its name and domain; taking
      // them out is the customer's call.
      const out = (["name", "domain"] as const).filter((f) => cur[f] !== undefined && cur[f] !== "");
      for (const f of out) changes.push({ field: f, from: String(cur[f]), to: null });
      if (out.length) {
        check = true;
        reasons.push(
          `Marked confidential, yet its ${out.join(" and ")} ${out.length > 1 ? "are" : "is"} in the file. Take ${
            out.length > 1 ? "them" : "it"
          } out to keep it confidential.`,
        );
      }
    } else {
      const raw = cur.domain === undefined || cur.domain === null ? "" : String(cur.domain);
      const clean = norm(raw);
      const valid = DOMAIN.test(clean);
      // The domain identifies the paid legal entity. A DIRECT listing alone
      // does not establish that entity (for example a sales house or manager).
      if (!raw.trim()) {
        ask.push("domain");
        reasons.push("The seller's business domain is required if it has a web presence; confirm it before publishing.");
      } else if (valid) {
        if (clean !== raw) change("domain", clean, domainProblem(raw));
      } else {
        ask.push("domain");
        reasons.push(`"${raw}" is not a domain. Type the seller's business domain.`);
      }

      const name = String(cur.name ?? "");
      if (typeof cur.name !== "string" || !name.trim()) {
        // Never filled in for them (David, 2026-10-06): the name is typed.
        const onRecord = oneDirect ? e?.names.get(oneDirect) : undefined;
        ask.push("name");
        reasons.push(
          onRecord
            ? `Your file has no name for it (${oneDirect} is on record as ${onRecord}). Type it.`
            : "Your file has no name for it. Type it.",
        );
      } else if (name !== name.trim()) {
        change("name", name.trim(), "The name has spaces around it.");
      }
    }

    const wrong = changes.length > 0 || copies > 1 || ask.length > 0;
    if (!e && !wrong) {
      rows.push({
        seller_id: id,
        kind: "remove",
        current: cur,
        suggested: null,
        changes: [],
        reason: `No ads.txt or app-ads.txt we crawled lists ID ${id} under ${ownDomain}. It may sell on apps or sites outside this crawl, so check before removing it.`,
        direct: [],
        reseller: [],
        listings: [],
      });
      continue;
    }
    if (!wrong) {
      rows.push({
        seller_id: id,
        kind: "keep",
        current: cur,
        suggested: cur,
        changes,
        reason: "",
        direct,
        reseller,
        listings: e?.listings ?? [],
        listingsTotal: dN + rN,
      });
      continue;
    }
    if (!e) reasons.push(`No ads.txt or app-ads.txt we crawled lists it under ${ownDomain}.`);
    const next: Seller = { ...cur };
    for (const c of changes) {
      if (c.to === null) delete next[c.field];
      else (next as Record<string, unknown>)[c.field] = c.to;
    }
    rows.push({
      seller_id: id,
      kind: "fix",
      current: cur,
      suggested: next,
      changes,
      reason: reasons.join(" "),
      direct,
      reseller,
      listings: e?.listings ?? [],
      listingsTotal: dN + rN,
      ...(dropped.length ? { dropped } : {}),
      ...(ask.length ? { ask } : {}),
      ...(check ? { check } : {}),
    });
  }

  const adds = [...seen.keys()].filter((id) => !claimed.has(id)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const id of adds) {
    const e = seen.get(id)!;
    const direct = [...e.direct].sort();
    const reseller = [...e.reseller].sort();
    const dN = Math.max(e.dN, direct.length);
    const rN = Math.max(e.rN, reseller.length);

    const oneDirect = dN === 1 && direct.length === 1 ? direct[0] : null;
    const onRecord = oneDirect ? e.names.get(oneDirect) : undefined;
    // Never named for them (David, 2026-10-06): the customer confirms the
    // account is theirs, names the paid entity and chooses its role.
    const reason = oneDirect
      ? `Listed as DIRECT by ${oneDirect}${onRecord ? ` (on record as ${onRecord})` : ""}, but missing from your file. Confirm the seller's name, business domain and account role to add it.`
      : dN > 1
        ? `Listed as DIRECT by ${plural(dN, "publisher", "publishers")} (${names(direct, dN)}), but missing from your file. Type who it is to add it.`
        : `Listed as RESELLER by ${plural(rN, "publisher", "publishers")}, but missing from your file. Type who the reseller is to add it.`;
    rows.push({
      seller_id: id,
      kind: "add",
      current: null,
      suggested: { seller_id: id, name: "", seller_type: "" },
      changes: [],
      reason,
      direct,
      reseller,
      listings: e.listings,
      listingsTotal: dN + rN,
      ask: ["name", "domain", "seller_type"],
    });
  }
  // Legacy snapshots have no per-file outcomes: lack of evidence is unknown,
  // never proof of absence. Only two successfully checked own-file paths can
  // support the existing cautious "not seen" review, never an automatic edit.
  if (checks !== undefined) return rows.map(row => {
    if (row.kind !== "remove" || !row.current || !String(row.current.seller_id ?? "").trim()) return row;
    const id = String(row.seller_id).trim().toLowerCase();
    const own = checks.filter(c => c.seller_ids.includes(id));
    const complete = ["ads.txt", "app-ads.txt"].every(path => own.some(c =>
      c.url === `https://${norm(row.current!.domain)}/${path}` && ["checked", "absent"].includes(c.status)));
    if (complete) return row;
    return {...row, kind: "keep" as const, unverified: true, suggested: row.current,
      changes: [], reason: "Couldn’t verify both files during report generation. Kept unchanged; this is not evidence to remove the seller."};
  });
  return rows;
}

/**
 * The file to download: the customer's own file with exactly the picked
 * suggestions applied. Entries keep their order and every key they had;
 * added sellers go at the end. The header (contact_email, version, ...) is
 * carried over untouched.
 */
export function buildExport(file: SellersFile, rows: SellerRow[], ticked: Set<string>): SellersFile {
  const byId = new Map(rows.map((r) => [r.seller_id, r]));
  // A taken fix writes its ID once, in the place of the entry it keeps; a
  // duplicate's other copies go. (Rows built from another copy of the file
  // fall back to the first entry's place.)
  const home = new Map<string, Seller>();
  for (const r of rows) {
    if (r.kind !== "fix" || !r.current) continue;
    home.set(r.seller_id, file.sellers.includes(r.current) ? r.current : file.sellers.find((x) => idOf(x) === r.seller_id)!);
  }
  const sellers: Seller[] = [];
  for (const cur of file.sellers) {
    const id = idOf(cur);
    const r = byId.get(id);
    if (r && ticked.has(r.seller_id)) {
      if (r.kind === "remove") continue;
      if (r.kind === "fix" && r.suggested) {
        if (cur === home.get(id)) sellers.push(r.suggested);
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

/**
 * Numbers in the file a browser cannot copy exactly (integers past 2^53),
 * as "where: value". A file carrying one must not be exported from here:
 * the copy would change it. Empty is good.
 */
export function unsafeNumbers(file: SellersFile): string[] {
  const out: string[] = [];
  const walk = (v: unknown, where: string) => {
    if (unsafeNumber(v)) out.push(`${where}: ${String(v)}`);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, where));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(file, "file");
  return out;
}

/* ── Compliance ─────────────────────────────────────────────────────── */

/** One thing standing between the file and a compliant sellers.json. */
export type Issue = {
  key: string;
  text: string;
  /** The seller it is about, so the page can take the reader to it. */
  sellerId?: string;
  /** A header field the reader fills in or adds. */
  field?: "contact_email" | "version";
};

/**
 * What the IAB sellers.json spec asks of a file, checked on the file the
 * reader is about to export: a version in the header (and, for a file built
 * here, a contact email); per seller a unique ID written as text, a
 * seller_type of PUBLISHER, INTERMEDIARY or BOTH, and (unless confidential)
 * a name, plus a plain business domain when the seller has a web presence.
 */
export function validate(file: SellersFile, opts: { creating?: boolean } = {}): Issue[] {
  const issues: Issue[] = [];
  // Optional by the spec; asked only of a file the reader builds here.
  if (opts.creating && !EMAIL.test(String(file.contact_email ?? "").trim())) {
    issues.push({ key: "contact_email", field: "contact_email", text: "Add a contact email for the file's header." });
  }
  if (file.version !== "1.0") {
    issues.push({ key: "version", field: "version", text: "The file version must be the text \"1.0\"." });
  }
  // A contact email the live file already carries: fixed there, not here.
  const email = file.contact_email;
  if (!opts.creating && email !== undefined && email !== null && String(email).trim() && !EMAIL.test(String(email).trim())) {
    issues.push({ key: "contact_email-bad", text: `The contact_email "${String(email)}" is not an email address. Fix it in your live file.` });
  }
  // identifiers: a list of {name, value}, both written (TAG-ID, DUNS ...).
  if (file.identifiers !== undefined && file.identifiers !== null) {
    const ids = file.identifiers;
    const broken = !Array.isArray(ids)
      ? 1
      : ids.filter((x) => !isEntry(x) || !String((x as Record<string, unknown>).name ?? "").trim() || !String((x as Record<string, unknown>).value ?? "").trim()).length;
    if (broken) {
      issues.push({
        key: "identifiers",
        text: !Array.isArray(ids)
          ? "The file's identifiers is not a list. Each identifier needs a name and a value (for example TAG-ID)."
          : `${broken === 1 ? "An identifier" : `${broken} identifiers`} in the file's header ${broken === 1 ? "lacks" : "lack"} a name or a value. Fix ${broken === 1 ? "it" : "them"} in your live file.`,
      });
    }
  }
  const count = new Map<string, number>();
  for (const s of file.sellers) {
    const id = idOf(s);
    count.set(id, (count.get(id) ?? 0) + 1);
  }
  for (const [id, n] of count) {
    if (!id) issues.push({ key: "no-id", sellerId: id, text: n === 1 ? "An entry has no seller_id." : `${n} entries have no seller_id.` });
    else if (n > 1) issues.push({ key: `dup-${id}`, sellerId: id, text: `Seller ID ${id} is listed ${n} times; keep one.` });
  }
  const told = new Set<string>();
  for (const s of file.sellers) {
    const id = idOf(s);
    // One set of issues per ID: a duplicate is already said above.
    if (!id || told.has(id)) continue;
    told.add(id);
    const at = (k: string, text: string) => issues.push({ key: `${k}-${id}`, sellerId: id, text });
    if (!unsafeNumber(s.seller_id) && (typeof s.seller_id !== "string" || s.seller_id !== id)) {
      at("id", `Seller ID ${id} is not written as plain text.`);
    }
    for (const f of FLAGS) {
      if (!flagOk(s[f])) at(f, `Seller ${id}'s ${f} must be 0 or 1, not ${JSON.stringify(s[f])}.`);
    }
    const type = String(s.seller_type ?? "").toUpperCase();
    if (!TYPES.includes(type)) {
      at("type", `Seller ${id} needs a seller_type of PUBLISHER, INTERMEDIARY or BOTH${type ? `, not "${type}"` : ""}.`);
    }
    if (Number(s.is_confidential ?? 0) === 1) continue;
    const name = String(s.name ?? "");
    if (typeof s.name !== "string" || !name.trim()) at("name", `Seller ${id} needs a name written as text.`);
    const domain = s.domain === undefined || s.domain === null ? "" : String(s.domain);
    if (domain && !DOMAIN.test(domain)) {
      at("bad", `Seller ${id}'s domain "${domain}" is not a plain domain.`);
    }
  }
  return issues;
}

export type Edit = { name?: string; domain?: string; seller_type?: string };

/** The reader's own fill-ins laid over our suggestions. */
export function withEdits(rows: SellerRow[], edits: Record<string, Edit>): SellerRow[] {
  return rows.map((r) => {
    const e = edits[r.seller_id];
    if (!e || !r.suggested) return r;
    const next: Seller = { ...r.suggested };
    if (e.name !== undefined) next.name = e.name.trim();
    if (e.domain !== undefined) {
      if (e.domain.trim()) next.domain = norm(e.domain);
      else delete next.domain;
    }
    if (e.seller_type) next.seller_type = e.seller_type;
    return { ...r, suggested: next };
  });
}

/** A row that waits for something only the reader can type. */
export function needsFillIn(r: SellerRow): boolean {
  return Boolean(r.ask?.length);
}

/** The fields the reader fills in on a row. */
export function fillInFields(r: SellerRow): FillField[] {
  return r.ask ?? [];
}

export const SELLER_TYPES = TYPES as SellerType[];
