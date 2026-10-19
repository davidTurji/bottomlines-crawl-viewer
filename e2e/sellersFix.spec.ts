import { test, expect } from "@playwright/test";
import { suggest, validate, buildExport, withEdits, type Seller, type Sighting } from "../src/lib/sellersFix";

const seller: Seller = { seller_id: "AbC123", name: "Paid entity", domain: "owner.example", seller_type: "PUBLISHER" };
const sightings: Sighting[] = [
  { seller_id: " abc123 ", relationship: "DIRECT", publishers: [{ domain: "Site.example", found_in: "ads.txt" }] },
  { seller_id: "ABC123", relationship: "RESELLER", publishers: [{ domain: "another.example", found_in: "app-ads.txt" }] },
];

test("case and surrounding spaces join all evidence without changing the published ID or role", () => {
  const file = { version: "1.0", sellers: [seller] };
  const rows = suggest(file, sightings, "exchange.example");
  expect(rows).toHaveLength(1);
  expect(rows[0].kind).toBe("keep");
  expect(rows[0].direct).toEqual(["site.example"]);
  expect(rows[0].reseller).toEqual(["another.example"]);
  expect(buildExport(file, rows, new Set(["AbC123"]))).toEqual(file);
});

for (const role of ["PUBLISHER", "INTERMEDIARY", "BOTH", "publisher", "intermediary", "both"]) {
  test(`preserves valid ${role} despite mixed declarations`, () => {
    const file = { version: "1.0", sellers: [{ ...seller, seller_type: role }] };
    const rows = suggest(file, sightings, "exchange.example");
    expect(rows[0].changes).toEqual([]);
    expect(rows[0].kind).toBe("keep");
    expect(validate(file)).toEqual([]);
  });
}

test("missing and ads.txt-style roles require a choice, never an inferred BOTH", () => {
  for (const role of ["", "DIRECT", "RESELLER", "UNKNOWN"]) {
    const rows = suggest({ sellers: [{ ...seller, seller_type: role }] }, sightings, "exchange.example");
    expect(rows[0].ask).toContain("seller_type");
    expect(rows[0].changes.some(c => c.field === "seller_type")).toBe(false);
  }
});

test("an added account waits for its identity and role, and exports the user's choice", () => {
  const file = { version: "1.0", sellers: [] };
  const rows = suggest(file, sightings, "exchange.example");
  expect(rows).toHaveLength(1);
  expect(rows[0].suggested).toEqual({ seller_id: "abc123", name: "", seller_type: "" });
  expect(rows[0].ask).toContain("seller_type");
  const edited = withEdits(rows, { abc123: { name: "Paid company", domain: "paid.example", seller_type: "INTERMEDIARY" } });
  const out = buildExport(file, edited, new Set(["abc123"]));
  expect(out.sellers[0].seller_type).toBe("INTERMEDIARY");
  expect(validate(out)).toEqual([]);
});

test("a DIRECT file does not replace the paid entity's business domain", () => {
  const rows = suggest({ sellers: [seller] }, [sightings[0]], "exchange.example");
  expect(rows[0].suggested?.domain).toBe("owner.example");
  expect(rows[0].changes).toEqual([]);
});

test("SEGA own-file evidence prevents an unseen suggestion without inferring a role", () => {
  const sega = { ...seller, seller_id: "10360", domain: "sega.com" };
  const rows = suggest({ sellers: [sega] }, [{ seller_id: "10360", relationship: "DIRECT", publishers: [{ domain: "sega.com", found_in: "app-ads.txt", own_file: true }] }], "kinetix.tv");
  expect(rows[0].kind).toBe("keep");
  expect(rows[0].listings[0].own).toBe(true);
});

test("a missing domain is a review, including intermediaries; no domain is invented", () => {
  for (const role of ["PUBLISHER", "INTERMEDIARY", "BOTH"]) {
    const rows = suggest({ sellers: [{ ...seller, domain: undefined, seller_type: role }] }, sightings, "exchange.example");
    expect(rows[0].ask).toContain("domain");
    expect(rows[0].suggested?.domain).toBeUndefined();
  }
});

test("version is exactly 1.0 and missing web presence is not invented", () => {
  expect(validate({ version: "2.0", sellers: [] }).some(i => i.field === "version")).toBe(true);
  expect(validate({ version: "1.0", sellers: [{ ...seller, domain: undefined }] })).toEqual([]);
});

test("unreadable and legacy evidence never offer a seller for removal", () => {
  const file = {version:"1.0", sellers:[{...seller, seller_id:"10360",domain:"sega.com"}]};
  const blocked = [{url:"https://sega.com/ads.txt",seller_ids:["10360"],status:"absent" as const},
    {url:"https://sega.com/app-ads.txt",seller_ids:["10360"],status:"unverified" as const}];
  for (const checks of [[], blocked]) {
    const rows=suggest(file,[],"kinetix.tv",checks);
    expect(rows[0].unverified).toBe(true);
    expect(rows[0].kind).toBe("keep");
    expect(buildExport(file,rows,new Set(["10360"]))).toEqual(file);
  }
});

test("only complete checked paths can support a not-seen review", () => {
  const file={sellers:[seller]};
  const checks=["ads.txt","app-ads.txt"].map(path=>({url:`https://owner.example/${path}`,seller_ids:["abc123"],status:"checked" as const}));
  expect(suggest(file,[],"exchange.example",checks)[0].kind).toBe("remove");
  const seen=suggest(file,sightings,"exchange.example",checks)[0];
  expect(seen.kind).toBe("keep");
  expect(seen.current?.seller_type).toBe("PUBLISHER");
});
