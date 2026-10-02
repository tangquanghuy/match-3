import { ARCANE_STONE_KEYS, STONE_COLORS, type TraitstoneTier } from './materials';

export const MATERIAL_SHOP_KEYS: readonly string[] = [
  ...['minor', 'major', 'runic'].flatMap(tier => STONE_COLORS.map(color => `${tier}:${color.key}`)),
  ...ARCANE_STONE_KEYS, 'celestial',
];
export interface MaterialShopPricing {
  revision: number;
  gold: Record<TraitstoneTier, number | null>;
  gems: Record<TraitstoneTier, number | null>;
  arcaneIntro?: { limit: number; unitGold: number };
  gemBundleDiscounts?: Readonly<Record<number, readonly number[]>>;
}
/** 金币为高价补缺渠道；宝石按真实配方合计。null 仍可用于暂停某品阶销售。 */
export const MATERIAL_SHOP_PRICING: MaterialShopPricing = {
  revision: 5,
  gold: { minor: 3_000, major: 12_000, runic: 60_000, arcane: 1_000_000, celestial: 2_000_000 },
  gems: { minor: 5, major: 15, runic: 55, arcane: 180, celestial: 490 },
  arcaneIntro: { limit: 84, unitGold: 500_000 },
  gemBundleDiscounts: {
    0: [2, 4, 5, 6, 7, 8],
    1: [2, 4, 5, 6, 7, 8],
    2: [2, 4, 5, 6, 7, 8],
    3: [2, 3, 5, 8],
    4: [2, 5],
    5: [3, 5],
  },
};
