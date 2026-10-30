import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/lib/completePages.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { eachPage } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('reads every narrower server page, beyond old discovery page ceilings', async () => {
  const rows = [];
  assert.equal(await eachPage(async page => ({rows: [page], total: 2001, page_size: 1}), 200, batch => rows.push(...batch)), 2001);
  assert.equal(rows.at(-1), 2001);
});
test('empty complete list succeeds', async () => {
  assert.equal(await eachPage(async () => ({ rows: [], total: 0 }), 500, () => {}), 0);
});
for (const total of [undefined, null, -1, 1.5, NaN, Infinity]) {
  test(`rejects unverifiable total ${total}`, async () => {
    await assert.rejects(eachPage(async () => ({ rows: [1], total }), 500, () => {}), /could not be verified/);
  });
}
for (const flag of ['truncated', 'cut']) {
  test(`rejects ${flag}`, async () => {
    await assert.rejects(eachPage(async () => ({ rows: [1], total: 1, [flag]: true }), 500, () => {}), /incomplete/);
  });
}
test('rejects changing total', async () => {
  await assert.rejects(eachPage(async page => ({rows: [page], total: page === 1 ? 3 : 2}), 500, () => {}), /changed/);
});
test('rejects early empty page', async () => {
  await assert.rejects(eachPage(async page => ({rows: page === 1 ? [1] : [], total: 2}), 500, () => {}), /only 1/);
});
test('rejects excess rows', async () => {
  await assert.rejects(eachPage(async () => ({rows: [1, 2], total: 1}), 500, () => {}), /more rows/);
});
test('rejects roster shorter than report headline', async () => {
  await assert.rejects(eachPage(async () => ({rows: [1], total: 1}), 500, () => {}, undefined, undefined, {expectedTotal: 2}), /does not contain all/);
});
test('rejects repeated page even when count would agree', async () => {
  await assert.rejects(eachPage(async () => ({rows: [1], total: 2}), 500, () => {}, undefined, undefined, {key: String}), /repeated/);
});
test('honours cancelled exports', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(eachPage(async () => { throw Error('must not fetch'); }, 500, () => {}, undefined, controller.signal), {name: 'AbortError'});
});
test('retries transient failure without duplicating rows', async () => {
  let calls = 0; const result = [];
  await eachPage(async () => { if (++calls === 1) throw Error('temporary'); return {rows: [1], total: 1}; }, 500, rows => result.push(...rows));
  assert.equal(calls, 2); assert.deepEqual(result, [1]);
});
