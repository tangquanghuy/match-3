// Lane L5 (status apply / cleanse / dispel) batch B04, reviewer sa-L5.
// Per-entity stored-source binding + real TurnEngine.castSkill evidence.
// Tests named "FIXED L5-xxx" assert behaviour repaired in this batch (rulings/R001 native order).
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
import {SeededRNG} from '@engine/rng';
import {BaseColor,PlayerSide,type Character} from '@engine/types';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';

const rawTroops=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
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
 return {...f,ally,foes,engine,other,cast:()=>engine.castSkill(f.caster.id) as any[]};
}
const applied=(ev:any[],status:string)=>ev.filter(e=>e.type==='status-apply'&&e.statusId===status).map(e=>e.targetId);
const sids=(c:Character)=>c.statuses.map(s=>s.id);
const seq=(ev:any[])=>ev.filter(e=>e.type==='status-apply'||e.type==='skill-damage').map(e=>e.type==='skill-damage'?`dmg@${e.targetId}`:`${e.statusId}@${e.targetId}`);
const SIDES=[PlayerSide.Left,PlayerSide.Right];
const block=(mk:()=>ReturnType<typeof setup>,cost:number)=>{
 for(const mode of ['low-mana','silence'] as const)it(`${mode} blocks the real cast`,()=>{
  const f=mk();if(mode==='low-mana')f.caster.mana=cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.foes.every(e=>e.statuses.length===0)).toBe(true);
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

// ───────────────────────── troop:6192 / spell 7333 Borealis ─────────────────────────
describe('L5 troop:6192 / spell:7333 Freeze all enemies, Magic+18 damage to the weakest',()=>{
 const SK='7333',COST=14,COLORS=[BaseColor.Blue,BaseColor.Yellow];
 it('source, native steps, binding, cost/colours, prototype and Chinese display',()=>{
  bind(6192,7333,'Freeze all Enemies. Deal [Magic + 18] damage to the weakest Enemy.',14,['ColorBlue','ColorYellow'],'冻结所有敌人。对最虚弱的敌人造成 [魔法 + 18] 点伤害。',COLORS);
  const n=native.get(7333).raw;
  expect(n).toMatchObject({Id:7333,Cost:14,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'AllEnemies',Amount:1,Type:'CauseFrozen'},
   {SpellPowerMultiplier:1,Target:'WeakestEnemy',Amount:18,Primarypower:true,Type:'Damage'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyAll',statusId:'frozen',turns:3},
   {kind:'damage',target:'enemyWeakest',scaling:{base:18,mult:1}},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,6])
 it(`real cast side=${side} magic=${magic}: all living enemies Frozen, then lowest-Life enemy takes M+18 (armor first)`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:10,enemies:[{hp:900},{hp:400,armor:5},{hp:700},{defeated:true,hp:0}]});
  const ev=f.cast();
  expect(seq(ev)).toEqual(['frozen@10','frozen@11','frozen@12','dmg@11']);
  expect([f.foes[1].hp,f.foes[1].armor]).toEqual([400-(magic+18-5),0]);
  expect([f.foes[0].hp,f.foes[2].hp]).toEqual([900,700]);
  for(const e of f.foes.slice(0,3))expect(sids(e)).toEqual(['frozen']);
  expect(f.foes[3].statuses).toEqual([]);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('lethal on the weakest; Blessed enemy not Frozen but can still be the weakest target',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10,enemies:[{},{hp:10,statuses:[{id:'blessed',turns:3}]},{},{}]});
  const ev=f.cast();
  expect(applied(ev,'frozen')).toEqual([10,12,13]);
  expect(f.foes[1].defeated).toBe(true);expect(ev.filter(e=>e.type==='defeat').map(e=>e.characterId)).toEqual([11]);
 });
 it('Frozen does not block casting in this engine (official: blocks extra turns); Silence still does',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10});
  f.cast();expect(f.foes.every(e=>sids(e).includes('frozen'))).toBe(true);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10}),COST);
});

