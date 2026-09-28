/**
 * Mana Surge（法力涌动）：匹配结算时按宝石数与连锁层数决定是否把产出翻倍。
 *
 * 本作口径（在官方基础上为加快节奏上调，用户裁定）：
 *  - 基础几率 = 精通几率 mastery / (mastery + 100) + 连锁加成；
 *  - 连锁加成：第 2 轮连锁 +10%、第 3 轮 +20%、第 4 轮及以后 +30%（封顶 30%，
 *    避免一串长连锁里每轮都涌动）；
 *  - 3 消：按基础几率翻倍（3 → 6）；
 *  - 4 消：基础几率 ×2，且至少 35%（4 → 8）；
 *  - 5 消及以上：必涌动（5 → 10）。
 * 通配倍率在翻倍之后再乘。摧毁/爆炸/巨人宝石的定额法力不走此口。
 */
export const MANA_SURGE_K = 100;

/** 4 消涌动几率下限 */
export const FOUR_MATCH_SURGE_FLOOR = 0.35;
/** 连锁每多一轮加的涌动几率与封顶 */
export const CHAIN_SURGE_STEP = 0.1;
export const CHAIN_SURGE_CAP = 0.3;

export function manaSurgeChance(mastery: number): number {
  const m = Math.max(0, mastery);
  if (m <= 0) return 0;
  return m / (m + MANA_SURGE_K);
}

/** 连锁加成：chain = 本组所在的连锁轮次（交换直接成的那一轮 = 1） */
export function chainSurgeBonus(chain: number): number {
  return Math.min(CHAIN_SURGE_CAP, Math.max(0, Math.floor(chain) - 1) * CHAIN_SURGE_STEP);
}

/** 一组匹配的涌动几率（0~1） */
export function matchSurgeChance(gemCount: number, mastery: number, chain = 1): number {
  if (gemCount >= 5) return 1;
  const base = manaSurgeChance(mastery) + chainSurgeBonus(chain);
  if (gemCount === 4) return Math.min(1, Math.max(FOUR_MATCH_SURGE_FLOOR, base * 2));
  if (gemCount === 3) return Math.min(1, base);
  return 0;
}

/** 这组匹配需不需要掷随机数（几率为 0 或 1 时不消耗随机数） */
export function surgeNeedsRoll(gemCount: number, mastery: number, chain = 1): boolean {
  const chance = matchSurgeChance(gemCount, mastery, chain);
  return chance > 0 && chance < 1;
}

export function matchManaWithSurge(
  gemCount: number,
  manaMultiplier: number,
  mastery: number,
  roll: number,
  chain = 1,
): { amount: number; surged: boolean } {
  const count = Math.max(0, gemCount);
  if (count <= 0) return { amount: 0, surged: false };
  const chance = matchSurgeChance(count, mastery, chain);
  const surged = chance >= 1 || (chance > 0 && roll < chance);
  return { amount: count * (surged ? 2 : 1) * manaMultiplier, surged };
}
