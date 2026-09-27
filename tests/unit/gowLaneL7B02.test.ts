// Lane L7 batch B02 (sa-L7): per-entity source/prototype binding and real castSkill evidence
// for troop:7344, troop:6087, troop:6595, troop:6848, troop:6889.
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
 allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number;rollAs?:number}
function setup(o:Opts){
 const side=o.side??PlayerSide.Left;
 const f=damageFixture(0,0,o.enemies??[{},{},{},{}]);
 Object.assign(f.caster,{skillId:String(o.spell),mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10,armor:o.casterArmor??0});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(20+i,{mana:0,...a}));
 const mine=[f.caster,...allies];
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=mine;f.state.activePlayer=side;}
 else f.state.teams.Left.characters=mine;
 // Controlled roll: the first rng.next() of the cast (the kill-chance roll; no earlier RNG use in
 // these single-target casts) returns this value; later calls (board refill/reshuffle) use the seed.
 if(o.rollAs!==undefined){const v=o.rollAs;const rng=f.ctx.rng;const real=rng.next.bind(rng);let used=false;
  rng.next=()=>{if(used)return real();used=true;return v;};}
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
const hits=(ev:{type:string}[])=>ev.filter(e=>e.type==='skill-damage') as unknown as {targetId:number;damage:number;range:string}[];

