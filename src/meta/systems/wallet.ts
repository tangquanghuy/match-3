/**
 * 货币账本（M0）——经济系统唯一的入账/扣费口径（META-GAME-PLAN.md §4.1）。
 *
 * 规则：
 *  - spend 是**原子**的：任一币种不足则整笔不扣（多币种消耗不出现扣一半）；
 *  - 账目数值恒为非负，负数入参一律 INVALID；
 *  - 界面上「货币角标点击看获取途径」的提示文案由 UI 层组织，这里只管账。
 */
import type { MetaSave } from '../state/schema';
import type { CurrencyDelta, MetaFailure } from '../types';
import { fail } from '../types';

export type { CurrencyDelta };

function validDelta(delta: CurrencyDelta): boolean {
  return Object.values(delta).every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
}

export function canAfford(save: MetaSave, cost: CurrencyDelta): boolean {
  if (!validDelta(cost)) return false;
  for (const [key, value] of Object.entries(cost) as [keyof CurrencyDelta, number][]) {
    if (save.currencies[key] < value) return false;
  }
  return true;
}

/** 入账（战斗结算/进贡/任务/分解等唯一入口）。返回实际入账的账目。 */
export function earn(save: MetaSave, gain: CurrencyDelta): CurrencyDelta {
  const applied: CurrencyDelta = {};
  if (!validDelta(gain)) return applied;
  for (const [key, value] of Object.entries(gain) as [keyof CurrencyDelta, number][]) {
    if (value <= 0) continue;
    save.currencies[key] += value;
    applied[key] = value;
  }
  return applied;
}

/** 扣费：原子成功返回 ok，任一不足整笔不动。 */
export function spend(save: MetaSave, cost: CurrencyDelta): { ok: true } | MetaFailure {
  if (!validDelta(cost)) return fail('INVALID', '消耗账目非法');
  for (const [key, value] of Object.entries(cost) as [keyof CurrencyDelta, number][]) {
    if (save.currencies[key] < value) {
      const names: Record<string, string> = {
        gold: '黄金',
        souls: '灵魂',
        gems: '宝石',
        goldKeys: '金钥匙',
      };
      return fail(
        'INSUFFICIENT',
        `${names[key]}不足：需要 ${value}，现有 ${save.currencies[key]}`,
      );
    }
  }
  for (const [key, value] of Object.entries(cost) as [keyof CurrencyDelta, number][]) {
    save.currencies[key] -= value;
  }
  return { ok: true };
}
