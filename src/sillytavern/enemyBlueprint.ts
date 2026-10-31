import {SeededRNG} from '../engine/rng';
import {TROOPS,getTroopById} from '../data/troops';
import type {TroopData} from '../data/troops';
import {troopStatsAtLevel} from '../data/leveling';
import {RACE_NAMES} from '../meta/data/races';
import {getTrait,registerDynamicTraits} from '../engine/traits';
import type {TraitDefinition} from '../engine/traits';
import {SKILL_LIBRARY,registerSkillLibrary} from '../engine/skills/library';
import type {SkillPrototype} from '../engine/skills/prototypes';
import {choiceRuleOf,copyGowChoiceRule} from '../engine/skills/gowChoiceRules';
import type {ExtensionRegistry} from '../engine/registry';
import type {Character,BaseColor,KingdomRef} from '../engine/types';
import type {CombatantSnapshot} from '../session/contract';
import {ROLE_NAMES,restorePortrait,colorKey,PORTRAITS} from './portraits';
import type {PortraitSelection} from './portraits';
import {RULESET_VERSION} from '../session/contract';
import {stableJson} from './json';
import {STAT_LIMITS} from '../session/validateRequest';
import {describeAdaptedAbility} from './abilityDescription';
import type {AdaptedAbilityDescription} from './abilityDescription';
import {describeAdaptedTrait} from './traitDescription';
import type {AdaptedTraitDescription} from './traitDescription';
import {inspectEnemyMechanisms} from './enemyMechanismRules';
import {prototypeEconomyIssues,traitEconomyIssues} from './economyAvailability';
import {buildSkillNames} from './abilityNames';

