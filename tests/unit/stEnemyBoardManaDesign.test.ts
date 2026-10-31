import {describe,expect,it} from 'vitest';
import {getTroopById} from '../../src/data/troops';
import {BaseColor} from '../../src/engine/types';
import type {EffectSegment} from '../../src/engine/skills/prototypes';
import type {ClearGemParams,ClearTarget,GemParams} from '../../src/engine/skills/effects/gems';
import {adaptedPrototype,adaptedTrait,compileEnemyBlueprint,restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {compileEnemyDesign,inspectEnemyDesignSignature,restoreEnemyDesign,EnemyDesignError,ENEMY_DESIGN_VOCABULARY} from '../../src/sillytavern/enemyDesign';
import type {EnemyDesignInput,EnemyDesignEffect} from '../../src/sillytavern/enemyDesign';
import {colorKey,restorePortrait,findPortraits,PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';

// ST capability tests reuse the native clear target contract; they do not rebuild board settlement.
const count={base:2,mult:0};
const clear=(mode:ClearGemParams['mode'],target:ClearTarget):Extract<EffectSegment,{kind:'gem'}>=>({kind:'gem',params:{op:'clear',mode,target}});
const signature=(...segments:EffectSegment[])=>inspectEnemyDesignSignature({segments},[]);
function expectMana(segment:EffectSegment,expected:boolean) {
 const result=signature(segment);
 expect(result.effects.includes('mana')).toBe(expected);
 expect(result.roles.includes('Generator')).toBe(expected);
 return result;
}

describe('ST board mana: conditional collection follows native target filters',()=>{
 const coloredTargets:ClearTarget[]=[
  {kind:'color',color:BaseColor.Blue},{kind:'color',color:'CHOSEN'},
  {kind:'allColors'},{kind:'allGems'},{kind:'chosenLine',orientation:'row'},
  {kind:'lines',cols:[2]},{kind:'randomLines',orientation:'row',count},
  {kind:'cell',cell:'CELL'},{kind:'area',shape:'row3',center:'CELL'},
  {kind:'chosenCross'},{kind:'lastDestroyedLine',orientation:'col'},
  {kind:'randomGems',count,include:'nonSkull'},{kind:'randomGems',count,colors:[BaseColor.Blue,BaseColor.Red]},
 ];
 it.each(coloredTargets)('destroy target %# can collect mana without promising color or quantity',target=>{
  const result=expectMana(clear('destroy',target),true);
  expect(result.evidence).toContainEqual(expect.objectContaining({effect:'mana',source:'active',detail:expect.stringContaining('不保证颜色或数量')}));
 });
 it.each(coloredTargets)('remove target %# never proves mana from collection or ensuing cascades',target=>{
  expectMana(clear('remove',target),false);
 });
 it.each<ClearTarget>([
  {kind:'skulls'},{kind:'special',gem:'bootyGem'},{kind:'special',gem:'bomb'},
  {kind:'randomGems',count,include:'skull'},
  {kind:'randomGems',count,special:'bootyGem'},
  {kind:'randomGems',count,special:'doomSkull',include:'skull'},
 ])('destroy target %# does not infer color mana from skull or colorless special targets',target=>{
  expectMana(clear('destroy',target),false);
 });
 it.each<ClearTarget>([
  {kind:'skulls'},{kind:'special',gem:'bootyGem'},
  {kind:'randomGems',count,include:'skull'},
  {kind:'randomGems',count,special:'bootyGem'},
  {kind:'randomGems',count,special:'doomSkull',include:'skull'},
 ])('explode target %# can collect colors in the surrounding footprint',target=>{
  const result=expectMana(clear('explode',target),true);
  expect(result.effects).toContain('gemExplode');
  expect(result.evidence).toContainEqual(expect.objectContaining({effect:'mana',detail:expect.stringContaining('按颜色折半取整')}));
 });
 it('keeps area as the complete footprint instead of promising another splash ring',()=>{
  const result=expectMana(clear('explode',{kind:'area',shape:'row3',center:'CELL'}),true);
  expect(result.evidence.find(e=>e.effect==='mana')!.detail).toContain('area 不额外溅射');
 });
 it.each<ClearTarget>([
  {kind:'special',gem:'web'},
  {kind:'randomGems',count,special:'web',color:BaseColor.Purple},
  {kind:'randomGems',count,special:'giantGem',color:'CHOSEN'},
 ])('uses native color-bearing special semantics for target %#',target=>{
  expectMana(clear('destroy',target),true);
  expectMana(clear('remove',target),false);
 });
 it.each<ClearTarget>([
  {kind:'color',color:'SKULL'},
  {kind:'lines',rows:[],cols:[]},
  {kind:'randomLines',orientation:'col',count:{base:0,mult:0}},
  {kind:'randomGems',count:{base:0,mult:0}},
  {kind:'randomGems',count,countRange:{min:0,max:0}},
  {kind:'randomGems',count,colors:[]},
  {kind:'randomGems',count,include:'skull',color:BaseColor.Blue},
  {kind:'randomGems',count,include:'skull',colors:[BaseColor.Blue]},
  {kind:'randomGems',count,special:'web',include:'color'},
  {kind:'randomGems',count,special:'bootyGem',color:BaseColor.Blue},
  {kind:'randomGems',count,special:'web',color:BaseColor.Blue},
  {kind:'randomGems',count,special:'web',include:'skull'},
  {kind:'randomGems',count,special:'doomSkull',include:'nonSkull'},
 ])('empty or incompatible target %# pool cannot acquire mana through destroy or explosion',target=>{
  expectMana(clear('destroy',target),false);
  expectMana(clear('explode',target),false);
 });
 it('respects random count range and colors precedence from the native resolver',()=>{
  expectMana(clear('destroy',{kind:'randomGems',count:{base:0,mult:0},countRange:{min:1,max:2}}),true);
  expectMana(clear('destroy',{kind:'randomGems',count,color:'SKULL',colors:[BaseColor.Blue]}),true);
  expectMana(clear('explode',{kind:'randomGems',count,color:BaseColor.Blue,colors:[]}),false);
 });
 it('preserves reachable probability/board conditions and rejects provably unreachable gates',()=>{
  const segment=clear('destroy',{kind:'allColors'});
  expectMana({...segment,chance:0},false);
  expectMana({...segment,chance:0.5,ifCond:{kind:'boardAtLeast',color:BaseColor.Blue,n:5}},true);
  expectMana({...segment,ifCond:{kind:'targetStatus',statusId:'poison'}},false);
 });
 it.each(['oneOf','choose'] as const)('%s requires mana capability in every branch',kind=>{
  const destroy=clear('destroy',{kind:'allColors'}),remove=clear('remove',{kind:'allColors'});
  const branch=(options:EffectSegment[][]):EffectSegment=>kind==='choose'?{kind,labels:['A','B'],options}:{kind,options};
  expectMana(branch([[destroy],[remove]]),false);
  expectMana(branch([[destroy],[clear('explode',{kind:'skulls'})]]),true);
 });
 it('publishes conditional board collection in the shared mana effect explanation',()=>{
  const description=ENEMY_DESIGN_VOCABULARY.effects.find(e=>e.key==='mana')!.description;
  expect(description).toContain('摧毁/爆破收集法力');
  expect(description).toContain('棋盘收集不保证颜色或数量');
 });
});

// Native blueprints pin each real recipe; automatic selection only promises the requested source role.
// Use each source portrait to keep the public role/form query grounded in the catalogue.
const realCases:{enemyId:number;seed:number;required:EnemyDesignEffect[];effects:EnemyDesignEffect[];evidence:{effect:string;source:string;path:string}}[]=[
 {enemyId:6016,seed:1,required:['damage','mana'],effects:['damage','mana'],evidence:{effect:'mana',source:'active',path:'active.segments[0]'}},
 {enemyId:6026,seed:1,required:['damage','heal'],effects:['damage','heal','debuff'],evidence:{effect:'damage',source:'active',path:'active.segments[0]'}},
 {enemyId:6027,seed:0,required:['armor'],effects:['armor','damageReduction'],evidence:{effect:'armor',source:'active',path:'active.segments[1]'}},
 {enemyId:6029,seed:3,required:['damage','mana'],effects:['damage','mana'],evidence:{effect:'damage',source:'active',path:'active.segments[0]'}},
 {enemyId:6098,seed:18,required:['mana'],effects:['mana'],evidence:{effect:'mana',source:'active',path:'active.segments[0]'}},
 {enemyId:6105,seed:5,required:['mana','gemExplode'],effects:['mana','gemExplode'],evidence:{effect:'mana',source:'active',path:'active.segments[0]'}},
];
function sourceInput(enemyId:number,required:EnemyDesignEffect[]):EnemyDesignInput {
 const source=getTroopById(enemyId)!,artwork=PORTRAITS.find(p=>p.troopId===enemyId)!;
 expect(source.role).toBe(artwork.role);
 return {manaColors:[...artwork.manaColors],rank:artwork.rank,form:artwork.form,role:artwork.role,level:20,difficulty:1,effects:required.map(effect=>({effect,requirement:'required'}))};
}
describe('ST seven native sources: public semantic design entry, persistence and signature',()=>{
 it.each(realCases)('enemyId=$enemyId keeps its complete native recipe and effect evidence',({enemyId,required,effects,evidence})=>{
  const source=getTroopById(enemyId)!;
  const prototype=adaptedPrototype(source.spell.id);
  const traits=source.traits.map(({code})=>{
   const trait=adaptedTrait(code);expect(trait,`enemyId=${enemyId} complete trait ${code}`).toBeDefined();return trait!;
  });
  const native=inspectEnemyDesignSignature(prototype,traits);
  expect(native.effects).toEqual(expect.arrayContaining(effects));
  expect(native.evidence).toContainEqual(expect.objectContaining(evidence));
  const query=sourceInput(enemyId,required),artwork=PORTRAITS.find(p=>p.troopId===enemyId)!;
  const portrait=savePortrait({manaColors:query.manaColors,rank:query.rank,form:query.form,role:query.role},artwork);
  const options={portrait,recipeTroopId:enemyId,externalId:`board-mana-${enemyId}`,level:20,difficulty:1};
  const blueprint=compileEnemyBlueprint(options);
  expect(blueprint.recipeId).toBe(`enemy:${enemyId}`);
  expect(blueprint.assembly).toBeUndefined();
  expect(blueprint.snapshot.role).toBe(source.role);
  expect(blueprint.snapshot.skillId).toBe(`st:${source.spell.id}`);
  expect(blueprint.snapshot.traitIds).toEqual(source.traits.map(t=>`st:${t.code}`));
  expect(blueprint.snapshot.manaCost).toBe(source.manaCost);
  expect(blueprint.omittedMechanisms).toEqual([]);
  expect(restoreEnemyBlueprint(JSON.parse(JSON.stringify(blueprint)))).toEqual(blueprint);
  expect(compileEnemyBlueprint(options)).toEqual(blueprint);
  if(enemyId===6027)expect(native.effects).not.toContain('mana');
 });
 it.each(realCases)('enemyId=$enemyId query assembles within its source primary role and survives save/restore',({enemyId,seed,required})=>{
  const input=sourceInput(enemyId,required);
  for(const selectionSeed of [seed,49]){
   const options={seed:selectionSeed,externalId:`board-mana-${enemyId}`};
   const result=compileEnemyDesign(input,options);
   const source=getTroopById(Number(result.selection.recipeId.slice(6)))!;
   expect(source.role).toBe(input.role);
   expect(result.design).toEqual({...input,assembly:'classified'});
   expect(result.signature.roles).toEqual([input.role]);
   expect(result.generation?.primaryRole).toBe(input.role);
   expect(result.generation?.profile.sourceTroopId).toBe(source.id);
   const assembly=result.blueprint.assembly!;
   expect(assembly.activeTroopId).toBe(source.id);
   const actual=inspectEnemyDesignSignature(adaptedPrototype(source.spell.id),assembly.traitCodes.map(code=>adaptedTrait(code)!));
   expect(result.signature.effects).toEqual(actual.effects);expect(result.signature.evidence).toEqual(actual.evidence);
   expect(result.signature.effects).toEqual(expect.arrayContaining(input.effects.map(e=>e.effect)));
   expect(result.blueprint.snapshot.role).toBe(input.role);
   expect(result.blueprint.snapshot.skillId).toBe(`st:${source.spell.id}`);
   expect(result.blueprint.snapshot.traitIds).toEqual(assembly.traitCodes.map(code=>`st:${code}`));
   expect(result.blueprint.snapshot.manaCost).toBe(source.manaCost);
   expect(result.blueprint.omittedMechanisms).toEqual([]);
   // Mana colors belong to the enemy instance and do not restrict artwork (U078).
   const {entry}=restorePortrait(result.blueprint.portrait);
   expect({rank:entry.rank,form:entry.form,role:entry.role}).toEqual({rank:input.rank,form:input.form,role:input.role});
   expect(colorKey(result.blueprint.snapshot.manaColors)).toBe(colorKey(input.manaColors));
   expect(restoreEnemyDesign(JSON.parse(JSON.stringify(result)))).toEqual(result);
   expect(compileEnemyDesign(input,options)).toEqual(result);
  }
 });
});

// Active skull output satisfies the existing Warrior rule without promising immediate damage.
describe('ST active skull offense: native output, probability and whole-branch boundaries',()=>{
 const inspect=(params:GemParams)=>signature({kind:'gem',params});
 it.each<GemParams>([
  {op:'create',gem:{kind:'skull'},count},
  {op:'create',gem:{kind:'special',spec:{kind:'doomSkull'}},count},
  {op:'create',gem:{kind:'mixSpecial',specs:[{kind:'web'},{kind:'uberDoomSkull'}]},count},
  {op:'create',gem:{kind:'mixAny',entries:[BaseColor.Blue,'SKULL']},count},
  {op:'transform',from:'CHOSEN',to:'SKULL'},
  {op:'transform',from:BaseColor.Blue,to:BaseColor.Blue,toSpecial:'doomSkull'},
  {op:'transform',from:'ANY',to:BaseColor.Blue,toSpecial:{kind:'uberDoomSkull'}},
 ])('skull output case %# proves Warrior without inventing direct damage',params=>{
  const result=inspect(params);
  expect(result.roles).toContain('Warrior');
  expect(result.effects).not.toContain('damage');
  expect(result.evidence).toContainEqual(expect.objectContaining({effect:'skullOffense',source:'active',detail:expect.stringContaining('不保证匹配或即时伤害')}));
 });
 it.each<GemParams>([
  {op:'create',gem:{kind:'skull'},count:{base:0,mult:0}},
  {op:'create',gem:{kind:'skull'},count,countRange:{min:0,max:0}},
  {op:'create',gem:{kind:'color',color:'SKULL'},count},
  {op:'create',gem:{kind:'mix',colors:[BaseColor.Blue,'SKULL']},count},
  {op:'create',gem:{kind:'special',spec:{kind:'bootyGem'}},count},
  {op:'transform',from:'SKULL',to:'SKULL'},
  {op:'transform',from:'CHOSEN',to:'SKULL',count:{base:0,mult:0}},
  {op:'transform',from:'CHOSEN',to:'SKULL',toSpecial:'web'},
  {op:'clear',mode:'destroy',target:{kind:'skulls'}},
 ])('ineffective skull output case %# does not prove Warrior',params=>{
  expect(inspect(params).roles).not.toContain('Warrior');
 });
 it('retains native chance and condition gates and never treats immunities as tank evidence',()=>{
  const segment:EffectSegment={kind:'gem',params:{op:'transform',from:'CHOSEN',to:'SKULL'}};
  expect(signature({...segment,chance:0}).roles).not.toContain('Warrior');
  expect(signature({...segment,chance:0.5,ifCond:{kind:'boardAtLeast',n:5,color:BaseColor.Blue}}).roles).toContain('Warrior');
  expect(signature({...segment,ifCond:{kind:'targetStatus',statusId:'poison'}}).roles).not.toContain('Warrior');
  const result=inspectEnemyDesignSignature({segments:[segment]},[adaptedTrait('undying')!]);
  expect(result.roles).toContain('Warrior');
  expect(result.roles).not.toContain('Defender');
  expect(result.roles).not.toContain('Generator');
 });
 it.each(['oneOf','choose'] as const)('%s needs skull offense in every complete branch',kind=>{
  const skull:EffectSegment={kind:'gem',params:{op:'transform',from:'CHOSEN',to:'SKULL'}};
  const color:EffectSegment={kind:'gem',params:{op:'transform',from:'CHOSEN',to:BaseColor.Blue}};
  const branch=(options:EffectSegment[][]):EffectSegment=>kind==='choose'?{kind,labels:['A','B'],options}:{kind,options};
  expect(signature(branch([[skull],[color]])).roles).not.toContain('Warrior');
  expect(signature(branch([[skull],[{...skull,chance:0}]])).roles).not.toContain('Warrior');
  expect(signature(branch([[skull],[{...skull,chance:0.5}]])).roles).toContain('Warrior');
 });
 it('enemyId=6074 has native Warrior capability while its source remains Warmaster and Warrior artwork is absent',()=>{
  const source=getTroopById(6074)!;
  expect(source.role).toBe('Warmaster');
  const prototype=adaptedPrototype(source.spell.id);
  const traits=source.traits.map(t=>adaptedTrait(t.code)!);
  const result=inspectEnemyDesignSignature(prototype,traits);
  expect(prototype.segments).toContainEqual({kind:'gem',params:{op:'transform',from:'CHOSEN',to:'SKULL'}});
  expect(result.roles).toContain('Warrior');
  expect(result.roles).not.toContain('Defender');
  expect(result.roles).not.toContain('Warmaster');
  expect(result.effects).toEqual(expect.arrayContaining(['gemConvert','summon']));
  expect(result.effects).not.toContain('mana');
  expect(result.evidence).toContainEqual(expect.objectContaining({effect:'skullOffense',source:'active',path:'active.segments[0]'}));
  const query={manaColors:['Purple','Brown'],rank:'领主',role:'Warrior'};
  const artwork=findPortraits(query);
  expect(artwork).toEqual([]);
  const input:EnemyDesignInput={...query,form:'类人',level:20,difficulty:1,
   effects:[{effect:'gemConvert',requirement:'required'},{effect:'summon',requirement:'required'}]};
  // Artwork ignores mana colors now (U078), so Warrior lord art exists; the request still fails
  // because no Warrior-role source offers the Warmaster's gemConvert + summon combination.
  try{compileEnemyDesign(input,{seed:0,externalId:'board-mana-6074'});throw new Error('expected no Warrior source with this combination');}
  catch(error){
   expect(error).toBeInstanceOf(EnemyDesignError);const codes=(error as EnemyDesignError).diagnostics.map(d=>d.code);
   expect(codes).toContain('required_effect_unavailable');expect(codes).not.toContain('no_exact_match');
  }
 });
 it('enemyId=6074 keeps its native blueprint and compiles under its actual Warmaster primary role',()=>{
  const source=getTroopById(6074)!;
  expect(source.role).toBe('Warmaster');
  const artwork=PORTRAITS.find(p=>p.troopId===6074)!;
  const portrait=savePortrait({manaColors:[...artwork.manaColors],rank:artwork.rank,form:artwork.form,role:artwork.role},artwork);
  const blueprint=compileEnemyBlueprint({portrait,recipeTroopId:6074,externalId:'manual-6074',level:20,difficulty:1});
  expect(blueprint.recipeId).toBe('enemy:6074');
  expect(source.role).toBe(artwork.role);expect(blueprint.snapshot.role).toBe(source.role);
  expect(blueprint.snapshot.skillId).toBe(`st:${source.spell.id}`);
  expect(blueprint.snapshot.traitIds).toEqual(source.traits.map(t=>`st:${t.code}`));
  expect(blueprint.snapshot.manaCost).toBe(source.manaCost);
  expect(blueprint.omittedMechanisms).toEqual([]);
  expect(restoreEnemyBlueprint(JSON.parse(JSON.stringify(blueprint)))).toEqual(blueprint);
  expect(compileEnemyBlueprint({portrait,recipeTroopId:6074,externalId:'manual-6074',level:20,difficulty:1})).toEqual(blueprint);
  const input:EnemyDesignInput={manaColors:[...artwork.manaColors],rank:artwork.rank,form:artwork.form,role:artwork.role,level:20,difficulty:1,effects:[{effect:'gemConvert',requirement:'required'},{effect:'summon',requirement:'required'}]};
  const result=compileEnemyDesign(input,{seed:0,externalId:'board-mana-6074'});
  const selected=getTroopById(Number(result.selection.recipeId.slice(6)))!;
  expect(selected.role).toBe(input.role);
  expect(result.blueprint.snapshot.role).toBe(input.role);
  expect(result.signature.roles).toEqual(['Warmaster']);
  expect(result.signature.effects).toEqual(expect.arrayContaining(['gemConvert','summon']));
  expect(restoreEnemyDesign(JSON.parse(JSON.stringify(result)))).toEqual(result);
 });
});
