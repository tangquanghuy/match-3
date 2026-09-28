// Lane L7+L6 batch B06 (sa-L76): R003 re-review ([3:1] = native Count* Amount 34%) for
// weapon:1199, weapon:1201, weapon:1204, weapon:1200 ("Eliminate all Armor" family) and troop:6320.
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
import {setGoldForSide,goldForSide} from '@engine/battleGold';
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
 const f=damageFixture(0,0,o.enemies??[{armor:4},{},{},{}]);
 Object.assign(f.caster,{skillId:String(o.spell),mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10,armor:o.casterArmor??0});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(20+i,{mana:0,...a}));
 const mine=[f.caster,...allies];
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=mine;f.state.activePlayer=side;}
 else f.state.teams.Left.characters=mine;
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.target??12));
 const opponent=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 const foes=[...f.enemies];const startHp=foes.map(e=>e.hp);
 return {...f,enemies:foes,engine,side,opponent,allies,target:foes[2],cast:()=>engine.castSkill(f.caster.id),
  loss:()=>foes.map((e,i)=>startHp[i]-e.hp)};
}
function turnSpent(f:ReturnType<typeof setup>){
 expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.opponent);
}
function blocked(o:Opts){
 for(const mode of ['low-mana','silence'] as const){
  const f=setup({...o,enemies:[{},{},{armor:30},{}]});
  if(mode==='low-mana')f.caster.mana=o.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  const snap=JSON.stringify([f.caster.attack,f.caster.magic,f.caster.hp,goldForSide(f.state,f.side)]);
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.loss()).toEqual([0,0,0,0]);expect(f.target.armor).toBe(30);expect(f.caster.mana).toBe(mode==='low-mana'?o.cost-1:o.cost);
  expect(JSON.stringify([f.caster.attack,f.caster.magic,f.caster.hp,goldForSide(f.state,f.side)])).toBe(snap);
 }
}
function weaponBinding(id:number,spell:number,ref:string,cost:number,colors:BaseColor[],english:string,steps:unknown[],proto:unknown,zh:string){
 it('English, native steps, numeric + gw_ binding, cost/colours, prototype and zh display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===id)!,w=weapons.find(v=>v.id===id)!,n=native.get(spell).raw;
  expect(o).toMatchObject({SpellId:spell,ManaCost:cost,ReferenceName:ref});
  expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colors.map(c=>`Color${c}`).sort());
  expect(o.stats.spell).toMatchObject({id:spell,desc:english});
  expect(n).toMatchObject({Cost:cost,Target:'Enemy'});expect(n.SpellSteps).toEqual(steps);
  expect(w).toMatchObject({id,referenceName:ref,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
  expect(w.spell.description).toBe(zh);
  expect(registry.prototypes.get(String(spell))).toEqual(proto);expect(registry.prototypes.get(`gw_${ref}`)).toEqual(proto);
 });
}
const drain={kind:'reduce',target:'enemyChosen',stat:'armor',scaling:{base:0,mult:0},drainAll:true};
const r3={mod:{kind:'ratio',a:3,b:1},source:{kind:'lastReduce'}};
const count=(Amount=34)=>[{Target:'FromTarget',Amount,Type:'CountArmor'},{Target:'FromTarget',Amount:10001,Type:'DecreaseArmor'}];
/** R003: floor(armor x 34 / 100); diverges from floor(armor / 3) at 50, 53, 56 ... */
const pct34=(armor:number)=>Math.floor(armor*34/100);

