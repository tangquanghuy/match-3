/**
 * 治疗修正（GoW 出血 / 疾病）。
 *
 * 单独成模块而不是放进 `skills/effects/status.ts`，是因为特质模块的回合开始恢复
 * （`applyTurnStartPassives`）也要吃这份修正，而 `status.ts` 已经 import 了 `traits.ts`。
 * 反向再 import 会形成循环，导致顶层 `new Set(...)` 在求值顺序不利时读到 undefined。
 * 本模块只依赖类型，两侧都能安全引用。
 */
import type { Character } from './types';

/**
 * 治疗封锁类状态：期间任何治疗完全无效（GoW Bleed 出血）。
 * 与「减半」分成两个集合而不是一个系数表，是为了让并存时的规则显式：
 * 封锁优先于减半（出血 + 疾病 = 完全不能回血）。
 */
export const HEAL_BLOCK_STATUS_IDS = new Set(['bleed']);

/** 治疗削弱类状态：期间受到的治疗减半（GoW Disease 疾病） */
export const HEAL_HALVE_STATUS_IDS = new Set(['disease']);

/** 是否处于出血（治疗完全无效） */
export function isBleeding(char: Character): boolean {
  return char.statuses.some((s) => s.turns > 0 && HEAL_BLOCK_STATUS_IDS.has(s.id));
}

/** 是否患病（治疗减半） */
export function isDiseased(char: Character): boolean {
  return char.statuses.some((s) => s.turns > 0 && HEAL_HALVE_STATUS_IDS.has(s.id));
}

/**
 * 该角色当前受到的治疗倍率：出血 0（完全封锁），疾病 0.5，两者皆无 1。
 * 只作用于「治疗」，不影响特质带来的生命上限提升——后者是成长而非回血。
 */
export function healingMultiplier(char: Character): number {
  if (isBleeding(char)) return 0;
  if (isDiseased(char)) return 0.5;
  return 1;
}

/** 按治疗修正折算一次治疗量（向下取整，非正数原样返回）。 */
export function effectiveHealing(char: Character, amount: number): number {
  if (amount <= 0) return amount;
  return Math.floor(amount * healingMultiplier(char));
}
