// Lane L5 (status apply / cleanse / dispel) batch B05, reviewer sa-L5 (round 3).
// Per-entity stored-source binding + real TurnEngine.castSkill evidence.
// Durations follow rulings/R004 (no turn cap; shared cumulative self-cleanse; Submerged ends on action).
// Tests named "FIXED L5-xxx" assert behaviour repaired in this batch.
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Independent saved native-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {tickStatuses} from '@engine/skills/effects/status';
import {attachPassives} from '@engine/traits';
import {BaseColor,PlayerSide,type Character} from '@engine/types';
import type {SeededRNG} from '@engine/rng';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';

const rawTroops=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const roll=(v:number)=>({next:()=>v,nextInt:()=>0}) as unknown as SeededRNG;

interface Opts{skill:string;cost:number;colors:BaseColor[];side:PlayerSide;magic:number;chosen:number;enemies?:Partial<Character>[];casterFirst?:boolean;seed?:number}
/** Caster team = [caster id0, ally id1] (or [ally, caster] when casterFirst=false); enemies ids 10..13 (1000 hp, 0 armor). */
function setup(o:Opts){
 const f=damageFixture(0,0,o.enemies??[{},{},{},{}]);
 Object.assign(f.caster,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic});
 const ally=damageCharacter(1,{mana:0});
 const other=o.side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 f.state.teams[o.side].characters=o.casterFirst===false?[ally,f.caster]:[f.caster,ally];
 f.state.teams[other].characters=f.enemies;f.state.activePlayer=o.side;
 const foes=[...f.enemies];
 for(const e of foes)attachPassives(e);
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 for(let i=0;i<(o.seed??0);i++)f.ctx.rng.next();
 engine.setTargetChooser(new FixedTargetChooser(o.chosen));
 return {...f,ally,foes,engine,other,cast:()=>engine.castSkill(f.caster.id) as any[]};
}
const applied=(ev:any[],status:string)=>ev.filter(e=>e.type==='status-apply'&&e.statusId===status).map(e=>e.targetId);
const sids=(c:Character)=>c.statuses.map(s=>s.id);
const loss=(f:{foes:Character[]})=>f.foes.map(e=>1000-e.hp);
const firstDmg=(ev:any[])=>ev.findIndex(e=>e.type==='skill-damage');
const SIDES=[PlayerSide.Left,PlayerSide.Right];
const block=(mk:()=>ReturnType<typeof setup>,cost:number)=>{
 for(const mode of ['low-mana','silence'] as const)it(`${mode} blocks the real cast`,()=>{
  const f=mk();if(mode==='low-mana')f.caster.mana=cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.foes.every(e=>e.statuses.length===0&&e.hp===1000)).toBe(true);
 });
};
const bind=(id:number,spell:number,desc:string,cost:number,colors:string[],zh:string,colorsEnum:BaseColor[])=>{
 const o=rawTroops.find((t:{id:number})=>t.id===id)!;
 expect(o.stats.spell).toMatchObject({id:spell,desc});
 expect(o.ManaCost).toBe(cost);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colors);
 const t=TROOPS.find(t=>t.id===id)!;
 expect(t).toMatchObject({id,manaCost:cost,manaColors:colorsEnum,spell:{id:spell}});
 expect(t.spell.description).toBe(zh);
};

