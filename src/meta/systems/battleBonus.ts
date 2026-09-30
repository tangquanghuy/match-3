/**
 * 通用战斗额外奖励（活动深化批 2026-09-30）。
 *
 * 任何出战计划（任务/探索/活动）都可以在 EncounterPlan.bonus 上声明「满足条件 + 掷中概率 →
 * 额外发放货币/素材」。发放统一在 applySettlement 里做（key 'battle-bonus'），结算页与普通
 * 收益并列展示——声明方只描述奖励，不自己入账。
 *
 * 概率按 result.seed 与条目 id 派生的独立随机流掷，同一场结果重放得到同一份奖励。
 */
import { fnv1a32 } from '../data/hash';
import { SeededRNG } from '../../engine/rng';
import type { BattleResult } from '../../session/contract';
import type { CurrencyDelta } from '../types';
import type { MaterialDelta } from '../data/materials';

export type BattleBonusWhen =
  /** 本场胜利 */
  | { kind: 'victory' }
  /** 列出的敌方 externalId 全部阵亡（逃跑不算；胜负不限） */
  | { kind: 'killed'; targets: string[] }
  /** 胜利且我方完成回合数 ≤ n */
  | { kind: 'turnsAtMost'; n: number }
  /** 列出的目标中有任一逃跑（安慰奖：「地精掉落的零钱」） */
  | { kind: 'fledAny'; targets: string[] }
  /** 对某敌人造成 ≥ min 点伤害（from = 开战生命；胜负不限，突袭血池用） */
  | { kind: 'damageAtLeast'; target: string; from: number; min: number };

export interface BattleBonusSpec {
  /** 条目 id：参与随机流派生，同一计划内唯一 */
  id: string;
  /** 结算行标题（如「宝藏地精的钱袋」） */
  label: string;
  when: BattleBonusWhen;
  /** 0~1，缺省必得 */
  chance?: number;
  deltas?: CurrencyDelta;
  mats?: MaterialDelta;
  note?: string;
}

export interface BattleBonusGrant {
  spec: BattleBonusSpec;
  deltas: CurrencyDelta;
  mats: MaterialDelta;
}

function conditionMet(when: BattleBonusWhen, result: BattleResult): boolean {
  const victory = result.winner === 'player' && result.endReason !== 'surrender';
  switch (when.kind) {
    case 'victory': return victory;
    case 'killed': return when.targets.length > 0 && when.targets.every((id) => result.defeatedExternalIds.includes(id));
    case 'turnsAtMost': return victory && (result.playerTurns ?? Math.ceil(result.turns / 2)) <= when.n;
    case 'fledAny': return when.targets.some((id) => (result.fledExternalIds ?? []).includes(id));
    case 'damageAtLeast': {
      if (result.endReason === 'surrender') return false;
      const c = result.combatants.find((x) => x.externalId === when.target);
      if (!c) return false;
      return when.from - Math.max(0, c.hp) >= when.min;
    }
  }
}

/** 掷骰（可复现）：该条目是否掷中 */
export function bonusRoll(spec: BattleBonusSpec, seed: number): boolean {
  if (spec.chance === undefined || spec.chance >= 1) return true;
  if (spec.chance <= 0) return false;
  return new SeededRNG(fnv1a32(`bonus-${seed >>> 0}-${spec.id}`)).next() < spec.chance;
}

/** 本场实际获得的额外奖励（纯函数；入账由 settlement 做） */
export function resolveBattleBonus(specs: readonly BattleBonusSpec[] | undefined, result: BattleResult): BattleBonusGrant[] {
  if (!specs || specs.length === 0) return [];
  const out: BattleBonusGrant[] = [];
  for (const spec of specs) {
    if (!conditionMet(spec.when, result)) continue;
    if (!bonusRoll(spec, result.seed)) continue;
    out.push({ spec, deltas: { ...(spec.deltas ?? {}) }, mats: { ...(spec.mats ?? {}) } });
  }
  return out;
}
