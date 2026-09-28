// Lane L4b batch B05 (reviewer sa-L4b): convert-colour / create special gem skills, stored-snapshot scope.
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
void cellsWhere;void skullGem;void weapons;void rawWeapons;void changes;

// ——— troop:6678 / spell 8024 ———
describe('L4b troop:6678/spell:8024 Purple->Red, Brown->Skulls, Bless 2 random allies',()=>{
 const base={skill:'8024',cost:18,colors:[BaseColor.Red,BaseColor.Yellow],allies:[{},{}]};
 const board=pattern([BaseColor.Purple,BaseColor.Blue,BaseColor.Brown,BaseColor.Green]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(6678,8024,18,base.colors,'Convert Purple Gems to Red, and Brown Gems to Skulls. Bless 2 random Allies.',
   [{Color1:'Purple',Amount:100,Color2:'Red',Type:'ConvertGems'},{Color1:'Brown',Amount:100,Color2:'Skull',Type:'ConvertGems'},{Target:'RandomAlly',Type:'CauseBlessed'},{Target:'RandomPrefNotPrevAlly',Type:'CauseBlessed'}],
   '将紫色宝石转换成红色，和棕色宝石转换成骷髅头。赐福 2 位随机盟友。');
  expect(registry.prototypes.get('8024')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Purple',to:'Red'}},
   {kind:'gem',params:{op:'transform',from:'Brown',to:'SKULL'}},{kind:'status',target:'allyRandomPrefNotPrevN',statusId:'blessed',turns:3,n:2}]});
 });
 for(const side of sides)for(const seed of [1,42])it(`real cast side=${side} seed=${seed}: 16 Purple->Red, 16 Brown->Skull, 2 distinct living allies Blessed`,()=>{
  const f=setup({...base,side,seed,board});const ev=f.cast();const tr=transforms(ev);
  expect(tr).toHaveLength(2);expect(tr[0]).toHaveLength(16);expect(tr[0].every(c=>isColor(c.from,BaseColor.Purple)&&isColor(c.to,BaseColor.Red))).toBe(true);
  expect(tr[1]).toHaveLength(16);expect(tr[1].every(c=>isColor(c.from,BaseColor.Brown)&&c.to.kind==='skull')).toBe(true);
  const ap=applied(ev);expect(ap).toHaveLength(2);expect(ap.every(a=>a[1]==='blessed')).toBe(true);
  expect(new Set(ap.map(a=>a[0])).size).toBe(2);expect(ap.every(a=>[0,1,2].includes(a[0] as number))).toBe(true);
  expect(f.enemies.every(e=>e.statuses.length===0)).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('2 random picks prefer different allies: across seeds every ally gets picked; dead ally never',()=>{
  const hit=new Set<number>();
  for(let seed=1;seed<=30;seed++){const f=setup({...base,seed,board,allies:[{},{defeated:true,hp:0},{}]});const ap=applied(f.cast());
   expect(ap).toHaveLength(2);expect(new Set(ap.map(a=>a[0])).size).toBe(2);expect(ap.some(a=>a[0]===2)).toBe(false);ap.forEach(a=>hit.add(a[0] as number));}
  expect([...hit].sort()).toEqual([0,1,3]);
 });
 it('lone caster: RandomAlly + RandomPrefNotPrevAlly both land on the caster (two applications, R007-3); one Blessed status',()=>{
  const f=setup({...base,board,allies:[]});const ev=f.cast();
  expect(applied(ev).map(a=>a[0])).toEqual([0,0]);expect(f.caster.statuses.map(s=>s.id)).toEqual(['blessed']);
 });
 refusal({...base,board});
});

