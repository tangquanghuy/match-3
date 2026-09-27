// Lane L4b batch B22 (reviewer sa-L4b): convert-colour / create special gem skills, stored-snapshot scope.
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


const isSpecial=(t:GemType|null|undefined,k:string)=>!!t&&t.kind==='special'&&t.spec.kind===k;
const transforms=(ev:GameEvent[])=>skillPhase(ev).filter(e=>e.type==='gem-transform').map(e=>e.type==='gem-transform'?e.changes:[]);
void cellsWhere;void weapons;void rawWeapons;void applied;

// ——— troop:7499 / spell 9244 (fixed round 2: L4b-7499-dragon) ———
describe('L4b troop:7499/spell:9244 Brown->Yellow Dragon Gems, 1 Magic to all Yellow allies',()=>{
 const base={skill:'9244',cost:15,colors:[BaseColor.Blue,BaseColor.Yellow],allies:[{colors:[BaseColor.Yellow,BaseColor.Red]},{colors:[BaseColor.Green]}]};
 const board=pattern([BaseColor.Brown,BaseColor.Blue,BaseColor.Purple,BaseColor.Red]);
 it('source/native/prototype/display binding (AllyColor Data 3 = Yellow)',()=>{
  troopBinding(7499,9244,15,base.colors,'Convert all Brown Gems to Yellow Dragon Gems. Give 1 Magic to all Yellow Allies.',
   [{Color1:'Brown',Amount:100,Color2:'DragonYellow',Type:'ConvertGems'},{Target:'AllyColor',Amount:1,Type:'IncreaseSpellPower',Data:'3'}],'将所有棕色宝石转换成黄龙宝石。给予所有黄色盟友 1 点魔力值。');
  expect(registry.prototypes.get('9244')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Brown',to:'SKULL',toSpecial:{kind:'dragonGem',color:'Yellow'}}},
   {kind:'buff',target:'allyAll',stat:'magic',scaling:{base:1,mult:0},ifCond:{kind:'targetColor',color:'Yellow'}}]});
 });
 for(const side of sides)it(`real cast side=${side}: 16 Brown -> Yellow Dragon Gems; caster + Yellow ally +1 Magic`,()=>{
  const f=setup({...base,side,board});const ev=f.cast();const tr=transforms(ev);
  expect(tr[0]).toHaveLength(16);expect(tr[0].every(c=>isColor(c.from,BaseColor.Brown)&&isSpecial(c.to,'dragonGem')&&c.to.kind==='special'&&c.to.spec.color===BaseColor.Yellow)).toBe(true);
  expect(f.caster.magic).toBe(11);expect(f.allies[0].magic).toBe(12);expect(f.allies[1].magic).toBe(11);
  expect(f.enemies.every(e=>e.magic===11)).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('non-Yellow caster alone: conversion only; dead Yellow ally skipped',()=>{
  const f=setup({...base,colors:[BaseColor.Blue],board,allies:[{colors:[BaseColor.Yellow],defeated:true,hp:0}]});f.cast();
  expect(f.caster.magic).toBe(10);expect(f.allies[0].magic).toBe(11);
 });
 refusal({...base,board});
});

