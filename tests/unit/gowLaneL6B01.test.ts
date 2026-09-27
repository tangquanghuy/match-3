// Lane L6 batch B01 (reviewer sa-L6): per-entity source binding + real TurnEngine.castSkill evidence.
// Items: troop:6549, troop:7833, troop:6803, troop:7809, weapon:1194.
// Expectations are hand-computed from the stored native SpellSteps (not from the runtime prototype).
// `it.fails` cases are minimal repros for differences registered in lane-L6/issues.json: they pass
// while the runtime deviates from the native expectation and will start failing once fixed.
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
// @ts-expect-error Independent saved native-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {SeededRNG} from '@engine/rng';
import {BaseColor,PlayerSide,type Character} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';

const rawTroops=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const rawWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);

/** Scripted roll source: the first next() returns `v` (the spell's only chance roll), later calls
 *  (board refill after the cast) fall back to a seeded stream so cascades terminate. */
class FixedRng extends SeededRNG{private used=false;constructor(private readonly v:number){super(7);}override next(){if(!this.used){this.used=true;return this.v;}return super.next();}}

type Opts={skill:string;cost:number;colors:BaseColor[];magic:number;side:PlayerSide;rng?:SeededRNG;enemies?:Partial<Character>[];caster?:Partial<Character>};
function setup(o:Opts){
 const f=damageFixture(0,0,o.enemies??[{},{},{},{}]);
 Object.assign(f.caster,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic,...(o.caster??{})});
 if(o.side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=o.side;}
 const engine=new TurnEngine(f.state,o.rng??f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(12));
 const enemySide=o.side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 return {...f,enemySide,roster:[...f.enemies],cast:()=>engine.castSkill(f.caster.id),order:()=>f.state.teams[enemySide].characters.map(c=>c.id)};
}
function rawTroop(id:number){return rawTroops.find((t:{id:number})=>t.id===id)!;}
function colorKeys(colors:BaseColor[]){return colors.map(c=>`Color${c}`).sort();}
function expectSpent(f:ReturnType<typeof setup>,side:PlayerSide){
 expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
 expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
}
function blockedCases(skill:string,cost:number,colors:BaseColor[]){
 for(const mode of ['low-mana','silence'] as const)it(`${mode}: real cast blocked, no mana/action consumed`,()=>{
  const f=setup({skill,cost,colors,magic:10,side:PlayerSide.Left,enemies:[{},{},{armor:9},{}]});
  if(mode==='low-mana')f.caster.mana=cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.caster.mana).toBe(mode==='low-mana'?cost-1:cost);
  expect(f.enemies.map(e=>[e.hp,e.armor])).toEqual([[1000,0],[1000,0],[1000,9],[1000,0]]);
 });
}
const SIDES=[PlayerSide.Left,PlayerSide.Right];

