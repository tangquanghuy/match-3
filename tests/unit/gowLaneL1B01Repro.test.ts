// Lane L1 B01 difference repro (NOT sign-off evidence). Each case asserts the native/English behaviour.
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
describe('L1-7260-target: spell 8894 native Target Enemy / English "an Enemy" (prototype used allyChosen)',()=>{
 it('chosen enemy 11 is Cursed + Deathmarked, enemies 12/13 below it take 18, caster untouched',()=>{
  const f=setup(8894,22);const ev=f.cast();
  expect(applied(ev)).toEqual(['11:curse','11:death-mark']);expect(f.caster.statuses).toEqual([]);
  expect(f.foes.map(e=>1000-e.hp)).toEqual([0,0,18,18]);
 });
});
describe('L1-6453-order: spell 7631 native DeathMark -> HuntersMark -> Damage (prototype damaged first)',()=>{
 it('front enemy killed by the hit was already marked; third enemy stays unmarked',()=>{
  const f=setup(7631,16,[{hp:5},{},{},{}]);const ev=f.cast();
  expect(applied(ev)).toEqual(['10:death-mark','11:death-mark','10:marked','11:marked']);expect(f.foes[2].statuses).toEqual([]);
 });
});
