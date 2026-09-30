import type { GameEvent } from '@engine/events';
// Lane L5 (status apply / cleanse / dispel) batch B03, reviewer sa-L5.
// Per-entity stored-source binding + real TurnEngine.castSkill evidence.
// Tests named "FIXED L5-xxx" assert behaviour repaired in this batch (rulings/R001 native order, L5-012 missing step).
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Independent saved native-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {attachPassives} from '@engine/traits';
import {BaseColor,PlayerSide,type Character} from '@engine/types';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';

const rawTroops=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const rawWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);

interface Opts{skill:string;cost:number;colors:BaseColor[];side:PlayerSide;magic:number;chosen:number;enemies?:Partial<Character>[];caster?:Partial<Character>}
/** Caster team = [caster id0, ally id1]; enemy team = ids 10..13 (1000 hp, 0 armor unless overridden). */
function setup(o:Opts){
 const f=damageFixture(0,0,o.enemies??[{},{},{},{}]);
 Object.assign(f.caster,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic},o.caster??{});
 const ally=damageCharacter(1,{mana:0});
 const other=o.side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 f.state.teams[o.side].characters=[f.caster,ally];f.state.teams[other].characters=f.enemies;f.state.activePlayer=o.side;
 const foes=[...f.enemies];
 for(const e of foes)attachPassives(e);
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.chosen));
 return {...f,ally,foes,engine,other,cast:()=>engine.castSkill(f.caster.id)};
}
const applied=(ev:GameEvent[],status:string)=>ev.filter(e=>e.type==='status-apply').filter(e=>e.statusId===status).map(e=>e.targetId);
const sids=(c:Character)=>c.statuses.map(s=>s.id);
const seq=(ev:GameEvent[])=>ev.filter(e=>e.type==='status-apply'||e.type==='skill-damage').map(e=>e.type==='skill-damage'?`dmg@${e.targetId}`:`${e.statusId}@${e.targetId}`);
const SIDES=[PlayerSide.Left,PlayerSide.Right];
const block=(mk:()=>ReturnType<typeof setup>,cost:number)=>{
 for(const mode of ['low-mana','silence'] as const)it(`${mode} blocks the real cast`,()=>{
  const f=mk();if(mode==='low-mana')f.caster.mana=cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.foes.every(e=>e.hp===1000&&e.statuses.length===0)).toBe(true);
 });
};

// ───────────────────────── troop:6229 / spell 7371 ─────────────────────────
describe('L5 troop:6229 / spell:7371 Disease, Poison and Stun one random enemy',()=>{
 const SK='7371',COST=6,COLORS=[BaseColor.Brown];
 it('source, native steps, binding, cost/colour, prototype (native order) and Chinese display',()=>{
  const o=rawTroops.find((t:{id:number})=>t.id===6229)!;
  expect(o.stats.spell).toMatchObject({id:7371,desc:'Poison, Disease, and Stun a random enemy.'});
  expect(o.ManaCost).toBe(6);expect(Object.keys(o._ManaColors_parsed)).toEqual(['ColorBrown']);
  const n=native.get(7371).raw;
  expect(n).toMatchObject({Id:7371,Cost:6,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'RandomEnemy',Type:'CauseDisease'},
   {Target:'FromPrevious',Type:'CausePoison'},
   {Target:'FromPrevious',Type:'CauseStun'},
  ]);
  // FIXED L5-013 (R001): Disease -> Poison -> Stun on the same random enemy
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyRandom',statusId:'disease',turns:3},
   {kind:'status',target:'lastTarget',statusId:'poison',turns:3,magnitude:3},
   {kind:'status',target:'lastTarget',statusId:'stun',turns:3},
  ]});
  const t=TROOPS.find(t=>t.id===6229)!;
  expect(t).toMatchObject({id:6229,manaCost:6,manaColors:COLORS,spell:{id:7371}});
  expect(t.spell.description).toBe('击晕一名随机敌人，并使其陷入中毒和疾病状态。');
 });
 for(const side of SIDES)for(const magic of [0,9])
 it(`real cast side=${side} magic=${magic}: one random enemy gets Disease, Poison, Stun in native order; no damage`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:10});
  const ev=f.cast();
  const v=applied(ev,'disease');expect(v).toHaveLength(1);
  expect(seq(ev)).toEqual([`disease@${v[0]}`,`poison@${v[0]}`,`stun@${v[0]}`]);
  const victim=f.foes.find(e=>e.id===v[0])!;
  expect(sids(victim)).toEqual(['disease','poison','stun']);
  expect(f.foes.filter(e=>e!==victim).every(e=>e.statuses.length===0)).toBe(true);
  expect(ev.some(e=>e.type==='skill-damage')).toBe(false);
  expect(f.caster.statuses).toEqual([]);expect(f.ally.statuses).toEqual([]);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('random pick varies over seeds; dead enemies never picked',()=>{
  const seen=new Set<number>();
  for(let seed=0;seed<30;seed++){
   const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10,enemies:[{},{defeated:true,hp:0},{},{}]});
   for(let i=0;i<seed;i++)f.ctx.rng.next();
   const v=applied(f.cast(),'disease')[0];expect(v).not.toBe(11);seen.add(v);
  }
  expect(seen.size).toBeGreaterThan(1);
 });
 it('FIXED L5-013: Disease-immune lone enemy blocks Disease (Stun comes last, so it cannot strip the immunity first)',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10,
   enemies:[{defeated:true,hp:0},{traitIds:['immune']},{defeated:true,hp:0},{defeated:true,hp:0}]});
  const ev=f.cast();
  expect(applied(ev,'disease')).toEqual([]);
  expect(applied(ev,'poison')).toEqual([11]);expect(applied(ev,'stun')).toEqual([11]);
  expect(sids(f.foes[1])).toEqual(['poison','stun']);
 });
 it('Invulnerable lone enemy: nothing lands',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:0,chosen:10,
   enemies:[{traitIds:['invulnerable']},{defeated:true,hp:0},{defeated:true,hp:0},{defeated:true,hp:0}]});
  expect(f.cast().some(e=>e.type==='status-apply')).toBe(false);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10}),COST);
});