// ───────────────────────── troop:7459 / spell 9176 Hurl Boulder ─────────────────────────
describe('L5 troop:7459 / spell:9176 Stun an enemy, Magic+2 heavy splash to them',()=>{
 const SK='9176',COST=12,COLORS=[BaseColor.Green,BaseColor.Brown];
 it('source, native steps, binding, cost/colours, prototype and Chinese display',()=>{
  bind(7459,9176,'Stun an Enemy, and deal [Magic + 2] heavy splash damage to them.',12,['ColorBrown','ColorGreen'],'击晕一名敌人，并对其造成 [魔法 + 2] 点重度溅射伤害。',COLORS);
  const n=native.get(9176).raw;expect(n).toMatchObject({Id:9176,Cost:12,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Type:'CauseStun'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:2,Primarypower:true,Type:'SplashHeavyDamage'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'stun',turns:3},
   {kind:'damage',target:'enemyChosen',scaling:{base:2,mult:1},range:'splash',splashRatio:0.75},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,6])
 it(`real cast side=${side} magic=${magic}: chosen 12 Stunned, then takes M+2; neighbours 11/13 take floor(75%)`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:12});
  const ev=f.cast();
  expect(applied(ev,'stun')).toEqual([12]);
  expect(ev.findIndex(e=>e.type==='status-apply')).toBeLessThan(firstDmg(ev));
  const m=magic+2;
  expect(loss(f)).toEqual([0,Math.floor(m*0.75),m,Math.floor(m*0.75)]);
  expect(f.foes.filter(e=>e.id!==12).every(e=>e.statuses.length===0)).toBe(true);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('front enemy chosen: one neighbour only (no wraparound); Stun-immune target still takes the splash',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:6,chosen:10});
  a.cast();expect(loss(a)).toEqual([8,6,0,0]);expect(sids(a.foes[0])).toEqual(['stun']);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:6,chosen:12,enemies:[{},{},{traitIds:['thickhead']},{}]});
  const bev=b.cast();expect(applied(bev,'stun')).toEqual([]);expect(loss(b)).toEqual([0,6,8,6]);
 });
 it('Barrier on the centre absorbs its hit but the neighbours still take the heavy splash; Stun lands first',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:6,chosen:12});
  f.foes[2].statuses=[{id:'barrier',turns:3}];
  f.cast();expect(loss(f)).toEqual([0,6,0,6]);expect(sids(f.foes[2])).toEqual(['stun']);
 });
 it('R004: Stun has no turn cap and leaves on one successful self-cleanse roll',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:12});
  f.cast();const t=f.foes[2];
  for(let i=0;i<6;i++)tickStatuses(t,roll(0.99));expect(sids(t)).toEqual(['stun']);
  tickStatuses(t,roll(0));expect(sids(t)).toEqual([]);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:6,chosen:12}),COST);
});

// ───────────────────────── troop:7862 / spell 9937 Mountain Crash ─────────────────────────
describe('L5 troop:7862 / spell:9937 Stun all enemies, then Magic+5 splash to 3 random enemies',()=>{
 const SK='9937',COST=24,COLORS=[BaseColor.Blue,BaseColor.Yellow,BaseColor.Brown];
 it('source, native steps, binding, cost/colours, prototype and Chinese display',()=>{
  bind(7862,9937,'Stun all Enemies. Then deal [Magic + 5] splash damage to 3 random Enemies.',24,['ColorBlue','ColorBrown','ColorYellow'],'击晕所有敌人。然后对3个随机敌人造成[魔法 + 5]点溅射伤害。',COLORS);
  const n=native.get(9937).raw;expect(n).toMatchObject({Id:9937,Cost:24,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'AllEnemies',Type:'CauseStun',Delay:900,ResetTargets:true},
   {SpellPowerMultiplier:1,Target:'RandomEnemy',Amount:5,Primarypower:true,Type:'SplashHighDamage',Delay:800,ResetTargets:true},
   {SpellPowerMultiplier:1,Target:'RandomPrefNotPrevEnemy',Amount:5,Type:'SplashHighDamage',Delay:800,ResetTargets:true},
   {SpellPowerMultiplier:1,Target:'RandomPrefNotPrevEnemy',Amount:5,Type:'SplashHighDamage',Delay:0},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyAll',statusId:'stun',turns:3},
   {kind:'damage',target:'enemyRandomN',scaling:{base:5,mult:1},range:'splash',n:3,splashRatio:0.5},
  ]});
 });
 /** Replays each wave: centre takes m, living formation neighbours floor(m/2). */
 const expectedLoss=(centres:number[],m:number)=>{
  const ids=[10,11,12,13],out=[0,0,0,0];
  for(const c of centres){const i=ids.indexOf(c);out[i]+=m;if(i>0)out[i-1]+=Math.floor(m/2);if(i<3)out[i+1]+=Math.floor(m/2);}
  return out;
 };
 const centresOf=(ev:any[])=>ev.filter(e=>e.type==='skill-damage'&&e.chainIndex===0).map(e=>e.targetId);
 for(const side of SIDES)for(const magic of [0,4])
 it(`real cast side=${side} magic=${magic}: every enemy Stunned before damage; 3 distinct splash centres (normal 50%)`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:10});
  const ev=f.cast();
  expect(applied(ev,'stun')).toEqual([10,11,12,13]);
  expect(ev.map(e=>e.type).lastIndexOf('status-apply')).toBeLessThan(firstDmg(ev));
  const c=centresOf(ev);expect(c).toHaveLength(3);expect(new Set(c).size).toBe(3);
  expect(loss(f)).toEqual(expectedLoss(c,magic+5));
  expect(f.state.activePlayer).toBe(f.other);
 });
 it('centres vary over seeds; consecutive centres always differ while 2+ live, the third may return to the first (R007-3 RandomPrefNotPrevEnemy)',()=>{
  const seen=new Set<string>();let returned=false;
  for(let seed=0;seed<30;seed++){
   const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:4,chosen:10,seed});
   const c=centresOf(f.cast());expect(c).toHaveLength(3);expect(c[1]).not.toBe(c[0]);expect(c[2]).not.toBe(c[1]);
   if(c[2]===c[0])returned=true;seen.add([...c].sort().join());
   expect(loss(f)).toEqual(expectedLoss(c,9));
  }
  expect(seen.size).toBeGreaterThan(1);expect(returned).toBe(true);
 });
 it('two living enemies: still three waves alternating A-B-A (R007-3); lone enemy takes all three',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:4,chosen:10,enemies:[{defeated:true,hp:0},{},{defeated:true,hp:0},{}]});
  const c=centresOf(a.cast());expect(c).toHaveLength(3);expect(new Set(c.slice(0,2)).size).toBe(2);expect(c[2]).toBe(c[0]);
  // living 11 and 13 are formation neighbours once 12 is dead: each wave = 9 centre + 4 splash
  expect(a.foes[1].hp+a.foes[3].hp).toBe(2000-3*13);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:4,chosen:10,enemies:[{defeated:true,hp:0},{defeated:true,hp:0},{},{defeated:true,hp:0}]});
  expect(centresOf(b.cast())).toEqual([12,12,12]);expect(b.foes[2].hp).toBe(1000-27);
 });
 it('Stun-immune enemy is not Stunned but can still be a splash centre; R004 Stun persists without a cap',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:4,chosen:10,enemies:[{},{traitIds:['thickhead']},{},{}]});
  const ev=f.cast();expect(applied(ev,'stun')).toEqual([10,12,13]);
  for(let i=0;i<5;i++)tickStatuses(f.foes[0],roll(0.99));expect(sids(f.foes[0])).toEqual(['stun']);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:4,chosen:10}),COST);
});

