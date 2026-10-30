/**
 * Tavern weapon shop (user decision 2026-10-30): 普通/精良/稀有 weapons are open; 传说, 史诗, 神话
 * and 末日 weapons are bought with the AIRP universal currency (`人物.背包.通用币`).
 *
 * Ownership lives in MVU next to the currency, in a program-only top-level field that the card's
 * "当前变量" world book entry does not output, so the AI never sees it. Because MVU variables are
 * stored per floor, regenerating or deleting the purchase floor rolls back the money and the
 * ownership together.
 */
import weapons from '../data/weapons.json';
import { rarityMetaByKey } from '../meta/data/rarity';

export const OWNED_WEAPONS_FIELD = '三消已购武器';

/** Price by catalogue rarity key. Keys not listed (Common, Uncommon, Rare) are free. */
const PRICES: Readonly<Record<string, number>> = Object.freeze({
  UltraRare: 600_000, // 传说
  Epic: 1_200_000, // 史诗
  Legendary: 2_000_000, // 神话
  Mythic: 2_000_000, // 神话
  Doomed: 3_000_000, // 末日
});

const rarityById = new Map(weapons.map(w => [`gw_${w.referenceName}`, w.rarity]));
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Price in 通用币; 0 means the weapon is open without purchase. */
export function weaponPrice(id: string): number {
  return PRICES[rarityById.get(id) ?? ''] ?? 0;
}

/** Weapon ids bought in this chat floor. */
export function ownedWeapons(statData: Readonly<Record<string, unknown>>): Set<string> {
  const value = statData[OWNED_WEAPONS_FIELD];
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string')) throw new Error('MVU 三消已购武器字段格式有误');
  return new Set(value as string[]);
}

export function weaponOwned(statData: Readonly<Record<string, unknown>>, id: string): boolean {
  return weaponPrice(id) === 0 || ownedWeapons(statData).has(id);
}

/** Current 通用币, or undefined when the character has no readable balance. */
export function universalCurrency(statData: Readonly<Record<string, unknown>>): number | undefined {
  const hero = statData['人物']; const bag = object(hero) ? hero['背包'] : undefined;
  const value = object(bag) ? bag['通用币'] : undefined;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

/** "120万" for whole ten-thousands, otherwise grouped digits. */
export function formatCurrency(value: number): string {
  return value >= 10_000 && value % 10_000 === 0 ? `${value / 10_000}万` : value.toLocaleString('zh-CN');
}

export function weaponRarityLabel(id: string): string {
  return rarityMetaByKey(rarityById.get(id) ?? '').label;
}

/** Pure: returns new stat data with the price deducted and the weapon recorded. */
export function applyWeaponPurchase(statData: Readonly<Record<string, unknown>>, id: string): Record<string, unknown> {
  const price = weaponPrice(id);
  if (!rarityById.has(id)) throw new Error('该武器不在现有目录中');
  if (price === 0) throw new Error('该武器无需购买');
  const owned = ownedWeapons(statData);
  if (owned.has(id)) throw new Error('该武器已经购买');
  const balance = universalCurrency(statData);
  if (balance === undefined) throw new Error('读取不到主角的通用币');
  if (balance < price) throw new Error(`通用币不足：需要 ${formatCurrency(price)}，当前 ${formatCurrency(balance)}`);
  const next = structuredClone(statData) as Record<string, unknown>;
  ((next['人物'] as Record<string, unknown>)['背包'] as Record<string, unknown>)['通用币'] = balance - price;
  next[OWNED_WEAPONS_FIELD] = [...owned, id];
  return next;
}
