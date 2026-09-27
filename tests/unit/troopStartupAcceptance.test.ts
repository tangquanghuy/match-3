import { describe,it,expect } from 'vitest';
import { TRAIT_CASES, traitFixture } from '../helpers/traitAcceptanceFixtures';
import { TurnEngine } from '../../src/engine/TurnEngine';
import { createGameState } from '../../src/engine/GameState';
import { BoardModel } from '../../src/engine/BoardModel';
import { SeededRNG } from '../../src/engine/rng';
import { PlayerSide,BaseColor,colorGem,type Character } from '../../src/engine/types';
import { getTrait } from '../../src/engine/traits';
function make(leftTrait:string,rightTrait:string,pvp:boolean){
 let id=1;const board=new BoardModel();
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)board.set({row,col},{id:id++,type:colorGem((row+col)%2?BaseColor.Blue:BaseColor.Red)});
 const ch=(id:number,trait:string):Character=>({id,name:`fixture-${id}`,hp:100,maxHp:100,armor:20,attack:10,magic:5,mana:0,manaCost:20,colors:[BaseColor.Red],traitIds:trait?[trait]:[],skillId:'7004',statuses:[],defeated:false});
 const state=createGameState(board,{player:PlayerSide.Left,characters:[ch(0,leftTrait),ch(1,'')]},{player:PlayerSide.Right,characters:[ch(2,rightTrait),ch(3,'')]});
 const engine=new TurnEngine(state,new SeededRNG(42),()=>id++);engine.pvpMode=pvp;
 return {state,engine,left:state.teams.Left.characters,right:state.teams.Right.characters};
}
describe('PvP role wiring and startup event invariants',()=>{
 it('applies defender to the defending team, once, without leaking to attacker',()=>{
  const f=make('','defender',true);f.engine.takeInitialEvents();
  const gains=getTrait('defender')!.pvpBonus!.gains;
  for(const ch of f.right)for(const stat of ['hp','armor','attack','magic'] as const)
   expect(ch[stat]).toBe(({hp:100,armor:20,attack:10,magic:5})[stat]+(gains[stat]??0));
  expect(f.left.map(c=>c.armor)).toEqual([20,20]);
  const after=f.right.map(c=>({...c}));f.engine.takeInitialEvents();
  expect(f.right).toEqual(after);
 });
 it('keeps defender inert in ordinary battles and on the attacking side',()=>{
  const ordinary=make('','defender',false),wrongRole=make('defender','',true);
  ordinary.engine.takeInitialEvents();wrongRole.engine.takeInitialEvents();
  expect(ordinary.right.map(c=>c.armor)).toEqual([20,20]);
  expect(wrongRole.left.map(c=>c.armor)).toEqual([20,20]);
 });
 it('preserves a pre-constructor board for every eventful startup fixture',()=>{
  for(const c of TRAIT_CASES.filter(c=>c.scenario==='startup')){
   const f=traitFixture(c,42);
   expect(f.startupBoard).not.toBe(f.state.board);
   expect(f.engine.takeInitialEvents()).toEqual([]); // fixture consumed exactly once
   const firstClear=f.initialEvents.find(event=>event.type==='gem-destroy'||event.type==='gem-explode');
   if(firstClear && (firstClear.type==='gem-destroy'||firstClear.type==='gem-explode')) {
    for(const cell of firstClear.cells) expect(f.startupBoard.get(cell.pos)?.id).toBe(cell.gemId);
    expect(firstClear.cells.some(cell=>f.state.board.get(cell.pos)?.id!==cell.gemId)).toBe(true);
   }
  }
 });
});
