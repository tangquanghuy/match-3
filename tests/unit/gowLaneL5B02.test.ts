import type { GameEvent } from '@engine/events';
// Lane L5 (status apply / cleanse / dispel) batch B02, reviewer sa-L5.
// Per-entity stored-source binding + real TurnEngine.castSkill evidence.
// Tests named "REPRO L5-xxx" document current runtime behaviour for an issue
// registered in tasks/active/gow-skill-shards/lane-L5/issues.json (they pass on
// current code by design; the issue states the expected GoW behaviour).
// Tests named "FIXED L5-xxx" assert the repaired behaviour (rulings/R001, R002).
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
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.chosen));
 return {...f,ally,foes,engine,other,cast:()=>engine.castSkill(f.caster.id)};
}
const applied=(ev:GameEvent[],status:string)=>ev.filter(e=>e.type==='status-apply').filter(e=>e.statusId===status).map(e=>e.targetId);
const sids=(c:Character)=>c.statuses.map(s=>s.id);
const SIDES=[PlayerSide.Left,PlayerSide.Right];
const block=(mk:()=>ReturnType<typeof setup>,cost:number)=>{
 for(const mode of ['low-mana','silence'] as const)it(`${mode} blocks the real cast`,()=>{
  const f=mk();if(mode==='low-mana')f.caster.mana=cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.foes.every(e=>e.hp===1000&&e.statuses.length===0)).toBe(true);
 });
};

// ───────────────────────── weapon:1142 / spell 7338 Dragonator 8000 ─────────────────────────
describe('L5 weapon:1142 / spell:7338 Burn, Freeze, Silence and Magic+3 damage to random enemies',()=>{
 const COST=11,COLORS=[BaseColor.Brown];
 it('gowhead English, native steps, aliases, cost/colour, Chinese display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1142)!;
  expect(o.stats.spell).toMatchObject({id:7338,desc:'Scientifically Burn, Freeze, Silence, and deal [Magic + 3] damage to random Enemies.'});
  expect(o.ManaCost).toBe(11);expect(Object.keys(o._ManaColors_parsed)).toEqual(['ColorBrown']);
  const n=native.get(7338).raw;
  expect(n).toMatchObject({Id:7338,Cost:11,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'RandomEnemy',Amount:2,Type:'CauseBurning'},
   {Target:'RandomPrefNotPrevEnemy',Amount:2,Type:'CauseFrozen'},
   {Target:'RandomPrefNotPrevEnemy',Amount:2,Type:'CauseSilence'},
   {SpellPowerMultiplier:1,Target:'RandomPrefNotPrevEnemy',Amount:3,Primarypower:true,Type:'Damage'},
  ]);
  const w=weapons.find(v=>v.id===1142)!;
  expect(w).toMatchObject({id:1142,referenceName:'Dragonator8000',manaCost:11,manaColors:['Brown'],spell:{id:7338}});
  expect(w.spell.description).toBe('科学地使随机敌人陷入燃烧、冻结和沉默状态，并造成 [魔法 + 3] 点伤害。');
  // FIXED L5-006: four ordered native steps, steps 2-4 RandomPrefNotPrevEnemy
  const current={segments:[
   {kind:'status',target:'enemyRandom',statusId:'burning',turns:3,magnitude:3},
   {kind:'status',target:'enemyRandomPrefNotPrev',statusId:'frozen',turns:3},
   {kind:'status',target:'enemyRandomPrefNotPrev',statusId:'silence',turns:3},
   {kind:'damage',target:'enemyRandomPrefNotPrev',scaling:{base:3,mult:1}},
  ]};
  expect(registry.prototypes.get('7338')).toEqual(current);
  expect(registry.prototypes.get('gw_Dragonator8000')).toEqual(current);
 });
 for(const side of SIDES)for(const alias of ['7338','gw_Dragonator8000'])
 it(`FIXED L5-006: real cast ${side}/${alias} applies Burn, Freeze, Silence, then Magic+3 damage to one random enemy`,()=>{
  const f=setup({skill:alias,cost:COST,colors:COLORS,side,magic:9,chosen:10});
  const ev=f.cast();
  expect(applied(ev,'burning')).toHaveLength(1);expect(applied(ev,'frozen')).toHaveLength(1);expect(applied(ev,'silence')).toHaveLength(1);
  const hits=ev.filter(e=>e.type==='skill-damage');
  expect(hits.map(e=>e.damage)).toEqual([12]);
  const order=ev.filter(e=>e.type==='status-apply'||e.type==='skill-damage').map(e=>e.type==='skill-damage'?'dmg':e.statusId);
  expect(order).toEqual(['burning','frozen','silence','dmg']);
  // Burning victim additionally loses 3 to its burn tick at the enemy turn start
  const burned=applied(ev,'burning')[0],hit=hits[0].targetId;
  expect(f.foes.map(e=>1000-e.hp)).toEqual(f.foes.map(e=>(e.id===burned?3:0)+(e.id===hit?12:0)));
  expect(f.caster.statuses).toEqual([]);expect(f.ally.statuses).toEqual([]);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('FIXED L5-006: each of steps 2-4 avoids the previous step\'s target while another enemy lives (40 seeds)',()=>{
  const seen=new Set<number>();
  for(let seed=0;seed<40;seed++){
   const f=setup({skill:'7338',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:10});
   for(let i=0;i<seed;i++)f.ctx.rng.next();
   const ev=f.cast();
   const b=applied(ev,'burning')[0],fr=applied(ev,'frozen')[0],si=applied(ev,'silence')[0];
   const d=ev.find(e=>e.type==='skill-damage')!.targetId;
   expect(fr).not.toBe(b);expect(si).not.toBe(fr);expect(d).not.toBe(si);
   seen.add(b);
  }
  expect(seen.size).toBeGreaterThan(1);
 });
 it('Invulnerable enemies are immune; lone survivor receives all three statuses',()=>{
  const f=setup({skill:'7338',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:10,
   enemies:[{traitIds:['invulnerable']},{defeated:true,hp:0},{defeated:true,hp:0},{defeated:true,hp:0}]});
  attachPassives(f.foes[0]);
  expect(f.cast().some(e=>e.type==='status-apply')).toBe(false);
  const g=setup({skill:'7338',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:10,
   enemies:[{defeated:true,hp:0},{},{defeated:true,hp:0},{defeated:true,hp:0}]});
  const ev=g.cast();
  expect([applied(ev,'burning'),applied(ev,'frozen'),applied(ev,'silence')]).toEqual([[11],[11],[11]]);
  // lone survivor: prefer-not-previous falls back to the same enemy for the damage too
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[11,12]]);
 });
 block(()=>setup({skill:'gw_Dragonator8000',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:9,chosen:10}),COST);
});

