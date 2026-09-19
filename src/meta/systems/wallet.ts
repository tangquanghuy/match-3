/**
 * 货币账本（M0）——经济系统唯一的入账/扣费口径（META-GAME-PLAN.md §4.1）。
 *
 * 规则：
 *  - spend 是**原子**的：任一币种不足则整笔不扣（多币种消耗不出现扣一半）；
 *  - 账目数值恒为非负，负数入参一律 INVALID；
 *  - 界面上「货币角标点击看获取途径」的提示文案由 UI 层组织，这里只管账。
 */
import type { MetaSave } from '../state/schema';
import type { MaterialDelta } from '../data/materials';
import { stoneName } from '../data/materials';
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
        glory: '荣耀',
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

// ---------------------------------------------------------------------------
// 素材库存（2026-09-19 素材批）：与货币同一套「原子扣费 / 只入正数」纪律
// ---------------------------------------------------------------------------

/** 素材入账（活动里程碑/掉落/周结奖励的唯一入口）。返回实际入账的账目（非零键） */
export function earnMaterials(save: MetaSave, gain: MaterialDelta): MaterialDelta {
  const appliedIngots: Record<string, number> = {};
  const appliedStones: Record<string, number> = {};
  const applied: MaterialDelta = { ingots: appliedIngots, traitstones: appliedStones };
  for (const [key, value] of Object.entries(gain.ingots ?? {})) {
    const n = Math.floor(value ?? 0);
    if (n <= 0) continue;
    save.materials.ingots[key] = (save.materials.ingots[key] ?? 0) + n;
    appliedIngots[key] = n;
  }
  const scrolls = Math.floor(gain.forgeScrolls ?? 0);
  if (scrolls > 0) {
    save.materials.forgeScrolls += scrolls;
    applied.forgeScrolls = scrolls;
  }
  for (const [key, value] of Object.entries(gain.traitstones ?? {})) {
    const n = Math.floor(value ?? 0);
    if (n <= 0) continue;
    save.materials.traitstones[key] = (save.materials.traitstones[key] ?? 0) + n;
    appliedStones[key] = n;
  }
  if (Object.keys(appliedIngots).length === 0) delete applied.ingots;
  if (Object.keys(appliedStones).length === 0) delete applied.traitstones;
  if (applied.forgeScrolls === undefined) delete applied.forgeScrolls;
  return applied;
}

function materialShort(save: MetaSave, cost: MaterialDelta): string | null {
  for (const [key, value] of Object.entries(cost.ingots ?? {})) {
    if ((save.materials.ingots[key] ?? 0) < value!) return `钢锭不足（${key}）`;
  }
  if ((cost.forgeScrolls ?? 0) > save.materials.forgeScrolls) return '熔铸符卷不足';
  for (const [key, value] of Object.entries(cost.traitstones ?? {})) {
    if ((save.materials.traitstones[key] ?? 0) < value!) return `${stoneName(key)}不足`;
  }
  return null;
}

/** 素材持有量是否足够（与 canAfford 同语义） */
export function canAffordMaterials(save: MetaSave, cost: MaterialDelta): boolean {
  return materialShort(save, cost) === null;
}

/** 素材扣费：原子（任一不足整笔不动）。失败返回第一条缺口的中文文案 */
export function spendMaterials(save: MetaSave, cost: MaterialDelta): { ok: true } | MetaFailure {
  const short = materialShort(save, cost);
  if (short) return fail('INSUFFICIENT', short);
  for (const [key, value] of Object.entries(cost.ingots ?? {})) {
    save.materials.ingots[key] = (save.materials.ingots[key] ?? 0) - value!;
  }
  save.materials.forgeScrolls -= cost.forgeScrolls ?? 0;
  for (const [key, value] of Object.entries(cost.traitstones ?? {})) {
    save.materials.traitstones[key] = (save.materials.traitstones[key] ?? 0) - value!;
  }
  return { ok: true };
}
