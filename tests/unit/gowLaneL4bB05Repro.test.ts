// Lane L4b round-2 difference repros (NOT signoff evidence). Each case asserts the source-correct behaviour and
// failed before the corresponding fix (issues.json ids in the test names).
import {describe,it,expect} from 'vitest';
import {BoardModel} from '@engine/BoardModel';
import {createGameState} from '@engine/GameState';
import {SeededRNG} from '@engine/rng';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {FixedColorChooser} from '@engine/skills/colorChooser';
import {FixedCellChooser} from '@engine/skills/cellChooser';
import {executePrototype} from '@engine/skills/prototypes';
import {modifierBonus} from '@engine/skills/effects/secondary';
import {BaseColor,PlayerSide,colorGem,type Character,type GemType} from '@engine/types';
import type {GameEvent} from '@engine/events';
import type {EffectContext} from '@engine/skills/effects/context';
import {damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';

const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const pattern=(cols:BaseColor[])=>(r:number,c:number)=>colorGem(cols[(r+c)%4]);
function setup(skill:string,cost:number,o:{allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number;seed?:number;board?:(r:number,c:number)=>GemType}={}){
 const board=new BoardModel();const fn=o.board??pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Green,BaseColor.Brown]);let id=1;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++)board.set({row:r,col:c},{id:id++,type:fn(r,c)});
 const caster=damageCharacter(0,{skillId:skill,mana:cost,manaCost:cost,magic:10});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 const enemies=(o.enemies??[{},{},{},{}]).map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 const state=createGameState(board,{player:PlayerSide.Left,characters:[caster,...allies]},{player:PlayerSide.Right,characters:[...enemies]});
 state.activePlayer=PlayerSide.Left;let gid=5000;
 const engine=new TurnEngine(state,new SeededRNG(o.seed??42),()=>gid++,registry);engine.skullChance=0;
 engine.setColorChooser(new FixedColorChooser(BaseColor.Red));engine.setTargetChooser(new FixedTargetChooser(o.target??11));
 return {board,state,engine,caster,allies,enemies,cast:()=>engine.castSkill(caster.id)};
}
function skillPhase(ev:GameEvent[]){const i=ev.findIndex(e=>e.type==='elimination');return i<0?ev:ev.slice(0,i);}
function made(ev:GameEvent[]){const out:GemType[]=[];for(const e of skillPhase(ev)){if(e.type==='gem-create')for(const s of e.spawns)out.push(s.gemType);if(e.type==='gem-transform')for(const s of e.changes)out.push(s.to);}return out;}
const colorsOf=(ts:GemType[])=>new Set(ts.map(t=>t.kind==='color'?t.color:t.kind));

describe('L4b-7138-onecolour: placeholder colour is resolved once per create cast',()=>{
 for(let seed=1;seed<=12;seed++)it(`8687 two-colour ally seed=${seed}: all 12 gems share ONE of Red/Purple`,()=>{
  const f=setup('8687',12,{allies:[{colors:[BaseColor.Red,BaseColor.Purple]}],target:1,seed});const g=made(f.cast());
  expect(g).toHaveLength(12);const cs=colorsOf(g);expect(cs.size).toBe(1);expect([...cs][0]==='Red'||[...cs][0]==='Purple').toBe(true);
 });
 for(const spec of ['CHOSEN_TARGET','ENEMY','TRACKED_ENEMY','LAST_TARGET'] as const)for(let seed=1;seed<=6;seed++)
 it(`primitive create color=${spec} seed=${seed}: one colour for all 10 gems`,()=>{
  const f=setup('x',0,{enemies:[{colors:[BaseColor.Red,BaseColor.Purple]}],seed});
  const ctx:EffectContext={state:f.state,casterId:0,chosenTargetId:10,rng:new SeededRNG(seed),nextGemId:(()=>{let n=9000;return()=>n++;})()};
  const ev=executePrototype({segments:[{kind:'gem',params:{op:'create',gem:{kind:'color',color:spec},count:{base:10,mult:0}}}]} as never,ctx);
  const g=made(ev);expect(g).toHaveLength(10);expect(colorsOf(g).size).toBe(1);
 });
});