// ───────────────────────── weapon:1436 / spell 8668 Trick and Treat ─────────────────────────
describe('L5 weapon:1436 / spell:8668 all negative statuses on an enemy, all positive on self',()=>{
 const COST=22,COLORS=[BaseColor.Red,BaseColor.Yellow,BaseColor.Purple];
 // FIXED L5-007: official status guide negative list (Charm dropped; Faerie Fire, Hunter's Mark, Terror, Lycanthropy added)
 const NEG=['curse','poison','burning','bleed','silence','frozen','stun','entangle','web','disease','death-mark','faerie-fire','marked','terror','lycanthropy'];
 const POS=['barrier','enchanted','enraged','reflect','submerged','blessed'];
 it('gowhead English, native steps, aliases, cost/colours, Chinese display, registered status set',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1436)!;
  expect(o.stats.spell).toMatchObject({id:8668,desc:'Inflict all negative status effects on an Enemy, and grant myself all positive status effects.'});
  expect(o.ManaCost).toBe(22);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorPurple','ColorRed','ColorYellow']);
  const n=native.get(8668).raw;
  expect(n).toMatchObject({Id:8668,Cost:22,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:1,Type:'CauseCursed'},
   {Target:'FromTarget',Type:'CauseAllNegativeStatusEffects',Delay:1},
   {Target:'Self',Type:'CauseAllPositiveStatusEffects'},
  ]);
  const w=weapons.find(v=>v.id===1436)!;
  expect(w).toMatchObject({id:1436,referenceName:'TrickAndTreat',manaCost:22,manaColors:['Red','Yellow','Purple'],spell:{id:8668}});
  expect(w.spell.description).toBe('使一名敌人陷入所有负面状态效果，并赋予自身所有正面状态效果。');
  const p=registry.prototypes.get('8668')!;
  expect(registry.prototypes.get('gw_TrickAndTreat')).toEqual(p);
  expect(p.segments.filter((s)=>s.kind==='status').map((s)=>[s.target,s.statusId])).toEqual(NEG.map(id=>['enemyChosen',id]));
  expect(p.segments.at(-1)).toEqual({kind:'randomStatus',target:'allySelf',allPositive:true});
 });
 for(const side of SIDES)for(const alias of ['8668','gw_TrickAndTreat'])
 it(`real cast ${side}/${alias}: Curse first, then negatives on chosen enemy only; positives on caster only`,()=>{
  const f=setup({skill:alias,cost:COST,colors:COLORS,side,magic:5,chosen:12});
  const ev=f.cast();
  const onEnemy=ev.filter(e=>e.type==='status-apply').filter(e=>e.targetId===12).map(e=>e.statusId);
  expect(onEnemy).toEqual(NEG);
  expect(ev.filter(e=>e.type==='status-apply').filter(e=>e.targetId===0).map(e=>e.statusId)).toEqual(POS);
  expect(f.foes.filter(e=>e.id!==12).every(e=>e.statuses.length===0&&e.hp===1000)).toBe(true);
  expect(f.ally.statuses).toEqual([]);
  // no spell damage; enemy 12 only loses Life to DoT ticks at its own turn start right after the cast
  expect(ev.some(e=>e.type==='skill-damage')).toBe(false);
  expect(ev.filter(e=>e.type==='status-tick').filter(e=>e.targetId===12).length).toBeGreaterThan(0);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('Curse lands first: strips the enemy Barrier and penetrates ordinary immunity, Invulnerable blocks everything',()=>{
  const f=setup({skill:'8668',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:5,chosen:12});
  f.foes[2].statuses=[{id:'barrier',turns:3}];f.foes[2].traitIds=['sturdy'];attachPassives(f.foes[2]);
  const ev=f.cast();
  expect(ev.filter(e=>e.type==='status-expire').filter(e=>e.targetId===12).map(e=>e.statusId)).toEqual(['barrier']);
  expect(sids(f.foes[2])).toEqual(NEG);
  const g=setup({skill:'8668',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:5,chosen:12});
  g.foes[2].traitIds=['invulnerable'];attachPassives(g.foes[2]);
  expect(g.cast().filter(e=>e.type==='status-apply').filter(e=>e.targetId===12)).toEqual([]);
 });
 it('Blessed enemy: Curse and Blessed cancel (neither kept), remaining negatives then land',()=>{
  const f=setup({skill:'8668',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:5,chosen:12});
  f.foes[2].statuses=[{id:'blessed',turns:3}];
  f.cast();
  expect(sids(f.foes[2])).toEqual(NEG.filter(id=>id!=='curse'));
 });
 it('FIXED L5-007: enemy gets Faerie Fire / Terror / Hunter\'s Mark / Lycanthropy and no Charm; Enrage granted once (no rage alias duplicate)',()=>{
  const f=setup({skill:'8668',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:5,chosen:12});
  const ev=f.cast();
  for(const id of ['faerie-fire','terror','marked','lycanthropy'])expect(applied(ev,id)).toEqual([12]);
  expect(applied(ev,'charm')).toEqual([]);
  expect(sids(f.caster).filter(id=>id==='rage'||id==='enraged')).toEqual(['enraged']);
  expect(sids(f.caster)).toEqual(POS);
 });
 block(()=>setup({skill:'gw_TrickAndTreat',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:5,chosen:12}),COST);
});

