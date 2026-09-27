// Lane L7+L6 batch B04 (sa-L76): per-entity source/prototype binding and real castSkill evidence
// for troop:7517 (split difference L7-7517 fixed in round 2), troop:6694 (Tower clause waived R000),
// weapon:1476, weapon:1473, weapon:1721 (named-troop conditional bonuses).
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
import {goldForSide} from '@engine/battleGold';
import {SeededRNG} from '@engine/rng';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';

const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const rawWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const SIDES=[PlayerSide.Left,PlayerSide.Right] as const;
const troopName=(id:number)=>TROOPS.find(t=>t.id===id)!.name;

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
  loss:()=>foes.map((e,i)=>startHp[i]-e.hp),gold:()=>goldForSide(f.state,side)};
}
function troopSource(id:number,spell:number,cost:number,colors:BaseColor[]){
 const o=original.find((t:{id:number})=>t.id===id)!;const t=TROOPS.find(t=>t.id===id)!;
 expect(o.stats.spell.id).toBe(spell);expect(o.ManaCost).toBe(cost);
 expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colors.map(c=>`Color${c}`).sort());
 expect(t).toMatchObject({id,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
 return {o,t,n:native.get(spell).raw,steps:native.get(spell).raw.SpellSteps as Record<string,unknown>[],proto:registry.prototypes.get(String(spell))};
}
function weaponSource(id:number,spell:number,ref:string,cost:number,colors:BaseColor[],english:string){
 const o=rawWeapons.find((v:{id:number})=>v.id===id)!,w=weapons.find(v=>v.id===id)!,n=native.get(spell).raw;
 expect(o).toMatchObject({SpellId:spell,ManaCost:cost,ReferenceName:ref});
 expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colors.map(c=>`Color${c}`).sort());
 expect(o.stats.spell).toMatchObject({id:spell,desc:english});
 expect(n.Cost).toBe(cost);
 expect(w).toMatchObject({id,referenceName:ref,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
 const proto=registry.prototypes.get(String(spell));
 expect(registry.prototypes.get(`gw_${ref}`)).toEqual(proto);
 return {o,w,n,steps:n.SpellSteps as Record<string,unknown>[],proto};
}
function turnSpent(f:ReturnType<typeof setup>){
 expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.opponent);
}
function blocked(o:Opts){
 for(const mode of ['low-mana','silence'] as const){
  const f=setup(o);
  if(mode==='low-mana')f.caster.mana=o.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  const atk=f.caster.attack,gold=f.gold();
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.loss()).toEqual([0,0,0,0]);expect(f.caster.mana).toBe(mode==='low-mana'?o.cost-1:o.cost);
  expect(f.caster.attack).toBe(atk);expect(f.gold()).toBe(gold);
 }
}

/** Scripted rolls: the first calls of next() return the queued values, later calls use the seed. */
class ScriptRng extends SeededRNG{constructor(private q:number[]){super(7);}override next(){return this.q.length?this.q.shift()!:super.next();}}

