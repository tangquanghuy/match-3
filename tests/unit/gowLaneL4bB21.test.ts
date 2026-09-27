// Lane L4b batch B21 (reviewer sa-L4b): convert-colour / create special gem skills, stored-snapshot scope.
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
import {FixedCellChooser} from '@engine/skills/cellChooser';
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
void cellsWhere;void skullGem;void weapons;void rawWeapons;

// ——— troop:7030 / spell 8557 (fixed round 2: L4b-7030-dragon) ———
describe('L4b troop:7030/spell:8557 Convert all Red Gems into Yellow Dragon Gems',()=>{
 const base={skill:'8557',cost:13,colors:[BaseColor.Blue,BaseColor.Green]};
 const board=pattern([BaseColor.Red,BaseColor.Blue,BaseColor.Purple,BaseColor.Brown]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(7030,8557,13,base.colors,'Convert all Red Gems into Yellow Dragon Gems.',
   [{Color1:'Red',Amount:100,Color2:'DragonYellow',Type:'ConvertGems'}],'将所有红色宝石转换成黄龙宝石。');
  expect(registry.prototypes.get('8557')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Red',to:'SKULL',toSpecial:{kind:'dragonGem',color:'Yellow'}}}]});
 });
 for(const side of sides)it(`real cast side=${side}: all 16 Red -> Yellow Dragon Gems`,()=>{
  const f=setup({...base,side,board});const ev=f.cast();const tr=transforms(ev);
  expect(tr).toHaveLength(1);expect(tr[0]).toHaveLength(16);
  expect(tr[0].every(c=>isColor(c.from,BaseColor.Red)&&isSpecial(c.to,'dragonGem')&&c.to.kind==='special'&&c.to.spec.color===BaseColor.Yellow)).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('Yellow Dragon Gem matches as Yellow (official: matched with their colour)',async()=>{
  const {matchJoinKey,specialGem}=await import('@engine/types');expect(matchJoinKey(specialGem('dragonGem',undefined,BaseColor.Yellow))).toBe(BaseColor.Yellow);
 });
 it('no Red on board: no conversion, turn passes',()=>{
  const f=setup({...base,board:pattern([BaseColor.Yellow,BaseColor.Blue,BaseColor.Purple,BaseColor.Brown])});const ev=f.cast();
  expect(transforms(ev)).toEqual([]);expect(f.state.activePlayer).toBe(PlayerSide.Right);
 });
 refusal({...base,board});
});

// ——— troop:7276 / spell 8901 (fixed round 2: L4b-7276-singlegem) ———
describe('L4b troop:7276/spell:8901 Convert a chosen Mana Gem to an Uber Doomskull',()=>{
 const base={skill:'8901',cost:12,colors:[BaseColor.Red,BaseColor.Brown]};
 const board=pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Green]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(7276,8901,12,base.colors,'Convert a chosen Mana Gem to an Uber Doomskull.',
   [{Color1:'FromTarget',Amount:1,Color2:'UberDoomskull',BoardTarget:'SingleGem',Type:'ConvertGems'}],'将一个选定的法力颜色宝石转换成一颗超级末日骷髅头。');
  expect(native.get(8901).raw.Target).toBe('ManaGemsOnly');
  expect(registry.prototypes.get('8901')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'CELL',to:'SKULL',toSpecial:'uberDoomSkull'}}]});
 });
 for(const side of sides)for(const cell of [{row:0,col:0},{row:5,col:3}])it(`real cast side=${side}: only the chosen cell (${cell.row},${cell.col}) becomes an Uber Doomskull`,()=>{
  const f=setup({...base,side,board});f.engine.setCellChooser(new FixedCellChooser(cell));const ev=f.cast();
  const tr=transforms(ev);expect(tr).toHaveLength(1);expect(tr[0]).toHaveLength(1);
  expect(tr[0][0].pos).toEqual(cell);expect(isSpecial(tr[0][0].to,'uberDoomSkull')).toBe(true);expect(tr[0][0].from).toEqual(board(cell.row,cell.col));
  let n=0;f.board.forEach(g=>{if(g&&isSpecial(g.type,'uberDoomSkull'))n++;});expect(n).toBe(1);
  assertTurnAndMana(f,ev);
 });
 it('same-colour gems elsewhere are untouched (was: whole colour converted)',()=>{
  const f=setup({...base,board});f.engine.setCellChooser(new FixedCellChooser({row:0,col:0}));f.cast();
  let blue=0;f.board.forEach(g=>{if(g&&isColor(g.type,BaseColor.Blue))blue++;});expect(blue).toBe(15);
 });
 it('Uber Doomskull joins skull matches',async()=>{
  const {matchJoinKey,specialGem}=await import('@engine/types');expect(matchJoinKey(specialGem('uberDoomSkull'))).toBe('skull');
 });
 refusal({...base,board});
});

