/** Apply adjudications with Gowhead Chinese as the authority, preserving the prior review. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../artifacts/gowhead-troop-audit/approval-921');
const load = file => JSON.parse(fs.readFileSync(path.join(dir,file),'utf8').replace(/^\uFEFF/u,''));
const previous = [1,2,3,4,5].map(n=>load(`review-pre-zh-policy-${n}.json`));
const byKey=new Map(load('manifest.json').map(x=>[x.key,x]));
const oldRows=previous.flat();
const conflicts=new Set(oldRows.filter(x=>x.decision==='source_conflict').map(x=>x.key));
const translations=new Set(oldRows.filter(x=>x.decision==='translation_fix').map(x=>x.key));
if(oldRows.length!==921 || conflicts.size!==78 || translations.size!==56)throw Error('unexpected frozen review baseline');
const expectedFiles=[
  ['zh-policy-1-2.json',new Set(previous.slice(0,2).flat().filter(x=>x.decision==='source_conflict').map(x=>x.key))],
  ['zh-policy-3.json',new Set(previous[2].filter(x=>x.decision==='source_conflict'&&x.key!=='6863|spell.description').map(x=>x.key))],
  ['zh-policy-4-5.json',new Set(previous.slice(3).flat().filter(x=>x.decision==='source_conflict').map(x=>x.key))],
  ['zh-policy-queen.json',new Set(['6863|spell.description'])],
  ['zh-policy-translation.json',new Set([...translations].filter(x=>x!=='6253|spell.description'))],
  ['zh-policy-6253.json',new Set(['6253|spell.description'])],
];
const replacements=new Map();
for(const [file,keys] of expectedFiles){
  const rows=load(file); if(rows.length!==keys.size)throw Error(`${file}: expected ${keys.size} items, got ${rows.length}`);
  for(const x of rows){
    if(!keys.has(x.key)||replacements.has(x.key))throw Error(`${file}: duplicate/unexpected ${x.key}`);
    if(!['functional_fix','translation_fix','equivalent','uncertain'].includes(x.decision)||typeof x.reason!=='string'||x.reason.length<4||!(typeof x.evidence==='string'||Array.isArray(x.evidence)))throw Error(`${file}: invalid review ${x.key}`);
    replacements.set(x.key,x);
  }
}
if(replacements.size!==conflicts.size+translations.size)throw Error('missing re-adjudications');
const out=previous.map(rows=>rows.map(row=>{
  if(row.key==='6759|spell.description')return {...row,decision:'functional_fix',reason:'按 gowhead 中文，食松露大王的伤害应随中毒和患病敌人数增强，之后造宝石；项目实际把人数加成用于造宝石，而且先造宝石后伤害，存在两处功能差异。',evidence:'data/raw/gowhead-live-troops/troops.zh.json id=6759 stats.spell.desc；src/data/troops.json id=6759；src/engine/skills/curated/batch-p38.ts spell.id=8139 先 createMix 再 dmg，createMix 的 modifier 计数 poison/disease；中文描述先伤害，且把中毒/疾病数量用于伤害。'};
  // Wargare has a single local UI name, 狐人. The cached gowhead zh uses 狼族
  // for the same race key; do not turn 40 intentional localizations into fixes.
  const replacement=replacements.get(row.key);
  if (replacement?.decision === 'translation_fix' && byKey.get(row.key)?.local?.includes('狐人') && byKey.get(row.key)?.gowheadZh?.includes('狼族'))
    return {...row,decision:'equivalent',reason:'本项目将 Wargare 种族统一显示为“狐人”；gowhead 中文的“狼族”指向同一个 Wargare。保留狐人名称、特质及作用对象，不改种族判定。',evidence:`${replacement.evidence}；本项目 src/meta/data/races.ts#Wargare=狐人`};
  return replacement?{...row,decision:replacement.decision,reason:replacement.reason,evidence:replacement.evidence}:row;
}));
// Validate everything before touching the five live reviews.
const all=out.flat();const keys=new Set(all.map(x=>x.key));
if(all.length!==921||keys.size!==921||all.some(x=>x.decision==='source_conflict'))throw Error('coverage/policy failed');
for(let n=1;n<=5;n++)fs.writeFileSync(path.join(dir,`review-${n}.json`),JSON.stringify(out[n-1],null,2)+'\n');
console.log('updated 921 decisions, re-adjudicated',replacements.size,'items; prior decisions remain in review-pre-zh-policy-*');

await import('./review-gowhead-functional-sweep.mjs');
await import('./fix-gowhead-corrupted-review.mjs');
