/** 愿望单与追寻单源；调参后递增版本。运行时与经济模型共用。 */
export const GACHA_RULES = {
  version: 3,
  maxKingdoms: 9,
  perKingdom: 3,
  slotsPerRarity: 9,
  maxTroops: 27,
  minRarity: 3,
  /** 本档填满时的名单总概率；空位留在名单外，不分给已选角色。 */
  wishlistShares: [0, 0, 0, 0.8, 0.7, 1] as readonly number[],
  pursuitRarity: 5,
  firstPursuitLimit: 200,
  repeatPursuitLimit: 400,
} as const;

export interface GachaPursuit {
  targetId: number | null;
  progress: number;
  completed: number;
  /** 当轮快照：后续调参不追溯增加已经开始的追寻上限。 */
  limit: number;
}
export interface GachaWishlist {
  troopIds: number[];
  pursuit: GachaPursuit;
}
export interface GachaAudit {
  rulesVersion: number;
  wishlistIds: number[];
  pursuitBefore: GachaPursuit;
  pursuitAfter: GachaPursuit;
  reasons: Array<'normal' | 'ten-pity' | 'pursuit' | 'novice'>;
}
export function emptyGachaWishlist(): GachaWishlist {
  return { troopIds: [], pursuit: { targetId: null, progress: 0, completed: 0, limit: GACHA_RULES.firstPursuitLimit } };
}
