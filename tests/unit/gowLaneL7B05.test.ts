// Lane L7+L6 batch B05 (sa-L76): re-review of round-1 drafts after round-2 fixes
// troop:6352 (L7-6352-a fixed; L7-6352-b strength ranking still disputed), troop:7344 (L7-7344 fixed),
// troop:6549 (L6-6549 R001 fixed), troop:7833 (L6-7833 R001 fixed), weapon:1194 (R003 34% fixed).
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Independent saved native-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {SeededRNG} from '@engine/rng';
import {BaseColor,PlayerSide,type Character} from '@engine/types';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';

const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const rawWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const SIDES=[PlayerSide.Left,PlayerSide.Right] as const;
/** Scripted rolls: queued values first, then the seeded stream. */
class ScriptRng extends SeededRNG{constructor(private q:number[]){super(7);}override next(){return this.q.length?this.q.shift()!:super.next();}}

interface Opts{spell:number|string;cost:number;colors:BaseColor[];side?:PlayerSide;magic?:number;casterArmor?:number;
 allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number;rolls?:number[];seed?:number}
function setup(o:Opts){
 const side=o.side??PlayerSide.Left;
 const f=damageFixture(0,0,o.enemies??[{},{},{},{}]);
 Object.assign(f.caster,{skillId:String(o.spell),mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10,armor:o.casterArmor??0});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(20+i,{mana:0,...a}));
 const mine=[f.caster,...allies];
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=mine;f.state.activePlayer=side;}
 else f.state.teams.Left.characters=mine;
 const rng=o.rolls?new ScriptRng([...o.rolls]):o.seed!==undefined?new SeededRNG(o.seed):f.ctx.rng;
 const engine=new TurnEngine(f.state,rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.target??12));
 const opponent=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 const foes=[...f.enemies];const startHp=foes.map(e=>e.hp);
 return {...f,enemies:foes,engine,side,opponent,allies,cast:()=>engine.castSkill(f.caster.id),
  loss:()=>foes.map((e,i)=>startHp[i]-e.hp),order:()=>f.state.teams[opponent].characters.map(c=>c.id)};
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
  const magic=f.caster.magic;
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.loss()).toEqual([0,0,0,0]);expect(f.caster.mana).toBe(mode==='low-mana'?o.cost-1:o.cost);expect(f.caster.magic).toBe(magic);
 }
}
const hits=(ev:{type:string}[])=>ev.filter(e=>e.type==='skill-damage') as unknown as {targetId:number;damage:number}[];

