import { TROOPS, SOURCE_TROOPS } from '../data/troops';
import type { TroopData } from '../data/troops';
import { SKILL_LIBRARY } from '../engine/skills/library';
import { getTrait } from '../engine/traits';
import { PORTRAITS,savePortrait } from './portraits';
import {compileEnemyBlueprint,adaptedTraitDescription} from './enemyBlueprint';
import type {EnemyBlueprint} from './enemyBlueprint';
import importedTroops from '../data/troops.json';
const importedIds=new Set(importedTroops.map(t=>t.id));

export const INVENTORY_VERSION=1;
export const RANK_BY_RARITY=['杂兵','杂兵','精锐','首领','领主','传奇'] as const;
export interface Dependency { path:string; kind:string; value:unknown }
export interface Exclusion { scope:'skill'|'trait'; id:string; mechanism:string; evidence:string; source:string; policy:'omit-scoped-mechanism-retain-independent-effects' }
export interface EnemyInventoryEntry {
  id:number; name:string; origin:'imported'|'community'; rarity:string; rarityIdx:number; rank:string;
  portrait:{assetId:string|null; indexed:boolean; url:string|null};
  skillId:number; traitIds:string[]; registeredSkill:boolean; missingTraits:string[];
  dependencies:Dependency[]; exclusions:Exclusion[];
  compilation:{state:'compiled'|'blocked';issues:string[];recipe?:Pick<EnemyBlueprint,'recipeId'|'rulesetVersion'|'recipeSignature'|'abilityId'|'budget'|'omittedMechanisms'|'descriptionAudit'|'traitDescriptionAudit'>};
  applicable:boolean; excludedReason:string|null; verification:'indexed'|'missing-native-recipe'; assemblerVerified:boolean;
}
const scoped=[{mechanism:'ascension',pattern:/晋升/},{mechanism:'delve',pattern:/淘宝模式/},{mechanism:'boss-specialization',pattern:/魔头/}];
export function mechanismExclusions(scope:'skill'|'trait',id:string,description:string,source:string):Exclusion[] {
  return scoped.filter(x=>x.pattern.test(description)).map(x=>({scope,id,mechanism:x.mechanism,evidence:description,source,policy:'omit-scoped-mechanism-retain-independent-effects'}));
}
export function dependenciesOf(value:unknown,path=''):Dependency[] {
  const found:Dependency[]=[];
  if(!value||typeof value!=='object')return found;
  for(const [key,child]of Object.entries(value)){
    const at=path?`${path}.${key}`:key;
    if(['race','troopType','kingdom','kingdomId','ref','troopId','randomOf','onDelveGain','onDelveBounty','onDelveMiles','vsAscendedMultiplier'].includes(key))found.push({path:at,kind:key,value:child});
    if(key==='kind'&&typeof child==='string'&&['ascended','summon','transform','battleGold','battleSouls','kingdomPresent','allyCount','enemyCount'].includes(child))found.push({path:at,kind:child,value:child});
    found.push(...dependenciesOf(child,at));
  }
  return found;
}
export function inventoryEntry(t:TroopData):EnemyInventoryEntry {
  const source=SOURCE_TROOPS.find(s=>s.id===t.id)??t;
  const proto=SKILL_LIBRARY[t.spell.id];
  const portrait=PORTRAITS.find(p=>p.troopId===t.id);
  const origin=importedIds.has(t.id)?'imported':'community';
  const sourcePath=origin==='imported'?`src/data/troops.json#${t.id}`:`src/data/communityTroops.ts#${t.id}`;
  const exclusions=mechanismExclusions('skill',String(t.spell.id),source.spell.description,`${sourcePath}.spell`);
  const dependencies=dependenciesOf(proto,'skill');
  for(const trait of t.traits){
    exclusions.push(...mechanismExclusions('trait',trait.code,source.traits.find(tr=>tr.code===trait.code)?.description??trait.description,`${sourcePath}.traits.${trait.code}`));
    dependencies.push(...dependenciesOf(getTrait(trait.code),`traits.${trait.code}`));
  }
  const compilation:EnemyInventoryEntry['compilation']={state:'blocked',issues:[]};
  if(!portrait)compilation.issues.push('尚未进入立绘索引');
  else try {
    const blueprint=compileEnemyBlueprint({portrait:savePortrait({rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),externalId:`enemy:${t.id}`,level:20,difficulty:1});
    const {recipeId,rulesetVersion,recipeSignature,abilityId,budget,omittedMechanisms,descriptionAudit,traitDescriptionAudit}=blueprint;
    compilation.state='compiled';compilation.recipe={recipeId,rulesetVersion,recipeSignature,abilityId,budget,omittedMechanisms,descriptionAudit,traitDescriptionAudit};
  }catch(error){compilation.issues.push(error instanceof Error?error.message:String(error));}
  const registeredSkill=!!proto&&proto.segments.length>0;
  const missingTraits=t.traits.filter(tr=>!getTrait(tr.code)).map(tr=>tr.code);
  return {id:t.id,name:t.name,origin,rarity:t.rarity,rarityIdx:t.rarityIdx,rank:RANK_BY_RARITY[t.rarityIdx]??'未知',
    portrait:{assetId:t.portrait,indexed:!!portrait,url:portrait?.portraitUrl??t.artUrl??null},skillId:t.spell.id,traitIds:t.traits.map(tr=>tr.code),registeredSkill,missingTraits,dependencies,exclusions,compilation,
    // A waived trait or conditional bonus alone never removes the enemy from the denominator.
    applicable:true,excludedReason:null,verification:registeredSkill&&!missingTraits.length?'indexed':'missing-native-recipe',assemblerVerified:false};
}
export function coverageRows(entries:readonly EnemyInventoryEntry[],group:'rarity'|'rank'){
  const names=group==='rarity'?['Common','Uncommon','Rare','UltraRare','Epic','Legendary']:[...new Set(RANK_BY_RARITY)];
  return names.map(name=>{
    const rows=entries.filter(e=>e[group]===name);const applicable=rows.filter(e=>e.applicable);const passed=applicable.filter(e=>e.assemblerVerified).length;
    return {name,total:rows.length,excluded:rows.length-applicable.length,applicable:applicable.length,compiled:applicable.filter(e=>e.compilation.state==='compiled').length,nativeRegistered:applicable.filter(e=>e.verification==='indexed').length,passed,missing:applicable.length-passed,required:Math.ceil(applicable.length*.9),coverage:applicable.length?passed/applicable.length:null};
  });
}
export function buildEnemyInventory(){
  const enemies=TROOPS.map(inventoryEntry);
  const skills=[...new Set(enemies.map(e=>e.skillId))].sort((a,b)=>a-b).map(id=>({id,enemyIds:enemies.filter(e=>e.skillId===id).map(e=>e.id),registered:!!SKILL_LIBRARY[id]?.segments.length,prototype:SKILL_LIBRARY[id]?structuredClone(SKILL_LIBRARY[id]):null,sourceDescriptions:SOURCE_TROOPS.filter(t=>t.spell.id===id).map(t=>({enemyId:t.id,name:t.spell.name,description:t.spell.description,manaColors:t.manaColors,manaCost:t.manaCost})),effectKinds:[...new Set(SKILL_LIBRARY[id]?.segments.map(s=>s.kind)??[])],dependencies:dependenciesOf(SKILL_LIBRARY[id]),exclusions:enemies.flatMap(e=>e.exclusions.filter(x=>x.scope==='skill'&&x.id===String(id))).filter((x,i,a)=>a.findIndex(y=>y.mechanism===x.mechanism)===i)}));
  const traits=[...new Set(enemies.flatMap(e=>e.traitIds))].sort().map(id=>({id,enemyIds:enemies.filter(e=>e.traitIds.includes(id)).map(e=>e.id),registered:!!getTrait(id),descriptionAudit:adaptedTraitDescription(id)??null,dependencies:dependenciesOf(getTrait(id)),exclusions:enemies.flatMap(e=>e.exclusions.filter(x=>x.scope==='trait'&&x.id===id)).filter((x,i,a)=>a.findIndex(y=>y.mechanism===x.mechanism)===i)}));
  const families=new Map<string,Set<number>>();
  for(const e of enemies)for(const d of e.dependencies){if(!families.has(d.kind))families.set(d.kind,new Set());families.get(d.kind)!.add(e.id);}
  return {version:INVENTORY_VERSION,scope:'all-runtime-troops',note:'原生注册不等于通用组装验收；没有证据时不移出适用分母。',enemies,skills,traits,rarities:coverageRows(enemies,'rarity'),ranks:coverageRows(enemies,'rank'),families:[...families].map(([kind,ids])=>({kind,count:ids.size,enemyIds:[...ids]})).sort((a,b)=>b.count-a.count)};
}