// ---------------------------------------------------------------- troop:7344 / spell 8969
describe('L7B02 troop:7344 spell 8969 four random-enemy hits boosted by my armor [3:1]',()=>{
 const C={spell:8969,cost:16,colors:[BaseColor.Yellow,BaseColor.Brown]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(7344,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 2] damage to 4 random Enemies, boosted by my Armor. [3:1]');
  const hit=(target:string,extra:Record<string,unknown>)=>({SpellPowerMultiplier:1,Target:target,UseCounterForAmount:true,Amount:2,Type:'Damage',...extra});
  expect(steps).toEqual([
   {Target:'Self',Amount:34,Type:'CountArmor'},
   hit('RandomEnemy',{Primarypower:true,Delay:400,ResetTargets:true}),
   hit('RandomPrefNotPrevEnemy',{Delay:400,ResetTargets:true}),
   hit('RandomPrefNotPrevEnemy',{Delay:400,ResetTargets:true}),
   hit('RandomPrefNotPrevEnemy',{})]);
  // L7-7344 fixed (sa-L76 round 2): one segment per native step (RandomEnemy + 3 x RandomPrefNotPrevEnemy).
  const seg=(target:string)=>({kind:'damage',target,scaling:{base:2,mult:1},modifier:{mod:{kind:'ratio',a:3,b:1},source:{kind:'selfStat',stat:'armor'}}});
  expect(proto).toEqual({segments:[seg('enemyRandom'),seg('enemyRandomPrefNotPrev'),seg('enemyRandomPrefNotPrev'),seg('enemyRandomPrefNotPrev')]});
  expect(t.spell.description).toBe('对 4 名随机敌人造成 [魔法 + 2] 点伤害，伤害值因我的护甲值而增强。 [3:1]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: 4 hits of [Magic+2] + floor(my armor 7 x 34%), consecutive hits never repeat an enemy`,()=>{
  const f=setup({...C,side,magic,casterArmor:7,allies:[{armor:60}]});const ev=f.cast();
  const h=hits(ev);expect(h).toHaveLength(4);expect(h.every(x=>x.damage===magic+4)).toBe(true);
  for(let i=1;i<4;i++)expect(h[i].targetId).not.toBe(h[i-1].targetId);
  expect(f.loss().reduce((a,b)=>a+b,0)).toBe(4*(magic+4));turnSpent(f);
 });
 it('fixed L7-7344: with 2 living enemies the 4 hits alternate (2 each)',()=>{
  const f=setup({...C,magic:0,casterArmor:3,enemies:[{hp:0,defeated:true},{},{hp:0,defeated:true},{}]});const ev=f.cast();
  expect(hits(ev)).toHaveLength(4);expect(f.loss()).toEqual([0,6,0,6]);
 });
 it('fixed L7-7344: a single living enemy takes all 4 hits; [3:1] is 34% (armor 50 -> +17)',()=>{
  const f=setup({...C,magic:0,casterArmor:50,enemies:[{hp:0,defeated:true},{hp:0,defeated:true},{},{hp:0,defeated:true}]});const ev=f.cast();
  expect(hits(ev)).toHaveLength(4);expect(f.loss()[2]).toBe(4*(2+17));
 });
 it('armor absorbs normal damage; low mana / silence block',()=>{
  const f=setup({...C,magic:0,enemies:[{armor:1},{armor:1},{armor:1},{armor:1}]});const ev=f.cast();
  expect(hits(ev)).toHaveLength(4);expect(f.loss().reduce((a,b)=>a+b,0)+f.enemies.reduce((a,e)=>a+1-e.armor,0)).toBe(8);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6087 / spell 7157
describe('L7B02 troop:6087 spell 7157 scatter boosted by my armor [x2]',()=>{
 const C={spell:7157,cost:12,colors:[BaseColor.Blue,BaseColor.Green]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(6087,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 3] scatter damage, boosted by my Armor. [x2]');
  expect(steps).toEqual([
   {Target:'Self',Amount:200,Type:'CountArmor'},
   {SpellPowerMultiplier:1,Target:'AllEnemies',UseCounterForAmount:true,Amount:3,Primarypower:true,Type:'ScatterDamage'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyAll',scaling:{base:3,mult:1},range:'scatter',
   modifier:{mod:{kind:'multiplier',a:2},source:{kind:'selfStat',stat:'armor'}}}]});
  expect(t.spell.description).toBe('对所有敌人造成 [魔法 + 3] 点散射伤害。伤害值因自身的护甲值而增强。 [x2]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: one shared pool [Magic+3] + 2 x my armor 5`,()=>{
  const f=setup({...C,side,magic,casterArmor:5,allies:[{armor:40}]});const ev=f.cast();
  expect(f.loss().reduce((a,b)=>a+b,0)).toBe(magic+13);
  expect(hits(ev).every(h=>h.range==='scatter')).toBe(true);turnSpent(f);
 });
 it('my armor 0 -> no boost; ally armor is not my armor; every point multiplies by 2',()=>{
  for(const [casterArmor,pool] of [[0,3],[1,5],[9,21]] as const){
   const f=setup({...C,magic:0,casterArmor,allies:[{armor:30}]});f.cast();expect(f.loss().reduce((a,b)=>a+b,0)).toBe(pool);
  }
 });
 it('non-true scatter: enemy armor absorbs each share; dead enemies get nothing',()=>{
  const f=setup({...C,magic:0,casterArmor:6,enemies:[{hp:0,defeated:true},{armor:2},{armor:2},{armor:2}]});
  const before=f.enemies.map(e=>e.hp+e.armor);f.cast();
  const total=f.enemies.map((e,i)=>before[i]-e.hp-e.armor);
  expect(total[0]).toBe(0);expect(total.reduce((a,b)=>a+b,0)).toBe(15);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6595 / spell 7817
describe('L7B02 troop:6595 spell 7817 true damage boosted by the target armor [3:1]',()=>{
 const C={spell:7817,cost:12,colors:[BaseColor.Red,BaseColor.Brown]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(6595,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 1] true damage to an enemy, boosted by their Armor. [3:1]');
  expect(steps).toEqual([
   {Target:'FromTarget',Amount:34,Type:'CountArmor'},
   {SpellPowerMultiplier:1,Target:'FromTarget',UseCounterForAmount:true,Amount:1,Primarypower:true,Type:'TrueDamage'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:1,mult:1},trueDamage:true,
   modifier:{mod:{kind:'ratio',a:3,b:1},source:{kind:'targetStat',stat:'armor'}}}]});
  expect(t.spell.description).toBe('对一名敌人造成 [魔法 + 1] 点真实伤害，伤害值因其护甲值而增强。 [3:1]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: [Magic+1] + floor(target armor 11 / 3), armor untouched`,()=>{
  const f=setup({...C,side,magic,casterArmor:30,enemies:[{armor:90},{},{armor:11},{armor:90}]});f.cast();
  expect(f.loss()).toEqual([0,0,magic+1+3,0]);expect(f.enemies[2].armor).toBe(11);turnSpent(f);
 });
 it('only the chosen target armor counts: target armor 0 -> no boost even when others are armored; 2 -> 0; 3 -> 1',()=>{
  for(const [armor,dmg] of [[0,1],[2,1],[3,2],[30,11]] as const){
   const f=setup({...C,magic:0,casterArmor:50,enemies:[{armor:60},{armor:60},{armor},{armor:60}]});f.cast();
   expect(f.loss()).toEqual([0,0,dmg,0]);
  }
 });
 it('barrier blocks the true hit; low mana / silence block',()=>{
  const f=setup({...C,magic:5,enemies:[{},{},{armor:9,statuses:[{id:'barrier',turns:99}]},{}]});f.cast();
  expect(f.loss()).toEqual([0,0,0,0]);expect(f.enemies[2].armor).toBe(9);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6848 / spell 8267
describe('L7B02 troop:6848 spell 8267 true damage then 10% kill chance boosted by their armor [5:1]',()=>{
 const C={spell:8267,cost:13,colors:[BaseColor.Green,BaseColor.Red]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(6848,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe("Deal [Magic + 3] true damage to an Enemy. There's a 10% chance to kill them, boosted by their Armor. [5:1]");
  expect(steps).toEqual([
   {Target:'FromTarget',Amount:20,Type:'CountArmor'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:3,Primarypower:true,Type:'TrueDamage'},
   {Target:'FromTarget',UseCounterForAmount:true,Amount:10,Type:'LethalDamageConditional'}]);
  expect(proto).toEqual({segments:[
   {kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1},trueDamage:true},
   {kind:'damage',target:'enemyChosen',scaling:{base:0,mult:0},execute:true,chance:0.1,
    chanceBoost:{mod:{kind:'ratio',a:5,b:1},source:{kind:'targetStat',stat:'armor'}}}]});
  expect(t.spell.description).toBe('对一名敌人造成 [魔法 + 3] 点真实伤害。有 10% 的几率将其击杀，几率因其护甲值而增强。 [5:1]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: [Magic+3] true damage, failed kill roll leaves target alive (armor 12 -> 12%, roll 0.1201)`,()=>{
  const f=setup({...C,side,magic,enemies:[{},{},{armor:12},{}],rollAs:0.1201});const ev=f.cast();
  expect(f.loss()).toEqual([0,0,magic+3,0]);expect(f.enemies[2].armor).toBe(12);
  expect(ev.some(e=>e.type==='defeat')).toBe(false);turnSpent(f);
 });
 for(const side of SIDES)it(`real cast side=${side}: kill roll 0.1199 < 12% kills the target through armor`,()=>{
  const f=setup({...C,side,magic:10,enemies:[{},{},{armor:12},{}],rollAs:0.1199});const ev=f.cast();
  expect(f.enemies[2].defeated).toBe(true);expect(f.enemies[2].hp).toBe(0);
  expect(ev.filter(e=>e.type==='defeat')).toHaveLength(1);expect(f.loss()).toEqual([0,0,1000,0]);
 });
 it('base chance 10% with 0-4 armor (+0); armor 5 -> 11%; armor 450 -> 100%; only the target armor counts',()=>{
  const run=(armor:number,roll:number,others=0)=>{const f=setup({...C,magic:0,casterArmor:99,enemies:[{armor:others},{},{armor},{armor:others}],rollAs:roll});f.cast();return f.enemies[2].defeated;};
  expect(run(0,0.0999)).toBe(true);expect(run(4,0.1)).toBe(false);expect(run(0,0.1,400)).toBe(false);
  expect(run(5,0.1099)).toBe(true);expect(run(5,0.11)).toBe(false);
  expect(run(450,0.9999)).toBe(true);
 });
 it('target already killed by the true damage is not killed twice; barrier absorbs the damage hit',()=>{
  const a=setup({...C,magic:0,enemies:[{},{},{hp:3,maxHp:3},{}],rollAs:0});const ev=a.cast();
  expect(a.enemies[2].defeated).toBe(true);expect(ev.filter(e=>e.type==='defeat')).toHaveLength(1);
  const b=setup({...C,magic:4,enemies:[{},{},{statuses:[{id:'barrier',turns:99}]},{}],rollAs:0.99});b.cast();
  expect(b.loss()).toEqual([0,0,0,0]);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6889 / spell 8312
describe('L7B02 troop:6889 spell 8312 blue-count damage with Boss x ascension multiplier [x3]',()=>{
 const C={spell:8312,cost:12,colors:[BaseColor.Blue,BaseColor.Green]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(6889,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 4] damage to an Enemy, boosted by Blue Allies and Enemies. If they are a Boss, deal 3x - 5x damage, based on my Ascensions. [x3]');
  expect(steps).toEqual([
   {Target:'AllAllies',Amount:300,Type:'CountArmyColor',Data:'0'},
   {Target:'AllEnemies',UseCounterForAmount:true,Amount:300,Type:'CountArmyColor',Data:'0'},
   {SpellPowerMultiplier:1,Target:'FromTarget',StatusAmount:3,UseCounterForAmount:true,Amount:4,Primarypower:true,StatusModifier:'MultiplyForAscensionBoss',Type:'Damage'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1},
   modifier:{mod:{kind:'multiplier',a:3},sources:[{kind:'alliesOfColor',color:'Blue'},{kind:'enemiesOfColor',color:'Blue'}]},
   condMult:{times:3,cond:{kind:'allOf',of:[{kind:'targetRace',race:'Boss'},{kind:'ascended',min:3}]}}}]});
  expect(t.spell.description).toContain('3 到 5 倍');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: [Magic+4] + 3 x (2 Blue allies + 1 Blue enemy)`,()=>{
  const f=setup({...C,side,magic,allies:[{colors:[BaseColor.Blue,BaseColor.Red]},{colors:[BaseColor.Red]}],
   enemies:[{colors:[BaseColor.Blue]},{},{},{}]});f.cast();
  expect(f.loss()).toEqual([0,0,magic+4+9,0]);turnSpent(f);
 });
 it('Blue count variation: dead Blue enemy excluded; no other Blue -> caster only (+3)',()=>{
  const a=setup({...C,magic:0});a.cast();expect(a.loss()[2]).toBe(7);
  const b=setup({...C,magic:0,enemies:[{colors:[BaseColor.Blue],hp:0,defeated:true},{colors:[BaseColor.Blue]},{},{}]});b.cast();
  expect(b.loss()[2]).toBe(10);
 });
 it('repro L7-6889 source-dispute: Boss x1 without ascension, x3 at ascension 3 and still x3 at ascension 5',()=>{
  const base={...C,magic:0,enemies:[{},{},{troopTypes:['Boss']},{}]};
  const a=setup(base);a.cast();expect(a.loss()[2]).toBe(7);
  for(const asc of [3,5]){const f=setup(base);(f.state as {ascension?:number}).ascension=asc;f.cast();expect(f.loss()[2]).toBe(21);}
  blocked(C);
 });
});
