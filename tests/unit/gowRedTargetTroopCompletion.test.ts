// Troop:6255 per-entity red-mana target conditional damage and no-red counterexample.
// @ts-expect-error Saved independent troop data
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Native GoW reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
const source=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function setup(side=PlayerSide.Left){
 const f=damageFixture();Object.assign(f.caster,{skillId:'7398',mana:12,manaCost:12,colors:[BaseColor.Blue,BaseColor.Yellow],magic:10});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;engine.setTargetChooser(new FixedTargetChooser(12));
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
describe('troop:6255 Blue/Yellow triple against a Red-mana target',()=>{
 it('saved English, native conditional step, troop binding and colors/cost',()=>{
  const a=source.find((t:{id:number})=>t.id===6255)!,n=native.get(7398).raw;
  expect(a.stats.spell.id).toBe(7398);expect(a.stats.spell.desc).toBe('Deal [Magic + 6] damage to an enemy. Deal triple damage if they use Red Mana.');
  expect(a.ManaCost).toBe(12);expect(Object.keys(a._ManaColors_parsed).sort()).toEqual(['ColorBlue','ColorYellow']);
  expect(n.SpellSteps).toHaveLength(1);expect(n.SpellSteps[0]).toMatchObject({Type:'Damage',Target:'FromTarget',Amount:6,SpellPowerMultiplier:1,StatusModifier:'MultiplyForRedTarget',StatusAmount:3});
  expect(TROOPS.find(x=>x.id===6255)).toMatchObject({manaCost:12,manaColors:[BaseColor.Blue,BaseColor.Yellow],spell:{id:7398}});
  expect(registry.prototypes.get('7398')).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:6,mult:1},condMult:{times:3,cond:{kind:'targetColor',color:BaseColor.Red}}}]});
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const red of [false,true])it(`actual ${side} red target=${red}`,()=>{
  const f=setup(side);f.enemies[2].colors=[red?BaseColor.Red:BaseColor.Blue];
  const ev=f.cast(),target=red?48:16;
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[12,target]]);
  expect(f.enemies.map(e=>e.hp)).toEqual([1000,1000,1000-target,1000]);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
  expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
 });
 it('Barrier prevents a triple hit; Silence and low mana prevent casting',()=>{
  const f=setup();f.enemies[2].colors=[BaseColor.Red];f.enemies[2].statuses=[{id:'barrier',turns:3}];
  expect(f.cast().filter(e=>e.type==='skill-damage')).toEqual([]);expect(f.enemies[2].hp).toBe(1000);
  for(const mode of ['low','silence']){const b=setup();if(mode==='low')b.caster.mana=11;else b.caster.statuses=[{id:'silence',turns:3}];
   expect(b.cast()).toEqual([]);expect(b.state.actionLog).toHaveLength(0);}
 });
});