// ───────────────────────── troop:6217 / spell 7359 ─────────────────────────
describe('L5 troop:6217 / spell:7359 Disease then Magic+3 damage to the chosen enemy',()=>{
 const SK='7359',COST=7,COLORS=[BaseColor.Red];
 it('source, native steps, binding, cost/colour, prototype (native order) and Chinese display',()=>{
  const o=rawTroops.find((t:{id:number})=>t.id===6217)!;
  expect(o.stats.spell).toMatchObject({id:7359,desc:'Deal [Magic + 3] damage to an enemy and Disease them.'});
  expect(o.ManaCost).toBe(7);expect(Object.keys(o._ManaColors_parsed)).toEqual(['ColorRed']);
  const n=native.get(7359).raw;
  expect(n).toMatchObject({Id:7359,Cost:7,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:1,Type:'CauseDisease'},
   {Amount:925,Type:'Delay'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:3,Primarypower:true,Type:'Damage'},
  ]);
  // FIXED L5-013 (R001): Disease before Damage
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'disease',turns:3},
   {kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1}},
  ]});
  const t=TROOPS.find(t=>t.id===6217)!;
  expect(t).toMatchObject({id:6217,manaCost:7,manaColors:COLORS,spell:{id:7359}});
  expect(t.spell.description).toBe('对 1 名敌人造成 [魔法 + 3] 点伤害并使其陷入疾病状态。');
 });
 for(const side of SIDES)for(const magic of [0,8])
 it(`real cast side=${side} magic=${magic}: chosen enemy 12 Diseased then takes M+3 (armor first)`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:12,enemies:[{},{},{armor:2},{}]});
  const ev=f.cast();
  expect(seq(ev)).toEqual(['disease@12','dmg@12']);
  expect(f.foes[2].armor).toBe(0);expect(f.foes[2].hp).toBe(1000-(magic+3-2));
  expect(sids(f.foes[2])).toEqual(['disease']);
  expect(f.foes.filter((_,i)=>i!==2).every(e=>e.hp===1000&&e.statuses.length===0)).toBe(true);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('Barrier absorbs the damage but Disease still lands; Disease-immune target still takes damage',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:8,chosen:12});
  a.foes[2].statuses=[{id:'barrier',turns:3}];
  a.cast();expect(a.foes[2].hp).toBe(1000);expect(sids(a.foes[2])).toEqual(['disease']);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:8,chosen:12,enemies:[{},{},{traitIds:['immune']},{}]});
  const ev=b.cast();expect(applied(ev,'disease')).toEqual([]);expect(b.foes[2].hp).toBe(989);
 });
 it('lethal hit: target defeated after being Diseased',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:12,enemies:[{},{},{hp:3},{}]});
  const ev=f.cast();
  expect(applied(ev,'disease')).toEqual([12]);expect(f.foes[2].defeated).toBe(true);
  expect(ev.filter(e=>e.type==='defeat').map(e=>e.characterId)).toEqual([12]);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:12}),COST);
});