describe('L4b-7200-rage-alias: rage and enraged are one status for every reader',()=>{
 it('8787 Enrage all allies -> allyStatusCount enraged = 3, rage = 3',()=>{
  const f=setup('8787',22,{allies:[{},{}],board:pattern([BaseColor.Blue,BaseColor.Red,BaseColor.Purple,BaseColor.Brown])});f.cast();
  const ctx={state:f.state,casterId:0,chosenTargetId:undefined,rng:new SeededRNG(1),nextGemId:()=>9999} as EffectContext;
  for(const id of ['enraged','rage'])expect(modifierBonus({mod:{kind:'multiplier',a:1},source:{kind:'allyStatusCount',statusId:id}},ctx)).toBe(3);
 });
 it('enemyStatusCount enraged counts an enemy holding rage',()=>{
  const f=setup('x',0,{enemies:[{statuses:[{id:'rage',turns:3}]},{statuses:[{id:'enraged',turns:3}]},{}]});
  const ctx={state:f.state,casterId:0,chosenTargetId:undefined,rng:new SeededRNG(1),nextGemId:()=>9999} as EffectContext;
  for(const id of ['enraged','rage'])expect(modifierBonus({mod:{kind:'multiplier',a:1},source:{kind:'enemyStatusCount',statusId:id}},ctx)).toBe(2);
 });
});

describe('L4b-7030-dragon: Convert all Red Gems into Yellow Dragon Gems',()=>{
 it('8557 converts every Red gem into a Yellow dragonGem',()=>{
  const f=setup('8557',13,{board:pattern([BaseColor.Red,BaseColor.Blue,BaseColor.Purple,BaseColor.Brown])});const g=made(f.cast());
  expect(g).toHaveLength(16);expect(g.every(t=>t.kind==='special'&&t.spec.kind==='dragonGem'&&t.spec.color===BaseColor.Yellow)).toBe(true);
 });
});

describe('L4b-7276-singlegem: Convert a chosen Mana Gem to an Uber Doomskull',()=>{
 it('8901 converts only the chosen cell',()=>{
  const f=setup('8901',12);f.engine.setCellChooser(new FixedCellChooser({row:3,col:4}));const ev=f.cast();
  const tr=skillPhase(ev).filter(e=>e.type==='gem-transform').flatMap(e=>e.type==='gem-transform'?e.changes:[]);
  expect(tr).toHaveLength(1);expect(tr[0].pos).toEqual({row:3,col:4});
  expect(tr[0].to).toMatchObject({kind:'special',spec:{kind:'uberDoomSkull'}});
 });
});

describe('L4b-7195-order: native ConvertGems before CauseHuntersMark',()=>{
 it('8782 gem-transform precedes the Hunter\'s Mark status-apply',()=>{
  const f=setup('8782',12);const sp=skillPhase(f.cast());
  const t=sp.findIndex(e=>e.type==='gem-transform'),s=sp.findIndex(e=>e.type==='status-apply');
  expect(t).toBeGreaterThan(-1);expect(s).toBeGreaterThan(t);
 });
});

describe('L4b-6824-random-ally: Barrier and Submerge a RANDOM ally (same one), native Barrier first',()=>{
 it('8234 without a chosen ally still Barriers + Submerges exactly one living ally, Barrier first',()=>{
  const hit=new Set<number>();
  for(let seed=1;seed<=20;seed++){
   const f=setup('8234',12,{allies:[{},{}],target:999,seed});const ev=skillPhase(f.cast());
   const ap=ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'?[e.targetId,e.statusId]:[]);
   expect(ap.map(a=>a[1])).toEqual(['barrier','submerged']);expect(ap[0][0]).toBe(ap[1][0]);hit.add(ap[0][0] as number);
  }
  expect(hit.size).toBeGreaterThan(1);
 });
});

describe('L4b-6068-order: native CausePoison before Damage',()=>{
 it('7138 Poison status-apply precedes the damage events',()=>{
  const f=setup('7138',16);const ev=skillPhase(f.cast());
  const s=ev.findIndex(e=>e.type==='status-apply'),d=ev.findIndex(e=>e.type==='skill-damage');
  expect(s).toBeGreaterThan(-1);expect(s).toBeLessThan(d);
 });
});

describe('L4b zh display fixes',()=>{
 it('L4b-6751-zh: 8129 display says 末日骷髅头',()=>{expect(TROOPS.find(t=>t.id===6751)!.spell.description).toMatch(/末日骷髅/);});
 it('L4b-7138-zh: 8687 display says 法力颜色',()=>{expect(TROOPS.find(t=>t.id===7138)!.spell.description).toMatch(/法力颜色/);});
 it('L4b-6824-zh: 8234 display says a random ally',()=>{expect(TROOPS.find(t=>t.id===6824)!.spell.description).toMatch(/随机盟友/);});
});
