// Narrow source-backed Gold boost review, not full original-rule certification.
// @ts-expect-error Node snapshot access
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
// @ts-expect-error Node source parser
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { registerSkillLibrary } from '@engine/skills/library';
import { ExtensionRegistry } from '@engine/registry';
import { TurnEngine } from '@engine/TurnEngine';
import { PlayerSide } from '@engine/types';
import { damageFixture, damageCharacter } from '../helpers/damageFixture';
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const english=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
describe('8144 King of Treasure all-Skills Gold ratio (scoped)',()=>{
 it('independent English specifies 5:1; CountMyGold 20 also occurs on 5:1 gem boost skills',()=>{
  expect(english.find((t:{stats:{spell:{id:number}}})=>t.stats.spell.id===8144).stats.spell.desc).toBe('Deal [Magic + 4] damage to an Enemy. Gain 3 to all Skills, boosted by my Gold. [5:1]');
  expect(native.get(8144).raw.SpellSteps).toMatchObject([{Type:'CountMyGold',Amount:20},{Type:'Damage',Target:'FromTarget',Amount:4,SpellPowerMultiplier:1},{Type:'IncreaseAllStats',Target:'Self',Amount:3,UseCounterForAmount:true}]);
  for(const id of [8142,7958]){
   expect(native.get(id).raw.SpellSteps.some((s:{Type:string;Amount:number})=>s.Type==='CountMyGold'&&s.Amount===20)).toBe(true);
   expect(english.find((t:{stats:{spell:{id:number}}})=>t.stats.spell.id===id).stats.spell.desc).toContain('[5:1]');
  }
 });
 for(const magic of [0,1,11,20])for(const gold of [0,4,5,9,10,19,20,21,24,25,99,100])it(`actual cast: M=${magic}, Gold=${gold}, four gains = 3+floor(Gold/5)`,()=>{
  const f=damageFixture();Object.assign(f.caster,{skillId:'8144',magic,hp:40,maxHp:100,mana:16,manaCost:16});
  f.state.economy.gold=gold;const ally=damageCharacter(1);f.state.teams[PlayerSide.Left].characters.push(ally);
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.setTargetChooser({choose:()=>12});const ev=engine.castSkill(0);
  const gain=3+Math.floor(gold/5);
  expect([f.caster.attack,f.caster.armor,f.caster.hp,f.caster.maxHp,f.caster.magic]).toEqual([17+gain,gain,40+gain,100+gain,magic+gain]);
  expect(f.state.economy.gold).toBe(gold);expect([ally.attack,ally.hp,ally.maxHp,ally.magic]).toEqual([17,1000,1000,11]);
  expect(f.enemies.map(c=>c.hp)).toEqual([1000,1000,1000-(magic+4),1000]);
  expect(ev.flatMap(e=>e.type==='buff'?[{target:e.targetId,stat:e.stat,amount:e.amount}]:[])).toEqual(['attack','armor','magic','hp'].map(stat=>({target:0,stat,amount:gain})));
  const damage=ev.findIndex(e=>e.type==='skill-damage'),buff=ev.findIndex(e=>e.type==='buff');expect(damage).toBeGreaterThanOrEqual(0);expect(buff).toBeGreaterThan(damage);
 });
});
