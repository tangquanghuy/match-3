import {SeededRNG} from '../engine/rng';
import type {SkillPrototype,EffectSegment} from '../engine/skills/prototypes';
import type {GemParams,CreateGemSpec,ColorSpec} from '../engine/skills/effects/gems';
import type {ModifierSpec} from '../engine/skills/effects/secondary';
import type {TraitDefinition} from '../engine/traits';
import type {TroopData} from '../data/troops';
import {inspectEnemyMechanisms} from './enemyMechanismRules';
import {stEffectIsProvablyUnreachable,stTraitIsProvablyUnreachable} from './economyAvailability';
import {stableJson} from './json';

export const ENEMY_ASSEMBLY_POLICY_VERSION=2;
export type EnemyGenerationPool='ordinary'|'special';
/** V2 evidence is serialized with previous members; v1 profiles retain their exact shape. */
export interface EnemyManaFlowPath {
 generatedColors:string[];collectedColors:string[];directMana:('self'|'all')[];
 lethal:boolean;extraTurn:boolean;cheapControl:boolean;
}
export interface EnemyManaFlow {consumedColors:string[];paths:EnemyManaFlowPath[]}
export interface EnemyAssemblyProfile {
 primaryRole:string;sourceTroopId:number;spellId:number;rarityIdx:number;manaCost:number;
 families:string[];maxPathFamilies:number;damageShapes:string[];capabilities:string[];
 highImpact:string[];resourceGain:boolean;selfMana:boolean;massControl:boolean;
 generatedColors:string[];canAttack:boolean;hasTeamBenefit:boolean;
 damage:EffectSegment[];gems:EffectSegment[];summons:EffectSegment[];
 conditions:boolean;groupKey:string;manaFlow?:EnemyManaFlow;
}
export interface EnemyGeneration {
 version:1|typeof ENEMY_ASSEMBLY_POLICY_VERSION;pool:EnemyGenerationPool;primaryRole:string;
 profile:EnemyAssemblyProfile;context?:{teamColors?:string[];previous?:EnemyAssemblyProfile[]};groupKey:string;groupWeight:number;recipeWeight:number;
}
const positive=new Set(['barrier','blessed','enraged','enchant','enchanted','reflect','submerged','rage']);
const control=new Set(['silence','frozen','freeze','entangle','stun','web']);
const unique=(values:readonly string[])=>[...new Set(values)].sort();
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function collect(value:unknown):Record<string,unknown>[] {
 if(Array.isArray(value))return value.flatMap(collect);
 return record(value)?[value,...Object.values(value).flatMap(collect)]:[];
}
function modifierSources(spec:ModifierSpec) {
 return spec.sourceGroups?.flat()??spec.sources??(spec.source?[spec.source]:[]);
}
function positiveBoost(spec:ModifierSpec|undefined):boolean {
 if(!spec||(spec.max!==undefined&&spec.max<=0)||!modifierSources(spec).length)return false;
 return spec.mod.kind==='multiplier'?spec.mod.a>0:Math.floor(spec.mod.b??0)>0;
}
function effectIsReachable(segment:EffectSegment):boolean {
 if(stEffectIsProvablyUnreachable(segment))return false;
 // Choose is resolved before the runtime probability gate. Devour owns its roll,
 // but a zero base chance still needs a real positive boost to become reachable.
 if(segment.kind==='choose')return true;
 return segment.chance===undefined&&!segment.chanceBoost
  ||(segment.chance??0)>0||positiveBoost(segment.chanceBoost);
}
function paths(items:readonly EffectSegment[],reliableBranches=false):EffectSegment[][] {
 return items.reduce<EffectSegment[][]>((current,s)=>{
  if(!effectIsReachable(s)||reliableBranches&&s.kind==='oneOf'&&!reliableManaSegment(s))return current;
  const branches=s.kind==='choose'||s.kind==='oneOf'?s.options.length?s.options.flatMap(option=>paths(option,reliableBranches)):[[]]:[[s]];
  return current.flatMap(a=>branches.map(b=>[...a,...b]));
 },[[]]);
}
function family(s:EffectSegment):string {
 if(s.kind==='damage')return 'damage';
 if(s.kind==='gem')return 'gem:'+(s.params.op==='clear'?s.params.mode:s.params.op);
 if(s.kind==='buff')return s.stat==='hp'?(s.lifeMode==='heal'?'heal':'life'):s.stat==='mana'?'mana':'attribute';
 if(s.kind==='status')return positive.has(s.statusId)?'positiveStatus':control.has(s.statusId)?'control':'negativeStatus';
 if(s.kind==='randomStat')return 'attribute';
 if(s.kind==='summonCopy')return 'summon';
 if(['gainEconomy','spendEconomy','stealGold'].includes(s.kind))return 'economy';
 if(['reposition','swapPositions','shuffleTeam'].includes(s.kind))return 'position';
 return s.kind;
}
/** Count a clear and its downstream create as one linked board mechanic.
 * Other creates, reversed order and alternative branches remain independent.
 * Keep the raw family list intact for evidence and grouping.
 */
