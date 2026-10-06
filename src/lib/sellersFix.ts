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
 *             written as a URL, a seller_type in the wrong case, a missing
 *             value) or that disagrees with what publishers list;
 *   - remove  an entry no crawled file lists (the seller may sit on sites
 *             outside the crawl).
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
  publishers: { domain: string; name?: string | null; found_in: string }[];
  /** How many publishers carry it, always whole; the list above may be cut. */
  publishers_total?: number;
};

/** One field the fix changes. ``to: null`` drops the key from the entry. */
export type FieldChange = {
  field: "seller_id" | "seller_type" | "domain" | "name";
  from?: string;
  to: string | null;
};

/** What the reader can type on a row. */
export type FillField = "name" | "domain" | "seller_type";

export type SellerRow = {
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

/** Words files use for "no domain" that are not one. */
const PLACEHOLDER = /^(n\/?a|none|null|undefined|-+|tbd|unknown)$/i;

/** seller_type values written the ads.txt way, and what sellers.json says. */
const ADSTXT_TYPE: Record<string, SellerType> = { DIRECT: "PUBLISHER", RESELLER: "INTERMEDIARY" };

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

function expectedType(direct: string[], reseller: string[]): SellerType {
  if (direct.length && reseller.length) return "BOTH";
  return direct.length ? "PUBLISHER" : "INTERMEDIARY";
}

type Seen = {
  direct: Set<string>;
  reseller: Set<string>;
  dN: number;
  rN: number;
  names: Map<string, string>;
  listings: Listing[];
};

export function suggest(file: SellersFile, sightings: Sighting[], ownDomain: string): SellerRow[] {
  // Per ID: the publishers we were sent, and how many there are in all
  // (the sent list may be the first of them; a count is never read off it).
  const seen = new Map<string, Seen>();
  for (const s of sightings) {
    const id = String(s.seller_id).trim();
    let e = seen.get(id);
    if (!e) {
      e = { direct: new Set(), reseller: new Set(), dN: 0, rN: 0, names: new Map(), listings: [] };
      seen.set(id, e);
    }
    const total = Math.max(Number(s.publishers_total ?? 0), s.publishers.length);
    if (s.relationship === "DIRECT") e.dN += total;
    else e.rN += total;
    for (const p of s.publishers) {
      const d = norm(p.domain);
      if (!d) continue;
      (s.relationship === "DIRECT" ? e.direct : e.reseller).add(d);
      e.listings.push({ relationship: s.relationship, publisher: d, found_in: p.found_in });
      if (p.name) e.names.set(d, p.name);
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

  // Publishers' spelling of an ID the file writes in another case: the
  // same seller to a reader, two different IDs to a buyer's check.
  const byLower = new Map<string, string[]>();
  for (const id of seen.keys()) {
    const k = id.toLowerCase();
    byLower.set(k, [...(byLower.get(k) ?? []), id]);
  }
  const claimed = new Set<string>(byId.keys());

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

    // The evidence: publishers' lines under this exact ID, else under the
    // same ID in another case.
    let evidenceId = id;
    if (!seen.has(id)) {
      const alt = (byLower.get(id.toLowerCase()) ?? []).filter((x) => !claimed.has(x));
      if (alt.length) {
        evidenceId = alt.sort((a, b) => (seen.get(b)!.dN + seen.get(b)!.rN) - (seen.get(a)!.dN + seen.get(a)!.rN))[0];
        claimed.add(evidenceId);
      }
    }
    const e = seen.get(evidenceId);
    const direct = e ? [...e.direct].sort() : [];
    const reseller = e ? [...e.reseller].sort() : [];
    const dN = e ? Math.max(e.dN, direct.length) : 0;
    const rN = e ? Math.max(e.rN, reseller.length) : 0;
    const oneDirect = dN === 1 && direct.length === 1 ? direct[0] : null;

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
    const ask: FillField[] = [];
    let check = false;
    const change = (field: FieldChange["field"], to: string | null, why: string, isCheck = false) => {
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
          : direct.includes(norm(cur.domain))
            ? `Listed ${copies} times in your file with different details; the entry publishers agree with is kept.`
            : `Listed ${copies} times in your file with different details; the most complete entry is kept.`,
      );
    }

    // THE ID. Publishers' spelling when only the case differs (a check:
    // which spelling is right is the customer's to say); else as text,
    // trimmed. A number too long for a browser is never rewritten: its
    // digits are already lost here (the page says so and holds the export).
    if (evidenceId !== id) {
      change(
        "seller_id",
        evidenceId,
        `Publishers write this ID as ${evidenceId}, your file as ${id}. IDs must match exactly; check which spelling is right.`,
        true,
      );
    } else if (unsafeNumber(cur.seller_id)) {
      // Left as it is; see unsafeNumbers().
    } else if (typeof cur.seller_id !== "string") {
      change("seller_id", id, "The seller_id is a number; sellers.json wants it as text.");
    } else if (cur.seller_id !== id) {
      change("seller_id", id, "The seller_id has spaces around it.");
    }

    // THE TYPE. A written-wrong type is fixed; a valid type publishers
    // disagree with is a check, and BOTH is never narrowed: a role the crawl
    // did not see is not proof the seller lacks it.
    const confidential = Number(cur.is_confidential ?? 0) === 1;
    const typed = String(cur.seller_type ?? "").trim().toUpperCase();
    const want = e ? expectedType(direct, reseller) : null;
    if (TYPES.includes(typed)) {
      if (want && typed !== want && typed !== "BOTH") {
        change(
          "seller_type",
          want,
          want === "BOTH"
            ? `Listed as DIRECT by ${plural(dN, "publisher", "publishers")} and as RESELLER by ${rN.toLocaleString()}, so maybe BOTH; check before changing.`
            : want === "INTERMEDIARY"
              ? `Only ever listed as RESELLER (by ${plural(rN, "publisher", "publishers")}), so maybe INTERMEDIARY; check before changing.`
              : `Only ever listed as DIRECT (by ${names(direct, dN)}), so maybe PUBLISHER; check before changing.`,
          true,
        );
      } else if (cur.seller_type !== typed) {
        change("seller_type", typed, `The seller_type is written "${cur.seller_type}"; sellers.json wants ${typed}.`);
      }
    } else if (ADSTXT_TYPE[typed]) {
      const to = want ?? ADSTXT_TYPE[typed];
      change("seller_type", to, `The seller_type is written ${cur.seller_type}, the ads.txt word; sellers.json says ${to}.`);
    } else if (want) {
      change(
        "seller_type",
        want,
        typed
          ? `"${cur.seller_type}" is not a seller_type; publishers' lines say ${want}.`
          : `Your file has no seller_type for it; publishers' lines say ${want}.`,
      );
    } else {
      ask.push("seller_type");
      reasons.push(
        typed ? `"${cur.seller_type}" is not a seller_type. Pick the right one.` : "Your file has no seller_type for it. Pick one.",
      );
    }
    const finalType = String(changes.find((c) => c.field === "seller_type")?.to ?? typed);

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
      const needsDomain = finalType !== "INTERMEDIARY";
      if (!raw.trim()) {
        // A missing domain, filled from the one publisher selling it DIRECT.
        if (needsDomain && oneDirect) {
          change("domain", oneDirect, `Your file has no domain for it; only ${oneDirect} lists it as DIRECT.`);
        } else if (needsDomain) {
          ask.push("domain");
          reasons.push(`A ${finalType || "PUBLISHER"} needs its domain and your file has none. Type it.`);
        }
      } else if (valid) {
        if (needsDomain && oneDirect && clean !== oneDirect) {
          // A valid domain publishers disagree with: a check.
          change("domain", oneDirect, `Only ${oneDirect} lists it as DIRECT; your file says ${raw}. Check before changing.`, true);
        } else if (clean !== raw) {
          change("domain", clean, domainProblem(raw));
        }
      } else if (needsDomain && oneDirect) {
        change("domain", oneDirect, `"${raw}" is not a domain; only ${oneDirect} lists it as DIRECT.`);
      } else if (needsDomain) {
        ask.push("domain");
        reasons.push(`"${raw}" is not a domain. Type the seller's domain.`);
      } else {
        // An intermediary's domain is optional: a broken one is better out.
        change(
          "domain",
          null,
          PLACEHOLDER.test(raw.trim())
            ? `"${raw}" is a placeholder, not a domain. An INTERMEDIARY may leave the domain out.`
            : `"${raw}" is not a domain. An INTERMEDIARY may leave the domain out.`,
        );
      }

      const name = String(cur.name ?? "");
      if (!name.trim()) {
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
        reason: `No ads.txt or app-ads.txt we crawled lists ID ${id} under ${ownDomain}. It may sit on sites outside this crawl.`,
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
      else next[c.field] = c.to;
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
      ...(evidenceId !== id ? { listedAs: evidenceId } : {}),
    });
  }

  const adds = [...seen.keys()].filter((id) => !claimed.has(id)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const id of adds) {
    const e = seen.get(id)!;
    const direct = [...e.direct].sort();
    const reseller = [...e.reseller].sort();
    const dN = Math.max(e.dN, direct.length);
    const rN = Math.max(e.rN, reseller.length);
    const type = expectedType(direct, reseller);
    const oneDirect = dN === 1 && direct.length === 1 ? direct[0] : null;
    const onRecord = oneDirect ? e.names.get(oneDirect) : undefined;
    // Never named for them (David, 2026-10-06): the customer confirms the
    // account is theirs and types its name. A domain is filled only when
    // one publisher alone sells it DIRECT.
    const reason = oneDirect
      ? `Listed as DIRECT by ${oneDirect}${onRecord ? ` (on record as ${onRecord})` : ""}, but missing from your file. Type the seller's name to add it.`
      : dN > 1
        ? `Listed as DIRECT by ${plural(dN, "publisher", "publishers")} (${names(direct, dN)}), but missing from your file. Type who it is to add it.`
        : `Listed as RESELLER by ${plural(rN, "publisher", "publishers")}, but missing from your file. Type who the reseller is to add it.`;
    rows.push({
      seller_id: id,
      kind: "add",
      current: null,
      suggested: { seller_id: id, name: "", ...(oneDirect && type !== "INTERMEDIARY" ? { domain: oneDirect } : {}), seller_type: type },
      changes: [],
      reason,
      direct,
      reseller,
      listings: e.listings,
      listingsTotal: dN + rN,
      ask: ["name", "domain"],
    });
  }
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
 * a name, plus a plain domain for a PUBLISHER or BOTH.
 */
export function validate(file: SellersFile, opts: { creating?: boolean } = {}): Issue[] {
  const issues: Issue[] = [];
  // Optional by the spec; asked only of a file the reader builds here.
  if (opts.creating && !EMAIL.test(String(file.contact_email ?? "").trim())) {
    issues.push({ key: "contact_email", field: "contact_email", text: "Add a contact email for the file's header." });
  }
  if (!String(file.version ?? "").trim()) {
    issues.push({ key: "version", field: "version", text: "The file has no version. sellers.json is version 1.0." });
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
    const type = String(s.seller_type ?? "");
    if (!TYPES.includes(type)) {
      at("type", `Seller ${id} needs a seller_type of PUBLISHER, INTERMEDIARY or BOTH${type ? `, not "${type}"` : ""}.`);
    }
    if (Number(s.is_confidential ?? 0) === 1) continue;
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
