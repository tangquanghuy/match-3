import type {TroopData} from '../data/troops';
import type {TraitDefinition} from '../engine/traits';
import type {SkillPrototype} from '../engine/skills/prototypes';
import type {EnemyBlueprint} from './enemyBlueprint';
import type {PortraitEntry,PortraitSelection} from './portraits';
import {stableJson} from './json';

export const ASSEMBLY_COVERAGE_VERSION=1;
export const COVERAGE_RARITIES=['Common','Uncommon','Rare','UltraRare','Epic','Legendary'] as const;
export const COVERAGE_RANKS=['杂兵','精锐','首领','领主','传奇'] as const;
const rankByRarity=['杂兵','杂兵','精锐','首领','领主','传奇'];
const metadata=new Set(['code','name','description','troops']);
const scopedFields=new Set(['onDelveGain','onDelveBounty','onDelveMiles','vsAscendedMultiplier']);
export type CoverageTroop=Pick<TroopData,'id'|'name'|'rarity'|'rarityIdx'|'spell'|'traits'>;
export interface MechanismInspection {
 families:readonly string[];targets:readonly string[];dependencies:readonly unknown[];unknown:readonly unknown[];
 unknownDetails?:readonly {key:string;family:string|null;detail:string}[];
}
/** All runtime dependencies are explicit: unit fixtures never enumerate the production catalog. */
export interface EnemyAssemblyCoverageCatalog {
 troops:readonly CoverageTroop[];
 sourceTroops?:readonly CoverageTroop[];
 portraits:readonly PortraitEntry[];
 getTrait:(code:string)=>TraitDefinition|undefined;
 adaptedTrait:(code:string)=>TraitDefinition|undefined;
 adaptedPrototype:(id:number)=>SkillPrototype;
 inspectEnemyMechanisms:(prototype:SkillPrototype,traits:TraitDefinition[])=>MechanismInspection;
 compileEnemyBlueprint:(input:{portrait:PortraitSelection;recipeTroopId:number;assembly:{version:1;activeTroopId:number;traitCodes:string[]};externalId:string;level:number;difficulty:number})=>EnemyBlueprint;
 restoreEnemyBlueprint:(value:unknown)=>EnemyBlueprint;
}
export interface CoverageGap {kind:string;key:string;detail:string}
export interface MechanismOmission {scope:'active'|'trait';id:string;path:string;mechanism:string}
export interface AssemblyCoverageEntry {
 id:number;name:string;rarity:string;rarityIdx:number;rank:string;
 portrait:{assetId:string;troopId:number;contentHash:string}|null;
 assembly:{version:1;activeTroopId:number;traitCodes:string[]};
 nativeTraitCodes:string[];omissions:MechanismOmission[];
 mapped:boolean;compiled:boolean;restoreConsistent:boolean;rulesInspected:boolean;
 families:string[];targets:string[];dependencies:unknown[];unknownRules:string[];
 descriptionAudit:EnemyBlueprint['descriptionAudit']|null;
 traitDescriptionAudit:EnemyBlueprint['traitDescriptionAudit'];
 descriptionsComplete:boolean;structurallyCovered:boolean;
 behaviorAcceptance:'not-assessed';gaps:CoverageGap[];
}
export interface AssemblyCoverageRow {
 name:string;total:number;mapped:number;compiled:number;unknownRules:number;unknownRuleCount:number;
 descriptionsComplete:number;structurallyCovered:number;missing:number;required:number;coverage:number|null;meetsTarget:boolean;
}
export interface SharedMechanismGap {
 key:string;family:string|null;detail:string;reportedBy:number[];enemyIds:number[];count:number;
}
export interface EnemyAssemblyCoverageReport {
 version:number;scope:'all-runtime-troops';target:number;level:number;difficulty:number;
 definitions:{mapped:string;compiled:string;structurallyCovered:string;behaviorAcceptance:string;denominator:string};
 total:number;summary:AssemblyCoverageRow;rarities:AssemblyCoverageRow[];ranks:AssemblyCoverageRow[];
 families:{family:string;count:number;enemyIds:number[];unknownRules:string[];affectedCount:number;affectedEnemyIds:number[]}[];
 unknownRules:SharedMechanismGap[];enemies:AssemblyCoverageEntry[];
 check:{scope:'structural-assembly-only';passed:boolean;failures:string[]};
}
const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
const unique=(values:readonly string[])=>[...new Set(values)].sort();
const object=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;

