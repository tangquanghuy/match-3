import {afterEach,describe,it,expect,vi} from 'vitest';
import * as catalogue from '../../src/sillytavern/enemyBlueprint';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {compileEnemyBlueprint,ADAPTED_AFFINITIES} from '../../src/sillytavern/enemyBlueprint';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest} from '../../src/session/contract';
import {BoardGenerator} from '../../src/engine/boardGen';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {createGameState} from '../../src/engine/GameState';
import {BaseColor,PlayerSide} from '../../src/engine/types';
import {applyBoardPreset} from '../../src/engine/battleRules';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BattleSession} from '../../src/session/BattleSession';
import {chooseAiAction} from '../../src/engine/aiPolicy';
import {buildStBattleReport} from '../../src/sillytavern/battleReport';
function request():BattleRequest {
 const portrait=PORTRAITS[0]!;const enemy=compileEnemyBlueprint({portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),externalId:'enemy',level:5});
 return {schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'runtime',requestId:'runtime-request',seed:20261021,playerTeam:[{externalId:'hero',name:'主角',stats:{hp:500,attack:60,armor:40,magic:60},manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword'}],enemyTeam:[enemy.snapshot]};
}
afterEach(()=>vi.restoreAllMocks());
function controlledPortalPool(input:BattleRequest):void {
 // Native economic candidates remain in the full production pool.
 expect(()=>prepareStBattle(input)).not.toThrow();
 const realPool=catalogue.adaptedSummonPool;
 // Keep the opening initialization/ownership regression independently executable.
 vi.spyOn(catalogue,'adaptedSummonPool').mockImplementation(affinity=>affinity==='Daemon'?['unit:6179']:realPool(affinity));
}
describe('ST actual battle runtime',()=>{
 it('plays a deterministic battle with the default weapon, abstract enemy and real registries',()=>{
   const play=()=>{
     const input=request();const setup=prepareStBattle(input);const rng=new SeededRNG(input.seed);let next=10000;const id=()=>next++;
     const board=new BoardGenerator(rng,id).generate();const {playerTeam,enemyTeam,idMap}=mapRequestToTeams(input);
     const state=createGameState(board,playerTeam,enemyTeam);const engine=new TurnEngine(state,rng,id,setup.registry,setup.configureEngine);
     const session=new BattleSession({request:input,engine,idMap});
     for(let i=0;i<300&&!session.isFinished();i++){
       const choice=chooseAiAction({state,side:state.activePlayer,rng,registry:setup.registry});
       if(!choice||!session.resolve(choice.action).length)session.passTurn();
     }
     expect(session.isFinished()).toBe(true);const result=session.buildResult();expect(result.winner).toBe('player');
     const report=buildStBattleReport(input,result,session.recordedEvents());expect(report.defeatedEnemyIds).toEqual(['enemy']);return {result,report};
   };
   expect(play()).toEqual(play());
 });
 it('summons through real opening cascades before construction returns with a controlled non-economic Daemon pool',()=>{
   const portrait=PORTRAITS.find(p=>p.troopId===6598)!;
   const sloth=compileEnemyBlueprint({portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),externalId:'sloth',level:20,difficulty:1}).snapshot;
   const input=request();input.seed=4;input.playerTeam=[sloth];
   input.enemyTeam=[{...input.enemyTeam[0]!,stats:{hp:9999,attack:0,armor:0,magic:0}}];
   const preset=[{gem:{kind:'lightningRow' as const},count:8},{gem:{kind:'daemonicPortalGem' as const},count:8}];
   input.rules={board:{preset}};controlledPortalPool(input);
   const setup=prepareStBattle(input);const rng=new SeededRNG(input.seed);let gid=1000;const id=()=>gid++;
   const board=new BoardGenerator(rng,id).generate();applyBoardPreset(board,preset,rng);
   const teams=mapRequestToTeams(input);const state=createGameState(board,teams.playerTeam,teams.enemyTeam);
   const engine=new TurnEngine(state,rng,id,setup.registry,setup.configureEngine);
   const events=engine.takeInitialEvents();
   const portals=events.filter(e=>e.type==='special-gem-trigger'&&e.kind==='daemonicPortalGem');
   const summons=events.filter(e=>e.type==='summon');
   expect(portals.length).toBeGreaterThan(0);expect(summons.length).toBeGreaterThan(0);
   expect(state.teams.Left.characters.length).toBeGreaterThan(1);
   expect(state.teams.Left.characters.slice(1).every(c=>c.portraitUrl?.includes('static/')&&c.mechanicalIdentity?.startsWith('unit:'))).toBe(true);
   expect(engine.takeInitialEvents()).toEqual([]);
 });
 it('keeps enemy opening portal summons on the trigger owner with a controlled non-economic Daemon pool',()=>{
   const portrait=PORTRAITS.find(p=>p.troopId===6598)!;
   const sloth=compileEnemyBlueprint({portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),externalId:'sloth',level:40,difficulty:2}).snapshot;
   const input=request();input.seed=4;
   input.playerTeam=[{...input.playerTeam[0]!,battleScaling:{level:10,difficulty:.5},stats:{hp:9999,attack:0,armor:0,magic:0}}];
   input.enemyTeam=[sloth];
   const preset=[{gem:{kind:'lightningRow' as const},count:8},{gem:{kind:'daemonicPortalGem' as const},count:8}];
   input.rules={board:{preset}};controlledPortalPool(input);
   const setup=prepareStBattle(input);const rng=new SeededRNG(input.seed);let gid=1000;const id=()=>gid++;
   const board=new BoardGenerator(rng,id).generate();applyBoardPreset(board,preset,rng);
   const teams=mapRequestToTeams(input);const state=createGameState(board,teams.playerTeam,teams.enemyTeam);
   expect(state.activePlayer).toBe(PlayerSide.Left);
   const engine=new TurnEngine(state,rng,id,setup.registry,setup.configureEngine);
   const events=engine.takeInitialEvents();
   const portals=events.filter(e=>e.type==='special-gem-trigger'&&e.kind==='daemonicPortalGem');
   const summons=events.filter(e=>e.type==='summon');
   expect(portals.length).toBeGreaterThan(0);expect(summons.length).toBeGreaterThan(0);
   expect(summons.every(e=>e.player===PlayerSide.Right)).toBe(true);
   expect(state.teams.Left.characters).toHaveLength(1);
   const children=state.teams.Right.characters.slice(1);
   expect(children.length).toBeGreaterThan(0);
   expect(children.every(child=>child.battleScaling?.level===40&&child.battleScaling?.difficulty===2)).toBe(true);
 });
 it('validates against only the actual abstract affinity catalog',()=>{
   const input=request();input.enemyTeam[0]!.troopTypes=[`affinity:${ADAPTED_AFFINITIES.length+1}`];expect(()=>prepareStBattle(input)).toThrow('troopTypes');
 });
});
