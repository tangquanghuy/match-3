import type { GameEvent } from '@engine/events';
// Lane L5 (status apply / cleanse / dispel) batch B01, reviewer sa-L5.
// Per-entity stored-source binding + real TurnEngine.castSkill evidence.
// Tests named "REPRO L5-xxx" document current runtime behaviour for an issue
// registered in tasks/active/gow-skill-shards/lane-L5/issues.json (they pass on
// current code by design; the issue states the expected GoW behaviour).
// Tests named "FIXED L5-xxx" assert the repaired behaviour (rulings/R002).
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Independent saved native-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {tickStatuses,consumeBarrier,endActionStatuses} from '@engine/skills/effects/status';
import {attachPassives} from '@engine/traits';
import type {SeededRNG} from '@engine/rng';
import {BaseColor,PlayerSide,type Character} from '@engine/types';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';

const rawTroops=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const rawWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);

interface Opts{skill:string;cost:number;colors:BaseColor[];side:PlayerSide;magic:number;chosen:number;allies?:Partial<Character>[];caster?:Partial<Character>}
/** Caster team = [caster id0, ally id1, ally id2]; enemy team = ids 10..13 (1000 hp, 0 armor). */
function setup(o:Opts){
 const f=damageFixture();
 Object.assign(f.caster,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic},o.caster??{});
 const allies=(o.allies??[{},{}]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 const mine=[f.caster,...allies];
 const other=o.side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 f.state.teams[o.side].characters=mine;f.state.teams[other].characters=f.enemies;f.state.activePlayer=o.side;
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.chosen));
 return {...f,allies,mine,engine,other,cast:()=>engine.castSkill(f.caster.id)};
}
const ids=(ev:GameEvent[],type:string,status?:string)=>ev.filter(e=>e.type===type&&(status===undefined||('statusId' in e&&e.statusId===status))).map(e=>'targetId' in e?e.targetId:undefined);
const has=(c:Character,id:string)=>c.statuses.some(s=>s.id===id&&s.turns>0);
const SIDES=[PlayerSide.Left,PlayerSide.Right];

