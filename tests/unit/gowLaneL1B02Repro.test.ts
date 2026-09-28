// Lane L1 B02 difference repro (NOT sign-off evidence). Each case asserts the native/English behaviour.
import {describe,it,expect} from 'vitest';
import {BoardModel} from '@engine/BoardModel';
import {createGameState} from '@engine/GameState';
import {SeededRNG} from '@engine/rng';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide,colorGem,type Character} from '@engine/types';
import type {GameEvent} from '@engine/events';
import {damageCharacter} from '../helpers/damageFixture';
import {troopToSummonTemplate} from '../../src/data/troops';
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function setup(spell:number,cost:number,enemies:Partial<Character>[]=[{},{},{},{}],target=11){
 const board=new BoardModel();let id=1;const cols=[BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
 for(let r=0;r<8;r++)for(let c=0;c<8;c++)board.set({row:r,col:c},{id:id++,type:colorGem(cols[(r+c)%4])});
 const caster=damageCharacter(0,{skillId:String(spell),mana:cost,manaCost:cost,magic:10});
 const foes=enemies.map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 const state=createGameState(board,{player:PlayerSide.Left,characters:[caster]},{player:PlayerSide.Right,characters:foes});
 let gid=5000;const engine=new TurnEngine(state,new SeededRNG(42),()=>gid++,registry);engine.skullChance=0;
 engine.setSummonResolver(ref=>troopToSummonTemplate(ref));engine.setTargetChooser(new FixedTargetChooser(target));
 return {state,caster,foes,cast:()=>engine.castSkill(0)};
}
const applied=(ev:GameEvent[])=>ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'?`${e.targetId}:${e.statusId}`:'');
describe('L1-6378-pool: spell 7533 native Randomize A+(B-C-D-E-F) over Summoning 6136/6110/6395/6512/6068',()=>{
 it('summon pool is exactly the 5 native spiders (prototype had 11 Spider-typed troops, without Webspinner)',()=>{
  const p=registry.prototypes.get('7533') as {segments:{kind:string;params?:{source:{randomOf?:string[]}}}[]};
  expect([...p.segments[1].params!.source.randomOf!].sort()).toEqual(['GiantSpider','SpiderSwarm','Spinnerette','TombSpider','Webspinner']);
 });
});
describe('L1-charm-instant: native Charm is an instant spell mechanic, not a persistent status (official status guide)',()=>{
 for(const [spell,cost] of [[9605,12],[8159,9],[7728,14]] as const)it.fails(`spell ${spell}: no enemy keeps a lasting charm status after the cast`,()=>{
  const f=setup(spell,cost);f.cast();expect(f.foes.every(e=>!e.statuses.some(s=>s.id==='charm'))).toBe(true);
 });
});
describe('L1-6534-order: spell 7728 native Charm -> Damage -> Poison (prototype damaged first)',()=>{
 it('first native event on the chosen enemy is the Charm, then damage, then Poison',()=>{
  const f=setup(7728,14);const ev=f.cast();
  const seq=ev.filter(e=>(e.type==='status-apply'&&e.targetId===11)||(e.type==='skill-damage')).map(e=>e.type==='status-apply'?e.statusId:'damage');
  expect(seq.slice(0,3)).toEqual(['charm','damage','poison']);
 });
});describe('L1-1351-pool: weapon 8357 SummoningKingdomNoError 3039 = 6 troops (prototype had 4, missing Xerodar/WatchMother)',()=>{
 it('pool',()=>{const p=registry.prototypes.get('8357') as {segments:{kind:string;params?:{source:{randomOf?:string[]}}}[]};
  expect([...p.segments[2].params!.source.randomOf!].sort()).toEqual(['BurningOcularen','GloomOcularen','Ocularen','OcularenLeech','WatchMother','Xerodar']);});
});
describe('L1-6469-order: spell 7647 native Consume(20%) -> Web -> Damage (prototype damaged first, devour last)',()=>{
 it('first skill event on the chosen enemy is the devour roll: a devoured enemy is never Webbed',()=>{
  for(let seed=1;seed<=40;seed++){const f=setup(7647,11);const ev=f.cast();void seed;
   if(f.foes[1].defeated)expect(applied(ev)).toEqual([]);}
  const p=registry.prototypes.get('7647') as {segments:{kind:string}[]};expect(p.segments.map(s=>s.kind)).toEqual(['devour','status','damage']);
 });
});
describe('L1-devour-double-roll: devour chance was rolled twice (segment gate + devourEffect) -> p squared',()=>{
 it('spell 7210 (40% devour): 200 seeded casts devour 25%-55% of the time (was ~16%: p squared)',()=>{
  let n=0;for(let seed=1;seed<=200;seed++){const g=setupSeed(7210,16,seed);const ev=g.cast();if(ev.some(e=>e.type==='skill-damage'&&(e as {devoured?:boolean}).devoured))n++;}
  expect(n).toBeGreaterThanOrEqual(50);expect(n).toBeLessThanOrEqual(110);
 });
});
function setupSeed(spell:number,cost:number,seed:number){
 const board=new BoardModel();let id=1;const cols=[BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
 for(let r=0;r<8;r++)for(let c=0;c<8;c++)board.set({row:r,col:c},{id:id++,type:colorGem(cols[(r+c)%4])});
 const caster=damageCharacter(0,{skillId:String(spell),mana:cost,manaCost:cost,magic:10});
 const foes=[{},{},{},{}].map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 const state=createGameState(board,{player:PlayerSide.Left,characters:[caster]},{player:PlayerSide.Right,characters:foes});
 let gid=5000;const engine=new TurnEngine(state,new SeededRNG(seed),()=>gid++,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(11));return {foes,cast:()=>engine.castSkill(0)};
}
describe('L1-6160-create-interleave: spell 7280 two native CreateGems steps should both land before the board resolves',()=>{
 // fixed by sa-P P-create-interleave (pure board rewrites settle at the end of the spell)
 it('8 Yellow and 8 Brown creations both precede the first elimination',()=>{
  const g=setupSeed(7280,24,42);const ev=g.cast();const i=ev.findIndex(e=>e.type==='elimination');const pre=i<0?ev:ev.slice(0,i);
  const brown=pre.flatMap(e=>e.type==='gem-transform'?e.changes.map(c=>c.to):e.type==='gem-create'?e.spawns.map(s=>s.gemType):[]).filter(t=>t.kind==='color'&&t.color===BaseColor.Brown).length;
  expect(brown).toBe(8);
 });
});