// ───────────────────────── troop:6924 / spell 8393 ─────────────────────────
describe('L5 troop:6924 / spell:8393 Enrage all allies and all enemies',()=>{
 const SK='8393',COST=6,COLORS=[BaseColor.Red];
 it('source, native steps, binding, cost/colour, prototype (native order) and Chinese display',()=>{
  const o=rawTroops.find((t:{id:number})=>t.id===6924)!;
  expect(o.stats.spell).toMatchObject({id:8393,desc:'Enrage all Allies and Enemies.'});
  expect(o.ManaCost).toBe(6);expect(Object.keys(o._ManaColors_parsed)).toEqual(['ColorRed']);
  const n=native.get(8393).raw;
  expect(n).toMatchObject({Id:8393,Cost:6,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'AllAllies',Amount:1,Type:'CauseEnraged'},
   {Target:'AllEnemies',Type:'CauseEnraged'},
  ]);
  // FIXED L5-013 (R001): allies first, then enemies
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'allyAll',statusId:'rage',turns:3},
   {kind:'status',target:'enemyAll',statusId:'rage',turns:3},
  ]});
  const t=TROOPS.find(t=>t.id===6924)!;
  expect(t).toMatchObject({id:6924,manaCost:6,manaColors:COLORS,spell:{id:8393}});
  expect(t.spell.description).toBe('赋予所有敌人和盟友狂怒效果。');
 });
 for(const side of SIDES)
 it(`real cast side=${side}: every living ally (incl. caster) then every living enemy is Enraged`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic:5,chosen:10,enemies:[{},{defeated:true,hp:0},{},{}]});
  const ev=f.cast();
  expect(seq(ev)).toEqual(['rage@0','rage@1','rage@10','rage@12','rage@13']);
  expect(f.foes[1].statuses).toEqual([]);
  expect(ev.some(e=>e.type==='skill-damage')).toBe(false);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('R011: Blessed enemy is Enraged too (positive); already-Enraged unit refreshed, not duplicated (enraged alias counts)',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:5,chosen:10});
  f.foes[0].statuses=[{id:'blessed',turns:3}];f.ally.statuses=[{id:'rage',turns:1}];
  const ev=f.cast();
  expect(applied(ev,'rage')).toEqual([0,1,10,11,12,13]);
  expect(sids(f.foes[0])).toEqual(['blessed','rage']);
  expect(f.ally.statuses.filter(s=>s.id==='rage')).toHaveLength(1);
 });
 it('mana block: costs 6',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:5,chosen:10});
  f.caster.mana=5;expect(f.cast()).toEqual([]);expect(f.foes.every(e=>e.statuses.length===0)).toBe(true);
 });
});

// ───────────────────────── troop:6546 / spell 7740 ─────────────────────────
describe('L5 troop:6546 / spell:7740 Enrage the last enemy, then Magic+6 true damage to it',()=>{
 const SK='7740',COST=12,COLORS=[BaseColor.Green,BaseColor.Red];
 it('source, native steps, binding, cost/colours, prototype (native order) and Chinese display',()=>{
  const o=rawTroops.find((t:{id:number})=>t.id===6546)!;
  expect(o.stats.spell).toMatchObject({id:7740,desc:'Deal [Magic + 6] true damage to the last enemy. Enrage them.'});
  expect(o.ManaCost).toBe(12);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorGreen','ColorRed']);
  const n=native.get(7740).raw;
  expect(n).toMatchObject({Id:7740,Cost:12,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'LastEnemy',Amount:1,Type:'CauseEnraged'},
   {SpellPowerMultiplier:1,Target:'LastEnemy',Amount:6,Primarypower:true,Type:'TrueDamage'},
  ]);
  // FIXED L5-013 (R001): Enrage before TrueDamage
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyLast',statusId:'rage',turns:3},
   {kind:'damage',target:'enemyLast',scaling:{base:6,mult:1},trueDamage:true},
  ]});
  const t=TROOPS.find(t=>t.id===6546)!;
  expect(t).toMatchObject({id:6546,manaCost:12,manaColors:COLORS,spell:{id:7740}});
  expect(t.spell.description).toBe('对最后一名敌人造成 [魔法 + 6] 点真实伤害，并使其获得狂怒状态。');
 });
 for(const side of SIDES)for(const magic of [0,7])
 it(`real cast side=${side} magic=${magic}: last enemy 13 Enraged, then loses M+6 Life ignoring armor`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:10,enemies:[{},{},{},{armor:30}]});
  const ev=f.cast();
  expect(seq(ev)).toEqual(['rage@13','dmg@13']);
  expect([f.foes[3].hp,f.foes[3].armor]).toEqual([1000-(magic+6),30]);
  expect(sids(f.foes[3])).toEqual(['rage']);
  expect(f.foes.slice(0,3).every(e=>e.hp===1000&&e.statuses.length===0)).toBe(true);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('dead last enemy: the last living enemy (12) is used; lethal true damage defeats it',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10,enemies:[{},{},{hp:5},{defeated:true,hp:0}]});
  const ev=f.cast();
  expect(applied(ev,'rage')).toEqual([12]);expect(f.foes[2].defeated).toBe(true);
  expect(ev.filter(e=>e.type==='defeat').map(e=>e.characterId)).toEqual([12]);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10}),COST);
});

