// Lane L5 (status apply / cleanse / dispel) batch B06, reviewer sa-L5 (round 3).
// Per-entity stored-source binding + real TurnEngine.castSkill evidence.
// Durations follow rulings/R004; Cleanse removes negatives only (rulings/R002).
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
import {BaseColor,PlayerSide,type Character,type StatusInstance} from '@engine/types';
import type {SeededRNG} from '@engine/rng';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';

const rawTroops=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const roll=(v:number)=>({next:()=>v,nextInt:()=>0}) as unknown as SeededRNG;

interface Opts{skill:string;cost:number;colors:BaseColor[];side:PlayerSide;magic:number;chosen:number;enemies?:Partial<Character>[];allies?:Partial<Character>[]}
/** Caster team = [caster id0, allies id1.., ]; enemies ids 10..13 (1000 hp, 0 armor). */
function setup(o:Opts){
 const f=damageFixture(0,0,o.enemies??[{},{},{},{}]);
 Object.assign(f.caster,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic});
 const allies=(o.allies??[{},{}]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 for(const a of allies)attachPassives(a);
 const other=o.side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 f.state.teams[o.side].characters=[f.caster,...allies];f.state.teams[other].characters=f.enemies;f.state.activePlayer=o.side;
 const foes=[...f.enemies];
 for(const e of foes)attachPassives(e);
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.chosen));
 return {...f,allies,foes,engine,other,cast:()=>engine.castSkill(f.caster.id) as any[]};
}
const applied=(ev:any[],status:string)=>ev.filter(e=>e.type==='status-apply'&&e.statusId===status).map(e=>e.targetId);
const sids=(c:Character)=>c.statuses.map(s=>s.id);
const loss=(f:{foes:Character[]})=>f.foes.map(e=>1000-e.hp);
const seq=(ev:any[])=>ev.filter(e=>['status-apply','skill-damage','status-cleanse','buff'].includes(e.type))
 .map(e=>e.type==='skill-damage'?`dmg@${e.targetId}`:e.type==='status-cleanse'?`cleanse@${e.targetId}`:e.type==='buff'?`${e.stat}@${e.targetId}`:`${e.statusId}@${e.targetId}`);
const SIDES=[PlayerSide.Left,PlayerSide.Right];
const block=(mk:()=>ReturnType<typeof setup>,cost:number)=>{
 for(const mode of ['low-mana','silence'] as const)it(`${mode} blocks the real cast`,()=>{
  const f=mk();if(mode==='low-mana')f.caster.mana=cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  const before=JSON.stringify(f.state.teams);
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(JSON.stringify(f.state.teams)).toBe(before);
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
const MIXED=():StatusInstance[]=>[{id:'poison',turns:3},{id:'curse',turns:3},{id:'stun',turns:3},{id:'reflect',turns:3}];

// ───────────────────────── troop:6512 / spell 7703 ─────────────────────────
describe('L5 troop:6512 / spell:7703 Web + Hunter\'s Mark + Death Mark the first enemy, then Magic+3 to it',()=>{
 const SK='7703',COST=14,COLORS=[BaseColor.Red,BaseColor.Brown];
 it('source, native steps, binding, cost/colours, prototype and Chinese display',()=>{
  bind(6512,7703,'Inflict Web, Hunter\'s Mark and Death Mark on the first Enemy. Deal [Magic + 3] damage to them.',14,['ColorBrown','ColorRed'],'使首位敌人陷入织网、猎人标记和死亡标记状态。对其造成 [魔法 + 3] 点伤害。',COLORS);
  const n=native.get(7703).raw;expect(n).toMatchObject({Id:7703,Cost:14,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'FrontEnemy',Amount:1,Type:'CauseWeb'},
   {Target:'FrontEnemy',Amount:1,Type:'CauseHuntersMark'},
   {Target:'FrontEnemy',Amount:1,Type:'CauseDeathMark'},
   {SpellPowerMultiplier:1,Target:'FrontEnemy',Amount:3,Primarypower:true,Type:'Damage'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyFront',statusId:'web',turns:3},
   {kind:'status',target:'enemyFront',statusId:'marked',turns:3},
   {kind:'status',target:'enemyFront',statusId:'death-mark',turns:3},
   {kind:'damage',target:'enemyFront',scaling:{base:3,mult:1}},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,9])
 it(`real cast side=${side} magic=${magic}: front enemy 10 Webbed, Hunter's Marked, Death Marked, then takes M+3`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:10,enemies:[{armor:2},{},{},{}]});
  const ev=f.cast();
  expect(seq(ev)).toEqual(['web@10','marked@10','death-mark@10','dmg@10']);
  const m=magic+3;expect(f.foes[0].armor).toBe(Math.max(0,2-m));expect(f.foes[0].hp).toBe(1000-Math.max(0,m-2));
  expect(sids(f.foes[0])).toEqual(['web','marked','death-mark']);
  expect(f.foes.slice(1).every(e=>e.statuses.length===0&&e.hp===1000)).toBe(true);
  expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(f.other);
 });
 it('dead front: first living enemy (11) is used; Web-immune (slippery) front still gets both marks and the damage',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:10,enemies:[{defeated:true,hp:0},{},{},{}]});
  expect(seq(a.cast())).toEqual(['web@11','marked@11','death-mark@11','dmg@11']);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:9,chosen:10,enemies:[{traitIds:['slippery']},{},{},{}]});
  expect(seq(b.cast())).toEqual(['marked@10','death-mark@10','dmg@10']);expect(b.foes[0].hp).toBe(988);
 });
 it('lethal hit after the statuses; Barrier absorbs the hit but all three statuses stay',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:10,enemies:[{hp:5},{},{},{}]});
  const ev=a.cast();expect(applied(ev,'death-mark')).toEqual([10]);expect(a.foes[0].defeated).toBe(true);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:10});
  b.foes[0].statuses=[{id:'barrier',turns:3}];b.cast();expect(b.foes[0].hp).toBe(1000);expect(sids(b.foes[0])).toEqual(['web','marked','death-mark']);
 });
 it('R004: the three negatives have no cap and leave together on one roll; Death Mark first owner turn is a grace tick',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10});
  f.cast();const t=f.foes[0];
  for(let i=0;i<6;i++)tickStatuses(t,roll(0.99));expect(sids(t)).toEqual(['web','marked','death-mark']);expect(t.defeated).toBe(false);
  tickStatuses(t,roll(0));expect(sids(t)).toEqual([]);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:10}),COST);
});