// ---------------------------------------------------------------- troop:6549 / spell 7743
describe('L6B01 troop:6549 Piper / spell 7743 Merry Jig',()=>{
 const C={skill:'7743',cost:11,colors:[BaseColor.Yellow,BaseColor.Purple]};
 it('source binding: English, native steps, cost/colours, zh text, prototype',()=>{
  const o=rawTroop(6549),t=TROOPS.find(x=>x.id===6549)!,n=native.get(7743).raw;
  expect(o.stats.spell).toMatchObject({id:7743,desc:'Deal [Magic + 2] true damage to an enemy. Steal 3 Armor and shift it to Magic. [1:1]'});
  expect(o.ManaCost).toBe(11);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colorKeys(C.colors));
  expect(n).toMatchObject({Id:7743,Cost:11,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:100,Type:'CountArmor'},
   {Amount:3,Type:'CountMax'},
   {Target:'FromTarget',UseCounterForAmount:true,Type:'DecreaseArmor'},
   {Target:'Self',UseCounterForAmount:true,Type:'IncreaseSpellPower'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:2,Primarypower:true,Type:'TrueDamage'},
  ]);
  expect(t).toMatchObject({id:6549,manaCost:11,manaColors:C.colors,spell:{id:7743}});
  expect(t.spell.description).toContain('[魔法 + 2] 点真实伤害');expect(t.spell.description).toContain('窃取 3 点护甲值');
  expect(registry.prototypes.get('7743')).toEqual({segments:[
   {kind:'reduce',target:'enemyChosen',stat:'armor',scaling:{base:3,mult:0},gainStat:'magic'},
   {kind:'damage',target:'enemyChosen',scaling:{base:2,mult:1},trueDamage:true},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,10])
 it(`real cast ${side} magic=${magic}: steals min(armor,3) armor into Magic, true damage bypasses armor`,()=>{
  const f=setup({...C,magic,side,enemies:[{},{},{armor:5},{}]});
  f.cast();
  // CountArmor 100% = 5, CountMax 3 -> counter 3; DecreaseArmor 3 on target; IncreaseSpellPower +3 on self.
  expect(f.enemies[2].armor).toBe(2);expect(f.caster.magic).toBe(magic+3);
  expect(f.caster.armor).toBe(0);
  // true damage never touches armor; only the chosen enemy is hit
  expect(f.enemies.map((e,i)=>i===2?0:1000-e.hp)).toEqual([0,0,0,0]);
  expect(1000-f.enemies[2].hp).toBeGreaterThanOrEqual(magic+2);
  expectSpent(f,side);
 });
 for(const side of SIDES)for(const magic of [0,10])
 it(`FIXED 6549-order (sa-L76 round 2) ${side} magic=${magic}: native raises Magic before TrueDamage -> hp loss = magic+3+2`,()=>{
  const f=setup({...C,magic,side,enemies:[{},{},{armor:5},{}]});
  f.cast();expect(1000-f.enemies[2].hp).toBe(magic+5);
 });
 it('boundary: target armor 1 -> only 1 stolen (counter uses actual armor); armor 0 -> no Magic gain',()=>{
  const f=setup({...C,magic:4,side:PlayerSide.Left,enemies:[{},{},{armor:1},{}]});f.cast();
  expect(f.enemies[2].armor).toBe(0);expect(f.caster.magic).toBe(5);
  const g=setup({...C,magic:4,side:PlayerSide.Left});g.cast();
  expect(g.enemies[2].armor).toBe(0);expect(g.caster.magic).toBe(4);expect(1000-g.enemies[2].hp).toBe(6);
 });
 blockedCases(C.skill,C.cost,C.colors);
});

// ---------------------------------------------------------------- troop:7833 / spell 10061
describe('L6B01 troop:7833 Ipanema / spell 10061 Riptide',()=>{
 const C={skill:'10061',cost:17,colors:[BaseColor.Blue,BaseColor.Green]};
 it('source binding: English, native steps, cost/colours, zh text, prototype',()=>{
  const o=rawTroop(7833),t=TROOPS.find(x=>x.id===7833)!,n=native.get(10061).raw;
  expect(o.stats.spell).toMatchObject({id:10061,desc:'Deal [Magic + 4] damage to an Enemy, then pull them to the back. There is a 10% chance to slay them, boosted by their Armor (up to 30%). [10:1]'});
  expect(o.ManaCost).toBe(17);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colorKeys(C.colors));
  expect(n).toMatchObject({Id:10061,Cost:17,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:10,Type:'CountArmor'},
   {Amount:20,Type:'CountMax'},
   {Target:'FromTarget',UseCounterForAmount:true,Amount:10,Type:'LethalDamageConditional'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:4,Primarypower:true,Type:'Damage',Delay:400},
   {Target:'FromTarget',Type:'TroopOrderBack'},
  ]);
  expect(t).toMatchObject({id:7833,manaCost:17,manaColors:C.colors,spell:{id:10061}});
  expect(t.spell.description).toContain('[魔法 + 4]');expect(t.spell.description).toContain('最高可达30%');
  expect(registry.prototypes.get('10061')).toEqual({segments:[
   {kind:'damage',target:'enemyChosen',scaling:{base:0,mult:0},execute:true,chance:0.1,chanceBoost:{mod:{kind:'ratio',a:10,b:1},source:{kind:'chosenStat',stat:'armor'},max:20}},
   {kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1}},
   {kind:'reposition',target:'lastTarget',to:'back'},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,10])
 it(`real cast ${side} magic=${magic}: [Magic+4] damage, target pulled to the back, failed slay roll`,()=>{
  const f=setup({...C,magic,side,rng:new FixedRng(0.99)});
  f.cast();
  expect(f.roster.map(e=>1000-e.hp)).toEqual([0,0,magic+4,0]);
  expect(f.roster[2].defeated).toBe(false);
  expect(f.order()).toEqual([10,11,13,12]);
  expectSpent(f,side);
 });
 for(const side of SIDES)
 it(`slay chance ${side}: base 10% with 0 armor (roll 0.0999 slays, 0.1 does not)`,()=>{
  const hit=setup({...C,magic:0,side,rng:new FixedRng(0.0999)});hit.cast();
  expect(hit.roster[2].defeated).toBe(true);expect(hit.roster[2].hp).toBe(0);
  const miss=setup({...C,magic:0,side,rng:new FixedRng(0.1)});miss.cast();
  expect(miss.roster[2].defeated).toBe(false);expect(miss.roster[2].hp).toBe(996);
 });
 it('slay chance cap: armor 400 -> counter 40 capped at 20 -> 30% (0.2999 slays, 0.3001 does not)',()=>{
  const hit=setup({...C,magic:0,side:PlayerSide.Left,rng:new FixedRng(0.2999),enemies:[{},{},{armor:400},{}]});hit.cast();
  expect(hit.roster[2].defeated).toBe(true);
  const miss=setup({...C,magic:0,side:PlayerSide.Left,rng:new FixedRng(0.3001),enemies:[{},{},{armor:400},{}]});miss.cast();
  expect(miss.roster[2].defeated).toBe(false);
 });
 it('FIXED 7833-order (sa-L76 round 2): native counts armor & rolls slay BEFORE damage (armor 100 -> 20%); roll 0.19 must slay',()=>{
  const f=setup({...C,magic:10,side:PlayerSide.Left,rng:new FixedRng(0.19),enemies:[{},{},{armor:100},{}]});
  f.cast();expect(f.roster[2].defeated).toBe(true);
 });
 it('front target pulled back from index 0; already-last target stays last',()=>{
  const f=setup({...C,magic:0,side:PlayerSide.Left,rng:new FixedRng(0.99)});
  const engine=new TurnEngine(f.state,new FixedRng(0.99),f.ctx.nextGemId,registry);engine.skullChance=0;
  engine.setTargetChooser(new FixedTargetChooser(10));engine.castSkill(f.caster.id);
  expect(f.order()).toEqual([11,12,13,10]);
  const g=setup({...C,magic:0,side:PlayerSide.Left,rng:new FixedRng(0.99)});
  const e2=new TurnEngine(g.state,new FixedRng(0.99),g.ctx.nextGemId,registry);e2.skullChance=0;
  e2.setTargetChooser(new FixedTargetChooser(13));e2.castSkill(g.caster.id);
  expect(g.order()).toEqual([10,11,12,13]);
 });
 blockedCases(C.skill,C.cost,C.colors);
});

// ---------------------------------------------------------------- troop:6803 / spell 8206
describe('L6B01 troop:6803 Lupitasha / spell 8206 Song of War',()=>{
 const C={skill:'8206',cost:12,colors:[BaseColor.Blue,BaseColor.Green]};
 it('source binding: English, native steps, cost/colours, zh text, prototype',()=>{
  const o=rawTroop(6803),t=TROOPS.find(x=>x.id===6803)!,n=native.get(8206).raw;
  expect(o.stats.spell).toMatchObject({id:8206,desc:'Steal 4 Armor, then shift it to Attack. Deal [Magic + 4] damage to an Enemy. If they are a Tower, deal 3x - 5x damage, based on my Ascensions.  [1:1]'});
  expect(o.ManaCost).toBe(12);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colorKeys(C.colors));
  expect(n).toMatchObject({Id:8206,Cost:12,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:100,Type:'CountArmor'},
   {Amount:4,Type:'CountMax'},
   {Target:'FromTarget',UseCounterForAmount:true,Type:'StealArmor'},
   {Target:'Self',UseCounterForAmount:true,Type:'IncreaseAttack'},
   {SpellPowerMultiplier:1,Target:'FromTarget',StatusAmount:3,Amount:4,Primarypower:true,StatusModifier:'MultiplyForAscensionCastle',Type:'Damage'},
  ]);
  expect(t).toMatchObject({id:6803,manaCost:12,manaColors:C.colors,spell:{id:8206}});
  expect(t.spell.description).toContain('窃取 4 点护甲值');expect(t.spell.description).toContain('3 到 5 倍');
  expect(registry.prototypes.get('8206')).toEqual({segments:[
   {kind:'reduce',target:'enemyChosen',stat:'armor',scaling:{base:4,mult:0},gainStat:'attack'},
   {kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1},condMult:{times:3,cond:{kind:'allOf',of:[{kind:'targetRace',race:'Castle'},{kind:'ascended',min:3}]}}},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,10])
 it(`real cast ${side} magic=${magic}: 4 armor stolen into Attack, then [Magic+4] damage (armor first)`,()=>{
  const f=setup({...C,magic,side,enemies:[{},{},{armor:10},{}]});
  f.cast();
  const t=f.enemies[2];
  // armor 10 -> 6 after steal; damage magic+4 absorbed by remaining armor first
  const dmg=magic+4;
  expect(t.armor).toBe(Math.max(0,6-dmg));expect(1000-t.hp).toBe(Math.max(0,dmg-6));
  expect(f.caster.attack).toBe(17+4);
  expect(f.enemies.filter((_,i)=>i!==2).map(e=>[e.hp,e.armor])).toEqual([[1000,0],[1000,0],[1000,0]]);
  expectSpent(f,side);
 });
 it('boundary: target armor 2 -> only 2 stolen/gained (CountMax is an upper bound)',()=>{
  const f=setup({...C,magic:0,side:PlayerSide.Left,enemies:[{},{},{armor:2},{}]});f.cast();
  expect(f.caster.attack).toBe(19);expect(f.enemies[2].armor).toBe(0);expect(1000-f.enemies[2].hp).toBe(4);
 });
 it('non-Tower target: plain [Magic+4] (no multiplier)',()=>{
  const f=setup({...C,magic:10,side:PlayerSide.Left,enemies:[{},{},{troopTypes:['Human']},{}]});f.cast();
  expect(1000-f.enemies[2].hp).toBe(14);
 });
 it.fails('DIFF 6803-tower: Tower target takes at least 3x [Magic+4] (native StatusAmount 3, English 3x-5x)',()=>{
  const f=setup({...C,magic:10,side:PlayerSide.Left,enemies:[{},{},{troopTypes:['Castle']},{}]});f.cast();
  expect(1000-f.enemies[2].hp).toBeGreaterThanOrEqual(42);
 });
 blockedCases(C.skill,C.cost,C.colors);
});

// ---------------------------------------------------------------- troop:7809 / spell 9850
describe('L6B01 troop:7809 Armadillo / spell 9850 Plated Shell',()=>{
 const C={skill:'9850',cost:11,colors:[BaseColor.Green,BaseColor.Brown]};
 it('source binding: English, native steps, cost/colours, zh text, prototype',()=>{
  const o=rawTroop(7809),t=TROOPS.find(x=>x.id===7809)!,n=native.get(9850).raw;
  expect(o.stats.spell).toMatchObject({id:9850,desc:'Deal [Magic + 3] damage to a random Enemy, boosted by my Armor. If the Enemy dies, gain 10 Armor. [4:1]'});
  expect(o.ManaCost).toBe(11);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colorKeys(C.colors));
  expect(n).toMatchObject({Id:9850,Cost:11,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'Self',Amount:25,Type:'CountArmor'},
   {SpellPowerMultiplier:1,Target:'RandomEnemy',UseCounterForAmount:true,Amount:3,Primarypower:true,Type:'Damage',Delay:1},
   {Target:'Self',StatusAmount:10,StatusModifier:'AddForKill',Type:'IncreaseArmor'},
  ]);
  expect(t).toMatchObject({id:7809,manaCost:11,manaColors:C.colors,spell:{id:9850}});
  expect(t.spell.description).toContain('[魔法 + 3]');expect(t.spell.description).toContain('获得10点护甲值');
  expect(registry.prototypes.get('9850')).toEqual({segments:[
   {kind:'damage',target:'enemyRandom',scaling:{base:3,mult:1},modifier:{mod:{kind:'ratio',a:4,b:1},source:{kind:'selfStat',stat:'armor'}}},
   {kind:'buff',target:'allySelf',stat:'armor',scaling:{base:10,mult:0},ifTargetDied:true},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,10])
 it(`real cast ${side} magic=${magic}: one random enemy takes magic+3+floor(armor*25%), survivor -> no armor gain`,()=>{
  const f=setup({...C,magic,side,caster:{armor:10}});
  const ev=f.cast();
  const loss=f.enemies.map(e=>1000-e.hp);
  expect(loss.filter(v=>v>0)).toEqual([magic+3+2]);
  expect(ev.filter(e=>e.type==='skill-damage')).toHaveLength(1);
  expect(f.caster.armor).toBe(10);
  expectSpent(f,side);
 });
 for(const side of SIDES)for(const magic of [0,10])
 it(`kill ${side} magic=${magic}: target dies -> caster gains exactly 10 armor`,()=>{
  const f=setup({...C,magic,side,caster:{armor:7},enemies:[{hp:1},{hp:1},{hp:1},{hp:1}]});
  const ev=f.cast();
  expect(ev.filter(e=>e.type==='defeat')).toHaveLength(1);
  expect(f.caster.armor).toBe(17);
 });
 it('boundary: armor 3 -> floor(3*25%)=0 bonus; armor 4 -> +1; dead enemies never picked',()=>{
  const a=setup({...C,magic:5,side:PlayerSide.Left,caster:{armor:3},enemies:[{defeated:true,hp:0},{defeated:true,hp:0},{},{defeated:true,hp:0}]});a.cast();
  expect(1000-a.enemies[2].hp).toBe(8);
  const b=setup({...C,magic:5,side:PlayerSide.Left,caster:{armor:4},enemies:[{defeated:true,hp:0},{},{defeated:true,hp:0},{defeated:true,hp:0}]});b.cast();
  expect(1000-b.enemies[1].hp).toBe(9);expect(b.caster.armor).toBe(4);
 });
 it('enemy armor absorbs first; surviving armored enemy gives no armor to caster',()=>{
  const f=setup({...C,magic:0,side:PlayerSide.Left,caster:{armor:8},enemies:[{defeated:true,hp:0},{defeated:true,hp:0},{armor:3,hp:10},{defeated:true,hp:0}]});f.cast();
  // 0+3+2 = 5 damage: 3 to armor, 2 to hp
  expect(f.enemies[2].armor).toBe(0);expect(f.enemies[2].hp).toBe(8);expect(f.caster.armor).toBe(8);
 });
 blockedCases(C.skill,C.cost,C.colors);
});

// ---------------------------------------------------------------- weapon:1194 / spell 7752
describe('L6B01 weapon:1194 Fleshripper / spell 7752',()=>{
 const C={cost:15,colors:[BaseColor.Red,BaseColor.Yellow]};
 it('source binding: English, native steps, cost/colours, numeric + gw_ aliases, zh text',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1194)!,w=weapons.find(v=>v.id===1194)!,n=native.get(7752).raw;
  expect(o).toMatchObject({SpellId:7752,ManaCost:15,ReferenceName:'Fleshripper'});
  expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colorKeys(C.colors));
  expect(o.stats.spell).toMatchObject({id:7752,desc:'Eliminate all Armor from an Enemy. Deal [Magic + 4] damage, boosted by Armor eliminated. [3:1]'});
  expect(n).toMatchObject({Id:7752,Cost:15,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:34,Type:'CountArmor'},
   {Target:'FromTarget',Amount:10001,Type:'DecreaseArmor'},
   {SpellPowerMultiplier:1,Target:'FromTarget',UseCounterForAmount:true,Amount:4,Primarypower:true,Type:'Damage'},
  ]);
  expect(w).toMatchObject({id:1194,referenceName:'Fleshripper',manaCost:15,manaColors:C.colors,spell:{id:7752}});
  expect(w.spell.description).toContain('全部护甲值');expect(w.spell.description).toContain('[魔法 + 4]');
  const expected={segments:[
   {kind:'reduce',target:'enemyChosen',stat:'armor',scaling:{base:0,mult:0},drainAll:true},
   {kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1},modifier:{mod:{kind:'ratio',a:3,b:1},source:{kind:'lastReduce'}}},
  ]};
  expect(registry.prototypes.get('7752')).toEqual(expected);
  expect(registry.prototypes.get('gw_Fleshripper')).toEqual(expected);
 });
 for(const side of SIDES)for(const alias of ['7752','gw_Fleshripper'])for(const magic of [0,10])
 it(`real cast ${side}/${alias}/magic=${magic}: all 30 armor removed, hp loss magic+4+floor(30*34%)=magic+14`,()=>{
  const f=setup({skill:alias,...C,magic,side,enemies:[{armor:5},{},{armor:30},{}]});
  f.cast();
  expect(f.enemies[2].armor).toBe(0);expect(1000-f.enemies[2].hp).toBe(magic+14);
  expect(f.enemies[0]).toMatchObject({armor:5,hp:1000});
  expect(f.caster.armor).toBe(0);
  expectSpent(f,side);
 });
 it('boundary: armor 0 -> no boost, plain [Magic+4]; armor 2 -> floor(0.68)=0 boost',()=>{
  const a=setup({skill:'gw_Fleshripper',...C,magic:6,side:PlayerSide.Left});a.cast();
  expect(1000-a.enemies[2].hp).toBe(10);
  const b=setup({skill:'7752',...C,magic:6,side:PlayerSide.Left,enemies:[{},{},{armor:2},{}]});b.cast();
  expect(b.enemies[2].armor).toBe(0);expect(1000-b.enemies[2].hp).toBe(10);
 });
 it('FIXED 1194-rounding (R003, sa-L76 round 2): native CountArmor 34% of 50 armor = 17 -> hp loss 10+4+17 = 31',()=>{
  const f=setup({skill:'7752',...C,magic:10,side:PlayerSide.Left,enemies:[{},{},{armor:50},{}]});f.cast();
  expect(1000-f.enemies[2].hp).toBe(31);
 });
 blockedCases('gw_Fleshripper',C.cost,C.colors);
});
