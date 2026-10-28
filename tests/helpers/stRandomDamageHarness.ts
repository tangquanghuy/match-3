import expectations from '../fixtures/stEnemyRandomDamageExpectations.json';
import {legalBoard} from './stMappedHarness';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor,PlayerSide,colorGem,skullGem} from '../../src/engine/types';
import type {GameEvent} from '../../src/engine/events';
import type {SkillPrototype} from '../../src/engine/skills/prototypes';
import {FixedTargetChooser} from '../../src/engine/skills/targetChooser';
import {BattleSession} from '../../src/session/BattleSession';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,CombatantSnapshot} from '../../src/session/contract';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {compileEnemyBlueprint,restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';

export const randomEnemies=expectations.enemies;
export type RandomEnemy=typeof randomEnemies[number];
export const other=(side:PlayerSide)=>side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
export function dummy(externalId:string,overrides:Partial<CombatantSnapshot>={}):CombatantSnapshot {
 return {externalId,name:externalId,stats:{hp:1000,armor:7,attack:8,magic:0},manaColors:[BaseColor.Green],manaCost:12,skillId:'gw_KnightsSword',...overrides};
}
export const board=(color:BaseColor|'skull'=BaseColor.Red)=>legalBoard(color==='skull'?skullGem():colorGem(color));
export function blueprint(e:RandomEnemy,level=20,difficulty=1){
 const portrait=PORTRAITS.find(p=>p.troopId===e.id)!;
 return compileEnemyBlueprint({portrait:savePortrait({manaColors:e.sourceTroop.manaColors,rank:e.portrait.rank,form:e.portrait.form,role:e.sourceTroop.role},portrait),externalId:'subject',level,difficulty});
}
type Options={side?:PlayerSide;startSide?:PlayerSide;level?:number;difficulty?:number;seed?:number;restore?:boolean;allies?:CombatantSnapshot[];opponents?:CombatantSnapshot[];dead?:string[];match?:BaseColor|'skull';probe?:SkillPrototype};
export function battle(e:RandomEnemy,options:Options={}){
 const side=options.side??PlayerSide.Right;
 const compiled=blueprint(e,options.level,options.difficulty);
 const bp=options.restore?restoreEnemyBlueprint(JSON.parse(JSON.stringify(compiled))):compiled;
 const own=[bp.snapshot,...options.allies??[]];
 const opposing=options.opponents??[dummy('front'),dummy('chosen'),dummy('back')];
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:`random-${e.id}`,requestId:`random-${e.id}-request`,seed:options.seed??37,playerTeam:side===PlayerSide.Left?own:opposing,enemyTeam:side===PlayerSide.Right?own:opposing};
 const setup=prepareStBattle(request);
 // Only an opponent/control stimulus is substituted. The subject's real
 // st:8735/st:8736 prototype, portrait, context and all traits remain intact.
 if(options.probe)setup.registry.prototypes.set('gw_KnightsSword',options.probe);
 const teams=mapRequestToTeams(request);
 const state=createGameState(board(options.match),teams.playerTeam,teams.enemyTeam,options.startSide??side);
 const byName=(name:string)=>Object.values(state.teams).flatMap(t=>t.characters).find(c=>c.id===teams.idMap.internalIdOf(name))!;
 for(const name of options.dead??[]){const c=byName(name);c.hp=0;c.defeated=true;}
 const beforeOpening=structuredClone(state.teams),rng=new SeededRNG(request.seed);let next=1000;
 const engine=new TurnEngine(state,rng,()=>next++,setup.registry,setup.configureEngine);engine.skullChance=0;
 const session=new BattleSession({request,engine,idMap:teams.idMap});
 return {bp,request,setup,state,rng,engine,session,beforeOpening,side,byName,caster:byName('subject'),foes:state.teams[other(side)].characters};
}
export type RandomRun=ReturnType<typeof battle>;
export function turn(run:RandomRun,side=run.side){if(run.state.activePlayer!==side)run.session.passTurn();}
export function cast(run:RandomRun,target=1){
 turn(run);run.caster.mana=run.caster.manaCost;
 run.engine.setTargetChooser(new FixedTargetChooser(run.foes[target]!.id));
 return run.session.resolve({type:'cast',characterId:run.caster.id});
}
export const damageEvents=(events:readonly GameEvent[])=>events.filter((e):e is Extract<GameEvent,{type:'skill-damage'}>=>e.type==='skill-damage');
export function boardSnapshot(run:RandomRun){return Array.from({length:8},(_,row)=>Array.from({length:8},(_,col)=>structuredClone(run.state.board.get({row,col}))));}
export function snapshot(run:RandomRun){return structuredClone({state:run.state,board:boardSnapshot(run),rng:run.rng.getState(),events:run.session.recordedEvents()});}
export function probeCast(run:RandomRun,target=run.caster.id){
 turn(run,other(run.side));run.foes[0]!.mana=run.foes[0]!.manaCost;
 run.engine.setTargetChooser(new FixedTargetChooser(target));
 return run.session.resolve({type:'cast',characterId:run.foes[0]!.id});
}
