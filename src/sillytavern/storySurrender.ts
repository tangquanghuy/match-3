import type {GameEvent} from '../engine/events';
import {PlayerSide} from '../engine/types';
import type {BattleRequest,BattleResult} from '../session/contract';

/**
 * Abandoning an unfinished story battle counts as a defeat. No action is persisted before the
 * result (a refresh restarts from the opening), so the surrender is recorded at the frozen
 * opening state. Built from the request alone, it also works for snapshots that can no longer
 * start an engine.
 */
export function surrenderedStoryOutcome(request:BattleRequest):{result:BattleResult;events:GameEvent[]} {
 const combatants=[
  ...request.playerTeam.map(unit=>({externalId:unit.externalId,side:'player' as const,hp:unit.initialHp??unit.stats.hp,maxHp:unit.stats.hp,armor:unit.stats.armor,defeated:false,statuses:[]})),
  ...request.enemyTeam.map(unit=>({externalId:unit.externalId,side:'enemy' as const,hp:unit.initialHp??unit.stats.hp,maxHp:unit.stats.hp,armor:unit.stats.armor,defeated:false,statuses:[]})),
 ];
 const result:BattleResult={schemaVersion:request.schemaVersion,rulesetVersion:request.rulesetVersion,battleId:request.battleId,requestId:request.requestId,seed:request.seed,
  winner:'enemy',endReason:'surrender',turns:0,combatants,defeatedExternalIds:[],summonedCount:0,
  actionLogDigest:`surrender:${request.requestId}`,eventSummary:[{type:'game-over',count:1}]};
 return {result,events:[{type:'game-over',winner:PlayerSide.Right,reason:'surrender'}]};
}
