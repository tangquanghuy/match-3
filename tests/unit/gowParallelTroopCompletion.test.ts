// Shared spell families still require independent troop bindings and real-cast evidence.
// @ts-expect-error Stored snapshot reader
import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
// @ts-expect-error Native snapshot reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {SeededRNG} from '@engine/rng';
import {BaseColor,PlayerSide} from '@engine/types';
import {setGoldForSide,goldForSide} from '@engine/battleGold';
import {damageFixture} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
const source=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const cases=[
 {id:7164,spell:8739,cost:9,colors:[BaseColor.Blue,BaseColor.Purple],text:'Deal [(Magic / 2) + 4] damage to all Enemies.',kind:'all',base:4,mult:0.5},
 {id:6617,spell:7946,cost:7,colors:[BaseColor.Purple],text:'Gain 20 Gold.',kind:'gold',base:20,mult:0},
 {id:6618,spell:7946,cost:7,colors:[BaseColor.Yellow],text:'Gain 20 Gold.',kind:'gold',base:20,mult:0},
 {id:7386,spell:9028,cost:7,colors:[BaseColor.Green],text:'Deal [(Magic / 2) + 2] scatter damage.',kind:'scatter',base:2,mult:0.5},
] as const;
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function setup(c:typeof cases[number],side:PlayerSide,seed:number,magic:number){
 const f=damageFixture();Object.assign(f.caster,{skillId:String(c.spell),mana:c.cost,manaCost:c.cost,colors:[...c.colors],magic});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,new SeededRNG(seed),f.ctx.nextGemId,registry);engine.skullChance=0;
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases)describe(`troop:${c.id}/spell:${c.spell} whole-cast evidence`,()=>{
 it('English, native and localized spell, troop-specific colors/cost and runtime bind agree',()=>{
  const s=source.find((v:{id:number})=>v.id===c.id)!;
  const troop=TROOPS.find(v=>v.id===c.id)!;
  const step=native.get(c.spell).raw;
  expect(s.stats.spell.id).toBe(c.spell);expect(s.stats.spell.desc).toBe(c.text);
  expect(s.ManaCost).toBe(c.cost);
  expect(Object.keys(s._ManaColors_parsed).sort()).toEqual(c.colors.map(v=>`Color${v}`).sort());
  expect(troop).toMatchObject({id:c.id,manaCost:c.cost,manaColors:[...c.colors],spell:{id:c.spell}});
  expect(step.Cost).toBe(c.cost);expect(step.SpellSteps).toHaveLength(1);
  expect(step.SpellSteps[0]).toMatchObject({Type:c.kind==='gold'?'GiveGold':c.kind==='scatter'?'ScatterDamage':'Damage',Amount:c.base});
  expect(troop.spell.description.length).toBeGreaterThan(8);
  expect(registry.prototypes.has(String(c.spell))).toBe(true);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,1,10,11])it(`real cast ${side} magic=${magic}`,()=>{
  const f=setup(c,side,42,magic),before=f.enemies.map(e=>e.hp),other=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
  if(c.kind==='gold')setGoldForSide(f.state,side,2);
  const events=f.cast(),loss=f.enemies.map((v,i)=>before[i]-v.hp);
  const damage=Math.round(c.base+c.mult*magic);
  if(c.kind==='gold'){
   expect(goldForSide(f.state,side)).toBe(22);
   expect(goldForSide(f.state,other)).toBe(0);
   expect(events.some(e=>e.type==='skill-damage')).toBe(false);
  }else if(c.kind==='all')expect(loss).toEqual([damage,damage,damage,damage]);
  else {expect(loss.reduce((a,b)=>a+b,0)).toBe(damage);expect(loss.every(x=>x>=0)).toBe(true);}
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(other);
 });
 for(const condition of ['low-mana','silence'] as const)it(`${condition} blocks without consuming turn`,()=>{
  const f=setup(c,PlayerSide.Left,42,10);
  if(condition==='low-mana')f.caster.mana=c.cost-1;
  else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
 });
 if(c.kind==='scatter')it('multiple seeds preserve one damage pool while changing allocation',()=>{
  const patterns=new Set<string>();
  for(let seed=1;seed<=20;seed++){
   const f=setup(c,PlayerSide.Left,seed,10);f.cast();
   const distribution=f.enemies.map(e=>1000-e.hp);
   expect(distribution.reduce((a,b)=>a+b,0)).toBe(7);
   patterns.add(distribution.join(','));
  }
  expect(patterns.size).toBeGreaterThan(1);
 });
 if(c.kind==='all'||c.kind==='scatter')for(const status of ['barrier','submerged'] as const)it(`${status} prevents only its own full or distributed damage`,()=>{
  const f=setup(c,PlayerSide.Left,42,10),baseline=setup(c,PlayerSide.Left,42,10);
  f.enemies[0].statuses=[{id:status,turns:3}];
  baseline.cast();f.cast();
  expect(f.enemies[0].hp).toBe(1000);
  for(let i=1;i<4;i++)expect(f.enemies[i].hp).toBe(baseline.enemies[i].hp);
 });
});
