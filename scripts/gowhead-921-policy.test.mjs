import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../artifacts/gowhead-troop-audit/approval-921');
const report=JSON.parse(fs.readFileSync(path.join(dir,'approved.json'),'utf8'));
const find=(id)=>Object.values(report.findings).flat().find(x=>x.id===id&&x.field==='spell.description');
test('all 921 rows have a readable reviewed conclusion',()=>{
 assert.equal(report.reviewed,921);
 assert.equal(Object.values(report.counts).reduce((a,b)=>a+b),921);
 assert.equal(Object.values(report.findings).flat().filter(x=>/\?\?\?/.test(x.reason)).length,0);
});
test('same Chinese is not a functional regression; obvious source misprint not a runtime bug',()=>{
 assert.equal(find(6253).decision,'equivalent');
 assert.match(find(6253).reason,/都写“两名随机敌人”/);
 for(const id of [6307,7229,7526])assert.equal(find(id).decision,'source_zh_suspect');
 assert.match(find(6307).reason,/每颗紫色宝石增加 6%/);
});
test('retain independently identified order mismatch and requested queen rule with caveat',()=>{
 assert.equal(find(6759).decision,'functional_fix');
 assert.match(find(6759).reason,/先伤害、后造混合宝石/);
 assert.equal(find(6863).decision,'functional_fix');
 assert.match(find(6863).reason,/创造宝石后每颗棕色宝石再加 1 个百分点/);
});

test('Wargare remains 狐人 rather than relabeling it 狼族',()=>{
 const fox=Object.values(report.findings).flat().filter(x=>x.local.includes('狐人')&&x.gowheadZh.includes('狼族'));
 assert.equal(fox.length,40);
 for(const row of fox){assert.equal(row.decision,'equivalent');assert.match(row.reason,/Wargare.*狐人/);}
});