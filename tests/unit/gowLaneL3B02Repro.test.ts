// Lane L3 batch B02 REPRO (sa-L3): discrepancy reproductions, NOT signoff evidence.
// L3-007 native DecreaseMana ("drain") assembled as steal (caster gains the mana): 8598 9513 9534 9784 9957.
// L3-008 native DecreaseMana fixed Amount (no SpellPowerMultiplier) assembled as [Amount + Magic]: 7265 8598 8654 9051 9067.
// L3-009 DisableMySpell / oncePerBattle keyed on skillId across BOTH sides and all troops.
// L3-010 Champion of Anu 7668: native Stun -> Silence -> DecreaseMana; prototype drains first (Stun bypasses Mana Shield).
import {describe,it,expect} from 'vitest';
import {BoardModel} from '@engine/BoardModel';
import {createGameState} from '@engine/GameState';
import {SeededRNG} from '@engine/rng';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide,colorGem,type Character} from '@engine/types';
import {damageCharacter} from '../helpers/damageFixture';

const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const PAT=[BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
function setup(o:{skill:string;cost:number;allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number;magic?:number}){
 const board=new BoardModel();let id=1;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++)board.set({row:r,col:c},{id:id++,type:colorGem(PAT[(r+c)%4])});
 const caster=damageCharacter(0,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[BaseColor.Green],magic:o.magic??10});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 const enemies=(o.enemies??[{},{},{},{}]).map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 const state=createGameState(board,{player:PlayerSide.Left,characters:[caster,...allies]},{player:PlayerSide.Right,characters:enemies});
 let gid=5000;const engine=new TurnEngine(state,new SeededRNG(42),()=>gid++,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.target??12));
 return {state,engine,caster,allies,enemies,cast:()=>engine.castSkill(caster.id)};
}
const FULL=[{mana:20,manaCost:30},{mana:20,manaCost:30},{mana:20,manaCost:30},{mana:20,manaCost:30}];

describe('L3-007/L3-008 fixed drains do not scale with Magic and do not refill the caster',()=>{
 const cases:[string,number,number,number[]][]=[
  ['7265',15,7,[13,13,13,13]],['8598',10,7,[13,13,13,13]],['8654',16,7,[13,13,13,13]],['9067',12,7,[20,20,13,20]]];
 for(const [spell,cost,n,left] of cases)it(`${spell}: drain ${n} (Magic 10 ignored), caster mana stays 0`,()=>{
  const f=setup({skill:spell,cost,enemies:FULL});f.cast();
  expect(f.enemies.map(e=>e.mana)).toEqual(left);expect(f.caster.mana).toBe(0);
 });
 it('9051: random enemy loses exactly 5 mana',()=>{
  const f=setup({skill:'9051',cost:11,enemies:FULL});f.cast();
  expect(f.enemies.map(e=>e.mana).sort()).toEqual([15,20,20,20]);
 });
 for(const [spell,cost] of [['9957',13],['9513',11]] as const)it(`${spell}: drain only, caster does not gain`,()=>{
  const f=setup({skill:spell,cost,enemies:FULL});f.cast();expect(f.caster.mana).toBe(0);
 });
});

describe('L3-009 Can only be cast once is per troop, not per spell id across sides',()=>{
 it('an enemy Sky Scorpion casting 8598 does not disable my own Sky Scorpion',()=>{
  const f=setup({skill:'8598',cost:10,enemies:[{skillId:'8598',mana:10,manaCost:10},{},{},{}]});
  f.state.activePlayer=PlayerSide.Right;
  expect(f.engine.castSkill(10).length).toBeGreaterThan(0);
  expect(f.state.activePlayer).toBe(PlayerSide.Left);
  f.caster.mana=10;expect(f.cast().length).toBeGreaterThan(0);
 });
});

describe('L3-010 Champion of Anu 7668 native Stun before DecreaseMana',()=>{
 it('Stun first disables Mana Shield, so the chosen enemy is drained to 0',()=>{
  const f=setup({skill:'7668',cost:22,enemies:[{},{},{mana:9,traitIds:['manashield']},{}]});f.cast();
  expect(f.enemies[2].mana).toBe(0);
 });
});