// ——— troop:6841 / spell 8246 (fixed round 2: L4b-6841-prefnotprev) ———
describe('L4b troop:6841/spell:8246 Purple->Yellow, Green->Skulls, [Magic+2] to 2 random enemies (RandomEnemy + RandomPrefNotPrevEnemy)',()=>{
 const base={skill:'8246',cost:18,colors:[BaseColor.Yellow,BaseColor.Brown]};
 const board=pattern([BaseColor.Purple,BaseColor.Green,BaseColor.Blue,BaseColor.Red]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(6841,8246,18,base.colors,'Convert Purple Gems to Yellow and Green Gems to Skulls. Deal [Magic + 2] damage to 2 random Enemies.',
   [{Color1:'Purple',Amount:100,Color2:'Yellow',Type:'ConvertGems'},{Color1:'Green',Amount:100,Color2:'Skull',Type:'ConvertGems'},
    {SpellPowerMultiplier:1,Target:'RandomEnemy',Amount:2,Primarypower:true,Type:'Damage'},{SpellPowerMultiplier:1,Target:'RandomPrefNotPrevEnemy',Amount:2,Type:'Damage'}],
   '将紫色宝石转换成黄色，绿色宝石转换成骷髅头。对 2 名随机敌人造成 [魔法 + 2] 点伤害。');
  expect(registry.prototypes.get('8246')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Purple',to:'Yellow'}},{kind:'gem',params:{op:'transform',from:'Green',to:'SKULL'}},
   {kind:'damage',target:'enemyRandom',scaling:{base:2,mult:1}},{kind:'damage',target:'enemyRandomPrefNotPrev',scaling:{base:2,mult:1}}]});
 });
 for(const side of sides)for(const seed of [1,42])it(`real cast side=${side} seed=${seed}: conversions, two hits of 12 on two different enemies`,()=>{
  const f=setup({...base,side,seed,board});const ev=f.cast();const tr=transforms(ev);
  expect(tr[0]).toHaveLength(16);expect(tr[0].every(c=>isColor(c.from,BaseColor.Purple)&&isColor(c.to,BaseColor.Yellow))).toBe(true);
  expect(tr[1]).toHaveLength(16);expect(tr[1].every(c=>isColor(c.from,BaseColor.Green)&&c.to.kind==='skull')).toBe(true);
  const hits=skillPhase(ev).filter(e=>e.type==='skill-damage').map(e=>e.type==='skill-damage'?e.targetId:-1);
  expect(hits).toHaveLength(2);expect(new Set(hits).size).toBe(2);
  expect(f.enemies.filter(e=>e.hp===988)).toHaveLength(2);
  assertTurnAndMana(f,ev);
 });
 it('lone living enemy: both hits land on it (prefer-not-previous falls back) -> 24 damage',()=>{
  const f=setup({...base,board,enemies:[{defeated:true,hp:0},{}]});const ev=f.cast();
  expect(skillPhase(ev).filter(e=>e.type==='skill-damage')).toHaveLength(2);expect(f.enemies[1].hp).toBe(976);
 });
 it('across seeds every living enemy can be hit, never the dead one',()=>{
  const hit=new Set<number>();for(let seed=1;seed<=20;seed++){const f=setup({...base,seed,board,enemies:[{},{},{defeated:true,hp:0},{}]});
   for(const e of skillPhase(f.cast()))if(e.type==='skill-damage'){expect(e.targetId).not.toBe(12);hit.add(e.targetId);}}
  expect([...hit].sort()).toEqual([10,11,13]);
 });
 refusal({...base,board});
});

// ——— troop:7071 / spell 8599 (fixed round 2: L4b-7071-base) ———
describe('L4b troop:7071/spell:8599 Create 2 Skulls + 2 per Brown ally and enemy',()=>{
 const base={skill:'8599',cost:12,colors:[BaseColor.Red,BaseColor.Brown]};
 const board=pattern([BaseColor.Yellow,BaseColor.Purple,BaseColor.Blue,BaseColor.Green]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(7071,8599,12,base.colors,'Create 2 Skulls, boosted by Brown Allies and Enemies. [x2]',
   [{Target:'AllAllies',Amount:200,Type:'CountArmyColor',Data:'5'},{Target:'AllEnemies',UseCounterForAmount:true,Amount:200,Type:'CountArmyColor',Data:'5'},{UseCounterForAmount:true,Color1:'Skull',Amount:2,Type:'CreateGems'}],
   '制造2个头骨，由棕色盟友和敌人激发。 [x2]');
  const mod={mod:{kind:'multiplier',a:2},sources:[{kind:'alliesOfColor',color:'Brown'},{kind:'enemiesOfColor',color:'Brown'}]};
  expect(registry.prototypes.get('8599')).toEqual({segments:[{kind:'gem',params:{op:'create',gem:{kind:'skull'},count:{base:2,mult:0},modifier:mod},modifier:mod}]});
 });
 for(const side of sides)it(`real cast side=${side}: caster Brown + 1 Brown ally + 2 Brown enemies -> 2 + 2x4 = 10 Skulls`,()=>{
  const f=setup({...base,side,board,allies:[{colors:[BaseColor.Brown]},{colors:[BaseColor.Blue]}],enemies:[{colors:[BaseColor.Brown]},{colors:[BaseColor.Brown,BaseColor.Red]},{colors:[BaseColor.Blue]}]});
  const ev=f.cast();const made=changes(ev);expect(made).toHaveLength(10);expect(made.every(m=>m.to.kind==='skull')).toBe(true);
  expect(new Set(made.map(m=>m.pos)).size).toBe(10);
  assertTurnAndMana(f,ev);
 });
 it('no Brown troop (non-Brown caster): base 2 Skulls; dead Brown enemy not counted',()=>{
  const f=setup({...base,colors:[BaseColor.Red],board,enemies:[{colors:[BaseColor.Brown],defeated:true,hp:0},{colors:[BaseColor.Blue]}]});
  expect(changes(f.cast())).toHaveLength(2);
 });
 refusal({...base,board});
});

