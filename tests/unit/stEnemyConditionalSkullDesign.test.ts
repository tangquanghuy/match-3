import {describe,expect,it} from 'vitest';
import {getTroopById} from '../../src/data/troops';
import type {TraitDefinition} from '../../src/engine/traits';
import {adaptedPrototype,adaptedTrait,compileEnemyBlueprint,restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {compileEnemyDesign,inspectEnemyDesignSignature,restoreEnemyDesign} from '../../src/sillytavern/enemyDesign';
import type {EnemyDesignInput} from '../../src/sillytavern/enemyDesign';
import {PORTRAITS,restorePortrait,savePortrait} from '../../src/sillytavern/portraits';

// The native status multiplier/strongest-match behavior stays covered by traitOBucket.
// These assertions exercise the ST classifier and its real public compiler/persistence boundary.
const trait=(fields:Partial<TraitDefinition>):TraitDefinition=>({code:'st:fixture',name:'fixture',description:'fixture',...fields});
const inspect=(value:TraitDefinition)=>inspectEnemyDesignSignature({segments:[]},[value]);

describe('ST conditional skull offense preserves native gates without promising public effects',()=>{
 it.each(['clobber','pyromania','shatter','cursehunter','virulence','doom','entrapment','stalker','focus','depthcharge','lethaltoxin','icycloak','antimagic','toxic','scaldingstrike','tinselterror'])('recognizes real native trait %s as a conditional Warrior',code=>{
  const result=inspect(adaptedTrait(code)!);
  expect(result.roles).toEqual(['Warrior']);
  expect(result.effects).toEqual([]);
  expect(result.evidence).toContainEqual(expect.objectContaining({effect:'skullOffense',source:`st:${code}`,detail:expect.stringContaining('不施加该状态')}));
  expect(result.evidence.every(e=>e.detail.includes('不保证条件成立或即时伤害'))).toBe(true);
 });
 it.each([0,-1,1,NaN,Infinity,-Infinity])('does not claim offensive amplification for multiplier %s',mult=>{
  expect(inspect(trait({skullMultVsStatus:{status:'burning',mult}})).roles).toEqual([]);
  expect(inspect(trait({skullMultVsStatusList:[{status:'burning',mult}]})).roles).toEqual([]);
 });
 it.each([
  {status:'',mult:2},{status:'not-a-native-status',mult:2},{status:'burning',mult:'2'},
  {status:'burning'},{mult:2},null,[],
 ])('rejects malformed condition %# without inventing public effects',entry=>{
  const fields={skullMultVsStatus:entry} as unknown as Partial<TraitDefinition>;
  expect(inspect(trait(fields))).toMatchObject({roles:[],effects:[],evidence:[]});
 });
 it('treats a List as separate possible conditions and reports only valid entries',()=>{
  const result=inspect(trait({skullMultVsStatusList:[{status:'poison',mult:3},{status:'web',mult:3},{status:'burning',mult:1}]}));
  expect(result.roles).toEqual(['Warrior']);expect(result.effects).toEqual([]);
  expect(result.evidence.map(e=>e.detail)).toEqual([
   expect.stringContaining('目标已有 poison 时骷髅伤害 ×3'),
   expect.stringContaining('目标已有 web 时骷髅伤害 ×3'),
  ]);
  expect(inspect(trait({skullMultVsStatusList:[]})).roles).toEqual([]);
 });
});

const entries=[
 {id:6341,seed:3,colors:['Yellow','Brown'],form:'类人',role:'Support',spellId:7493,traits:['st:clobber','st:big','st:impervious'],omitted:[]},
 {id:7038,seed:6,colors:['Red','Yellow'],form:'类人',role:'Warrior',spellId:8562,traits:['st:pyromania','st:infernalarmor'],omitted:['淘宝之盾']},
];
describe('ST role-only design is reachable from real source mechanics and survives persistence',()=>{
 it.each(entries)('enemyId=$id keeps the unmodified native recipe and all conditional skull mechanics',entry=>{
  const source=getTroopById(entry.id)!,artwork=PORTRAITS.find(p=>p.troopId===entry.id)!;
  expect(source.role).toBe(entry.role);expect(artwork.role).toBe(source.role);
  const portrait=savePortrait({manaColors:entry.colors,rank:'首领',form:entry.form,role:entry.role},artwork);
  const options={portrait,recipeTroopId:source.id,externalId:`conditional-skull-${entry.id}`,level:20,difficulty:1};
  const blueprint=compileEnemyBlueprint(options);
  expect(blueprint.recipeId).toBe(`enemy:${entry.id}`);
  expect(blueprint.assembly).toBeUndefined();
  expect(blueprint.snapshot.role).toBe(source.role);
  expect(source.spell.id).toBe(entry.spellId);
  expect(blueprint.snapshot.skillId).toBe(`st:${entry.spellId}`);
  expect(blueprint.snapshot.traitIds).toEqual(entry.traits);
  expect(blueprint.snapshot.manaCost).toBe(source.manaCost);
  expect(blueprint.omittedMechanisms).toEqual(entry.omitted);
  const prototype=adaptedPrototype(source.spell.id);
  const traits=source.traits.flatMap(t=>adaptedTrait(t.code)??[]);
  const native=inspectEnemyDesignSignature(prototype,traits);
  expect(native.roles).toEqual(['Warrior']);expect(native.effects).toEqual([]);
  expect(native.evidence).toContainEqual(expect.objectContaining({effect:'skullOffense',source:entry.traits[0]}));
  expect(restoreEnemyBlueprint(JSON.parse(JSON.stringify(blueprint)))).toEqual(blueprint);
  expect(compileEnemyBlueprint(options)).toEqual(blueprint);
  if(entry.id===6341){
   expect(prototype.segments).toHaveLength(1);
   expect(prototype.segments[0]).toMatchObject({kind:'oneOf',options:expect.any(Array)});
   if(prototype.segments[0].kind==='oneOf')expect(prototype.segments[0].options).toHaveLength(6);
  }else{
   expect(prototype.segments.map(s=>s.kind)).toEqual(['buff','buff','storm']);
   expect(prototype.segments[2]).toEqual({kind:'storm',color:'Red',turns:8,color2:'Purple'});
  }
 });
 it.each(entries)('enemyId=$id query selects a complete native kit within its source primary role',entry=>{
  const input:EnemyDesignInput={manaColors:entry.colors,rank:'首领',form:entry.form,role:entry.role,level:20,difficulty:1,effects:[],assembly:'native'};
  const options={seed:entry.seed,externalId:`conditional-skull-${entry.id}`};
  const result=compileEnemyDesign(input,options);
  expect(result.design).toEqual(input);
  const source=getTroopById(Number(result.selection.recipeId.slice(6)))!;
  expect(source.role).toBe(input.role);
  expect(result.blueprint.snapshot.role).toBe(input.role);
  expect(result.generation?.primaryRole).toBe(input.role);
  expect(result.generation?.profile.sourceTroopId).toBe(source.id);
  expect(result.blueprint.assembly).toBeUndefined();
  expect(result.blueprint.snapshot.skillId).toBe(`st:${source.spell.id}`);
  expect(result.blueprint.snapshot.manaCost).toBe(source.manaCost);
  const prototype=adaptedPrototype(source.spell.id);
  const traits=source.traits.flatMap(t=>adaptedTrait(t.code)??[]);
  expect(result.blueprint.snapshot.traitIds).toEqual(traits.map(t=>t.code));
  const native=inspectEnemyDesignSignature(prototype,traits);
  expect(result.signature.effects).toEqual(native.effects);expect(result.signature.evidence).toEqual(native.evidence);
  expect(result.signature.roles).toEqual([input.role]);
  expect(result.blueprint).toEqual(compileEnemyBlueprint({portrait:result.blueprint.portrait,recipeTroopId:source.id,externalId:options.externalId,level:20,difficulty:1}));
  expect(result.diagnostics.some(d=>d.code==='preferred_effect_unmet')).toBe(false);
  const art=restorePortrait(result.blueprint.portrait).entry;
  expect({colors:art.manaColors,rank:art.rank,form:art.form,role:art.role}).toEqual({colors:entry.colors,rank:'首领',form:entry.form,role:input.role});
  expect(restoreEnemyDesign(JSON.parse(JSON.stringify(result)))).toEqual(result);
  expect(compileEnemyDesign(input,options)).toEqual(result);
  const altered=JSON.parse(JSON.stringify(result));altered.design.effects=[{effect:'damage',requirement:'required'}];
  expect(()=>restoreEnemyDesign(altered)).toThrow();
 });
});