// ---------------------------------------------------------------- troop:6352 / spell 7504
describe('L7B05 troop:6352 spell 7504 two strongest enemies boosted by my armor [2:1]',()=>{
 const C={spell:7504,cost:12,colors:[BaseColor.Blue,BaseColor.Red]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,steps,proto}=source(6352,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 1] damage to the 2 strongest enemies, boosted by my Armor. [2:1]');
  expect(n.Target).toBe('None');
  expect(steps).toEqual([
   {Target:'Self',Amount:50,Type:'CountArmor'},
   {SpellPowerMultiplier:1,Target:'TwoStrongestEnemies',UseCounterForAmount:true,Amount:1,Primarypower:true,Type:'Damage'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyHealthiestN',scaling:{base:1,mult:1},n:2,
   modifier:{mod:{kind:'ratio',a:2,b:1},source:{kind:'selfStat',stat:'armor'}}}]});
  expect(t.spell.description).toBe('对两名最强大的敌人造成 [魔法 + 1] 点伤害，伤害值因自身护甲值而增强。 [2:1]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: both highest-Life enemies take [Magic+1] + floor(my armor 7 / 2)`,()=>{
  const f=setup({...C,side,magic,casterArmor:7,allies:[{armor:50}],enemies:[{hp:600},{hp:900},{hp:300},{hp:800}]});
  f.cast();expect(f.loss()).toEqual([0,magic+4,0,magic+4]);turnSpent(f);
 });
 it('1 living enemy -> 1 hit; dead enemies never ranked; armor absorbs',()=>{
  const a=setup({...C,magic:0,enemies:[{hp:0,defeated:true},{hp:0,defeated:true},{hp:500},{hp:0,defeated:true}]});a.cast();
  expect(a.loss()).toEqual([0,0,1,0]);
  const b=setup({...C,magic:0,enemies:[{hp:900,armor:1},{hp:100},{hp:950},{hp:100}]});b.cast();
  expect(b.enemies[0].armor).toBe(0);expect(b.loss()).toEqual([0,0,1,0]);
 });
 it('R005 L7-6352-b: strength = current Life + Armor (11: 800+300 and 10: 900 are the two strongest)',()=>{
  const f=setup({...C,magic:0,enemies:[{hp:900},{hp:800,armor:300},{hp:850},{hp:100}]});
  f.cast();expect(f.loss()).toEqual([1,0,0,0]);expect(f.enemies[1].armor).toBe(299);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:7344 / spell 8969
describe('L7B05 troop:7344 spell 8969 four separate random hits boosted by my armor [3:1]',()=>{
 const C={spell:8969,cost:16,colors:[BaseColor.Yellow,BaseColor.Brown]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,steps,proto}=source(7344,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 2] damage to 4 random Enemies, boosted by my Armor. [3:1]');
  expect(n.Target).toBe('None');
  const hit=(target:string,extra:Record<string,unknown>)=>({SpellPowerMultiplier:1,Target:target,UseCounterForAmount:true,Amount:2,Type:'Damage',...extra});
  expect(steps).toEqual([
   {Target:'Self',Amount:34,Type:'CountArmor'},
   hit('RandomEnemy',{Primarypower:true,Delay:400,ResetTargets:true}),
   hit('RandomPrefNotPrevEnemy',{Delay:400,ResetTargets:true}),
   hit('RandomPrefNotPrevEnemy',{Delay:400,ResetTargets:true}),
   hit('RandomPrefNotPrevEnemy',{})]);
  const seg=(target:string)=>({kind:'damage',target,scaling:{base:2,mult:1},modifier:{mod:{kind:'ratio',a:3,b:1},source:{kind:'selfStat',stat:'armor'}}});
  expect(proto).toEqual({segments:[seg('enemyRandom'),seg('enemyRandomPrefNotPrev'),seg('enemyRandomPrefNotPrev'),seg('enemyRandomPrefNotPrev')]});
  expect(t.spell.description).toBe('对 4 名随机敌人造成 [魔法 + 2] 点伤害，伤害值因我的护甲值而增强。 [3:1]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: 4 hits of [Magic+2] + floor(armor 53 x 34%) = +18; no two consecutive hits on the same enemy`,()=>{
  const f=setup({...C,side,magic,casterArmor:53,allies:[{armor:60}]});const ev=f.cast();
  const h=hits(ev);expect(h).toHaveLength(4);expect(h.every(x=>x.damage===magic+2+18)).toBe(true);
  for(let i=1;i<4;i++)expect(h[i].targetId).not.toBe(h[i-1].targetId);turnSpent(f);
 });
 it('2 living -> alternate 2 hits each; 1 living -> all 4 hits; seeds reach every living enemy',()=>{
  const a=setup({...C,magic:0,enemies:[{hp:0,defeated:true},{},{hp:0,defeated:true},{}]});a.cast();expect(a.loss()).toEqual([0,4,0,4]);
  const b=setup({...C,magic:0,enemies:[{hp:0,defeated:true},{hp:0,defeated:true},{},{hp:0,defeated:true}]});b.cast();expect(b.loss()[2]).toBe(8);
  const seen=new Set<number>();
  for(let seed=1;seed<=12;seed++){const f=setup({...C,magic:0,seed});hits(f.cast()).forEach(x=>seen.add(x.targetId));}
  expect(seen).toEqual(new Set([10,11,12,13]));
 });
 it('an enemy killed by a hit is never selected again (Life 2 vs 2-damage hits)',()=>{
  for(let seed=1;seed<=6;seed++){
   const f=setup({...C,magic:0,seed,enemies:[{hp:0,defeated:true},{hp:2,maxHp:2},{hp:0,defeated:true},{}]});const ev=f.cast();
   const h=hits(ev);expect(h).toHaveLength(4);expect(h.filter(x=>x.targetId===11)).toHaveLength(1);expect(f.enemies[1].defeated).toBe(true);
  }
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6549 / spell 7743
describe('L7B05 troop:6549 spell 7743 steal 3 armor -> Magic, then [Magic+2] true damage (native order)',()=>{
 const C={spell:7743,cost:11,colors:[BaseColor.Yellow,BaseColor.Purple]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,steps,proto}=source(6549,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 2] true damage to an enemy. Steal 3 Armor and shift it to Magic. [1:1]');
  expect(n.Target).toBe('Enemy');
  expect(steps).toEqual([
   {Target:'FromTarget',Amount:100,Type:'CountArmor'},
   {Amount:3,Type:'CountMax'},
   {Target:'FromTarget',UseCounterForAmount:true,Type:'DecreaseArmor'},
   {Target:'Self',UseCounterForAmount:true,Type:'IncreaseSpellPower'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:2,Primarypower:true,Type:'TrueDamage'}]);
  expect(proto).toEqual({segments:[
   {kind:'reduce',target:'enemyChosen',stat:'armor',scaling:{base:3,mult:0},gainStat:'magic'},
   {kind:'damage',target:'enemyChosen',scaling:{base:2,mult:1},trueDamage:true}]});
  for(const s of ['[魔法 + 2] 点真实伤害','窃取 3 点护甲值','魔力值','[1:1]'])expect(t.spell.description).toContain(s);
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: armor 5 -> 2, caster Magic +3, then true damage (Magic+3)+2`,()=>{
  const f=setup({...C,side,magic,enemies:[{},{},{armor:5},{}]});f.cast();
  expect(f.enemies[2].armor).toBe(2);expect(f.caster.magic).toBe(magic+3);expect(f.caster.armor).toBe(0);
  expect(f.loss()).toEqual([0,0,magic+5,0]);turnSpent(f);
 });
 it('counter = min(armor, 3): armor 1 -> +1 Magic, damage magic+1+2; armor 0 -> no gain, plain [Magic+2]',()=>{
  const a=setup({...C,magic:4,enemies:[{},{},{armor:1},{}]});a.cast();expect(a.caster.magic).toBe(5);expect(a.loss()[2]).toBe(7);
  const b=setup({...C,magic:4});b.cast();expect(b.caster.magic).toBe(4);expect(b.loss()[2]).toBe(6);
 });
 it('true damage ignores armor and only hits the chosen enemy; low mana / silence block',()=>{
  const f=setup({...C,magic:0,enemies:[{armor:9},{armor:9},{armor:40},{armor:9}]});f.cast();
  expect(f.enemies.map(e=>e.armor)).toEqual([9,9,37,9]);expect(f.loss()).toEqual([0,0,5,0]);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:7833 / spell 10061
describe('L7B05 troop:7833 spell 10061 slay roll on pre-damage armor, [Magic+4] damage, pull to back [10:1]',()=>{
 const C={spell:10061,cost:17,colors:[BaseColor.Blue,BaseColor.Green]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,steps,proto}=source(7833,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 4] damage to an Enemy, then pull them to the back. There is a 10% chance to slay them, boosted by their Armor (up to 30%). [10:1]');
  expect(n.Target).toBe('Enemy');
  expect(steps).toEqual([
   {Target:'FromTarget',Amount:10,Type:'CountArmor'},
   {Amount:20,Type:'CountMax'},
   {Target:'FromTarget',UseCounterForAmount:true,Amount:10,Type:'LethalDamageConditional'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:4,Primarypower:true,Type:'Damage',Delay:400},
   {Target:'FromTarget',Type:'TroopOrderBack'}]);
  expect(proto).toEqual({segments:[
   {kind:'damage',target:'enemyChosen',scaling:{base:0,mult:0},execute:true,chance:0.1,chanceBoost:{mod:{kind:'ratio',a:10,b:1},source:{kind:'chosenStat',stat:'armor'},max:20}},
   {kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1}},
   {kind:'reposition',target:'lastTarget',to:'back'}]});
  for(const s of ['[魔法 + 4]','拉到后方','10%','最高可达30%','[10:1]'])expect(t.spell.description).toContain(s);
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: failed roll -> [Magic+4] damage, target pulled to the back`,()=>{
  const f=setup({...C,side,magic,rolls:[0.99]});f.cast();
  expect(f.loss()).toEqual([0,0,magic+4,0]);expect(f.enemies[2].defeated).toBe(false);
  expect(f.order()).toEqual([10,11,13,12]);turnSpent(f);
 });
 it('slay chance uses PRE-damage armor (R001): armor 100 -> 20%: roll 0.19 slays, 0.2001 does not (armor then 86)',()=>{
  const a=setup({...C,magic:10,rolls:[0.19],enemies:[{},{},{armor:100},{}]});a.cast();
  expect(a.enemies[2].defeated).toBe(true);expect(a.order()).toEqual([10,11,13]);
  const b=setup({...C,magic:10,rolls:[0.2001],enemies:[{},{},{armor:100},{}]});b.cast();
  expect(b.enemies[2].defeated).toBe(false);expect(b.enemies[2].armor).toBe(86);expect(b.order()).toEqual([10,11,13,12]);
 });
 it('base 10% at 0 armor (0.0999 slays, 0.1 not); cap 30% at armor 400 (0.2999 slays, 0.3001 not)',()=>{
  const r=(armor:number,roll:number)=>{const f=setup({...C,magic:0,rolls:[roll],enemies:[{},{},{armor},{}]});f.cast();return f.enemies[2].defeated;};
  expect([r(0,0.0999),r(0,0.1),r(400,0.2999),r(400,0.3001),r(99,0.1899),r(99,0.19)]).toEqual([true,false,true,false,true,false]);
  blocked({...C,rolls:[0]});
 });
});

// ---------------------------------------------------------------- weapon:1194 Fleshripper / spell 7752
describe('L7B05 weapon:1194 Fleshripper spell 7752 eliminate all armor, [Magic+4] boosted by armor eliminated [3:1]=34%',()=>{
 const C={spell:7752,cost:15,colors:[BaseColor.Red,BaseColor.Yellow]};
 it('English, native steps, numeric + gw_ binding, prototype and zh display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1194)!,w=weapons.find(v=>v.id===1194)!,n=native.get(7752).raw;
  expect(o).toMatchObject({SpellId:7752,ManaCost:15,ReferenceName:'Fleshripper'});
  expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorRed','ColorYellow']);
  expect(o.stats.spell).toMatchObject({id:7752,desc:'Eliminate all Armor from an Enemy. Deal [Magic + 4] damage, boosted by Armor eliminated. [3:1]'});
  expect(n).toMatchObject({Cost:15,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:34,Type:'CountArmor'},
   {Target:'FromTarget',Amount:10001,Type:'DecreaseArmor'},
   {SpellPowerMultiplier:1,Target:'FromTarget',UseCounterForAmount:true,Amount:4,Primarypower:true,Type:'Damage'}]);
  expect(w).toMatchObject({id:1194,referenceName:'Fleshripper',manaCost:15,manaColors:['Red','Yellow'],spell:{id:7752}});
  for(const s of ['全部护甲值','[魔法 + 4]','[3:1]'])expect(w.spell.description).toContain(s);
  const proto={segments:[{kind:'reduce',target:'enemyChosen',stat:'armor',scaling:{base:0,mult:0},drainAll:true},
   {kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1},modifier:{mod:{kind:'ratio',a:3,b:1},source:{kind:'lastReduce'}}}]};
  expect(registry.prototypes.get('7752')).toEqual(proto);expect(registry.prototypes.get('gw_Fleshripper')).toEqual(proto);
 });
 for(const side of SIDES)for(const spell of ['7752','gw_Fleshripper'])for(const magic of [0,10])
 it(`real cast ${side}/${spell}/magic=${magic}: armor 50 eliminated, Life loss [Magic+4] + floor(50 x 34%) = +17`,()=>{
  const f=setup({...C,spell,side,magic,enemies:[{armor:5},{},{armor:50},{}]});f.cast();
  expect(f.enemies[2].armor).toBe(0);expect(f.loss()).toEqual([0,0,magic+4+17,0]);expect(f.enemies[0].armor).toBe(5);
  expect(f.caster.armor).toBe(0);turnSpent(f);
 });
 it('R003 percentage boundaries: armor 2 -> +0, 3 -> +1, 30 -> +10, 53 -> +18 (floor(53/3) would be 17), 0 -> plain',()=>{
  for(const [armor,bonus] of [[2,0],[3,1],[30,10],[53,18],[0,0]] as const){
   const f=setup({...C,magic:6,enemies:[{},{},{armor},{}]});f.cast();expect(f.loss()[2]).toBe(10+bonus);
  }
  blocked(C);
 });
});
