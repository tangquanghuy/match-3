import {describe,expect,it} from 'vitest';
import {TROOPS,getTroopById} from '../../src/data/troops';
import {SKILL_NAME_OVERRIDES} from '../../src/sillytavern/abilityNames';
import {adaptedPrototype,learningAbilityId,skillNameForTroop} from '../../src/sillytavern/enemyBlueprint';
import {partyAbilityChoices} from '../../src/sillytavern/partyPreparation';

const implemented=TROOPS.flatMap(troop=>{try{return [{troop,abilityId:learningAbilityId(adaptedPrototype(troop.spell.id),troop.manaCost)}];}catch{return [];}});

describe('player-facing skill names',()=>{
 it('give every mechanics exactly one name and every name exactly one mechanics',()=>{
  const nameOf=new Map<string,Set<string>>();const idsOf=new Map<string,Set<string>>();
  for(const {troop,abilityId} of implemented){
   const name=skillNameForTroop(troop.id);expect(name,`${troop.name}(${troop.id})`).toMatch(/\S/);
   (nameOf.get(abilityId)??nameOf.set(abilityId,new Set()).get(abilityId)!).add(name!);
   (idsOf.get(name!)??idsOf.set(name!,new Set()).get(name!)!).add(abilityId);
  }
  expect([...nameOf.values()].filter(s=>s.size>1)).toEqual([]);
  expect([...idsOf.entries()].filter(([,s])=>s.size>1).map(([n])=>n)).toEqual([]);
  expect(nameOf.size).toBe(idsOf.size);
 });
 it('use the original spell name except for the approved overrides',()=>{
  for(const {troop} of implemented)if(!(troop.id in SKILL_NAME_OVERRIDES))expect(skillNameForTroop(troop.id)).toBe(troop.spell.name.trim());
  expect(skillNameForTroop(6414)).toBe('远古之盾');expect(skillNameForTroop(6768)).toBe('炎爆');expect(skillNameForTroop(7704)).toBe('地裂');
  expect(skillNameForTroop(6750)).toBe('怒涛');expect(skillNameForTroop(6583)).toBe(getTroopById(6583)!.spell.name.trim());
  expect(Object.keys(SKILL_NAME_OVERRIDES)).toHaveLength(27);
 });
 it('companions show the same name as the enemies that teach the ability',()=>{
  const byAbility=new Map(implemented.map(({troop,abilityId})=>[abilityId,skillNameForTroop(troop.id)]));
  for(const choice of partyAbilityChoices())expect(choice.name).toBe(byAbility.get(choice.abilityId));
 });
});