function pathFamilyCount(path:readonly EffectSegment[]):number {
 const families=new Set<string>();
 let clearFamily:string|undefined;
 for(const segment of path){
  const key=family(segment);
  if(segment.kind==='gem'&&segment.params.op==='create'&&!segment.params.countRange){
   const modifier=segment.params.modifier;
   const sources=modifier?modifierSources(modifier):[];
   if(clearFamily&&modifier&&positiveBoost(modifier)&&sources.every(source=>source.kind==='destroyedGems')){
    families.add(clearFamily);continue;
   }
  }
  families.add(key);
  if(segment.kind==='gem'&&segment.params.op==='clear')clearFamily=key;
 }
 return families.size;
}
function damageShape(s:EffectSegment):string {
 if(s.kind!=='damage')return '';
 if(s.range==='scatter'||s.range==='splash')return s.range;
 if(s.split!==undefined)return 'split';
 if(s.target==='enemyAll')return 'all';
 if(s.target==='enemyRandomN'&&(s.randomWaves??1)>1)return 'randomWaves';
 return s.range==='all'||/N$|Adjacent|AndBelow|AndNextDown|AllOther/.test(s.target)?'multi':'single';
}
const colors=new Set(['Red','Blue','Green','Yellow','Purple','Brown']);
const skulls=new Set(['skull','Skull','doomSkull','uberDoomSkull']);
function mentions(values:unknown,allowed:Set<string>):boolean {
 return typeof values==='string'?allowed.has(values):Array.isArray(values)?values.some(v=>mentions(v,allowed)):record(values)?Object.values(values).some(v=>mentions(v,allowed)):false;
}
function outputColor(spec:ColorSpec|undefined,troop:TroopData):string[] {
 // Contextual endpoints stay unresolved; CASTER is explicitly the first color.
 const color=spec==='CASTER'?troop.manaColors[0]:spec;
 return color&&colors.has(color)?[color]:[];
}
function createdColors(gem:CreateGemSpec,troop:TroopData):string[] {
 switch(gem.kind){
  case 'color':return outputColor(gem.color,troop);
  case 'mix':return gem.colors.flatMap(color=>outputColor(color,troop));
  case 'special':return outputColor(gem.spec.color,troop);
  case 'mixSpecial':return gem.specs.flatMap(spec=>outputColor(spec.color,troop));
  case 'mixAny':return gem.entries.flatMap(entry=>outputColor(typeof entry==='string'?entry:entry.color,troop));
  case 'skull':return [];
 }
}
function generatedColors(params:GemParams,troop:TroopData):string[] {
 if(params.op==='create')return createdColors(params.gem,troop);
 if(params.op!=='transform')return [];
 // The native executor gives toSpecial priority over the ordinary destination.
 return params.toSpecial!==undefined
  ?typeof params.toSpecial==='string'?[]:outputColor(params.toSpecial.color,troop)
  :outputColor(params.to,troop);
}
/** Board availability and mana quantities remain runtime concerns. These edges describe
 * potential supply, never a proof of an infinite loop or a guaranteed four-match. */