// ---------------------------------------------------------------- weapon:1199 Earth's Fury / spell 7757
describe("L7B06 weapon:1199 Earth's Fury spell 7757",()=>{
 const C={spell:7757,cost:15,colors:[BaseColor.Red,BaseColor.Brown]};
 weaponBinding(1199,7757,'EarthsFury',15,C.colors,'Eliminate all Armor from an Enemy, and deal [Magic + 5] damage. Give all Allies 2 Attack, boosted by Armor eliminated. [3:1]',
  [...count(),{SpellPowerMultiplier:1,Target:'FromTarget',Amount:5,Primarypower:true,Type:'Damage'},{Target:'AllAllies',UseCounterForAmount:true,Amount:2,Type:'IncreaseAttack'}],
  {segments:[drain,{kind:'damage',target:'enemyChosen',scaling:{base:5,mult:1}},{kind:'buff',target:'allyAll',stat:'attack',scaling:{base:2,mult:0},modifier:r3}]},
  '减除一名敌人全部护甲值，并造成 [魔法 + 5] 点伤害。给予所有盟友 2 点攻击力，数量因被减除的护甲值数而增强。 [3:1]');
 for(const side of SIDES)for(const spell of ['7757','gw_EarthsFury'])for(const magic of [0,10])
 it(`real cast ${side}/${spell}/magic=${magic}: armor 50 eliminated, [Magic+5] to Life, living allies +2+17 Attack`,()=>{
  const f=setup({...C,spell,side,magic,enemies:[{armor:4},{},{armor:50},{}],allies:[{attack:5},{attack:3,hp:0,defeated:true}]});f.cast();
  expect(f.target.armor).toBe(0);expect(f.loss()).toEqual([0,0,magic+5,0]);expect(f.enemies[0].armor).toBe(4);
  expect([f.caster.attack,...f.allies.map(a=>a.attack)]).toEqual([17+19,5+19,3]);turnSpent(f);
 });
 it('R003 boundaries: armor 0 -> +2, 2 -> +2, 3 -> +3, 53 -> +2+18',()=>{
  for(const armor of [0,2,3,53]){const f=setup({...C,magic:0,enemies:[{},{},{armor},{}]});f.cast();expect(f.caster.attack).toBe(17+2+pct34(armor));}
  expect(pct34(53)).toBe(18);
  blocked(C);
 });
});

// ---------------------------------------------------------------- weapon:1201 Trickster's Shot / spell 7759
describe("L7B06 weapon:1201 Trickster's Shot spell 7759",()=>{
 const C={spell:7759,cost:15,colors:[BaseColor.Green,BaseColor.Purple]};
 weaponBinding(1201,7759,'TrickstersShot',15,C.colors,'Eliminate all Armor from an Enemy, and deal [Magic + 3] damage. Gain 2 Magic, boosted by Armor eliminated. [3:1]',
  [...count(),{SpellPowerMultiplier:1,Target:'FromTarget',Amount:3,Primarypower:true,Type:'Damage'},{Target:'Self',UseCounterForAmount:true,Amount:2,Type:'IncreaseSpellPower'}],
  {segments:[drain,{kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1}},{kind:'buff',target:'allySelf',stat:'magic',scaling:{base:2,mult:0},modifier:r3}]},
  '减除一名敌人全部护甲值，并造成 [魔法 + 3] 点伤害。获得 2 点魔力值，数量因被减除的护甲值数而增强。 [3:1]');
 for(const side of SIDES)for(const spell of ['7759','gw_TrickstersShot'])for(const magic of [0,10])
 it(`real cast ${side}/${spell}/magic=${magic}: armor 50 eliminated, [Magic+3] with pre-gain Magic, then self +2+17 Magic only`,()=>{
  const f=setup({...C,spell,side,magic,enemies:[{armor:4},{},{armor:50},{}],allies:[{magic:6}]});f.cast();
  expect(f.target.armor).toBe(0);expect(f.loss()).toEqual([0,0,magic+3,0]);
  expect(f.caster.magic).toBe(magic+19);expect(f.allies[0].magic).toBe(6);turnSpent(f);
 });
 it('R003 boundaries 0/2/3/53; Web on caster blocks the Magic gain',()=>{
  for(const armor of [0,2,3,53]){const f=setup({...C,magic:5,enemies:[{},{},{armor},{}]});f.cast();expect(f.caster.magic).toBe(5+2+pct34(armor));}
  const w=setup({...C,magic:5,enemies:[{},{},{armor:30},{}]});w.caster.statuses=[{id:'web',turns:3}];w.cast();
  expect(w.caster.magic).toBe(5);expect(w.target.armor).toBe(0);
  blocked(C);
 });
});

