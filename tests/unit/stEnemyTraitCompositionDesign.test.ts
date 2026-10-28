import {describe,it,expect} from 'vitest';
import {attachPassives,applyColorMatchTriggers,applyCastRandomStatusTriggers,resolvePassives} from '../../src/engine/traits';
import type {TraitDefinition} from '../../src/engine/traits';
import {BaseColor} from '../../src/engine/types';
import type {Character,StatusInstance} from '../../src/engine/types';
import {adaptedTrait,adaptedPrototype,compileEnemyBlueprint,restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {inspectEnemyDesignSignature} from '../../src/sillytavern/enemyDesign';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';

function actor(id:number,traits:readonly TraitDefinition[]=[]):Character {
 const char:Character={id,name:'fixture',maxHp:100,hp:100,attack:10,armor:0,magic:5,mana:0,manaCost:10,skillId:'fixture',colors:[BaseColor.Green],traitIds:traits.map(t=>t.code),statuses:[],defeated:false};
 attachPassives(char,code=>traits.find(t=>t.code===code));return char;
}
const definitions=(codes:string[])=>codes.map(code=>adaptedTrait(code)!);
const applyStatus=(char:Character,status:StatusInstance)=>{char.statuses.push(status);return [];};

describe('ST ordered trait composition uses native effective passives',()=>{
 it.each([
  {codes:['sourcandy','wildvines'],status:'faerie-fire',control:false},
  {codes:['wildvines','sourcandy'],status:'entangle',control:true},
 ])('matches actual same-color status selection for $codes',({codes,status,control})=>{
  const traits=definitions(codes),before=structuredClone(traits),holder=actor(1,traits),enemy=actor(2);
  const signature=inspectEnemyDesignSignature({segments:[]},traits);
  expect(signature.effects.includes('control')).toBe(control);expect(signature.effects).toContain('debuff');
  applyColorMatchTriggers([holder],BaseColor.Green,{enemyTeam:[enemy],rng:{next:()=>0},applyStatus});
  expect(enemy.statuses.map(s=>s.id)).toEqual([status]);expect(traits).toEqual(before);
 });
 it.each([
  {codes:['gibberingmadness','hemlock'],friendly:true},
  {codes:['hemlock','gibberingmadness'],friendly:false},
 ])('matches actual first cast-status selection for $codes',({codes,friendly})=>{
  const traits=definitions(codes),holder=actor(1,traits),enemy=actor(2);
  const signature=inspectEnemyDesignSignature({segments:[]},traits);
  expect(signature.effects.includes('allyBuff')).toBe(friendly);expect(signature.effects.includes('debuff')).toBe(!friendly);
  applyCastRandomStatusTriggers([holder],[enemy],{rng:{next:()=>0},applyStatus,poolOf:()=>[]});
  expect(holder.statuses.map(s=>s.id)).toEqual(friendly?['rage']:[]);
  expect(enemy.statuses.map(s=>s.id)).toEqual(friendly?[]:['curse','disease']);
 });
 it('filters a shadowed field without discarding the same module’s other effective field',()=>{
  const traits=definitions(['sourcandy','wildvines']);traits[1]!.skullDamageReduction=.25;
  const signature=inspectEnemyDesignSignature({segments:[]},traits);
  expect(signature.effects).toEqual(expect.arrayContaining(['debuff','damageReduction']));expect(signature.effects).not.toContain('control');
 });
 it('retains strongest and identical contributors without removing the capability altogether',()=>{
  const traits=definitions(['armored','stoneskin']);
  expect(resolvePassives(traits.map(t=>t.code),code=>traits.find(t=>t.code===code)).skullDamageTaken).toBe(.5);
  expect(inspectEnemyDesignSignature({segments:[]},traits).effects).toContain('damageReduction');
  const duplicate=traits.map((_,index)=>({...traits[0]!,code:`equivalent-${index}`}));
  expect(inspectEnemyDesignSignature({segments:[]},duplicate).effects).toContain('damageReduction');
 });
 it('retains additive effects on different colors and does not mutate executable modules',()=>{
  const traits=definitions(['sourcandy','wildvines']);traits[1]!.onColorMatchStatus={...traits[1]!.onColorMatchStatus!,color:BaseColor.Red};
  const before=structuredClone(traits),signature=inspectEnemyDesignSignature({segments:[]},traits);
  expect(signature.effects).toEqual(expect.arrayContaining(['control','debuff']));expect(traits).toEqual(before);
 });
 it('keeps full ordered modules in the blueprint while describing only effective capabilities after restore',()=>{
  const portrait=PORTRAITS.find(p=>p.troopId===6169)!;
  const blueprint=compileEnemyBlueprint({portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),recipeTroopId:6169,assembly:{version:1,activeTroopId:6169,traitCodes:['sourcandy','wildvines']},externalId:'ordered-modules'});
  const restored=restoreEnemyBlueprint(JSON.parse(JSON.stringify(blueprint)));
  expect(restored).toEqual(blueprint);expect(restored.assembly!.traitCodes).toEqual(['sourcandy','wildvines']);
  const signature=inspectEnemyDesignSignature(adaptedPrototype(Number(restored.snapshot.skillId!.slice(3))),definitions(restored.assembly!.traitCodes));
  expect(signature.effects).not.toContain('control');expect(signature.effects).toContain('debuff');
 });
});