export const BLUEPRINT_VERSION=3;
const typeValues=[...new Set(TROOPS.flatMap(t=>t.troopTypes))].sort();
export const ADAPTED_AFFINITIES:readonly string[]=typeValues.map((_,i)=>`affinity:${i+1}`);
const kingdomValues=[...new Set(TROOPS.map(t=>t.kingdom).filter((k):k is string=>!!k))].sort();
const kingdomIds=[...new Set(TROOPS.map(t=>t.kingdomId).filter((k):k is number=>k!=null))].sort((a,b)=>a-b);
const aliasByString=new Map<string,string>();
typeValues.forEach((v,i)=>aliasByString.set(v,`affinity:${i+1}`));
kingdomValues.forEach((v,i)=>aliasByString.set(v,`region:${i+1}`));
const refAliases=new Map(TROOPS.map(t=>[t.referenceName,`unit:${t.id}`]));
const sourceByRef=new Map(TROOPS.map(t=>[`unit:${t.id}`,t]));
// Native named-unit effects match all same-name variants. Keep that group identity after renaming.
const identityAliases=new Map<string,string>();
for(const t of [...TROOPS].sort((a,b)=>a.id-b.id))if(!identityAliases.has(t.name))identityAliases.set(t.name,`unit:${t.id}`);
const displayAliases=[...Object.entries(RACE_NAMES).map(([key,name])=>[name,`族群${typeValues.indexOf(key)+1}`]),...kingdomValues.map((name,i)=>[name,`区域${i+1}`])].filter(([a])=>a&&a.length>1).sort((a,b)=>b[0]!.length-a[0]!.length);
export type EnemyAssemblySelection = {activeTroopId:number;traitCodes:string[]} & (
 {version:1} | {version:2;manaColors:string[]}
);
export interface EnemyBlueprint {
 presentation?:{name?:string;race?:string};
 assembly?:EnemyAssemblySelection;
 statVariationSeed?:number;
 version:typeof BLUEPRINT_VERSION;rulesetVersion:string;recipeSignature:string;recipeId:string;portrait:PortraitSelection;level:number;difficulty:number;
 snapshot:CombatantSnapshot;abilityId:string;sourceId:string;
 context:{affinities:string[];region?:string;regionId?:number};
 budget:{activeCount:1;traitCount:number;effectSegments:number;manaCost:number};
 descriptionAudit:Pick<AdaptedAbilityDescription,'support'|'diagnostics'>;
 traitDescriptionAudit:{code:string;support:AdaptedTraitDescription['support'];diagnostics:AdaptedTraitDescription['diagnostics']}[];
 omittedMechanisms:string[];
}
function scoped(value:unknown):boolean {
 if(!value||typeof value!=='object')return false;
 const o=value as Record<string,unknown>;
 if(o.kind==='ascended'||o.race==='Boss')return true;
 return Object.values(o).some(scoped);
}
/** Remove only scoped bonuses/segments, preserving independent ordinary effects. */
function portValue(value:unknown,key=''):unknown {
 if(typeof value==='string'){
   if(key==='displayName')return identityAliases.has(value)?`召唤体 ${identityAliases.get(value)!.slice(5)}`:value;
   return (['ref','referenceName','randomOf'].includes(key)?refAliases.get(value):aliasByString.get(value))??value;
 }
 if(typeof value==='number'&&(key==='kingdom'||key==='kingdomId'||key==='targetKingdom'||key==='randomOfKingdom')){
   const index=kingdomIds.indexOf(value);if(index<0)throw new Error('未知区域引用 '+value);return 100000+index;
 }
 if(Array.isArray(value))return value.map(v=>portValue(v,key));
 if(!value||typeof value!=='object')return value;
 const output:Record<string,unknown>={};
 for(const [k,v]of Object.entries(value)){
   if(['onDelveGain','onDelveBounty','onDelveMiles','vsAscendedMultiplier'].includes(k))continue;
   if(['condMult','modifier'].includes(k)&&scoped(v))continue;
   if(k==='name'&&['troopPresent','alliesNamed'].includes(String((value as Record<string,unknown>).kind))){
     output[k]=Array.isArray(v)?v.map(name=>typeof name==='string'?identityAliases.get(name)??name:name):typeof v==='string'?identityAliases.get(v)??v:v;
   }else output[aliasByString.get(k)??k]=portValue(v,k);
 }
 return output;
}
export function adaptedDescription(description:string):string {
 const sentences=description.split(/(?<=[。！？])/u).map(s=>{
   if(!/晋升|淘宝模式|魔头/.test(s))return s;
   const conditional=s.search(/如果|若|当/);
   return conditional>0?s.slice(0,conditional):'';
 }).join('');
 let result=sentences;
 for(const [name,label]of displayAliases)result=result.split(name!).join(label!);
 return result.trim();
}
const prototypes=new Map<number,SkillPrototype>();
const descriptions=new Map<number,AdaptedAbilityDescription>();
export function adaptedAbilityDescription(id:number):AdaptedAbilityDescription {
 let description=descriptions.get(id);if(!description){description=describeAdaptedAbility(adaptedPrototype(id),{spellId:id});descriptions.set(id,description);}
 return structuredClone(description);
}
const adaptedTraits=new Map<string,TraitDefinition>();
const traitDescriptions=new Map<string,AdaptedTraitDescription>();
export function adaptedTraitDescription(code:string):AdaptedTraitDescription|undefined {
 const trait=adaptedTrait(code);if(!trait)return undefined;
 return structuredClone(traitDescriptions.get(code)!);
}
export function adaptedPrototype(id:number):SkillPrototype {
 let prototype=prototypes.get(id);if(prototype)return copyGowChoiceRule(prototype,structuredClone(prototype));
 const source=SKILL_LIBRARY[id];if(!source?.segments.length)throw new Error('主动能力尚未实现 '+id);
 prototype=adaptRuntimePrototype(source);
 if(!prototype.segments.length)throw new Error('主动能力仅包含专属机制 '+id);
 prototypes.set(id,prototype);return copyGowChoiceRule(prototype,structuredClone(prototype));
}
/** Weapon aliases and numeric skills use the same abstract references as enemy/learned skills. */
export function registerStSkillLibrary(target:Map<string,SkillPrototype>):void {
 registerSkillLibrary(target);
 for(const [id,prototype]of target)target.set(id,adaptRuntimePrototype(prototype));
}
function adaptRuntimePrototype(source:SkillPrototype):SkillPrototype {
 const raw=structuredClone(source);
 raw.segments=raw.segments.filter(segment=>{
   const s=segment as unknown as Record<string,unknown>;
   return !(['cond','condition'].some(k=>s[k]&&scoped(s[k])));
 });
 return copyGowChoiceRule(source,portValue(raw) as SkillPrototype);
}
export function adaptedTrait(code:string):TraitDefinition|undefined {
 const cached=adaptedTraits.get(code);if(cached)return structuredClone(cached);
 const source=getTrait(code);if(!source)throw new Error('被动能力尚未实现 '+code);
 const trait=portValue(source) as TraitDefinition;
 trait.code=`st:${code}`;
 const effects=Object.keys(trait).filter(k=>!['code','name','description','troops'].includes(k));
 if(!effects.length)return undefined;
 const description=describeAdaptedTrait(trait);trait.description=description.description;traitDescriptions.set(code,description);
 adaptedTraits.set(code,trait);return structuredClone(trait);
}
function statsFor(t:TroopData,level:number,difficulty:number):CombatantSnapshot['stats'] {
 const stats=troopStatsAtLevel(t,level);
 const result={hp:Math.max(1,Math.round(stats.health*difficulty)),attack:Math.round(stats.attack*difficulty),armor:Math.round(stats.armor*difficulty),magic:Math.round(stats.magic*difficulty)};
 for(const key of ['hp','attack','armor','magic'] as const){const limits=STAT_LIMITS[key];if(result[key]<limits.min||result[key]>limits.max)throw new Error(`本配置${{hp:'生命',attack:'攻击',armor:'护甲',magic:'魔力'}[key]} ${result[key]} 超出当前规则范围 ${limits.min}–${limits.max}，请调整等级或难度`);}
 return result;
}
/** Use a separate RNG so individual stats never consume combat or assembly randomness. */
function varyEnemyStats(stats:CombatantSnapshot['stats'],seed:number):void {
 if(!Number.isSafeInteger(seed))throw new Error('敌人数值浮动种子需要安全整数');
 const rng=new SeededRNG(seed);
 for(const key of ['hp','attack','armor','magic'] as const){
  const direction=rng.nextInt(2)===0?-1:1;
  const basisPoints=500+rng.nextInt(501);
  const limits=STAT_LIMITS[key];
  stats[key]=Math.max(limits.min,Math.min(limits.max,Math.round(stats[key]*(1+direction*basisPoints/10000))));
 }
}
let skillNames:Map<number,string>|undefined;
/** Player-facing skill name of a troop's active: original game name, one name per mechanics (abilityNames.ts). */
export function skillNameForTroop(troopId:number):string|undefined {
 skillNames??=buildSkillNames(TROOPS,troop=>{try{return learningAbilityId(adaptedPrototype(troop.spell.id),troop.manaCost);}catch{return undefined;}});
 return skillNames.get(troopId);
}
/** Skill name follows the original game (see skillNameForTroop); the description stays the adapted mechanics. */
function compiledSnapshot(t:TroopData,externalId:string,level:number,difficulty:number,active=t,traitCodes=t.traits.map(tr=>tr.code)):CombatantSnapshot {
 const traits=traitCodes.map(code=>adaptedTrait(code)).filter((tr):tr is TraitDefinition=>!!tr);
 const description=adaptedAbilityDescription(active.spell.id);
 const affiliations=portValue(t.troopTypes) as string[];
 const region=t.kingdom?aliasByString.get(t.kingdom):undefined;
 return {externalId,battleScaling:{level,difficulty},mechanicalIdentity:identityAliases.get(t.name),name:`${ROLE_NAMES[t.role!]} ${externalId}`,role:t.role,stats:statsFor(t,level,difficulty),levelLabel:String(level),manaColors:[...active.manaColors],manaCost:active.manaCost,skillId:`st:${active.spell.id}`,traitIds:traits.map(tr=>tr.code),traitNames:Object.fromEntries(traits.map(tr=>[tr.code,tr.name])),troopTypes:affiliations,...(region?{kingdom:region}:{}),...(t.kingdomId!=null?{kingdomId:portValue(t.kingdomId,'kingdomId') as number}:{}),spellName:skillNameForTroop(active.id)??description.name,spellDescription:description.description,rarityIdx:t.rarityIdx};
}
/** Only mechanical recipe/cost/colors define learning identity; presentation, rank and level do not. */
export function abilityIdentity(recipe:SkillPrototype,manaColors:readonly string[],manaCost:number):string {
 const choiceRule=choiceRuleOf(recipe);
 const text=stableJson({recipe,...(choiceRule?{choiceRule}:{}),manaColors:colorKey(manaColors),manaCost});let hash=14695981039346656037n;
 for(let i=0;i<text.length;i++){hash^=BigInt(text.charCodeAt(i));hash=BigInt.asUintN(64,hash*1099511628211n);}
 return `active:v1:${hash.toString(16).padStart(16,'0')}`;
}
/**
 * Learning identity for soul fragments and companion equipping. Mana colors belong to the
 * caster, not the ability, so they are excluded; the native recipe, choice rule and cost remain.
 * Blueprint `abilityId` keeps the historical v1 value for persisted enemy configurations.
 */