// ───────────────────────── troop:7439 / spell 9131 Goat Sign ─────────────────────────
describe('L5 troop:7439 / spell:9131 Stun + knock the chosen enemy back, move self front, +2M+1 Attack/Life/Armor',()=>{
 const SK='9131',COST=24,COLORS=[BaseColor.Green,BaseColor.Red,BaseColor.Yellow];
 it('source, native steps, binding, cost/colours, prototype (native order, chosen target) and Chinese display',()=>{
  bind(7439,9131,'Knock an Enemy to the back and Stun them. Then move myself to the front and gain [(Magic x 2) + 1] Attack, Life, and Armor.',24,['ColorGreen','ColorRed','ColorYellow'],'将一名敌人打回末位并将其击晕。再将自身移至首位，并获得 [(魔法 x 2) + 1] 点攻击力、生命值和护甲值。',COLORS);
  const n=native.get(9131).raw;expect(n).toMatchObject({Id:9131,Cost:24,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:1,Type:'CauseStun'},
   {Target:'FromTarget',Type:'TroopOrderBack'},
   {SpellPowerMultiplier:2,Target:'Self',Amount:1,Primarypower:true,Type:'IncreaseAttack'},
   {SpellPowerMultiplier:2,Target:'Self',Amount:1,Type:'IncreaseHealth'},
   {SpellPowerMultiplier:2,Target:'Self',Amount:1,Type:'IncreaseArmor'},
   {Target:'Self',Type:'TroopOrderFront'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'stun',turns:3},
   {kind:'reposition',target:'lastTarget',to:'back'},
   {kind:'buff',target:'allySelf',stat:'attack',scaling:{base:1,mult:2}},
   {kind:'buff',target:'allySelf',stat:'hp',scaling:{base:1,mult:2},lifeMode:'gain'},
   {kind:'buff',target:'allySelf',stat:'armor',scaling:{base:1,mult:2}},
   {kind:'reposition',target:'allySelf',to:'front'},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,5])
 it(`FIXED L5-016: real cast side=${side} magic=${magic}: chosen 11 Stunned and sent to the back; caster to front with +2M+1 Attack/Life/Armor`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:11,casterFirst:false});
  const ev=f.cast();const g=2*magic+1;
  expect(applied(ev,'stun')).toEqual([11]);
  expect(f.state.teams[f.other].characters.map(c=>c.id)).toEqual([10,12,13,11]);
  expect(f.state.teams[side].characters.map(c=>c.id)).toEqual([0,1]);
  expect([f.caster.attack,f.caster.hp,f.caster.maxHp,f.caster.armor]).toEqual([17+g,1000+g,1000+g,g]);
  expect(loss(f)).toEqual([0,0,0,0]);
  expect(f.state.activePlayer).toBe(f.other);
 });
 it('FIXED L5-016: every seed uses the chosen enemy (not a random one)',()=>{
  for(let seed=0;seed<10;seed++){
   const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:1,chosen:12,seed});
   f.cast();expect(f.state.teams[f.other].characters.map(c=>c.id)).toEqual([10,11,13,12]);expect(sids(f.foes[2])).toEqual(['stun']);
  }
 });
 it('Stun-immune chosen enemy is still knocked back; last enemy chosen stays last; caster already first stays first',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:1,chosen:10,enemies:[{traitIds:['thickhead']},{},{},{}]});
  const aev=a.cast();expect(applied(aev,'stun')).toEqual([]);expect(a.state.teams[a.other].characters.map(c=>c.id)).toEqual([11,12,13,10]);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:1,chosen:13});
  b.cast();expect(b.state.teams[b.other].characters.map(c=>c.id)).toEqual([10,11,12,13]);
  expect(b.state.teams[PlayerSide.Right].characters.map(c=>c.id)).toEqual([0,1]);expect(sids(b.foes[3])).toEqual(['stun']);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:1,chosen:11}),COST);
});

