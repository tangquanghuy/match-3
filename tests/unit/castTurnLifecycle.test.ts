import {describe, it, expect} from 'vitest';
import {BoardModel} from '@engine/BoardModel';
import {TurnEngine} from '@engine/TurnEngine';
import {createGameState} from '@engine/GameState';
import {ExtensionRegistry} from '@engine/registry';
import {SeededRNG} from '@engine/rng';
import {BaseColor, PlayerSide, MatchState, colorGem} from '@engine/types';
import type {Character, GemType} from '@engine/types';
import type {SkillPrototype} from '@engine/skills/prototypes';
import {attachPassives} from '@engine/traits';
import {chooseSkill, skill} from '@engine/skills/builders';
import {FixedBranchChooser} from '@engine/skills/branchChooser';

const other=(s:PlayerSide)=>s===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
function char(id:number):Character{return {id,name:'C'+id,maxHp:100,hp:100,attack:5,armor:0,magic:10,colors:[BaseColor.Red],mana:10,manaCost:10,skillId:'spell',statuses:[],defeated:false};}
function setup(side=PlayerSide.Left, extra=false){
 const board=new BoardModel();let gid=1000;
 const palette=[BaseColor.Blue,BaseColor.Green,BaseColor.Yellow,BaseColor.Purple];
 const put=(row:number,col:number,type:GemType)=>board.set({row,col},{id:gid++,type});
 for(let r=0;r<8;r++)for(let c=0;c<8;c++)put(r,c,colorGem(palette[(r+c)%4]));
 // A legal three-match exists; no reshuffle/turn-start cascade noise.
 put(7,0,colorGem(BaseColor.Red));put(7,1,colorGem(BaseColor.Red));put(6,2,colorGem(BaseColor.Red));put(7,2,colorGem(BaseColor.Green));put(5,2,colorGem(BaseColor.Blue));
 const caster=char(0),enemy=char(4);
 const state=createGameState(board,{player:PlayerSide.Left,characters:side===PlayerSide.Left?[caster]:[enemy]},{player:PlayerSide.Right,characters:side===PlayerSide.Right?[caster]:[enemy]});state.activePlayer=side;
 const registry=new ExtensionRegistry();const proto:SkillPrototype={segments:[{kind:'damage',target:'enemyFront',scaling:{base:1,mult:0}},...(extra?[{kind:'extraTurn'} as const]:[])]};registry.prototypes.set('spell',proto);
 const engine=new TurnEngine(state,new SeededRNG(7),()=>gid++,registry);engine.skullChance=0;
 return {engine,state,caster,enemy,registry,put};
}
for(const side of [PlayerSide.Left,PlayerSide.Right])describe('cast consumes turn: '+side,()=>{
 it('ordinary cast spends Mana, switches once, blocks immediate second allied cast, permits opponent response',()=>{
  const f=setup(side);const ev=f.engine.castSkill(0);expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(other(side));expect(f.state.state).toBe(MatchState.AwaitingInput);expect(ev.filter(e=>e.type==='turn-end')).toEqual([{type:'turn-end',nextPlayer:other(side)}]);expect(f.state.actionLog[0].outcome).toBe('switched');
  f.caster.mana=10;expect(f.engine.castSkill(0)).toEqual([]);expect(f.caster.mana).toBe(10);expect(f.state.actionLog).toHaveLength(1);f.engine.castSkill(4);expect(f.state.activePlayer).toBe(side);expect(f.state.actionLog).toHaveLength(2);
 });
 it('hands off and ticks only the incoming side statuses and storm exactly once',()=>{
  const f=setup(side);f.enemy.statuses=[{id:'burning',turns:3,magnitude:3,recoveryChance:0}];f.caster.statuses=[{id:'burning',turns:3,magnitude:3,recoveryChance:0}];f.state.teams[side].storm={color:BaseColor.Red,turns:3,troopId:1};const ev=f.engine.castSkill(0);
  expect(f.enemy.hp).toBe(96);/* R004: no turn countdown; the incoming side's shared recovery chance advances 0 -> 10 */expect(f.enemy.statuses[0].turns).toBe(3);expect(f.enemy.statuses[0].recoveryChance).toBe(10);expect(f.caster.hp).toBe(100);expect(f.caster.statuses[0].recoveryChance).toBe(0);expect(ev.filter(e=>e.type==='status-tick')).toEqual([expect.objectContaining({targetId:4,damage:3})]);expect(f.state.teams[side].storm?.turns).toBe(2);
 });
 it('runs incoming regeneration through the same turn-start pipeline',()=>{
  const f=setup(side);f.enemy.hp=50;f.enemy.traitIds=['regeneration'];attachPassives(f.enemy);f.engine.castSkill(0);expect(f.enemy.hp).toBe(50);
 });
 it('extra turn applies immediately, triggers extra-turn traits, skips turn-start ticks, does not leak',()=>{
  const f=setup(side,true);f.caster.traitIds=['bigteeth'];attachPassives(f.caster);f.enemy.statuses=[{id:'burning',turns:3,magnitude:3,recoveryChance:0}];f.state.teams[side].storm={color:BaseColor.Red,turns:3,troopId:1};const ev=f.engine.castSkill(0);expect(f.state.activePlayer).toBe(side);expect(f.state.actionLog[0].outcome).toBe('extra-turn');expect(f.caster.attack).toBe(6);expect(ev.filter(e=>e.type==='extra-turn')).toHaveLength(1);expect(ev.some(e=>e.type==='turn-end'||e.type==='status-tick')).toBe(false);expect(f.state.teams[side].storm?.turns).toBe(3);
  f.caster.mana=10;f.registry.prototypes.set('spell',{segments:[]});f.engine.castSkill(0);expect(f.state.activePlayer).toBe(other(side));expect(f.state.actionLog[1].outcome).toBe('switched');expect(f.enemy.hp).toBe(96);
 });
 it('frozen caster can cast but loses spell extra turn without an extra-turn display event',()=>{
  const f=setup(side,true);f.caster.statuses=[{id:'frozen',turns:3}];const ev=f.engine.castSkill(0);expect(f.enemy.hp).toBe(99);expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(other(side));expect(ev.some(e=>e.type==='extra-turn')).toBe(false);expect(f.state.actionLog[0].outcome).toBe('switched');
 });
 it('a frozen ally is not a frozen caster: spell extra turn is retained',()=>{
  const f=setup(side,true),ally=char(1);ally.statuses=[{id:'frozen',turns:3}];f.state.teams[side].characters.push(ally);f.engine.castSkill(0);expect(f.state.activePlayer).toBe(side);expect(f.state.actionLog[0].outcome).toBe('extra-turn');
 });
 for(const cause of ['silence','low-mana','defeated','wrong-side','resolving','cancelled-choice'])it(cause+' leaves turn, Mana, logs, statuses and storm unchanged',()=>{
  const f=setup(side);f.enemy.statuses=[{id:'burning',turns:3,magnitude:3}];f.state.teams[side].storm={color:BaseColor.Red,turns:3,troopId:1};
  if(cause==='silence')f.caster.statuses=[{id:'silence',turns:3}];if(cause==='low-mana')f.caster.mana=9;if(cause==='defeated')f.caster.defeated=true;if(cause==='resolving')f.state.state=MatchState.Resolving;if(cause==='cancelled-choice'){f.registry.prototypes.set('spell',skill(chooseSkill(['one','two'],[],[])));f.engine.setBranchChooser(new FixedBranchChooser(null));}
  const before=JSON.stringify(f.state);expect(f.engine.castSkill(cause==='wrong-side'?4:0)).toEqual([]);expect(JSON.stringify(f.state)).toBe(before);
 });
 it('lethal cast ends immediately, with no handoff or turn-start ticks',()=>{
  const f=setup(side);f.enemy.hp=1;const ev=f.engine.castSkill(0);expect(f.state.winner).toBe(side);expect(f.state.actionLog[0].outcome).toBe('game-over');expect(ev.some(e=>e.type==='turn-end')).toBe(false);expect(ev.at(-1)?.type).toBe('game-over');
 });
 it('incoming DoT can end combat after handoff and updates the action outcome',()=>{
  const f=setup(side);f.enemy.hp=3;f.enemy.statuses=[{id:'burning',turns:3,magnitude:3,recoveryChance:0}];const ev=f.engine.castSkill(0);expect(f.state.winner).toBe(side);expect(f.state.actionLog[0].outcome).toBe('game-over');expect(ev.filter(e=>e.type==='turn-end')).toHaveLength(1);expect(ev.at(-1)?.type).toBe('game-over');
 });
 for(const frozen of [false,true])it('red four-match with frozen red holder='+frozen,()=>{
  const f=setup(side);if(frozen)f.caster.statuses=[{id:'frozen',turns:3}];f.put(7,2,colorGem(BaseColor.Red));f.put(6,2,colorGem(BaseColor.Green));f.put(6,3,colorGem(BaseColor.Red));f.put(7,3,colorGem(BaseColor.Green));const ev=f.engine.resolveSwap({row:7,col:3},{row:6,col:3});expect(ev.some(e=>e.type==='swap')).toBe(true);expect(f.state.activePlayer).toBe(frozen?other(side):side);expect(f.state.actionLog[0].outcome).toBe(frozen?'switched':'extra-turn');
 });
 it('frozen unrelated Mana color does not suppress a red four-match',()=>{
  const f=setup(side);f.caster.colors=[BaseColor.Blue];f.caster.statuses=[{id:'frozen',turns:3}];f.put(7,2,colorGem(BaseColor.Red));f.put(6,2,colorGem(BaseColor.Green));f.put(6,3,colorGem(BaseColor.Red));f.put(7,3,colorGem(BaseColor.Green));f.engine.resolveSwap({row:7,col:3},{row:6,col:3});expect(f.state.activePlayer).toBe(side);
 });
 for(const frozenSlot of ['none','front','back','defeated-front'])it('skull four-match respects first living frozen unit: '+frozenSlot,()=>{
  const f=setup(side),back=char(1);f.state.teams[side].characters.push(back);
  if(frozenSlot==='front')f.caster.statuses=[{id:'frozen',turns:3}];if(frozenSlot==='back')back.statuses=[{id:'frozen',turns:3}];if(frozenSlot==='defeated-front'){f.caster.defeated=true;f.caster.hp=0;f.caster.statuses=[{id:'frozen',turns:3}];}
  const skull:GemType={kind:'skull',variant:'normal'};f.put(7,0,skull);f.put(7,1,skull);f.put(7,2,skull);f.put(6,2,colorGem(BaseColor.Green));f.put(6,3,skull);f.put(7,3,colorGem(BaseColor.Green));const ev=f.engine.resolveSwap({row:7,col:3},{row:6,col:3});expect(ev.some(e=>e.type==='skull-damage')).toBe(true);expect(f.state.activePlayer).toBe(frozenSlot==='front'?other(side):side);
 });

});
