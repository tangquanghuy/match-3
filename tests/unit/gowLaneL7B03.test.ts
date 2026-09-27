// Lane L7+L6 batch B03 (sa-L76): per-entity source/prototype binding and real castSkill evidence
// for troop:7501, troop:6889, troop:6803 (Boss/Tower x ascension clauses waived per R000),
// weapon:1075, troop:6211.
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
import weapons from '../../src/data/weapons.json';

const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const rawWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const SIDES=[PlayerSide.Left,PlayerSide.Right] as const;

interface Opts{spell:number|string;cost:number;colors:BaseColor[];side?:PlayerSide;magic?:number;casterArmor?:number;
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
  expect(f.loss()).toEqual([0,0,0,0]);expect(f.caster.mana).toBe(mode==='low-mana'?o.cost-1:o.cost);
 }
}

// ---------------------------------------------------------------- troop:7501 / spell 9246
describe('L7B03 troop:7501 spell 9246 ally-armor damage [4:1] (Boss x ascension clause waived R000)',()=>{
 const C={spell:9246,cost:12,colors:[BaseColor.Blue,BaseColor.Red]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(7501,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 4] damage to an Enemy, boosted by all Ally Armor. If they are a Boss, deal 3x - 5x damage, based on my Ascensions. [4:1]');
  expect(steps).toEqual([
   {Target:'AllAllies',Amount:25,Type:'CountArmor'},
   {SpellPowerMultiplier:1,Target:'FromTarget',StatusAmount:3,UseCounterForAmount:true,Amount:4,Primarypower:true,StatusModifier:'MultiplyForAscensionBoss',Type:'Damage'}]);
  expect(native.get(C.spell).raw).toMatchObject({Target:'Enemy',Cost:12});
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1},
   modifier:{mod:{kind:'ratio',a:4,b:1},source:{kind:'allyStatSum',stat:'armor'}},
   condMult:{times:3,cond:{kind:'allOf',of:[{kind:'targetRace',race:'Boss'},{kind:'ascended',min:3}]}}}]});
  expect(t.spell.description).toBe('对一名敌人造成 [魔法 + 4] 点伤害，伤害值因所有盟友护甲值数而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [4:1]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: [Magic+4] + floor(ally armor 13 / 4) to the chosen enemy only`,()=>{
  const f=setup({...C,side,magic,casterArmor:5,allies:[{armor:4},{armor:4}],enemies:[{armor:0},{},{},{armor:0}]});f.cast();
  expect(f.loss()).toEqual([0,0,magic+4+3,0]);turnSpent(f);
 });
 it('ratio boundaries: 3 ally armor -> +0, 4 -> +1; dead ally and enemy armor not counted',()=>{
  for(const [armor,bonus] of [[3,0],[4,1],[8,2]] as const){const f=setup({...C,magic:0,casterArmor:armor});f.cast();expect(f.loss()[2]).toBe(4+bonus);}
  const d=setup({...C,magic:0,casterArmor:0,allies:[{armor:40,hp:0,defeated:true}],enemies:[{armor:40},{},{},{}]});d.cast();
  expect(d.loss()[2]).toBe(4);
 });
 it('target armor absorbs first; barrier blocks; low mana / silence block (waived Boss multiplier not asserted)',()=>{
  const a=setup({...C,magic:0,casterArmor:4,enemies:[{},{},{armor:2},{}]});a.cast();
  expect(a.enemies[2].armor).toBe(0);expect(a.loss()[2]).toBe(3);
  const b=setup({...C,magic:0,enemies:[{},{},{statuses:[{id:'barrier',turns:99}]},{}]});b.cast();expect(b.loss()).toEqual([0,0,0,0]);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6889 / spell 8312
describe('L7B03 troop:6889 spell 8312 blue-count damage [x3] (Boss x ascension clause waived R000)',()=>{
 const C={spell:8312,cost:12,colors:[BaseColor.Blue,BaseColor.Green]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(6889,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 4] damage to an Enemy, boosted by Blue Allies and Enemies. If they are a Boss, deal 3x - 5x damage, based on my Ascensions. [x3]');
  expect(steps).toEqual([
   {Target:'AllAllies',Amount:300,Type:'CountArmyColor',Data:'0'},
   {Target:'AllEnemies',UseCounterForAmount:true,Amount:300,Type:'CountArmyColor',Data:'0'},
   {SpellPowerMultiplier:1,Target:'FromTarget',StatusAmount:3,UseCounterForAmount:true,Amount:4,Primarypower:true,StatusModifier:'MultiplyForAscensionBoss',Type:'Damage'}]);
  expect(native.get(C.spell).raw).toMatchObject({Target:'Enemy',Cost:12});
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1},
   modifier:{mod:{kind:'multiplier',a:3},sources:[{kind:'alliesOfColor',color:'Blue'},{kind:'enemiesOfColor',color:'Blue'}]},
   condMult:{times:3,cond:{kind:'allOf',of:[{kind:'targetRace',race:'Boss'},{kind:'ascended',min:3}]}}}]});
  expect(t.spell.description).toBe('对一名敌人造成 [魔法 + 4] 伤害，伤害值因蓝色盟友和敌人数而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [x3]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: [Magic+4] + 3 x (caster + 1 Blue ally + 2 Blue enemies)`,()=>{
  const f=setup({...C,side,magic,allies:[{colors:[BaseColor.Blue,BaseColor.Red]},{colors:[BaseColor.Red]}],
   enemies:[{colors:[BaseColor.Blue]},{},{},{colors:[BaseColor.Blue,BaseColor.Purple]}]});f.cast();
  expect(f.loss()).toEqual([0,0,magic+4+12,0]);turnSpent(f);
 });
 it('count variation: non-Blue caster not counted; dead Blue ally/enemy excluded',()=>{
  const a=setup({...C,magic:0,colors:[BaseColor.Green,BaseColor.Red],enemies:[{colors:[BaseColor.Blue]},{},{},{}]});
  a.caster.manaCost=12;a.cast();expect(a.loss()[2]).toBe(4+3);
  const b=setup({...C,magic:0,allies:[{colors:[BaseColor.Blue],hp:0,defeated:true}],enemies:[{colors:[BaseColor.Blue],hp:0,defeated:true},{},{},{}]});
  b.cast();expect(b.loss()[2]).toBe(4+3);
 });
 it('armor absorbs normal damage; low mana / silence block (waived Boss multiplier not asserted)',()=>{
  const f=setup({...C,magic:0,enemies:[{},{},{armor:5},{}]});f.cast();
  expect(f.enemies[2].armor).toBe(0);expect(f.loss()[2]).toBe(2);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6803 / spell 8206
describe('L7B03 troop:6803 spell 8206 steal 4 armor -> attack, [Magic+4] damage (Tower x ascension waived R000)',()=>{
 const C={spell:8206,cost:12,colors:[BaseColor.Blue,BaseColor.Green]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(6803,C.spell,C.cost,[...C.colors]);
  expect(o.stats.spell.desc).toBe('Steal 4 Armor, then shift it to Attack. Deal [Magic + 4] damage to an Enemy. If they are a Tower, deal 3x - 5x damage, based on my Ascensions.  [1:1]');
  expect(steps).toEqual([
   {Target:'FromTarget',Amount:100,Type:'CountArmor'},
   {Amount:4,Type:'CountMax'},
   {Target:'FromTarget',UseCounterForAmount:true,Type:'StealArmor'},
   {Target:'Self',UseCounterForAmount:true,Type:'IncreaseAttack'},
   {SpellPowerMultiplier:1,Target:'FromTarget',StatusAmount:3,Amount:4,Primarypower:true,StatusModifier:'MultiplyForAscensionCastle',Type:'Damage'}]);
  expect(proto).toEqual({segments:[
   {kind:'reduce',target:'enemyChosen',stat:'armor',scaling:{base:4,mult:0},gainStat:'attack'},
   {kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1},condMult:{times:3,cond:{kind:'allOf',of:[{kind:'targetRace',race:'Castle'},{kind:'ascended',min:3}]}}}]});
  expect(t.spell.description).toBe('窃取 4 点护甲值，并将其转换成攻击力。对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [1:1]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: target armor 10 -> -4 stolen, caster +4 Attack, then [Magic+4] hits remaining armor 6`,()=>{
  const f=setup({...C,side,magic,enemies:[{},{},{armor:10},{}]});f.cast();
  const dmg=magic+4;
  expect(f.caster.attack).toBe(17+4);expect(f.caster.armor).toBe(0);
  expect(f.enemies[2].armor).toBe(Math.max(0,6-dmg));expect(f.loss()).toEqual([0,0,Math.max(0,dmg-6),0]);
  turnSpent(f);
 });
 it('CountMax 4 cap and counter: armor 2 -> only 2 stolen/+2 Attack; armor 0 -> +0 Attack; damage goes straight to Life',()=>{
  const a=setup({...C,magic:0,enemies:[{},{},{armor:2},{}]});a.cast();
  expect(a.caster.attack).toBe(19);expect(a.enemies[2].armor).toBe(0);expect(a.loss()[2]).toBe(4);
  const b=setup({...C,magic:0});b.cast();expect(b.caster.attack).toBe(17);expect(b.loss()[2]).toBe(4);
 });
 it('only the chosen enemy loses armor; low mana / silence block (waived Tower multiplier not asserted)',()=>{
  const f=setup({...C,magic:0,enemies:[{armor:9},{armor:9},{armor:9},{armor:9}]});f.cast();
  expect(f.enemies.map(e=>e.armor)).toEqual([9,9,1,9]);expect(f.loss()).toEqual([0,0,0,0]);
  blocked(C);
 });
});

// ---------------------------------------------------------------- weapon:1075 Golden Cog / spell 7188
describe('L7B03 weapon:1075 Golden Cog spell 7188 give an ally armor equal to its armor [1:1]',()=>{
 const C={spell:7188,cost:15,colors:[BaseColor.Red,BaseColor.Yellow]};
 it('English, native steps, numeric + gw_ binding, cost/colours, prototype and zh display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1075)!,w=weapons.find(v=>v.id===1075)!,n=native.get(C.spell).raw;
  expect(o).toMatchObject({SpellId:7188,ManaCost:15,ReferenceName:'GoldenCog'});
  expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorRed','ColorYellow']);
  expect(o.stats.spell).toMatchObject({id:7188,desc:'Give Armor to an Ally equal to their current Armor. [1:1]'});
  expect(n).toMatchObject({Target:'Ally',Cost:15});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:100,Type:'CountArmor'},
   {Target:'FromTarget',UseCounterForAmount:true,Type:'IncreaseArmor'}]);
  expect(w).toMatchObject({id:1075,referenceName:'GoldenCog',manaCost:15,manaColors:['Red','Yellow'],spell:{id:7188}});
  expect(w.spell.description).toBe('使 1 名盟友的护甲值翻倍。 [1:1]');
  const proto={segments:[{kind:'buff',target:'allyChosen',stat:'armor',scaling:{base:0,mult:0},double:true}]};
  expect(registry.prototypes.get('7188')).toEqual(proto);expect(registry.prototypes.get('gw_GoldenCog')).toEqual(proto);
 });
 for(const side of SIDES)for(const alias of ['7188','gw_GoldenCog'])for(const magic of [0,10])
 it(`real cast ${side}/${alias}/magic=${magic}: chosen ally armor 13 -> 26 (1:1 of its own armor, magic-independent)`,()=>{
  const f=setup({...C,spell:alias,side,magic,casterArmor:7,allies:[{armor:13},{armor:5}],target:20});f.cast();
  expect(f.allies.map(a=>a.armor)).toEqual([26,5]);expect(f.caster.armor).toBe(7);
  expect(f.enemies.map(e=>e.armor)).toEqual([0,0,0,0]);turnSpent(f);
 });
 it('self target doubles own armor; 0 armor -> stays 0; dead ally not chosen as beneficiary',()=>{
  const a=setup({...C,casterArmor:9,target:0});a.cast();expect(a.caster.armor).toBe(18);
  const b=setup({...C,allies:[{armor:0}],target:20});b.cast();expect(b.allies[0].armor).toBe(0);turnSpent(b);
  const c=setup({...C,allies:[{armor:30,hp:0,defeated:true}],target:20});c.cast();expect(c.allies[0].armor).toBe(30);
 });
 it('low mana / silence block the cast',()=>blocked({...C,allies:[{armor:4}],target:20}));
});