function omissionsIn(value:unknown,scope:MechanismOmission['scope'],id:string,path=''):MechanismOmission[] {
 if(!value||typeof value!=='object')return [];
 const result:MechanismOmission[]=[];
 for(const [key,child]of Object.entries(value)){
  const at=path?`${path}.${key}`:key;
  if(scopedFields.has(key))result.push({scope,id,path:at,mechanism:key});
  else if((key==='kind'&&child==='ascended')||(key==='race'&&child==='Boss'))result.push({scope,id,path:at,mechanism:String(child)});
  else result.push(...omissionsIn(child,scope,id,at));
 }
 return result;
}

function inspectionUnknown(value:unknown,families:readonly string[]):{key:string;family:string|null;detail:string} {
 const item=object(value);
 const key=typeof value==='string'?value:typeof item?.rule==='string'?item.rule:typeof item?.key==='string'?item.key:typeof item?.family==='string'?item.family:stableJson(value);
 // Rule identifiers are structural family identifiers. Never infer success from a signature.
 const family=item?.family===null?null:typeof item?.family==='string'?item.family:families.find(f=>f===key)??null;
 return {key,family,detail:typeof item?.detail==='string'?item.detail:typeof item?.message==='string'?item.message:stableJson(value)};
}

export function assemblyCoverageRows(entries:readonly AssemblyCoverageEntry[],group:'rarity'|'rank',target=.9):AssemblyCoverageRow[] {
 const expected:readonly string[]=group==='rarity'?COVERAGE_RARITIES:COVERAGE_RANKS;
 return [...expected,...unique(entries.map(e=>e[group]).filter(name=>!expected.includes(name)))].map(name=>coverageRow(name,entries.filter(e=>e[group]===name),target));
}
function coverageRow(name:string,entries:readonly AssemblyCoverageEntry[],target:number):AssemblyCoverageRow {
 const total=entries.length,covered=entries.filter(e=>e.structurallyCovered).length,required=Math.ceil(total*target);
 return {name,total,mapped:entries.filter(e=>e.mapped).length,compiled:entries.filter(e=>e.compiled).length,
  unknownRules:entries.filter(e=>e.unknownRules.length).length,unknownRuleCount:new Set(entries.flatMap(e=>e.unknownRules)).size,
  descriptionsComplete:entries.filter(e=>e.descriptionsComplete).length,structurallyCovered:covered,missing:total-covered,required,
  coverage:total?covered/total:null,meetsTarget:covered>=required};
}