// ───────────────────────── troop:7182 / spell 8752 Twin Sign ─────────────────────────
describe('L5 troop:7182 / spell:8752 steal Magic+1 from 2 weakest, Curse + 3 Bleed stacks',()=>{
 const SK='8752',COST=24,COLORS=[BaseColor.Red,BaseColor.Yellow,BaseColor.Purple];
 const hp=[{hp:1000},{hp:300},{hp:500},{hp:800}];
 it('source, native steps, binding, cost/colours, prototype and Chinese display',()=>{
  const o=rawTroops.find((t:{id:number})=>t.id===7182)!;
  expect(o.stats.spell).toMatchObject({id:8752,desc:'Steal [Magic + 1] Life from the 2 weakest Enemies, then inflict Curse and 3 stacks of Bleed on them.'});
  expect(o.ManaCost).toBe(24);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorPurple','ColorRed','ColorYellow']);
  const n=native.get(8752).raw;
  expect(n).toMatchObject({Id:8752,Cost:24,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'TwoWeakestEnemies',Amount:1,Type:'CauseCursed'},
   {Target:'TwoWeakestEnemies',Amount:1,Type:'CauseBleed'},
   {Target:'TwoWeakestEnemies',Amount:1,Type:'CauseBleed'},
   {Target:'TwoWeakestEnemies',Amount:1,Type:'CauseBleed'},
   {SpellPowerMultiplier:1,Target:'TwoWeakestEnemies',Amount:1,Primarypower:true,Type:'StealLife'},
  ]);
  // FIXED L5-008 (rulings/R001): native order Curse -> Bleed x3 -> StealLife
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyWeakestN',statusId:'curse',turns:3,n:2},
   {kind:'status',target:'enemyWeakestN',statusId:'bleed',turns:3,magnitude:1,n:2,stacks:3},
   {kind:'damage',target:'enemyWeakestN',scaling:{base:1,mult:1},n:2,drain:true},
  ]});
  const t=TROOPS.find(t=>t.id===7182)!;
  expect(t).toMatchObject({id:7182,manaCost:24,manaColors:COLORS,spell:{id:8752}});
  expect(t.spell.description).toBe('窃取最弱的 2 名敌人 [魔法 + 1] 点生命值。并使他们陷入诅咒和叠加 3 倍的出血状态。');
 });
 for(const side of SIDES)for(const magic of [0,3])
 it(`real cast side=${side} magic=${magic}: 2 lowest-HP enemies lose M+1, get Curse and Bleed x3`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:10,enemies:hp,caster:{hp:900}});
  const ev=f.cast();
  // steal M+1, then 3-stack Bleed ticks 6 true damage at the enemy turn start right after the cast
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[11,magic+1],[12,magic+1]]);
  expect(f.foes.map(e=>e.hp)).toEqual([1000,300-(magic+1)-6,500-(magic+1)-6,800]);
  expect(applied(ev,'curse')).toEqual([11,12]);expect(applied(ev,'bleed')).toEqual([11,12]);
  for(const e of [f.foes[1],f.foes[2]]){
   expect(sids(e)).toEqual(['curse','bleed']);expect(e.statuses.find(s=>s.id==='bleed')!.magnitude).toBe(3);
  }
  expect(f.caster.hp).toBeGreaterThan(900);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('existing Bleed stacks cap at 4; Invulnerable target takes steal but no statuses',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:3,chosen:10,enemies:hp});
  f.foes[1].statuses=[{id:'bleed',turns:3,magnitude:2}];f.foes[2].traitIds=['invulnerable'];attachPassives(f.foes[2]);
  f.cast();
  expect(f.foes[1].statuses.find(s=>s.id==='bleed')!.magnitude).toBe(4);
  expect(f.foes[2].hp).toBe(496);expect(f.foes[2].statuses).toEqual([]);expect(sids(f.foes[1])).toEqual(['bleed','curse']);
 });
 it('FIXED L5-008 (R001): Curse lands first and strips a weakest enemy\'s Barrier, so the steal then hits',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:3,chosen:10,enemies:hp});
  f.foes[1].statuses=[{id:'barrier',turns:3}];
  const ev=f.cast();
  expect(ev.filter(e=>e.type==='status-expire').filter(e=>e.targetId===11).map(e=>e.statusId)).toContain('barrier');
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([11,12]);
  // steal 4, then the 3-stack Bleed tick (6) at the enemy turn start
  expect(f.foes[1].hp).toBe(290);
  const kinds=ev.filter(e=>e.type==='skill-damage'||e.type==='status-apply').map(e=>e.type==='skill-damage'?'steal':e.statusId);
  expect(kinds).toEqual(['curse','curse','bleed','bleed','steal','steal']);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:3,chosen:10}),COST);
});

