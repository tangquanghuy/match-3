import {describe,it,expect} from 'vitest';
import {TROOPS,getTroopById} from '../../src/data/troops';
import {troopStatsAtLevel} from '../../src/data/leveling';
import {SKILL_LIBRARY} from '../../src/engine/skills/library';
import {choiceRuleOf} from '../../src/engine/skills/gowChoiceRules';
import {attachPassives,passivesOf} from '../../src/engine/traits';
import {ExtensionRegistry} from '../../src/engine/registry';
import {CombatResolver} from '../../src/engine/CombatResolver';
import {PlayerSide} from '../../src/engine/types';
import {snapshotToCharacter} from '../../src/session/combatantMapping';
import {compileEnemyBlueprint,restoreEnemyBlueprint,adaptedPrototype,registerAdaptedCatalog} from '../../src/sillytavern/enemyBlueprint';
import type {EnemyAssemblySelection} from '../../src/sillytavern/enemyBlueprint';
import {buildEnemyFormation,restoreEnemyFormation} from '../../src/sillytavern/enemyFormation';
import {compileEnemyDesign,restoreEnemyDesign} from '../../src/sillytavern/enemyDesign';
import {PORTRAITS,savePortrait,colorKey} from '../../src/sillytavern/portraits';

const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
function assemble(traitCodes=['stoneskin','armored','regeneration'],activeTroopId=6004,chassisId=6004){
 const portrait=PORTRAITS.find(entry=>entry.troopId===chassisId)!;
 return compileEnemyBlueprint({portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),recipeTroopId:chassisId,assembly:{version:1,activeTroopId,traitCodes},externalId:'assembled-test',level:7,difficulty:1.3});
}

