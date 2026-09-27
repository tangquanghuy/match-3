// Real-cast two-step spell fixtures: unconditional extra turn vs conditional mana drain.
// @ts-expect-error Stored English troop source
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Independent native source index
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
 {id:6044,spell:7044,cost:6,colors:[BaseColor.Green],base:2,desc:'Deal [Magic + 2] damage to an Enemy. Gain an extra turn.',last:'ExtraTurn'},
 {id:7004,spell:8532,cost:12,colors:[BaseColor.Green,BaseColor.Purple],base:1,desc:'Deal [Magic + 1] damage to an Enemy. If the Enemy has full Mana, drain their Mana.',last:'DecreaseMana'},
] as const;
function setup(c:typeof cases[number],side=PlayerSide.Left){
 const f=damageFixture();Object.assign(f.caster,{skillId:String(c.spell),mana:c.cost,manaCost:c.cost,colors:[...c.colors],magic:10});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;engine.setTargetChooser(new FixedTargetChooser(12));
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases)describe(`troop:${c.id} two native-step spell`,()=>{
 it('separate English/native/compiled two clauses and binding match',()=>{
  const en=source.find((x:{id:number})=>x.id===c.id)!,n=native.get(c.spell).raw,compiled=TROOPS.find(x=>x.id===c.id)!;
  expect(en.stats.spell.desc).toBe(c.desc);expect(en.stats.spell.id).toBe(c.spell);expect(en.ManaCost).toBe(c.cost);
  expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(c.colors.map(x=>`Color${x}`).sort());
  expect(n.Cost).toBe(c.cost);expect(n.SpellSteps).toHaveLength(2);
  expect(n.SpellSteps[0]).toMatchObject({Type:'Damage',Target:'FromTarget',Amount:c.base,SpellPowerMultiplier:1});
  expect(n.SpellSteps[1].Type).toBe(c.last);
  expect(compiled).toMatchObject({manaCost:c.cost,manaColors:[...c.colors],spell:{id:c.spell}});
  expect(registry.prototypes.has(String(c.spell))).toBe(true);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const fullMana of [false,true])it(`real ${side} fullMana=${fullMana}: selected damage then rider`,()=>{
  const f=setup(c,side),target=f.enemies[2],other=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
  target.manaCost=16;target.mana=fullMana?16:15;
  const ev=f.cast();expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[12,10+c.base]]);
  expect(target.hp).toBe(1000-10-c.base);expect(f.enemies.filter(e=>e.hp!==1000)).toHaveLength(1);
  expect(target.mana).toBe(c.id===7004&&fullMana?0:fullMana?16:15);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
  expect(f.state.activePlayer).toBe(c.id===6044?side:other);
  expect(ev.some(e=>e.type==='extra-turn')).toBe(c.id===6044);
 });
 it('low mana and silence block both steps and preserve current action',()=>{
  for(const reason of ['low','silence']){const f=setup(c),before=f.enemies.map(e=>e.hp);
   if(reason==='low')f.caster.mana=c.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
   expect(f.cast()).toEqual([]);expect(f.enemies.map(e=>e.hp)).toEqual(before);expect(f.state.actionLog).toHaveLength(0);}
 });
});
