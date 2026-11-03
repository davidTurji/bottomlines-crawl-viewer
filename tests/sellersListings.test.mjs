// The Sellers.json page's source lines (David, 2026-11-03: every line, never
// "Plus N more"). A report baked from 2026-11-03 stores every publisher that
// lists a seller ID; an older one stored the first 50 of each relationship.
// The suggestions and the file the customer downloads read only the whole
// counts, so they must be the same either way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/lib/sellersFix.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { suggest, buildExport } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const pad = (i) => String(i).padStart(4, '0');
const pubs = (prefix, n, found_in = 'ads.txt') =>
  Array.from({ length: n }, (_, i) => ({ domain: `${prefix}${pad(i)}.madeupmedia.com`, name: `${prefix} ${i}`, found_in }));
const sighting = (seller_id, relationship, publishers, cutTo) => ({
  seller_id, relationship, publishers_total: publishers.length,
  publishers: cutTo === undefined ? publishers : publishers.slice(0, cutTo),
});

// Every kind of row: a keep with 2,017 DIRECT and 140 RESELLER publishers, a
// fix (no name) with 60, an add nobody's file has with 75, a removal nobody
// lists, a small one with 3, and a duplicate ID.
const FILE = {
  version: '1.0',
  sellers: [
    { seller_id: 'big', name: 'Big Seller', domain: 'big.madeupmedia.com', seller_type: 'PUBLISHER' },
    { seller_id: 'noname', domain: 'noname.madeupmedia.com', seller_type: 'INTERMEDIARY' },
    { seller_id: 'gone', name: 'Gone', domain: 'gone.madeupmedia.com', seller_type: 'PUBLISHER' },
    { seller_id: 'small', name: 'Small', domain: 'small.madeupmedia.com', seller_type: 'BOTH' },
    { seller_id: 'twice', name: 'Twice', domain: 'twice.madeupmedia.com', seller_type: 'PUBLISHER' },
    { seller_id: 'twice', name: 'Twice', domain: 'twice.madeupmedia.com', seller_type: 'PUBLISHER' },
  ],
};
const WHOLE = [
  ['big', 'DIRECT', pubs('a', 2017, 'ads.txt + app-ads.txt')],
  ['big', 'RESELLER', pubs('r', 140)],
  ['newone', 'DIRECT', pubs('n', 75, 'app-ads.txt')],
  ['noname', 'RESELLER', pubs('m', 60)],
  ['small', 'DIRECT', pubs('s', 3)],
  ['twice', 'DIRECT', pubs('t', 51)],
];
const whole = WHOLE.map(([id, rel, p]) => sighting(id, rel, p));
const cut = WHOLE.map(([id, rel, p]) => sighting(id, rel, p, 50));
const DOMAIN = 'ssp.madeupmedia.com';

const byId = (rows) => Object.fromEntries(rows.map((r) => [`${r.kind}:${r.seller_id}`, r]));

test('a whole list holds every line its count says, and is never marked cut', () => {
  const rows = byId(suggest(FILE, whole, DOMAIN));
  const big = rows['keep:big'];
  assert.equal(big.listings.length, 2017 + 140);
  assert.equal(big.listingsTotal, 2017 + 140);
  assert.equal(big.listingsCut, undefined);
  for (const r of Object.values(rows)) {
    assert.equal(r.listingsCut, undefined, r.seller_id);
    if (r.listingsTotal !== undefined) assert.equal(r.listings.length, r.listingsTotal, r.seller_id);
  }
  // Each line once: publisher and relationship, as the book folds them.
  assert.equal(new Set(big.listings.map((l) => `${l.relationship}|${l.publisher}`)).size, 2017 + 140);
});

test('an older report cut at 50 is marked cut, with its whole count', () => {
  const rows = byId(suggest(FILE, cut, DOMAIN));
  assert.equal(rows['keep:big'].listings.length, 100);
  assert.equal(rows['keep:big'].listingsTotal, 2157);
  assert.equal(rows['keep:big'].listingsCut, true);
  assert.equal(rows['add:newone'].listingsCut, true);
  assert.equal(rows['fix:noname'].listingsCut, true);
  assert.equal(rows['fix:twice'].listingsCut, true); // 51 publishers, one past the cut
  // Exactly 50 or fewer were never cut.
  assert.equal(rows['keep:small'].listingsCut, undefined);
  assert.equal(rows['keep:small'].listings.length, 3);
});

test('the suggestions and the downloaded file are the same, whole or cut', () => {
  const strip = (r) => {
    const { listings, listingsCut, direct, reseller, ...rest } = r;
    return rest;
  };
  const a = suggest(FILE, whole, DOMAIN);
  const b = suggest(FILE, cut, DOMAIN);
  assert.deepEqual(a.map(strip), b.map(strip));
  // Same counts behind every row.
  assert.deepEqual(a.map((r) => r.listingsTotal), b.map((r) => r.listingsTotal));
  const all = new Set(a.map((r) => r.seller_id));
  assert.deepEqual(buildExport(FILE, a, all), buildExport(FILE, b, all));
});

test("an add's reason names the same publishers and the same count", () => {
  const reason = (s) => byId(suggest(FILE, s, DOMAIN))['add:newone'].reason;
  assert.equal(reason(whole), reason(cut));
  assert.match(reason(whole), /Listed DIRECT by 75 publishers \(n0000\.madeupmedia\.com, n0001\.madeupmedia\.com and 73 more\)/);
});
