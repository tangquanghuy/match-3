import {describe,it,expect} from 'vitest';
import {TROOPS} from '../../src/data/troops';
import {adaptedPrototype} from '../../src/sillytavern/enemyBlueprint';
import {compileEnemyDesign,compileEnemyEncounterPlan,restoreEnemyDesign,DEFAULT_ENEMY_DESIGN_INPUT} from '../../src/sillytavern/enemyDesign';
import {PORTRAITS} from '../../src/sillytavern/portraits';
import legacy from '../fixtures/st-enemy-design-legacy-v1.json';

const options={seed:1,externalId:'enemy-1'};
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
describe('role-first weighted enemy assembly',()=>{
 it('takes role without effects and automatically chooses a complete classified recipe',()=>{
  const input:Record<string,unknown>={...DEFAULT_ENEMY_DESIGN_INPUT};delete input.effects;delete input.assembly;
  const result=compileEnemyDesign(input,options);
  expect(result.design.effects).toEqual([]);expect(result.design.assembly).toBe('classified');
  expect(result.generation?.primaryRole).toBe('Striker');expect(result.signature.roles).toEqual(['Striker']);
  const troop=TROOPS.find(t=>`enemy:${t.id}`===result.selection.recipeId)!;
  expect(troop.role).toBe('Striker');expect(result.blueprint.snapshot.manaCost).toBe(troop.manaCost);
  expect(result.generation?.profile.damage).toEqual(adaptedPrototype(troop.spell.id).segments.filter(s=>s.kind==='damage'));
  expect(restoreEnemyDesign(clone(result))).toEqual(result);
 });
 it('keeps damage plus conversion in Generator without lending that recipe to Striker',()=>{
  const entry=PORTRAITS.find(p=>p.troopId===6053)!;
  const base={...DEFAULT_ENEMY_DESIGN_INPUT,manaColors:entry.manaColors,rank:entry.rank,form:entry.form};
  const generator=compileEnemyDesign({...base,role:'Generator',effects:[{effect:'damage',requirement:'required'},{effect:'gemConvert',requirement:'required'}]},options);
  expect(TROOPS.find(t=>`enemy:${t.id}`===generator.selection.recipeId)?.role).toBe('Generator');
  expect(generator.signature.effects).toEqual(expect.arrayContaining(['damage','gemConvert']));
  expect(generator.signature.roles).toEqual(['Generator']);
  const striker=compileEnemyDesign({...base,role:'Striker'},options);
  expect(striker.selection.recipeId).not.toBe('enemy:6053');
  expect(TROOPS.find(t=>`enemy:${t.id}`===striker.selection.recipeId)?.role).toBe('Striker');
 });
 it('varies complete recipes reproducibly and excludes strong mechanisms from ordinary low ranks',()=>{
  const samples=Array.from({length:20},(_,seed)=>compileEnemyDesign(DEFAULT_ENEMY_DESIGN_INPUT,{...options,seed}));
  expect(new Set(samples.map(s=>s.selection.recipeId)).size).toBeGreaterThan(1);
  expect(new Set(samples.map(s=>s.selection.traitIds.join(','))).size).toBeGreaterThan(1);
  for(const sample of samples){
   expect(sample.generation!.profile.highImpact).toEqual([]);
   expect(sample.generation!.profile.maxPathFamilies).toBeLessThanOrEqual(3);
   expect(compileEnemyDesign(DEFAULT_ENEMY_DESIGN_INPUT,{...options,seed:sample.seed})).toEqual(sample);
  }
 });
 it('does not amplify an active recipe when an identical source is repeated in the catalogue',()=>{
  const seeds=[0,1,2,3,4,5];
  const baseline=seeds.map(seed=>compileEnemyDesign(DEFAULT_ENEMY_DESIGN_INPUT,{...options,seed}).blueprint.abilityId);
  const repeated=TROOPS.find(t=>t.id===6004)!;const originalLength=TROOPS.length;
  const mutableCatalogue=TROOPS as Array<(typeof TROOPS)[number]>;
  try{
   mutableCatalogue.push(...Array.from({length:8},()=>repeated));
   expect(seeds.map(seed=>compileEnemyDesign(DEFAULT_ENEMY_DESIGN_INPUT,{...options,seed}).blueprint.abilityId)).toEqual(baseline);
  }finally{mutableCatalogue.splice(originalLength);}
 });
 it('restores a pre-policy save using its original selector and detects altered data',()=>{
  expect(legacy).not.toHaveProperty('generation');expect(restoreEnemyDesign(clone(legacy))).toEqual(legacy);
  const altered=clone(legacy);altered.selection.recipeId='enemy:6053';expect(()=>restoreEnemyDesign(altered)).toThrow();
 });
 it('persists team context and four-stat seeds so each generated member reopens exactly',()=>{
  const plan=compileEnemyEncounterPlan([DEFAULT_ENEMY_DESIGN_INPUT,DEFAULT_ENEMY_DESIGN_INPUT],{seed:35});
  for(const member of plan.members)expect(restoreEnemyDesign(clone(member))).toEqual(member);
  expect(plan.members[1]!.generation!.context!.previous).toHaveLength(1);
  expect(plan.members[0]!.blueprint.statVariationSeed).not.toBe(plan.members[1]!.blueprint.statVariationSeed);
 });
});