// ——— troop:7195 / spell 8782 (fixed round 2: L4b-7195-order) ———
describe('L4b troop:7195/spell:8782 Convert all Green Gems to Skulls, Hunter\'s Mark the first enemy (native order)',()=>{
 const base={skill:'8782',cost:12,colors:[BaseColor.Red,BaseColor.Yellow]};
 const board=pattern([BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Blue]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(7195,8782,12,base.colors,'Inflict Hunter’s Mark on the first Enemy. Then convert all Green Gems to Skulls.',
   [{Color1:'Green',Amount:100,Color2:'Skull',Type:'ConvertGems'},{Target:'FrontEnemy',Type:'CauseHuntersMark'}],'使首位敌人陷入猎人标记状态。再将所有绿色宝石转换成骷髅头。');
  expect(registry.prototypes.get('8782')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Green',to:'SKULL'}},{kind:'status',target:'enemyFront',statusId:'marked',turns:3}]});
 });
 for(const side of sides)it(`real cast side=${side}: 16 Green -> Skull, then enemy 10 Hunter's Marked`,()=>{
  const f=setup({...base,side,board});const ev=f.cast();const tr=transforms(ev);
  expect(tr[0]).toHaveLength(16);expect(tr[0].every(c=>isColor(c.from,BaseColor.Green)&&c.to.kind==='skull')).toBe(true);
  expect(applied(ev)).toEqual([[10,'marked',3]]);
  const sp=skillPhase(ev);expect(sp.findIndex(e=>e.type==='gem-transform')).toBeLessThan(sp.findIndex(e=>e.type==='status-apply'));
  assertTurnAndMana(f,ev);
 });
 it('dead front enemy: next living enemy Marked; Blessed front resists',()=>{
  const a=setup({...base,board,enemies:[{defeated:true,hp:0},{},{}]});expect(applied(a.cast())).toEqual([[11,'marked',3]]);
  const b=setup({...base,board,enemies:[{statuses:[{id:'blessed',turns:3}]},{}]});expect(applied(b.cast())).toEqual([]);
 });
 refusal({...base,board});
});