function reliableManaSegment(s:EffectSegment):boolean {
 return s.kind==='choose'||!s.ifCond&&!s.ifTargetDied&&!s.chanceBoost&&(s.chance===undefined||s.chance>=1);
}
function positiveAmount(s:{base:number;mult:number},modifier?:ModifierSpec):boolean {
 return s.base>0||s.mult>0||positiveBoost(modifier);
}
function collectedManaColors(params:Extract<GemParams,{op:'clear'}>,troop:TroopData):string[] {
 if(params.mode==='remove')return [];
 const target=params.target;
 if(target.kind==='randomGems'||target.kind==='randomLines'){
  const possible=target.kind==='randomGems'&&target.countRange
   ?Math.max(target.countRange.min,target.countRange.max)>0:positiveAmount(target.count,params.modifier);
  if(!possible)return [];
 }
 if(target.kind==='lines'&&!(target.rows?.length||target.cols?.length))return [];
 // Explosions collect neighbouring colors too (at half mana). Unresolved color
 // anchors stay unknown rather than turning contextual endpoints into all colors.
 if(target.kind==='color'){
  const resolved=outputColor(target.color,troop);
  return resolved.length&&params.mode==='explode'?[...colors]:resolved;
 }
 if(target.kind==='randomGems'){
  const filters=target.colors??(target.color===undefined?undefined:[target.color]);
  if(filters){
   if(!filters.length||filters.some(c=>!outputColor(c,troop).length))return [];
   if(target.include==='skull')return [];
   return params.mode==='explode'?[...colors]:unique(filters.flatMap(c=>outputColor(c,troop)));
  }
  if(params.mode==='destroy'&&(target.include==='skull'||target.special))return [];
 }
 if(params.mode==='destroy'&&(target.kind==='skulls'||target.kind==='special'))return [];
 return [...colors];
}
// Event traits stay in the aggregate profile/rank rules. Until a path proves their
// trigger event, trait-only interactions belong to battle validation, not its flags.
function profileManaFlow(troop:TroopData,prototype:SkillPrototype):EnemyManaFlow {
 // Event-triggered traits remain in highImpact/family admission. Without evidence
 // that this cast produces their trigger, they are not part of each active path.
 const result=paths(prototype.segments,true).map(path=>{
  const supply=path.filter(reliableManaSegment);
  const generated=supply.flatMap(s=>{
   if(s.kind!=='gem'||s.params.op==='clear')return [];
   const p=s.params;
   if(p.op==='create'){
    if(p.countRange?Math.max(p.countRange.min,p.countRange.max)<=0:!positiveAmount(p.count,p.modifier))return [];
    // The executor skips the whole mix when one ordinary endpoint is unresolved.
    const endpoints=p.gem.kind==='mix'?p.gem.colors:p.gem.kind==='mixAny'?p.gem.entries.filter((e):e is ColorSpec=>typeof e==='string'&&e!=='SKULL'):[];
    if(endpoints.some(c=>!outputColor(c,troop).length&&c!=='SKULL'))return [];
   }else{
    if(p.count&&!positiveAmount(p.count,p.countModifier))return [];
    // Ordinary identity conversions produce no board change.
    if(!p.toSpecial&&p.from===p.to)return [];
   }
   return generatedColors(p,troop);
  });
  const collected=supply.flatMap(s=>s.kind==='gem'&&s.params.op==='clear'?collectedManaColors(s.params,troop):[]);
  const direct:('self'|'all')[]=supply.flatMap(s=>{
   if(s.kind!=='buff'||s.stat!=='mana'||s.targetRace||s.targetKingdom||!['allySelf','allyAll'].includes(s.target))return [];
   const possible=s.fraction!==undefined?s.fraction>0:s.halve?troop.manaCost>=2:s.rangeSpec
    ?positiveAmount(s.rangeSpec.min)||positiveAmount(s.rangeSpec.max):positiveAmount(s.scaling,s.modifier);
   return possible?[s.target==='allySelf'?'self' as const:'all' as const]:[];
  });
  return {generatedColors:unique(generated),collectedColors:unique(collected),directMana:[...new Set(direct)].sort(),
   lethal:path.some(s=>s.kind!=='choose'&&!s.ifCond&&!s.ifTargetDied&&'target'in s&&(s.target.startsWith('enemy')||s.target.startsWith('last'))
    &&(s.kind==='devour'||s.kind==='damage'&&s.execute===true)),
   extraTurn:supply.some(s=>s.kind==='extraTurn'),
   cheapControl:troop.manaCost<=14&&supply.some(s=>s.kind==='status'&&s.target==='enemyAll'&&control.has(s.statusId))};
 });
 return {consumedColors:unique(troop.manaColors),paths:[...new Map(result.map(path=>[stableJson(path),path])).values()]};
}
const lethalTraitEffects:Readonly<Record<string,'devour'|'execute'>>={
 onSkullHitDevour:'devour',onSkullDamagedDevour:'devour',onEnemyDeathDevour:'devour',
 onBigMatchKill:'execute',skullLethalChance:'execute',onSkullHitKill:'execute',onEnemyDeathKill:'execute',
};
function traitValueIsReachable(value:unknown,key:string):boolean {
 if(value===undefined||value===null||value===false||value===0||value===''||Array.isArray(value)&&!value.length
  ||stTraitIsProvablyUnreachable(value,key))return false;
 if(Object.hasOwn(lethalTraitEffects,key))return typeof value==='number'?value>0:record(value)&&typeof value.chance==='number'&&value.chance>0;
 return true;
}
/** The primary role is a source classification seed; capabilities never assign another role. */
export function profileEnemyAssembly(troop:TroopData,prototype:SkillPrototype,traits:readonly TraitDefinition[],capabilities:readonly string[],version:1|2=ENEMY_ASSEMBLY_POLICY_VERSION):EnemyAssemblyProfile {
 const ps=paths(prototype.segments),ss=ps.flat();
 const enemy=(s:EffectSegment)=>'target'in s&&typeof s.target==='string'&&(s.target.startsWith('enemy')||s.target.startsWith('last'));
 const damage=ss.filter(s=>s.kind==='damage'&&enemy(s));
 const gems=ss.filter(s=>s.kind==='gem');
 const impacts:string[]=[];
 for(const s of ss){
  if(s.kind==='devour'&&enemy(s))impacts.push('devour');
  if(s.kind==='damage'&&s.execute&&enemy(s))impacts.push('execute');
  if(s.kind==='extraTurn')impacts.push('extraTurn');
  if((s.kind==='transformTroop'||s.kind==='status'&&['lycanthropy','wolf','wolf-form'].includes(s.statusId))&&enemy(s))impacts.push('enemyTransform');
 }
 const reachableTraits=traits.map(trait=>Object.fromEntries(Object.entries(trait)
  .filter(([key,value])=>traitValueIsReachable(value,key))) as unknown as TraitDefinition);
 const traitRules=inspectEnemyMechanisms({segments:[]},reachableTraits).families;
 for(const trait of reachableTraits)for(const key of Object.keys(trait)){
  if(Object.hasOwn(lethalTraitEffects,key))impacts.push(lethalTraitEffects[key]!);
 }
 // onExtraTurnGain/Status respond to an existing extra turn; neither grants one.
 const allNodes=collect(ss);
 const madeColors=unique(gems.flatMap(s=>s.kind==='gem'?generatedColors(s.params,troop):[]));
 const skullOffense=gems.some(s=>s.kind==='gem'&&(s.params.op==='create'?mentions(s.params.gem,skulls):s.params.op==='transform'?mentions(s.params.to,skulls)||mentions(s.params.toSpecial,skulls):false));
 const resourceGain=ss.some(s=>s.kind==='buff'&&s.stat==='mana'||s.kind==='gem'&&(generatedColors(s.params,troop).length>0||s.params.op==='clear'&&s.params.mode!=='remove'))||traitRules.includes('trait:mana');
 const selfMana=ss.some(s=>s.kind==='buff'&&s.stat==='mana'&&['allySelf','allyAll'].includes(s.target)&&!s.ifCond&&s.chance===undefined)
  ||gems.some(s=>s.kind==='gem'&&(generatedColors(s.params,troop).some(color=>troop.manaColors.some(manaColor=>manaColor===color))));
 const massControl=ss.some(s=>s.kind==='status'&&control.has(s.statusId)&&s.target==='enemyAll')||traitRules.includes('trait:teamControl');
 const familySet=unique(ss.map(family));
 const traitDamage=traitRules.includes('trait:damage');
 const base={primaryRole:troop.role??'',sourceTroopId:troop.id,spellId:troop.spell.id,rarityIdx:troop.rarityIdx,manaCost:troop.manaCost,
  families:familySet,maxPathFamilies:Math.max(0,...ps.map(pathFamilyCount)),damageShapes:unique(damage.map(damageShape)),capabilities:unique([...capabilities,...(skullOffense?['skullOffense']:[])]),
  highImpact:unique(impacts),resourceGain,selfMana,massControl,generatedColors:madeColors,
  canAttack:damage.length>0||skullOffense||traitDamage||ss.some(s=>s.kind==='summon'||s.kind==='summonCopy'||s.kind==='devour'&&enemy(s)),
  hasTeamBenefit:ss.some(s=>'target'in s&&typeof s.target==='string'&&s.target.startsWith('ally')&&s.target!=='allySelf'),
  damage:structuredClone([...new Set(damage)]),gems:structuredClone([...new Set(gems)]),summons:structuredClone([...new Set(ss.filter(s=>['summon','summonCopy','transformTroop'].includes(s.kind)))]),
  conditions:allNodes.some(n=>['ifCond','ifTargetDied','chance','chanceBoost','rangeSpec','condMult','condBonus'].some(k=>n[k]!==undefined))};
 return {...base,...(version===2?{manaFlow:profileManaFlow(troop,prototype)}:{}),groupKey:stableJson({families:familySet,shapes:base.damageShapes,cost:costBand(troop.manaCost),conditional:base.conditions})};
}
function costBand(n:number):string{return n<=10?'01-10':n<=14?'11-14':n<=18?'15-18':n<=24?'19-24':'25+';}
export const ENEMY_RANK_GENERATION_RULES:Record<string,{maxFamilies:number;maxHighImpact:number;simpleTarget:number}>={
 '杂兵':{maxFamilies:3,maxHighImpact:0,simpleTarget:2},'精锐':{maxFamilies:3,maxHighImpact:0,simpleTarget:2},
 '首领':{maxFamilies:4,maxHighImpact:1,simpleTarget:3},'领主':{maxFamilies:4,maxHighImpact:2,simpleTarget:3},'传奇':{maxFamilies:5,maxHighImpact:2,simpleTarget:3},
};
/** Relative preferences inside the already fixed primary-role pool, never a role classifier. */
export const ENEMY_ROLE_EFFECT_WEIGHTS:Record<string,Record<string,number>>={
 Striker:{damage:4,trueDamage:1,gemCreate:1,gemConvert:1,damageReduction:.5},
 Mage:{damage:4,gemExplode:1.5,gemConvert:1,control:1,mana:1},
 Generator:{mana:5,gemCreate:4,gemConvert:4,gemExplode:3,damage:.5},
 Defender:{armor:4,barrier:4,damageReduction:5,heal:2,damage:.5},
 Support:{allyBuff:5,heal:4,cleanse:4,barrier:2,mana:2,damage:.5},
 Warlock:{debuff:4,control:4,dispel:3,damage:1},
 Assassin:{damage:3,trueDamage:3,execute:2,debuff:1},
 Warrior:{damage:3,skullOffense:4,armor:1,damageReduction:1},
 Warmaster:{skullOffense:5,allyBuff:3,gemCreate:2,gemConvert:2,summon:1.5},
};
export function enemyRoleAffinity(role:string,capabilities:readonly string[]):number {
 const weights=ENEMY_ROLE_EFFECT_WEIGHTS[role]??{};
 return 1+capabilities.reduce((sum,key)=>sum+(weights[key]??0),0)/4;
}
export function enemyGenerationIssues(profile:EnemyAssemblyProfile,rank:string,pool:EnemyGenerationPool,version:1|2=ENEMY_ASSEMBLY_POLICY_VERSION):string[] {
 const rule=ENEMY_RANK_GENERATION_RULES[rank];if(!rule)return ['unknownRank'];
 const issues:string[]=[];
 if(pool==='ordinary'){
  if(profile.maxPathFamilies>rule.maxFamilies)issues.push('activeComplexity');
  if(profile.highImpact.length>rule.maxHighImpact)issues.push('highImpactLimit');
 }
 if(version===2){
  const cycles=teamManaCycleIssues([profile]);
  if(cycles.includes('teamLethalManaLoop'))issues.push('lethalManaLoop');
  if(cycles.includes('teamCheapControlLoop'))issues.push('cheapMassControlLoop');
 }else{
  if(profile.highImpact.some(x=>x==='devour'||x==='execute')&&profile.selfMana&&profile.highImpact.includes('extraTurn'))issues.push('lethalManaLoop');
  if(profile.massControl&&profile.resourceGain&&profile.highImpact.includes('extraTurn')&&profile.manaCost<=14)issues.push('cheapMassControlLoop');
 }
 return issues;
}
export function enemyTeamGenerationIssues(profiles:readonly EnemyAssemblyProfile[],version:1|2=ENEMY_ASSEMBLY_POLICY_VERSION):string[] {
 if(version===2)return teamManaCycleIssues(profiles);
 const lethal=profiles.some(p=>p.highImpact.some(x=>x==='devour'||x==='execute'));
 const mana=profiles.some(p=>p.selfMana);
 const extra=profiles.some(p=>p.highImpact.includes('extraTurn'));
 const mass=profiles.some(p=>p.massControl&&p.manaCost<=14);
 return [...(lethal&&mana&&extra?['teamLethalManaLoop']:[]),...(mass&&mana&&extra?['teamCheapControlLoop']:[])];
}
/** Only a closed supply chain carrying both the hazard and an explicit extra
 * turn is rejected. Each member contributes one executable branch to that chain;
 * an unrelated self-feeder or mutually exclusive branch cannot complete it.
 * Simple cycles intentionally leave conditional/trait-only and composite walks
 * to battle validation instead of banning ordinary color synergy. */
