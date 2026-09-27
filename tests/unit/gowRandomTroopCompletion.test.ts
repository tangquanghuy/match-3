// Extra real-cast boundary evidence for one ranged chosen and one random single-target troop.
// @ts-expect-error Stored independent English source
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Native GoW spell-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {SeededRNG} from '@engine/rng';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
const source=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const cases=[
 {id:7161,spell:8736,cost:7,colors:[BaseColor.Red,BaseColor.Purple],desc:'Deal 3-[Magic + 2] damage to an Enemy.',target:'FromTarget',type:'RandomDamage',base:2},
 {id:7335,spell:8958,cost:6,colors:[BaseColor.Red,BaseColor.Purple],desc:'Deal [Magic + 5] damage to a random Enemy.',target:'RandomEnemy',type:'Damage',base:5},
] as const;
function setup(c:typeof cases[number],seed:number,side=PlayerSide.Left,magic=10){
 const f=damageFixture();Object.assign(f.caster,{skillId:String(c.spell),mana:c.cost,manaCost:c.cost,colors:[...c.colors],magic});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,new SeededRNG(seed),f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(12));
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases)describe(`troop:${c.id} random/target boundary`,()=>{
 it('English, native, final binding and mana colors match independently',()=>{
  const en=source.find((v:{id:number})=>v.id===c.id)!,compiled=TROOPS.find(v=>v.id===c.id)!;
  const n=native.get(c.spell).raw;
  expect(en.stats.spell.desc).toBe(c.desc);expect(en.stats.spell.id).toBe(c.spell);
  expect(en.ManaCost).toBe(c.cost);expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(c.colors.map(v=>`Color${v}`).sort());
  expect(n.SpellSteps).toHaveLength(1);
  expect(n.SpellSteps[0]).toMatchObject({Type:c.type,Target:c.target,Amount:c.base,SpellPowerMultiplier:1});
  expect(compiled).toMatchObject({id:c.id,manaCost:c.cost,manaColors:[...c.colors],spell:{id:c.spell}});
  expect(registry.prototypes.has(String(c.spell))).toBe(true);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(`128 independent seeds on ${side} keep one real hit, mana and turn`,()=>{
  const positions=new Set<number>(),amounts=new Set<number>();
  for(let seed=1;seed<=128;seed++){
   const f=setup(c,seed,side),events=f.cast(),hits=events.filter(e=>e.type==='skill-damage');
   expect(hits).toHaveLength(1);
   expect(f.enemies.filter(e=>e.hp<1000)).toHaveLength(1);
   if(c.id===7161){expect(hits[0].targetId).toBe(12);expect(hits[0].damage).toBeGreaterThanOrEqual(3);expect(hits[0].damage).toBeLessThanOrEqual(12);}
   else expect(hits[0].damage).toBe(15);
   positions.add(hits[0].targetId);amounts.add(hits[0].damage);
   expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
   expect(f.state.actionLog).toHaveLength(1);
  }
  if(c.id===7161){expect(positions).toEqual(new Set([12]));expect(amounts.has(3)).toBe(true);expect(amounts.has(12)).toBe(true);}
  else expect(positions.size).toBeGreaterThan(1);
 });
 it('Barrier blocks the selected victim only, spending exactly one action',()=>{
  const f=setup(c,42);for(const e of f.enemies)e.statuses=[{id:'barrier',turns:3}];
  const ev=f.cast();expect(ev.filter(e=>e.type==='skill-damage')).toHaveLength(0);
  expect(f.enemies.every(e=>e.hp===1000)).toBe(true);
  expect(f.enemies.filter(e=>e.statuses.some(s=>s.id==='barrier'))).toHaveLength(3);
  expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(PlayerSide.Right);
 });
 it('low mana and silence prevent actual casting before selecting a target',()=>{
  for(const which of ['low','silence']){const f=setup(c,42);if(which==='low')f.caster.mana=c.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
   expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);}
 });
});