// ───────────────────────── troop:6209 / spell 7351 ─────────────────────────
describe('L5 troop:6209 / spell:7351 Magic+2 damage to an enemy and Web them',()=>{
 const SK='7351',COST=7,COLORS=[BaseColor.Purple];
 const PROTO={segments:[
  {kind:'status',target:'enemyChosen',statusId:'web',turns:3},
  {kind:'damage',target:'enemyChosen',scaling:{base:2,mult:1}},
 ]};
 it('source, native steps, binding, cost/colour, prototype and Chinese display',()=>{
  bind(6209,7351,'Deal [Magic + 2] damage to an enemy and Web them.',7,['ColorPurple'],'对 1 名敌人造成 [魔法 + 2] 点伤害并使其陷入织网状态。',COLORS);
  const n=native.get(7351).raw;expect(n).toMatchObject({Id:7351,Cost:7,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:1,Type:'CauseWeb'},
   {Amount:1000,Type:'Delay'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:2,Primarypower:true,Type:'Damage'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual(PROTO);
 });
 for(const side of SIDES)for(const magic of [0,6])
 it(`real cast side=${side} magic=${magic}: chosen 13 takes M+2 and is Webbed; nobody else touched`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:13});
  const ev=f.cast();
  expect(applied(ev,'web')).toEqual([13]);expect(loss(f)).toEqual([0,0,0,magic+2]);
  expect(f.foes.slice(0,3).every(e=>e.statuses.length===0)).toBe(true);expect(f.state.activePlayer).toBe(f.other);
 });
 it('FIXED L5-013 (R001 native order): Web lands before the damage, so a lethal hit still applies the Web first',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:6,chosen:13,enemies:[{},{},{},{hp:3}]});
  const ev=f.cast();
  expect(ev.filter(e=>['status-apply','skill-damage','defeat'].includes(e.type)).map(e=>e.type)).toEqual(['status-apply','skill-damage','defeat']);
  expect(applied(ev,'web')).toEqual([13]);expect(f.foes[3].defeated).toBe(true);
 });
 it('Barrier absorbs the damage, Web still lands; Invulnerable target takes damage but no Web',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:6,chosen:12});
  a.foes[2].statuses=[{id:'barrier',turns:3}];a.cast();expect(a.foes[2].hp).toBe(1000);expect(sids(a.foes[2])).toEqual(['web']);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:6,chosen:12,enemies:[{},{},{traitIds:['invulnerable']},{}]});
  const bev=b.cast();expect(applied(bev,'web')).toEqual([]);expect(b.foes[2].hp).toBe(992);
 });
 it('R004: Web has no cap; one successful roll removes it',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:12});
  f.cast();const t=f.foes[2];for(let i=0;i<6;i++)tickStatuses(t,roll(0.99));expect(sids(t)).toEqual(['web']);
  tickStatuses(t,roll(0));expect(sids(t)).toEqual([]);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:6,chosen:12}),COST);
});