// ───────────────────────── troop:7375 / spell 9015 Virgin Sign ─────────────────────────
describe('L5 troop:7375 / spell:9015 Barrier+Enchant all allies, self Gain Life',()=>{
 const SK='9015',COST=22,COLORS=[BaseColor.Green,BaseColor.Red,BaseColor.Purple];
 it('source, native steps, binding, cost/colours, prototype and Chinese display',()=>{
  const o=rawTroops.find((t:{id:number})=>t.id===7375)!;
  expect(o.stats.spell).toMatchObject({id:9015,desc:'Barrier and Enchant all Allies. Gain [(Magic x 2) + 1] Life.'});
  expect(o.ManaCost).toBe(22);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorGreen','ColorPurple','ColorRed']);
  const n=native.get(9015).raw;
  expect(n).toMatchObject({Id:9015,Cost:22,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'AllAllies',Amount:1,Type:'CauseBarrier'},
   {Target:'AllAllies',Type:'CauseEnchanted'},
   {SpellPowerMultiplier:2,Target:'Self',Amount:1,Primarypower:true,Type:'IncreaseHealth'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'allyAll',statusId:'barrier',turns:3},
   {kind:'status',target:'allyAll',statusId:'enchanted',turns:3},
   {kind:'buff',target:'allySelf',stat:'hp',scaling:{base:1,mult:2},lifeMode:'gain'},
  ]});
  const t=TROOPS.find(t=>t.id===7375)!;
  expect(t).toMatchObject({id:7375,manaCost:22,manaColors:COLORS,spell:{id:9015}});
  expect(t.spell.description).toBe('赋予所有盟友屏障和法印状态效果。获得 [(魔法 x 2) + 1] 点生命值。');
 });
 for(const side of SIDES)for(const magic of [0,7])
 it(`real cast side=${side} magic=${magic}: all living allies Barrier+Enchanted, only caster gains 2M+1 Life`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:0,caster:{hp:900}});
  const ev=f.cast();const gain=2*magic+1;
  expect(ids(ev,'status-apply','barrier')).toEqual([0,1,2]);
  expect(ids(ev,'status-apply','enchanted')).toEqual([0,1,2]);
  for(const c of f.mine){expect(has(c,'barrier')).toBe(true);expect(has(c,'enchanted')).toBe(true);}
  for(const e of f.enemies){expect(e.statuses).toEqual([]);expect(e.hp).toBe(1000);}
  expect([f.caster.hp,f.caster.maxHp]).toEqual([900+gain,1000+gain]);
  for(const a of f.allies)expect([a.hp,a.maxHp]).toEqual([1000,1000]);
  // step order: barrier events precede enchanted, Life gain last
  const order=ev.filter(e=>e.type==='status-apply'||e.type==='buff').map(e=>e.type==='buff'?'life':e.statusId);
  expect(order).toEqual(['barrier','barrier','barrier','enchanted','enchanted','enchanted','life']);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('dead ally skipped; R011: Blessed ally still gets both positives; existing Barrier refreshed (not duplicated)',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:7,chosen:0,
   allies:[{defeated:true,hp:0},{statuses:[{id:'blessed',turns:3}]}],caster:{statuses:[{id:'barrier',turns:1}]}});
  const ev=f.cast();
  expect(ids(ev,'status-apply','barrier')).toEqual([0,2]);expect(ids(ev,'status-apply','enchanted')).toEqual([0,2]);
  expect(f.caster.statuses.filter(s=>s.id==='barrier')).toEqual([{id:'barrier',turns:3}]);
  expect(f.allies[0].statuses).toEqual([]);expect(f.allies[1].statuses.map(s=>s.id).sort()).toEqual(['barrier','blessed','enchanted']);
 });
 it('Enchanted gives +2 mana at owner turn start through the real turn flow',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:7,chosen:0});
  f.cast();f.engine.passTurn();f.engine.passTurn();
  expect([f.caster.mana,f.allies[0].mana,f.allies[1].mana]).toEqual([2,2,2]);
 });
 it('FIXED L5-001/L5-002 (R002): Barrier and Enchanted have no time limit; Enchanted ends on cast, Barrier on damage',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:7,chosen:0});
  f.cast();
  for(let i=0;i<10;i++)f.engine.passTurn();
  expect(f.mine.every(c=>has(c,'barrier')&&has(c,'enchanted'))).toBe(true);
  // 5 owner turn-starts, +2 mana each while Enchanted
  expect(f.allies[0].mana).toBe(10);
  // direct ticks do not decrement either status
  for(const c of f.mine)tickStatuses(c);
  expect(f.mine.every(c=>c.statuses.filter(s=>s.id==='barrier'||s.id==='enchanted').every(s=>s.turns===3))).toBe(true);
  // Casting removes the caster's Enchanted only (re-cast re-applies to everyone: fresh instances kept)
  f.state.activePlayer=PlayerSide.Left;f.caster.mana=COST;
  const ev=f.cast();
  expect(ids(ev,'status-expire','enchanted')).toEqual([0]);
  expect(f.mine.every(c=>has(c,'enchanted'))).toBe(true);
 });
 for(const mode of ['low-mana','silence'] as const)it(`${mode} blocks the real cast`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:7,chosen:0});
  if(mode==='low-mana')f.caster.mana=COST-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.allies.every(a=>a.statuses.length===0)).toBe(true);
 });
});

