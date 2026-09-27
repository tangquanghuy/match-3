// Lane L4b batch B02 (reviewer sa-L4b): create gem skills with status/damage/life riders, stored-snapshot scope.
// Every entity has its own source/prototype binding and real TurnEngine.castSkill cases.
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Independent saved native-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {BoardModel} from '@engine/BoardModel';
import {createGameState} from '@engine/GameState';
import {SeededRNG} from '@engine/rng';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {FixedColorChooser} from '@engine/skills/colorChooser';
import {BaseColor,PlayerSide,colorGem,type Character,type GemType} from '@engine/types';
import type {GameEvent} from '@engine/events';
import {damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';

const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
type BoardFn=(r:number,c:number)=>GemType|null;
const pattern=(cols:BaseColor[]):BoardFn=>(r,c)=>colorGem(cols[(r+c)%4]);
interface Opts{spell:number;cost:number;colors:BaseColor[];side?:PlayerSide;magic?:number;board?:BoardFn;
 allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number;seed?:number}
function setup(o:Opts){
 const side=o.side??PlayerSide.Left;const board=new BoardModel();const fn=o.board??pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]);let id=1;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){const t=fn(r,c);board.set({row:r,col:c},t?{id:id++,type:t}:null);}
 const caster=damageCharacter(0,{skillId:String(o.spell),mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 const enemies=(o.enemies??[{},{},{},{}]).map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 // Teams get their own arrays: defeated troops are spliced out of the team, fixture handles stay stable.
 const mine={player:side,characters:[caster,...allies]};const theirs={player:side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left,characters:[...enemies]};
 const state=side===PlayerSide.Left?createGameState(board,mine,theirs):createGameState(board,theirs,mine,PlayerSide.Right);
 state.activePlayer=side;let gid=5000;
 const engine=new TurnEngine(state,new SeededRNG(o.seed??42),()=>gid++,registry);engine.skullChance=0;
 engine.setColorChooser(new FixedColorChooser(BaseColor.Red));engine.setTargetChooser(new FixedTargetChooser(o.target??11));
 return {board,state,engine,caster,allies,enemies,side,opponent:theirs.player,cast:()=>engine.castSkill(caster.id)};
}
function skillPhase(ev:GameEvent[]){const i=ev.findIndex(e=>e.type==='elimination');return i<0?ev:ev.slice(0,i);}
function creations(ev:GameEvent[]){
 const out:{pos:string;from:GemType|null;to:GemType}[]=[];
 for(const e of skillPhase(ev)){
  if(e.type==='gem-create')for(const s of e.spawns)out.push({pos:`${s.pos.row},${s.pos.col}`,from:null,to:s.gemType});
  if(e.type==='gem-transform')for(const s of e.changes)out.push({pos:`${s.pos.row},${s.pos.col}`,from:s.from,to:s.to});
 }
 return out;
}
const isColor=(t:GemType|null,c:BaseColor)=>!!t&&t.kind==='color'&&t.color===c;
const applied=(ev:GameEvent[])=>ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'?[e.targetId,e.statusId,e.turns]:[]);
function manaFromMatches(ev:GameEvent[],id:number){return ev.filter(e=>e.type==='mana-gain'&&e.characterId===id).reduce((a,e)=>a+(e.type==='mana-gain'?e.amount:0),0);}
function assertTurnAndMana(f:ReturnType<typeof setup>,ev:GameEvent[]){
 expect(ev[0]).toMatchObject({type:'skill-cast',characterId:0});
 expect(skillPhase(ev).some(e=>e.type==='extra-turn')).toBe(false);
 const extra=ev.some(e=>e.type==='extra-turn');
 expect(f.state.activePlayer).toBe(extra?f.side:f.opponent);
 expect(f.state.actionLog).toHaveLength(1);
 expect(f.caster.mana).toBe(Math.min(f.caster.manaCost,manaFromMatches(ev,0)));
}
function sourceBinding(id:number,spell:number,cost:number,colors:BaseColor[],desc:string,steps:object[],zh:string){
 const en=original.find((t:{id:number})=>t.id===id)!,troop=TROOPS.find(t=>t.id===id)!,n=native.get(spell).raw;
 expect(en.stats.spell.id).toBe(spell);expect(en.stats.spell.desc).toBe(desc);expect(en.ManaCost).toBe(cost);
 expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(colors.map(x=>`Color${x}`).sort());
 expect(n.Cost).toBe(cost);expect(n.SpellSteps).toEqual(steps);
 expect(troop).toMatchObject({id,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
 expect(troop.spell.description.replace(/\s+/g,' ')).toBe(zh.replace(/\s+/g,' '));
}
/** Skill damage per target from skill-damage events (turn-start Poison/Burning ticks are excluded). */
function skillDamage(ev:GameEvent[]){const m=new Map<number,number>();for(const e of skillPhase(ev))if(e.type==='skill-damage')m.set(e.targetId,(m.get(e.targetId)??0)+e.damage);return m;}
function refusal(o:Opts){
 for(const mode of ['low-mana','silence'] as const)it(`${mode}: real entry refuses, board/turn/mana untouched`,()=>{
  const f=setup(o);const before:string[]=[];f.board.forEach(g=>before.push(JSON.stringify(g)));
  if(mode==='low-mana')f.caster.mana=o.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);const after:string[]=[];f.board.forEach(g=>after.push(JSON.stringify(g)));
  expect(after).toEqual(before);expect(f.caster.mana).toBe(mode==='low-mana'?o.cost-1:o.cost);
  expect(f.state.actionLog).toHaveLength(0);expect(f.state.activePlayer).toBe(PlayerSide.Left);
  expect(f.enemies.every(c=>c.statuses.length===0&&c.hp===1000)).toBe(true);expect(f.caster.maxHp).toBe(1000);
 });
}
const sides=[PlayerSide.Left,PlayerSide.Right];

// ——— troop:6589 / spell 7793 ———
describe('L4b troop:6589/spell:7793 Entangle an enemy, create 6 Green +3 per Entangled enemy',()=>{
 const base={spell:7793,cost:10,colors:[BaseColor.Yellow,BaseColor.Brown],target:12};
 it('source/native/prototype/display binding',()=>{
  sourceBinding(6589,7793,10,base.colors,'Entangle an enemy. Create 6 Green Gems, boosted by Entangled enemies. [x3]',
   [{Target:'FromTarget',Amount:1,Type:'CauseEntangle'},{Amount:300,Type:'DelayUntilEffectsComplete'},{Target:'AllEnemies',Color1:'Green',Amount:300,Type:'CountSpecificStatusEffect',Data:'entangle'},{UseCounterForAmount:true,Color1:'Green',Amount:6,Type:'CreateGems'}],
   '缠绕一名敌人。创造 6 颗绿宝石，宝石数量因被缠绕的敌人数量而增强。 [x3]');
  expect(native.get(7793).raw.Target).toBe('Enemy');
  const mod={mod:{kind:'multiplier',a:3},source:{kind:'enemyStatusCount',statusId:'entangle'}};
  expect(registry.prototypes.get('7793')).toEqual({segments:[{kind:'status',target:'enemyChosen',statusId:'entangle',turns:3},
   {kind:'gem',params:{op:'create',gem:{kind:'color',color:'Green'},count:{base:6,mult:0},modifier:mod},modifier:mod}]});
 });
 for(const side of sides)for(const [pre,expected] of [[0,9],[1,12],[3,18]] as const)
 it(`real cast side=${side}: ${pre} other pre-entangled enemies -> ${expected} Green`,()=>{
  const marked=[0,1,3].slice(0,pre);
  const f=setup({...base,side,enemies:[0,1,2,3].map(i=>marked.includes(i)?{statuses:[{id:'entangle',turns:3}]}:{})});const ev=f.cast();
  expect(applied(ev)).toEqual([[12,'entangle',3]]);
  const made=creations(ev);expect(made).toHaveLength(expected);
  expect(made.every(m=>isColor(m.to,BaseColor.Green)&&!isColor(m.from,BaseColor.Green))).toBe(true);
  expect(new Set(made.map(m=>m.pos)).size).toBe(expected);
  expect(f.enemies.every(e=>e.hp===1000)).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('already-entangled chosen target counts once: 9',()=>{
  const f=setup({...base,enemies:[{},{},{statuses:[{id:'entangle',turns:3}]},{}]});expect(creations(f.cast())).toHaveLength(9);
 });
 it('defeated entangled enemy excluded: 9',()=>{
  const f=setup({...base,enemies:[{defeated:true,hp:0,statuses:[{id:'entangle',turns:3}]},{},{},{}]});expect(creations(f.cast())).toHaveLength(9);
 });
 it('Blessed target immune: no Entangle, counter 0 -> 6 Green',()=>{
  const f=setup({...base,enemies:[{},{},{statuses:[{id:'blessed',turns:3}]},{}]});const ev=f.cast();
  expect(applied(ev)).toEqual([]);expect(creations(ev)).toHaveLength(6);
 });
 it('other statuses (poison) are not counted',()=>{
  const f=setup({...base,enemies:[{statuses:[{id:'poison',turns:3}]},{statuses:[{id:'poison',turns:3}]},{},{}]});expect(creations(f.cast())).toHaveLength(9);
 });
 refusal(base);
});

// ——— troop:6196 / spell 7337 ———
describe('L4b troop:6196/spell:7337 Freeze + Hunter\'s Mark first enemy, [Magic+4] damage, +5 Blue if >=13 Blue',()=>{
 const base={spell:7337,cost:12,colors:[BaseColor.Blue,BaseColor.Purple]};
 // (r+c)%4===0 cells hold Blue in a Red/Yellow/Purple/Brown diagonal pattern: 16 isolated Blue, no pre-matches.
 const blueCells:string[]=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)if((r+c)%4===0)blueCells.push(`${r},${c}`);
 const blueBoard=(n:number):BoardFn=>{const s=new Set(blueCells.slice(0,n));return (r,c)=>s.has(`${r},${c}`)?colorGem(BaseColor.Blue):colorGem([BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown][(r+c)%4]);};
 it('source/native/prototype/display binding (AddFor10BlueGems = English "13 or more")',()=>{
  sourceBinding(6196,7337,12,base.colors,"Freeze and Hunter's Mark the first Enemy. Deal [Magic + 4] damage to them. If there are 13 or more Blue Gems, create 5 more.",
   [{Target:'FrontEnemy',Amount:1,Type:'CauseFrozen'},{Target:'FrontEnemy',Amount:1,Type:'CauseHuntersMark'},{SpellPowerMultiplier:1,Target:'FrontEnemy',Amount:4,Primarypower:true,Type:'Damage'},{StatusAmount:5,Color1:'Blue',StatusModifier:'AddFor10BlueGems',Type:'CreateGems'}],
   '冻结第一名敌人并使其陷入猎人标记状态。对其造成 [魔法 + 4] 点伤害。如果板面上有 13 颗或更多蓝色宝石，则再创造 5 颗蓝色宝石。');
  expect(registry.prototypes.get('7337')).toEqual({segments:[{kind:'status',target:'enemyFront',statusId:'frozen',turns:3},
   {kind:'status',target:'enemyFront',statusId:'marked',turns:3},{kind:'damage',target:'enemyFront',scaling:{base:4,mult:1}},
   {kind:'gem',params:{op:'create',gem:{kind:'color',color:'Blue'},count:{base:5,mult:0}},ifCond:{kind:'boardAtLeast',color:'Blue',n:13}}]});
 });
 for(const side of sides)for(const [blue,magic] of [[13,10],[16,0]] as const)
 it(`real cast side=${side} blue=${blue} magic=${magic}: statuses, damage and exactly 5 Blue`,()=>{
  const f=setup({...base,side,magic,board:blueBoard(blue),enemies:[{armor:3},{},{},{}]});const ev=f.cast();
  expect(applied(ev)).toEqual([[10,'frozen',3],[10,'marked',3]]);
  const dmg=magic+4;expect(f.enemies[0].armor).toBe(Math.max(0,3-dmg));expect(f.enemies[0].hp).toBe(1000-Math.max(0,dmg-3));
  expect(f.enemies.slice(1).every(e=>e.hp===1000&&e.statuses.length===0)).toBe(true);
  const made=creations(ev);expect(made).toHaveLength(5);
  expect(made.every(m=>isColor(m.to,BaseColor.Blue)&&!isColor(m.from,BaseColor.Blue))).toBe(true);
  assertTurnAndMana(f,ev);
 });
 for(const side of sides)it(`real cast side=${side} blue=12: condition fails, no gems, statuses+damage still resolve`,()=>{
  const f=setup({...base,side,board:blueBoard(12)});const ev=f.cast();
  expect(applied(ev)).toEqual([[10,'frozen',3],[10,'marked',3]]);expect(f.enemies[0].hp).toBe(986);
  expect(creations(ev)).toEqual([]);expect(ev.some(e=>e.type==='elimination')).toBe(false);
  expect(f.state.activePlayer).toBe(f.opponent);expect(f.caster.mana).toBe(0);
 });
 it('dead front enemy: first living enemy is the target',()=>{
  const f=setup({...base,board:blueBoard(13),enemies:[{defeated:true,hp:0},{},{},{}]});const ev=f.cast();
  expect(applied(ev)).toEqual([[11,'frozen',3],[11,'marked',3]]);expect(f.enemies[1].hp).toBe(986);expect(creations(ev)).toHaveLength(5);
 });
 it('lethal hit on first enemy still creates the conditional Blue gems',()=>{
  const f=setup({...base,board:blueBoard(13),enemies:[{hp:5},{},{},{}]});const ev=f.cast();
  expect(f.enemies[0].defeated).toBe(true);expect(creations(ev)).toHaveLength(5);
 });
 it('Barrier on first enemy absorbs damage; statuses and gem creation still resolve',()=>{
  const f=setup({...base,board:blueBoard(13),enemies:[{statuses:[{id:'barrier',turns:3}]},{},{},{}]});const ev=f.cast();
  expect(f.enemies[0].hp).toBe(1000);expect(f.enemies[0].statuses.some(s=>s.id==='barrier')).toBe(false);
  expect(f.enemies[0].statuses.map(s=>s.id).sort()).toEqual(['frozen','marked']);expect(creations(ev)).toHaveLength(5);
 });
 refusal(base);
});

// ——— troop:6063 / spell 7063 ———
describe('L4b troop:6063/spell:7063 Poison first 2 enemies, create 9 Red, gain [Magic+1] Life',()=>{
 const base={spell:7063,cost:7,colors:[BaseColor.Blue]};
 it('source/native/prototype/display binding',()=>{
  sourceBinding(6063,7063,7,base.colors,'Poison the first 2 Enemies and create 9 Red Gems. Gain [Magic + 1] Life.',
   [{Target:'FrontEnemy',Amount:100,Type:'CausePoison'},{Target:'SecondEnemy',Amount:100,Type:'CausePoison'},{Color1:'Red',Amount:9,Type:'CreateGems'},{SpellPowerMultiplier:1,Target:'Self',Amount:1,Primarypower:true,Type:'IncreaseHealth'}],
   '使前 2 名敌人陷入中毒状态，并创造 9 颗红色宝石。获得  [魔法 + 1]  点生命值。');
  expect(registry.prototypes.get('7063')).toEqual({segments:[{kind:'status',target:'enemyFirstN',statusId:'poison',turns:3,magnitude:3,n:2},
   {kind:'gem',params:{op:'create',gem:{kind:'color',color:'Red'},count:{base:9,mult:0}}},
   {kind:'buff',target:'allySelf',stat:'hp',scaling:{base:1,mult:1},lifeMode:'gain'}]});
 });
 for(const side of sides)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}`,()=>{
  const f=setup({...base,side,magic,allies:[{}]});const ev=f.cast();
  expect(applied(ev).map(a=>[a[0],a[1]])).toEqual([[10,'poison'],[11,'poison']]);
  expect(f.enemies.slice(2).every(e=>e.statuses.length===0)).toBe(true);
  expect(f.caster.maxHp).toBe(1000+magic+1);expect(f.caster.hp).toBe(1000+magic+1);expect(f.allies[0].maxHp).toBe(1000);
  const made=creations(ev);expect(made).toHaveLength(9);expect(made.every(m=>isColor(m.to,BaseColor.Red)&&!isColor(m.from,BaseColor.Red))).toBe(true);
  // native order: poison, poison, create, life
  const kinds=skillPhase(ev).filter(e=>['status-apply','gem-transform','gem-create','buff'].includes(e.type)).map(e=>e.type);
  expect(kinds).toEqual(['status-apply','status-apply','gem-transform','buff']);
  assertTurnAndMana(f,ev);
 });
 it('dead front enemy: the first two LIVING enemies are poisoned',()=>{
  const f=setup({...base,enemies:[{defeated:true,hp:0},{},{},{}]});const ev=f.cast();
  expect(applied(ev).map(a=>a[0])).toEqual([11,12]);
 });
 it('single living enemy: only it is poisoned, gems and life still resolve',()=>{
  const f=setup({...base,enemies:[{}]});const ev=f.cast();
  expect(applied(ev).map(a=>a[0])).toEqual([10]);expect(creations(ev)).toHaveLength(9);expect(f.caster.maxHp).toBe(1011);
 });
 it('3 empty cells: 3 gem-create then 6 gem-transform, all Red',()=>{
  const f=setup({...base,board:(r,c)=>r===7&&c>4?null:colorGem([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown][(r+c)%4])});const ev=f.cast();
  const sp=skillPhase(ev);const cr=sp.find(e=>e.type==='gem-create'),tr=sp.find(e=>e.type==='gem-transform');
  expect(cr&&cr.type==='gem-create'&&cr.spawns.length).toBe(3);expect(tr&&tr.type==='gem-transform'&&tr.changes.length).toBe(6);
  expect(creations(ev).every(m=>isColor(m.to,BaseColor.Red))).toBe(true);
 });
 it('Blessed front enemy resists Poison; second still poisoned',()=>{
  const f=setup({...base,enemies:[{statuses:[{id:'blessed',turns:3}]},{},{},{}]});const ev=f.cast();
  expect(applied(ev).map(a=>a[0])).toEqual([11]);
 });
 refusal(base);
});

// ——— troop:6068 / spell 7138 ———
describe('L4b troop:6068/spell:7138 [Magic] damage + Poison all enemies, create 9 Green',()=>{
 const base={spell:7138,cost:16,colors:[BaseColor.Blue,BaseColor.Green]};
 it('source/native/prototype/display binding',()=>{
  sourceBinding(6068,7138,16,base.colors,'Deal [Magic] damage to all Enemies and Poison them. Create 9 Green Gems.',
   [{Target:'AllEnemies',Type:'CausePoison'},{SpellPowerMultiplier:1,Target:'AllEnemies',Primarypower:true,Type:'Damage'},{Color1:'Green',Amount:9,Type:'CreateGems'}],
   '对所有敌人造成 [魔法] 点伤害，并使他们陷入中毒状态。创造 9 颗绿色宝石。');
  // FIXED round 2 (L4b-6068-order, R001): prototype follows native order CausePoison -> Damage.
  expect(registry.prototypes.get('7138')).toEqual({segments:[{kind:'status',target:'enemyAll',statusId:'poison',turns:3,magnitude:3},
   {kind:'damage',target:'enemyAll',scaling:{base:0,mult:1},range:'all'},
   {kind:'gem',params:{op:'create',gem:{kind:'color',color:'Green'},count:{base:9,mult:0}}}]});
 });
 for(const side of sides)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}`,()=>{
  const f=setup({...base,side,magic,enemies:[{armor:4},{},{},{}]});const ev=f.cast();
  const hits=skillPhase(ev).filter(e=>e.type==='skill-damage').map(e=>e.type==='skill-damage'?[e.targetId,e.resultingHp,e.resultingArmor]:[]);
  if(magic===0)expect(hits.every(h=>h[1]===1000)).toBe(true);
  else expect(hits).toEqual([[10,994,0],[11,990,0],[12,990,0],[13,990,0]]);
  expect(skillDamage(ev).size).toBe(magic===0?hits.length:4);
  expect(applied(ev).map(a=>[a[0],a[1]])).toEqual([[10,'poison'],[11,'poison'],[12,'poison'],[13,'poison']]);
  const made=creations(ev);expect(made).toHaveLength(9);expect(made.every(m=>isColor(m.to,BaseColor.Green)&&!isColor(m.from,BaseColor.Green))).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('native order: every enemy is Poisoned before the hit, so an enemy killed by the damage was Poisoned first',()=>{
  const f=setup({...base,enemies:[{hp:5},{},{},{}]});const ev=f.cast();
  expect(f.enemies[0].defeated).toBe(true);expect(applied(ev).map(a=>a[0])).toEqual([10,11,12,13]);
 });
 // FIXED round 2 (issues.json L4b-6068-order): native executes CausePoison BEFORE Damage.
 // (Was: runtime prototype
 // runs damage first, then poison (event order status-apply after skill-damage).
 it('native order: Poison status-apply precedes the damage events',()=>{
  const f=setup(base);const ev=skillPhase(f.cast());
  const firstStatus=ev.findIndex(e=>e.type==='status-apply'),firstDamage=ev.findIndex(e=>e.type==='skill-damage');
  expect(firstStatus).toBeGreaterThan(-1);expect(firstStatus).toBeLessThan(firstDamage);
 });
 refusal(base);
});

// ——— troop:6340 / spell 7490 ———
describe('L4b troop:6340/spell:7490 Stun+Burn all enemies, create a mix of 22 Red and Brown, gain [Magic+5] Life',()=>{
 const base={spell:7490,cost:22,colors:[BaseColor.Blue,BaseColor.Yellow,BaseColor.Brown]};
 const noRB=pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Green]);
 it('source/native/prototype/display binding',()=>{
  sourceBinding(6340,7490,22,base.colors,'Stun and Burn all Enemies. Create a mix of 22 Red and Brown Gems. Gain [Magic + 5] Life.',
   [{Target:'AllEnemies',Amount:4,Type:'CauseStun'},{Target:'AllEnemies',Amount:3,Type:'CauseBurning'},{Color1:'Red',Amount:22,Color2:'Brown',Type:'CreateGems2Colors'},{SpellPowerMultiplier:1,Target:'Self',Amount:5,Primarypower:true,Type:'IncreaseHealth'}],
   '击晕并燃烧所有敌人。创造 22 颗红色和棕色宝石。获得 [魔法 + 5] 点生命值。');
  expect(registry.prototypes.get('7490')).toEqual({segments:[{kind:'status',target:'enemyAll',statusId:'stun',turns:3},
   {kind:'status',target:'enemyAll',statusId:'burning',turns:3,magnitude:3},
   {kind:'gem',params:{op:'create',gem:{kind:'mix',colors:['Red','Brown']},count:{base:22,mult:0}}},
   {kind:'buff',target:'allySelf',stat:'hp',scaling:{base:5,mult:1},lifeMode:'gain'}]});
 });
 for(const side of sides)for(const magic of [0,10])it(`real cast side=${side} magic=${magic} (Red/Brown-free board)`,()=>{
  const f=setup({...base,side,magic,board:noRB});const ev=f.cast();
  expect(applied(ev).map(a=>[a[0],a[1]])).toEqual([[10,'stun'],[11,'stun'],[12,'stun'],[13,'stun'],[10,'burning'],[11,'burning'],[12,'burning'],[13,'burning']]);
  const made=creations(ev);expect(made).toHaveLength(22);expect(new Set(made.map(m=>m.pos)).size).toBe(22);
  expect(made.every(m=>isColor(m.to,BaseColor.Red)||isColor(m.to,BaseColor.Brown))).toBe(true);
  expect(made.some(m=>isColor(m.to,BaseColor.Red))).toBe(true);expect(made.some(m=>isColor(m.to,BaseColor.Brown))).toBe(true);
  expect(f.caster.maxHp).toBe(1000+magic+5);expect(f.caster.hp).toBe(1000+magic+5);
  assertTurnAndMana(f,ev);
 });
 it('Brown-bearing board: 22 cells selected, all end Red or Brown (same-colour overwrite allowed, see issues source-dispute)',()=>{
  const f=setup({...base,seed:7});const made=creations(f.cast());
  expect(made).toHaveLength(22);expect(made.every(m=>isColor(m.to,BaseColor.Red)||isColor(m.to,BaseColor.Brown))).toBe(true);
 });
 it('dead enemy skipped; Blessed enemy resists both statuses',()=>{
  const f=setup({...base,board:noRB,enemies:[{defeated:true,hp:0},{statuses:[{id:'blessed',turns:3}]},{},{}]});const ev=f.cast();
  expect(applied(ev).map(a=>[a[0],a[1]])).toEqual([[12,'stun'],[13,'stun'],[12,'burning'],[13,'burning']]);
 });
 refusal(base);
});
