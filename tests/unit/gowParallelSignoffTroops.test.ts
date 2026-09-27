// Parameterized per-entity source and actual battle evidence for parallel signoff.
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Independent saved native-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide} from '@engine/types';
import {setGoldForSide,goldForSide} from '@engine/battleGold';
import {damageFixture} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const cases=[
 {id:6614,spell:7946,cost:7,colors:[BaseColor.Brown],kind:'gold',base:20},
 {id:6615,spell:7946,cost:7,colors:[BaseColor.Green],kind:'gold',base:20},
 {id:6616,spell:7946,cost:7,colors:[BaseColor.Blue],kind:'gold',base:20},
 {id:7159,spell:8734,cost:7,colors:[BaseColor.Green,BaseColor.Purple],kind:'random',base:2},
 {id:7160,spell:8735,cost:7,colors:[BaseColor.Blue,BaseColor.Yellow],kind:'frontRange',base:2},
 {id:7161,spell:8736,cost:7,colors:[BaseColor.Red,BaseColor.Purple],kind:'chosenRange',base:2},
] as const;
function setup(c:typeof cases[number],side:PlayerSide,magic=10){
 const f=damageFixture();Object.assign(f.caster,{skillId:String(c.spell),mana:c.cost,manaCost:c.cost,colors:[...c.colors],magic});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(12));
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases)describe(`signoff troop:${c.id}/spell:${c.spell}`,()=>{
 it('per-entity English, native steps, binding, cost/color, prototype and display',()=>{
  const o=original.find((t:{id:number})=>t.id===c.id)!;
  const t=TROOPS.find(t=>t.id===c.id)!;
  const n=native.get(c.spell).raw;
  expect(o.stats.spell.id).toBe(c.spell);expect(o.ManaCost).toBe(c.cost);
  expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(c.colors.map(color=>`Color${color}`).sort());
  expect(t).toMatchObject({id:c.id,manaCost:c.cost,manaColors:[...c.colors],spell:{id:c.spell}});
  expect(t.spell.description.length).toBeGreaterThan(0);
  expect(n.SpellSteps).toHaveLength(1);
  if(c.kind==='gold'){
   expect(o.stats.spell.desc).toBe('Gain 20 Gold.');
   expect(n.SpellSteps[0]).toMatchObject({Type:'GiveGold',Target:'Self',Amount:20});
   expect(registry.prototypes.get(String(c.spell))).toMatchObject({segments:[{kind:'gainEconomy',currency:'gold',scaling:{base:20,mult:0}}]});
  }else{
   expect(n.SpellSteps[0]).toMatchObject({Type:c.kind==='random'?'Damage':c.kind==='frontRange'?'RandomHighDamage':'RandomDamage', Target:c.kind==='random'?'RandomEnemy':c.kind==='frontRange'?'FrontEnemy':'FromTarget',Amount:2,SpellPowerMultiplier:1});
   expect(registry.prototypes.get(String(c.spell))).toMatchObject({segments:[{kind:'damage',target:c.kind==='random'?'enemyRandom':c.kind==='frontRange'?'enemyFront':'enemyChosen'}]});
   expect(o.stats.spell.desc.length).toBeGreaterThan(12);
  }
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,10])
 it(`real cast side=${side} magic=${magic} produces only the named effect, costs mana and a turn`,()=>{
  const f=setup(c,side,magic);setGoldForSide(f.state,side,3);
  const opponent=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
  setGoldForSide(f.state,opponent,11);
  const ev=f.cast();const loss=f.enemies.map(e=>1000-e.hp);
  if(c.kind==='gold'){
   expect(goldForSide(f.state,side)).toBe(23);expect(goldForSide(f.state,opponent)).toBe(11);
   expect(loss).toEqual([0,0,0,0]);
   expect(ev.filter(e=>e.type==='economy-gain').map(e=>[e.currency,e.amount,e.side])).toEqual([['gold',20,side]]);
  }else{
   expect(goldForSide(f.state,side)).toBe(3);
   expect(loss.filter(v=>v>0)).toHaveLength(1);
   if(c.kind==='random')expect(loss.reduce((a,b)=>a+b,0)).toBe(magic+2);
   if(c.kind==='frontRange'){
    expect(loss[0]).toBeGreaterThanOrEqual(Math.round(magic/2+1));expect(loss[0]).toBeLessThanOrEqual(magic+2);
   }
   if(c.kind==='chosenRange'){
    expect(loss[2]).toBeGreaterThanOrEqual(3);expect(loss[2]).toBeLessThanOrEqual(Math.max(3,magic+2));
   }
  }
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
  expect(f.state.activePlayer).toBe(opponent);
  expect(ev.some(e=>e.type==='extra-turn')).toBe(false);
 });
 for(const mode of ['low-mana','silence'] as const)it(`${mode} blocks the real cast without consuming action`,()=>{
  const f=setup(c,PlayerSide.Left);
  if(mode==='low-mana')f.caster.mana=c.cost-1;
  else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.caster.mana).toBe(mode==='low-mana'?c.cost-1:c.cost);
 });
});