// ——— troop:6479 / spell 7666 ———
describe('L4b troop:6479/spell:7666 Red->Skulls, Green->Yellow, Enchant 2 random allies',()=>{
 const base={skill:'7666',cost:18,colors:[BaseColor.Yellow,BaseColor.Purple],allies:[{},{}]};
 const board=pattern([BaseColor.Red,BaseColor.Blue,BaseColor.Green,BaseColor.Purple]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(6479,7666,18,base.colors,'Transform Red Gems to Skulls and Green Gems to Yellow. Enchant 2 random allies.',
   [{Color1:'Red',Amount:100,Color2:'Skull',Type:'ConvertGems'},{Color1:'Green',Amount:100,Color2:'Yellow',Type:'ConvertGems'},{Target:'RandomAlly',Amount:1,Type:'CauseEnchanted'},{Target:'RandomPrefNotPrevAlly',Amount:1,Type:'CauseEnchanted'}],
   '将所有红色宝石转换成骷髅头，和所有绿色宝石转换成黄色。赋予两名随机盟友法印效果。');
  expect(registry.prototypes.get('7666')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Red',to:'SKULL'}},
   {kind:'gem',params:{op:'transform',from:'Green',to:'Yellow'}},{kind:'status',target:'allyRandomPrefNotPrevN',statusId:'enchanted',turns:3,n:2}]});
 });
 for(const side of sides)for(const seed of [1,42])it(`real cast side=${side} seed=${seed}: 16 Red->Skull, 16 Green->Yellow, 2 distinct allies Enchanted`,()=>{
  const f=setup({...base,side,seed,board});const ev=f.cast();const tr=transforms(ev);
  expect(tr).toHaveLength(2);expect(tr[0].every(c=>isColor(c.from,BaseColor.Red)&&c.to.kind==='skull')).toBe(true);expect(tr[0]).toHaveLength(16);
  expect(tr[1].every(c=>isColor(c.from,BaseColor.Green)&&isColor(c.to,BaseColor.Yellow))).toBe(true);expect(tr[1]).toHaveLength(16);
  const ap=applied(ev);expect(ap.map(a=>a[1])).toEqual(['enchanted','enchanted']);expect(new Set(ap.map(a=>a[0])).size).toBe(2);
  assertTurnAndMana(f,ev);
 });
 it('Blessed ally (official: immune to all status effects) is picked but resists Enchanted; caster still Enchanted',()=>{
  const f=setup({...base,board,allies:[{statuses:[{id:'blessed',turns:3}]}]});const ev=f.cast();
  expect(applied(ev).map(a=>a[0])).toEqual([0]);expect(f.allies[0].statuses.map(s=>s.id)).toEqual(['blessed']);
 });
 it('lone caster: both native picks fall back to the caster (two applications, R007-3); Enchanted once',()=>{
  const f=setup({...base,board,allies:[]});expect(applied(f.cast()).map(a=>a[0])).toEqual([0,0]);
  expect(f.caster.statuses.filter(s=>s.id==='enchanted')).toHaveLength(1);
 });
 refusal({...base,board});
});

