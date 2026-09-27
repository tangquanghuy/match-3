// Lane L7+L6 batch B07 (sa-L76): troop:6595 (R003 re-review), weapon:1603, troop:7045 (L7-7045 fixed),
// troop:6551, troop:6271.
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
import {goldForSide,setGoldForSide} from '@engine/battleGold';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';

const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const rawWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const SIDES=[PlayerSide.Left,PlayerSide.Right] as const;
const troopName=(id:number)=>TROOPS.find(t=>t.id===id)!.name;

interface Opts{spell:number|string;cost:number;colors:BaseColor[];side?:PlayerSide;magic?:number;casterArmor?:number;caster?:Partial<Character>;
 allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number}
function setup(o:Opts){
 const side=o.side??PlayerSide.Left;
 const f=damageFixture(0,0,o.enemies??[{},{},{},{}]);
 Object.assign(f.caster,{skillId:String(o.spell),mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10,armor:o.casterArmor??0,troopTypes:[],...(o.caster??{})});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(20+i,{mana:0,troopTypes:[],...a}));
 const mine=[f.caster,...allies];
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=mine;f.state.activePlayer=side;}
 else f.state.teams.Left.characters=mine;
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.target??12));
 const opponent=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 const foes=[...f.enemies];const startHp=foes.map(e=>e.hp);
 return {...f,enemies:foes,engine,side,opponent,allies,cast:()=>engine.castSkill(f.caster.id),
  loss:()=>foes.map((e,i)=>startHp[i]-e.hp),order:()=>f.state.teams[opponent].characters.map(c=>c.id),gold:()=>goldForSide(f.state,side)};
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
  const snap=JSON.stringify([f.caster.attack,f.caster.hp,f.gold(),f.allies.map(a=>[a.attack,a.hp]),f.order()]);
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.loss()).toEqual([0,0,0,0]);expect(f.caster.mana).toBe(mode==='low-mana'?o.cost-1:o.cost);
  expect(JSON.stringify([f.caster.attack,f.caster.hp,f.gold(),f.allies.map(a=>[a.attack,a.hp]),f.order()])).toBe(snap);
 }
}

// ---------------------------------------------------------------- troop:6595 / spell 7817
describe('L7B07 troop:6595 spell 7817 true damage boosted by the target armor [3:1]=34%',()=>{
 const C={spell:7817,cost:12,colors:[BaseColor.Red,BaseColor.Brown]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,steps,proto}=source(6595,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 1] true damage to an enemy, boosted by their Armor. [3:1]');
  expect(n.Target).toBe('Enemy');
  expect(steps).toEqual([
   {Target:'FromTarget',Amount:34,Type:'CountArmor'},
   {SpellPowerMultiplier:1,Target:'FromTarget',UseCounterForAmount:true,Amount:1,Primarypower:true,Type:'TrueDamage'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:1,mult:1},trueDamage:true,
   modifier:{mod:{kind:'ratio',a:3,b:1},source:{kind:'targetStat',stat:'armor'}}}]});
  expect(t.spell.description).toBe('对一名敌人造成 [魔法 + 1] 点真实伤害，伤害值因其护甲值而增强。 [3:1]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: target armor 50 -> +17 (34%), true damage leaves armor`,()=>{
  const f=setup({...C,side,magic,casterArmor:90,enemies:[{armor:70},{},{armor:50},{}]});f.cast();
  expect(f.loss()).toEqual([0,0,magic+1+17,0]);expect(f.enemies[2].armor).toBe(50);turnSpent(f);
 });
 it('R003 boundaries on the target own armor: 0 -> +0, 2 -> +0, 3 -> +1, 53 -> +18; other armor ignored',()=>{
  for(const [armor,bonus] of [[0,0],[2,0],[3,1],[53,18]] as const){
   const f=setup({...C,magic:0,casterArmor:60,enemies:[{armor:60},{},{armor},{}]});f.cast();expect(f.loss()[2]).toBe(1+bonus);
  }
  blocked(C);
 });
});

