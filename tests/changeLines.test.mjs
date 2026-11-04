import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/lib/changeLines.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { foldChangeEvents, withKeptLines, changeLineKey } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const ev = (extra = {}) => ({
  developer_id: 7, event: 'removed', ssp_domain: 'ssp.madeupmedia.com', publisher_id: '3199392', relationship: 'DIRECT',
  file_kind: 'ads_txt', host: 'smartline.madeupmedia.com', matched_seat: true, ...extra,
});

test('a seat removed from ads.txt and app-ads.txt is one line, removed from both', () => {
  const lines = foldChangeEvents([ev(), ev({ file_kind: 'app_ads_txt' })]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].found_in, 'both');
});

test('a seat removed from one file only says that file', () => {
  assert.deepEqual(foldChangeEvents([ev({ file_kind: 'app_ads_txt' })]).map((l) => l.found_in), ['app-ads.txt']);
});

test('the same seat at two file hosts is two lines, each its own file', () => {
  const lines = foldChangeEvents([ev(), ev({ host: 'apps.madeupmedia.com', file_kind: 'app_ads_txt' })]);
  assert.deepEqual(lines.map((l) => [l.host, l.found_in]), [['smartline.madeupmedia.com', 'ads.txt'], ['apps.madeupmedia.com', 'app-ads.txt']]);
});

test("an inventory partner's copy is the partner's ads.txt, one per partner", () => {
  const lines = foldChangeEvents([
    ev({ match_type: 'ipd', ipd_partner: 'a.madeupmedia.com', file_kind: 'ads_txt' }),
    ev({ match_type: 'ipd', ipd_partner: 'b.madeupmedia.com', file_kind: 'ads_txt' }),
  ]);
  assert.deepEqual(lines.map((l) => [l.ipd_partner, l.found_in, l.match_type]), [['a.madeupmedia.com', 'ads.txt', 'ipd'], ['b.madeupmedia.com', 'ads.txt', 'ipd']]);
});

test('an unwatched line of an old run-wide report is not a change', () => {
  assert.equal(foldChangeEvents([ev({ matched_seat: false })]).length, 0);
});

test("a line in both files keeps the first file's dates, and its reason only when both agree", () => {
  const first = { last_seen_at: '2026-10-20T17:32:00Z', not_found_at: '2026-11-01T19:12:00Z', date_source: 'fetch' };
  const same = foldChangeEvents([
    ev({ ...first, removal_reason: 'line_not_in_file' }),
    ev({ file_kind: 'app_ads_txt', last_seen_at: '2026-10-20T17:40:00Z', removal_reason: 'line_not_in_file' }),
  ])[0];
  assert.equal(same.last_seen_at, first.last_seen_at);
  assert.equal(same.not_found_at, first.not_found_at);
  assert.equal(same.removal_reason, 'line_not_in_file');
  const split = foldChangeEvents([
    ev({ removal_reason: 'line_not_in_file' }),
    ev({ file_kind: 'app_ads_txt', removal_reason: 'file_not_served', removal_detail: '404 on 3 reads' }),
  ])[0];
  assert.equal(split.removal_reason, undefined);
  assert.equal(split.removal_detail, undefined);
});

test('every event is kept: 450 seats in both files are 450 lines', () => {
  const events = [];
  for (let i = 0; i < 450; i++) for (const file_kind of ['ads_txt', 'app_ads_txt']) events.push(ev({ publisher_id: `p${i}`, file_kind }));
  const lines = foldChangeEvents(events);
  assert.equal(lines.length, 450);
  assert.ok(lines.every((l) => l.found_in === 'both'));
});

test("the publisher's own file is one place whether a line says its domain or nothing", () => {
  const a = changeLineKey({ ssp_domain: 'SSP.madeupmedia.com', publisher_id: 'AB1', relationship: 'direct', host: 'smartline.madeupmedia.com' }, 'smartline.madeupmedia.com');
  const b = changeLineKey({ ssp_domain: 'ssp.madeupmedia.com', publisher_id: 'ab1', relationship: 'DIRECT', host: null }, 'smartline.madeupmedia.com');
  assert.equal(a, b);
  assert.notEqual(a, changeLineKey({ ssp_domain: 'ssp.madeupmedia.com', publisher_id: 'ab1', relationship: 'DIRECT', host: 'apps.madeupmedia.com' }, 'smartline.madeupmedia.com'));
});

test('the whole list keeps the held lines exactly (their certs), adds the rest, and never drops one', () => {
  const held = [{ ssp_domain: 'ssp.madeupmedia.com', publisher_id: 'p0', relationship: 'DIRECT', cert_id: 'cert-0', found_in: 'ads.txt', host: null },
                { ssp_domain: 'ssp.madeupmedia.com', publisher_id: 'gone', relationship: 'DIRECT', found_in: 'ads.txt', host: null }];
  const loaded = foldChangeEvents([ev({ publisher_id: 'p0' }), ev({ publisher_id: 'p1' })], { publisherDomain: 'smartline.madeupmedia.com' });
  const whole = withKeptLines(loaded, held, 'smartline.madeupmedia.com');
  assert.deepEqual(whole.map((l) => [l.publisher_id, l.cert_id]), [['p0', 'cert-0'], ['p1', undefined], ['gone', undefined]]);
  assert.equal(whole[0], held[0], 'the held line itself, unchanged');
});

test("a cert window's lines say their old cert when the event does", () => {
  const [line] = foldChangeEvents([ev({ event: 'changed', old_cert_id: 'old1', new_cert_id: 'new1' })], { cert: true });
  assert.equal(line.old_cert_id, 'old1');
  assert.equal(line.cert_id, 'new1');
  const [plain] = foldChangeEvents([ev({ old_cert_id: 'old1', new_cert_id: 'new1' })]);
  assert.equal(plain.old_cert_id, undefined);
});