// ---------------------------------------------------------------- weapon:1204 Golden Sun / spell 7799
describe('L7B06 weapon:1204 Golden Sun spell 7799',()=>{
 const C={spell:7799,cost:13,colors:[BaseColor.Yellow,BaseColor.Purple]};
 weaponBinding(1204,7799,'GoldenSun',13,C.colors,'Eliminate all Armor from an Enemy. Gain [Magic + 1] Gold, boosted by Armor eliminated. [3:1]',
  [...count(),{SpellPowerMultiplier:1,Target:'Self',UseCounterForAmount:true,Amount:1,Primarypower:true,Type:'GiveGold'}],
  {segments:[drain,{kind:'gainEconomy',currency:'gold',scaling:{base:1,mult:1},modifier:r3}]},
  '减除一名敌人全部护甲值。获得 [魔法 + 1] 黄金，数量因被减除的护甲值而增强。 [3:1]');
 for(const side of SIDES)for(const spell of ['7799','gw_GoldenSun'])for(const magic of [0,10])
 it(`real cast ${side}/${spell}/magic=${magic}: armor 50 eliminated, no damage, own side gold + magic+1+17`,()=>{
  const f=setup({...C,spell,side,magic,enemies:[{armor:4},{},{armor:50},{}]});
  setGoldForSide(f.state,f.side,3);setGoldForSide(f.state,f.opponent,11);const ev=f.cast();
  expect(f.target.armor).toBe(0);expect(f.loss()).toEqual([0,0,0,0]);
  expect(goldForSide(f.state,f.side)).toBe(3+magic+18);expect(goldForSide(f.state,f.opponent)).toBe(11);
  expect(ev.filter(e=>e.type==='skill-damage')).toHaveLength(0);turnSpent(f);
 });
 it('R003 boundaries 0/2/3/53',()=>{
  for(const armor of [0,2,3,53]){const f=setup({...C,magic:4,enemies:[{},{},{armor},{}]});setGoldForSide(f.state,f.side,0);f.cast();
   expect(goldForSide(f.state,f.side)).toBe(5+pct34(armor));}
  blocked(C);
 });
});