function teamManaCycleIssues(profiles:readonly EnemyAssemblyProfile[]):string[] {
 const allPaths=profiles.flatMap(profile=>profile.manaFlow?.paths??[]);
 if(!allPaths.some(path=>path.extraTurn)||!allPaths.some(path=>path.lethal||path.cheapControl))return [];
 let lethalRisk=false,controlRisk=false;
 for(let start=0;start<profiles.length;start++){
  const seen=new Set<string>();
  const visit=(current:number,visited:Set<number>,lethal:boolean,extra:boolean,mass:boolean):void=>{
   if(lethalRisk&&controlRisk)return;
   // Branch history only contributes these accumulated flags. Future paths depend
   // on the current member and visited set, so equivalent prefixes share work.
   const state=`${current}:${[...visited].sort((a,b)=>a-b).join(',')}:${+lethal}${+extra}${+mass}`;
   if(seen.has(state))return;
   seen.add(state);
   const flow=profiles[current]!.manaFlow;
   if(!flow)return; // Never reinterpret a frozen v1 profile as v2 evidence.
   for(const path of flow.paths){
    const nextLethal=lethal||path.lethal,nextExtra=extra||path.extraTurn,nextMass=mass||path.cheapControl;
    const output=[...path.generatedColors,...path.collectedColors];
    for(let next=start;next<profiles.length;next++){
     const target=profiles[next]!.manaFlow;
     if(!target||profiles[next]!.manaCost<=0)continue;
     const feeds=path.directMana.includes('all')||current===next&&path.directMana.includes('self')
      ||output.some(c=>target.consumedColors.includes(c));
     if(!feeds)continue;
     if(next===start){
      if(nextExtra&&nextLethal)lethalRisk=true;
      if(nextExtra&&nextMass)controlRisk=true;
     }else if(!visited.has(next))visit(next,new Set([...visited,next]),nextLethal,nextExtra,nextMass);
    }
   }
  };
  visit(start,new Set([start]),false,false,false);
 }
 return [...(lethalRisk?['teamLethalManaLoop']:[]),...(controlRisk?['teamCheapControlLoop']:[])];
}
export function enemyProfileWeight(profile:EnemyAssemblyProfile,rank:string,teamColors?:readonly string[]):number {
 const rule=ENEMY_RANK_GENERATION_RULES[rank]!;
 const complexity=Math.pow(.5,Math.max(0,profile.maxPathFamilies-rule.simpleTarget));
 const synergy=teamColors&&profile.primaryRole==='Generator'&&profile.generatedColors.length
  ?profile.generatedColors.some(c=>teamColors.includes(c))?1.5:.5:1;
 return enemyRoleAffinity(profile.primaryRole,profile.capabilities)*complexity*synergy;
}
/** FNV namespace mixing keeps selection independent from battle RNG and stat variation. */
export function enemySelectionRng(seed:number,namespace:string):SeededRNG {
 let h=2166136261;for(const c of `${seed}:${namespace}`)h=Math.imul(h^c.charCodeAt(0),16777619);return new SeededRNG(h>>>0);
}
export function pickEnemyWeighted<T>(items:readonly T[],weight:(item:T)=>number,rng:SeededRNG):T {
 const weights=items.map(item=>weight(item));
 if(!items.length||weights.some(w=>!Number.isFinite(w)||w<0))throw new Error('敌人候选权重无效');
 const total=weights.reduce((a,b)=>a+b,0);if(total<=0)throw new Error('敌人候选权重需要为正');
 let roll=rng.next()*total;for(let i=0;i<items.length;i++){roll-=weights[i]!;if(roll<0)return items[i]!;}return items[items.length-1]!;
}
/** Preserve actual native task evidence when replacing traits. Source labels alone do not prove it. */
export function primaryTaskPreserved(role:string,native:readonly string[],actual:readonly string[]):boolean {
 const anchors:Record<string,readonly string[]>={
  Striker:['damage','skullOffense','devour','execute'],Mage:['damage','gemCreate','gemConvert'],
  Generator:['mana','colorGem','gemExplode'],Support:['allyBuff','allyHeal','allyCleanse','summon'],
  Defender:['armor','barrier','damageReduction'],Warlock:['debuff','control','dispel'],
  Assassin:['damage','trueDamage','execute','devour'],Warrior:['damage','skullOffense','armor','debuff'],
  Warmaster:['skullOffense','gemCreate','gemConvert','allyBuff','summon'],
 };
 const expected=(anchors[role]??[]).filter(k=>native.includes(k));
 // When the source uses a contextual/branch-exclusive task, preserve its whole native trait kit instead.
 return !expected.length?false:expected.some(k=>actual.includes(k));
}
export function generationTraitIsReachable(trait:TraitDefinition):boolean {
 return Object.entries(trait).some(([key,v])=>!['code','name','description','troops'].includes(key)&&traitValueIsReachable(v,key));
}