export function buildEnemyAssemblyCoverage(catalog:EnemyAssemblyCoverageCatalog,options:{target?:number;level?:number;difficulty?:number}={}):EnemyAssemblyCoverageReport {
 const target=options.target??.9,level=options.level??20,difficulty=options.difficulty??1;
 if(!Number.isFinite(target)||target<.9||target>1)throw new Error('结构组装阈值必须在 0.9 至 1 之间');
 if(!Number.isInteger(level)||level<1||level>100||!Number.isFinite(difficulty)||difficulty<.1||difficulty>10)throw new Error('覆盖报告等级或难度有误');
 const seen=new Set<number>();
 const portraits=new Map<number,PortraitEntry>();
 for(const portrait of catalog.portraits)if(!portraits.has(portrait.troopId))portraits.set(portrait.troopId,portrait);
 const sources=new Map((catalog.sourceTroops??catalog.troops).map(t=>[t.id,t]));
 const unknowns=new Map<string,{key:string;family:string|null;detail:string;reportedBy:Set<number>}>();
 const enemies=catalog.troops.map(t=>{
  if(seen.has(t.id))throw new Error(`重复 catalog troop id: ${t.id}`);
  seen.add(t.id);
  const source=sources.get(t.id)??t,portrait=portraits.get(t.id);
  const entry:AssemblyCoverageEntry={id:t.id,name:t.name,rarity:source.rarity,rarityIdx:source.rarityIdx,rank:rankByRarity[source.rarityIdx]??'未知',
   portrait:portrait?{assetId:portrait.assetId,troopId:portrait.troopId,contentHash:portrait.contentHash}:null,
   assembly:{version:1,activeTroopId:t.id,traitCodes:[]},nativeTraitCodes:t.traits.map(tr=>tr.code),omissions:[],
   mapped:false,compiled:false,restoreConsistent:false,rulesInspected:false,families:[],targets:[],dependencies:[],unknownRules:[],
   descriptionAudit:null,traitDescriptionAudit:[],descriptionsComplete:false,structurallyCovered:false,behaviorAcceptance:'not-assessed',gaps:[]};
  const gap=(kind:string,key:string,detail:string)=>entry.gaps.push({kind,key,detail});
  if(!portrait)gap('portrait',String(t.id),'真实 PORTRAITS 中没有对应 troopId');
  else if(!portrait.assetId||!portrait.contentHash)gap('portrait',String(t.id),'肖像缺少 assetId 或 contentHash');
  let prototype:SkillPrototype|undefined;
  try {prototype=catalog.adaptedPrototype(t.spell.id);if(!prototype?.segments.length)gap('active',String(t.spell.id),'适配原型没有有效片段');}
  catch(error){gap('active',String(t.spell.id),errorText(error));}
  // Descriptive scope markers are retained even if the adapted active recipe has removed them.
  for(const mechanism of ['晋升','淘宝模式','魔头'])if(source.spell.description.includes(mechanism))entry.omissions.push({scope:'active',id:String(t.spell.id),path:'source.spell.description',mechanism});
  const traits:TraitDefinition[]=[];
  for(const tr of t.traits){
   try {
    const native=catalog.getTrait(tr.code);
    if(!native){gap('trait',tr.code,'原生特质未注册');continue;}
    const omissions=omissionsIn(native,'trait',tr.code);
    entry.omissions.push(...omissions);
    const adapted=catalog.adaptedTrait(tr.code);
    if(!adapted){
     const effects=Object.keys(native).filter(key=>!metadata.has(key));
     if(!effects.length||effects.some(key=>!scopedFields.has(key)))gap('trait',tr.code,'独立原生效果在适配中丢失');
     continue;
    }
    traits.push(adapted);entry.assembly.traitCodes.push(tr.code);
   }catch(error){gap('trait',tr.code,errorText(error));}
  }
  entry.mapped=!entry.gaps.some(g=>['portrait','active','trait'].includes(g.kind));
  try {
   // Still inspect surviving traits when the active or portrait is missing.
   const rules=catalog.inspectEnemyMechanisms(prototype??{segments:[]},traits);
   if(!Array.isArray(rules.families)||!Array.isArray(rules.targets)||!Array.isArray(rules.dependencies)||!Array.isArray(rules.unknown)||(rules.unknownDetails!==undefined&&!Array.isArray(rules.unknownDetails)))throw new Error('机制检查器返回格式有误');
   entry.rulesInspected=true;entry.families=unique(rules.families);entry.targets=unique(rules.targets);entry.dependencies=JSON.parse(JSON.stringify(rules.dependencies));
   // Details preserve the exact legacy diagnostic in detail; keep any uncovered unknowns.
   const details=rules.unknownDetails??[],detailedMessages=new Set(details.map(rule=>rule.detail));
   for(const value of [...details,...rules.unknown.filter(value=>typeof value!=='string'||!detailedMessages.has(value))]){
    const rule=inspectionUnknown(value,entry.families),identity=stableJson([rule.key,rule.family]);
    let shared=unknowns.get(identity);
    if(!shared){shared={...rule,reportedBy:new Set()};unknowns.set(identity,shared);}
    shared.reportedBy.add(t.id);
   }
  }catch(error){gap('rules','inspection',errorText(error));}
  if(portrait){
   try {
    const selection:PortraitSelection={version:1,query:{manaColors:[...portrait.manaColors],rank:portrait.rank,form:portrait.form,role:portrait.role},assetId:portrait.assetId,troopId:portrait.troopId,contentHash:portrait.contentHash};
    const blueprint=catalog.compileEnemyBlueprint({portrait:selection,recipeTroopId:t.id,assembly:structuredClone(entry.assembly),externalId:`coverage:${t.id}`,level,difficulty});
    entry.descriptionAudit=structuredClone(blueprint.descriptionAudit??null);
    entry.traitDescriptionAudit=structuredClone(blueprint.traitDescriptionAudit??[]);
    entry.omissions.push(...(blueprint.omittedMechanisms??[]).map(mechanism=>({scope:'active' as const,id:String(t.spell.id),path:'blueprint.omittedMechanisms',mechanism})));
    // A successful call or recipeSignature alone is insufficient: validate retained inputs and JSON restore.
    if(stableJson(blueprint.assembly)!==stableJson(entry.assembly))gap('compile','assembly','编译结果未完整保留显式 assembly');
    if(blueprint.recipeId!==`enemy:${t.id}`||blueprint.level!==level||blueprint.difficulty!==difficulty||blueprint.snapshot.externalId!==`coverage:${t.id}`)gap('compile','identity','编译结果与输入身份或缩放不一致');
    if(stableJson(blueprint.portrait)!==stableJson(selection))gap('compile','portrait','编译结果未保留真实肖像选择');
    if(blueprint.snapshot.skillId!==`st:${t.spell.id}`||stableJson(blueprint.snapshot.traitIds)!==stableJson(traits.map(tr=>tr.code)))gap('compile','modules','编译结果丢失原生主动或有效特质');
    const persisted=JSON.parse(JSON.stringify(blueprint)),baseline=stableJson(persisted);
    const restored=catalog.restoreEnemyBlueprint(persisted);
    entry.restoreConsistent=baseline===stableJson(restored)&&stableJson(restored.assembly)===stableJson(entry.assembly);
    if(!entry.restoreConsistent)gap('restore','round-trip','JSON restore 与编译结果不一致');
    entry.compiled=!entry.gaps.some(g=>g.kind==='compile'||g.kind==='restore');
    entry.descriptionsComplete=entry.descriptionAudit?.support==='full'&&entry.descriptionAudit.diagnostics.length===0
     &&stableJson(entry.traitDescriptionAudit.map(a=>a.code))===stableJson(traits.map(tr=>tr.code))
     &&entry.traitDescriptionAudit.every(a=>a.support==='full'&&a.diagnostics.length===0);
    if(!entry.descriptionsComplete)gap('description','audit','主动或全部有效特质的说明结构审计尚未完整');
   }catch(error){gap('compile','exception',errorText(error));}
  }
  return entry;
 });
 // A missing shared rule affects every consumer of that family, including entries without a local diagnostic.
 const unknownRules:SharedMechanismGap[]=[...unknowns.values()].map(rule=>{
  const reportedBy=[...rule.reportedBy].sort((a,b)=>a-b);
  const enemyIds=enemies.filter(e=>rule.reportedBy.has(e.id)||(rule.family!==null&&e.families.includes(rule.family))).map(e=>e.id).sort((a,b)=>a-b);
  return {key:rule.key,family:rule.family,detail:rule.detail,reportedBy,enemyIds,count:enemyIds.length};
 }).sort((a,b)=>a.key.localeCompare(b.key)||String(a.family).localeCompare(String(b.family)));
 for(const entry of enemies){
  for(const rule of unknownRules)if(rule.enemyIds.includes(entry.id)){
   entry.unknownRules.push(rule.key);
   entry.gaps.push({kind:'unknown-rule',key:rule.key,detail:rule.family?`共享机制 ${rule.family}: ${rule.detail}`:rule.detail});
  }
  entry.unknownRules=unique(entry.unknownRules);
  entry.structurallyCovered=entry.mapped&&entry.compiled&&entry.rulesInspected&&!entry.unknownRules.length&&entry.descriptionsComplete;
 }
 const rarities=assemblyCoverageRows(enemies,'rarity',target),ranks=assemblyCoverageRows(enemies,'rank',target);
 const families=unique(enemies.flatMap(e=>e.families)).map(family=>{
  const members=enemies.filter(e=>e.families.includes(family)),gaps=unknownRules.filter(rule=>rule.family===family);
  const affected=new Set(gaps.flatMap(g=>g.enemyIds));
  const affectedEnemyIds=members.filter(e=>affected.has(e.id)).map(e=>e.id).sort((a,b)=>a-b);
  return {family,count:members.length,enemyIds:members.map(e=>e.id).sort((a,b)=>a-b),unknownRules:unique(gaps.map(g=>g.key)),affectedCount:affectedEnemyIds.length,affectedEnemyIds};
 }).sort((a,b)=>b.count-a.count||a.family.localeCompare(b.family));
 const failures=[...rarities.filter(r=>!r.meetsTarget).map(r=>`rarity:${r.name} ${r.structurallyCovered}/${r.total} < ${r.required}`),...ranks.filter(r=>!r.meetsTarget).map(r=>`rank:${r.name} ${r.structurallyCovered}/${r.total} < ${r.required}`)];
 return {version:ASSEMBLY_COVERAGE_VERSION,scope:'all-runtime-troops',target,level,difficulty,
  definitions:{mapped:'真实肖像、适配主动与全部有效原生特质均有结构映射；专属省略有记录',compiled:'显式 assembly 编译成功、模块与输入一致且 JSON restore 完整一致',
   structurallyCovered:'mapped + compiled + 规则检查完整且无共享未知规则 + 主动和全部保留特质描述审计完整',behaviorAcceptance:'not-assessed；本报告没有执行行为验收，签名仅是编译元数据',denominator:'完整 TROOPS；按 SOURCE_TROOPS 原始 rarity 与 rarityIdx 映射五 rank；专属省略、缺肖像、编译失败和未知规则均保留分母'},
  total:enemies.length,summary:coverageRow('all',enemies,target),rarities,ranks,families,unknownRules,enemies,check:{scope:'structural-assembly-only',passed:failures.length===0,failures}};
}

