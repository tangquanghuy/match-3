// Lane L7 batch B01 (sa-L7): per-entity source/prototype binding and real castSkill evidence
// for troop:6472, troop:6320, troop:6228, troop:6352, troop:7501.
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

interface Opts{spell:number;cost:number;colors:BaseColor[];side?:PlayerSide;magic?:number;casterArmor?:number;
 allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number}
function setup(o:Opts){
 const side=o.side??PlayerSide.Left;
 const f=damageFixture(0,0,o.enemies??[{},{},{},{}]);
 Object.assign(f.caster,{skillId:String(o.spell),mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10,armor:o.casterArmor??0});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(20+i,{mana:0,...a}));
 const mine=[f.caster,...allies];
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=mine;f.state.activePlayer=side;}
 else f.state.teams.Left.characters=mine;
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.target??12));
 const opponent=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 // Defeated troops are removed from the team array; keep stable references and start Life.
 const foes=[...f.enemies];const startHp=foes.map(e=>e.hp);
 return {...f,enemies:foes,engine,side,opponent,allies,cast:()=>engine.castSkill(f.caster.id),
  loss:()=>foes.map((e,i)=>startHp[i]-e.hp)};
}
function source(id:number,spell:number,cost:number,colors:BaseColor[]){
 const o=original.find((t:{id:number})=>t.id===id)!;const t=TROOPS.find(t=>t.id===id)!;
 expect(o.stats.spell.id).toBe(spell);expect(o.ManaCost).toBe(cost);
 expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colors.map(c=>`Color${c}`).sort());
 expect(t).toMatchObject({id,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
 return {o,t,steps:native.get(spell).raw.SpellSteps as Record<string,unknown>[],proto:registry.prototypes.get(String(spell))};
}
function turnSpent(f:ReturnType<typeof setup>){
 expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.opponent);
}
function blocked(o:Opts){
 for(const mode of ['low-mana','silence'] as const){
  const f=setup(o);
  if(mode==='low-mana')f.caster.mana=o.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.loss()).toEqual([0,0,0,0]);
 }
}

