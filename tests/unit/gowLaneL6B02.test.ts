// Lane L6 batch B02 (reviewer sa-L6): per-entity source binding + real TurnEngine.castSkill evidence.
// Items: weapon:1110 Mang, weapon:1199 Earth's Fury, weapon:1201 Trickster's Shot,
//        weapon:1204 Golden Sun, weapon:1200 Yasmine's Pride (all "Eliminate all Armor" family).
// Expectations are hand-computed from the stored native SpellSteps. `it.fails` cases are minimal
// repros for the CountArmor Amount 34 (percent) vs [3:1] rounding question in lane-L6/issues.json.
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
// @ts-expect-error Independent saved native-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide,type Character} from '@engine/types';
import {setGoldForSide,goldForSide} from '@engine/battleGold';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';

const rawWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const SIDES=[PlayerSide.Left,PlayerSide.Right];

type Opts={skill:string;cost:number;colors:BaseColor[];magic:number;side:PlayerSide;armor?:number;allies?:Partial<Character>[];caster?:Partial<Character>};
function setup(o:Opts){
 const f=damageFixture(0,0,[{armor:4},{},{armor:o.armor??0},{}]);
 Object.assign(f.caster,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic,...(o.caster??{})});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(1+i,a));
 const team=[f.caster,...allies];
 if(o.side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=team;f.state.activePlayer=o.side;}
 else f.state.teams.Left.characters=team;
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(12));
 const target=f.enemies[2];
 return {...f,allies,target,cast:()=>engine.castSkill(f.caster.id)};
}
function colorKeys(colors:BaseColor[]){return colors.map(c=>`Color${c}`).sort();}
function expectSpent(f:ReturnType<typeof setup>,side:PlayerSide){
 expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
 expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
}
/** Other enemies untouched (enemy 10 keeps its 4 armor: single-target drain). */
function expectOthersUntouched(f:ReturnType<typeof setup>){
 expect([f.enemies[0],f.enemies[1],f.enemies[3]].map(e=>[e.hp,e.armor])).toEqual([[1000,4],[1000,0],[1000,0]]);
}
function bindingCase(id:number,spell:number,ref:string,cost:number,colors:BaseColor[],english:string,steps:unknown[],prototype:unknown,zh:string[]){
 it('source binding: English, native steps, cost/colours, numeric + gw_ aliases, zh text',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===id)!,w=weapons.find(v=>v.id===id)!,n=native.get(spell).raw;
  expect(o).toMatchObject({SpellId:spell,ManaCost:cost,ReferenceName:ref});
  expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colorKeys(colors));
  expect(o.stats.spell).toMatchObject({id:spell,desc:english});
  expect(n).toMatchObject({Id:spell,Cost:cost,Target:'Enemy'});
  expect(n.SpellSteps).toEqual(steps);
  expect(w).toMatchObject({id,referenceName:ref,manaCost:cost,manaColors:colors,spell:{id:spell}});
  for(const s of zh)expect(w.spell.description).toContain(s);
  expect(registry.prototypes.get(String(spell))).toEqual(prototype);
  expect(registry.prototypes.get(`gw_${ref}`)).toEqual(prototype);
 });
}
function blockedCases(skill:string,cost:number,colors:BaseColor[]){
 for(const mode of ['low-mana','silence'] as const)it(`${mode}: real cast blocked, armor kept, no mana/action consumed`,()=>{
  const f=setup({skill,cost,colors,magic:10,side:PlayerSide.Left,armor:30});
  if(mode==='low-mana')f.caster.mana=cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.caster.mana).toBe(mode==='low-mana'?cost-1:cost);
  expect([f.target.hp,f.target.armor]).toEqual([1000,30]);expect(f.caster.attack).toBe(17);
 });
}
const drain={kind:'reduce',target:'enemyChosen',stat:'armor',scaling:{base:0,mult:0},drainAll:true};
const r3={mod:{kind:'ratio',a:3,b:1},source:{kind:'lastReduce'}};

