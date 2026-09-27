// Lane L4b batch B03 (reviewer sa-L4b): convert-colour / create special gem skills, stored-snapshot scope.
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
import {BaseColor,PlayerSide,colorGem,skullGem,type Character,type GemType} from '@engine/types';
import type {GameEvent} from '@engine/events';
import {damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';

const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const rawWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
type BoardFn=(r:number,c:number)=>GemType|null;
/** (r+c)%4 diagonal pattern: no line of 3 unless three of the four classes share a colour. */
const pattern=(cols:BaseColor[]):BoardFn=>(r,c)=>colorGem(cols[(r+c)%4]);
interface Opts{skill:string;cost:number;colors:BaseColor[];side?:PlayerSide;magic?:number;board?:BoardFn;
 before?:Partial<Character>[];allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number;seed?:number}
function setup(o:Opts){
 const side=o.side??PlayerSide.Left;const board=new BoardModel();const fn=o.board??pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]);let id=1;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){const t=fn(r,c);board.set({row:r,col:c},t?{id:id++,type:t}:null);}
 const caster=damageCharacter(0,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10});
 const before=(o.before??[]).map((a,i)=>damageCharacter(5+i,{mana:0,...a}));
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 const enemies=(o.enemies??[{},{},{},{}]).map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 const mine={player:side,characters:[...before,caster,...allies]};const theirs={player:side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left,characters:[...enemies]};
 const state=side===PlayerSide.Left?createGameState(board,mine,theirs):createGameState(board,theirs,mine,PlayerSide.Right);
 state.activePlayer=side;let gid=5000;
 const engine=new TurnEngine(state,new SeededRNG(o.seed??42),()=>gid++,registry);engine.skullChance=0;
 engine.setColorChooser(new FixedColorChooser(BaseColor.Red));engine.setTargetChooser(new FixedTargetChooser(o.target??11));
 return {board,state,engine,caster,before,allies,enemies,side,opponent:theirs.player,cast:()=>engine.castSkill(caster.id)};
}
function skillPhase(ev:GameEvent[]){const i=ev.findIndex(e=>e.type==='elimination');return i<0?ev:ev.slice(0,i);}
function changes(ev:GameEvent[]){
 const out:{pos:string;from:GemType|null;to:GemType}[]=[];
 for(const e of skillPhase(ev)){
  if(e.type==='gem-create')for(const s of e.spawns)out.push({pos:`${s.pos.row},${s.pos.col}`,from:null,to:s.gemType});
  if(e.type==='gem-transform')for(const s of e.changes)out.push({pos:`${s.pos.row},${s.pos.col}`,from:s.from,to:s.to});
 }
 return out;
}
const isColor=(t:GemType|null|undefined,c:BaseColor)=>!!t&&t.kind==='color'&&t.color===c;
const cellsWhere=(fn:BoardFn,pred:(t:GemType|null)=>boolean)=>{const s:string[]=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(pred(fn(r,c)))s.push(`${r},${c}`);return s;};
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
function troopBinding(id:number,spell:number,cost:number,colors:BaseColor[],desc:string,steps:object[],zh:string){
 const en=original.find((t:{id:number})=>t.id===id)!,troop=TROOPS.find(t=>t.id===id)!,n=native.get(spell).raw;
 expect(en.stats.spell.id).toBe(spell);expect(en.stats.spell.desc).toBe(desc);expect(en.ManaCost).toBe(cost);
 expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(colors.map(x=>`Color${x}`).sort());
 expect(n.Cost).toBe(cost);expect(n.SpellSteps).toEqual(steps);
 expect(troop).toMatchObject({id,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
 expect(troop.spell.description).toBe(zh);
}
function refusal(o:Opts){
 for(const mode of ['low-mana','silence'] as const)it(`${mode}: real entry refuses, board/turn/mana untouched`,()=>{
  const f=setup(o);const before:string[]=[];f.board.forEach(g=>before.push(JSON.stringify(g)));
  if(mode==='low-mana')f.caster.mana=o.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);const after:string[]=[];f.board.forEach(g=>after.push(JSON.stringify(g)));
  expect(after).toEqual(before);expect(f.caster.mana).toBe(mode==='low-mana'?o.cost-1:o.cost);
  expect(f.state.actionLog).toHaveLength(0);expect(f.state.activePlayer).toBe(PlayerSide.Left);
  expect([...f.allies,...f.enemies].every(c=>c.statuses.length===0&&c.maxHp===1000)).toBe(true);
 });
}
const sides=[PlayerSide.Left,PlayerSide.Right];

// ——— troop:6677 / spell 8023 ———
describe('L4b troop:6677/spell:8023 Blue->Yellow, [Magic+1] Life to other allies, Bless the first ally',()=>{
 const base={skill:'8023',cost:12,colors:[BaseColor.Green,BaseColor.Purple],allies:[{},{}]};
 const board=pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]);
 it('source/native/prototype/display binding (native: Bless before Life)',()=>{
  troopBinding(6677,8023,12,base.colors,'Convert all Blue Gems to Yellow. Give [Magic + 1] Life to all other Allies. Then Bless the first Ally.',
   [{Color1:'Blue',Amount:100,Color2:'Yellow',Type:'ConvertGems'},{Target:'FrontAlly',Type:'CauseBlessed'},{SpellPowerMultiplier:1,Target:'AllAlliesButNotSelf',Amount:1,Primarypower:true,Type:'IncreaseHealth'}],
   '将所有蓝色宝石转换成黄色。给予所有其他盟友 [魔法 + 1] 点生命值，再赐福第一位盟友。');
  expect(registry.prototypes.get('8023')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Blue',to:'Yellow'}},
   {kind:'status',target:'allyFront',statusId:'blessed',turns:3},
   {kind:'buff',target:'allyOthers',stat:'hp',scaling:{base:1,mult:1},lifeMode:'gain'}]});
 });
 for(const side of sides)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: all 16 Blue -> Yellow, caster (front) Blessed, others +${magic+1} Life`,()=>{
  const f=setup({...base,side,magic,board});const ev=f.cast();
  const made=changes(ev);const blues=cellsWhere(board,t=>isColor(t,BaseColor.Blue));
  expect(made.map(m=>m.pos).sort()).toEqual(blues.sort());expect(blues).toHaveLength(16);
  expect(made.every(m=>isColor(m.from,BaseColor.Blue)&&isColor(m.to,BaseColor.Yellow))).toBe(true);
  expect(applied(ev)).toEqual([[0,'blessed',3]]);
  expect(f.caster.maxHp).toBe(1000);for(const a of f.allies){expect(a.maxHp).toBe(1000+magic+1);expect(a.hp).toBe(1000+magic+1);}
  expect(f.enemies.every(e=>e.maxHp===1000&&e.statuses.length===0)).toBe(true);
  // native order: convert -> Bless -> Life
  const order=skillPhase(ev).filter(e=>['gem-transform','status-apply','buff'].includes(e.type)).map(e=>e.type);
  expect(order[0]).toBe('gem-transform');expect(order.indexOf('status-apply')).toBeLessThan(order.indexOf('buff'));
  assertTurnAndMana(f,ev);
 });
 it('caster not first: the front ally is Blessed and still receives the Life (it is an "other" ally)',()=>{
  const f=setup({...base,board,before:[{}]});const ev=f.cast();
  expect(applied(ev)).toEqual([[5,'blessed',3]]);expect(f.before[0].maxHp).toBe(1011);expect(f.caster.maxHp).toBe(1000);
 });
 it('dead front ally is skipped: first living ally is Blessed',()=>{
  const f=setup({...base,board,before:[{defeated:true,hp:0}]});const ev=f.cast();
  expect(applied(ev)).toEqual([[0,'blessed',3]]);expect(f.before[0].hp).toBe(0);
 });
 it('no Blue on board: nothing converted, Bless + Life still resolve',()=>{
  const f=setup({...base,board:pattern([BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown])});const ev=f.cast();
  expect(changes(ev)).toEqual([]);expect(applied(ev)).toEqual([[0,'blessed',3]]);expect(f.allies[0].maxHp).toBe(1011);
 });
 it('lone caster: Blessed, no Life target',()=>{
  const f=setup({...base,board,allies:[]});const ev=f.cast();
  expect(applied(ev)).toEqual([[0,'blessed',3]]);expect(ev.some(e=>e.type==='buff')).toBe(false);
 });
 refusal({...base,board});
});

// ——— troop:7112 / spell 8655 ———
describe('L4b troop:7112/spell:8655 Brown->Skulls, then Curse and Death Mark all enemy Dwarves',()=>{
 const base={skill:'8655',cost:12,colors:[BaseColor.Blue,BaseColor.Purple],enemies:[{troopTypes:['Dwarf']},{troopTypes:['Human']},{troopTypes:['Dwarf','Giant']},{}]};
 const board=pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(7112,8655,12,base.colors,'Convert all Brown Gems to Skulls. Then Curse and Death Mark all Dwarves.',
   [{Color1:'Brown',Amount:100,Color2:'Skull',Type:'ConvertGems',Delay:1},{Target:'EnemyType',Type:'CauseCursed',Data:'dwarf'},{Target:'EnemyType',Type:'CauseDeathMark',Data:'dwarf'}],
   '将所有棕色宝石转换成骷髅头。使所有矮人陷入诅咒和死亡标记状态。');
  expect(registry.prototypes.get('8655')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Brown',to:'SKULL'}},
   {kind:'status',target:'enemyAll',statusId:'curse',turns:3,targetRace:'Dwarf'},
   {kind:'status',target:'enemyAll',statusId:'death-mark',turns:3,targetRace:'Dwarf'}]});
 });
 for(const side of sides)it(`real cast side=${side}: 16 Brown -> Skull, only Dwarf enemies (10,12) Cursed then Death Marked`,()=>{
  const f=setup({...base,side,board,allies:[{troopTypes:['Dwarf']}]});const ev=f.cast();
  const made=changes(ev);expect(made).toHaveLength(16);
  expect(made.every(m=>isColor(m.from,BaseColor.Brown)&&m.to.kind==='skull')).toBe(true);
  expect(applied(ev)).toEqual([[10,'curse',3],[12,'curse',3],[10,'death-mark',3],[12,'death-mark',3]]);
  expect(f.allies[0].statuses).toEqual([]);expect(f.enemies[1].statuses).toEqual([]);expect(f.enemies[3].statuses).toEqual([]);
  // native order: conversion precedes both statuses
  const sp=skillPhase(ev);expect(sp.findIndex(e=>e.type==='gem-transform')).toBeLessThan(sp.findIndex(e=>e.type==='status-apply'));
  assertTurnAndMana(f,ev);
 });
 it('no Dwarf enemy: conversion only',()=>{
  const f=setup({...base,board,enemies:[{},{troopTypes:['Human']}]});const ev=f.cast();
  expect(changes(ev)).toHaveLength(16);expect(applied(ev)).toEqual([]);
 });
 it('Blessed Dwarf: Curse cancels Blessed (both removed, official rule), then Death Mark lands; dead Dwarf skipped',()=>{
  const f=setup({...base,board,enemies:[{troopTypes:['Dwarf'],statuses:[{id:'blessed',turns:3}]},{troopTypes:['Dwarf'],defeated:true,hp:0},{troopTypes:['Dwarf']}]});
  const ev=f.cast();expect(applied(ev)).toEqual([[12,'curse',3],[10,'death-mark',3],[12,'death-mark',3]]);
  expect(f.enemies[0].statuses.map(s=>s.id)).toEqual(['death-mark']);expect(f.enemies[1].statuses).toEqual([]);
 });
 it('Curse strips a Dwarf Barrier; Skulls already on board are not re-converted',()=>{
  const b:BoardFn=(r,c)=>r===0&&c===0?skullGem():board(r,c);
  const f=setup({...base,board:b,enemies:[{troopTypes:['Dwarf'],statuses:[{id:'barrier',turns:3}]}]});const ev=f.cast();
  expect(changes(ev).some(m=>m.pos==='0,0')).toBe(false);
  expect(f.enemies[0].statuses.map(s=>s.id).sort()).toEqual(['curse','death-mark']);
 });
 refusal({...base,board});
});

// ——— troop:6779 / spell 8169 ———
describe('L4b troop:6779/spell:8169 Purple->Green, Hunter\'s Mark the first enemy',()=>{
 const base={skill:'8169',cost:12,colors:[BaseColor.Blue,BaseColor.Yellow]};
 const board=pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(6779,8169,12,base.colors,"Convert Purple Gems to Green. Hunter's Mark the first Enemy.",
   [{Color1:'Purple',Amount:100,Color2:'Green',Type:'ConvertGems',Delay:0},{Target:'FrontEnemy',Amount:1,Type:'CauseHuntersMark'}],
   '将紫色宝石转换成绿色。使第一名敌人陷入猎人标记状态。');
  expect(registry.prototypes.get('8169')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Purple',to:'Green'}},
   {kind:'status',target:'enemyFront',statusId:'marked',turns:3}]});
 });
 for(const side of sides)it(`real cast side=${side}: all 16 Purple -> Green, enemy 10 Hunter's Marked`,()=>{
  const f=setup({...base,side,board});const ev=f.cast();
  const made=changes(ev);expect(made).toHaveLength(16);
  expect(made.every(m=>isColor(m.from,BaseColor.Purple)&&isColor(m.to,BaseColor.Green))).toBe(true);
  expect(applied(ev)).toEqual([[10,'marked',3]]);expect(f.enemies.slice(1).every(e=>e.statuses.length===0)).toBe(true);
  const sp=skillPhase(ev);expect(sp.findIndex(e=>e.type==='gem-transform')).toBeLessThan(sp.findIndex(e=>e.type==='status-apply'));
  assertTurnAndMana(f,ev);
 });
 it('dead front enemy: first living enemy is Marked',()=>{
  const f=setup({...base,board,enemies:[{defeated:true,hp:0},{},{}]});expect(applied(f.cast())).toEqual([[11,'marked',3]]);
 });
 it('Blessed front enemy resists; no Purple on board -> no conversion',()=>{
  const f=setup({...base,board:pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Red,BaseColor.Brown]),enemies:[{statuses:[{id:'blessed',turns:3}]},{}]});
  const ev=f.cast();expect(changes(ev)).toEqual([]);expect(applied(ev)).toEqual([]);
 });
 refusal({...base,board});
});

