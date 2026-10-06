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
  sellers: Seller[];
  [key: string]: unknown;
};

/** One seller ID as publishers list it under the customer's domain. */
export type Sighting = {
  seller_id: string;
  relationship: "DIRECT" | "RESELLER";
  publishers: { domain: string; name?: string | null; found_in: string }[];
};

/** One field the fix changes. ``to: null`` drops the key from the entry. */
export type FieldChange = {
  field: "seller_id" | "seller_type" | "domain" | "name";
  from?: string;
  to: string | null;
};

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
  /** A duplicate ID's other entries, which the fix takes out of the file
   *  (the kept one is ``current``). */
  dropped?: Seller[];
  /** What only the reader can fill in: a name or domain the file lacks or
   *  has wrong, that no publisher's file tells us. */
  ask?: ("name" | "domain")[];
};

export type Listing = {
  relationship: "DIRECT" | "RESELLER";
  publisher: string;
  found_in: string;
};

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

/** Words files use for "no domain" that are not one. */
const PLACEHOLDER = /^(n\/?a|none|null|undefined|-+|tbd|unknown)$/i;

/** seller_type values written the ads.txt way, and what sellers.json says. */
const ADSTXT_TYPE: Record<string, SellerType> = { DIRECT: "PUBLISHER", RESELLER: "INTERMEDIARY" };

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

  // Every entry of an ID together: a duplicate is ONE suggestion (keep one
  // entry), never two cards that each change both.
  const byId = new Map<string, Seller[]>();
  for (const cur of file.sellers) {
    const id = String(cur.seller_id ?? "").trim();
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id)!.push(cur);
  }

  for (const [id, entries] of byId) {
    inFile.add(id);
    const copies = entries.length;

    // An entry with no seller_id: no ads.txt line can point to it.
    if (!id) {
      rows.push({
        seller_id: id,
        kind: "remove",
        current: entries[0],
        suggested: null,
        changes: [],
        reason: `${copies === 1 ? "This entry has" : `These ${copies} entries have`} no seller_id, so no ads.txt or app-ads.txt line can point to ${copies === 1 ? "it" : "them"}.`,
        defaultOn: false,
        direct: [],
        reseller: [],
        listings: [],
        dropped: entries.slice(1),
      });
      continue;
    }

    const e = seen.get(id);
    const direct = e ? [...e.direct].sort() : [];
    const reseller = e ? [...e.reseller].sort() : [];
    // The entry kept: the one publishers agree with, else the most complete,
    // else the first.
    const complete = (x: Seller) =>
      (String(x.name ?? "").trim() ? 1 : 0) + (String(x.domain ?? "").trim() ? 1 : 0);
    const cur =
      entries.find((x) => direct.includes(norm(x.domain))) ??
      [...entries].sort((a, b) => complete(b) - complete(a))[0];
    const dropped = entries.filter((x) => x !== cur);

    const changes: FieldChange[] = [];
    const reasons: string[] = [];
    const ask: ("name" | "domain")[] = [];
    const change = (field: FieldChange["field"], to: string | null, why: string) => {
      const from = cur[field];
      changes.push({ field, from: from === undefined ? undefined : String(from), to });
      reasons.push(why);
    };

    if (copies > 1) {
      const differ = new Set(entries.map((x) => JSON.stringify({ ...x, seller_id: id }))).size > 1;
      reasons.push(
        !differ
          ? `Listed ${copies} times in your file; one entry is kept.`
          : direct.includes(norm(cur.domain))
            ? `Listed ${copies} times in your file with different details; the entry publishers agree with is kept.`
            : `Listed ${copies} times in your file with different details; the most complete entry is kept.`,
      );
    }

    // THE FILE'S OWN HYGIENE, whatever the crawl saw: these are wrong in any
    // sellers.json (David, 2026-10-06: duplicated IDs, wrong domains, all of it).
    if (typeof cur.seller_id !== "string") {
      change("seller_id", id, "The seller_id is a number; sellers.json wants it as text.");
    } else if (cur.seller_id !== id) {
      change("seller_id", id, "The seller_id has spaces around it.");
    }

    const confidential = Number(cur.is_confidential ?? 0) === 1;
    const typed = String(cur.seller_type ?? "").trim().toUpperCase();
    const want = e ? expectedType(direct, reseller) : null;
    if (want && typed !== want) {
      change(
        "seller_type",
        want,
        want === "BOTH"
          ? `Listed as DIRECT by ${plural(direct.length, "publisher", "publishers")} and as RESELLER by ${reseller.length.toLocaleString()}, so BOTH.`
          : want === "INTERMEDIARY"
            ? `Only ever listed as RESELLER (by ${plural(reseller.length, "publisher", "publishers")}), so INTERMEDIARY.`
            : `Only ever listed as DIRECT (by ${names(direct)}), so PUBLISHER.`,
      );
    } else if (!want && ADSTXT_TYPE[typed]) {
      change("seller_type", ADSTXT_TYPE[typed], `The seller_type is written ${cur.seller_type}, the ads.txt word; sellers.json says ${ADSTXT_TYPE[typed]}.`);
    } else if (TYPES.includes(typed) && cur.seller_type !== typed) {
      change("seller_type", typed, `The seller_type is written "${cur.seller_type}"; sellers.json wants ${typed}.`);
    }
    const finalType = String(changes.find((c) => c.field === "seller_type")?.to ?? typed);

    if (confidential) {
      // A confidential seller's identity stays out of the file.
      const out = (["name", "domain"] as const).filter((f) => cur[f] !== undefined && cur[f] !== "");
      for (const f of out) {
        changes.push({ field: f, from: String(cur[f]), to: null });
      }
      if (out.length) {
        reasons.push(`Marked confidential, so its ${out.join(" and ")} ${out.length > 1 ? "stay" : "stays"} out of the file.`);
      }
    } else {
      const raw = cur.domain === undefined || cur.domain === null ? "" : String(cur.domain);
      const clean = norm(raw);
      const valid = DOMAIN.test(clean);
      const needsDomain = finalType !== "INTERMEDIARY";
      // The domain is only knowable for the seller who owns the inventory,
      // and only when exactly one publisher lists the ID as DIRECT.
      if (needsDomain && direct.length === 1 && clean !== direct[0]) {
        change(
          "domain",
          direct[0],
          !raw.trim()
            ? `Only ${direct[0]} lists it as DIRECT; your file has no domain for it.`
            : `Only ${direct[0]} lists it as DIRECT; your file says ${raw}.`,
        );
      } else if (raw.trim() && valid && clean !== raw) {
        change("domain", clean, domainProblem(raw));
      } else if (raw.trim() && !valid && !needsDomain) {
        // An intermediary's domain is optional: a placeholder or a broken
        // one is better left out than wrong.
        change(
          "domain",
          null,
          PLACEHOLDER.test(raw.trim())
            ? `"${raw}" is a placeholder, not a domain. An INTERMEDIARY may leave the domain out, so it comes out.`
            : `"${raw}" is not a domain. An INTERMEDIARY may leave the domain out, so it comes out.`,
        );
      } else if (needsDomain && !valid) {
        ask.push("domain");
        reasons.push(
          !raw.trim()
            ? `A ${finalType} needs its domain and your file has none. Type it to fix it.`
            : `"${raw}" is not a domain. Type the seller's domain to fix it.`,
        );
      }

      const name = String(cur.name ?? "");
      if (!name.trim()) {
        const known = direct.length === 1 ? (e?.names.get(direct[0]) ?? null) : null;
        if (known) {
          change("name", known, `Your file has no name for it; ${direct[0]} calls itself ${known}.`);
        } else {
          ask.push("name");
          reasons.push("Your file has no name for it. Type it to fix it.");
        }
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
        reason: `No ads.txt or app-ads.txt we crawled lists ID ${id} under ${ownDomain}. It may sit on sites outside this crawl, so it stays unless you tick it.`,
        defaultOn: false,
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
        defaultOn: false,
        direct,
        reseller,
        listings: e?.listings ?? [],
      });
      continue;
    }
    const next: Seller = { ...cur };
    for (const c of changes) {
      if (c.to === null) delete next[c.field];
      else next[c.field] = c.to;
    }
    rows.push({
      seller_id: id,
      kind: "fix",
      current: cur,
      suggested: next,
      changes,
      reason: reasons.join(" "),
      // Only what the reader alone knows waits for them: a fix that needs
      // a name or domain typed in starts off.
      defaultOn: ask.length === 0,
      direct,
      reseller,
      listings: e?.listings ?? [],
      ...(dropped.length ? { dropped } : {}),
      ...(ask.length ? { ask } : {}),
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
  const idOf = (s: Seller) => String(s.seller_id ?? "").trim();
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
const TYPES = ["PUBLISHER", "INTERMEDIARY", "BOTH"];

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
  const count = new Map<string, number>();
  for (const s of file.sellers) {
    const id = String(s.seller_id ?? "").trim();
    count.set(id, (count.get(id) ?? 0) + 1);
  }
  for (const [id, n] of count) {
    if (!id) issues.push({ key: "no-id", sellerId: id, text: n === 1 ? "An entry has no seller_id." : `${n} entries have no seller_id.` });
    else if (n > 1) issues.push({ key: `dup-${id}`, sellerId: id, text: `Seller ID ${id} is listed ${n} times; keep one.` });
  }
  const told = new Set<string>();
  for (const s of file.sellers) {
    const id = String(s.seller_id ?? "").trim();
    // One set of issues per ID: a duplicate is already said above.
    if (!id || told.has(id)) continue;
    told.add(id);
    const at = (k: string, text: string) => issues.push({ key: `${k}-${id}`, sellerId: id, text });
    if (typeof s.seller_id !== "string" || s.seller_id !== id) {
      at("id", `Seller ID ${id} is not written as plain text.`);
    }
    const type = String(s.seller_type ?? "");
    const confidential = Number(s.is_confidential ?? 0) === 1;
    if (!TYPES.includes(type)) {
      at("type", `Seller ${id} needs a seller_type of PUBLISHER, INTERMEDIARY or BOTH${type ? `, not "${type}"` : ""}.`);
    }
    if (confidential) {
      const out = (["name", "domain"] as const).filter((f) => s[f] !== undefined && s[f] !== "");
      if (out.length) at("conf", `Seller ${id} is confidential, so its ${out.join(" and ")} ${out.length > 1 ? "stay" : "stays"} out of the file.`);
      continue;
    }
    const name = String(s.name ?? "");
    if (!name.trim()) at("name", `Seller ${id} needs a name.`);
    const domain = s.domain === undefined || s.domain === null ? "" : String(s.domain);
    if (type.toUpperCase() !== "INTERMEDIARY" && !domain.trim()) {
      at("domain", `Seller ${id} needs its domain.`);
    } else if (domain && !DOMAIN.test(domain)) {
      at("bad", `Seller ${id}'s domain "${domain}" is not a plain domain.`);
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
    if (e.name !== undefined) next.name = e.name.trim();
    if (e.domain !== undefined) {
      if (e.domain.trim()) next.domain = norm(e.domain);
      else delete next.domain;
    }
    return { ...r, suggested: next };
  });
}

/** A row that waits for the reader: an add we could not fully identify, or
 *  a fix that needs a name or domain only they know. */
export function needsFillIn(r: SellerRow): boolean {
  return (r.kind === "add" && !r.defaultOn) || Boolean(r.ask?.length);
}

/** The fields the reader fills in on a row: who an unsure add is, or what
 *  a fix needs that no publisher told us. */
export function fillInFields(r: SellerRow): ("name" | "domain")[] {
  if (r.kind === "add") return r.defaultOn ? [] : ["name", "domain"];
  return r.ask ?? [];
}