export function renderEnemyAssemblyCoverageMarkdown(report:EnemyAssemblyCoverageReport):string {
 const percent=(value:number|null)=>value===null?'—':`${(value*100).toFixed(1)}%`;
 const cell=(value:unknown)=>String(value).replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
 const table=(rows:AssemblyCoverageRow[])=>[
  '| 档位 | total | mapped | compiled（含 restore） | 未知规则影响条目 | 未知规则数 | 描述完整 | 结构组装覆盖 | 缺口 | 达标需覆盖 | 覆盖率 |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...rows.map(r=>`| ${cell(r.name)} | ${r.total} | ${r.mapped} | ${r.compiled} | ${r.unknownRules} | ${r.unknownRuleCount} | ${r.descriptionsComplete} | ${r.structurallyCovered} | ${r.missing} | ${r.required} | ${percent(r.coverage)} |`)].join('\n');
 return ['# 敌人机制自动组装覆盖报告','',
  '由 `node scripts/st-enemy-assembly-coverage.mjs` 自动生成；`--check` 检查各原始 rarity 和五 rank 的结构组装阈值（默认 90%，只允许提高）。',
  '',`遍历完整 TROOPS：${report.total} 条；等级 ${report.level}，难度 ${report.difficulty}。结构检查：${report.check.passed?'达标':'未达标'}。`,
  '',...Object.entries(report.definitions).map(([key,value])=>`- **${key}**：${value}。`),
  '', '**此报告不声称机制全部通过行为测试。结构映射覆盖、编译覆盖与行为验收是三项不同结论；没有执行行为测试，也没有使用逐来源签名或历史签收推断通过。**',
  '', '完整逐条 assembly、专属省略、描述审计、目标、依赖与缺口见 `data/st-enemy-assembly-coverage.json`。所有失败均保留在分母中；空档位覆盖率为 —。',
  '', '## 总计','',table([report.summary]),'', '## 原始 rarity','',table(report.rarities),'', '## 五 rank','',table(report.ranks),
  '', '## 共享机制 family → 受影响条目数','',
  '| family | 使用条目数 | 受未知规则影响条目数 | 缺失规则 |','| --- | ---: | ---: | --- |',
  ...report.families.map(f=>`| ${cell(f.family)} | ${f.count} | ${f.affectedCount} | ${f.unknownRules.map(cell).join(', ')||'—'} |`),
  '', '## 未知规则传播','',
  '同一 family 中任一条目报告缺失规则，会传播到该 family 的全部消费者。reportedBy 与受影响 enemyIds 分开保存；没有 family 的未知规则仅按实际报告条目统计。',
  '', '| 规则 | family | 直接报告数 | 受影响条目数 |','| --- | --- | ---: | ---: |',
  ...report.unknownRules.map(r=>`| ${cell(r.key)} | ${cell(r.family??'未分类')} | ${r.reportedBy.length} | ${r.count} |`),
  ...(report.unknownRules.length?[]:['| — | — | 0 | 0 |']),
  '', '## 阈值结果','',...(report.check.failures.length?report.check.failures.map(f=>`- ${f}`):['各原始 rarity 与五 rank 的结构组装覆盖均达到阈值。']),''
 ].join('\n');
}