// ——— troop:7170 / spell 8742 ———
describe('L4b troop:7170/spell:8742 Red->Green, then Yellow->Brown',()=>{
 const base={skill:'8742',cost:12,colors:[BaseColor.Blue,BaseColor.Green]};
 const board=pattern([BaseColor.Red,BaseColor.Yellow,BaseColor.Blue,BaseColor.Purple]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(7170,8742,12,base.colors,'Convert all Red Gems to Green, and all Yellow Gems to Brown.',
   [{Color1:'Red',Amount:100,Color2:'Green',Type:'ConvertGems',Delay:0},{Color1:'Yellow',Amount:100,Color2:'Brown',Type:'ConvertGems'}],
   '将所有红色宝石转换成绿色宝石，和所有黄色宝石转换成棕色宝石。');
  expect(registry.prototypes.get('8742')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Red',to:'Green'}},
   {kind:'gem',params:{op:'transform',from:'Yellow',to:'Brown'}}]});
 });
 for(const side of sides)it(`real cast side=${side}: 16 Red -> Green then 16 Yellow -> Brown (two ordered transforms)`,()=>{
  const f=setup({...base,side,board});const ev=f.cast();
  const tr=skillPhase(ev).filter(e=>e.type==='gem-transform');expect(tr).toHaveLength(2);
  const [a,b]=tr.map(e=>e.type==='gem-transform'?e.changes:[]);
  expect(a).toHaveLength(16);expect(a.every(c=>isColor(c.from,BaseColor.Red)&&isColor(c.to,BaseColor.Green))).toBe(true);
  expect(b).toHaveLength(16);expect(b.every(c=>isColor(c.from,BaseColor.Yellow)&&isColor(c.to,BaseColor.Brown))).toBe(true);
  expect(f.enemies.every(e=>e.hp===1000&&e.statuses.length===0)).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('Green created by step 1 is not touched by step 2; only Yellow present -> single transform',()=>{
  const f=setup({...base,board:pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Green])});const ev=f.cast();
  const tr=skillPhase(ev).filter(e=>e.type==='gem-transform');expect(tr).toHaveLength(1);
  expect(changes(ev).every(m=>isColor(m.from,BaseColor.Yellow)&&isColor(m.to,BaseColor.Brown))).toBe(true);
 });
 it('neither Red nor Yellow: no board change, turn still passes',()=>{
  const f=setup({...base,board:pattern([BaseColor.Blue,BaseColor.Green,BaseColor.Purple,BaseColor.Brown])});const ev=f.cast();
  expect(changes(ev)).toEqual([]);expect(f.state.activePlayer).toBe(PlayerSide.Right);expect(f.caster.mana).toBe(0);
 });
 refusal({...base,board});
});

