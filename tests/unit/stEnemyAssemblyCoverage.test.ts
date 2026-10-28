import {describe,it,expect,vi} from 'vitest';
import {buildEnemyAssemblyCoverage,renderEnemyAssemblyCoverageMarkdown} from '../../src/sillytavern/enemyAssemblyCoverage';
import type {CoverageTroop,EnemyAssemblyCoverageCatalog,MechanismInspection} from '../../src/sillytavern/enemyAssemblyCoverage';
import type {EnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {inspectEnemyMechanisms} from '../../src/sillytavern/enemyMechanismRules';
import type {SkillPrototype} from '../../src/engine/skills/prototypes';
import {BaseColor} from '../../src/engine/types';
import type {PortraitEntry} from '../../src/sillytavern/portraits';

function troop(id:number,rarityIdx=0,traitCodes=['ordinary']):CoverageTroop {
 return {id,name:`fixture ${id}`,rarity:([ 'Common','Uncommon','Rare','UltraRare','Epic','Legendary'] as const)[rarityIdx]!,rarityIdx,
  spell:{id:100+id,name:'fixture active',description:'fixture description',meta:{scalings:[],raw:'fixture description',parsed:false}},
  traits:traitCodes.map(code=>({code,name:code,description:code}))};
}
function portrait(t:CoverageTroop):PortraitEntry {
 return {assetId:`real-${t.id}`,troopId:t.id,manaColors:[BaseColor.Red],rank:['杂兵','杂兵','精锐','首领','领主','传奇'][t.rarityIdx]!,form:'人形',role:'Striker',portraitUrl:`/real-${t.id}.webp`,review:'fixture',contentHash:`hash-${t.id}`};
}
const inspection=(families=['damage']):MechanismInspection=>({families,targets:['enemy'],dependencies:[],unknown:[]});
function fixture(troops:CoverageTroop[]):EnemyAssemblyCoverageCatalog {
 const compiled:EnemyBlueprint[]=[];
 return {troops,portraits:troops.map(portrait),getTrait:code=>({code,name:code,description:code,regen:{stat:'hp',amount:1}}),
  adaptedTrait:code=>({code:`st:${code}`,name:code,description:code,regen:{stat:'hp',amount:1}}),
  adaptedPrototype:id=>({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:id,mult:0}}]}),
  inspectEnemyMechanisms:()=>inspection(),
  compileEnemyBlueprint:input=>{
   const blueprint:EnemyBlueprint={
    version:3,rulesetVersion:'fixture-rules-v1',recipeId:`enemy:${input.recipeTroopId}`,recipeSignature:'a-signature-is-not-behavior-evidence',assembly:structuredClone(input.assembly),
    abilityId:`fixture-ability:${input.recipeTroopId}`,sourceId:`fixture-source:${input.recipeTroopId}`,
    context:{affinities:['affinity:1']},budget:{activeCount:1,traitCount:input.assembly.traitCodes.length,effectSegments:1,manaCost:10},
    level:input.level,difficulty:input.difficulty,portrait:structuredClone(input.portrait),
    snapshot:{externalId:input.externalId,name:`fixture ${input.recipeTroopId}`,stats:{hp:10,armor:5,attack:2,magic:1},manaColors:[BaseColor.Red],manaCost:10,
     skillId:`st:${100+input.recipeTroopId}`,traitIds:input.assembly.traitCodes.map(code=>`st:${code}`)},
    descriptionAudit:{support:'full',diagnostics:[]},traitDescriptionAudit:input.assembly.traitCodes.map(code=>({code:`st:${code}`,support:'full',diagnostics:[]})),omittedMechanisms:[],
   };
   compiled.push(blueprint);return blueprint;
  },
  restoreEnemyBlueprint:value=>{
   const blueprint=compiled.find(bp=>JSON.stringify(bp)===JSON.stringify(value));
   if(!blueprint)throw new Error('fixture restore requires a previously compiled complete contract');
   return structuredClone(blueprint);
  }};
}

