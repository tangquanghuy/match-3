/**
 * 引擎终局状态 → BattleResult（需求 3.6；设计 §4）。
 *
 * 结果只暴露宿主结算需要的东西：胜负、回合数、下发角色的最终状态、阵亡名单、
 * 行动摘要。引擎内部的棋盘、宝石 id、召唤物内部 id 一律不外泄。
 */
import { PlayerSide } from '@engine/types';
import type { ActionLogEntry, StatusInstance } from '@engine/types';
import type { GameEvent } from '@engine/events';
import type { GameState } from '@engine/GameState';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION } from './contract';
import type {
  BattleEventSummary,
  BattleRequest,
  BattleResult,
  BattleSideName,
  CombatantResult,
} from './contract';
import { NAME_OF_SIDE } from './combatantMapping';
import type { CombatantIdMap } from './combatantMapping';

/**
 * 行动序列的规范化编码。用于生成 digest，也便于人工比对两场战斗的分歧点。
 * 形如 `0:player:swap:7,2>6,2|1:enemy:cast:4:fireball:switched`。
 */
export function encodeActionLog(log: readonly ActionLogEntry[]): string {
  return log
    .map((entry) => {
      const side = NAME_OF_SIDE[entry.side];
      const body = entry.action.type === 'swap'
        ? `swap:${entry.action.from.row},${entry.action.from.col}>${entry.action.to.row},${entry.action.to.col}`
        : `cast:${entry.action.characterId}:${entry.skillId ?? ''}`;
      return `${entry.index}:${side}:${body}:${entry.outcome}`;
    })
    .join('|');
}

/**
 * FNV-1a 32 位摘要，十六进制定长 8 位。
 *
 * 这里要的是「同输入必定同输出、跨端一致、无依赖、同步可算」，不是抗碰撞哈希；
 * 用途是复现校验与日志比对，不用于安全场景。
 */
export function digestString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Math.imul 保证 32 位乘法不丢精度
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** 事件摘要：按类型计数，保持事件首次出现的顺序，便于稳定比对。 */
export function summarizeEvents(events: readonly GameEvent[]): BattleEventSummary[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  }
  return [...counts].map(([type, count]) => ({ type, count }));
}

/**
 * 完成的回合数：额外回合不另计一回合，因此一个回合可能包含多次行动。
 * 被拒绝的行动本来就不进日志，不会计入。
 */
export function countCompletedTurns(log: readonly ActionLogEntry[]): number {
  return log.filter((entry) => entry.outcome !== 'extra-turn').length;
}

function exportStatuses(statuses: readonly StatusInstance[]): { id: string; turns: number }[] {
  return statuses.map((status) => ({ id: status.id, turns: status.turns }));
}

export interface BuildResultInput {
  request: BattleRequest;
  state: GameState;
  idMap: CombatantIdMap;
  /** 本场累计的全部事件，按产生顺序 */
  events: readonly GameEvent[];
}

/**
 * 构建可回传的战斗结果。
 *
 * 要求战斗已结束（`state.winner` 非空）；未结束就导出结果会让宿主拿到无意义的胜负。
 */
export function buildBattleResult(input: BuildResultInput): BattleResult {
  const { request, state, idMap, events } = input;
  if (state.winner === null) {
    throw new Error('战斗尚未结束，不能导出 BattleResult');
  }

  const combatants: CombatantResult[] = [];
  const defeatedExternalIds: string[] = [];

  for (const { internalId, snapshot, side } of idMap.entries()) {
    const enginePlayer: PlayerSide = side === 'player' ? PlayerSide.Left : PlayerSide.Right;
    const character = state.teams[enginePlayer].characters.find((c) => c.id === internalId);
    // 角色可能已被移出在场编队（阵亡后被召唤物顶替），此时回落到下发时的数值并标记阵亡。
    const result: CombatantResult = character
      ? {
        externalId: snapshot.externalId,
        side,
        hp: character.hp,
        maxHp: character.maxHp,
        armor: character.armor,
        defeated: character.defeated,
        statuses: exportStatuses(character.statuses),
      }
      : {
        externalId: snapshot.externalId,
        side,
        hp: 0,
        maxHp: snapshot.stats.hp,
        armor: 0,
        defeated: true,
        statuses: [],
      };
    combatants.push(result);
    if (result.defeated) defeatedExternalIds.push(result.externalId);
  }

  const winner: BattleSideName = NAME_OF_SIDE[state.winner];

  return {
    schemaVersion: BATTLE_SCHEMA_VERSION,
    battleId: request.battleId,
    requestId: request.requestId,
    // 回传客户端实际执行的规则版本，而不是回显宿主请求里的值
    rulesetVersion: RULESET_VERSION,
    seed: request.seed,
    winner,
    turns: countCompletedTurns(state.actionLog),
    combatants,
    defeatedExternalIds,
    summonedCount: events.filter((event) => event.type === 'summon').length,
    actionLogDigest: digestString(encodeActionLog(state.actionLog)),
    eventSummary: summarizeEvents(events),
  };
}
