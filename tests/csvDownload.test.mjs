import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const fileSource=ts.transpileModule(fs.readFileSync(new URL('../src/lib/fileDownload.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const fileModule='data:text/javascript;base64,'+Buffer.from(fileSource).toString('base64');
const source=ts.transpileModule(fs.readFileSync(new URL('../src/lib/csvDownload.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {csvCell,csvLine,downloadCsvParts}=await import('data:text/javascript;base64,'+Buffer.from(source.replace('./fileDownload',fileModule)).toString('base64'));
test('CSV quoting preserves commas, quotes, accents and line breaks',()=>{
  assert.equal(csvLine(['Café, Inc.','"quoted"','line\nbreak',null,42]),'"Café, Inc.","""quoted""","line\nbreak","","42"');
});
for(const prefix of ['=','+','-','@','\t','\r'])test(`spreadsheet formula prefix ${JSON.stringify(prefix)} stays plain text`,()=>{
  assert.equal(csvCell(prefix+'danger'),`"'${prefix}danger"`);
});
test('CSV stays available after the click and revokes its URL after the delayed handoff',async()=>{
  const original={document:globalThis.document,window:globalThis.window,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
  const events=[];let cleanup,delay,blob;
  try{
    URL.createObjectURL=value=>{blob=value;return 'blob:local-export';};
    URL.revokeObjectURL=url=>events.push(['revoke',url]);
    globalThis.document={createElement:()=>({click(){events.push(['click',this.href,this.download]);},remove(){events.push(['remove']);}}),body:{appendChild(){events.push(['append']);}}};
    globalThis.window={setTimeout:(callback,ms)=>{cleanup=callback;delay=ms;}};
    downloadCsvParts(['\uFEFF',csvLine(['Café, Inc.'])],'publishers.csv');
    assert.equal(blob.type,'text/csv;charset=utf-8');assert.equal(await blob.text(),csvLine(['Café, Inc.']));
    assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())].slice(0,3),[239,187,191]);
    assert.deepEqual(events,[['append'],['click','blob:local-export','publishers.csv'],['remove']]);
    assert.ok(delay>=1000);cleanup();assert.deepEqual(events.at(-1),['revoke','blob:local-export']);
  }finally{
    globalThis.document=original.document;globalThis.window=original.window;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;
  }
});