// ——— troop:6093 / spell 7163 ———
describe('L4b troop:6093/spell:7163 Transform all Skulls to a chosen colour, gain [Magic+5] gold',()=>{
 const base={skill:'7163',cost:10,colors:[BaseColor.Green,BaseColor.Yellow]};
 const skulls=new Set(['0,0','2,5','4,1','7,7']);
 const board:BoardFn=(r,c)=>skulls.has(`${r},${c}`)?skullGem():pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown])(r,c);
 it('source/native/prototype/display binding',()=>{
  troopBinding(6093,7163,10,base.colors,'Transform all Skulls to Gems of a chosen Color. Gain [Magic + 5] gold.',
   [{Color1:'Skull',Amount:100,Color2:'FromTarget',Type:'ConvertGems'},{SpellPowerMultiplier:1,Amount:5,Primarypower:true,Type:'GiveGold'}],'将所有骷髅头转换成选定的法力颜色。获得 [魔法 + 5] 黄金。');
  expect(native.get(7163).raw.Target).toBe('ManaGemsOnly');
  expect(registry.prototypes.get('7163')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'SKULL',to:'CHOSEN'}},{kind:'gainEconomy',currency:'gold',scaling:{base:5,mult:1}}]});
 });
 for(const side of sides)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: 4 Skulls -> Red (chosen), +${magic+5} gold`,async()=>{
  const {goldForSide}=await import('@engine/battleGold');
  const f=setup({...base,side,magic,board});const g0=goldForSide(f.state,side);const ev=f.cast();const tr=transforms(ev);
  expect(tr).toHaveLength(1);expect(tr[0].map(c=>`${c.pos.row},${c.pos.col}`).sort()).toEqual([...skulls].sort());
  expect(tr[0].every(c=>c.from.kind==='skull'&&isColor(c.to,BaseColor.Red))).toBe(true);
  expect(goldForSide(f.state,side)).toBe(g0+magic+5);
  assertTurnAndMana(f,ev);
 });
 it('AI (default) colour chooser picks a mana colour (most common on board); no Skulls -> only gold',async()=>{
  const {AiColorChooser}=await import('@engine/skills/colorChooser');
  const f=setup({...base,board});f.engine.setColorChooser(new AiColorChooser());const tr=transforms(f.cast());
  expect(tr[0].every(c=>c.to.kind==='color')).toBe(true);
  const g=setup({...base,board:pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown])});const ev=g.cast();
  expect(transforms(ev)).toEqual([]);expect(ev.some(e=>e.type==='economy-gain')).toBe(true);
 });
 refusal({...base,board});
});

// ——— troop:7068 / spell 8596 (L4b-7068-potion-colour fixed; display still defective: L4b-7068-zh) ———
describe('L4b troop:7068/spell:8596 5 Green -> Purple Mana Potions, Brown -> Skulls, Cleanse Fey allies',()=>{
 const base={skill:'8596',cost:25,colors:[BaseColor.Blue,BaseColor.Red,BaseColor.Yellow],allies:[{troopTypes:['Fey'],statuses:[{id:'poison',turns:3}]},{troopTypes:['Human'],statuses:[{id:'poison',turns:3}]}]};
 const board=pattern([BaseColor.Green,BaseColor.Brown,BaseColor.Blue,BaseColor.Yellow]);
 it('source/native/prototype binding; display text recorded as-is (garbled, see issues L4b-7068-zh)',()=>{
  troopBinding(7068,8596,25,base.colors,'Convert 5 Green Gems to Purple Potions, and all Brown Gems to Skulls. Cleanse all Fey Allies.',
   [{Color1:'Green',Amount:5,Color2:'PurpleManaPotion',Type:'ConvertGems'},{Color1:'Brown',Amount:100,Color2:'Skull',Type:'ConvertGems'},{Target:'AllyType',Amount:1,Type:'Cleanse',Data:'fey'}],
   '将5有绿宝石都转化为紫色药水，并且所有棕色宝石都变为骷髅头。净化所有精灵同盟。');
  expect(registry.prototypes.get('8596')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Green',to:'SKULL',toSpecial:{kind:'manaPotionGem',color:'Purple'},count:{base:5,mult:0}}},
   {kind:'gem',params:{op:'transform',from:'Brown',to:'SKULL'}},{kind:'cleanse',target:'allyAll',targetRace:'Fey'}]});
 });
 for(const side of sides)it(`real cast side=${side}: exactly 5 Green -> Purple Mana Potion, 16 Brown -> Skull, only the Fey ally cleansed`,()=>{
  const f=setup({...base,side,board});const ev=f.cast();const tr=transforms(ev);
  expect(tr[0]).toHaveLength(5);expect(tr[0].every(c=>isColor(c.from,BaseColor.Green)&&isSpecial(c.to,'manaPotionGem')&&c.to.kind==='special'&&c.to.spec.color===BaseColor.Purple)).toBe(true);
  expect(tr[1]).toHaveLength(16);expect(tr[1].every(c=>isColor(c.from,BaseColor.Brown)&&c.to.kind==='skull')).toBe(true);
  expect(f.allies[0].statuses).toEqual([]);expect(f.allies[1].statuses.map(s=>s.id)).toEqual(['poison']);
  assertTurnAndMana(f,ev);
 });
});