describe('ST classified component assembly',()=>{
 it('borrows traits across sources while retaining one chassis and native active cost',()=>{
  const bp=assemble(),source=getTroopById(6004)!,stats=troopStatsAtLevel(source,7);
  expect(source.traits.map(trait=>trait.code)).not.toContain('stoneskin');
  expect(bp.snapshot.traitIds).toEqual(['st:stoneskin','st:armored','st:regeneration']);
  expect(bp.snapshot.manaColors).toEqual(['Red']);expect(bp.snapshot.manaCost).toBe(source.manaCost);
  expect(bp.snapshot.skillId).toBe(`st:${source.spell.id}`);
  expect(bp.snapshot.stats).toEqual({hp:Math.max(1,Math.round(stats.health*1.3)),armor:Math.round(stats.armor*1.3),attack:Math.round(stats.attack*1.3),magic:Math.round(stats.magic*1.3)});
  const native=compileEnemyBlueprint({portrait:bp.portrait,externalId:'native',level:7,difficulty:1.3});
  expect(bp.context).toEqual(native.context);expect(bp.snapshot.mechanicalIdentity).toBe(native.snapshot.mechanicalIdentity);
  expect(bp.abilityId).toBe(native.abilityId);expect(bp.sourceId).not.toBe(native.sourceId);
  expect(bp.traitDescriptionAudit.map(trait=>trait.code)).toEqual(bp.snapshot.traitIds);
 });
 it('executes independent traits with native max reduction and additive stat routing',()=>{
  // Both reduction traits exist in common modules. 50% + 25% retains native strongest-only 50%.
  registerAdaptedCatalog(new ExtensionRegistry());
  const defender=snapshotToCharacter(assemble().snapshot,4),attacker=snapshotToCharacter(assemble([]).snapshot,0);
  attachPassives(defender);attachPassives(attacker);
  expect(passivesOf(defender).skullDamageTaken).toBe(.5);
  expect(passivesOf(defender).regenPerTurn).toBe(1);
  attacker.attack=20;defender.armor=0;defender.hp=defender.maxHp=100;
  const result=new CombatResolver().resolveSkullDamage({player:PlayerSide.Left,characters:[attacker]},{player:PlayerSide.Right,characters:[defender]},3);
  expect(result.events.find(event=>event.type==='skull-damage')).toMatchObject({damage:10});
  expect(defender.hp).toBe(90);
  defender.statuses.push({id:'stun',turns:1});
  expect(passivesOf(defender).skullDamageTaken).toBe(1);expect(passivesOf(defender).regenPerTurn).toBe(0);
  const stunned=new CombatResolver().resolveSkullDamage({player:PlayerSide.Left,characters:[attacker]},{player:PlayerSide.Right,characters:[defender]},3);
  expect(stunned.events.find(event=>event.type==='skull-damage')).toMatchObject({damage:20});expect(defender.hp).toBe(70);
 });
 it('retains the active as a whole atom, including choice rules when chassis differs',()=>{
  const pair=TROOPS.flatMap(active=>{
   if(!choiceRuleOf(SKILL_LIBRARY[active.spell.id]!))return [];
   const chassis=TROOPS.find(candidate=>candidate.id!==active.id&&candidate.rarityIdx===active.rarityIdx&&colorKey(candidate.manaColors)===colorKey(active.manaColors)&&PORTRAITS.some(p=>p.troopId===candidate.id));
   return chassis?[{active,chassis}]:[];
  })[0]!;
  expect(pair).toBeDefined();
  const bp=assemble([],pair.active.id,pair.chassis.id);
  expect(bp.snapshot.skillId).toBe(`st:${pair.active.spell.id}`);expect(bp.snapshot.manaCost).toBe(pair.active.manaCost);
  expect(choiceRuleOf(adaptedPrototype(pair.active.spell.id))).toEqual(choiceRuleOf(SKILL_LIBRARY[pair.active.spell.id]!));
  expect(restoreEnemyBlueprint(clone(bp))).toEqual(bp);
 });
 it('reopens every chosen module through blueprints and ordered formations',()=>{
  const bp=assemble();expect(restoreEnemyBlueprint(clone(bp))).toEqual(bp);
  const formation=buildEnemyFormation([bp,assemble(['regeneration','stoneskin'])]);
  expect(formation.members.map(member=>member.assembly?.traitCodes)).toEqual([['stoneskin','armored','regeneration'],['regeneration','stoneskin']]);
  expect(restoreEnemyFormation(clone(formation))).toEqual(formation);
  expect(formation.members.map(member=>member.snapshot.externalId)).toEqual(['enemy-1','enemy-2']);
  const altered=clone(bp);altered.assembly!.traitCodes.reverse();expect(()=>restoreEnemyBlueprint(altered)).toThrow();
  const changed=assemble(['regeneration','armored','stoneskin']);
  expect(changed.sourceId).not.toBe(bp.sourceId);expect(changed.abilityId).toBe(bp.abilityId);
 });
 it.each([
  {version:1,activeTroopId:6003,traitCodes:[]},
  {version:1,activeTroopId:6004,traitCodes:['stoneskin','stoneskin']},
  {version:1,activeTroopId:6004,traitCodes:['stoneskin','armored','regeneration','sturdy']},
  {version:1,activeTroopId:6004,traitCodes:['missing-module']},
  {version:1,activeTroopId:6004,traitCodes:[],unknown:true},
 ])('rejects incompatible or malformed modules before producing a blueprint (%j)',selection=>{
  const bp=assemble();expect(()=>compileEnemyBlueprint({portrait:bp.portrait,externalId:'bad',assembly:selection as EnemyAssemblySelection})).toThrow();
 });
 it('rejects a higher-rarity trait without granting the donor identity or affiliations',()=>{
  const commonCodes=new Set(TROOPS.filter(troop=>troop.rarityIdx===0).flatMap(troop=>troop.traits.map(trait=>trait.code)));
  const restricted=TROOPS.filter(troop=>troop.rarityIdx>0).flatMap(troop=>troop.traits).find(trait=>!commonCodes.has(trait.code))!;
  expect(restricted).toBeDefined();expect(()=>assemble([restricted.code])).toThrow(/原始稀有度/);
 });
 it('keeps composition source identity stable across level and external identity changes',()=>{
  const first=assemble();
  const later=compileEnemyBlueprint({portrait:first.portrait,recipeTroopId:6004,assembly:first.assembly,externalId:'later-position',level:49,difficulty:1.6});
  expect(later.sourceId).toBe(first.sourceId);expect(later.abilityId).toBe(first.abilityId);
  expect(later.snapshot.stats).not.toEqual(first.snapshot.stats);
 });
 it('fulfills semantic damage and defense together through independently selected traits',()=>{
  const input={manaColors:['Red'],rank:'杂兵',form:'人形',role:'Striker',level:20,difficulty:1,assembly:'classified' as const,effects:[{effect:'damage',requirement:'required' as const},{effect:'damageReduction',requirement:'required' as const}]};
  const result=compileEnemyDesign(input,{seed:6004,externalId:'enemy-1'});
  expect(result.signature.effects).toEqual(expect.arrayContaining(['damage','damageReduction']));
  expect(result.blueprint.assembly).toBeDefined();
  expect(restoreEnemyDesign(clone(result))).toEqual(result);
  const actual=getTroopById(result.blueprint.assembly!.activeTroopId)!;
  // The requested colors are the enemy's own; the native active keeps its cost.
  expect(result.blueprint.snapshot.manaColors).toEqual(input.manaColors);expect(result.blueprint.snapshot.manaCost).toBe(actual.manaCost);
 });
});
