import {describe, expect, it} from 'vitest';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor, PlayerSide, colorGem, skullGem} from '../../src/engine/types';
import {firstCastableCharacter, chooseAiAction, evaluateSwaps} from '../../src/engine/aiPolicy';
import {BATTLE_SCHEMA_VERSION, RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest} from '../../src/session/contract';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {compileEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {PORTRAITS, savePortrait} from '../../src/sillytavern/portraits';

// Sand Scuttler 6486 / native spell 7673: gain Magic + 20 Life and Armor,
// once per troop per battle. It does not alter the board or consume random choices.
// Expectations below are literal source rules, independent of adaptedPrototype.
function setup(side:PlayerSide) {
 const portrait=PORTRAITS.find(p=>p.troopId===6486)!;
 const bp=compileEnemyBlueprint({portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),externalId:'subject'});
 const member=(externalId:string)=>({...structuredClone(bp.snapshot),externalId});
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'once',requestId:'once',seed:6486,
  playerTeam:[member('left-0'),member('left-1')],enemyTeam:[member('right-0'),member('right-1')]};
 const prepared=prepareStBattle(request),mapped=mapRequestToTeams(request),board=new BoardModel();
 // Keep one three-skull swap and no big match; this avoids dead-board reshuffles.
 const filler=[BaseColor.Blue,BaseColor.Green,BaseColor.Purple,BaseColor.Brown];
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)board.set({row,col},{id:row*8+col,type:colorGem(filler[(row+2*col)%4]!)});
 for(const cell of [{row:0,col:0},{row:0,col:1},{row:1,col:2}])board.set(cell,{id:cell.row*8+cell.col,type:skullGem()});
 const state=createGameState(board,mapped.playerTeam,mapped.enemyTeam),rng=new SeededRNG(6486);let next=1000;
 const engine=new TurnEngine(state,rng,()=>next++,prepared.registry,prepared.configureEngine);
 function ready() {
  if(state.activePlayer!==side)engine.passTurn();
  for(const c of state.teams[side].characters)c.mana=c.manaCost;
 }
 ready();
 const swaps=evaluateSwaps(state,side);expect(swaps.length).toBeGreaterThan(0);expect(swaps.every(s=>s.bigTier===0)).toBe(true);
 return {state,engine,rng,registry:prepared.registry,ready,side,team:state.teams[side].characters};
}

for(const side of [PlayerSide.Left,PlayerSide.Right])describe(`ST once-per-battle ownership ${side}`,()=>{
 it('each duplicate enemy/companion casts once and gets its own source-sized gain',()=>{
  const f=setup(side),[first,second]=f.team;
  const firstArmor=first!.armor,firstHp=first!.maxHp,bonus=first!.magic+20;
  const events=f.engine.castSkill(first!.id);
  expect(events.filter(e=>e.type==='skill-cast')).toHaveLength(1);
  expect(first!.armor-firstArmor).toBe(bonus);
  expect(first!.maxHp-firstHp).toBe(bonus);
  f.ready();
  // A previous allied cast must not disable the second individual.
  expect(firstCastableCharacter(f.state,side,f.registry)?.id).toBe(second!.id);
  expect(chooseAiAction({state:f.state,side,rng:f.rng,registry:f.registry}))
   .toEqual({reason:'cast',action:{type:'cast',characterId:second!.id}});
  const secondArmor=second!.armor,secondHp=second!.maxHp,secondBonus=second!.magic+20;
  expect(f.engine.castSkill(second!.id).filter(e=>e.type==='skill-cast')).toHaveLength(1);
  expect(second!.armor-secondArmor).toBe(secondBonus);
  expect(second!.maxHp-secondHp).toBe(secondBonus);
  f.ready();
  const before=JSON.stringify(f.state),rngBefore=f.rng.getState();
  expect(f.engine.castSkill(first!.id)).toEqual([]);
  expect(f.engine.castSkill(second!.id)).toEqual([]);
  expect(firstCastableCharacter(f.state,side,f.registry)).toBeNull();
  expect(JSON.stringify(f.state)).toBe(before);expect(f.rng.getState()).toBe(rngBefore);
 });
 it('an opponent using the same skill leaves this whole team eligible',()=>{
  const f=setup(side),other=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
  if(f.state.activePlayer!==other)f.engine.passTurn();
  const foe=f.state.teams[other].characters[0]!;foe.mana=foe.manaCost;
  expect(f.engine.castSkill(foe.id).some(e=>e.type==='skill-cast')).toBe(true);
  f.ready();
  expect(firstCastableCharacter(f.state,side,f.registry)?.id).toBe(f.team[0]!.id);
  expect(f.engine.castSkill(f.team[0]!.id).some(e=>e.type==='skill-cast')).toBe(true);
 });
});
