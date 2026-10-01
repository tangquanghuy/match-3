/**
 * 活动玩法测试驱动：按各活动自己的规则推进到「下一场可打的战斗」，
 * 并提供假战果与结算封装（周常账本类用例用它跑真实结算，不绕过玩法状态机）。
 */
import type { EventTypeId } from '../../../src/meta/data/events';
import type { MetaSave } from '../../../src/meta/state/schema';
import {
  applyEventBattleModifiers, eventAction, eventModeState, planEventEncounter,
} from '../../../src/meta/systems/events';
import { towerReachable } from '../../../src/meta/systems/eventModes/tower';
import { buildBattleRequest, revalidateOutcome, type BridgeOutcome } from '../../../src/meta/systems/battleBridge';
import { applySettlement } from '../../../src/meta/systems/settlement';
import type { BattleResult } from '../../../src/session/contract';

let seed = 50_000;

/** 末日之塔：没有进行中的登塔就开跑；清掉待处理事项；走非战斗节点，直到下一步是战斗节点 */
export function towerNextBattle(save: MetaSave, week: number): string {
  for (let guard = 0; guard < 60; guard++) {
    const state = eventModeState(save, week, 'towerOfDoom');
    if (!state.run) { expectOk(eventAction(save, week, 'towerOfDoom', 'start', ++seed)); continue; }
    const run = state.run;
    if (run.pending) {
      const tries = ['pick:0', 'claim', 'camp:rest', 'event:1', 'event:0', 'event:2', 'leave', 'skip'];
      if (!tries.some((a) => eventAction(save, week, 'towerOfDoom', a, ++seed).ok)) throw new Error(`无法处理 ${run.pending.kind}`);
      continue;
    }
    const next = towerReachable(run)[0];
    if (!next) throw new Error('塔上无路可走');
    const action = `go:${next.row}-${next.col}`;
    if (next.kind === 'battle' || next.kind === 'elite' || next.kind === 'boss') return action;
    expectOk(eventAction(save, week, 'towerOfDoom', action, ++seed));
  }
  throw new Error('塔驱动超出步数');
}

function expectOk(r: { ok: boolean; message?: string }): void {
  if (!r.ok) throw new Error(r.message);
}

/** 为某活动规划一场可打的战斗（各活动取一个合理的默认动作） */
export function eventBattle(save: MetaSave, type: EventTypeId, week: number, action?: string): BridgeOutcome {
  const act = action ?? (type === 'towerOfDoom' ? towerNextBattle(save, week) : type === 'worldEvent' ? 'escort' : undefined);
  const plan = planEventEncounter(save, week, ++seed, type, act);
  if ('ok' in plan) throw new Error(plan.message);
  const outcome = buildBattleRequest(save, plan);
  if (!outcome.ok) throw new Error(outcome.message);
  applyEventBattleModifiers(save, outcome);
  const invalid = revalidateOutcome(outcome);
  if (invalid) throw new Error(invalid.message);
  return outcome;
}

export function fakeResult(outcome: BridgeOutcome, victory = true, turns = 10): BattleResult {
  const r = outcome.request;
  return {
    schemaVersion: r.schemaVersion, battleId: r.battleId, requestId: r.requestId, rulesetVersion: r.rulesetVersion,
    seed: r.seed, winner: victory ? 'player' : 'enemy', turns, summonedCount: 0, actionLogDigest: '', eventSummary: [],
    combatants: [...r.playerTeam.map((s) => ({ externalId: s.externalId, side: 'player' as const,
      hp: s.initialHp ?? s.stats.hp, maxHp: s.stats.hp, armor: s.stats.armor, defeated: false, statuses: [] })),
    ...r.enemyTeam.map((s) => ({ externalId: s.externalId, side: 'enemy' as const,
      hp: victory ? 0 : s.initialHp ?? s.stats.hp, maxHp: s.stats.hp, armor: 0, defeated: victory, statuses: [] }))],
    defeatedExternalIds: victory ? r.enemyTeam.map((s) => s.externalId) : [],
  };
}

export function settleEvent(save: MetaSave, out: BridgeOutcome, r = fakeResult(out), todayStart: number) {
  return applySettlement(save, r, { plan: out.plan, enemyByExternalId: out.enemyByExternalId, todayStart });
}

/** 世界事件：把手里的骰子全部掷完 */
export function rollAll(save: MetaSave, week: number): void {
  for (let guard = 0; guard < 200; guard++) {
    const state = eventModeState(save, week, 'worldEvent');
    // 遭遇/集市：驱动里一律放弃，继续掷骰
    if (state.pending) { expectOk(eventAction(save, week, 'worldEvent', 'skip', ++seed)); continue; }
    if (state.dice <= 0) return;
    expectOk(eventAction(save, week, 'worldEvent', 'roll', ++seed));
  }
}