// ───────────────────────── troop:6506 / spell 7696 ─────────────────────────
describe('L5 troop:6506 / spell:7696 Cleanse + Barrier an ally, +2M+2 Life, move it to the front',()=>{
 const SK='7696',COST=14,COLORS=[BaseColor.Yellow,BaseColor.Purple];
 it('source, native steps, binding, cost/colours, prototype and Chinese display',()=>{
  bind(6506,7696,'Cleanse and Barrier an ally and give them [(Magic x 2) + 2] Life. Move them to the front of the team.',14,['ColorPurple','ColorYellow'],'净化一名盟友并赋予其屏障效果，同时给予其 [(魔法 x 2) + 2] 点生命值。将其移至队伍首位。',COLORS);
  const n=native.get(7696).raw;expect(n).toMatchObject({Id:7696,Cost:14,Target:'Ally'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:1,Type:'Cleanse'},
   {Target:'FromTarget',Amount:1,Type:'CauseBarrier'},
   {SpellPowerMultiplier:2,Target:'FromTarget',Amount:2,Primarypower:true,Type:'IncreaseHealth'},
   {Amount:800,Type:'Delay'},
   {Target:'FromTarget',Type:'TroopOrderFront'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'cleanse',target:'allyChosen'},
   {kind:'status',target:'allyChosen',statusId:'barrier',turns:3},
   {kind:'buff',target:'allyChosen',stat:'hp',scaling:{base:2,mult:2},lifeMode:'gain'},
   {kind:'reposition',target:'allyChosen',to:'front'},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,5])
 it(`real cast side=${side} magic=${magic}: ally 2 cleansed of negatives (keeps Reflect), Barriered, +2M+2 Life, moved to front`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:2});
  const a=f.allies[1];a.statuses=MIXED();
  const ev=f.cast();const g=2*magic+2;
  expect(seq(ev).filter(s=>s.endsWith('@2'))).toEqual(['cleanse@2','barrier@2','hp@2']);
  expect(sids(a)).toEqual(['reflect','barrier']);
  expect([a.hp,a.maxHp]).toEqual([1000+g,1000+g]);
  expect(f.state.teams[side].characters.map(c=>c.id)).toEqual([2,0,1]);
  expect(sids(f.allies[0])).toEqual([]);expect(f.foes.every(e=>e.hp===1000&&e.statuses.length===0)).toBe(true);
 });
 it('caster may choose itself; Blessed ally blocks Barrier but still gains Life and moves; already-front ally stays first',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:3,chosen:0});
  a.cast();expect(sids(a.caster)).toEqual(['barrier']);expect(a.caster.maxHp).toBe(1008);expect(a.state.teams.Left.characters.map(c=>c.id)).toEqual([0,1,2]);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:3,chosen:1,allies:[{statuses:[{id:'blessed',turns:3}]},{}]});
  const bev=b.cast();expect(applied(bev,'barrier')).toEqual([]);expect(sids(b.allies[0])).toEqual(['blessed']);
  expect(b.allies[0].maxHp).toBe(1008);expect(b.state.teams.Right.characters.map(c=>c.id)).toEqual([1,0,2]);
 });
 it('dead chosen ally is not a legal target: cast refused, no mana/action spent',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:3,chosen:1,allies:[{defeated:true,hp:0},{}]});
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);expect(f.caster.mana).toBe(COST);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:3,chosen:1}),COST);
});