// ───────────────────────── weapon:1368 / spell 8403 Lockstone ─────────────────────────
describe('L5 weapon:1368 / spell:8403 self Barrier, Magic+3 to chosen enemy, Silence them',()=>{
 const COST=13,COLORS=[BaseColor.Green];
 const expected={segments:[
  {kind:'status',target:'allySelf',statusId:'barrier',turns:3},
  {kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1}},
  {kind:'status',target:'lastTarget',statusId:'silence',turns:3},
 ]};
 it('gowhead English, native steps, numeric + gw_Lockstone aliases, cost/colour, Chinese display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1368)!;
  expect(o.stats.spell).toMatchObject({id:8403,desc:'Gain a Barrier. Deal [Magic + 3] damage to an Enemy, and Silence them.'});
  expect(o.ManaCost??o.manaCost).toBe(13);expect(Object.keys(o._ManaColors_parsed)).toEqual(['ColorGreen']);
  const n=native.get(8403).raw;
  expect(n).toMatchObject({Id:8403,Cost:13,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'Self',Amount:1,Type:'CauseBarrier'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:3,Primarypower:true,Type:'Damage'},
   {Target:'FromTarget',Type:'CauseSilence'},
  ]);
  const w=weapons.find(v=>v.id===1368)!;
  expect(w).toMatchObject({id:1368,referenceName:'Lockstone',manaCost:13,manaColors:['Green'],spell:{id:8403}});
  expect(w.spell.description).toBe('获得屏障效果。对一名敌人造成 [魔法 + 3] 点伤害并使其陷入沉默状态。');
  expect(registry.prototypes.get('8403')).toEqual(expected);
  expect(registry.prototypes.get('gw_Lockstone')).toEqual(expected);
 });
 for(const side of SIDES)for(const alias of ['8403','gw_Lockstone'])for(const magic of [0,9])
 it(`real cast ${side}/${alias}/magic=${magic}: caster Barrier, enemy 12 takes M+3 and is Silenced`,()=>{
  const f=setup({skill:alias,cost:COST,colors:COLORS,side,magic,chosen:12,allies:[{}]});
  const ev=f.cast();
  expect(ids(ev,'status-apply','barrier')).toEqual([0]);expect(has(f.caster,'barrier')).toBe(true);
  expect(f.allies[0].statuses).toEqual([]);
  expect(f.enemies.map(e=>1000-e.hp)).toEqual([0,0,magic+3,0]);
  expect(ev.filter(e=>e.type==='status-apply').filter(e=>e.statusId==='silence').map(e=>[e.targetId,e.turns])).toEqual([[12,3]]);
  // the opponent's turn start ticks immediately after the cast: R004 no countdown, recovery roll failed (10 -> 20)
  expect(f.enemies[2].statuses.map(s=>[s.id,s.turns,s.recoveryChance])).toEqual([['silence',3,20]]);
  expect(f.enemies.filter((_,i)=>i!==2).every(e=>e.statuses.length===0)).toBe(true);
  const order=ev.filter(e=>e.type==='status-apply'||e.type==='skill-damage').map(e=>e.type==='skill-damage'?'dmg':e.statusId);
  expect(order).toEqual(['barrier','dmg','silence']);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('enemy Barrier absorbs the damage but Silence still lands; lethal hit leaves no Silence',()=>{
  const a=setup({skill:'gw_Lockstone',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:12});
  a.enemies[2].statuses=[{id:'barrier',turns:3}];
  const ev=a.cast();
  expect(a.enemies[2].hp).toBe(1000);expect(a.enemies[2].statuses.map(s=>s.id)).toEqual(['silence']);
  expect(ids(ev,'status-expire','barrier')).toEqual([12]);
  const b=setup({skill:'8403',cost:COST,colors:COLORS,side:PlayerSide.Right,magic:9,chosen:12});
  const victim=b.enemies[2];victim.hp=5;
  const ev2=b.cast();
  expect(victim.defeated).toBe(true);expect(victim.statuses).toEqual([]);expect(ids(ev2,'status-apply','silence')).toEqual([]);
  expect(ids(ev2,'status-apply','barrier')).toEqual([0]);
  expect(ev2.filter(e=>e.type==='defeat').map(e=>e.characterId)).toEqual([12]);
 });
 it('Invulnerable enemy takes damage but is immune to Silence; already-Silenced enemy is refreshed not duplicated',()=>{
  const f=setup({skill:'8403',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:12});
  f.enemies[2].traitIds=['invulnerable'];attachPassives(f.enemies[2]);
  const ev=f.cast();
  expect(f.enemies[2].hp).toBe(988);expect(ids(ev,'status-apply','silence')).toEqual([]);expect(has(f.enemies[2],'silence')).toBe(false);
  const g=setup({skill:'8403',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:12});
  g.enemies[2].statuses=[{id:'silence',turns:1}];const gev=g.cast();
  expect(gev.filter(e=>e.type==='status-apply').filter(e=>e.statusId==='silence').map(e=>e.turns)).toEqual([3]);
  expect(g.enemies[2].statuses.map(s=>[s.id,s.turns,s.recoveryChance])).toEqual([['silence',3,20]]);
 });
 it('FIXED L5-005 (R004): Silence has no 3-turn cap; it ends only on the cumulative self-cleanse roll',()=>{
  const f=setup({skill:'8403',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:12});
  const t=f.enemies[2];f.cast();expect(t.statuses.map(s=>s.turns)).toEqual([3]);
  for(let i=0;i<6;i++)tickStatuses(t);expect(has(t,'silence')).toBe(true);
  tickStatuses(t,{next:()=>0.99} as unknown as SeededRNG);expect(t.statuses[0].recoveryChance).toBe(30);
  tickStatuses(t,{next:()=>0.29} as unknown as SeededRNG);expect(has(t,'silence')).toBe(false);
 });
 for(const mode of ['low-mana','silence'] as const)it(`${mode} blocks the real cast`,()=>{
  const f=setup({skill:'gw_Lockstone',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:12});
  if(mode==='low-mana')f.caster.mana=COST-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.enemies.every(e=>e.hp===1000&&e.statuses.length===0)).toBe(true);
 });
});

