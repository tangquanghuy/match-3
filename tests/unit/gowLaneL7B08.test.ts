// Lane L7+L6 batch B08 (sa-L76): troop:6283, troop:6874 (accept candidates), troop:7069 (draft, L7-7069),
// troop:6550 / troop:7755 (L7-6550 / L7-7755, see gowLaneL7B08Repro until fixed).
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Independent saved native-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide,type Character} from '@engine/types';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';

const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const SIDES=[PlayerSide.Left,PlayerSide.Right] as const;

interface Opts{spell:number;cost:number;colors:BaseColor[];side?:PlayerSide;magic?:number;caster?:Partial<Character>;
 allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number}
function setup(o:Opts){
 const side=o.side??PlayerSide.Left;
 const f=damageFixture(0,0,o.enemies??[{},{},{},{}]);
 Object.assign(f.caster,{skillId:String(o.spell),mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10,...(o.caster??{})});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(20+i,{mana:0,...a}));
 const mine=[f.caster,...allies];
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=mine;f.state.activePlayer=side;}
 else f.state.teams.Left.characters=mine;
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.target??12));
 const opponent=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 const foes=[...f.enemies];const startHp=foes.map(e=>e.hp);
 return {...f,enemies:foes,engine,side,opponent,allies,cast:()=>engine.castSkill(f.caster.id),loss:()=>foes.map((e,i)=>startHp[i]-e.hp)};
}
function source(id:number,spell:number,cost:number,colors:BaseColor[]){
 const o=original.find((t:{id:number})=>t.id===id)!;const t=TROOPS.find(t=>t.id===id)!;
 expect(o.stats.spell.id).toBe(spell);expect(o.ManaCost).toBe(cost);
 expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colors.map(c=>`Color${c}`).sort());
 expect(t).toMatchObject({id,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
 const n=native.get(spell).raw;expect(n.Cost).toBe(cost);
 return {o,t,n,steps:n.SpellSteps as Record<string,unknown>[],proto:registry.prototypes.get(String(spell))};
}
function turnSpent(f:ReturnType<typeof setup>){
 expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.opponent);
}
function blocked(o:Opts){
 for(const mode of ['low-mana','silence'] as const){
  const f=setup(o);
  if(mode==='low-mana')f.caster.mana=o.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  const snap=JSON.stringify([f.caster.magic,f.caster.hp,f.enemies.map(e=>e.attack)]);
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);expect(f.loss()).toEqual([0,0,0,0]);
  expect(f.caster.mana).toBe(mode==='low-mana'?o.cost-1:o.cost);
  expect(JSON.stringify([f.caster.magic,f.caster.hp,f.enemies.map(e=>e.attack)])).toBe(snap);
 }
}

