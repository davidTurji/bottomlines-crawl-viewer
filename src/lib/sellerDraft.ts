import { validate, withEdits, type Edit, type FillField, type SellerRow } from "./sellersFix";

/** UI-only confirmation; never written into sellers.json. */
export type SellerDraft = Edit & { noWebsite?: boolean };

export function draftEdit(draft: SellerDraft = {}): Edit {
  const { noWebsite, ...edit } = draft;
  return noWebsite ? { ...edit, domain: "" } : edit;
}

export function draftEdits(drafts: Record<string, SellerDraft>): Record<string, Edit> {
  return Object.fromEntries(Object.entries(drafts).map(([id, draft]) => [id, draftEdit(draft)]));
}

export function sameDraft(a: SellerDraft = {}, b: SellerDraft = {}): boolean {
  return a.name === b.name && a.domain === b.domain && a.seller_type === b.seller_type && Boolean(a.noWebsite) === Boolean(b.noWebsite);
}

/** Validate the proposed entry, rather than the publisher's relationship. */
export function checkSellerDraft(row: SellerRow, draft: SellerDraft = {}) {
  if (row.kind === "remove" || row.kind === "keep") {
    return { ready: true, fields: [] as FillField[], errors: {} as Partial<Record<FillField, string>>, other: [] as string[] };
  }
  const candidate = withEdits([row], { [row.seller_id]: draftEdit(draft) })[0].suggested;
  const errors: Partial<Record<FillField, string>> = {};
  const other: string[] = [];
  if (candidate) {
    for (const issue of validate({ version: "1.0", sellers: [candidate] })) {
      if (issue.key.startsWith("name-")) errors.name = "Enter a seller name.";
      else if (issue.key.startsWith("type-")) errors.seller_type = "Choose a role.";
      else if (issue.key.startsWith("bad-")) errors.domain = "Enter a valid domain.";
      else other.push(issue.text);
    }
    if (Number(candidate.is_confidential ?? 0) !== 1 && !String(candidate.domain ?? "").trim() && !draft.noWebsite) {
      errors.domain = "Enter a domain or select No website.";
    }
  } else other.push("This suggestion cannot be added.");
  const wanted = new Set<FillField>([...(row.ask ?? []), ...Object.keys(errors) as FillField[]]);
  if (row.suggested && Number(row.suggested.is_confidential ?? 0) !== 1 && !String(row.suggested.domain ?? "").trim()) wanted.add("domain");
  const fields = (["name", "domain", "seller_type"] as FillField[]).filter(field => wanted.has(field));
  return { ready: Object.keys(errors).length === 0 && other.length === 0, fields, errors, other };
}