// ---------------------------------------------------------------- troop:6211 / spell 7353
describe('L7B03 troop:6211 spell 7353 ally armor +[Magic+1] then scatter equal to that armor [1:1]',()=>{
 const C={spell:7353,cost:13,colors:[BaseColor.Green,BaseColor.Brown]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,steps,proto}=source(6211,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe("Give [Magic + 1] Armor to an Ally. Deal scatter damage equal to the Ally's Armor. [1:1]");
  expect(native.get(C.spell).raw).toMatchObject({Target:'Ally',Cost:13});
  expect(steps).toEqual([
   {Target:'FromTarget',Amount:100,Type:'CountArmor'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:1,Primarypower:true,Type:'IncreaseArmor'},
   {SpellPowerMultiplier:1,Target:'AllEnemies',UseCounterForAmount:true,Amount:1,Type:'ScatterDamage'}]);
  expect(proto).toEqual({segments:[{kind:'buff',target:'allyChosen',stat:'armor',scaling:{base:1,mult:1}},
   {kind:'damage',target:'enemyAll',scaling:{base:0,mult:0},range:'scatter',modifier:{mod:{kind:'ratio',a:1,b:1},source:{kind:'chosenStat',stat:'armor'}}}]});
  expect(t.spell.description).toBe('给予一名盟友 [魔法 + 1] 点护甲值。造成散射伤害，伤害值等同于盟友护甲值。 [1:1]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: chosen ally gains [Magic+1] Armor, other allies/caster untouched`,()=>{
  const f=setup({...C,side,magic,casterArmor:40,allies:[{armor:5},{armor:70}],target:20});f.cast();
  expect(f.allies[0].armor).toBe(5+magic+1);expect(f.allies[1].armor).toBe(70);expect(f.caster.armor).toBe(40);
  turnSpent(f);
 });
 // L7-6211 fixed (sa-L76 round 2): scatter pool reads the chosen ally's armor (chosenStat).
 for(const side of SIDES)for(const magic of [0,10])it(`fixed L7-6211 side=${side} magic=${magic}: scatter pool = ally armor 5 + [Magic+1] (native pre-buff counter + Amount 1 + Magic)`,()=>{
  const f=setup({...C,side,magic,casterArmor:40,allies:[{armor:5},{armor:70}],target:20,enemies:[{armor:3},{armor:30},{},{}]});
  const start=f.enemies.map(e=>e.hp+e.armor);const ev=f.cast();
  const removed=f.enemies.reduce((a,e,i)=>a+start[i]-e.hp-e.armor,0);
  expect(removed).toBe(5+magic+1);
  expect(ev.filter(e=>e.type==='skill-damage').every(e=>(e as unknown as {range:string}).range==='scatter')).toBe(true);
  turnSpent(f);
 });
 it('R001 order equivalence: pre-buff counter + [Magic+1] equals post-buff armor for ally armor 0 / 1 / 33',()=>{
  for(const armor of [0,1,33]){
   const f=setup({...C,magic:3,allies:[{armor}],target:20});f.cast();
   expect(f.allies[0].armor).toBe(armor+4);expect(f.loss().reduce((a,b)=>a+b,0)).toBe(armor+4);
  }
 });
 it('scatter never hits dead enemies; caster/other-ally armor not the source; low mana / silence block',()=>{
  const f=setup({...C,magic:0,casterArmor:90,allies:[{armor:7},{armor:90}],target:20,enemies:[{hp:0,defeated:true},{},{},{}]});f.cast();
  expect(f.loss()[0]).toBe(0);expect(f.loss().reduce((a,b)=>a+b,0)).toBe(8);
  blocked({...C,allies:[{armor:4}],target:20});
 });
});
