/** Source-backed direct-Life map regeneration. --check is read-only. */
import fs from 'node:fs';
import { build } from 'esbuild';
import { indexNativeSpells } from './lib/gow-native-source.mjs';
import { nativeLifeModes } from './lib/gow-life-oracle.mjs';
const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells);
const bundle = await build({ stdin: { contents: `
import {registerSkillLibrary} from './src/engine/skills/library';
import {TROOPS} from './src/data/troops';
import {COMMUNITY_TROOPS} from './src/data/communityTroops';
import weapons from './src/data/weapons.json';
const registry=new Map();registerSkillLibrary(registry);
export default {prototypes:Object.fromEntries(registry),troops:TROOPS,customIds:COMMUNITY_TROOPS.map(t=>t.id),weapons};`,
resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,loader:{'.png':'empty','.webp':'empty'}});
const {default:r}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const flat = ss => ss.flatMap(s => ['choose','oneOf'].includes(s.kind) ? s.options.flatMap(flat) : [s]);
const rows = [...r.troops.filter(t => !r.customIds.includes(t.id)).map(t => ({kind:'troop',id:t.id,name:t.name,spellId:t.spell.id})),
...r.weapons.map(w => ({kind:'weapon',id:w.id,name:w.name,spellId:w.spell.id}))];
const rules={},reviewed=[],pending=[];
for(const row of rows){
 const buffs=flat(r.prototypes[String(row.spellId)]?.segments??[]).filter(s => s.kind==='buff'&&s.stat==='hp');if(!buffs.length)continue;
 const raw=native.get(row.spellId)?.raw;
 const modes=nativeLifeModes(raw,buffs.length,row.spellId);
 if(!modes){pending.push({...row,reason:'Mixed or absent native Life semantics need individual review'});continue;}
 if(rules[row.spellId]&&JSON.stringify(rules[row.spellId])!==JSON.stringify(modes))throw Error('Conflicting shared spell modes '+row.spellId);
 rules[row.spellId]=modes;
 reviewed.push({key:`${row.kind}:${row.id}`,spellId:row.spellId,name:row.name,modes,nativeLifeTypes:raw.SpellSteps.filter(s=>['IncreaseHealth','Heal','IncreaseAllStats'].includes(s.Type)).map(s=>s.Type),
 scope:'Direct hp buff segment semantics only; no certification of other clauses, targeting, conditional order, healing status rules, random-stat or theft/devour Life.'});
}
const table=JSON.stringify(rules,null,2)+'\n';
if(process.argv.includes('--check')){
 if(table!==fs.readFileSync('src/data/gowLifeRules.json','utf8'))throw Error('Direct-Life table differs from installed/native sources; review required');
}else{
 fs.writeFileSync('src/data/gowLifeRules.json',table);
 fs.writeFileSync('artifacts/gow-skill-audit/life-semantics-review.json',JSON.stringify({schemaVersion:1,wholeSkillAccepted:false,reviewed,pending},null,2)+'\n');
}
console.log(JSON.stringify({modeTables:Object.keys(rules).length,reviewedEntities:reviewed.length,pendingEntities:pending.length,wholeSkillAccepted:false}));