// ---------------------------------------------------------------- troop:6472 / spell 7650
describe('L7B01 troop:6472 spell 7650 deaths-boosted single damage [x15]',()=>{
 const C={spell:7650,cost:22,colors:[BaseColor.Red,BaseColor.Purple,BaseColor.Brown]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(6472,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 13] damage to an enemy, boosted by all allies and enemies killed. [x15]');
  expect(steps).toEqual([
   {Target:'AllAllies',Amount:1500,Type:'CountAllyDeaths'},
   {Target:'AllEnemies',Amount:1500,Type:'CountEnemyDeaths'},
   {SpellPowerMultiplier:1,Target:'FromTarget',UseCounterForAmount:true,Amount:13,Primarypower:true,Type:'Damage'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:13,mult:1},
   modifier:{mod:{kind:'multiplier',a:15},sources:[{kind:'countEnemyDeaths'},{kind:'countAllyDeaths'}]}}]});
  expect(t.spell.description).toBe('对 1 名敌人造成 [魔法 + 13] 点伤害，伤害值因被杀掉盟友和敌人数量而增强。 [x15]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: [Magic+13] + 15 x (ally deaths + enemy deaths)`,()=>{
  const f=setup({...C,side,magic});
  f.state.battleDeaths={[f.side]:2,[f.opponent]:1} as Record<PlayerSide,number>;
  f.cast();
  expect(f.loss()).toEqual([0,0,magic+13+15*3,0]);turnSpent(f);
 });
 it('no deaths -> no boost; ally-only and enemy-only deaths each add x15',()=>{
  for(const [ally,enemy] of [[0,0],[1,0],[0,4]] as const){
   const f=setup({...C,magic:7});f.state.battleDeaths={[PlayerSide.Left]:ally,[PlayerSide.Right]:enemy};
   f.cast();expect(f.loss()[2]).toBe(7+13+15*(ally+enemy));
  }
 });
 it('an enemy killed in a prior real action is counted by the engine battle counter',()=>{
  const f=setup({...C,magic:0,enemies:[{},{},{hp:5,maxHp:5},{}]});
  f.cast();expect(f.enemies[2].defeated).toBe(true);expect(f.state.battleDeaths?.[PlayerSide.Right]).toBe(1);
  f.state.activePlayer=PlayerSide.Left;f.caster.mana=C.cost;f.engine.setTargetChooser(new FixedTargetChooser(13));
  f.cast();expect(1000-f.enemies[3].hp).toBe(13+15);
 });
 it('armor absorbs normal damage; barrier blocks the hit; low mana / silence block the cast',()=>{
  const a=setup({...C,magic:0,enemies:[{},{},{armor:5},{}]});a.cast();
  expect(a.enemies[2].armor).toBe(0);expect(a.loss()[2]).toBe(8);
  const b=setup({...C,magic:0,enemies:[{},{},{statuses:[{id:'barrier',turns:99}]},{}]});b.cast();
  expect(b.loss()).toEqual([0,0,0,0]);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6320 / spell 7470
describe('L7B01 troop:6320 spell 7470 true scatter boosted by all armor [3:1]',()=>{
 const C={spell:7470,cost:15,colors:[BaseColor.Blue,BaseColor.Red]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(6320,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal 8 true scatter damage, boosted by all Ally and Enemy Armor. [3:1]');
  expect(steps).toEqual([
   {Target:'AllEnemies',Amount:34,Type:'CountArmor'},
   {Target:'AllAllies',UseCounterForAmount:true,Amount:34,Type:'CountArmor'},
   {Target:'AllEnemies',UseCounterForAmount:true,Amount:8,Type:'TrueScatterDamage'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyAll',scaling:{base:8,mult:0},range:'scatter',trueDamage:true,
   modifier:{mod:{kind:'ratio',a:3,b:1},sources:[{kind:'allyStatSum',stat:'armor'},{kind:'enemyStatSum',stat:'armor'}]}}]});
  expect(t.spell.description).toBe('造成 8 点真实散射伤害，伤害值因敌我双方的护甲值而增强。 [3:1]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: pool 8 + per-step floor(armor x 34%), magic-independent, true`,()=>{
  // R007-1 (sa-P P-counter-per-step): ally armor 7 + 3 = 10 -> 3; enemy armor 5 x 4 = 20 -> 6; pool 8 + 9 = 17
  const f=setup({...C,side,magic,casterArmor:7,allies:[{armor:3}],enemies:[{armor:5},{armor:5},{armor:5},{armor:5}]});
  const ev=f.cast();
  expect(f.loss().reduce((a,b)=>a+b,0)).toBe(17);
  expect(f.enemies.map(e=>e.armor)).toEqual([5,5,5,5]);
  expect(ev.filter(e=>e.type==='skill-damage').every(e=>(e as {range:string}).range==='scatter')).toBe(true);
  turnSpent(f);
 });
 it('armor source changes the pool: 0 armor -> 8; 2 armor -> 8; 3 armor -> 9; enemy armor alone counts',()=>{
  for(const [casterArmor,enemyArmor,pool] of [[0,0,8],[2,0,8],[3,0,9],[0,12,12]] as const){
   const f=setup({...C,casterArmor,enemies:[{armor:enemyArmor},{},{},{}]});f.cast();
   expect(f.loss().reduce((a,b)=>a+b,0)).toBe(pool);
  }
 });
 it('scatter never hits dead enemies, dead enemy armor is not counted, and capacity-full targets are avoided first',()=>{
  const f=setup({...C,enemies:[{hp:0,defeated:true,armor:30},{hp:2,maxHp:2},{},{}]});f.cast();
  const loss=f.loss();
  expect(loss[0]).toBe(0);expect(loss[1]).toBeLessThanOrEqual(2);
  expect(loss.reduce((a,b)=>a+b,0)).toBe(8);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6228 / spell 7370
describe('L7B01 troop:6228 spell 7370 single damage boosted by all ally armor [4:1]',()=>{
 const C={spell:7370,cost:12,colors:[BaseColor.Green,BaseColor.Red]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(6228,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 2] damage to an enemy, boosted by all ally Armor. [4:1]');
  expect(steps).toEqual([
   {Target:'AllAllies',Amount:25,Type:'CountArmor'},
   {SpellPowerMultiplier:1,Target:'FromTarget',UseCounterForAmount:true,Amount:2,Primarypower:true,Type:'Damage'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:2,mult:1},
   modifier:{mod:{kind:'ratio',a:4,b:1},source:{kind:'allyStatSum',stat:'armor'}}}]});
  expect(t.spell.description).toBe('对 1 名敌人造成 [魔法 + 2] 点伤害，伤害值因所有盟友护甲值而增强。 [4:1]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: [Magic+2] + floor(ally armor 13 / 4)`,()=>{
  const f=setup({...C,side,magic,casterArmor:6,allies:[{armor:4},{armor:3}]});f.cast();
  expect(f.loss()).toEqual([0,0,magic+2+3,0]);turnSpent(f);
 });
 it('enemy armor does not boost; dead ally armor excluded; 3 ally armor gives no boost',()=>{
  const a=setup({...C,magic:0,casterArmor:3,enemies:[{armor:40},{},{},{armor:40}]});a.cast();expect(a.loss()[2]).toBe(2);
  const b=setup({...C,magic:0,casterArmor:4,allies:[{armor:40,hp:0,defeated:true}]});b.cast();expect(b.loss()[2]).toBe(3);
 });
 it('target armor absorbs first; low mana / silence block',()=>{
  const f=setup({...C,magic:0,casterArmor:8,enemies:[{},{},{armor:3},{}]});f.cast();
  expect(f.enemies[2].armor).toBe(0);expect(f.loss()[2]).toBe(1);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6352 / spell 7504
describe('L7B01 troop:6352 spell 7504 two strongest enemies boosted by my armor [2:1]',()=>{
 const C={spell:7504,cost:12,colors:[BaseColor.Blue,BaseColor.Red]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(6352,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 1] damage to the 2 strongest enemies, boosted by my Armor. [2:1]');
  expect(steps).toEqual([
   {Target:'Self',Amount:50,Type:'CountArmor'},
   {SpellPowerMultiplier:1,Target:'TwoStrongestEnemies',UseCounterForAmount:true,Amount:1,Primarypower:true,Type:'Damage'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyHealthiestN',scaling:{base:1,mult:1},n:2,
   modifier:{mod:{kind:'ratio',a:2,b:1},source:{kind:'selfStat',stat:'armor'}}}]});
  expect(t.spell.description).toBe('对两名最强大的敌人造成 [魔法 + 1] 点伤害，伤害值因自身护甲值而增强。 [2:1]');
 });
 // L7-6352-a fixed (sa-L76 round 2): enemyHealthiestN without explicit range now hits every resolved victim.
 for(const side of SIDES)for(const magic of [0,10])it(`fixed L7-6352-a side=${side} magic=${magic}: both highest-Life enemies take [Magic+1] + floor(my armor 7 / 2); others untouched`,()=>{
  const f=setup({...C,side,magic,casterArmor:7,allies:[{armor:50}],enemies:[{hp:600},{hp:900},{hp:300},{hp:800}]});
  f.cast();
  expect(f.loss()).toEqual([0,magic+4,0,magic+4]);turnSpent(f);
 });
 it('fixed L7-6352-a native expectation: TwoStrongestEnemies hits BOTH strongest enemies',()=>{
  const f=setup({...C,magic:10,casterArmor:7,enemies:[{hp:600},{hp:900},{hp:300},{hp:800}]});
  f.cast();expect(f.loss()).toEqual([0,14,0,14]);
 });
 it('R005 L7-6352-b: strength = current Life + Armor (11: 800+300 and 10: 900 are the two strongest)',()=>{
  // community reading "strength = Life + Armor" would rank 11 (800+300) in the top 2; runtime picks 10 (900) and 12 (850)
  const f=setup({...C,magic:0,enemies:[{hp:900},{hp:800,armor:300},{hp:850},{hp:100}]});
  f.cast();expect(f.loss()).toEqual([1,0,0,0]);expect(f.enemies[1].armor).toBe(299);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:7501 / spell 9246
describe('L7B01 troop:7501 spell 9246 ally-armor damage with Boss x ascension multiplier [4:1]',()=>{
 const C={spell:9246,cost:12,colors:[BaseColor.Blue,BaseColor.Red]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(7501,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 4] damage to an Enemy, boosted by all Ally Armor. If they are a Boss, deal 3x - 5x damage, based on my Ascensions. [4:1]');
  expect(steps).toEqual([
   {Target:'AllAllies',Amount:25,Type:'CountArmor'},
   {SpellPowerMultiplier:1,Target:'FromTarget',StatusAmount:3,UseCounterForAmount:true,Amount:4,Primarypower:true,StatusModifier:'MultiplyForAscensionBoss',Type:'Damage'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1},
   modifier:{mod:{kind:'ratio',a:4,b:1},source:{kind:'allyStatSum',stat:'armor'}},
   condMult:{times:3,cond:{kind:'allOf',of:[{kind:'targetRace',race:'Boss'},{kind:'ascended',min:3}]}}}]});
  expect(t.spell.description).toContain('3 到 5 倍');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: non-Boss [Magic+4] + floor(ally armor 9 / 4)`,()=>{
  const f=setup({...C,side,magic,casterArmor:5,allies:[{armor:4}]});f.cast();
  expect(f.loss()).toEqual([0,0,magic+4+2,0]);turnSpent(f);
 });
 it('Boss target: x1 without ascension, x3 at ascension 3',()=>{
  const a=setup({...C,magic:2,enemies:[{},{},{troopTypes:['Boss']},{}]});a.cast();expect(a.loss()[2]).toBe(6);
  const b=setup({...C,magic:2,enemies:[{},{},{troopTypes:['Boss']},{}]});(b.state as {ascension?:number}).ascension=3;
  b.cast();expect(b.loss()[2]).toBe(18);
 });
 it('repro L7-7501 source-dispute: ascension 5 against a Boss still deals only 3x (English says 3x - 5x by Ascensions)',()=>{
  const f=setup({...C,magic:2,enemies:[{},{},{troopTypes:['Boss']},{}]});(f.state as {ascension?:number}).ascension=5;
  f.cast();expect(f.loss()[2]).toBe(18);
  blocked(C);
 });
});