// ───────────────────────── troop:6136 / spell 7238 Spider Swarm ─────────────────────────
describe('L5 troop:6136 / spell:7238 Poison then Magic+2 damage to the chosen enemy',()=>{
 const SK='7238',COST=6,COLORS=[BaseColor.Red];
 it('source, native steps, binding, cost/colour, prototype and Chinese display',()=>{
  bind(6136,7238,'Deal [Magic + 2] damage to an Enemy and Poison them.',6,['ColorRed'],'使 1 名敌人陷入中毒状态并造成 [魔法 + 2] 点伤害。',COLORS);
  const n=native.get(7238).raw;
  expect(n).toMatchObject({Id:7238,Cost:6,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:1,Type:'CausePoison'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:2,Primarypower:true,Type:'Damage'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'poison',turns:3,magnitude:3},
   {kind:'damage',target:'enemyChosen',scaling:{base:2,mult:1}},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,5])
 it(`real cast side=${side} magic=${magic}: chosen enemy 12 Poisoned, then takes M+2 (armor first)`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:12,enemies:[{},{},{armor:1},{}]});
  const ev=f.cast();
  expect(seq(ev)).toEqual(['poison@12','dmg@12']);
  expect(f.foes[2].armor).toBe(0);
  // the enemy turn start follows the cast: Poison ticks 0 or 1 true damage (50%)
  const poisonTick=ev.filter(e=>e.type==='status-tick'&&e.targetId===12&&e.statusId==='poison').map(e=>e.damage);
  expect(poisonTick).toHaveLength(1);expect([0,1]).toContain(poisonTick[0]);
  expect(f.foes[2].hp).toBe(1000-(magic+2-1)-poisonTick[0]);
  expect(sids(f.foes[2])).toEqual(['poison']);
  expect(f.foes.filter((_,i)=>i!==2).every(e=>e.hp===1000&&e.statuses.length===0)).toBe(true);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('Poison has no natural cleanse and no expiry (official: removed only by Cleanse); 50% chance of 1 damage ignoring armor',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:12});
  f.cast();const t=f.foes[2];t.armor=10;
  const rng=new SeededRNG(5);let lost=0;
  for(let i=0;i<40;i++){const hp=t.hp;tickStatuses(t,rng);lost+=hp-t.hp;}
  expect(sids(t)).toEqual(['poison']);expect(t.armor).toBe(10);
  expect(lost).toBeGreaterThan(5);expect(lost).toBeLessThan(35);
 });
 it('Barrier absorbs the damage (Poison still lands first); Poison-immune target still takes damage; lethal',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:5,chosen:12});
  a.foes[2].statuses=[{id:'barrier',turns:3}];
  const aev=a.cast();expect(seq(aev)).toEqual(['poison@12']);expect(a.foes[2].hp).toBeGreaterThanOrEqual(999);
  expect(aev.filter(e=>e.type==='status-expire'&&e.targetId===12).map(e=>e.statusId)).toEqual(['barrier']);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:5,chosen:12,enemies:[{},{},{traitIds:['sturdy']},{}]});
  const bev=b.cast();expect(applied(bev,'poison')).toEqual([]);expect(b.foes[2].hp).toBe(993);
  const c=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:0,chosen:12,enemies:[{},{},{hp:2},{}]});
  c.cast();expect(c.foes[2].defeated).toBe(true);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:12}),COST);
});

// ───────────────────────── troop:6646 / spell 7978 Skulk Fang ─────────────────────────
describe('L5 troop:6646 / spell:7978 Poison the weakest enemy, then Magic+2 damage to the same enemy',()=>{
 const SK='7978',COST=8,COLORS=[BaseColor.Purple];
 it('source, native steps, binding, cost/colour, prototype (native order) and Chinese display',()=>{
  bind(6646,7978,'Deal [Magic + 2] damage to the weakest enemy, and Poison them.',8,['ColorPurple'],'对最虚弱的敌人造成 [魔法 + 2] 点伤害，并使之陷入中毒状态。',COLORS);
  const n=native.get(7978).raw;
  expect(n).toMatchObject({Id:7978,Cost:8,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'WeakestEnemy',Amount:1,Type:'CausePoison'},
   {SpellPowerMultiplier:1,Target:'FromPrevious',Amount:2,Primarypower:true,Type:'Damage'},
  ]);
  // FIXED L5-013 (R001): Poison WeakestEnemy first, Damage FromPrevious
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyWeakest',statusId:'poison',turns:3,magnitude:3},
   {kind:'damage',target:'lastTarget',scaling:{base:2,mult:1}},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,5])
 it(`real cast side=${side} magic=${magic}: lowest-Life enemy 13 Poisoned, then takes M+2`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:10,enemies:[{},{hp:600},{hp:800},{hp:300}]});
  const ev=f.cast();
  expect(seq(ev)).toEqual(['poison@13','dmg@13']);
  expect(ev.find(e=>e.type==='skill-damage').damage).toBe(magic+2);
  expect(sids(f.foes[3])).toEqual(['poison']);
  expect(f.foes.slice(0,3).every(e=>e.statuses.length===0)).toBe(true);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('FIXED L5-013: Poison-immune weakest enemy still takes the damage (FromPrevious), nobody else is hit',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:5,chosen:10,enemies:[{},{hp:600},{hp:800},{hp:300,traitIds:['sturdy']}]});
  const ev=f.cast();
  expect(applied(ev,'poison')).toEqual([]);
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[13,7]]);
  expect(f.foes.slice(0,3).every(e=>e.hp===1000||e.hp===600||e.hp===800)).toBe(true);
 });
 it('lethal on the weakest: defeated after being Poisoned; R005 tie on Life+Armor is broken by the RNG; Armor counts',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10,enemies:[{},{hp:2},{},{}]});
  const ev=f.cast();expect(applied(ev,'poison')).toEqual([11]);expect(f.foes[1].defeated).toBe(true);
  const g=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10,enemies:[{},{hp:500},{hp:500},{}]});
  const tie=applied(g.cast(),'poison');expect(tie).toHaveLength(1);expect([11,12]).toContain(tie[0]);
  const h=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10,enemies:[{},{hp:400,armor:200},{hp:500},{}]});
  expect(applied(h.cast(),'poison')).toEqual([12]);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10}),COST);
});

