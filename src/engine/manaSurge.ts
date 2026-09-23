/**
 * Mana Surge（法力涌动）：匹配结算时按宝石数决定是否把产出翻倍。
 *
 * 官方口径：
 *  - 3 消：概率翻倍（3 → 6），chance = mastery / (mastery + 100)，递减；
 *  - 4 消：永不涌动；
 *  - 5 消及以上：必涌动（5 → 10）。
 * 通配倍率在翻倍之后再乘。摧毁/爆炸/巨人宝石的定额法力不走此口。
 */
export const MANA_SURGE_K = 100;

export function manaSurgeChance(mastery: number): number {
  const m = Math.max(0, mastery);
  if (m <= 0) return 0;
  return m / (m + MANA_SURGE_K);
}

export function matchManaWithSurge(
  gemCount: number,
  manaMultiplier: number,
  mastery: number,
  roll: number,
): { amount: number; surged: boolean } {
  const count = Math.max(0, gemCount);
  const mult = manaMultiplier;
  if (count <= 0) return { amount: 0, surged: false };
  if (count === 4) return { amount: 4 * mult, surged: false };
  if (count >= 5) return { amount: count * 2 * mult, surged: true };
  if (count !== 3) return { amount: count * mult, surged: false };
  if (roll < manaSurgeChance(mastery)) return { amount: 6 * mult, surged: true };
  return { amount: 3 * mult, surged: false };
}
