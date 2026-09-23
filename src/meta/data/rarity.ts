/**
 * GoW 六档稀有度的玩家展示单源。
 *
 * 数据仍保留官方英文键；界面统一映射为：
 * 普通 / 精良 / 稀有 / 传说 / 史诗 / 神话。
 */
export const RARITY_TIERS = [
  { key: 'Common', label: '普通', color: '#aab2ad', glow: 'rgba(170,178,173,.18)', className: 'common' },
  { key: 'Uncommon', label: '精良', color: '#4caf6a', glow: 'rgba(76,175,106,.20)', className: 'fine' },
  { key: 'Rare', label: '稀有', color: '#9a4fd4', glow: 'rgba(154,79,212,.20)', className: 'rare' },
  { key: 'UltraRare', label: '传说', color: '#ffe24a', glow: 'rgba(255,226,74,.20)', className: 'legend' },
  { key: 'Epic', label: '史诗', color: '#c56b2d', glow: 'rgba(197,107,45,.20)', className: 'epic' },
  { key: 'Legendary', label: '神话', color: '#56d8ff', glow: 'rgba(86,216,255,.22)', className: 'mythic' },
] as const;

export type GowRarity = (typeof RARITY_TIERS)[number]['key'];
export type RarityMeta = (typeof RARITY_TIERS)[number] | typeof DOOMED_RARITY;

/** 武器目录还包含末日武器；它是专属品类，不改变部队的六档顺序。 */
const DOOMED_RARITY = {
  key: 'Doomed',
  label: '末日',
  color: '#d45b59',
  glow: 'rgba(212,91,89,.20)',
  className: 'doomed',
} as const;

export const RARITY_ORDER: readonly GowRarity[] = Object.freeze(RARITY_TIERS.map((tier) => tier.key));
export const RARITY_NAMES: readonly string[] = Object.freeze(RARITY_TIERS.map((tier) => tier.label));
export const RARITY_COLORS: readonly string[] = Object.freeze(RARITY_TIERS.map((tier) => tier.color));
export const RARITY_CLASS_NAMES: readonly string[] = Object.freeze(RARITY_TIERS.map((tier) => tier.className));

const RARITY_BY_KEY: Readonly<Record<GowRarity, (typeof RARITY_TIERS)[number]>> = Object.freeze(
  Object.fromEntries(RARITY_TIERS.map((tier) => [tier.key, tier])) as Record<GowRarity, (typeof RARITY_TIERS)[number]>,
);

/** 兼容武器数据的 Mythic 键；它与六档最高档共用“神话”展示。 */
export const RARITY_ZH: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(RARITY_TIERS.map((tier) => [tier.key, tier.label])),
  Mythic: RARITY_TIERS[5].label,
  Doomed: DOOMED_RARITY.label,
});

function normalizedIndex(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.floor(value), 0), RARITY_TIERS.length - 1);
}

export function rarityMetaByIndex(value: number): (typeof RARITY_TIERS)[number] {
  return RARITY_TIERS[normalizedIndex(value)]!;
}

export function rarityMetaByKey(value: string): RarityMeta {
  if (value === 'Mythic') return RARITY_TIERS[5];
  if (value === 'Doomed') return DOOMED_RARITY;
  return RARITY_BY_KEY[value as GowRarity] ?? RARITY_TIERS[0];
}

export function rarityNameByIndex(value: number): string {
  return rarityMetaByIndex(value).label;
}

export function rarityClassByIndex(value: number): `r-${number}` {
  return `r-${normalizedIndex(value)}`;
}

export function rarityStyle(rarity: string): string {
  const meta = rarityMetaByKey(rarity);
  return `--rarity-line:${meta.color};--rarity-glow:${meta.glow}`;
}