// ───────────────────────── troop:6249 / spell 7392 Flagellate ─────────────────────────
describe('L5 troop:6249 / spell:7392 Death Mark first and last enemies, take 3 damage',()=>{
 const SK='7392',COST=7,COLORS=[BaseColor.Blue];
 it('source, native steps, binding, cost/colour, prototype and Chinese display',()=>{
  const o=rawTroops.find((t:{id:number})=>t.id===6249)!;
  expect(o.stats.spell).toMatchObject({id:7392,desc:'Death Mark the first and last Enemies. Take 3 damage.'});
  expect(o.ManaCost).toBe(7);expect(Object.keys(o._ManaColors_parsed)).toEqual(['ColorBlue']);
  const n=native.get(7392).raw;
  expect(n).toMatchObject({Id:7392,Cost:7,Target:'None'});
  expect(n.SpellSteps).toEqual([
   {Target:'FrontEnemy',Amount:1,Type:'CauseDeathMark'},
   {Target:'LastEnemy',Type:'CauseDeathMark'},
   {Target:'Self',Amount:3,Type:'Damage'},
  ]);
  expect(registry.prototypes.get(SK)).toEqual({segments:[
   {kind:'status',target:'enemyFront',statusId:'death-mark',turns:3},
   {kind:'status',target:'enemyLast',statusId:'death-mark',turns:3},
   // FIXED L5-009: native Self Damage = ordinary damage segment (Barrier/Armor first)
   {kind:'damage',target:'allySelf',scaling:{base:3,mult:0}},
  ]});
  const t=TROOPS.find(t=>t.id===6249)!;
  expect(t).toMatchObject({id:6249,manaCost:7,manaColors:COLORS,spell:{id:7392}});
  expect(t.spell.description).toBe('使第一个和最后一个敌人陷入死亡标记状态。承受 3 点伤害。');
 });
 for(const side of SIDES)for(const magic of [0,10])
 it(`real cast side=${side} magic=${magic}: front and last enemies Death Marked, caster loses 3 Life (magic-independent)`,()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side,magic,chosen:10});
  const ev=f.cast();
  expect(applied(ev,'death-mark')).toEqual([10,13]);
  expect([sids(f.foes[0]),sids(f.foes[1]),sids(f.foes[2]),sids(f.foes[3])]).toEqual([['death-mark'],[],[],['death-mark']]);
  expect(f.caster.hp).toBe(997);expect(f.ally.hp).toBe(1000);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('dead front/last skip to living edge; single survivor marked once; Warded immune',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10,
   enemies:[{defeated:true,hp:0},{},{},{defeated:true,hp:0}]});
  expect(applied(f.cast(),'death-mark')).toEqual([11,12]);
  const g=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10,
   enemies:[{defeated:true,hp:0},{},{defeated:true,hp:0},{defeated:true,hp:0}]});
  const gev=g.cast();expect(applied(gev,'death-mark')).toEqual([11,11]);expect(sids(g.foes[1])).toEqual(['death-mark']);
  const h=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10});
  h.foes[0].traitIds=['warded'];attachPassives(h.foes[0]);
  expect(applied(h.cast(),'death-mark')).toEqual([13]);
 });
 it('FIXED L5-009: self "Take 3 damage" is absorbed by the caster Barrier, else taken from Armor before Life',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10,caster:{armor:5,statuses:[{id:'barrier',turns:3}]}});
  f.cast();
  expect([f.caster.hp,f.caster.armor]).toEqual([1000,5]);
  expect(sids(f.caster)).toEqual([]);
  const g=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Right,magic:10,chosen:10,caster:{armor:5}});
  g.cast();
  expect([g.caster.hp,g.caster.armor]).toEqual([1000,2]);
  const h=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10,caster:{armor:1}});
  h.cast();
  expect([h.caster.hp,h.caster.armor]).toEqual([998,0]);
 });
 it('self damage at 3 Life defeats the caster',()=>{
  const f=setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10,caster:{hp:3}});
  const c=f.caster;f.cast();expect(c.hp).toBe(0);expect(c.defeated).toBe(true);
 });
 block(()=>setup({skill:SK,cost:COST,colors:COLORS,side:PlayerSide.Left,magic:0,chosen:10}),COST);
});