// ───────────────────────── troop:7541 / spell 9298 Sunken Grave ─────────────────────────
describe('L5 troop:7541 / spell:9298 Submerge self, Death Mark 2 random enemies',()=>{
 const SK='9298',COST=11,COLORS=[BaseColor.Blue,BaseColor.Red];
 it('source, native steps, binding, cost/colours, prototype and Chinese display',()=>{
  bind(7541,9298,'Submerge myself, and Death Mark 2 random Enemies.',11,['ColorBlue','ColorRed'],'下潜自身，并使 2 名随机敌人陷入死亡标记状态。',COLORS);
  const n=native.get(9298).raw;expect(n).toMatchObject({Id:9298,Cost:11,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'Self',Type:'CauseSubmerged',ResetTargets:true},
   {Target:'RandomEnemy',Type:'CauseDeathMark',ResetTargets:true},
   {Target:'RandomPrefNotPrevEnemy',Type:'CauseDeathMark'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'allySelf',statusId:'submerged',turns:3},
   {kind:'status',target:'enemyRandomN',statusId:'death-mark',turns:3,n:2},
  ]});
 });
 for(const side of SIDES)
 it(`real cast side=${side}: caster Submerged; exactly 2 different enemies Death Marked; no damage`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic:5,chosen:10});
  const ev=f.cast();
  expect(applied(ev,'submerged')).toEqual([0]);expect(sids(f.caster)).toEqual(['submerged']);
  const marked=applied(ev,'death-mark');expect(marked).toHaveLength(2);expect(new Set(marked).size).toBe(2);
  expect(sids(f.ally)).toEqual([]);expect(loss(f)).toEqual([0,0,0,0]);
  expect(ev.findIndex(e=>e.type==='status-apply'&&e.statusId==='submerged')).toBeLessThan(ev.findIndex(e=>e.type==='status-apply'&&e.statusId==='death-mark'));
 });
 it('pairs vary over seeds; lone enemy is marked (second native step re-uses it = refresh, one instance)',()=>{
  const seen=new Set<string>();
  for(let seed=0;seed<30;seed++){const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:5,chosen:10,seed});seen.add(applied(f.cast(),'death-mark').sort().join());}
  expect(seen.size).toBeGreaterThan(2);
  const g=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:5,chosen:10,enemies:[{defeated:true,hp:0},{},{defeated:true,hp:0},{defeated:true,hp:0}]});
  g.cast();expect(g.foes[1].statuses.map(s=>s.id)).toEqual(['death-mark']);
 });
 it('R004: Submerged has no timer and ends when the caster next casts; Death Mark keeps its grace tick and no cap',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:5,chosen:10});
  f.cast();for(let i=0;i<6;i++)tickStatuses(f.caster,roll(0));expect(sids(f.caster)).toEqual(['submerged']);
  const m=f.foes.find(e=>sids(e).includes('death-mark'))!;
  for(let i=0;i<6;i++)tickStatuses(m,roll(0.99));expect(sids(m)).toEqual(['death-mark']);expect(m.defeated).toBe(false);
  f.state.activePlayer=PlayerSide.Left;f.caster.mana=COST;
  const ev=f.engine.castSkill(0);
  expect(ev.some(e=>e.type==='status-expire'&&e.targetId===0&&e.statusId==='submerged')).toBe(true);
  expect(sids(f.caster)).toEqual(['submerged']); // re-applied by the new cast, after the old one ended
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:5,chosen:10}),COST);
});