// ───────────────────────── weapon:1072 / spell 7185 Spider's Kiss ─────────────────────────
describe('L5 weapon:1072 / spell:7185 Entangle the first enemy and deal Magic+2 true damage',()=>{
 const COST=14,COLORS=[BaseColor.Purple];
 const expected={segments:[
  {kind:'status',target:'enemyFront',statusId:'entangle',turns:3},
  {kind:'damage',target:'enemyFront',scaling:{base:2,mult:1},trueDamage:true},
 ]};
 it('gowhead English, native steps, numeric + gw_SpidersKiss aliases, cost/colour, Chinese display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1072)!;
  expect(o.stats.spell).toMatchObject({id:7185,desc:'Entangle the first Enemy, and deal [Magic + 2] true damage.'});
  expect(o.ManaCost??o.manaCost).toBe(14);expect(Object.keys(o._ManaColors_parsed)).toEqual(['ColorPurple']);
  const n=native.get(7185).raw;
  expect(n).toMatchObject({Id:7185,Cost:14,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'FrontEnemy',Type:'CauseEntangle'},
   {SpellPowerMultiplier:1,Target:'FrontEnemy',Amount:2,Primarypower:true,Type:'TrueDamage'},
  ]);
  const w=weapons.find(v=>v.id===1072)!;
  expect(w).toMatchObject({id:1072,referenceName:'SpidersKiss',manaCost:14,manaColors:['Purple'],spell:{id:7185}});
  expect(w.spell.description).toBe('缠绕第一名敌人，并造成 [魔法 + 2] 点真实伤害。');
  // FIXED L5-012: TrueDamage step was missing from the prototype
  expect(registry.prototypes.get('7185')).toEqual(expected);
  expect(registry.prototypes.get('gw_SpidersKiss')).toEqual(expected);
 });
 for(const side of SIDES)for(const alias of ['7185','gw_SpidersKiss'])for(const magic of [0,6])
 it(`FIXED L5-012: real cast ${side}/${alias}/magic=${magic}: front enemy Entangled then loses M+2 Life ignoring armor`,()=>{
  const f=setup({skill:alias,cost:COST,colors:COLORS,side,magic,chosen:10,enemies:[{armor:20},{},{},{}]});
  const ev=f.cast();
  expect(seq(ev)).toEqual(['entangle@10','dmg@10']);
  expect([f.foes[0].hp,f.foes[0].armor]).toEqual([1000-(magic+2),20]);
  expect(sids(f.foes[0])).toEqual(['entangle']);
  expect(f.foes.slice(1).every(e=>e.hp===1000&&e.statuses.length===0)).toBe(true);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('dead front enemy: first living enemy (11) is used; Invulnerable front takes no Entangle',()=>{
  const f=setup({skill:'7185',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:6,chosen:10,enemies:[{defeated:true,hp:0},{},{},{}]});
  const ev=f.cast();expect(seq(ev)).toEqual(['entangle@11','dmg@11']);expect(f.foes[1].hp).toBe(992);
  const g=setup({skill:'7185',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:6,chosen:10,enemies:[{traitIds:['invulnerable']},{},{},{}]});
  const gev=g.cast();expect(applied(gev,'entangle')).toEqual([]);
 });
 block(()=>setup({skill:'gw_SpidersKiss',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:6,chosen:10}),COST);
});