// ───────────────────────── troop:6840 / spell 8245 Rally Troops! ─────────────────────────
describe('L5 troop:6840 / spell:8245 Barrier chosen ally + Magic+1 Armor, Knight doubles armor',()=>{
 const SK='8245',COST=12,COLORS=[BaseColor.Green,BaseColor.Brown];
 it('source, native steps, binding, cost/colours, prototype and Chinese display',()=>{
  const o=rawTroops.find((t:{id:number})=>t.id===6840)!;
  expect(o.stats.spell).toMatchObject({id:8245,desc:'Barrier an Ally, and give [Magic + 1] Armor to them. If the Ally is a Knight, give double the effect.'});
  expect(o.ManaCost).toBe(12);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorBrown','ColorGreen']);
  const n=native.get(8245).raw;
  expect(n).toMatchObject({Id:8245,Cost:12,Target:'Ally'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Type:'CauseBarrier'},
   {SpellPowerMultiplier:1,Target:'FromTarget',StatusAmount:2,Amount:1,Primarypower:true,StatusModifier:'MultiplyForKnight',Type:'IncreaseArmor'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'allyChosen',statusId:'barrier',turns:3},
   {kind:'buff',target:'allyChosen',stat:'armor',scaling:{base:1,mult:1},raceDouble:'Knight'},
  ]});
  const t=TROOPS.find(t=>t.id===6840)!;
  expect(t).toMatchObject({id:6840,manaCost:12,manaColors:COLORS,spell:{id:8245}});
  expect(t.spell.description).toBe('赋予一名盟友屏障效果，再给予其 [魔法 + 1] 点护甲值。若盟友是一名骑士，则数值双倍。');
 });
 for(const side of SIDES)for(const magic of [0,7])for(const knight of [false,true])
 it(`real cast side=${side} magic=${magic} knight=${knight}: only chosen ally gets Barrier and ${knight?'2x':'1x'}(M+1) armor`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:2,allies:[{},{troopTypes:knight?['Knight']:['Human']}]});
  const ev=f.cast();const armor=(magic+1)*(knight?2:1);
  expect(ids(ev,'status-apply','barrier')).toEqual([2]);
  expect(f.allies[1].statuses).toEqual([{id:'barrier',turns:3}]);expect(f.allies[1].armor).toBe(armor);
  expect(f.caster.statuses).toEqual([]);expect(f.caster.armor).toBe(0);expect(f.allies[0].armor).toBe(0);
  expect(f.enemies.every(e=>e.statuses.length===0&&e.armor===0)).toBe(true);
  expect(ev.filter(e=>e.type==='status-apply'||e.type==='buff').map(e=>e.type)).toEqual(['status-apply','buff']);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('Knight-double scales Armor only (single Barrier); R011: Blessed Knight gets doubled armor and Barrier',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:7,chosen:1,allies:[{troopTypes:['Knight'],statuses:[{id:'blessed',turns:3}]}]});
  const ev=f.cast();
  expect(ids(ev,'status-apply','barrier')).toEqual([1]);expect(f.allies[0].armor).toBe(16);
  expect(f.allies[0].statuses.map(s=>s.id)).toEqual(['blessed','barrier']);
 });
 it('FIXED L5-001 (R002): Barrier on the chosen ally persists without damage, then absorbs one skull hit and is removed',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:7,chosen:1,allies:[{}]});
  f.cast();for(let i=0;i<10;i++)f.engine.passTurn();expect(has(f.allies[0],'barrier')).toBe(true);
  // absorbed by the Barrier: Life and Armor untouched, Barrier consumed
  const armor=f.allies[0].armor;
  const r=consumeBarrier(f.allies[0]);
  expect(r.consumed).toBe(true);expect(has(f.allies[0],'barrier')).toBe(false);
  expect([f.allies[0].hp,f.allies[0].armor]).toEqual([1000,armor]);
 });
 for(const mode of ['low-mana','silence'] as const)it(`${mode} blocks the real cast`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:7,chosen:1});
  if(mode==='low-mana')f.caster.mana=COST-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);expect(f.allies[0].armor).toBe(0);
 });
});

