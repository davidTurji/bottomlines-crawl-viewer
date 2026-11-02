import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/lib/rowFiles.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { rowFilesOf, lineFileBits } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const line = (pid, extra = {}) => ({ ssp_domain: 'ssp.madeupmedia.com', publisher_id: pid, relationship: 'DIRECT', ...extra });

test('the frozen fact wins over the lines', () => {
  assert.equal(rowFilesOf([line('a', { found_in: 'ads.txt' })], true, 'app-ads.txt'), 'app-ads.txt');
});

test('the crawler line rule: found_in word, else file_kind, a partner line is ads.txt', () => {
  assert.equal(lineFileBits(line('a', { found_in: 'Both' })), 3);
  assert.equal(lineFileBits(line('a', { file_kind: 'app_ads_txt' })), 2);
  assert.equal(lineFileBits(line('a', { file_kind: 'ads_txt' })), 1);
  assert.equal(lineFileBits(line('a', { match_type: 'ipd' })), 1);
  assert.equal(lineFileBits(line('a', { ipd_partner: 'partner.madeupmedia.com' })), 1);
  assert.equal(lineFileBits(line('a')), 0);
  // One ads.txt line and one app-ads.txt line known only by file_kind: both.
  assert.equal(rowFilesOf([line('a', { file_kind: 'ads_txt' }), line('b', { file_kind: 'app_ads_txt' })], true), 'both');
});

test('cut lines say only both', () => {
  assert.equal(rowFilesOf([line('a', { found_in: 'ads.txt' })], false), null);
  assert.equal(rowFilesOf([line('a', { found_in: 'ads.txt' }), line('b', { found_in: 'app-ads.txt' })], false), 'both');
});

test('on a change tab under a seat filter, only the selected seats count (Seller ID folded)', () => {
  const moved = [line('SellerA', { found_in: 'ads.txt' }), line('sellerb', { found_in: 'app-ads.txt' })];
  assert.equal(rowFilesOf(moved, true), 'both');
  assert.equal(rowFilesOf(moved, true, null, ['ssp.madeupmedia.com|sellera|DIRECT']), 'ads.txt');
  assert.equal(rowFilesOf(moved, true, null, ['SSP.madeupmedia.com|SELLERB|direct']), 'app-ads.txt');
});
