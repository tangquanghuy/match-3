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
}
/** 金币为高价补缺渠道；宝石按真实配方合计。null 仍可用于暂停某品阶销售。 */
export const MATERIAL_SHOP_PRICING: MaterialShopPricing = {
  revision: 2,
  gold: { minor: 2_000, major: 8_000, runic: 60_000, arcane: 1_000_000, celestial: 2_000_000 },
  gems: { minor: 1, major: 3, runic: 12, arcane: 40, celestial: 120 },
  arcaneIntro: { limit: 84, unitGold: 500_000 },
};
