// Lane L4b batch B06 (reviewer sa-L4b): convert-colour / create special gem skills, stored-snapshot scope.
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
void cellsWhere;void skullGem;void changes;void applied;

function weaponBinding(id:number,ref:string,spell:number,cost:number,colors:BaseColor[],desc:string,steps:object[],zh:string,proto:object){
 const o=rawWeapons.find((v:{id:number})=>v.id===id)!;
 expect(o.stats.spell).toMatchObject({id:spell,desc});
 expect(o.ManaCost??o.manaCost).toBe(cost);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colors.map(c=>`Color${c}`).sort());
 const n=native.get(spell).raw;expect(n.Cost).toBe(cost);expect(n.SpellSteps).toEqual(steps);expect(n.Target).toBe('Enemy');
 const w=weapons.find(v=>v.id===id)!;
 expect(w).toMatchObject({id,referenceName:ref,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
 expect(w.spell.description).toBe(zh);
 expect(registry.prototypes.get(String(spell))).toEqual(proto);expect(registry.prototypes.get(`gw_${ref}`)).toEqual(proto);
}

// ——— weapon:1546 / spell 9159 (Solar Winds) ———
describe('L4b weapon:1546/spell:9159 Red->Cursed Gems, then [Magic+6] damage to a chosen enemy',()=>{
 const COST=14,COLORS=[BaseColor.Red,BaseColor.Yellow];
 const proto={segments:[{kind:'gem',params:{op:'transform',from:'Red',to:'SKULL',toSpecial:'curseGem'}},{kind:'damage',target:'enemyChosen',scaling:{base:6,mult:1}}]};
 const board=pattern([BaseColor.Red,BaseColor.Blue,BaseColor.Green,BaseColor.Purple]);
 it('gowhead English, native steps, numeric + gw_SolarWinds aliases, cost/colour, Chinese display',()=>{
  weaponBinding(1546,'SolarWinds',9159,COST,COLORS,'Convert all Red Gems to Cursed Gems. Then deal [Magic + 6] damage to an Enemy.',
   [{Color1:'Red',Amount:100,Color2:'Cursed',Type:'ConvertGems',Delay:1},{SpellPowerMultiplier:1,Target:'FromTarget',Amount:6,Primarypower:true,Type:'Damage'}],
   '将所有红色宝石转换成诅咒宝石。再对一名敌人造成 [魔法 + 6] 点伤害。',proto);
 });
 for(const side of sides)for(const alias of ['9159','gw_SolarWinds'])for(const magic of [0,10])
 it(`real cast side=${side} alias=${alias} magic=${magic}: 16 Red -> Cursed Gem, chosen enemy 12 takes ${magic+6}`,()=>{
  const f=setup({skill:alias,cost:COST,colors:COLORS,side,magic,board,target:12,enemies:[{},{},{armor:2},{}]});const ev=f.cast();
  const tr=transforms(ev);expect(tr).toHaveLength(1);expect(tr[0]).toHaveLength(16);
  expect(tr[0].every(c=>isColor(c.from,BaseColor.Red)&&isSpecial(c.to,'curseGem'))).toBe(true);
  expect(f.enemies[2].armor).toBe(0);expect(f.enemies[2].hp).toBe(1000-(magic+6-2));
  expect(f.enemies.filter((_,i)=>i!==2).every(e=>e.hp===1000)).toBe(true);
  const sp=skillPhase(ev);expect(sp.findIndex(e=>e.type==='gem-transform')).toBeLessThan(sp.findIndex(e=>e.type==='skill-damage'));
  assertTurnAndMana(f,ev);
 });
 it('Cursed Gem matches as Brown (official: matched with Brown Gems)',async()=>{
  const {matchJoinKey,specialGem}=await import('@engine/types');expect(matchJoinKey(specialGem('curseGem'))).toBe(BaseColor.Brown);
 });
 it('lethal hit on chosen enemy; ally is not a legal target (refused before mana)',()=>{
  const a=setup({skill:'9159',cost:COST,colors:COLORS,board,target:11,enemies:[{},{hp:5}]});a.cast();expect(a.enemies[1].defeated).toBe(true);
  const b=setup({skill:'9159',cost:COST,colors:COLORS,board,target:0});expect(b.cast()).toEqual([]);expect(b.caster.mana).toBe(COST);
 });
 refusal({skill:'9159',cost:COST,colors:COLORS,board});
});

// ——— weapon:1547 / spell 9160 (Lunar Tide) ———
describe('L4b weapon:1547/spell:9160 Purple->Doomskulls, then [Magic+6] damage to a chosen enemy',()=>{
 const COST=14,COLORS=[BaseColor.Green,BaseColor.Purple];
 const proto={segments:[{kind:'gem',params:{op:'transform',from:'Purple',to:'SKULL',toSpecial:'doomSkull'}},{kind:'damage',target:'enemyChosen',scaling:{base:6,mult:1}}]};
 const board=pattern([BaseColor.Purple,BaseColor.Blue,BaseColor.Green,BaseColor.Red]);
 it('gowhead English, native steps, numeric + gw_LunarTide aliases, cost/colour, Chinese display',()=>{
  weaponBinding(1547,'LunarTide',9160,COST,COLORS,'Convert all Purple Gems to Doomskulls. Then deal [Magic + 6] damage to an Enemy.',
   [{Color1:'Purple',Amount:100,Color2:'Doomskull',Type:'ConvertGems',Delay:1},{SpellPowerMultiplier:1,Target:'FromTarget',Amount:6,Primarypower:true,Type:'Damage'}],
   '将所有紫色宝石转换成末日骷髅头。再对一名敌人造成 [魔法 + 6] 点伤害。',proto);
 });
 for(const side of sides)for(const alias of ['9160','gw_LunarTide'])for(const magic of [0,10])
 it(`real cast side=${side} alias=${alias} magic=${magic}: 16 Purple -> Doomskull, chosen enemy 11 takes ${magic+6}`,()=>{
  const f=setup({skill:alias,cost:COST,colors:COLORS,side,magic,board,target:11});const ev=f.cast();
  const tr=transforms(ev);expect(tr).toHaveLength(1);expect(tr[0]).toHaveLength(16);
  expect(tr[0].every(c=>isColor(c.from,BaseColor.Purple)&&isSpecial(c.to,'doomSkull'))).toBe(true);
  expect(f.enemies[1].hp).toBe(1000-(magic+6));expect(f.enemies.filter((_,i)=>i!==1).every(e=>e.hp===1000)).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('Barrier on the chosen enemy absorbs the damage; Doomskulls still created',()=>{
  const f=setup({skill:'9160',cost:COST,colors:COLORS,board,target:11,enemies:[{},{statuses:[{id:'barrier',turns:3}]}]});const ev=f.cast();
  expect(f.enemies[1].hp).toBe(1000);expect(f.enemies[1].statuses).toEqual([]);expect(transforms(ev)[0]).toHaveLength(16);
 });
 refusal({skill:'9160',cost:COST,colors:COLORS,board});
});

// ——— troop:6542 / spell 7736 ———
describe('L4b troop:6542/spell:7736 Green->Blue, gain [Magic+1] Gold',()=>{
 const base={skill:'7736',cost:12,colors:[BaseColor.Red,BaseColor.Yellow]};
 const board=pattern([BaseColor.Green,BaseColor.Red,BaseColor.Purple,BaseColor.Brown]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(6542,7736,12,base.colors,'Transform all Green Gems to Blue. Give [Magic + 1] Gold.',
   [{Color1:'Green',Amount:100,Color2:'Blue',Type:'ConvertGems'},{SpellPowerMultiplier:1,Target:'Self',Amount:1,Primarypower:true,Type:'GiveGold'}],
   '将所有绿色宝石转换成蓝色。给予 [魔法 + 1] 黄金。');
  expect(registry.prototypes.get('7736')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Green',to:'Blue'}},{kind:'gainEconomy',currency:'gold',scaling:{base:1,mult:1}}]});
 });
 for(const side of sides)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: 16 Green -> Blue, +${magic+1} gold to the caster side`,async()=>{
  const {goldForSide}=await import('@engine/battleGold');
  const f=setup({...base,side,magic,board});const g0=goldForSide(f.state,side),o0=goldForSide(f.state,f.opponent);const ev=f.cast();
  const tr=transforms(ev);expect(tr).toHaveLength(1);expect(tr[0]).toHaveLength(16);expect(tr[0].every(c=>isColor(c.from,BaseColor.Green)&&isColor(c.to,BaseColor.Blue))).toBe(true);
  expect(ev.filter(e=>e.type==='economy-gain')).toEqual([{type:'economy-gain',currency:'gold',amount:magic+1,side}]);
  expect(goldForSide(f.state,side)).toBe(g0+magic+1);expect(goldForSide(f.state,f.opponent)).toBe(o0);
  assertTurnAndMana(f,ev);
 });
 it('no Green: gold still granted, no conversion',()=>{
  const f=setup({...base,board:pattern([BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown])});const ev=f.cast();
  expect(transforms(ev)).toEqual([]);expect(ev.some(e=>e.type==='economy-gain')).toBe(true);
 });
 refusal({...base,board});
});

// ——— troop:7412 / spell 9061 ———
describe('L4b troop:7412/spell:9061 Brown->Skulls, [Magic+1] Armor to a chosen ally',()=>{
 const base={skill:'9061',cost:13,colors:[BaseColor.Yellow,BaseColor.Purple],allies:[{},{}],target:2};
 const board=pattern([BaseColor.Brown,BaseColor.Blue,BaseColor.Green,BaseColor.Red]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(7412,9061,13,base.colors,'Convert all Brown Gems to Skulls. Give [Magic + 1] Armor to an Ally.',
   [{Color1:'Brown',Amount:100,Color2:'Skull',Type:'ConvertGems'},{SpellPowerMultiplier:1,Target:'FromTarget',Amount:1,Primarypower:true,Type:'IncreaseArmor'}],
   '将所有棕色宝石转换成骷髅头。给予一名盟友 [魔法 + 1] 点护甲值。');
  expect(native.get(9061).raw.Target).toBe('Ally');
  expect(registry.prototypes.get('9061')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Brown',to:'SKULL'}},{kind:'buff',target:'allyChosen',stat:'armor',scaling:{base:1,mult:1}}]});
 });
 for(const side of sides)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: 16 Brown -> Skull, chosen ally 2 gains ${magic+1} Armor`,()=>{
  const f=setup({...base,side,magic,board});const ev=f.cast();
  const tr=transforms(ev);expect(tr).toHaveLength(1);expect(tr[0]).toHaveLength(16);expect(tr[0].every(c=>isColor(c.from,BaseColor.Brown)&&c.to.kind==='skull')).toBe(true);
  expect(f.allies[1].armor).toBe(magic+1);expect(f.allies[0].armor).toBe(0);expect(f.caster.armor).toBe(0);
  assertTurnAndMana(f,ev);
 });
 it('caster may choose itself; enemy is not a legal target',()=>{
  const a=setup({...base,board,target:0});a.cast();expect(a.caster.armor).toBe(11);
  const b=setup({...base,board,target:11});expect(b.cast()).toEqual([]);expect(b.caster.mana).toBe(13);
 });
 refusal({...base,board});
});

// ——— troop:6687 / spell 8033 ———
describe('L4b troop:6687/spell:8033 Green->Skulls, [Magic+1] Life to the first ally',()=>{
 const base={skill:'8033',cost:12,colors:[BaseColor.Red,BaseColor.Yellow],allies:[{}]};
 const board=pattern([BaseColor.Green,BaseColor.Blue,BaseColor.Purple,BaseColor.Red]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(6687,8033,12,base.colors,'Convert Green Gems to Skulls. Give [Magic + 1] Life to the first Ally.',
   [{Color1:'Green',Amount:100,Color2:'Skull',Type:'ConvertGems'},{SpellPowerMultiplier:1,Target:'FrontAlly',Amount:1,Primarypower:true,Type:'IncreaseHealth'}],
   '将绿色宝石转换成骷髅头。给予第一位盟友 [魔法 + 1] 点生命值。');
  expect(registry.prototypes.get('8033')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Green',to:'SKULL'}},{kind:'buff',target:'allyFront',stat:'hp',scaling:{base:1,mult:1},lifeMode:'gain'}]});
 });
 for(const side of sides)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: 16 Green -> Skull, front (caster) +${magic+1} Life`,()=>{
  const f=setup({...base,side,magic,board});const ev=f.cast();
  const tr=transforms(ev);expect(tr).toHaveLength(1);expect(tr[0]).toHaveLength(16);expect(tr[0].every(c=>isColor(c.from,BaseColor.Green)&&c.to.kind==='skull')).toBe(true);
  expect(f.caster.maxHp).toBe(1000+magic+1);expect(f.caster.hp).toBe(1000+magic+1);expect(f.allies[0].maxHp).toBe(1000);
  assertTurnAndMana(f,ev);
 });
 it('ally in front of the caster gets the Life; dead front skipped',()=>{
  const a=setup({...base,board,before:[{}]});a.cast();expect(a.before[0].maxHp).toBe(1011);expect(a.caster.maxHp).toBe(1000);
  const b=setup({...base,board,before:[{defeated:true,hp:0}]});b.cast();expect(b.before[0].hp).toBe(0);expect(b.caster.maxHp).toBe(1011);
 });
 refusal({...base,board});
});