// ───────────────────────── troop:6219 / spell 7361 Moa ─────────────────────────
describe('L5 troop:6219 / spell:7361 Stun then Magic+3 damage to the chosen enemy',()=>{
 const SK='7361',COST=7,COLORS=[BaseColor.Yellow];
 it('source, native steps, binding, cost/colour, prototype (native order) and Chinese display',()=>{
  bind(6219,7361,'Deal [Magic + 3] damage to an enemy and Stun them.',7,['ColorYellow'],'对 1 名敌人造成 [魔法 + 3] 点伤害并将之击晕。',COLORS);
  const n=native.get(7361).raw;
  expect(n).toMatchObject({Id:7361,Cost:7,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:1,Type:'CauseStun'},
   {Amount:1000,Type:'Delay'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:3,Primarypower:true,Type:'Damage'},
  ]);
  // FIXED L5-013 (R001): Stun before Damage
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'stun',turns:3},
   {kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1}},
  ]});
 });
 for(const side of SIDES)for(const magic of [0,8])
 it(`real cast side=${side} magic=${magic}: chosen enemy 11 Stunned, then takes M+3`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:11});
  const ev=f.cast();
  expect(seq(ev)).toEqual(['stun@11','dmg@11']);
  expect(f.foes[1].hp).toBe(1000-(magic+3));expect(sids(f.foes[1])).toEqual(['stun']);
  expect(f.foes.filter((_,i)=>i!==1).every(e=>e.hp===1000&&e.statuses.length===0)).toBe(true);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('Stun-immune target (Thick Head) still takes damage; Barrier absorbs damage but Stun lands; lethal',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:8,chosen:11,enemies:[{},{traitIds:['thickhead']},{},{}]});
  const aev=a.cast();expect(applied(aev,'stun')).toEqual([]);expect(a.foes[1].hp).toBe(989);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:8,chosen:11});
  b.foes[1].statuses=[{id:'barrier',turns:3}];b.cast();expect(b.foes[1].hp).toBe(1000);expect(sids(b.foes[1])).toEqual(['stun']);
  const c=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:0,chosen:11,enemies:[{},{hp:3},{},{}]});
  c.cast();expect(c.foes[1].defeated).toBe(true);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:11}),COST);
});

// ───────────────────────── troop:6222 / spell 7364 Khopeshi ─────────────────────────
describe('L5 troop:6222 / spell:7364 Stun the chosen enemy, then pull it to first position',()=>{
 const SK='7364',COST=7,COLORS=[BaseColor.Blue];
 it('source, native steps, binding, cost/colour, prototype (native order) and Chinese display',()=>{
  bind(6222,7364,'Pull an Enemy to first position and Stun them.',7,['ColorBlue'],'将一名敌人拉到首位并将之击晕。',COLORS);
  const n=native.get(7364).raw;
  expect(n).toMatchObject({Id:7364,Cost:7,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:1,Type:'CauseStun'},
   {Amount:1000,Type:'Delay'},
   {Target:'FromTarget',Type:'TroopOrderFront'},
  ]);
  // FIXED L5-013 (R001): Stun, then TroopOrderFront on the same target
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'stun',turns:3},
   {kind:'reposition',target:'lastTarget',to:'front'},
  ]});
 });
 for(const side of SIDES)
 it(`real cast side=${side}: chosen enemy 12 Stunned and moved to the front; others keep relative order`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic:4,chosen:12});
  const ev=f.cast();
  expect(applied(ev,'stun')).toEqual([12]);
  expect(f.state.teams[f.other].characters.map(c=>c.id)).toEqual([12,10,11,13]);
  expect(sids(f.foes[2])).toEqual(['stun']);
  expect(f.foes.every(e=>e.hp===1000)).toBe(true);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('Stun-immune enemy is still pulled to the front; front enemy chosen stays first',()=>{
  const a=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:4,chosen:13,enemies:[{},{},{},{traitIds:['thickhead']}]});
  const aev=a.cast();expect(applied(aev,'stun')).toEqual([]);
  expect(a.state.teams[a.other].characters.map(c=>c.id)).toEqual([13,10,11,12]);
  const b=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:4,chosen:10});
  b.cast();expect(b.state.teams[b.other].characters.map(c=>c.id)).toEqual([10,11,12,13]);expect(sids(b.foes[0])).toEqual(['stun']);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:12}),COST);
});