// ---------------------------------------------------------------- weapon:1603 Caprichor's Glaive / spell 9383
describe("L7B07 weapon:1603 Caprichor's Glaive spell 9383 light splash, knock back if Immortal Caprichor",()=>{
 const C={spell:9383,cost:20,colors:[BaseColor.Brown]};
 it('English, native steps, numeric + gw_ binding, prototype and zh display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1603)!,w=weapons.find(v=>v.id===1603)!,n=native.get(9383).raw;
  expect(o).toMatchObject({SpellId:9383,ManaCost:20,ReferenceName:'CaprichorsGlaive'});
  expect(Object.keys(o._ManaColors_parsed)).toEqual(['ColorBrown']);
  expect(o.stats.spell).toMatchObject({id:9383,desc:'Deal [(Magic x 2) + 3] light splash damage to the Enemy. If Immortal Caprichor is in my team, Knock them to the back.'});
  expect(n).toMatchObject({Target:'Enemy',Cost:20});
  expect(n.SpellSteps).toEqual([
   {Target:'AllAllies',Amount:10000,Type:'CountArmyTroop',Data:'7576'},
   {SpellPowerMultiplier:2,Target:'FromTarget',Amount:3,Primarypower:true,Type:'SplashDamage',Delay:800},
   {Target:'FromTarget',UseCounterForAmount:true,Type:'TroopOrderBackConditional'}]);
  expect(w).toMatchObject({id:1603,referenceName:'CaprichorsGlaive',manaCost:20,manaColors:['Brown'],spell:{id:9383}});
  const proto={segments:[{kind:'damage',target:'enemyChosen',scaling:{base:3,mult:2},range:'splash',splashRatio:0.25},
   {kind:'reposition',target:'lastTarget',to:'back',ifCond:{kind:'troopPresent',side:'ally',name:troopName(7576)}}]};
  expect(registry.prototypes.get('9383')).toEqual(proto);expect(registry.prototypes.get('gw_CaprichorsGlaive')).toEqual(proto);
  expect(original.find((t:{id:number})=>t.id===7576).name_localized).toBe('Immortal Caprichor');
  for(const s of ['[(魔法 x 2) + 3]',troopName(7576)])expect(w.spell.description).toContain(s);
 });
 for(const side of SIDES)for(const spell of ['9383','gw_CaprichorsGlaive'])for(const magic of [0,10])
 it(`real cast ${side}/${spell}/magic=${magic}: chosen 11 takes 2M+3, neighbours 10/12 floor(25%); Caprichor ally -> 11 knocked to the back`,()=>{
  const f=setup({...C,spell,side,magic,target:11,allies:[{name:troopName(7576)}]});f.cast();
  const d=2*magic+3;expect(f.loss()).toEqual([Math.floor(d*0.25),d,Math.floor(d*0.25),0]);
  expect(f.order()).toEqual([10,12,13,11]);turnSpent(f);
 });
 it('no / dead / enemy-side Caprichor -> no knock back; splash still dealt; first enemy has one neighbour',()=>{
  for(const o of [{},{allies:[{name:troopName(7576),hp:0,defeated:true}]},{enemies:[{name:troopName(7576)},{},{},{}]}]){
   const f=setup({...C,magic:0,target:11,...o});f.cast();expect(f.order()).toEqual([10,11,12,13]);expect(f.loss()[1]).toBe(3);
  }
  const g=setup({...C,magic:10,target:10});g.cast();expect(g.loss()).toEqual([23,5,0,0]);
  blocked({...C,allies:[{name:troopName(7576)}]});
 });
});