export function learningAbilityId(recipe:SkillPrototype,manaCost:number):string {
 const choiceRule=choiceRuleOf(recipe);
 const text=stableJson({recipe,...(choiceRule?{choiceRule}:{}),manaCost});let hash=14695981039346656037n;
 for(let i=0;i<text.length;i++){hash^=BigInt(text.charCodeAt(i));hash=BigInt.asUintN(64,hash*1099511628211n);}
 return `active:v2:${hash.toString(16).padStart(16,'0')}`;
}
/** Learning identity of an adapted `st:<spellId>` active; undefined for non-catalogue skills. */
export function learningAbilityIdForSkill(skillId:string|undefined,manaCost:number):string|undefined {
 const match=/^st:(\d+)$/.exec(skillId??'');
 return match?learningAbilityId(adaptedPrototype(Number(match[1])),manaCost):undefined;
}
export function compileEnemyBlueprint(input:{presentation?:{name?:string;race?:string};portrait:PortraitSelection;recipeTroopId?:number;assembly?:EnemyAssemblySelection;externalId:string;level?:number;difficulty?:number;statVariationSeed?:number}):EnemyBlueprint {
 const {entry,selection}=restorePortrait(input.portrait);
 const presentation=input.presentation;
 if(presentation!==undefined){
  if(!presentation||typeof presentation!=='object'||Array.isArray(presentation)||!Object.keys(presentation).length||Object.keys(presentation).some(key=>!['name','race'].includes(key)))throw new Error('敌人姓名与种族格式有误');
  for(const value of Object.values(presentation))if(typeof value!=='string'||!value.trim()||value.length>80)throw new Error('敌人姓名与种族需要 1～80 字符的非空文字');
 }
 const t=getTroopById(input.recipeTroopId??entry.troopId);if(!t)throw new Error('敌人配方不存在');
 const sourcePortrait=PORTRAITS.find(p=>p.troopId===t.id);
 if(!sourcePortrait||sourcePortrait.rank!==entry.rank)throw new Error('配方需要匹配当前稀有度');
 // Historical selections keep their original color contract; new artwork is independent of mana.
 if(selection.query.manaColors!==undefined&&colorKey(t.manaColors)!==colorKey(selection.query.manaColors))throw new Error('历史配方需要匹配保存的法力颜色');
 const level=input.level??20;const difficulty=input.difficulty??1;
 if(!Number.isInteger(level)||level<1||level>100||!Number.isFinite(difficulty)||difficulty<.1||difficulty>10||!input.externalId)throw new Error('等级、难度或角色标识有误');
 const assembly=input.assembly===undefined?undefined:validateEnemyAssembly(t,input.assembly);
 const active=assembly?getTroopById(assembly.activeTroopId)!:t;
 const traitCodes=assembly?.traitCodes??t.traits.map(tr=>tr.code);
 const snapshot=compiledSnapshot(t,input.externalId,level,difficulty,active,traitCodes);
 if(input.statVariationSeed!==undefined)varyEnemyStats(snapshot.stats,input.statVariationSeed);
 if(assembly?.version===2)snapshot.manaColors=[...assembly.manaColors] as BaseColor[];
 const role=assembly?.version===2?t.role!:entry.role;
 snapshot.role=role;
 snapshot.name=presentation?.name??`${ROLE_NAMES[role as keyof typeof ROLE_NAMES]} ${input.externalId}`;
 if(presentation?.race!==undefined)snapshot.race=presentation.race;
 snapshot.portraitUrl=`${import.meta.env.BASE_URL??'/'}static/portraits/${entry.assetId}.webp`;
 const description=adaptedAbilityDescription(active.spell.id);
 const omitted=assembly?[]:t.traits.filter(tr=>!adaptedTrait(tr.code)).map(tr=>tr.name);
 if(/晋升|淘宝模式|魔头/.test(active.spell.description))omitted.push('专属技能增幅');
 const signature=assembly?assemblySignature(t,active,assembly.traitCodes,assembly.version===2?assembly.manaColors:undefined):recipeSignature(t);
 return {...(presentation?{presentation:{...presentation}}:{}),version:BLUEPRINT_VERSION,rulesetVersion:RULESET_VERSION,recipeSignature:signature,...(assembly?{assembly}:{}),...(input.statVariationSeed!==undefined?{statVariationSeed:input.statVariationSeed}:{}),recipeId:`enemy:${t.id}`,portrait:selection,level,difficulty,snapshot,abilityId:abilityIdentity(adaptedPrototype(active.spell.id),snapshot.manaColors,active.manaCost),sourceId:assembly?`assembled:${signature}`:`enemy:${t.id}`,traitDescriptionAudit:traitCodes.flatMap(code=>{const audit=adaptedTraitDescription(code);return audit?[{code:`st:${code}`,support:audit.support,diagnostics:audit.diagnostics}]:[];}),descriptionAudit:{support:description.support,diagnostics:description.diagnostics},context:{affinities:[...(snapshot.troopTypes??[])],...(snapshot.kingdom?{region:snapshot.kingdom}:{}),...(snapshot.kingdomId!==undefined?{regionId:snapshot.kingdomId}:{})},budget:{activeCount:1,traitCount:snapshot.traitIds?.length??0,effectSegments:adaptedPrototype(active.spell.id).segments.length,manaCost:active.manaCost},omittedMechanisms:omitted};
}
/** Mechanical modules retain their native order, input rules, costs and abstract references. */
export function validateEnemyAssembly(chassis:TroopData,value:unknown):EnemyAssemblySelection {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('组装模块需要有效对象');
 const selection=value as EnemyAssemblySelection;
 if(Object.keys(value).some(key=>!(selection.version===2?['version','activeTroopId','traitCodes','manaColors']:['version','activeTroopId','traitCodes']).includes(key))||![1,2].includes(selection.version)||!Number.isSafeInteger(selection.activeTroopId))throw new Error('组装模块协议有误');
 if(selection.version===2)colorKey(selection.manaColors);
 const active=getTroopById(selection.activeTroopId);
 if(!active||active.rarityIdx!==chassis.rarityIdx||colorKey(active.manaColors)!==colorKey(chassis.manaColors))throw new Error('主动模块需要匹配底板的原始稀有度和完整法力颜色');
 if(!Array.isArray(selection.traitCodes)||selection.traitCodes.length>chassis.traits.length||selection.traitCodes.some(code=>typeof code!=='string'||!code)||new Set(selection.traitCodes).size!==selection.traitCodes.length)throw new Error('特质槽位超限、重复或格式有误');
 for(const code of selection.traitCodes){
  if(!TROOPS.some(source=>source.rarityIdx<=chassis.rarityIdx&&source.traits.some(trait=>trait.code===code)))throw new Error('特质模块超出底板的原始稀有度：'+code);
  if(!adaptedTrait(code))throw new Error('特质模块仅含已排除的专属机制：'+code);
 }
 const prototype=adaptedPrototype(active.spell.id),traits=selection.traitCodes.map(code=>adaptedTrait(code)!);
 const rules=inspectEnemyMechanisms(prototype,traits);
 const issues=[...rules.unknown,...prototypeEconomyIssues(prototype),...traits.flatMap(trait=>traitEconomyIssues(trait))];
 if(issues.length)throw new Error('组装机制检查未通过：'+issues.join('；'));
 return selection.version===2?{version:2,activeTroopId:active.id,traitCodes:[...selection.traitCodes],manaColors:colorKey(selection.manaColors).split(',')}:{version:1,activeTroopId:active.id,traitCodes:[...selection.traitCodes]};
}
function assemblySignature(chassis:TroopData,active:TroopData,codes:readonly string[],manaColors?:readonly string[]):string {
 // Both source contracts and ordered traits participate; identity is independent of level/art/name.
 const text=stableJson({version:manaColors?2:1,chassis:recipeSignature(chassis),active:recipeSignature(active),traits:codes.map(code=>adaptedTrait(code)),...(manaColors?{manaColors:colorKey(manaColors)}:{})});
 let hash=14695981039346656037n;
 for(let index=0;index<text.length;index++){hash^=BigInt(text.charCodeAt(index));hash=BigInt.asUintN(64,hash*1099511628211n);}
 return hash.toString(16).padStart(16,'0');
}
export function registerAdaptedCatalog(registry:ExtensionRegistry):void {
 const traits:TraitDefinition[]=[];
 for(const t of TROOPS){
   registry.prototypes.set(`st:${t.spell.id}`,adaptedPrototype(t.spell.id));
   for(const tr of t.traits){const adapted=adaptedTrait(tr.code);if(adapted)traits.push(adapted);}
 }
 registerDynamicTraits(traits);
}
export function resolveAdaptedSummon(ref:string,scalingOrSource:{level:number;difficulty:number}|Character={level:20,difficulty:1}):Omit<Character,'id'|'defeated'|'statuses'>|null {
 const t=sourceByRef.get(ref);if(!t)return null;
 const scaling='level' in scalingOrSource?scalingOrSource:scalingOrSource.battleScaling??{level:20,difficulty:1};
 if(!Number.isInteger(scaling.level)||scaling.level<1||scaling.level>100||!Number.isFinite(scaling.difficulty)||scaling.difficulty<.1||scaling.difficulty>10)throw new Error('派生形态的等级或难度超出范围');
 const s=compiledSnapshot(t,ref,scaling.level,scaling.difficulty);
 const portrait=PORTRAITS.find(p=>p.troopId===t.id);
 const portraitUrl=portrait?`${import.meta.env.BASE_URL??'/'}static/portraits/${portrait.assetId}.webp`:`${import.meta.env.BASE_URL??'/'}static/hero/character-unknown.webp`;
 return {battleScaling:{...scaling},...(portraitUrl?{portraitUrl}:{}),role:s.role,mechanicalIdentity:s.mechanicalIdentity,name:`召唤体${t.id}`,maxHp:s.stats.hp,hp:s.stats.hp,attack:s.stats.attack,armor:s.stats.armor,magic:s.stats.magic,colors:s.manaColors as BaseColor[],manaCost:s.manaCost,mana:0,skillId:s.skillId!,spellName:s.spellName,spellDescription:s.spellDescription,traitIds:s.traitIds,traitNames:s.traitNames,troopTypes:s.troopTypes,kingdom:s.kingdom,kingdomId:s.kingdomId};
}
export function adaptedSummonPool(kind:'Beast'|'Daemon'|KingdomRef):string[]{
 if(kind==='Beast'||kind==='Daemon')return TROOPS.filter(t=>t.troopTypes.includes(kind)).map(t=>`unit:${t.id}`);
 return TROOPS.filter(t=>typeof kind==='number'?portValue(t.kingdomId,'kingdomId')===kind:aliasByString.get(t.kingdom??'')===kind).map(t=>`unit:${t.id}`);
}