// ---------------------------------------------------------------- weapon:1110 Mang / spell 7247
describe('L6B02 weapon:1110 Mang / spell 7247',()=>{
 const C={cost:15,colors:[BaseColor.Red,BaseColor.Brown]};
 bindingCase(1110,7247,'Mang',15,C.colors,'Eliminate all Armor from an Enemy, then deal [Magic + 1] damage. Gain Attack equal to Armor eliminated. [1:1]',[
  {Target:'FromTarget',Amount:100,Type:'CountArmor'},
  {Target:'FromPrevious',Amount:10001,Type:'DecreaseArmor'},
  {SpellPowerMultiplier:1,Target:'FromPrevious',Amount:1,Primarypower:true,Type:'Damage'},
  {Target:'Self',UseCounterForAmount:true,Type:'IncreaseAttack'},
 ],{segments:[drain,{kind:'damage',target:'enemyChosen',scaling:{base:1,mult:1}},
  {kind:'buff',target:'allySelf',stat:'attack',scaling:{base:0,mult:0},modifier:{mod:{kind:'ratio',a:1,b:1},source:{kind:'lastReduce'}}}]},
 ['减除一名敌人全部护甲值','[魔法 + 1]','获得等同于减除的护甲值的攻击力']);
 for(const side of SIDES)for(const alias of ['7247','gw_Mang'])for(const magic of [0,10])
 it(`real cast ${side}/${alias}/magic=${magic}: armor 53 eliminated first, full [Magic+1] to hp, +53 Attack`,()=>{
  const f=setup({skill:alias,...C,magic,side,armor:53});f.cast();
  expect(f.target.armor).toBe(0);expect(1000-f.target.hp).toBe(magic+1);
  expect(f.caster.attack).toBe(17+53);expect(f.caster.armor).toBe(0);
  expectOthersUntouched(f);expectSpent(f,side);
 });
 it('boundary: target armor 0 -> no Attack gain, plain [Magic+1]; armor 1 -> +1',()=>{
  const a=setup({skill:'gw_Mang',...C,magic:4,side:PlayerSide.Left});a.cast();
  expect(a.caster.attack).toBe(17);expect(1000-a.target.hp).toBe(5);
  const b=setup({skill:'7247',...C,magic:4,side:PlayerSide.Right,armor:1});b.cast();
  expect(b.caster.attack).toBe(18);expect(b.target.armor).toBe(0);
 });
 it('lethal: target with 1 hp and 20 armor dies; Attack gain still equals armor eliminated',()=>{
  const f=setup({skill:'7247',...C,magic:0,side:PlayerSide.Left,armor:20});f.target.hp=1;
  const ev=f.cast();
  expect(ev.filter(e=>e.type==='defeat').map(e=>e.characterId)).toEqual([12]);
  expect(f.caster.attack).toBe(37);
 });
 blockedCases('gw_Mang',C.cost,C.colors);
});

// ---------------------------------------------------------------- weapon:1199 Earth's Fury / spell 7757
describe("L6B02 weapon:1199 Earth's Fury / spell 7757",()=>{
 const C={cost:15,colors:[BaseColor.Red,BaseColor.Brown]};
 bindingCase(1199,7757,'EarthsFury',15,C.colors,'Eliminate all Armor from an Enemy, and deal [Magic + 5] damage. Give all Allies 2 Attack, boosted by Armor eliminated. [3:1]',[
  {Target:'FromTarget',Amount:34,Type:'CountArmor'},
  {Target:'FromTarget',Amount:10001,Type:'DecreaseArmor'},
  {SpellPowerMultiplier:1,Target:'FromTarget',Amount:5,Primarypower:true,Type:'Damage'},
  {Target:'AllAllies',UseCounterForAmount:true,Amount:2,Type:'IncreaseAttack'},
 ],{segments:[drain,{kind:'damage',target:'enemyChosen',scaling:{base:5,mult:1}},
  {kind:'buff',target:'allyAll',stat:'attack',scaling:{base:2,mult:0},modifier:r3}]},
 ['减除一名敌人全部护甲值','[魔法 + 5]','给予所有盟友 2 点攻击力']);
 for(const side of SIDES)for(const magic of [0,10])
 it(`real cast ${side} magic=${magic}: armor 30 eliminated, [Magic+5] to hp, every living ally +2+10 Attack`,()=>{
  const f=setup({skill:side===PlayerSide.Left?'7757':'gw_EarthsFury',...C,magic,side,armor:30,allies:[{attack:5},{attack:9},{defeated:true,hp:0,attack:3}]});
  f.cast();
  expect(f.target.armor).toBe(0);expect(1000-f.target.hp).toBe(magic+5);
  expect([f.caster.attack,...f.allies.map(a=>a.attack)]).toEqual([29,17,21,3]);
  expectOthersUntouched(f);expectSpent(f,side);
 });
 it('boundary: armor 0 -> fixed +2 Attack; armor 2 -> floor(0.68)=0 -> still +2',()=>{
  const a=setup({skill:'gw_EarthsFury',...C,magic:0,side:PlayerSide.Left,allies:[{attack:1}]});a.cast();
  expect([a.caster.attack,a.allies[0].attack]).toEqual([19,3]);expect(1000-a.target.hp).toBe(5);
  const b=setup({skill:'7757',...C,magic:0,side:PlayerSide.Left,armor:2});b.cast();
  expect(b.caster.attack).toBe(19);expect(b.target.armor).toBe(0);
 });
 it('FIXED 1199-rounding (R003, sa-L76 round 2): native 34% of 50 armor = 17 -> allies +2+17 = +19 Attack',()=>{
  const f=setup({skill:'7757',...C,magic:0,side:PlayerSide.Left,armor:50});f.cast();
  expect(f.caster.attack).toBe(17+19);
 });
 blockedCases('7757',C.cost,C.colors);
});