// ——— troop:6711 / spell 8069 ———
describe('L4b troop:6711/spell:8069 Cleanse and Bless an ally, create 10 gems of one of their mana colours',()=>{
 const base={skill:'8069',cost:10,colors:[BaseColor.Red,BaseColor.Purple],target:1,
  allies:[{colors:[BaseColor.Green],statuses:[{id:'poison',turns:3},{id:'barrier',turns:3}]},{colors:[BaseColor.Blue,BaseColor.Yellow]}]};
 const board=pattern([BaseColor.Red,BaseColor.Purple,BaseColor.Brown,BaseColor.Red]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(6711,8069,10,base.colors,'Cleanse and Bless an Ally. Create 10 Gems of one of their Mana Colors.',
   [{Target:'FromTarget',Amount:1,Type:'Cleanse'},{Target:'FromTarget',Type:'CauseBlessed'},{Color1:'FromTarget',Amount:10,Type:'CreateGems'}],'净化和赐福一名盟友。创造与其法力颜色相同的 10 颗宝石。');
  expect(native.get(8069).raw.Target).toBe('Ally');
  expect(registry.prototypes.get('8069')).toEqual({segments:[{kind:'cleanse',target:'allyChosen'},{kind:'status',target:'lastTarget',statusId:'blessed',turns:3},
   {kind:'gem',params:{op:'create',gem:{kind:'color',color:'LAST_TARGET'},count:{base:10,mult:0}}}]});
 });
 for(const side of sides)it(`real cast side=${side}: ally 1 cleansed of Poison (Barrier kept), Blessed, 10 Green`,()=>{
  const f=setup({...base,side,board});const ev=f.cast();
  expect(f.allies[0].statuses.map(s=>s.id).sort()).toEqual(['barrier','blessed']);
  expect(applied(ev)).toEqual([[1,'blessed',3]]);
  const made=changes(ev);expect(made).toHaveLength(10);expect(made.every(m=>isColor(m.to,BaseColor.Green)&&!isColor(m.from,BaseColor.Green))).toBe(true);
  expect(f.allies[1].statuses).toEqual([]);expect(f.caster.statuses).toEqual([]);
  assertTurnAndMana(f,ev);
 });
 for(const seed of [1,7,42,99])it(`two-colour ally seed=${seed}: all 10 gems share ONE of Blue/Yellow`,()=>{
  const f=setup({...base,seed,board,target:2});const made=changes(f.cast());
  expect(made).toHaveLength(10);const cs=new Set(made.map(m=>m.to.kind==='color'?m.to.color:'x'));
  expect(cs.size).toBe(1);expect(['Blue','Yellow']).toContain([...cs][0]);
 });
 it('caster may choose itself (Red/Purple); enemy is not a legal target',()=>{
  const a=setup({...base,board:pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Green,BaseColor.Brown]),target:0});const made=changes(a.cast());
  expect(made).toHaveLength(10);expect(new Set(made.map(m=>m.to.kind==='color'?m.to.color:'x')).size).toBe(1);
  expect(a.caster.statuses.map(s=>s.id)).toEqual(['blessed']);
  const b=setup({...base,board,target:11});expect(b.cast()).toEqual([]);expect(b.caster.mana).toBe(10);
 });
 refusal({...base,board,allies:[{colors:[BaseColor.Green]}]});
});

// ——— troop:7270 / spell 8889 (fixed round 2: L4b-7270-dragon) ———
describe('L4b troop:7270/spell:8889 Green->Brown, then create 3 Brown Dragon Gems',()=>{
 const base={skill:'8889',cost:12,colors:[BaseColor.Purple,BaseColor.Brown]};
 const board=pattern([BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Blue]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(7270,8889,12,base.colors,'Convert all Green Gems to Brown. Then create 3 Brown Dragon Gems.',
   [{Color1:'Green',Amount:100,Color2:'Brown',Type:'ConvertGems',Delay:600},{Color1:'DragonBrown',Amount:3,Type:'CreateGems'}],'将所有绿色宝石转换成棕色。再创造 3 颗棕色龙宝石。');
  expect(registry.prototypes.get('8889')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Green',to:'Brown'}},
   {kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'dragonGem',color:'Brown'}},count:{base:3,mult:0}}}]});
 });
 for(const side of sides)it(`real cast side=${side}: 16 Green -> Brown, then exactly 3 Brown Dragon Gems`,()=>{
  const f=setup({...base,side,board});const ev=f.cast();const tr=transforms(ev);
  expect(tr[0]).toHaveLength(16);expect(tr[0].every(c=>isColor(c.from,BaseColor.Green)&&isColor(c.to,BaseColor.Brown))).toBe(true);
  const dragons=tr.slice(1).flat().concat(skillPhase(ev).flatMap(e=>e.type==='gem-create'?e.spawns.map(s=>({to:s.gemType})):[]) as never[]);
  expect(dragons.filter((d:{to:GemType})=>isSpecial(d.to,'dragonGem')&&d.to.kind==='special'&&d.to.spec.color===BaseColor.Brown)).toHaveLength(3);
  assertTurnAndMana(f,ev);
 });
 it('Brown Dragon Gem matches as Brown; no Green on board: only the 3 Dragon Gems',async()=>{
  const {matchJoinKey,specialGem}=await import('@engine/types');expect(matchJoinKey(specialGem('dragonGem',undefined,BaseColor.Brown))).toBe(BaseColor.Brown);
  const f=setup({...base,board:pattern([BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Blue])});const tr=transforms(f.cast());
  expect(tr).toHaveLength(1);expect(tr[0]).toHaveLength(3);expect(tr[0].every(c=>isSpecial(c.to,'dragonGem'))).toBe(true);
 });
 refusal({...base,board});
});