/** Source catalog and adapted definitions are fixed for the lifetime of this module. */
const recipeSignatures=new WeakMap<TroopData,string>();
/** Stable content fingerprint; restore also compares every canonical field. */
function recipeSignature(t:TroopData):string {
 const cached=recipeSignatures.get(t);if(cached)return cached;
 const active=adaptedPrototype(t.spell.id),choiceRule=choiceRuleOf(active);
 const text=stableJson({derivedFormRules:1,environmentScalingRules:1,troop:t,active,...(choiceRule?{choiceRule}:{}),traits:t.traits.map(tr=>adaptedTrait(tr.code)??null),typeValues,kingdomValues,kingdomIds,identityAliases:[...identityAliases]});
 let hash=2166136261;
 for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
 const signature=(hash>>>0).toString(16).padStart(8,'0');recipeSignatures.set(t,signature);return signature;
}
export function restoreEnemyBlueprint(value:unknown):EnemyBlueprint {
 if(!value||typeof value!=='object')throw new Error('敌人配置格式有误，请重新组装');
 const saved=value as EnemyBlueprint;
 if(saved.version!==BLUEPRINT_VERSION||saved.rulesetVersion!==RULESET_VERSION)throw new Error('敌人配置版本已变更，请重新组装');
 if(typeof saved.recipeId!=='string'||!/^enemy:\d+$/.test(saved.recipeId)||!saved.snapshot||typeof saved.snapshot.externalId!=='string')throw new Error('敌人配方标识有误');
 const canonical=compileEnemyBlueprint({...(saved.presentation!==undefined?{presentation:saved.presentation}:{}),portrait:saved.portrait,recipeTroopId:Number(saved.recipeId.slice(6)),...(saved.assembly!==undefined?{assembly:saved.assembly}:{}),externalId:saved.snapshot.externalId,level:saved.level,difficulty:saved.difficulty,...(saved.statVariationSeed!==undefined?{statVariationSeed:saved.statVariationSeed}:{})});
 if(stableJson(saved)!==stableJson(canonical))throw new Error('敌人技能、数值或配方已变更，请重新组装');
 return canonical;
}