// ---------------------------------------------------------------- weapon:1201 Trickster's Shot / spell 7759
describe("L6B02 weapon:1201 Trickster's Shot / spell 7759",()=>{
 const C={cost:15,colors:[BaseColor.Green,BaseColor.Purple]};
 bindingCase(1201,7759,'TrickstersShot',15,C.colors,'Eliminate all Armor from an Enemy, and deal [Magic + 3] damage. Gain 2 Magic, boosted by Armor eliminated. [3:1]',[
  {Target:'FromTarget',Amount:34,Type:'CountArmor'},
  {Target:'FromTarget',Amount:10001,Type:'DecreaseArmor'},
  {SpellPowerMultiplier:1,Target:'FromTarget',Amount:3,Primarypower:true,Type:'Damage'},
  {Target:'Self',UseCounterForAmount:true,Amount:2,Type:'IncreaseSpellPower'},
 ],{segments:[drain,{kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1}},
  {kind:'buff',target:'allySelf',stat:'magic',scaling:{base:2,mult:0},modifier:r3}]},
 ['减除一名敌人全部护甲值','[魔法 + 3]','获得 2 点魔力值']);
 for(const side of SIDES)for(const magic of [0,10])
 it(`real cast ${side} magic=${magic}: armor 30 eliminated, [Magic+3] with pre-gain Magic, then self +2+10 Magic only`,()=>{
  const f=setup({skill:side===PlayerSide.Left?'gw_TrickstersShot':'7759',...C,magic,side,armor:30,allies:[{magic:6}]});
  f.cast();
  // Damage (step 2) precedes IncreaseSpellPower (step 3): uses the old Magic.
  expect(f.target.armor).toBe(0);expect(1000-f.target.hp).toBe(magic+3);
  expect(f.caster.magic).toBe(magic+12);expect(f.allies[0].magic).toBe(6);
  expectOthersUntouched(f);expectSpent(f,side);
 });
 it('boundary: armor 0 -> +2 Magic only; Web on caster blocks the Magic gain',()=>{
  const a=setup({skill:'7759',...C,magic:5,side:PlayerSide.Left});a.cast();
  expect(a.caster.magic).toBe(7);expect(1000-a.target.hp).toBe(8);
  const b=setup({skill:'7759',...C,magic:5,side:PlayerSide.Left,armor:30,caster:{statuses:[{id:'web',turns:3}]}});b.cast();
  expect(b.caster.magic).toBe(5);expect(b.target.armor).toBe(0);
 });
 it('FIXED 1201-rounding (R003, sa-L76 round 2): native 34% of 50 armor = 17 -> self +2+17 = +19 Magic',()=>{
  const f=setup({skill:'7759',...C,magic:0,side:PlayerSide.Left,armor:50});f.cast();
  expect(f.caster.magic).toBe(19);
 });
 blockedCases('gw_TrickstersShot',C.cost,C.colors);
});