// ───────────────────────── troop:6406 / spell 7561 Protective Shell ─────────────────────────
describe('L5 troop:6406 / spell:7561 chosen ally Magic+3 Armor, Barrier, then Submerge',()=>{
 const SK='7561',COST=10,COLORS=[BaseColor.Blue,BaseColor.Yellow];
 it('source, native steps, binding, cost/colours, prototype (segment order) and Chinese display',()=>{
  const o=rawTroops.find((t:{id:number})=>t.id===6406)!;
  expect(o.stats.spell).toMatchObject({id:7561,desc:'Give an ally [Magic + 3] Armor and Barrier, then Submerge them.'});
  expect(o.ManaCost).toBe(10);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorBlue','ColorYellow']);
  const n=native.get(7561).raw;
  expect(n).toMatchObject({Id:7561,Cost:10,Target:'Ally'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Type:'CauseBarrier'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:3,Primarypower:true,Type:'IncreaseArmor'},
   {Target:'FromTarget',Type:'CauseSubmerged'},
  ]);
  // Registered order is Armor -> Barrier -> Submerge (native: Barrier -> Armor -> Submerge).
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'buff',target:'allyChosen',stat:'armor',scaling:{base:3,mult:1}},
   {kind:'status',target:'allyChosen',statusId:'barrier',turns:3},
   {kind:'status',target:'allyChosen',statusId:'submerged',turns:3},
  ]});
  const t=TROOPS.find(t=>t.id===6406)!;
  expect(t).toMatchObject({id:6406,manaCost:10,manaColors:COLORS,spell:{id:7561}});
  expect(t.spell.description).toBe('增加一个盟友 [魔法 + 3] 点护甲值，赋予其屏障效果，并使其下潜。');
 });
 for(const side of SIDES)for(const magic of [0,11])
 it(`real cast side=${side} magic=${magic}: only chosen ally gets M+3 armor, Barrier and Submerged`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:1});
  const ev=f.cast();
  expect(f.allies[0].armor).toBe(magic+3);
  expect(f.allies[0].statuses).toEqual([{id:'barrier',turns:3},{id:'submerged',turns:3}]);
  expect(f.caster.statuses).toEqual([]);expect(f.allies[1].statuses).toEqual([]);expect(f.allies[1].armor).toBe(0);
  expect(f.enemies.every(e=>e.statuses.length===0)).toBe(true);
  expect(ev.filter(e=>e.type==='status-apply'||e.type==='buff').map(e=>e.type==='buff'?'armor':e.statusId)).toEqual(['armor','barrier','submerged']);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('caster may choose itself; R011: Blessed ally gets armor, Barrier and Submerge; already-Submerged is refreshed',()=>{
  const s=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:11,chosen:0});
  s.cast();expect(s.caster.armor).toBe(14);expect(s.caster.statuses.map(x=>x.id)).toEqual(['barrier','submerged']);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:11,chosen:1,allies:[{statuses:[{id:'blessed',turns:3}]}]});
  b.cast();expect(b.allies[0].armor).toBe(14);expect(b.allies[0].statuses.map(x=>x.id)).toEqual(['blessed','barrier','submerged']);
  const r=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:11,chosen:1,allies:[{statuses:[{id:'submerged',turns:1}]}]});
  r.cast();expect(r.allies[0].statuses.filter(x=>x.id==='submerged')).toEqual([{id:'submerged',turns:3}]);
 });
 it('dead chosen ally is not a legal target: cast refused, no effect, no mana/action spent',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:11,chosen:1,allies:[{defeated:true,hp:0},{}]});
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);expect(f.caster.mana).toBe(COST);
  expect(f.mine.every(c=>c.armor===0&&c.statuses.length===0)).toBe(true);
 });
 it('FIXED L5-004 (R004): Submerged has no time limit and no natural cleanse; it ends when the holder acts',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:11,chosen:1});
  f.cast();for(let i=0;i<6;i++)tickStatuses(f.allies[0],{next:()=>0} as unknown as SeededRNG);
  expect(has(f.allies[0],'submerged')).toBe(true);
  expect(endActionStatuses(f.allies[0]).map(e=>e.type==='status-expire'&&e.statusId)).toEqual(['submerged']);
  expect(has(f.allies[0],'submerged')).toBe(false);
  // Barrier from the same cast has no time limit (L5-001 fixed, R002)
  expect(has(f.allies[0],'barrier')).toBe(true);
 });
 for(const mode of ['low-mana','silence'] as const)it(`${mode} blocks the real cast`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:11,chosen:1});
  if(mode==='low-mana')f.caster.mana=COST-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);expect(f.allies[0].armor).toBe(0);
 });
});