// ——— troop:7655 / spell 9570 ———
describe('L4b troop:7655/spell:9570 Red->Purple, Yellow->Skulls, Enchant Purple allies + [Magic+1] Life + 4 Magic',()=>{
 const base={skill:'9570',cost:18,colors:[BaseColor.Yellow,BaseColor.Purple],allies:[{colors:[BaseColor.Purple,BaseColor.Red]},{colors:[BaseColor.Blue]},{colors:[BaseColor.Purple]}]};
 const board=pattern([BaseColor.Red,BaseColor.Blue,BaseColor.Yellow,BaseColor.Green]);
 it('source/native/prototype/display binding (AllyColor Data 4 = Purple)',()=>{
  troopBinding(7655,9570,18,base.colors,'Convert all Red Gems to Purple, and all Yellow Gems to Skulls. Enchant all Purple Allies, and give them [Magic + 1] Life and 4 Magic.',
   [{Color1:'Red',Amount:100,Color2:'Purple',Type:'ConvertGems'},{Color1:'Yellow',Amount:100,Color2:'Skull',Type:'ConvertGems',Delay:400},{Target:'AllyColor',Type:'CauseEnchanted',Data:'4'},{SpellPowerMultiplier:1,Target:'AllyColor',Amount:1,Primarypower:true,Type:'IncreaseHealth',Data:'4'},{Target:'AllyColor',Amount:4,Type:'IncreaseSpellPower',Data:'4'}],
   '将所有红色宝石转换为紫色，将所有黄色宝石转换为骷髅。为所有紫色盟友附魔，并赋予他们 [魔法 + 1] 生命和 4 魔法。');
  const c={ifCond:{kind:'targetColor',color:'Purple'}};
  expect(registry.prototypes.get('9570')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Red',to:'Purple'}},
   {kind:'gem',params:{op:'transform',from:'Yellow',to:'SKULL'}},
   {kind:'status',target:'allyAll',statusId:'enchanted',turns:3,...c},
   {kind:'buff',target:'allyAll',stat:'hp',scaling:{base:1,mult:1},...c,lifeMode:'gain'},
   {kind:'buff',target:'allyAll',stat:'magic',scaling:{base:4,mult:0},...c}]});
 });
 for(const side of sides)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: conversions, Purple allies (caster,1,3) Enchanted, +${magic+1} Life, +4 Magic`,()=>{
  const f=setup({...base,side,magic,board});const ev=f.cast();const tr=transforms(ev);
  expect(tr).toHaveLength(2);expect(tr[0]).toHaveLength(16);expect(tr[0].every(c=>isColor(c.from,BaseColor.Red)&&isColor(c.to,BaseColor.Purple))).toBe(true);
  expect(tr[1]).toHaveLength(16);expect(tr[1].every(c=>isColor(c.from,BaseColor.Yellow)&&c.to.kind==='skull')).toBe(true);
  expect(applied(ev)).toEqual([[0,'enchanted',3],[1,'enchanted',3],[3,'enchanted',3]]);
  for(const c of [f.caster,f.allies[0],f.allies[2]]){expect(c.maxHp).toBe(1000+magic+1);expect(c.hp).toBe(1000+magic+1);}
  expect(f.caster.magic).toBe(magic+4);expect(f.allies[0].magic).toBe(15);expect(f.allies[2].magic).toBe(15);
  expect(f.allies[1]).toMatchObject({maxHp:1000,magic:11,statuses:[]});
  expect(f.enemies.every(e=>e.statuses.length===0&&e.maxHp===1000)).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('native order: Enchant, then Life, then Magic; Life uses caster Magic before its own +4',()=>{
  const f=setup({...base,magic:10,board,allies:[]});const ev=f.cast();
  const order=skillPhase(ev).filter(e=>['status-apply','buff'].includes(e.type)).map(e=>e.type==='buff'?`buff:${e.stat}`:e.type);
  expect(order).toEqual(['status-apply','buff:hp','buff:magic']);expect(f.caster.maxHp).toBe(1011);expect(f.caster.magic).toBe(14);
 });
 it('non-Purple caster and no Purple ally: only conversions',()=>{
  const f=setup({...base,colors:[BaseColor.Yellow],board,allies:[{colors:[BaseColor.Blue]}]});const ev=f.cast();
  expect(applied(ev)).toEqual([]);expect(ev.some(e=>e.type==='buff')).toBe(false);expect(transforms(ev)).toHaveLength(2);
 });
 refusal({...base,board});
});

// ——— troop:6604 / spell 7813 ———
describe('L4b troop:6604/spell:7813 Blue->Brown, Yellow->Skulls, Enrage all allies, Burn all enemies',()=>{
 const base={skill:'7813',cost:18,colors:[BaseColor.Yellow,BaseColor.Brown],allies:[{},{}]};
 const board=pattern([BaseColor.Blue,BaseColor.Red,BaseColor.Yellow,BaseColor.Green]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(6604,7813,18,base.colors,'Transform Blue Gems to Brown and Yellow to Skulls. Enrage all allies and Burn all enemies.',
   [{Color1:'Blue',Amount:100,Color2:'Brown',Type:'ConvertGems'},{Color1:'Yellow',Amount:100,Color2:'Skull',Type:'ConvertGems'},{Target:'AllAllies',Type:'CauseEnraged'},{Target:'AllEnemies',Type:'CauseBurning'}],
   '将所有蓝色宝石转换成棕色，和所有黄色宝石转换成骷髅头。赋予所有盟友狂怒效果并使所有敌人陷入燃烧状态。');
  expect(registry.prototypes.get('7813')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Blue',to:'Brown'}},
   {kind:'gem',params:{op:'transform',from:'Yellow',to:'SKULL'}},{kind:'status',target:'allyAll',statusId:'rage',turns:3},
   {kind:'status',target:'enemyAll',statusId:'burning',turns:3,magnitude:3}]});
 });
 for(const side of sides)it(`real cast side=${side}: conversions, 3 allies Enraged then 4 enemies Burning`,async()=>{
  const {isEnraged}=await import('@engine/skills/effects/status');
  const f=setup({...base,side,board});const ev=f.cast();const tr=transforms(ev);
  expect(tr).toHaveLength(2);expect(tr[0]).toHaveLength(16);expect(tr[0].every(c=>isColor(c.from,BaseColor.Blue)&&isColor(c.to,BaseColor.Brown))).toBe(true);
  expect(tr[1]).toHaveLength(16);expect(tr[1].every(c=>isColor(c.from,BaseColor.Yellow)&&c.to.kind==='skull')).toBe(true);
  expect(applied(ev).map(a=>[a[0],a[1]])).toEqual([[0,'rage'],[1,'rage'],[2,'rage'],[10,'burning'],[11,'burning'],[12,'burning'],[13,'burning']]);
  expect([f.caster,...f.allies].every(c=>isEnraged(c))).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('Blessed enemy resists Burning; dead ally/enemy skipped',()=>{
  const f=setup({...base,board,allies:[{defeated:true,hp:0}],enemies:[{statuses:[{id:'blessed',turns:3}]},{defeated:true,hp:0},{}]});const ev=f.cast();
  expect(applied(ev).map(a=>[a[0],a[1]])).toEqual([[0,'rage'],[12,'burning']]);
 });
 refusal({...base,board});
});

// ——— troop:7453 / spell 9163 ———
describe('L4b troop:7453/spell:9163 Green->Terror Gems, [Magic+2] damage to a random enemy',()=>{
 const base={skill:'9163',cost:13,colors:[BaseColor.Red,BaseColor.Yellow]};
 const board=pattern([BaseColor.Green,BaseColor.Blue,BaseColor.Red,BaseColor.Brown]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(7453,9163,13,base.colors,'Convert all Green Gems to Terror Gems. Deal [Magic + 2] damage to a random Enemy.',
   [{Color1:'Green',Amount:100,Color2:'Terror',Type:'ConvertGems'},{SpellPowerMultiplier:1,Target:'RandomEnemy',Amount:2,Primarypower:true,Type:'Damage'}],
   '将所有绿色宝石转换成恐怖宝石。对一名随机敌人造成 [魔法 + 2] 点伤害。');
  expect(registry.prototypes.get('9163')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Green',to:'SKULL',toSpecial:'terrorGem'}},
   {kind:'damage',target:'enemyRandom',scaling:{base:2,mult:1}}]});
 });
 for(const side of sides)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: 16 Green -> Terror Gem, one random enemy takes ${magic+2}`,()=>{
  const f=setup({...base,side,magic,board,enemies:[{armor:1},{armor:1},{armor:1},{armor:1}]});const ev=f.cast();
  const tr=transforms(ev);expect(tr).toHaveLength(1);expect(tr[0]).toHaveLength(16);
  expect(tr[0].every(c=>isColor(c.from,BaseColor.Green)&&isSpecial(c.to,'terrorGem'))).toBe(true);
  const hits=skillPhase(ev).filter(e=>e.type==='skill-damage');expect(hits).toHaveLength(1);
  const hurt=f.enemies.filter(e=>e.hp<1000||e.armor<1);expect(hurt).toHaveLength(1);
  expect(hurt[0].armor).toBe(0);expect(hurt[0].hp).toBe(1000-(magic+2-1));
  expect(skillPhase(ev).findIndex(e=>e.type==='gem-transform')).toBeLessThan(skillPhase(ev).findIndex(e=>e.type==='skill-damage'));
  assertTurnAndMana(f,ev);
 });
 it('Terror Gem matches as Purple (official: matched with Purple Gems)',async()=>{
  const {matchJoinKey,specialGem}=await import('@engine/types');expect(matchJoinKey(specialGem('terrorGem'))).toBe(BaseColor.Purple);
 });
 it('random target excludes dead enemies; Barrier absorbs the hit',()=>{
  for(let seed=1;seed<=10;seed++){const f=setup({...base,seed,board,enemies:[{defeated:true,hp:0},{statuses:[{id:'barrier',turns:3}]}]});f.cast();
   expect(f.enemies[1].hp).toBe(1000);expect(f.enemies[1].statuses.some(s=>s.id==='barrier')).toBe(false);}
 });
 refusal({...base,board});
});