// ---------------------------------------------------------------- weapon:1204 Golden Sun / spell 7799
describe('L6B02 weapon:1204 Golden Sun / spell 7799',()=>{
 const C={cost:13,colors:[BaseColor.Yellow,BaseColor.Purple]};
 bindingCase(1204,7799,'GoldenSun',13,C.colors,'Eliminate all Armor from an Enemy. Gain [Magic + 1] Gold, boosted by Armor eliminated. [3:1]',[
  {Target:'FromTarget',Amount:34,Type:'CountArmor'},
  {Target:'FromTarget',Amount:10001,Type:'DecreaseArmor'},
  {SpellPowerMultiplier:1,Target:'Self',UseCounterForAmount:true,Amount:1,Primarypower:true,Type:'GiveGold'},
 ],{segments:[drain,{kind:'gainEconomy',currency:'gold',scaling:{base:1,mult:1},modifier:r3}]},
 ['减除一名敌人全部护甲值','获得 [魔法 + 1] 黄金']);
 for(const side of SIDES)for(const magic of [0,10])
 it(`real cast ${side} magic=${magic}: armor 30 eliminated, no damage, own side gold +magic+1+10`,()=>{
  const f=setup({skill:side===PlayerSide.Left?'7799':'gw_GoldenSun',...C,magic,side,armor:30});
  const opp=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
  setGoldForSide(f.state,side,3);setGoldForSide(f.state,opp,11);
  const ev=f.cast();
  expect(f.target.armor).toBe(0);expect(f.target.hp).toBe(1000);
  expect(goldForSide(f.state,side)).toBe(3+magic+11);expect(goldForSide(f.state,opp)).toBe(11);
  expect(ev.filter(e=>e.type==='skill-damage')).toHaveLength(0);
  expect(ev.filter(e=>e.type==='economy-gain').map(e=>[e.currency,e.amount,e.side])).toEqual([['gold',magic+11,side]]);
  expectOthersUntouched(f);expectSpent(f,side);
 });
 it('boundary: armor 0 -> [Magic+1] gold only; armor 2 -> 0 boost',()=>{
  const a=setup({skill:'gw_GoldenSun',...C,magic:4,side:PlayerSide.Left});setGoldForSide(a.state,PlayerSide.Left,0);a.cast();
  expect(goldForSide(a.state,PlayerSide.Left)).toBe(5);
  const b=setup({skill:'7799',...C,magic:4,side:PlayerSide.Left,armor:2});setGoldForSide(b.state,PlayerSide.Left,0);b.cast();
  expect(goldForSide(b.state,PlayerSide.Left)).toBe(5);expect(b.target.armor).toBe(0);
 });
 it('FIXED 1204-rounding (R003, sa-L76 round 2): native 34% of 50 armor = 17 -> gold +0+1+17 = 18',()=>{
  const f=setup({skill:'7799',...C,magic:0,side:PlayerSide.Left,armor:50});setGoldForSide(f.state,PlayerSide.Left,0);f.cast();
  expect(goldForSide(f.state,PlayerSide.Left)).toBe(18);
 });
 blockedCases('7799',C.cost,C.colors);
});

// ---------------------------------------------------------------- weapon:1200 Yasmine's Pride / spell 7758
describe("L6B02 weapon:1200 Yasmine's Pride / spell 7758",()=>{
 const C={cost:15,colors:[BaseColor.Green,BaseColor.Brown]};
 bindingCase(1200,7758,'YasminesPride',15,C.colors,'Eliminate all Armor from an Enemy. Give all Allies [Magic + 1] Life, boosted by Armor eliminated. [3:1]',[
  {Target:'FromTarget',Amount:34,Type:'CountArmor'},
  {Target:'FromTarget',Amount:10001,Type:'DecreaseArmor'},
  {SpellPowerMultiplier:1,Target:'AllAllies',UseCounterForAmount:true,Amount:1,Primarypower:true,Type:'IncreaseHealth'},
 ],{segments:[drain,{kind:'buff',target:'allyAll',stat:'hp',scaling:{base:1,mult:1},modifier:r3,lifeMode:'gain'}]},
 ['减除一名敌人全部护甲值','给予所有盟友 [魔法 + 1] 点生命值']);
 for(const side of SIDES)for(const magic of [0,10])
 it(`real cast ${side} magic=${magic}: armor 30 eliminated, each living ally gains magic+1+10 Life and max Life`,()=>{
  const f=setup({skill:side===PlayerSide.Left?'gw_YasminesPride':'7758',...C,magic,side,armor:30,allies:[{hp:400,maxHp:500},{defeated:true,hp:0}]});
  const ev=f.cast();const g=magic+11;
  expect(f.target.armor).toBe(0);expect(f.target.hp).toBe(1000);
  expect([f.caster.hp,f.caster.maxHp]).toEqual([1000+g,1000+g]);
  expect([f.allies[0].hp,f.allies[0].maxHp]).toEqual([400+g,500+g]);
  expect([f.allies[1].hp,f.allies[1].maxHp]).toEqual([0,1000]);
  expect(ev.filter(e=>e.type==='skill-damage')).toHaveLength(0);
  expectOthersUntouched(f);expectSpent(f,side);
 });
 it('boundary: armor 0 -> [Magic+1] Life only; armor 2 -> 0 boost',()=>{
  const a=setup({skill:'7758',...C,magic:2,side:PlayerSide.Left});a.cast();
  expect([a.caster.hp,a.caster.maxHp]).toEqual([1003,1003]);
  const b=setup({skill:'gw_YasminesPride',...C,magic:2,side:PlayerSide.Left,armor:2});b.cast();
  expect(b.caster.hp).toBe(1003);expect(b.target.armor).toBe(0);
 });
 it('FIXED 1200-rounding (R003, sa-L76 round 2): native 34% of 50 armor = 17 -> allies +0+1+17 = +18 Life',()=>{
  const f=setup({skill:'7758',...C,magic:0,side:PlayerSide.Left,armor:50});f.cast();
  expect(f.caster.hp).toBe(1018);
 });
 blockedCases('gw_YasminesPride',C.cost,C.colors);
});