// ───────────────────────── weapon:1369 / spell 8404 Keystone ─────────────────────────
describe('L5 weapon:1369 / spell:8404 self Barrier, ally Gain 1.5M+1 Life, Cleanse + Enchant them',()=>{
 const COST=13,COLORS=[BaseColor.Red];
 const expected={segments:[
  {kind:'status',target:'allySelf',statusId:'barrier',turns:3},
  {kind:'buff',target:'allyChosen',stat:'hp',scaling:{base:1,mult:1.5},lifeMode:'gain'},
  {kind:'cleanse',target:'lastTarget'},
  {kind:'status',target:'lastTarget',statusId:'enchanted',turns:3},
 ]};
 it('gowhead English, native steps, numeric + gw_Keystone aliases, cost/colour, Chinese display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1369)!;
  expect(o.stats.spell).toMatchObject({id:8404,desc:'Gain a Barrier. Give [(Magic x 1.5) + 1] Life to an Ally. Then Cleanse and Enchant them.'});
  expect(o.ManaCost??o.manaCost).toBe(13);expect(Object.keys(o._ManaColors_parsed)).toEqual(['ColorRed']);
  const n=native.get(8404).raw;
  expect(n).toMatchObject({Id:8404,Cost:13,Target:'Ally'});
  expect(n.SpellSteps).toEqual([
   {Target:'Self',Amount:1,Type:'CauseBarrier'},
   {SpellPowerMultiplier:1.5,Target:'FromTarget',Amount:1,Primarypower:true,Type:'IncreaseHealth'},
   {Target:'FromTarget',Type:'Cleanse'},
   {Target:'FromTarget',Type:'CauseEnchanted'},
  ]);
  const w=weapons.find(v=>v.id===1369)!;
  expect(w).toMatchObject({id:1369,referenceName:'Keystone',manaCost:13,manaColors:['Red'],spell:{id:8404}});
  expect(w.spell.description).toBe('获得屏障效果。给予一名盟友 [(魔法 x 1.5) + 1] 点生命值，并将其净化和赋予其法印效果。');
  expect(registry.prototypes.get('8404')).toEqual(expected);
  expect(registry.prototypes.get('gw_Keystone')).toEqual(expected);
 });
 for(const side of SIDES)for(const alias of ['8404','gw_Keystone'])for(const magic of [0,9])
 it(`real cast ${side}/${alias}/magic=${magic}: caster Barrier; ally 1 gains Life, negatives cleansed, Enchanted`,()=>{
  const f=setup({skill:alias,cost:COST,colors:COLORS,side,magic,chosen:1,allies:[{hp:950,statuses:[{id:'poison',turns:3},{id:'silence',turns:2}]},{}]});
  const ev=f.cast();const gain=Math.round(1.5*magic+1);
  expect(has(f.caster,'barrier')).toBe(true);
  expect([f.allies[0].hp,f.allies[0].maxHp]).toEqual([950+gain,1000+gain]);
  expect(f.allies[0].statuses).toEqual([{id:'enchanted',turns:3}]);
  expect(ev.filter(e=>e.type==='status-cleanse').map(e=>[e.targetId,e.statusIds])).toEqual([[1,['poison','silence']]]);
  expect(f.allies[1].statuses).toEqual([]);expect(f.enemies.every(e=>e.statuses.length===0&&e.hp===1000)).toBe(true);
  const order=ev.filter(e=>e.type==='status-apply'||e.type==='buff'||e.type==='status-cleanse').map(e=>e.type==='buff'?'life':e.type==='status-cleanse'?'cleanse':e.statusId);
  expect(order).toEqual(['barrier','life','cleanse','enchanted']);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('Gain Life half rounding: Magic 7 -> 1.5*7+1 = 11.5 -> 12 (same Math.round as Magic 9 -> 15 above)',()=>{
  const f=setup({skill:'8404',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:7,chosen:1});
  f.cast();expect([f.allies[0].hp,f.allies[0].maxHp]).toEqual([1012,1012]);
 });
 it('FIXED L5-003 (R002): Cleanse removes negatives only (self-target keeps the Barrier just gained; ally keeps its Barrier)',()=>{
  const s=setup({skill:'8404',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:0});
  const ev=s.cast();
  // nothing negative on the caster -> no cleanse event
  expect(ev.filter(e=>e.type==='status-cleanse')).toEqual([]);
  expect(has(s.caster,'barrier')).toBe(true);expect(has(s.caster,'enchanted')).toBe(true);
  const a=setup({skill:'8404',cost:COST,colors:COLORS,side:PlayerSide.Right,magic:9,chosen:1,allies:[{statuses:[{id:'barrier',turns:3},{id:'burning',turns:3}]}]});
  const aev=a.cast();
  expect(aev.filter(e=>e.type==='status-cleanse').map(e=>[e.targetId,e.statusIds])).toEqual([[1,['burning']]]);
  expect(a.allies[0].statuses).toEqual([{id:'barrier',turns:3},{id:'enchanted',turns:3}]);
 });
 it('dead chosen ally is not a legal target: cast refused, no self Barrier, no mana/action spent',()=>{
  const f=setup({skill:'gw_Keystone',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:1,allies:[{defeated:true,hp:0,statuses:[{id:'poison',turns:3}]}]});
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);expect(f.caster.mana).toBe(COST);
  expect(f.caster.statuses).toEqual([]);expect(f.allies[0].statuses).toEqual([{id:'poison',turns:3}]);
 });
 for(const mode of ['low-mana','silence'] as const)it(`${mode} blocks the real cast`,()=>{
  const f=setup({skill:'gw_Keystone',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:1});
  if(mode==='low-mana')f.caster.mana=COST-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);expect(f.allies[0].maxHp).toBe(1000);
 });
});