// ---------------------------------------------------------------- troop:7517 / spell 9281
describe('L7B04 troop:7517 spell 9281 pull to front, ranged damage boosted by my armor [2:1], 15% self destruct',()=>{
 const C={spell:9281,cost:12,colors:[BaseColor.Blue,BaseColor.Yellow]};
 const run=(side:PlayerSide,magic:number,armor:number,rolls:number[],enemies?:Partial<Character>[])=>{
  const f=setup({...C,side,magic,casterArmor:armor,enemies});
  const engine=new TurnEngine(f.state,new ScriptRng(rolls),f.ctx.nextGemId,registry);engine.skullChance=0;
  engine.setTargetChooser(new FixedTargetChooser(12));const ev=engine.castSkill(f.caster.id);
  return {...f,ev,order:f.state.teams[f.opponent].characters.map(c=>c.id)};
 };
 it('prototype (split removed, L7-7517 fixed) and zh display (official zh keeps its "- {2}" placeholder artefact)',()=>{
  const {t,proto}=troopSource(7517,9281,12,C.colors);
  expect(proto).toEqual({segments:[{kind:'reposition',target:'enemyChosen',to:'front'},
   {kind:'damage',target:'enemyChosen',scaling:{base:0,mult:0},rangeSpec:{min:{base:2,mult:0.625},max:{base:4,mult:1.25}},
    modifier:{mod:{kind:'ratio',a:2,b:1},source:{kind:'selfStat',stat:'armor'}}},
   {kind:'sacrifice',target:'allySelf',chance:0.15}]});
  for(const s of ['将一名敌人拉到首位','[(魔法 x 0.625) + 2]','[(魔法 x 1.25) + 4]- {2} 点伤害','伤害值因自身的护甲值而增强','有 15% 的几率自毁','[2:1]'])
   expect(t.spell.description).toContain(s);
 });
 for(const side of SIDES)for(const [magic,lo,hi] of [[0,2,4],[8,7,14]] as const)
 it(`real cast side=${side} magic=${magic}: chosen enemy pulled to front, takes [${lo}..${hi}] + floor(armor 21 / 2) only; no self destruct at roll 0.5`,()=>{
  const low=run(side,magic,21,[0,0.5]);
  expect(low.order[0]).toBe(12);expect(low.loss()).toEqual([0,0,lo+10,0]);expect(low.caster.defeated).toBe(false);
  const high=run(side,magic,21,[0.9999,0.5]);
  expect(high.loss()).toEqual([0,0,hi+10,0]);
  expect(high.state.actionLog).toHaveLength(1);expect(high.state.activePlayer).toBe(high.opponent);
 });
 it('self destruct: roll 0.1499 kills the caster, roll 0.15 does not; damage still dealt first',()=>{
  const a=run(PlayerSide.Left,0,0,[0,0.1499]);expect(a.caster.defeated).toBe(true);expect(a.loss()[2]).toBe(2);
  const b=run(PlayerSide.Left,0,0,[0,0.15]);expect(b.caster.defeated).toBe(false);
 });
 it('R001 order equivalence (native damage then TroopOrderFront; runtime pull then damage): same victim, same final order; armor absorbs',()=>{
  const f=run(PlayerSide.Left,0,0,[0,0.9],[{},{},{armor:1},{}]);
  expect(f.order).toEqual([12,10,11,13]);expect(f.enemies[2].armor).toBe(0);expect(f.loss()).toEqual([0,0,1,0]);
  blocked(C);
 });
 it('English, native steps, binding, cost/colours',()=>{
  const {o,n,steps}=troopSource(7517,9281,12,[BaseColor.Blue,BaseColor.Yellow]);
  expect(o.stats.spell.desc).toBe('Pull an Enemy to the front, and deal [(Magic x 0.625) + 2] – [(Magic x 1.25) + 4] damage to them, boosted by my Armor. There is a 15% chance to self destruct. [2:1]');
  expect(n).toMatchObject({Target:'Enemy',Cost:12});
  expect(steps).toEqual([
   {Target:'Self',Amount:50,Type:'CountArmor'},
   {SpellPowerMultiplier:1.25,Target:'FromTarget',UseCounterForAmount:true,Amount:4,Primarypower:true,Type:'RandomHighDamage',Delay:400},
   {Target:'FromTarget',Type:'TroopOrderFront',Delay:400},
   {Target:'Self',PercentageChance:15,Type:'LethalDamage'}]);
 });
});

