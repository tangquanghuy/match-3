// Source-backed damage clause only. Enemy Gold transfer is covered by gowGoldOwnershipAudit; whole skill remains pending.
// @ts-expect-error Node snapshot access
import fs from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error Node source parser
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { registerSkillLibrary } from '@engine/skills/library';
import { ExtensionRegistry } from '@engine/registry';
import { TurnEngine } from '@engine/TurnEngine';
import { TROOPS } from '../../src/data/troops';
import { damageFixture } from '../helpers/damageFixture';
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const english=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
describe('9783 Golden Thief damage formula and pre-gain boost (scoped)',()=>{
 it('independent English/native agree on Magic+2, 10:1 Gold and random target',()=>{
  expect(english.find((t:{stats:{spell:{id:number}}})=>t.stats.spell.id===9783).stats.spell.desc).toBe('Deal [Magic + 2] damage to a random Enemy, boosted by my Gold. Then steal 5 Gold. [10:1]');
  expect(native.get(9783).raw).toMatchObject({Cost:10,SpellSteps:[{Type:'CountMyGold',Amount:10},{Type:'Damage',Target:'RandomEnemy',Amount:2,SpellPowerMultiplier:1,UseCounterForAmount:true},{Type:'TakeEnemyGold',Amount:5},{Type:'GiveGold',Amount:5}]});
  const troop=TROOPS.find(t=>t.spell.id===9783)!;expect(troop.spell.description).toContain('[魔法 + 2]');expect(troop.spell.meta.scalings).toContainEqual({base:2,mult:1});
 });
 for(const magic of [0,1,11,20])for(const gold of [0,9,10,20])for(const index of [0,3])it(`real cast: M=${magic}, Gold=${gold}, target ${index}; boost uses pre-gain Gold`,()=>{
  const f=damageFixture();Object.assign(f.caster,{skillId:'9783',magic,mana:10,manaCost:10});f.state.economy.gold=gold;f.state.enemyGold=5;
  vi.spyOn(f.ctx.rng,'nextInt').mockImplementationOnce(n=>{expect(n).toBe(4);return index;});
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);const ev=engine.castSkill(0),amount=magic+2+Math.floor(gold/10);
  expect(f.enemies.map(c=>c.hp)).toEqual([0,1,2,3].map(i=>1000-(i===index?amount:0)));
  expect(ev.flatMap(e=>e.type==='skill-damage'?[e.targetId]:[])).toEqual([10+index]);
  expect(ev.findIndex(e=>e.type==='skill-damage')).toBeLessThan(ev.findIndex(e=>e.type==='economy-gain'));
  expect(f.state.economy.gold).toBe(gold+5);expect(f.state.enemyGold).toBe(0);
 });
});