// ——— weapon:1434 / spell 8647 (Krysta's Scythe) ———
describe('L4b weapon:1434/spell:8647 Stun all enemies, then create 3 Elemental Stars',()=>{
 const COST=14,COLORS=[BaseColor.Yellow,BaseColor.Brown];
 const expected={segments:[{kind:'status',target:'enemyAll',statusId:'stun',turns:3},
  {kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'elementalStar'}},count:{base:3,mult:0}}}]};
 const board=pattern([BaseColor.Yellow,BaseColor.Purple,BaseColor.Yellow,BaseColor.Purple]);
 it('gowhead English, native steps, numeric + gw_KrystasScythe aliases, cost/colour, Chinese display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1434)!;
  expect(o.stats.spell).toMatchObject({id:8647,desc:'Stun all Enemies, and then create 3 Elemental Stars.'});
  expect(o.ManaCost??o.manaCost).toBe(COST);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorBrown','ColorYellow']);
  const n=native.get(8647).raw;expect(n.Cost).toBe(COST);
  expect(n.SpellSteps).toEqual([{Target:'AllEnemies',Amount:1,Type:'CauseStun',Delay:1},{Color1:'ElementalStar',Amount:3,Type:'CreateGems'}]);
  const w=weapons.find(v=>v.id===1434)!;
  expect(w).toMatchObject({id:1434,referenceName:'KrystasScythe',manaCost:COST,manaColors:['Yellow','Brown'],spell:{id:8647}});
  expect(w.spell.description).toBe('击晕所有敌人，再创造 3 颗元素星。');
  expect(registry.prototypes.get('8647')).toEqual(expected);expect(registry.prototypes.get('gw_KrystasScythe')).toEqual(expected);
 });
 for(const side of sides)for(const alias of ['8647','gw_KrystasScythe'])
 it(`real cast side=${side} alias=${alias}: 4 enemies Stunned, then exactly 3 Elemental Stars on distinct cells`,()=>{
  const f=setup({skill:alias,cost:COST,colors:COLORS,side,board});const ev=f.cast();
  expect(applied(ev)).toEqual([[10,'stun',3],[11,'stun',3],[12,'stun',3],[13,'stun',3]]);
  const made=changes(ev);expect(made).toHaveLength(3);expect(new Set(made.map(m=>m.pos)).size).toBe(3);
  expect(made.every(m=>m.to.kind==='special'&&m.to.spec.kind==='elementalStar')).toBe(true);
  const sp=skillPhase(ev);expect(sp.findIndex(e=>e.type==='status-apply')).toBeLessThan(sp.findIndex(e=>e.type==='gem-transform'));
  assertTurnAndMana(f,ev);
 });
 it('3 empty cells are filled with the Stars first (gem-create)',()=>{
  const f=setup({skill:'8647',cost:COST,colors:COLORS,board:(r,c)=>r===0&&c<3?null:board(r,c)});const ev=f.cast();
  const cr=skillPhase(ev).find(e=>e.type==='gem-create');
  expect(cr&&cr.type==='gem-create'&&cr.spawns.map(s=>`${s.pos.row},${s.pos.col}`).sort()).toEqual(['0,0','0,1','0,2']);
 });
 it('created Star matches with Brown/Blue/Green/Red (star4 join key) and not with Yellow/Purple',async()=>{
  const {matchJoinKey,matchKeysConnect}=await import('@engine/types');
  const star=changes(setup({skill:'8647',cost:COST,colors:COLORS,board}).cast())[0].to;
  const k=matchJoinKey(star);
  for(const c of [BaseColor.Brown,BaseColor.Blue,BaseColor.Green,BaseColor.Red])expect(matchKeysConnect(k,matchJoinKey(colorGem(c)))).toBe(true);
  for(const c of [BaseColor.Yellow,BaseColor.Purple])expect(matchKeysConnect(k,matchJoinKey(colorGem(c)))).toBe(false);
  expect(matchKeysConnect(k,matchJoinKey(skullGem()))).toBe(false);
 });
 it('Blessed / dead enemies do not receive Stun; Stars still created',()=>{
  const f=setup({skill:'8647',cost:COST,colors:COLORS,board,enemies:[{statuses:[{id:'blessed',turns:3}]},{defeated:true,hp:0},{}]});const ev=f.cast();
  expect(applied(ev)).toEqual([[12,'stun',3]]);expect(changes(ev)).toHaveLength(3);
 });
 refusal({skill:'8647',cost:COST,colors:COLORS,board});
});
