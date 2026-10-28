import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {evidencePath,writeEvidenceFile} from '../../scripts/lib/st-evidence-paths.mjs';

function fixture(t){
 const parent=fs.realpathSync(os.tmpdir());
 const base=fs.mkdtempSync(path.join(parent,'st-evidence-paths-'));
 const root=path.join(base,'workspace'),outside=path.join(base,'outside');
 fs.mkdirSync(root);fs.mkdirSync(outside);
 t.after(()=>{
  assert.equal(path.dirname(path.resolve(base)),parent);
  assert.ok(path.basename(base).startsWith('st-evidence-paths-'));
  // Unlink fixture junctions first; cleanup never recursively follows external links.
  for(const name of ['review-link','run-link','internal-link']){
   const candidate=path.join(root,name);
   if(fs.lstatSync(candidate,{throwIfNoEntry:false})?.isSymbolicLink())fs.unlinkSync(candidate);
  }
  fs.rmSync(base,{recursive:true,force:true});
 });
 return {root,outside};
}
test('existing receipt and a new nested receipt stay inside the real workspace',t=>{
 const {root}=fixture(t);fs.writeFileSync(path.join(root,'receipt.json'),'{}');
 assert.equal(evidencePath(root,'receipt.json',{allowMissing:false}),path.join(root,'receipt.json'));
 assert.equal(evidencePath(root,'new/deep/run.json'),path.join(root,'new/deep/run.json'));
 assert.throws(()=>evidencePath(root,'new/run.json',{allowMissing:false}),/missing/);
});
for(const relative of ['../run.json','a/../run.json','/run.json','C:\\run.json','run.json:stream','a//run.json','a./run.json','a /run.json','./run.json']){
 test('rejects ambiguous or escaping path '+relative,t=>{
  const {root}=fixture(t);assert.throws(()=>evidencePath(root,relative));
 });
}
test('rejects an existing review beneath an external junction',t=>{
 const {root,outside}=fixture(t);fs.writeFileSync(path.join(outside,'6004.json'),'{}');
 fs.symlinkSync(outside,path.join(root,'review-link'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>evidencePath(root,'review-link/6004.json'),/real workspace/);
 assert.equal(fs.readFileSync(path.join(outside,'6004.json'),'utf8'),'{}');
});
test('rejects a new run file and missing nested parents beneath an external junction',t=>{
 const {root,outside}=fixture(t);
 fs.symlinkSync(outside,path.join(root,'run-link'),process.platform==='win32'?'junction':'dir');
 for(const relative of ['run-link/6004.json','run-link/new/deep/6004.json'])assert.throws(()=>evidencePath(root,relative),/real workspace/);
 assert.deepEqual(fs.readdirSync(outside),[]);
});
test('accepts internal directory links and checks parents again after replacement',t=>{
 const {root,outside}=fixture(t);const actual=path.join(root,'actual');fs.mkdirSync(actual);
 const link=path.join(root,'internal-link');
 fs.symlinkSync(actual,link,process.platform==='win32'?'junction':'dir');
 assert.equal(evidencePath(root,'internal-link/run.json'),path.join(root,'internal-link/run.json'));
 fs.unlinkSync(link);fs.symlinkSync(outside,link,process.platform==='win32'?'junction':'dir');
 assert.throws(()=>evidencePath(root,'internal-link/run.json'),/real workspace/);
});
test('rejects directory targets and file parents',t=>{
 const {root}=fixture(t);fs.mkdirSync(path.join(root,'directory'));fs.writeFileSync(path.join(root,'file.json'),'{}');
 assert.throws(()=>evidencePath(root,'directory'),/target must be a file/);
 assert.throws(()=>evidencePath(root,'file.json/run.json'),/parent must be a directory/);
});

test('writes a real receipt with new parents and updates only its content',t=>{
 const {root,outside}=fixture(t);
 writeEvidenceFile(root,'new/deep/run.json','{"total":18}');
 assert.equal(fs.readFileSync(path.join(root,'new/deep/run.json'),'utf8'),'{"total":18}');
 writeEvidenceFile(root,'new/deep/run.json','{"total":19}');
 assert.equal(fs.readFileSync(path.join(root,'new/deep/run.json'),'utf8'),'{"total":19}');
 assert.deepEqual(fs.readdirSync(outside),[]);
});
test('a replaced parent creates neither directories nor a receipt outside the workspace',t=>{
 const {root,outside}=fixture(t);
 const inside=path.join(root,'actual');fs.mkdirSync(inside);
 const link=path.join(root,'internal-link');
 fs.symlinkSync(inside,link,process.platform==='win32'?'junction':'dir');
 const relative='internal-link/new/deep/run.json';
 evidencePath(root,relative); // The caller may have validated before running tests.
 fs.unlinkSync(link);fs.symlinkSync(outside,link,process.platform==='win32'?'junction':'dir');
 assert.throws(()=>writeEvidenceFile(root,relative,'{}'),/real workspace/);
 assert.deepEqual(fs.readdirSync(outside),[]);
});
