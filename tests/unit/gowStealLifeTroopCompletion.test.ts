// Whole-cast source and life-transfer boundary evidence for troop:6169.
// @ts-expect-error Independent saved English source
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Independent native spell-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
const source=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function setup(side=PlayerSide.Left,magic=11){
 const f=damageFixture();Object.assign(f.caster,{skillId:'7302',mana:20,manaCost:20,magic,colors:[BaseColor.Blue,BaseColor.Green,BaseColor.Red],maxHp:100,hp:100});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
describe('troop:6169 StealLife complete battle entry',()=>{
 it('saved English, native, localized unit, colors/cost and drain-all prototype',()=>{
  const a=source.find((t:{id:number})=>t.id===6169)!,t=TROOPS.find(t=>t.id===6169)!,n=native.get(7302).raw;
  expect(a.stats.spell.desc).toBe('Steal [Magic + 5] Life from all Enemies.');expect(a.stats.spell.id).toBe(7302);
  expect(a.ManaCost).toBe(20);expect(Object.keys(a._ManaColors_parsed).sort()).toEqual(['ColorBlue','ColorGreen','ColorRed']);
  expect(t).toMatchObject({id:6169,manaCost:20,manaColors:[BaseColor.Blue,BaseColor.Green,BaseColor.Red],spell:{id:7302}});
  expect(n.SpellSteps).toHaveLength(1);expect(n.SpellSteps[0]).toMatchObject({Type:'StealLife',Target:'AllEnemies',Amount:5,SpellPowerMultiplier:1});
  expect(registry.prototypes.get('7302')).toEqual({segments:[{kind:'damage',target:'enemyAll',scaling:{base:5,mult:1},range:'all',drain:true}]});
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,11])it(`actual ${side} Magic=${magic}, ignores armor and grants actual stolen max/current Life`,()=>{
  const f=setup(side,magic),nominal=magic+5;
  for(const e of f.enemies)e.armor=200;
  const events=f.cast();
  expect(f.enemies.map(e=>e.hp)).toEqual(Array(4).fill(1000-nominal));
  expect(f.enemies.map(e=>e.armor)).toEqual(Array(4).fill(200));
  expect([f.caster.hp,f.caster.maxHp]).toEqual([100+nominal*4,100+nominal*4]);
  expect(events.filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([10,11,12,13]);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
  expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
 });
 it('Barrier and overkill transfer only real lost Life; no fifth retarget',()=>{
  const f=setup();f.enemies[0].statuses=[{id:'barrier',turns:3}];
  f.enemies[1].hp=3;f.enemies[2].hp=9;f.enemies[3].hp=50;
  for(const e of f.enemies)e.armor=90;
  const victims=[...f.enemies];const ev=f.cast();expect(victims.map(e=>e.hp)).toEqual([1000,0,0,34]);
  expect(victims.map(e=>e.armor)).toEqual([90,90,90,90]);
  expect([f.caster.hp,f.caster.maxHp]).toEqual([128,128]);
  expect(ev.filter(e=>e.type==='defeat').map(e=>e.characterId)).toEqual([11,12]);
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([11,12,13]);
 });
 it('insufficient mana, silence and defeated caster never consume the action',()=>{
  for(const reason of ['low','silence','defeated'] as const){const f=setup();if(reason==='low')f.caster.mana=19;
   if(reason==='silence')f.caster.statuses=[{id:'silence',turns:3}];
   if(reason==='defeated'){f.caster.hp=0;f.caster.defeated=true;}
   expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);}
 });
});