// ───────────────────────── troop:7484 / spell 9217 Decaying Roar ─────────────────────────
describe('L5 troop:7484 / spell:9217 Terror + Disease on an enemy, then Magic+2 damage to them',()=>{
 const SK='9217',COST=12,COLORS=[BaseColor.Green,BaseColor.Purple];
 it('source, native steps, binding, cost/colours, prototype and Chinese display',()=>{
  bind(7484,9217,'Inflict Terror and Disease on an Enemy. Then deal [Magic + 2] damage to them.',12,['ColorGreen','ColorPurple'],'使一名敌人陷入恐怖和疾病状态，再对他造成 [魔法 + 2] 点伤害。',COLORS);
  const n=native.get(9217).raw;expect(n).toMatchObject({Id:9217,Cost:12,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:1,Type:'CauseTerror'},
   {Target:'FromTarget',Amount:1,Type:'CauseDisease'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:2,Primarypower:true,Type:'Damage'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'terror',turns:3},
   {kind:'status',target:'enemyChosen',statusId:'disease',turns:3},
   {kind:'damage',target:'lastTarget',scaling:{base:2,mult:1}},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,7])
 it(`real cast side=${side} magic=${magic}: chosen 11 gets Terror then Disease, then takes M+2 (armor first)`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:11,enemies:[{},{armor:3},{},{}]});
  const ev=f.cast();
  const seq=ev.filter(e=>e.type==='status-apply'||e.type==='skill-damage').map(e=>e.type==='skill-damage'?`dmg@${e.targetId}`:`${e.statusId}@${e.targetId}`);
  expect(seq).toEqual(['terror@11','disease@11','dmg@11']);
  const m=magic+2;expect(f.foes[1].armor).toBe(Math.max(0,3-m));expect(f.foes[1].hp).toBe(1000-Math.max(0,m-3));
  expect(f.foes.filter(e=>e.id!==11).every(e=>e.statuses.length===0&&e.hp===1000)).toBe(true);
 });
 it('Disease-immune target still gets Terror and the damage; Barrier absorbs the damage but both statuses land',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:7,chosen:11,enemies:[{},{traitIds:['immune']},{},{}]});
  const aev=a.cast();expect(applied(aev,'disease')).toEqual([]);expect(applied(aev,'terror')).toEqual([11]);expect(a.foes[1].hp).toBe(991);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:7,chosen:11});
  b.foes[1].statuses=[{id:'barrier',turns:3}];b.cast();expect(b.foes[1].hp).toBe(1000);expect(sids(b.foes[1])).toEqual(['terror','disease']);
 });
 it('lethal hit: target defeated after receiving both statuses; R004: Terror+Disease leave together on one roll',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:7,chosen:11,enemies:[{},{hp:5},{},{}]});
  const ev=a.cast();expect(applied(ev,'terror')).toEqual([11]);expect(a.foes[1].defeated).toBe(true);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:12});
  b.cast();const t=b.foes[2];for(let i=0;i<6;i++)tickStatuses(t,roll(0.99));expect(sids(t)).toEqual(['terror','disease']);
  tickStatuses(t,roll(0));expect(sids(t)).toEqual([]);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:7,chosen:11}),COST);
});