// ---------------------------------------------------------------- troop:6283 / spell 7429
describe('L7B08 troop:6283 spell 7429 [Magic+4] damage, double vs Green-mana enemies, halve their Attack [2:1]',()=>{
 const C={spell:7429,cost:12,colors:[BaseColor.Green,BaseColor.Red]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,steps,proto}=source(6283,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 4] damage to an enemy. Deal double damage if they use Green Mana. Halve their Attack. [2:1]');
  expect(n.Target).toBe('Enemy');
  expect(steps).toEqual([
   {Target:'FromTarget',Amount:50,Type:'CountAttack'},
   {SpellPowerMultiplier:1,Target:'FromTarget',StatusAmount:2,Amount:4,Primarypower:true,StatusModifier:'MultiplyForGreenTarget',Type:'Damage'},
   {Target:'FromTarget',UseCounterForAmount:true,Type:'DecreaseAttack'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1},condMult:{times:2,cond:{kind:'targetColor',color:'Green'}}},
   {kind:'reduce',target:'enemyChosen',stat:'attack',scaling:{base:0,mult:0},halve:true}]});
  for(const s of ['[魔法 + 4]','绿色','攻击力','[2:1]'])expect(t.spell.description).toContain(s);
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: non-Green target takes [Magic+4], Attack 17 -> 17 - floor(17 x 50%) = 9`,()=>{
  const f=setup({...C,side,magic,enemies:[{},{},{attack:17,colors:[BaseColor.Red,BaseColor.Blue]},{}]});f.cast();
  expect(f.loss()).toEqual([0,0,magic+4,0]);expect(f.enemies[2].attack).toBe(9);expect(f.enemies[0].attack).toBe(17);turnSpent(f);
 });
 it('Green-mana target takes double ([Magic+4] x 2); Attack 1 -> 1 (floor 0.5 = 0 removed); 40 -> 20',()=>{
  const a=setup({...C,magic:3,enemies:[{},{},{attack:20,colors:[BaseColor.Green]},{}]});a.cast();expect(a.loss()[2]).toBe(14);expect(a.enemies[2].attack).toBe(10);
  const b=setup({...C,magic:0,enemies:[{},{},{attack:1,colors:[BaseColor.Red]},{}]});b.cast();expect(b.enemies[2].attack).toBe(1);
  const c=setup({...C,magic:0,enemies:[{},{},{attack:40,colors:[BaseColor.Red]},{}]});c.cast();expect(c.enemies[2].attack).toBe(20);
 });
 it('armor absorbs; low mana / silence block',()=>{
  const f=setup({...C,magic:0,enemies:[{},{},{armor:3,colors:[BaseColor.Red]},{}]});f.cast();expect(f.enemies[2].armor).toBe(0);expect(f.loss()[2]).toBe(1);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6874 / spell 8298
describe('L7B08 troop:6874 spell 8298 [Magic+6] damage boosted by their Attack [1:1], gain 10 Souls',()=>{
 const C={spell:8298,cost:15,colors:[BaseColor.Yellow,BaseColor.Purple]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,steps,proto}=source(6874,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 6] damage to an Enemy, boosted by their Attack. Gain 10 Souls. [1:1]');
  expect(n.Target).toBe('Enemy');
  expect(steps).toEqual([
   {Target:'FromTarget',Amount:100,Type:'CountAttack'},
   {SpellPowerMultiplier:1,Target:'FromTarget',UseCounterForAmount:true,Amount:6,Primarypower:true,Type:'Damage'},
   {Target:'Self',Amount:10,Type:'GiveSouls'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:6,mult:1},modifier:{mod:{kind:'ratio',a:1,b:1},source:{kind:'targetStat',stat:'attack'}}},
   {kind:'gainEconomy',currency:'souls',scaling:{base:10,mult:0}}]});
  for(const s of ['[魔法 + 6]','攻击力','10','[1:1]'])expect(t.spell.description).toContain(s);
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: [Magic+6] + target Attack 23; other Attack ignored`,()=>{
  const f=setup({...C,side,magic,caster:{attack:40},enemies:[{attack:90},{},{attack:23},{}]});
  const souls0=f.state.economy.souls??0;f.cast();
  expect(f.loss()).toEqual([0,0,magic+6+23,0]);turnSpent(f);
  if(side===PlayerSide.Left)expect((f.state.economy.souls??0)-souls0).toBe(10);
 });
 it('target Attack 0 -> plain [Magic+6]; armor absorbs; low mana / silence block',()=>{
  const f=setup({...C,magic:0,enemies:[{},{},{attack:0,armor:4},{}]});f.cast();expect(f.enemies[2].armor).toBe(0);expect(f.loss()[2]).toBe(2);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:7069 / spell 8597 (draft: L7-7069)
describe('L7B08 troop:7069 spell 8597 steal [Magic+1] Attack from the first enemy boosted by Green allies [x2] -> Life (draft)',()=>{
 const C={spell:8597,cost:13,colors:[BaseColor.Blue,BaseColor.Green]};
 it('English, native steps, binding, prototype',()=>{
  const {o,n,steps,proto}=source(7069,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Steal [Magic + 1] Attack from the first Enemy, boosted by Green Allies and shift it to Life. [x2]');
  expect(n.Target).toBe('None');
  expect(steps).toEqual([
   {Target:'FrontEnemy',Amount:100,Type:'CountAttack'},
   {SpellPowerMultiplier:1,Amount:1,Primarypower:true,Type:'CountMaxWithMagic'},
   {Target:'AllAllies',UseCounterForAmount:true,Amount:200,Type:'CountArmyColor',Data:'1'},
   {Target:'FrontEnemy',UseCounterForAmount:true,Type:'DecreaseAttack'},
   {Target:'Self',UseCounterForAmount:true,Type:'IncreaseHealth'}]);
  expect(proto).toEqual({segments:[{kind:'reduce',target:'enemyFront',stat:'attack',scaling:{base:1,mult:1},gainStat:'hp',
   modifier:{mod:{kind:'multiplier',a:2},source:{kind:'alliesOfColor',color:'Green'}}}]});
 });
 for(const side of SIDES)it(`real cast side=${side}: front Attack 50, Magic 10, caster + 1 Green ally -> front -15 Attack, caster Life +15 (common case)`,()=>{
  const f=setup({...C,side,magic:10,allies:[{colors:[BaseColor.Green]}],enemies:[{attack:50},{},{},{}]});f.caster.hp=500;f.cast();
  expect(f.enemies[0].attack).toBe(35);expect(f.caster.hp).toBe(515);expect(f.enemies[2].attack).toBe(17);turnSpent(f);
 });
});