// ───────────────────────── troop:6325 / spell 7475 ─────────────────────────
describe('L5 troop:6325 / spell:7475 Cleanse, Enchant and give an ally Magic+1 Life',()=>{
 const SK='7475',COST=11,COLORS=[BaseColor.Green,BaseColor.Purple];
 it('source, native steps, binding, cost/colours, prototype and Chinese display',()=>{
  bind(6325,7475,'Cleanse, Enchant and give an ally [Magic + 1] Life.',11,['ColorGreen','ColorPurple'],'净化一名盟友，赋予他法印效果，并给予 [魔法 + 1] 点生命值。',COLORS);
  const n=native.get(7475).raw;expect(n).toMatchObject({Id:7475,Cost:11,Target:'Ally'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:1,Type:'Cleanse'},
   {Target:'FromTarget',Type:'CauseEnchanted'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:1,Primarypower:true,Type:'IncreaseHealth'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'cleanse',target:'allyChosen'},
   {kind:'status',target:'allyChosen',statusId:'enchanted',turns:3},
   {kind:'buff',target:'allyChosen',stat:'hp',scaling:{base:1,mult:1},lifeMode:'gain'},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,8])
 it(`real cast side=${side} magic=${magic}: ally 1 cleansed (keeps Reflect), Enchanted, gains M+1 Life`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:1});
  const a=f.allies[0];a.statuses=MIXED();
  const ev=f.cast();
  expect(seq(ev).filter(s=>s.endsWith('@1'))).toEqual(['cleanse@1','enchanted@1','hp@1']);
  expect(sids(a)).toEqual(['reflect','enchanted']);expect([a.hp,a.maxHp]).toEqual([1001+magic,1001+magic]);
  expect(sids(f.allies[1])).toEqual([]);expect(f.state.activePlayer).toBe(f.other);
 });
 it('Enchanted (R002/R004) gives +2 mana at each owner turn start with no timer and ends when the ally casts',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:2,chosen:1,allies:[{manaCost:20},{}]});
  f.cast();const a=f.allies[0];
  for(let i=0;i<5;i++)tickStatuses(a,roll(0));
  expect(a.mana).toBe(10);expect(sids(a)).toEqual(['enchanted']);
  f.state.activePlayer=PlayerSide.Left;Object.assign(a,{skillId:SK,mana:20,manaCost:20});f.engine.setTargetChooser(new FixedTargetChooser(2));
  const ev=f.engine.castSkill(1);expect(ev.some(e=>e.type==='status-expire'&&e.targetId===1&&e.statusId==='enchanted')).toBe(true);
  expect(sids(a)).toEqual([]);expect(sids(f.allies[1])).toEqual(['enchanted']);
 });
 it('Silenced ally is Cleansed first, so the Enchant mana is not blocked; Blessed ally blocks Enchant only',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:2,chosen:1,allies:[{statuses:[{id:'silence',turns:3}],manaCost:20},{}]});
  a.cast();expect(sids(a.allies[0])).toEqual(['enchanted']);tickStatuses(a.allies[0]);expect(a.allies[0].mana).toBe(2);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:2,chosen:1,allies:[{statuses:[{id:'blessed',turns:3}]},{}]});
  const bev=b.cast();expect(applied(bev,'enchanted')).toEqual([]);expect(b.allies[0].maxHp).toBe(1003);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:2,chosen:1}),COST);
});

// ───────────────────────── troop:6028 / spell 7028 ─────────────────────────
describe('L5 troop:6028 / spell:7028 Cleanse an ally, give Magic+1 Armor and Barrier',()=>{
 const SK='7028',COST=9,COLORS=[BaseColor.Yellow];
 it('source, native steps, binding, cost/colour, prototype and Chinese display',()=>{
  bind(6028,7028,'Cleanse an Ally, and give [Magic + 1] Armor and Barrier to them.',9,['ColorYellow'],'净化一名盟友，并为他提供 [魔法 + 1] 点护甲值和屏障效果。',COLORS);
  const n=native.get(7028).raw;expect(n).toMatchObject({Id:7028,Cost:9,Target:'Ally'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Type:'Cleanse'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:1,Primarypower:true,Type:'IncreaseArmor'},
   {Target:'FromTarget',Amount:1,Type:'CauseBarrier'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'cleanse',target:'allyChosen'},
   {kind:'buff',target:'allyChosen',stat:'armor',scaling:{base:1,mult:1}},
   {kind:'status',target:'allyChosen',statusId:'barrier',turns:3},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,7])
 it(`real cast side=${side} magic=${magic}: ally 2 cleansed (keeps Reflect), +M+1 Armor, Barrier`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:2});
  const a=f.allies[1];a.statuses=MIXED();
  const ev=f.cast();
  expect(seq(ev).filter(s=>s.endsWith('@2'))).toEqual(['cleanse@2','armor@2','barrier@2']);
  expect(sids(a)).toEqual(['reflect','barrier']);expect(a.armor).toBe(magic+1);
  expect(sids(f.allies[0])).toEqual([]);expect(f.allies[0].armor).toBe(0);expect(f.state.activePlayer).toBe(f.other);
 });
 it('Entangled ally: Cleanse runs first so the Armor gain is not affected; ally without statuses gets no cleanse event',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:4,chosen:1,allies:[{statuses:[{id:'entangle',turns:3}]},{}]});
  const aev=a.cast();expect(sids(a.allies[0])).toEqual(['barrier']);expect(a.allies[0].armor).toBe(5);
  expect(aev.filter(e=>e.type==='status-cleanse').map(e=>e.statusIds)).toEqual([['entangle']]);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:4,chosen:1});
  expect(b.cast().filter(e=>e.type==='status-cleanse')).toEqual([]);expect(sids(b.allies[0])).toEqual(['barrier']);
 });
 it('R002: Barrier has no timer, absorbs one hit then is removed; Blessed ally keeps Armor gain but no Barrier',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:4,chosen:1});
  a.cast();for(let i=0;i<6;i++)tickStatuses(a.allies[0],roll(0));expect(sids(a.allies[0])).toEqual(['barrier']);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:4,chosen:1,allies:[{statuses:[{id:'blessed',turns:3}]},{}]});
  const bev=b.cast();expect(applied(bev,'barrier')).toEqual([]);expect(b.allies[0].armor).toBe(5);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:4,chosen:1}),COST);
});
