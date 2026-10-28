import {describe,expect,it} from 'vitest';
import {compileEnemyEncounterDesigns,DEFAULT_ENEMY_DESIGN_INPUT,restoreEnemyDesign} from '../../src/sillytavern/enemyDesign';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {findLegalSwaps} from '../../src/engine/boardUtils';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor,PlayerSide,colorGem} from '../../src/engine/types';
import {FixedTargetChooser} from '../../src/engine/skills/targetChooser';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BattleSession} from '../../src/session/BattleSession';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest} from '../../src/session/contract';

const design=()=>structuredClone(DEFAULT_ENEMY_DESIGN_INPUT);
describe('ST semantic encounter assembly',()=>{
 it.each([1,2,3,4].flatMap(count=>(['native','classified'] as const).map(assembly=>({count,assembly}))))('assembles $count independent $assembly slots with reproducible configuration',({count,assembly})=>{
  const input=Array.from({length:count},()=>({...design(),assembly})),before=structuredClone(input);
  const result=compileEnemyEncounterDesigns(input,42);
  expect(result.map(r=>r.externalId)).toEqual(Array.from({length:count},(_,i)=>`enemy-${i+1}`));
  expect(result).toEqual(compileEnemyEncounterDesigns(input,42));expect(input).toEqual(before);
  for(const member of result)expect(restoreEnemyDesign(JSON.parse(JSON.stringify(member)))).toEqual(member);
  if(count>1){result[0]!.blueprint.snapshot.stats.hp=1;expect(result[1]!.blueprint.snapshot.stats.hp).toBeGreaterThan(1);}
 });
 it.each([null,[],Array.from({length:5},design)])('rejects an invalid roster size',input=>{
  expect(()=>compileEnemyEncounterDesigns(input,42)).toThrow('1 至 4');
 });
 it('rejects the entire encounter if a later member has invalid semantics without changing the input',()=>{
  const input=[design(),{...design(),form:'不存在的形态'}],before=structuredClone(input);
  expect(()=>compileEnemyEncounterDesigns(input,42)).toThrow();expect(input).toEqual(before);
  expect(()=>compileEnemyEncounterDesigns([design()],Number.NaN)).toThrow('整数');
 });
 it.each(['native','classified'] as const)('charges through actual matches, casts and reproduces the full action sequence from reopened %s designs',assembly=>{
  const compiled=compileEnemyEncounterDesigns([{...design(),assembly},{...design(),assembly}],42);
  if(assembly==='classified')for(const member of compiled)expect(member.blueprint.assembly).toBeDefined();
  const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'semantic-encounter',requestId:'semantic-request',seed:42,
   playerTeam:[{externalId:'hero',name:'Hero',stats:{hp:1000,armor:20,attack:5,magic:4},manaColors:[BaseColor.Blue],manaCost:12,skillId:'gw_KnightsSword'}],enemyTeam:compiled.map(d=>d.blueprint.snapshot)};
  const create=(reopen:boolean)=>{
   const launch=reopen?{...structuredClone(request),enemyTeam:compiled.map(d=>restoreEnemyDesign(JSON.parse(JSON.stringify(d))).blueprint.snapshot)}:structuredClone(request);
   const setup=prepareStBattle(launch),teams=mapRequestToTeams(launch),board=new BoardModel();
   const colors=[BaseColor.Blue,BaseColor.Green,BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
   for(let row=0;row<8;row++)for(let col=0;col<8;col++)board.set({row,col},{id:row*8+col,type:colorGem(colors[(row*3+col*5)%6]!)});
   for(const [row,col,color]of [[0,0,BaseColor.Red],[0,1,BaseColor.Blue],[0,2,BaseColor.Red],[1,1,BaseColor.Red]]as const)board.set({row,col},{id:row*8+col,type:colorGem(color)});
   const state=createGameState(board,teams.playerTeam,teams.enemyTeam),rng=new SeededRNG(launch.seed);let next=1000;
   const engine=new TurnEngine(state,rng,()=>next++,setup.registry,setup.configureEngine),session=new BattleSession({request:launch,engine,idMap:teams.idMap});
   const caster=state.teams[PlayerSide.Right].characters[0]!,victim=state.teams[PlayerSide.Left].characters[0]!;
   engine.setTargetChooser(new FixedTargetChooser(victim.id));
   return {state,rng,session,caster,victim};
  };
  const original=create(false),reopened=create(true);
  const frame=(run:typeof original)=>structuredClone({state:run.state,rng:run.rng.getState(),events:run.session.recordedEvents()});
  const same=()=>expect(frame(reopened)).toEqual(frame(original));
  same();expect(original.caster.mana).toBeLessThan(original.caster.manaCost);
  let swaps=0;
  for(let attempt=0;attempt<100&&original.caster.mana<original.caster.manaCost;attempt++){
   if(original.state.activePlayer!==PlayerSide.Right){original.session.passTurn();reopened.session.passTurn();same();}
   const move=findLegalSwaps(original.state.board)[0];expect(move).toBeDefined();
   const action={type:'swap' as const,from:move!.a,to:move!.b};
   const events=original.session.resolve(action);expect(events.length).toBeGreaterThan(0);
   expect(reopened.session.resolve(action)).toEqual(events);swaps++;same();
  }
  expect(swaps).toBeGreaterThan(0);expect(original.caster.mana).toBe(original.caster.manaCost);
  expect(original.session.recordedEvents().some(e=>e.type==='mana-gain'&&e.characterId===original.caster.id)).toBe(true);
  if(original.state.activePlayer!==PlayerSide.Right){original.session.passTurn();reopened.session.passTurn();same();}
  const before=original.victim.hp+original.victim.armor,action={type:'cast' as const,characterId:original.caster.id};
  const events=original.session.resolve(action);expect(reopened.session.resolve(action)).toEqual(events);
  expect(events.some(e=>e.type==='skill-damage')).toBe(true);expect(original.caster.mana).toBe(0);
  expect(original.victim.hp+original.victim.armor).toBeLessThan(before);same();
  original.session.surrender();reopened.session.surrender();same();
  expect(original.session.buildResult()).toEqual(reopened.session.buildResult());
  expect(original.session.buildResult().battleId).toBe('semantic-encounter');
 });
});