// ---------------------------------------------------------------- troop:6694 / spell 8040
describe('L7B04 troop:6694 spell 8040 steal a quarter of enemy armor, [Magic+4] damage (Tower x ascension waived R000)',()=>{
 const C={spell:8040,cost:12,colors:[BaseColor.Red,BaseColor.Purple]};
 it('English, native steps, binding, cost/colours, prototype and zh display',()=>{
  const {o,t,n,steps,proto}=troopSource(6694,C.spell,C.cost,C.colors);
  expect(o.stats.spell.desc).toBe("Steal a quarter of an Enemy's Armor, and deal [Magic + 4] damage to them. If they are a Tower, deal 3x - 5x damage, based on my Ascensions. [4:1]");
  expect(n).toMatchObject({Target:'Enemy',Cost:12});
  expect(steps).toEqual([
   {Target:'FromTarget',Amount:25,Type:'CountArmor'},
   {Target:'FromTarget',UseCounterForAmount:true,Type:'StealArmor'},
   {SpellPowerMultiplier:1,Target:'FromTarget',StatusAmount:3,Amount:4,Primarypower:true,StatusModifier:'MultiplyForAscensionCastle',Type:'Damage'}]);
  expect(proto).toEqual({segments:[
   {kind:'reduce',target:'enemyChosen',stat:'armor',scaling:{base:0,mult:0},gainStat:'armor',fraction:0.25},
   {kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1},condMult:{times:3,cond:{kind:'targetRace',race:'Castle'}}}]});
  expect(t.spell.description).toBe('窃取敌人四分之一到护甲值，并对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [4:1]');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: armor 40 -> steal floor(40/4)=10 to caster, then [Magic+4] into remaining 30 armor`,()=>{
  const f=setup({...C,side,magic,casterArmor:3,enemies:[{armor:40},{},{armor:40},{}]});f.cast();
  expect(f.caster.armor).toBe(13);
  expect(f.enemies[2].armor).toBe(30-(magic+4));expect(f.loss()).toEqual([0,0,0,0]);
  expect(f.enemies[0].armor).toBe(40);turnSpent(f);
 });
 it('quarter rounding and zero: armor 7 -> steal 1 (floor 1.75); armor 3 -> 0 stolen; armor 0 -> full damage to Life',()=>{
  for(const [armor,stolen] of [[7,1],[3,0],[0,0]] as const){
   const f=setup({...C,magic:0,enemies:[{},{},{armor},{}]});f.cast();
   expect(f.caster.armor).toBe(stolen);
   const left=armor-stolen;expect(f.enemies[2].armor).toBe(Math.max(0,left-4));expect(f.loss()[2]).toBe(Math.max(0,4-left));
  }
 });
 it('only the chosen enemy is affected; low mana / silence block (waived Tower multiplier not asserted)',()=>{
  const f=setup({...C,magic:0,enemies:[{armor:8},{armor:8},{armor:8},{armor:8}]});f.cast();
  expect(f.enemies.map(e=>e.armor)).toEqual([8,8,2,8]);
  blocked(C);
 });
});

// ---------------------------------------------------------------- weapon:1476 Shadow-Hunter's Claw / spell 8778
describe("L7B04 weapon:1476 Shadow-Hunter's Claw spell 8778 first 2 enemies + 5 Attack if Shadow-Hunter",()=>{
 const C={spell:8778,cost:12,colors:[BaseColor.Green]};
 it('English, native steps, numeric + gw_ binding, cost/colours, prototype and zh display',()=>{
  const {n,w,steps,proto}=weaponSource(1476,8778,'Shadow-HuntersClaw',12,C.colors,'Deal [Magic + 1] damage to the first 2 Enemies. If Shadow-Hunter is on my team, gain 5 Attack.');
  expect(n.Target).toBe('None');
  expect(steps).toEqual([
   {Target:'AllAllies',Amount:10000,Type:'CountArmyTroop',Data:'6106'},
   {Amount:5,Type:'CountMax'},
   {SpellPowerMultiplier:1,Target:'FirstTwoEnemies',Amount:1,Primarypower:true,Type:'Damage'},
   {Target:'Self',UseCounterForAmount:true,Type:'IncreaseAttack'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyFirstN',scaling:{base:1,mult:1},n:2},
   {kind:'buff',target:'allySelf',stat:'attack',scaling:{base:5,mult:0},ifCond:{kind:'troopPresent',side:'ally',name:troopName(6106)}}]});
  expect(troopName(6106)).toBe('暗影猎手');
  expect(w.spell.description).toBe('对首 2 名敌人造成 [魔法 + 1] 点伤害。若自身队伍中有暗影猎手，则获得 5 点攻击力。');
 });
 for(const side of SIDES)for(const spell of ['8778','gw_Shadow-HuntersClaw'])for(const magic of [0,10])
 it(`real cast ${side}/${spell}/magic=${magic}: first 2 enemies take [Magic+1]; Shadow-Hunter ally -> caster +5 Attack`,()=>{
  const f=setup({...C,spell,side,magic,allies:[{name:troopName(6106)}]});f.cast();
  expect(f.loss()).toEqual([magic+1,magic+1,0,0]);expect(f.caster.attack).toBe(22);expect(f.allies[0].attack).toBe(17);
  turnSpent(f);
 });
 it('no Shadow-Hunter / dead Shadow-Hunter / enemy Shadow-Hunter -> no Attack; two Shadow-Hunters still +5 (CountMax 5)',()=>{
  const a=setup({...C,magic:0});a.cast();expect(a.caster.attack).toBe(17);expect(a.loss()).toEqual([1,1,0,0]);
  const b=setup({...C,magic:0,allies:[{name:troopName(6106),hp:0,defeated:true}]});b.cast();expect(b.caster.attack).toBe(17);
  const c=setup({...C,magic:0,enemies:[{name:troopName(6106)},{},{},{}]});c.cast();expect(c.caster.attack).toBe(17);
  const d=setup({...C,magic:0,allies:[{name:troopName(6106)},{name:troopName(6106)}]});d.cast();expect(d.caster.attack).toBe(22);
 });
 it('first 2 = first two living enemies (dead front skipped); armor absorbs; low mana / silence block',()=>{
  const f=setup({...C,magic:0,enemies:[{hp:0,defeated:true},{armor:1},{},{}]});f.cast();
  expect(f.loss()).toEqual([0,0,1,0]);expect(f.enemies[1].armor).toBe(0);
  blocked({...C,allies:[{name:troopName(6106)}]});
 });
});

// ---------------------------------------------------------------- weapon:1473 Rose's Pistol / spell 8775
describe("L7B04 weapon:1473 Rose's Pistol spell 8775 [Magic+1] true damage + 40 Gold if Bonnie Rose",()=>{
 const C={spell:8775,cost:10,colors:[BaseColor.Yellow]};
 it('English, native steps, numeric + gw_ binding, cost/colours, prototype and zh display',()=>{
  const {n,w,steps,proto}=weaponSource(1473,8775,'RosesPistol',10,C.colors,'Deal [Magic + 1] true damage to an Enemy. If Bonnie Rose is on my team, gain 40 Gold.');
  expect(n.Target).toBe('Enemy');
  expect(steps).toEqual([
   {Target:'AllAllies',Amount:10000,Type:'CountArmyTroop',Data:'6276'},
   {Amount:40,Type:'CountMax'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:1,Primarypower:true,Type:'TrueDamage'},
   {Target:'Self',UseCounterForAmount:true,Type:'GiveGold'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:1,mult:1},trueDamage:true},
   {kind:'gainEconomy',currency:'gold',scaling:{base:40,mult:0},ifCond:{kind:'troopPresent',side:'ally',name:troopName(6276)}}]});
  expect(troopName(6276)).toBe('红玫瑰');
  expect(w.spell.description).toBe('对一名敌人造成 [魔法 + 1] 点真实伤害。若自身队伍中有红玫瑰，则获得 40 黄金。');
 });
 for(const side of SIDES)for(const spell of ['8775','gw_RosesPistol'])for(const magic of [0,10])
 it(`real cast ${side}/${spell}/magic=${magic}: chosen enemy loses [Magic+1] Life through armor; Bonnie Rose ally -> +40 Gold to my side`,()=>{
  const f=setup({...C,spell,side,magic,allies:[{name:troopName(6276)}],enemies:[{},{},{armor:50},{}]});
  const g0=f.gold(),other=goldForSide(f.state,f.opponent);f.cast();
  expect(f.loss()).toEqual([0,0,magic+1,0]);expect(f.enemies[2].armor).toBe(50);
  expect(f.gold()).toBe(g0+40);expect(goldForSide(f.state,f.opponent)).toBe(other);turnSpent(f);
 });
 it('no Bonnie Rose / dead / enemy-side Bonnie Rose -> no Gold; low mana / silence block',()=>{
  for(const o of [{},{allies:[{name:troopName(6276),hp:0,defeated:true}]},{enemies:[{name:troopName(6276)},{},{},{}]}]){
   const f=setup({...C,magic:0,...o});const g0=f.gold();f.cast();expect(f.gold()).toBe(g0);expect(f.loss()[2]).toBe(1);
  }
  blocked({...C,allies:[{name:troopName(6276)}]});
 });
});

// ---------------------------------------------------------------- weapon:1721 Girthrok's Stonecleaver / spell 10065
describe("L7B04 weapon:1721 Girthrok's Stonecleaver spell 10065 first 2 enemies + 12 Life to all allies if Immortal Girthrok",()=>{
 const C={spell:10065,cost:20,colors:[BaseColor.Blue]};
 it('English, native steps, numeric + gw_ binding, cost/colours, prototype and zh display',()=>{
  const {n,w,steps,proto}=weaponSource(1721,10065,'GirthroksStonecleaver',20,C.colors,'Deal [Magic + 4] damage to the first 2 Enemies. If Immortal Girthrok is in my team, give 12 Life to all Allies.');
  expect(n.Target).toBe('None');
  expect(steps).toEqual([
   {Target:'AllAllies',Amount:10000,Type:'CountArmyTroop',Data:'7933'},
   {SpellPowerMultiplier:1,Target:'FirstTwoEnemies',Amount:4,Primarypower:true,Type:'Damage'},
   {Amount:12,Type:'CountMax'},
   {Target:'AllAllies',UseCounterForAmount:true,Type:'IncreaseHealth'}]);
  expect(proto).toEqual({segments:[{kind:'damage',target:'enemyFirstN',scaling:{base:4,mult:1},n:2},
   {kind:'buff',target:'allyAll',stat:'hp',scaling:{base:12,mult:0},ifCond:{kind:'troopPresent',side:'ally',name:troopName(7933)},lifeMode:'gain'}]});
  expect(troopName(7933)).toBe('不朽的格思洛克');
  expect(w.spell.description).toBe('对首 2 位敌人造成 [魔法 + 4] 点伤害。若队伍中有不朽的格思洛克，为所有盟友提供 12 点生命值。');
 });
 for(const side of SIDES)for(const spell of ['10065','gw_GirthroksStonecleaver'])for(const magic of [0,10])
 it(`real cast ${side}/${spell}/magic=${magic}: first 2 take [Magic+4]; Girthrok ally -> every living ally +12 Life and +12 max Life`,()=>{
  const f=setup({...C,spell,side,magic,allies:[{name:troopName(7933),hp:500},{hp:1000}]});f.caster.hp=900;f.cast();
  expect(f.loss()).toEqual([magic+4,magic+4,0,0]);
  expect([f.caster,...f.allies].map(c=>[c.hp,c.maxHp])).toEqual([[912,1012],[512,1012],[1012,1012]]);
  expect(f.enemies.map(e=>e.maxHp)).toEqual([1000,1000,1000,1000]);turnSpent(f);
 });
 it('no / dead / enemy-side Girthrok -> no Life; dead ally not healed; low mana / silence block',()=>{
  for(const o of [{},{allies:[{name:troopName(7933),hp:0,defeated:true}]},{enemies:[{name:troopName(7933)},{},{},{}]}]){
   const f=setup({...C,magic:0,...o});f.cast();expect([f.caster.hp,f.caster.maxHp]).toEqual([1000,1000]);expect(f.loss().slice(0,2)).toEqual([4,4]);
  }
  const g=setup({...C,magic:0,allies:[{name:troopName(7933)},{hp:0,defeated:true}]});g.cast();expect(g.allies[1].hp).toBe(0);
  blocked({...C,allies:[{name:troopName(7933)}]});
 });
});
