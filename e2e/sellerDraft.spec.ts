import { test, expect } from "@playwright/test";
import { checkSellerDraft, draftEdits, type SellerDraft } from "../src/lib/sellerDraft";
import { suggest, withEdits, buildExport, type SellerRow } from "../src/lib/sellersFix";

const file = { version: "1.0", sellers: [] };
const row = () => suggest(file, [{ seller_id: "new", relationship: "DIRECT", publishers: [{ domain: "source.example", found_in: "ads.txt" }] }], "exchange.example")[0];
const identity: SellerDraft = { name: "Payee", seller_type: "INTERMEDIARY" };

test("partial identity stays incomplete even when its publisher is known", () => {
  for (const draft of [{}, { name: "Payee" }, identity]) expect(checkSellerDraft(row(), draft).ready).toBe(false);
  expect(checkSellerDraft(row(), identity).errors).toEqual({ domain: "Enter a domain or select No website." });
});

test("domain or explicit No website completes a non-confidential seller", () => {
  for (const domain of ["payee.example", "https://www.Payee.example/"]) expect(checkSellerDraft(row(), { ...identity, domain }).ready).toBe(true);
  expect(checkSellerDraft(row(), { ...identity, noWebsite: true }).ready).toBe(true);
  expect(checkSellerDraft(row(), { ...identity, domain: "not a domain" }).errors.domain).toBe("Enter a valid domain.");
});

test("No website never becomes a nonstandard JSON field and preserves the draft domain", () => {
  const draft = { ...identity, domain: "old.example", noWebsite: true };
  const edits = draftEdits({ new: draft });
  expect(buildExport(file, withEdits([row()], edits), new Set(["new"])).sellers).toEqual([{ seller_id: "new", name: "Payee", seller_type: "INTERMEDIARY" }]);
  expect(draft.domain).toBe("old.example");
  expect(checkSellerDraft(row(), { ...draft, noWebsite: false }).ready).toBe(true);
});

test("a draft never supplies missing names or infers an account role", () => {
  for (const draft of [{ noWebsite: true }, { name: "Payee", noWebsite: true }, { ...identity, name: "", noWebsite: true }, { ...identity, seller_type: "DIRECT", noWebsite: true }]) {
    expect(checkSellerDraft(row(), draft).ready).toBe(false);
  }
});

test("confidential sellers keep IAB's name/domain exception", () => {
  const confidential = { ...row(), suggested: { seller_id: "new", seller_type: "BOTH", is_confidential: 1 } };
  expect(checkSellerDraft(confidential).ready).toBe(true);
});

test("removing an invalid entry never requires filling it in first", () => {
  expect(checkSellerDraft({ ...row(), kind: "remove", suggested: null } as SellerRow).ready).toBe(true);
});
