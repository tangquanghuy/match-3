// Independent native/source and real conditional-damage spell signoff fixtures.
// @ts-expect-error Saved GoW English data
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Saved GoW native-step index
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
const cases=[
 {id:6030,spell:7030,colors:[BaseColor.Green,BaseColor.Brown],desc:'Deal [Magic + 3] damage to the strongest Enemy. If I am wounded, deal 8 more damage.',target:'StrongestEnemy',base:3},
 {id:6370,spell:7522,colors:[BaseColor.Blue,BaseColor.Purple],desc:'Deal [Magic + 1] damage to an enemy. Deal triple damage if the enemy uses Blue Mana.',target:'FromTarget',base:1},
] as const;
function setup(c:typeof cases[number],side=PlayerSide.Left){
 const f=damageFixture();Object.assign(f.caster,{skillId:String(c.spell),mana:10,manaCost:10,colors:[...c.colors],magic:10});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;engine.setTargetChooser(new FixedTargetChooser(12));
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases)describe(`troop:${c.id} per-entity conditional hit`,()=>{
 it('original English/native step and final cost, identity/colors match',()=>{
  const en=source.find((v:{id:number})=>v.id===c.id)!,n=native.get(c.spell).raw;
  expect(en.stats.spell.desc).toBe(c.desc);expect(en.stats.spell.id).toBe(c.spell);
  expect(en.ManaCost).toBe(10);expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(c.colors.map(x=>`Color${x}`).sort());
  expect(n.SpellSteps).toHaveLength(1);expect(n.SpellSteps[0]).toMatchObject({Type:'Damage',Target:c.target,Amount:c.base,SpellPowerMultiplier:1});
  expect(TROOPS.find(t=>t.id===c.id)).toMatchObject({manaCost:10,manaColors:[...c.colors],spell:{id:c.spell}});
  expect(registry.prototypes.has(String(c.spell))).toBe(true);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(`real casts on ${side} exercise both condition branches and unaffected enemies`,()=>{
  for(const condition of [false,true]){
   const f=setup(c,side);let target=12;
   if(c.id===6030){f.enemies[0].hp=900;f.enemies[1].hp=500;f.enemies[2].hp=600;f.enemies[3].hp=700;target=10;
    if(condition)f.caster.hp=999;
   }else if(condition)f.enemies[2].colors=[BaseColor.Blue];
   const before=f.enemies.map(e=>e.hp);const events=f.cast(),hits=events.filter(e=>e.type==='skill-damage');
   const base=10+c.base,amount=c.id===6030?base+(condition?8:0):base*(condition?3:1);
   expect(hits.map(e=>[e.targetId,e.damage])).toEqual([[target,amount]]);
   expect(f.enemies.map((e,i)=>before[i]-e.hp)).toEqual(f.enemies.map(e=>e.id===target?amount:0));
   expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
   expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
  }
 });
 it('Barriers block hits but consume mana/action; low mana and Silence do not',()=>{
  const blocked=setup(c);for(const e of blocked.enemies)e.statuses=[{id:'barrier',turns:3}];
  expect(blocked.cast().filter(e=>e.type==='skill-damage')).toHaveLength(0);
  expect(blocked.enemies.filter(e=>e.statuses.some(s=>s.id==='barrier'))).toHaveLength(3);
  expect(blocked.caster.mana).toBe(0);
  for(const mode of ['low','silence']){const f=setup(c);if(mode==='low')f.caster.mana=9;else f.caster.statuses=[{id:'silence',turns:3}];
   expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);}
 });
});
