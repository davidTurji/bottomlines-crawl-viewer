import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/askAttachment.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { attachmentId, matchesAttachment, isPastedList } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('short identifier lists attach, ordinary multiline questions remain text', () => {
  for (const text of ['com.first.app\ncom.second.app', 'domain\nexample.com', 'Seller ID\n1045', 'https://example.com\nhttps://example.org']) {
    assert.equal(isPastedList(text), true, text);
  }
  for (const text of ['What changed?\nShow the lost apps.', 'Is example.com in my report?', 'example.com']) {
    assert.equal(isPastedList(text), false, text);
  }
});

test('same-name replacement cannot download different data under an earlier answer', async () => {
  const original = await attachmentId(new Blob(['bundle\ncom.one.app']));
  const replacement = await attachmentId(new Blob(['bundle\ncom.other.app']));
  const message = { downloadFile: 'list.csv', downloadId: original };
  assert.equal(matchesAttachment(message, { name: 'list.csv', id: replacement, state: 'ready' }), false);
  assert.equal(matchesAttachment(message, { name: 'list.csv', id: original, state: 'reading' }), false);
  assert.equal(matchesAttachment(message, null), false);
  const reattached = await attachmentId(new Blob(['bundle\ncom.one.app']));
  assert.equal(matchesAttachment(message, { name: 'list.csv', id: reattached, state: 'ready' }), true);
  assert.equal(matchesAttachment({ downloadFile: 'list.csv' }, { name: 'list.csv', id: original, state: 'ready' }), false);
});