describe('automatic enemy assembly structural coverage',()=>{
 it('uses the complete denominator, original rarity and all five ranks, including missing portraits',()=>{
  const troops=[troop(1),troop(2,1),troop(3,2),troop(4,3),troop(5,4),troop(6,5)];
  const catalog=fixture(troops);
  catalog.sourceTroops=troops;
  catalog.troops=troops.map(t=>({...t,rarity:'Legendary',rarityIdx:5}));
  catalog.portraits=catalog.portraits.filter(p=>p.troopId!==1);
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.total).toBe(6);expect(report.summary.total).toBe(6);
  expect(report.rarities.map(r=>[r.name,r.total])).toEqual(['Common','Uncommon','Rare','UltraRare','Epic','Legendary'].map(r=>[r,1]));
  expect(report.ranks.map(r=>[r.name,r.total])).toEqual([['杂兵',2],['精锐',1],['首领',1],['领主',1],['传奇',1]]);
  expect(report.summary.mapped).toBe(5);expect(report.summary.compiled).toBe(5);
  expect(report.rarities[0]).toMatchObject({total:1,mapped:0,compiled:0,missing:1,required:1,meetsTarget:false});
  expect(report.check.passed).toBe(false);
 });

 it('compiles every effective native trait in native order with explicit assembly and the actual portrait',()=>{
  const catalog=fixture([troop(11,2,['ordinary','mixed','scoped'])]);
  const native=catalog.getTrait,adapt=catalog.adaptedTrait;
  catalog.getTrait=code=>code==='scoped'?{code,name:code,description:'scoped',onDelveGain:{stat:'attack',amount:1}}:
   code==='mixed'?{...native(code)!,onDelveGain:{stat:'attack',amount:1}}:native(code);
  catalog.adaptedTrait=code=>code==='scoped'?undefined:adapt(code);
  const compile=vi.fn(catalog.compileEnemyBlueprint);catalog.compileEnemyBlueprint=compile;
  const entry=buildEnemyAssemblyCoverage(catalog).enemies[0]!;
  expect(compile).toHaveBeenCalledWith(expect.objectContaining({recipeTroopId:11,externalId:'coverage:11',level:20,difficulty:1,
   assembly:{version:1,activeTroopId:11,traitCodes:['ordinary','mixed']},
   portrait:expect.objectContaining({assetId:'real-11',troopId:11,contentHash:'hash-11'})}));
  expect(entry.omissions.map(o=>o.id)).toEqual(['mixed','scoped']);
  expect(entry.structurallyCovered).toBe(true);expect(entry.behaviorAcceptance).toBe('not-assessed');
 });

 it('keeps unregistered, unexpectedly dropped and exclusively scoped traits in the denominator',()=>{
  const catalog=fixture([troop(1,0,['missing']),troop(2,0,['dropped']),troop(3,0,['scoped'])]);
  const native=catalog.getTrait;
  catalog.getTrait=code=>code==='missing'?undefined:code==='scoped'?{code,name:code,description:'scoped',onDelveGain:{stat:'attack',amount:1}}:native(code);
  catalog.adaptedTrait=()=>undefined;
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.summary).toMatchObject({total:3,mapped:1,structurallyCovered:1,missing:2,required:3});
  expect(report.enemies[0]!.gaps).toContainEqual(expect.objectContaining({kind:'trait',key:'missing'}));
  expect(report.enemies[1]!.gaps).toContainEqual(expect.objectContaining({kind:'trait',key:'dropped'}));
  expect(report.enemies[2]!.omissions).toHaveLength(1);
 });

 it('propagates one missing rule to every consumer of the shared family, deduplicating family counts',()=>{
  const catalog=fixture([troop(1),troop(2,2),troop(3,5)]);
  catalog.inspectEnemyMechanisms=prototype=>{
   const segment=prototype.segments[0];
   if(segment?.kind!=='damage')throw new Error('unexpected fixture prototype');
   const id=segment.scaling.base;
   return id===103?inspection(['heal']):{...inspection(['damage','damage']),unknown:id===101?[{family:'damage',rule:'damage.formula.missing',message:'missing formula'}]:[]};
  };
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.unknownRules).toEqual([expect.objectContaining({key:'damage.formula.missing',family:'damage',reportedBy:[1],enemyIds:[1,2],count:2})]);
  expect(report.families.find(f=>f.family==='damage')).toMatchObject({count:2,enemyIds:[1,2],affectedCount:2,affectedEnemyIds:[1,2]});
  expect(report.summary).toMatchObject({mapped:3,compiled:3,unknownRules:2,unknownRuleCount:1,structurallyCovered:1});
  expect(report.enemies[1]!.unknownRules).toEqual(['damage.formula.missing']);
  expect(report.enemies[1]!.gaps).toContainEqual(expect.objectContaining({kind:'unknown-rule'}));
  expect(report.rarities.find(r=>r.name==='Rare')).toMatchObject({total:1,unknownRules:1,structurallyCovered:0});
 });

 it('propagates string family rules, retains unclassified rules and actual targets/dependencies',()=>{
  const catalog=fixture([troop(1),troop(2)]);
  let calls=0;
  catalog.inspectEnemyMechanisms=()=>({...inspection(),dependencies:[{kind:'ref',value:'unit:9'}],unknown:calls++===0?['damage','unclassified-rule']:[]});
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.unknownRules.find(r=>r.key==='damage')).toMatchObject({enemyIds:[1,2]});
  expect(report.unknownRules.find(r=>r.key==='unclassified-rule')).toMatchObject({family:null,enemyIds:[1]});
  expect(report.enemies[1]).toMatchObject({targets:['enemy'],dependencies:[{kind:'ref',value:'unit:9'}]});
 });

 it('attributes family impact only to that family and deduplicates consumers across its rules',()=>{
  const catalog=fixture([troop(1),troop(2),troop(3)]);
  catalog.inspectEnemyMechanisms=prototype=>{
   const segment=prototype.segments[0];
   if(segment?.kind!=='damage')throw new Error('unexpected fixture prototype');
   const id=segment.scaling.base;
   return {...inspection(id===101?['active:damage','active:heal']:id===102?['active:damage']:['active:heal']),
    unknown:id===101?[{family:'active:damage',rule:'damage.formula.missing'},{family:'active:damage',rule:'damage.target.missing'}]:[]};
  };
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.families.find(f=>f.family==='active:damage')).toMatchObject({count:2,unknownRules:['damage.formula.missing','damage.target.missing'],affectedCount:2,affectedEnemyIds:[1,2]});
  expect(report.families.find(f=>f.family==='active:heal')).toMatchObject({count:2,enemyIds:[1,3],unknownRules:[],affectedCount:0,affectedEnemyIds:[]});
  expect(report.summary).toMatchObject({unknownRules:2,unknownRuleCount:2,structurallyCovered:1});
 });

 it('prefers structured unknownDetails and propagates stable rule keys across actual family consumers',()=>{
  const catalog=fixture([troop(1),troop(2),troop(3),troop(4)]);
  catalog.inspectEnemyMechanisms=prototype=>{
   const segment=prototype.segments[0];
   if(segment?.kind!=='damage')throw new Error('unexpected fixture prototype');
   const id=segment.scaling.base,reported=id===101||id===102;
   return {...inspection(id===104?['active:heal']:['active:damage']),
    unknown:reported?[`prototype.segments[${id===101?0:3}].modifier:activeField`]:[],
    unknownDetails:reported?[{key:'active:damage:modifier:activeField',family:'active:damage',detail:`prototype.segments[${id===101?0:3}].modifier:activeField`}]:[]};
  };
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.unknownRules).toEqual([{key:'active:damage:modifier:activeField',family:'active:damage',detail:'prototype.segments[0].modifier:activeField',reportedBy:[1,2],enemyIds:[1,2,3],count:3}]);
  expect(report.enemies[2]!.unknownRules).toEqual(['active:damage:modifier:activeField']);
  expect(report.enemies[3]!.unknownRules).toEqual([]);
  expect(report.families.find(f=>f.family==='active:damage')).toMatchObject({count:3,affectedCount:3,affectedEnemyIds:[1,2,3]});
  expect(report.summary).toMatchObject({unknownRules:3,unknownRuleCount:1,structurallyCovered:1});
 });

 it('retains legacy diagnostics when unknownDetails is empty',()=>{
  const catalog=fixture([troop(1),troop(2)]);
  let calls=0;
  catalog.inspectEnemyMechanisms=()=>({...inspection(['active:gem']),
   unknown:calls++===0?['prototype.segments[0].futureField:activeField']:[],unknownDetails:[]});
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.unknownRules).toEqual([expect.objectContaining({key:'prototype.segments[0].futureField:activeField',family:null,reportedBy:[1],enemyIds:[1],count:1})]);
  expect(report.enemies[0]).toMatchObject({rulesInspected:true,structurallyCovered:false});
  expect(report.enemies[1]).toMatchObject({rulesInspected:true,structurallyCovered:true});
  expect(report.summary).toMatchObject({total:2,compiled:2,unknownRules:1,unknownRuleCount:1,structurallyCovered:1});
  expect(report.check.passed).toBe(false);
 });

 it('retains uncovered legacy diagnostics when unknownDetails covers only part of unknown',()=>{
  const catalog=fixture([troop(1),troop(2),troop(3)]);
  const gemPath='prototype.segments[0].futureField:activeField',damagePath='prototype.segments[1].futureField:activeField';
  const key='active:gem.futureField:activeField';
  catalog.inspectEnemyMechanisms=prototype=>{
   const segment=prototype.segments[0];
   if(segment?.kind!=='damage')throw new Error('unexpected fixture prototype');
   const id=segment.scaling.base;
   return {...inspection(id===101?['active:gem','active:damage']:id===102?['active:gem']:['active:damage']),
    unknown:id===101?[gemPath,damagePath]:[],unknownDetails:id===101?[{key,family:'active:gem',detail:gemPath}]:[]};
  };
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.unknownRules).toEqual([
   {key,family:'active:gem',detail:gemPath,reportedBy:[1],enemyIds:[1,2],count:2},
   expect.objectContaining({key:damagePath,family:null,reportedBy:[1],enemyIds:[1],count:1}),
  ]);
  expect(report.enemies[0]!.unknownRules).toEqual([key,damagePath]);
  expect(report.enemies[1]!.unknownRules).toEqual([key]);
  expect(report.enemies[2]).toMatchObject({unknownRules:[],structurallyCovered:true});
  expect(report.families.find(f=>f.family==='active:damage')).toMatchObject({unknownRules:[],affectedCount:0,affectedEnemyIds:[]});
  expect(report.summary).toMatchObject({total:3,compiled:3,unknownRules:2,unknownRuleCount:2,structurallyCovered:1});
 });

 it('connects real gem rule inspection to coverage propagation using stable structured diagnostics',()=>{
  const catalog=fixture([troop(1,0,[]),troop(2,0,[]),troop(3,0,[]),troop(4,0,[])]);
  const gem:SkillPrototype['segments'][number]={kind:'gem',params:{op:'create',gem:{kind:'color',color:BaseColor.Red},count:{base:1,mult:0}}};
  const damage:SkillPrototype['segments'][number]={kind:'damage',target:'enemyChosen',scaling:{base:1,mult:0}};
  const unknownGem={...gem,futureField:true};
  const prototypes:Record<number,SkillPrototype>={
   101:{segments:[unknownGem]},102:{segments:[damage,unknownGem]},103:{segments:[gem]},104:{segments:[damage]},
  };
  catalog.adaptedPrototype=id=>prototypes[id]!;
  const inspect=vi.fn(inspectEnemyMechanisms);catalog.inspectEnemyMechanisms=inspect;
  const report=buildEnemyAssemblyCoverage(catalog);
  const key='active:gem.futureField:activeField';
  expect(inspect).toHaveBeenCalledTimes(4);
  expect(inspect.mock.results[0]!.value).toMatchObject({unknown:['prototype.segments[0].futureField:activeField'],
   unknownDetails:[{key,family:'active:gem',detail:'prototype.segments[0].futureField:activeField'}]});
  expect(inspect.mock.results[1]!.value).toMatchObject({unknown:['prototype.segments[1].futureField:activeField'],
   unknownDetails:[{key,family:'active:gem',detail:'prototype.segments[1].futureField:activeField'}]});
  expect(inspect.mock.results[2]!.value).toMatchObject({unknown:[],unknownDetails:[]});
  expect(inspect.mock.results[3]!.value).toMatchObject({unknown:[],unknownDetails:[]});
  expect(report.unknownRules).toEqual([{key,family:'active:gem',detail:'prototype.segments[0].futureField:activeField',reportedBy:[1,2],enemyIds:[1,2,3],count:3}]);
  expect(report.enemies[2]).toMatchObject({rulesInspected:true,unknownRules:[key],structurallyCovered:false});
  expect(report.enemies[3]).toMatchObject({rulesInspected:true,unknownRules:[],structurallyCovered:true});
  expect(report.families.find(f=>f.family==='active:gem')).toMatchObject({count:3,unknownRules:[key],affectedCount:3,affectedEnemyIds:[1,2,3]});
  expect(report.families.find(f=>f.family==='active:damage')).toMatchObject({count:2,enemyIds:[2,4],unknownRules:[],affectedCount:0,affectedEnemyIds:[]});
  expect(report.families.find(f=>f.family==='active:gemCreate')).toMatchObject({count:3,unknownRules:[],affectedCount:0,affectedEnemyIds:[]});
  expect(report.summary).toMatchObject({total:4,mapped:4,compiled:4,unknownRules:3,unknownRuleCount:1,structurallyCovered:1});
 });

 it('preserves an explicitly unclassified structured diagnostic without inferring a matching family',()=>{
  const catalog=fixture([troop(1),troop(2)]);
  let calls=0;
  catalog.inspectEnemyMechanisms=()=>{
   const reported=calls++===0;
   return {...inspection(['active:damage']),unknown:reported?['prototype.inputTarget:invalidTarget']:[],
    unknownDetails:reported?[{key:'active:damage',family:null,detail:'prototype.inputTarget:invalidTarget'}]:[]};
  };
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.unknownRules).toEqual([{key:'active:damage',family:null,detail:'prototype.inputTarget:invalidTarget',reportedBy:[1],enemyIds:[1],count:1}]);
  expect(report.enemies[1]!.structurallyCovered).toBe(true);
  expect(report.families[0]).toMatchObject({unknownRules:[],affectedCount:0,affectedEnemyIds:[]});
 });

 it('keeps legacy path diagnostics local when unknownDetails are absent',()=>{
  const catalog=fixture([troop(1),troop(2)]);
  let calls=0;
  catalog.inspectEnemyMechanisms=()=>({...inspection(['active:gem']),unknown:calls++===0?['prototype.segments[0].modifier:activeField']:[]});
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.unknownRules).toEqual([expect.objectContaining({key:'prototype.segments[0].modifier:activeField',family:null,reportedBy:[1],enemyIds:[1],count:1})]);
  expect(report.enemies[1]!.structurallyCovered).toBe(true);
  expect(report.families[0]).toMatchObject({unknownRules:[],affectedCount:0,affectedEnemyIds:[]});
 });

 it('detects restore changes against the saved baseline even when restore mutates and returns its input',()=>{
  const catalog=fixture([troop(1),troop(2)]),restore=catalog.restoreEnemyBlueprint;
  catalog.restoreEnemyBlueprint=value=>{
   const persisted=value as EnemyBlueprint;
   if(persisted.recipeId!=='enemy:1')return restore(value);
   persisted.snapshot.stats.hp+=1;
   return persisted;
  };
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.summary).toMatchObject({total:2,mapped:2,compiled:1,structurallyCovered:1});
  expect(report.enemies[0]).toMatchObject({restoreConsistent:false,compiled:false,structurallyCovered:false});
  expect(report.enemies[0]!.gaps).toContainEqual(expect.objectContaining({kind:'restore',key:'round-trip'}));
  expect(report.enemies[1]).toMatchObject({restoreConsistent:true,compiled:true,structurallyCovered:true});
 });

 it('records compile errors and restore changes independently, never treating a signature as verification',()=>{
  const catalog=fixture([troop(1),troop(2),troop(3),troop(4)]),compile=catalog.compileEnemyBlueprint;
  catalog.compileEnemyBlueprint=input=>{
   if(input.recipeTroopId===1)throw new Error('fixture compile error');
   const bp=compile(input);
   if(input.recipeTroopId===3)delete bp.assembly;
   if(input.recipeTroopId===4)bp.snapshot.traitIds=[];
   return bp;
  };
  const restore=catalog.restoreEnemyBlueprint;
  catalog.restoreEnemyBlueprint=value=>{
   const result=restore(value);
   if(result.recipeId==='enemy:2')result.assembly!.traitCodes=[];
   return result;
  };
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.summary).toMatchObject({total:4,mapped:4,compiled:0,structurallyCovered:0});
  expect(report.enemies[0]!.gaps).toContainEqual(expect.objectContaining({kind:'compile',detail:'fixture compile error'}));
  expect(report.enemies[1]!.gaps).toContainEqual(expect.objectContaining({kind:'restore'}));
  expect(report.enemies[2]!.gaps).toContainEqual(expect.objectContaining({key:'assembly'}));
  expect(report.enemies[3]!.gaps).toContainEqual(expect.objectContaining({key:'modules'}));
  expect(report.enemies.every(e=>e.behaviorAcceptance==='not-assessed')).toBe(true);
 });

 it('distinguishes description gaps and failed rule inspection from successful compilation',()=>{
  const catalog=fixture([troop(1),troop(2)]),compile=catalog.compileEnemyBlueprint;
  catalog.compileEnemyBlueprint=input=>{
   const bp=compile(input);
   if(input.recipeTroopId===1)bp.descriptionAudit={support:'partial',diagnostics:[]};
   else bp.traitDescriptionAudit=[];
   return bp;
  };
  let calls=0;
  catalog.inspectEnemyMechanisms=()=>{if(calls++===1)throw new Error('rules missing');return inspection();};
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.summary).toMatchObject({mapped:2,compiled:2,descriptionsComplete:0,structurallyCovered:0});
  expect(report.enemies[1]!.gaps).toContainEqual(expect.objectContaining({kind:'rules'}));
  expect(report.enemies.every(e=>e.gaps.some(g=>g.kind==='description'))).toBe(true);
 });

 it('requires 90% in each bucket with ceiling arithmetic, even if the overall percentage passes',()=>{
  const catalog=fixture([...Array.from({length:10},(_,i)=>troop(i+1)),troop(11,5)]);
  catalog.portraits=catalog.portraits.filter(p=>p.troopId!==11);
  const report=buildEnemyAssemblyCoverage(catalog);
  expect(report.summary.meetsTarget).toBe(true);
  expect(report.check.passed).toBe(false);
  expect(report.check.failures).toHaveLength(2);
  expect(report.ranks.find(r=>r.name==='传奇')).toMatchObject({total:1,required:1,meetsTarget:false});
  expect(report.ranks.find(r=>r.name==='精锐')).toMatchObject({total:0,coverage:null,meetsTarget:true});
  expect(()=>buildEnemyAssemblyCoverage(catalog,{target:.89})).toThrow(/0.9/);
  expect(()=>buildEnemyAssemblyCoverage(catalog,{target:NaN})).toThrow();
  expect(()=>buildEnemyAssemblyCoverage(catalog,{target:1.01})).toThrow();
 });

 it('produces deterministic reports and documents the limit to structural coverage',()=>{
  const catalog=fixture([troop(1)]),report=buildEnemyAssemblyCoverage(catalog);
  expect(buildEnemyAssemblyCoverage(catalog)).toEqual(report);
  const text=renderEnemyAssemblyCoverageMarkdown(report);
  expect(text).toContain('不声称机制全部通过行为测试');expect(text).toContain('签名');
  expect(text).toContain('完整 TROOPS');expect(text).toContain('五 rank');expect(text).toContain('90%');
  expect(report.check).toMatchObject({scope:'structural-assembly-only',passed:true});
  expect(()=>buildEnemyAssemblyCoverage(fixture([troop(1),troop(1)]))).toThrow(/重复/);
 });
});
