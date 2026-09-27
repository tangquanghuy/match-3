// Lane L4b batch B04 (reviewer sa-L4b): convert-colour / create special gem skills, stored-snapshot scope.
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

// ——— troop:6590 / spell 7794 ———
describe('L4b troop:6590/spell:7794 Green->Brown, Enrage + [Magic+1] Life to the first ally',()=>{
 const base={skill:'7794',cost:12,colors:[BaseColor.Red,BaseColor.Yellow],allies:[{}]};
 const board=pattern([BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Blue]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(6590,7794,12,base.colors,'Transform all Green Gems to Brown. Enrage and give [Magic + 1] Life to the first ally.',
   [{Color1:'Green',Amount:100,Color2:'Brown',Type:'ConvertGems'},{Target:'FrontAlly',Type:'CauseEnraged'},{SpellPowerMultiplier:1,Target:'FrontAlly',Amount:1,Primarypower:true,Type:'IncreaseHealth'}],
   '将所有绿色宝石转换成棕色。赋予第一名盟友狂怒效果，并给予其 [魔法 + 1] 点生命值。');
  expect(registry.prototypes.get('7794')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Green',to:'Brown'}},
   {kind:'status',target:'allyFront',statusId:'rage',turns:3},
   {kind:'buff',target:'allyFront',stat:'hp',scaling:{base:1,mult:1},lifeMode:'gain'}]});
 });
 for(const side of sides)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: 16 Green -> Brown, front (caster) Enraged and +${magic+1} Life`,async()=>{
  const {isEnraged}=await import('@engine/skills/effects/status');
  const f=setup({...base,side,magic,board});const ev=f.cast();
  const made=changes(ev);expect(made).toHaveLength(16);expect(made.every(m=>isColor(m.from,BaseColor.Green)&&isColor(m.to,BaseColor.Brown))).toBe(true);
  expect(applied(ev)).toEqual([[0,'rage',3]]);expect(isEnraged(f.caster)).toBe(true);
  expect(f.caster.maxHp).toBe(1000+magic+1);expect(f.caster.hp).toBe(1000+magic+1);expect(f.allies[0].maxHp).toBe(1000);expect(f.allies[0].statuses).toEqual([]);
  const order=skillPhase(ev).filter(e=>['gem-transform','status-apply','buff'].includes(e.type)).map(e=>e.type);
  expect(order).toEqual(['gem-transform','status-apply','buff']);
  assertTurnAndMana(f,ev);
 });
 it('ally in front of the caster is the target of both Enrage and Life',()=>{
  const f=setup({...base,board,before:[{}]});const ev=f.cast();
  expect(applied(ev)).toEqual([[5,'rage',3]]);expect(f.before[0].maxHp).toBe(1011);expect(f.caster.maxHp).toBe(1000);
 });
 it('dead front ally skipped; enemies untouched',()=>{
  const f=setup({...base,board,before:[{defeated:true,hp:0}]});const ev=f.cast();
  expect(applied(ev)).toEqual([[0,'rage',3]]);expect(f.enemies.every(e=>e.statuses.length===0&&e.maxHp===1000)).toBe(true);
 });
 refusal({...base,board});
});

// ——— troop:6535 / spell 7729 ———
describe('L4b troop:6535/spell:7729 Brown->Red, Poison a random enemy (native 0% Damage step is inert)',()=>{
 const base={skill:'7729',cost:12,colors:[BaseColor.Blue,BaseColor.Green]};
 const board=pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(6535,7729,12,base.colors,'Transform all Brown Gems to Red. Poison a random enemy.',
   [{Color1:'Brown',Amount:100,Color2:'Red',Type:'ConvertGems'},{Target:'RandomEnemy',Amount:1,Type:'CausePoison'},{PercentageChance:0,Type:'Damage'}],
   '将所有棕色宝石转换成红色。使一名随机敌人陷入中毒状态。');
  expect(registry.prototypes.get('7729')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Brown',to:'Red'}},
   {kind:'status',target:'enemyRandom',statusId:'poison',turns:3,magnitude:3}]});
 });
 for(const side of sides)for(const seed of [1,42])it(`real cast side=${side} seed=${seed}: 16 Brown -> Red, exactly one living enemy Poisoned, no damage`,()=>{
  const f=setup({...base,side,seed,board});const ev=f.cast();
  const made=changes(ev);expect(made).toHaveLength(16);expect(made.every(m=>isColor(m.from,BaseColor.Brown)&&isColor(m.to,BaseColor.Red))).toBe(true);
  const ap=applied(ev);expect(ap).toHaveLength(1);expect(ap[0][1]).toBe('poison');expect([10,11,12,13]).toContain(ap[0][0]);
  // Native step 2 Damage PercentageChance 0 never fires: no skill-damage at all; only the poisoned enemy later takes its turn-start Poison tick.
  expect(ev.some(e=>e.type==='skill-damage')).toBe(false);
  expect(f.enemies.filter(e=>e.id!==ap[0][0]).every(e=>e.hp===1000)).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('random target only among living enemies; spread over seeds covers more than one enemy',()=>{
  const hit=new Set<number>();
  for(let seed=1;seed<=30;seed++){const f=setup({...base,seed,board,enemies:[{defeated:true,hp:0},{},{},{}]});const ap=applied(f.cast());expect(ap).toHaveLength(1);expect(ap[0][0]).not.toBe(10);hit.add(ap[0][0] as number);}
  expect(hit.size).toBeGreaterThan(1);
 });
 it('single Blessed enemy: Poison resisted, conversion still happens',()=>{
  const f=setup({...base,board,enemies:[{statuses:[{id:'blessed',turns:3}]}]});const ev=f.cast();
  expect(applied(ev)).toEqual([]);expect(changes(ev)).toHaveLength(16);
 });
 refusal({...base,board});
});

// ——— troop:6298 / spell 7448 ———
describe('L4b troop:6298/spell:7448 Purple->Skulls, Brown->Green, Barrier allied Beasts',()=>{
 const base={skill:'7448',cost:18,colors:[BaseColor.Green,BaseColor.Yellow],allies:[{troopTypes:['Beast']},{troopTypes:['Human']},{troopTypes:['Elf','Beast']}]};
 const board=pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(6298,7448,18,base.colors,'Transform Purple Gems to Skulls and transform Brown Gems to Green. Allied beasts gain Barrier.',
   [{Color1:'Purple',Amount:100,Color2:'Skull',Type:'ConvertGems'},{Color1:'Brown',Amount:100,Color2:'Green',Type:'ConvertGems'},{Target:'AllyType',Type:'CauseBarrier',Data:'beast'}],
   '将紫色宝石转换为骷髅头，并将棕色宝石转换为绿色。赋予野兽盟友屏障效果。');
  expect(registry.prototypes.get('7448')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Purple',to:'SKULL'}},
   {kind:'gem',params:{op:'transform',from:'Brown',to:'Green'}},
   {kind:'status',target:'allyAll',statusId:'barrier',turns:3,targetRace:'Beast'}]});
 });
 for(const side of sides)it(`real cast side=${side}: 16 Purple -> Skull, then 16 Brown -> Green, Barrier on Beast allies 1 and 3 only`,()=>{
  const f=setup({...base,side,board});const ev=f.cast();
  const tr=skillPhase(ev).filter(e=>e.type==='gem-transform').map(e=>e.type==='gem-transform'?e.changes:[]);
  expect(tr).toHaveLength(2);
  expect(tr[0]).toHaveLength(16);expect(tr[0].every(c=>isColor(c.from,BaseColor.Purple)&&c.to.kind==='skull')).toBe(true);
  expect(tr[1]).toHaveLength(16);expect(tr[1].every(c=>isColor(c.from,BaseColor.Brown)&&isColor(c.to,BaseColor.Green))).toBe(true);
  expect(applied(ev)).toEqual([[1,'barrier',3],[3,'barrier',3]]);
  expect(f.caster.statuses).toEqual([]);expect(f.allies[1].statuses).toEqual([]);expect(f.enemies.every(e=>e.statuses.length===0)).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('Beast caster Barriers itself; enemy Beasts are not allies',()=>{
  const f=setup({...base,board,allies:[],enemies:[{troopTypes:['Beast']}]});f.caster.troopTypes=['Beast'];const ev=f.cast();
  expect(applied(ev)).toEqual([[0,'barrier',3]]);expect(f.enemies[0].statuses).toEqual([]);
 });
 it('no Beast ally: conversions only; dead Beast skipped',()=>{
  const f=setup({...base,board,allies:[{troopTypes:['Beast'],defeated:true,hp:0},{troopTypes:['Human']}]});const ev=f.cast();
  expect(applied(ev)).toEqual([]);expect(changes(ev)).toHaveLength(32);
 });
 refusal({...base,board});
});

// ——— troop:7347 / spell 8975 ———
describe('L4b troop:7347/spell:8975 2 Purple -> Death Mark Gems, all Yellow -> Doomskulls',()=>{
 const base={skill:'8975',cost:15,colors:[BaseColor.Blue,BaseColor.Purple]};
 const board=pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(7347,8975,15,base.colors,'Convert 2 Purple Gems to Death Mark Gems. Convert all Yellow Gems to Doomskulls.',
   [{Color1:'Purple',Amount:2,Color2:'DeathMark',Type:'ConvertGems',Delay:800},{Color1:'Yellow',Amount:100,Color2:'Doomskull',Type:'ConvertGems'}],
   '将 2 颗紫色宝石转换成死亡标记宝石。将所有黄色宝石转换成末日骷髅头。');
  expect(registry.prototypes.get('8975')).toEqual({segments:[
   {kind:'gem',params:{op:'transform',from:'Purple',to:'SKULL',toSpecial:'deathMarkGem',count:{base:2,mult:0}}},
   {kind:'gem',params:{op:'transform',from:'Yellow',to:'SKULL',toSpecial:'doomSkull'}}]});
 });
 for(const side of sides)for(const seed of [1,42])it(`real cast side=${side} seed=${seed}: exactly 2 of 16 Purple -> Death Mark Gem, then all 16 Yellow -> Doomskull`,()=>{
  const f=setup({...base,side,seed,board});const ev=f.cast();
  const tr=skillPhase(ev).filter(e=>e.type==='gem-transform').map(e=>e.type==='gem-transform'?e.changes:[]);
  expect(tr).toHaveLength(2);
  expect(tr[0]).toHaveLength(2);expect(tr[0].every(c=>isColor(c.from,BaseColor.Purple)&&isSpecial(c.to,'deathMarkGem'))).toBe(true);
  expect(new Set(tr[0].map(c=>`${c.pos.row},${c.pos.col}`)).size).toBe(2);
  expect(tr[1]).toHaveLength(16);expect(tr[1].every(c=>isColor(c.from,BaseColor.Yellow)&&isSpecial(c.to,'doomSkull'))).toBe(true);
  let dm=0,purple=0;f.board.forEach(g=>{if(g&&isSpecial(g.type,'deathMarkGem'))dm++;if(g&&isColor(g.type,BaseColor.Purple))purple++;});
  expect(dm).toBe(2);expect(purple).toBe(14);
  expect(applied(ev)).toEqual([]);
  assertTurnAndMana(f,ev);
 });
 it('Death Mark Gem is colourless/unmatchable; Doomskull joins skull matches',async()=>{
  const {matchJoinKey,specialGem}=await import('@engine/types');
  expect(matchJoinKey(specialGem('deathMarkGem'))).toBeNull();expect(matchJoinKey(specialGem('doomSkull'))).toBe('skull');
 });
 it('only 1 Purple on board: 1 Death Mark Gem; no Yellow: second step skipped',()=>{
  const b:BoardFn=(r,c)=>r===3&&c===3?colorGem(BaseColor.Purple):pattern([BaseColor.Blue,BaseColor.Red,BaseColor.Green,BaseColor.Brown])(r,c);
  const f=setup({...base,board:b});const ev=f.cast();
  const tr=skillPhase(ev).filter(e=>e.type==='gem-transform');expect(tr).toHaveLength(1);
  expect(changes(ev)).toEqual([{pos:'3,3',from:colorGem(BaseColor.Purple),to:expect.objectContaining({kind:'special'})}]);
 });
 refusal({...base,board});
});

// ——— weapon:1532 / spell 9031 (Lodestar) ———
describe('L4b weapon:1532/spell:9031 3 Green -> Booty Gems, then all Yellow -> Doomskulls',()=>{
 const COST=14,COLORS=[BaseColor.Purple,BaseColor.Brown];
 const expected={segments:[
  {kind:'gem',params:{op:'transform',from:'Green',to:'SKULL',toSpecial:'bootyGem',count:{base:3,mult:0}}},
  {kind:'gem',params:{op:'transform',from:'Yellow',to:'SKULL',toSpecial:'doomSkull'}}]};
 const board=pattern([BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Blue]);
 it('gowhead English, native steps, numeric + gw_Lodestar aliases, cost/colour, Chinese display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1532)!;
  expect(o.stats.spell).toMatchObject({id:9031,desc:'Convert 3 Green Gems to Booty Gems. Then convert all Yellow Gems to Doomskulls.'});
  expect(o.ManaCost??o.manaCost).toBe(COST);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorBrown','ColorPurple']);
  const n=native.get(9031).raw;expect(n.Cost).toBe(COST);
  expect(n.SpellSteps).toEqual([{Color1:'Green',Amount:3,Color2:'Booty',Type:'ConvertGems',Delay:400},{Color1:'Yellow',Amount:100,Color2:'Doomskull',Type:'ConvertGems'}]);
  const w=weapons.find(v=>v.id===1532)!;
  expect(w).toMatchObject({id:1532,referenceName:'Lodestar',manaCost:COST,manaColors:['Purple','Brown'],spell:{id:9031}});
  expect(w.spell.description).toBe('将 3 颗绿色宝石转换成赃物宝石。再将所有黄色宝石转换成末日骷髅头。');
  expect(registry.prototypes.get('9031')).toEqual(expected);expect(registry.prototypes.get('gw_Lodestar')).toEqual(expected);
 });
 for(const side of sides)for(const alias of ['9031','gw_Lodestar'])it(`real cast side=${side} alias=${alias}: exactly 3 Green -> Booty, then 16 Yellow -> Doomskull`,()=>{
  const f=setup({skill:alias,cost:COST,colors:COLORS,side,board});const ev=f.cast();
  const tr=skillPhase(ev).filter(e=>e.type==='gem-transform').map(e=>e.type==='gem-transform'?e.changes:[]);
  expect(tr).toHaveLength(2);
  expect(tr[0]).toHaveLength(3);expect(tr[0].every(c=>isColor(c.from,BaseColor.Green)&&isSpecial(c.to,'bootyGem'))).toBe(true);
  expect(tr[1]).toHaveLength(16);expect(tr[1].every(c=>isColor(c.from,BaseColor.Yellow)&&isSpecial(c.to,'doomSkull'))).toBe(true);
  expect(f.enemies.every(e=>e.statuses.length===0)).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('Booty Gem is unmatchable (no mana colour)',async()=>{
  const {matchJoinKey,specialGem}=await import('@engine/types');expect(matchJoinKey(specialGem('bootyGem'))).toBeNull();
 });
 it('fewer than 3 Green: all available Green become Booty',()=>{
  const b:BoardFn=(r,c)=>(r===0&&c===0)||(r===5&&c===2)?colorGem(BaseColor.Green):pattern([BaseColor.Red,BaseColor.Blue,BaseColor.Purple,BaseColor.Brown])(r,c);
  const f=setup({skill:'9031',cost:COST,colors:COLORS,board:b});const ev=f.cast();
  expect(changes(ev).map(m=>m.pos).sort()).toEqual(['0,0','5,2']);expect(changes(ev).every(m=>isSpecial(m.to,'bootyGem'))).toBe(true);
 });
 refusal({skill:'9031',cost:COST,colors:COLORS,board});
});