// ---------------------------------------------------------------- troop:7045 / spell 8570
describe('L7B07 troop:7045 spell 8570 first ally [Magic+1] Attack and Life, both boosted by Elementals/Elves/Green allies [x2]',()=>{
 const C={spell:8570,cost:13,colors:[BaseColor.Green,BaseColor.Brown]};
 const mod={mod:{kind:'multiplier',a:2},sources:[{kind:'alliesOfRace',race:'Elemental'},{kind:'alliesOfRace',race:'Elf'},{kind:'alliesOfColor',color:'Green'}]};
 it('English, native steps, binding, prototype (fixed L7-7045) and zh display',()=>{
  const {o,t,n,steps,proto}=source(7045,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Give [Magic + 1] Attack and Life to the first Ally, boosted by Elementals, Elves, and Green Allies. [x2]');
  expect(n.Target).toBe('None');
  expect(steps).toEqual([
   {Target:'AllAllies',Amount:200,Type:'CountArmyType',Data:'elemental'},
   {Target:'AllAllies',Amount:200,Type:'CountArmyType',Data:'elf'},
   {Target:'AllAllies',Amount:200,Type:'CountArmyColor',Data:'1'},
   {SpellPowerMultiplier:1,Target:'FrontAlly',UseCounterForAmount:true,Amount:1,Primarypower:true,Type:'IncreaseAttack'},
   {SpellPowerMultiplier:1,Target:'FrontAlly',UseCounterForAmount:true,Amount:1,Type:'IncreaseHealth'}]);
  expect(proto).toEqual({segments:[{kind:'buff',target:'allyFront',stat:'attack',scaling:{base:1,mult:1},modifier:mod},
   {kind:'buff',target:'allyFront',stat:'hp',scaling:{base:1,mult:1},modifier:mod,lifeMode:'gain'}]});
  expect(t.spell.description).toBe('给予第一位盟友 [魔法 + 1] 点攻击力和生命值，数值因元素、精灵和绿色盟友数而增强。 [x2]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: front ally (caster, Green) + Elf ally + Elemental&Green ally -> count 4 -> +[Magic+1]+8 Attack and Life`,()=>{
  const f=setup({...C,side,magic,allies:[{troopTypes:['Elf'],colors:[BaseColor.Red]},{troopTypes:['Elemental'],colors:[BaseColor.Green]}]});
  f.caster.hp=900;f.cast();const g=magic+1+8;
  expect([f.caster.attack,f.caster.hp,f.caster.maxHp]).toEqual([17+g,900+g,1000+g]);
  expect(f.allies.map(a=>[a.attack,a.hp])).toEqual([[17,1000],[17,1000]]);turnSpent(f);
 });
 it('counting: non-Green caster alone -> +0; dead Elf not counted; a non-caster front ally receives the buff',()=>{
  const a=setup({...C,magic:0,caster:{colors:[BaseColor.Red,BaseColor.Brown]}});a.caster.manaCost=13;a.cast();expect(a.caster.attack).toBe(18);
  const b=setup({...C,magic:0,caster:{colors:[BaseColor.Brown]},allies:[{troopTypes:['Elf'],hp:0,defeated:true}]});b.cast();expect(b.caster.attack).toBe(18);
  const c=setup({...C,magic:0,allies:[{troopTypes:['Elf'],colors:[BaseColor.Red]}]});
  c.state.teams[c.side].characters=[c.allies[0],c.caster];c.cast();
  expect([c.allies[0].attack,c.allies[0].maxHp]).toEqual([17+1+4,1000+1+4]);expect(c.caster.attack).toBe(17);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6551 / spell 7745
describe('L7B07 troop:6551 spell 7745 damage boosted by allied Fey and Beasts [x4], gain 5 Souls',()=>{
 const C={spell:7745,cost:12,colors:[BaseColor.Green,BaseColor.Brown]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,steps,proto}=source(6551,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 3] damage to an enemy, boosted by allied Fey and Beasts. Gain 5 Souls. [x4]');
  expect(n.Target).toBe('Enemy');
  expect(steps).toEqual([
   {Target:'AllAllies',Amount:400,Type:'CountArmyType',Data:'beast'},
   {Target:'AllAllies',UseCounterForAmount:true,Amount:400,Type:'CountArmyType',Data:'fey'},
   {SpellPowerMultiplier:1,Target:'FromTarget',UseCounterForAmount:true,Amount:3,Primarypower:true,Type:'Damage'},
   {Target:'Self',Amount:5,Type:'GiveSouls'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1},
   modifier:{mod:{kind:'multiplier',a:4},sources:[{kind:'alliesOfRace',race:'Fey'},{kind:'alliesOfRace',race:'Beast'}]}},
   {kind:'gainEconomy',currency:'souls',scaling:{base:5,mult:0}}]});
  expect(t.spell.description).toBe('对一名敌人造成 [魔法 + 3] 点伤害，伤害值因已方的妖仙和野兽盟友数而增强。获得 5 个灵魂。 [x4]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: caster Fey&Beast (2) + Beast ally (1) -> +12; +5 Souls`,()=>{
  const f=setup({...C,side,magic,caster:{troopTypes:['Fey','Beast']},allies:[{troopTypes:['Beast']},{troopTypes:['Elf']}],enemies:[{troopTypes:['Beast']},{},{},{}]});
  const souls0=f.state.economy.souls??0;f.cast();
  expect(f.loss()).toEqual([0,0,magic+3+12,0]);turnSpent(f);
  if(side===PlayerSide.Left)expect((f.state.economy.souls??0)-souls0).toBe(5);
 });
 it('no Fey/Beast -> plain [Magic+3]; dead Beast not counted; enemy Beasts not counted; armor absorbs; low mana / silence block',()=>{
  const a=setup({...C,magic:0});a.cast();expect(a.loss()[2]).toBe(3);
  const b=setup({...C,magic:0,allies:[{troopTypes:['Beast'],hp:0,defeated:true}],enemies:[{troopTypes:['Fey']},{},{armor:2},{}]});b.cast();
  expect(b.enemies[2].armor).toBe(0);expect(b.loss()[2]).toBe(1);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:6271 / spell 7417
describe('L7B07 troop:6271 spell 7417 allied Rogues +[Magic+1] Attack; 10 Gold boosted by allied Rogues [x5]',()=>{
 const C={spell:7417,cost:11,colors:[BaseColor.Blue,BaseColor.Yellow]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,steps,proto}=source(6271,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe('All allied Rogues gain [Magic + 1] Attack. Give 10 Gold, boosted by allied Rogues. [x5]');
  expect(n.Target).toBe('None');
  expect(steps).toEqual([
   {Target:'AllAllies',Amount:500,Type:'CountArmyType',Data:'rogue'},
   {SpellPowerMultiplier:1,Target:'AllyType',Amount:1,Primarypower:true,Type:'IncreaseAttack',Data:'rogue'},
   {UseCounterForAmount:true,Amount:10,Type:'GiveGold'}]);
  expect(proto).toEqual({segments:[{kind:'buff',target:'allyAll',stat:'attack',scaling:{base:1,mult:1},targetRace:'Rogue'},
   {kind:'gainEconomy',currency:'gold',scaling:{base:10,mult:0},modifier:{mod:{kind:'multiplier',a:5},source:{kind:'alliesOfRace',race:'Rogue'}}}]});
  expect(t.spell.description).toBe('所有盟友盗贼获得 [魔法 + 1] 点攻击力。给予 10 黄金，黄金数量因盟友盗贼数而增强。 [x5]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: 2 living Rogue allies (caster + 1) +[Magic+1] Attack; gold 10 + 5x2`,()=>{
  const f=setup({...C,side,magic,caster:{troopTypes:['Rogue']},allies:[{troopTypes:['Rogue']},{troopTypes:['Knight']}],enemies:[{troopTypes:['Rogue']},{},{},{}]});
  setGoldForSide(f.state,f.side,0);setGoldForSide(f.state,f.opponent,7);f.cast();
  expect([f.caster.attack,...f.allies.map(a=>a.attack)]).toEqual([17+magic+1,17+magic+1,17]);expect(f.enemies[0].attack).toBe(17);
  expect(f.gold()).toBe(20);expect(goldForSide(f.state,f.opponent)).toBe(7);turnSpent(f);
 });
 it('no Rogue -> no Attack, 10 gold; dead Rogue neither buffed nor counted; low mana / silence block',()=>{
  const a=setup({...C,magic:3});setGoldForSide(a.state,a.side,0);a.cast();expect(a.caster.attack).toBe(17);expect(a.gold()).toBe(10);
  const b=setup({...C,magic:3,allies:[{troopTypes:['Rogue'],hp:0,defeated:true,attack:4}]});setGoldForSide(b.state,b.side,0);b.cast();
  expect(b.allies[0].attack).toBe(4);expect(b.gold()).toBe(10);
  blocked(C);
 });
});