// ───────────────────────── weapon:1147 / spell 7444 Crypt Keeper ─────────────────────────
describe('L5 weapon:1147 / spell:7444 Death Mark an enemy, true damage below them boosted x3 per Death Mark',()=>{
 const COST=13,COLORS=[BaseColor.Purple];
 const current={segments:[
  {kind:'status',target:'enemyChosen',statusId:'death-mark',turns:3},
  // FIXED L5-010: native BelowTarget = enemies below the chosen one, chosen excluded
  {kind:'damage',target:'enemyBelowTarget',scaling:{base:1,mult:1},trueDamage:true,
   modifier:{mod:{kind:'multiplier',a:3},source:{kind:'enemyStatusCount',statusId:'death-mark'}}},
 ]};
 it('gowhead English, native steps, aliases, cost/colour, Chinese display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1147)!;
  expect(o.stats.spell).toMatchObject({id:7444,desc:'Death Mark an enemy. Deal [Magic + 1] true damage to all enemies below them, boosted by enemy Death Marks. [x3]'});
  expect(o.ManaCost).toBe(13);expect(Object.keys(o._ManaColors_parsed)).toEqual(['ColorPurple']);
  const n=native.get(7444).raw;
  expect(n).toMatchObject({Id:7444,Cost:13,Target:'Enemy'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Type:'CauseDeathMark'},
   {Target:'AllEnemies',Amount:300,Type:'CountSpecificStatusEffect',Data:'deathmark'},
   {SpellPowerMultiplier:1,Target:'BelowTarget',UseCounterForAmount:true,Amount:1,Primarypower:true,Type:'TrueDamage'},
  ]);
  const w=weapons.find(v=>v.id===1147)!;
  expect(w).toMatchObject({id:1147,referenceName:'CryptKeeper',manaCost:13,manaColors:['Purple'],spell:{id:7444}});
  expect(w.spell.description).toBe('使一名敌人陷入死亡标记状态。对其下方的所有敌人造成 [魔法 + 1] 点真实伤害，伤害值因陷入死亡标记的敌军数量而增强。 [x3]');
  expect(registry.prototypes.get('7444')).toEqual(current);
  expect(registry.prototypes.get('gw_CryptKeeper')).toEqual(current);
 });
 for(const side of SIDES)for(const alias of ['7444','gw_CryptKeeper'])
 it(`FIXED L5-010: real cast ${side}/${alias}: chosen enemy 11 Death Marked and untouched; every enemy below (12,13) takes true damage`,()=>{
  const f=setup({skill:alias,cost:COST,colors:COLORS,side,magic:4,chosen:11,enemies:[{},{armor:20},{armor:20},{}]});
  const ev=f.cast();
  expect(applied(ev,'death-mark')).toEqual([11]);
  // Death Mark counted after application: 1 mark -> +3; true damage ignores armor
  const d=4+1+3;
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([12,13]);
  expect(f.foes.map(e=>1000-e.hp)).toEqual([0,0,d,d]);
  expect(f.foes[1].armor).toBe(20);expect(f.foes[2].armor).toBe(20);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.other);
 });
 it('boost counts every Death Marked enemy including pre-existing marks',()=>{
  const f=setup({skill:'7444',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:4,chosen:12});
  f.foes[0].statuses=[{id:'death-mark',turns:3}];f.foes[3].statuses=[{id:'death-mark',turns:3}];
  f.cast();
  expect(f.foes.map(e=>1000-e.hp)).toEqual([0,0,0,5+9]);
 });
 it('Warded chosen enemy: no new mark, boost only from other marks; last enemy chosen -> nobody below, no damage',()=>{
  const f=setup({skill:'7444',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:4,chosen:12});
  f.foes[2].traitIds=['warded'];attachPassives(f.foes[2]);
  const ev=f.cast();
  expect(applied(ev,'death-mark')).toEqual([]);
  expect(f.foes.map(e=>1000-e.hp)).toEqual([0,0,0,5]);
  const g=setup({skill:'7444',cost:COST,colors:COLORS,side:PlayerSide.Right,magic:4,chosen:13});
  const gev=g.cast();
  expect(applied(gev,'death-mark')).toEqual([13]);
  expect(gev.filter(e=>e.type==='skill-damage')).toEqual([]);
  expect(g.foes.every(e=>e.hp===1000)).toBe(true);
 });
 block(()=>setup({skill:'gw_CryptKeeper',cost:COST,colors:COLORS,side:PlayerSide.Left,magic:4,chosen:12}),COST);
});
