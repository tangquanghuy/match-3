/** Regeneration in memory only: never rewrites the user's generated assets. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {build,transformSync} from 'esbuild';
import {compileAll} from './_weapon_pools.mjs';
import {correctedWeaponDescription} from './lib/gow-weapon-desc-corrections.mjs';
import {perAllyMixSpec} from './lib/gow-per-ally-oracle.mjs';
const source=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json')).weapons;
const ids=new Set([8074,8400,7412,7800,7755,8153,7492,7754,7815,9378,7074,7089,8073,9837,9911,9914,9976,10046,10050,7756,9386,9379,9032,8808,7187,8254,8255,8256,8257,8258,8259,8517,8843,8947,7129,7192,7285,7567,7753,8805,8988,9985,7585,8450,9204,8623,8876,8951,8900,...source.filter(w=>perAllyMixSpec(w.stats.spell.desc)).map(w=>w.stats.spell.id)]);
const result=await build({stdin:{contents:`import * as builders from './src/engine/skills/builders';import {applyGowDamageRule} from './src/engine/skills/gowDamageRules';import {applyGowLifeRule} from './src/engine/skills/gowLifeRules';import {BaseColor} from './src/engine/types';import {registerSkillLibrary} from './src/engine/skills/library';const registry=new Map();registerSkillLibrary(registry);export default {builders,BaseColor,registry,applyGowDamageRule,applyGowLifeRule};`,resolveDir:process.cwd(),loader:'ts'},loader:{'.png':'empty','.webp':'empty'},bundle:true,platform:'node',format:'esm',write:false});
const {default:r}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const weapons=compileAll().filter(c=>ids.has(c.spellId)).map(c=>{
 const names=[...c.imports];
 const expression=transformSync('const proto = '+c.build+';', {loader:'ts',format:'cjs'}).code;
 return {spellId:c.spellId,generated:r.applyGowLifeRule(c.spellId,r.applyGowDamageRule(c.spellId,new Function(...names,'BaseColor',`${expression}\nreturn proto;`)(...names.map(n=>r.builders[n]),r.BaseColor))),registered:r.registry.get(String(c.spellId))};
});
const writes=new Map();
const fakeFs={readFileSync:(p,...args)=>fs.readFileSync(p,...args),mkdirSync:()=>{},writeFileSync:(p,s)=>writes.set(p,s),statSync:p=>writes.has(p)?{size:Buffer.byteLength(writes.get(p))}:fs.statSync(p)};
const script=fs.readFileSync('scripts/build_troops.mjs','utf8').replace(/^import .+;\r?$/gm,'');
vm.runInNewContext(script,{fs:fakeFs,path,console:{log:()=>{}}},{timeout:10000});
const rebuilt=JSON.parse(writes.get('src/data/troops.json'));
const troops=rebuilt.filter(t=>[7334,7335,7725].includes(t.id));
const weaponScript=fs.readFileSync('scripts/build_weapons.mjs','utf8').replace(/^import .+;\r?$/gm,'');
vm.runInNewContext(weaponScript,{fs:fakeFs,path,correctedWeaponDescription,console:{log:()=>{}}},{timeout:10000});
const rebuiltWeapons=JSON.parse(writes.get('src/data/weapons.json')).filter(w=>[1008,1023].includes(w.id));
console.log(JSON.stringify({rebuiltWeapons,catalogueCount:rebuilt.length,supplementIds:rebuilt.filter(t=>[7932,7933].includes(t.id)).map(t=>t.id),weapons,troops:troops.map(t=>({id:t.id,manaCost:t.manaCost,description:t.spell.description}))}));