// ---------------------------------------------------------------- weapon:1200 Yasmine's Pride / spell 7758
describe("L7B06 weapon:1200 Yasmine's Pride spell 7758",()=>{
 const C={spell:7758,cost:15,colors:[BaseColor.Green,BaseColor.Brown]};
 weaponBinding(1200,7758,'YasminesPride',15,C.colors,'Eliminate all Armor from an Enemy. Give all Allies [Magic + 1] Life, boosted by Armor eliminated. [3:1]',
  [...count(),{SpellPowerMultiplier:1,Target:'AllAllies',UseCounterForAmount:true,Amount:1,Primarypower:true,Type:'IncreaseHealth'}],
  {segments:[drain,{kind:'buff',target:'allyAll',stat:'hp',scaling:{base:1,mult:1},modifier:r3,lifeMode:'gain'}]},
  '减除一名敌人全部护甲值。给予所有盟友 [魔法 + 1] 点生命值，数量因被减除的护甲值数而增强。 [3:1]');
 for(const side of SIDES)for(const spell of ['7758','gw_YasminesPride'])for(const magic of [0,10])
 it(`real cast ${side}/${spell}/magic=${magic}: armor 50 eliminated, each living ally +magic+1+17 Life and max Life`,()=>{
  const f=setup({...C,spell,side,magic,enemies:[{armor:4},{},{armor:50},{}],allies:[{hp:400,maxHp:500},{hp:0,defeated:true}]});const ev=f.cast();
  const g=magic+18;
  expect(f.target.armor).toBe(0);expect(f.loss()).toEqual([0,0,0,0]);
  expect([[f.caster.hp,f.caster.maxHp],[f.allies[0].hp,f.allies[0].maxHp],[f.allies[1].hp,f.allies[1].maxHp]]).toEqual([[1000+g,1000+g],[400+g,500+g],[0,1000]]);
  expect(ev.filter(e=>e.type==='skill-damage')).toHaveLength(0);turnSpent(f);
 });
 it('R003 boundaries 0/2/3/53',()=>{
  for(const armor of [0,2,3,53]){const f=setup({...C,magic:2,enemies:[{},{},{armor},{}]});f.cast();expect(f.caster.hp).toBe(1003+pct34(armor));}
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6320 / spell 7470
describe('L7B06 troop:6320 spell 7470 true scatter boosted by all armor [3:1]=34%',()=>{
 const C={spell:7470,cost:15,colors:[BaseColor.Blue,BaseColor.Red]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const o=original.find((t:{id:number})=>t.id===6320)!;const t=TROOPS.find(t=>t.id===6320)!;const n=native.get(7470).raw;
  expect(o.stats.spell).toMatchObject({id:7470,desc:'Deal 8 true scatter damage, boosted by all Ally and Enemy Armor. [3:1]'});
  expect(o.ManaCost).toBe(15);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorBlue','ColorRed']);
  expect(t).toMatchObject({id:6320,manaCost:15,manaColors:C.colors,spell:{id:7470}});
  expect(n).toMatchObject({Cost:15});
  expect(n.SpellSteps).toEqual([
   {Target:'AllEnemies',Amount:34,Type:'CountArmor'},
   {Target:'AllAllies',UseCounterForAmount:true,Amount:34,Type:'CountArmor'},
   {Target:'AllEnemies',UseCounterForAmount:true,Amount:8,Type:'TrueScatterDamage'}]);
  expect(registry.prototypes.get('7470')).toEqual({segments:[{kind:'damage',target:'enemyAll',scaling:{base:8,mult:0},range:'scatter',trueDamage:true,
   modifier:{mod:{kind:'ratio',a:3,b:1},sources:[{kind:'allyStatSum',stat:'armor'},{kind:'enemyStatSum',stat:'armor'}]}}]});
  expect(t.spell.description).toBe('造成 8 点真实散射伤害，伤害值因敌我双方的护甲值而增强。 [3:1]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: pool 8 + floor(10 x 34%) + floor(40 x 34%) = 24, magic-independent, true`,()=>{
  // R007-1 (sa-P P-counter-per-step): each native CountArmor floors separately: ally 7 + 3 = 10 -> 3, enemy 10 x 4 = 40 -> 13
  const f=setup({...C,side,magic,casterArmor:7,allies:[{armor:3}],enemies:[{armor:10},{armor:10},{armor:10},{armor:10}]});const ev=f.cast();
  expect(f.loss().reduce((a,b)=>a+b,0)).toBe(24);expect(f.enemies.map(e=>e.armor)).toEqual([10,10,10,10]);
  expect(ev.filter(e=>e.type==='skill-damage').every(e=>(e as unknown as {range:string}).range==='scatter')).toBe(true);
  turnSpent(f);
 });
 it('R003 boundaries on the summed count: 0 -> 8, 2 -> 8, 3 -> 9, 12 -> 12, 53 -> 26; dead troops armor excluded',()=>{
  for(const [casterArmor,enemyArmor,pool] of [[0,0,8],[2,0,8],[3,0,9],[0,12,12],[53,0,26]] as const){
   const f=setup({...C,casterArmor,enemies:[{armor:enemyArmor},{},{},{}]});f.cast();expect(f.loss().reduce((a,b)=>a+b,0)).toBe(pool);
  }
  const d=setup({...C,enemies:[{hp:0,defeated:true,armor:30},{hp:2,maxHp:2},{},{}],allies:[{armor:60,hp:0,defeated:true}]});d.cast();
  expect(d.loss()[0]).toBe(0);expect(d.loss().reduce((a,b)=>a+b,0)).toBe(8);
  blocked(C);
 });
});
