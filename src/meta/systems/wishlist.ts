import { TROOPS, getTroopById, type TroopData } from '../../data/troops';
import { GACHA_RULES as RULES, emptyGachaWishlist, pursuitLimitFor, type GachaWishlist, type GachaAudit } from '../data/gachaRules';
import type { MetaSave } from '../state/schema';
import { fail, type MetaFailure } from '../types';

export const BLOCKED_WISHLIST_IDS = new Set([7736, 6529, 7393, 7446, 7622]);
// Historical gacha audits record the rules in effect when the draw happened.
// Retiring a troop must not erase the original signed draw context on hydration.
const HISTORICAL_AUDIT_BLOCKED_IDS = new Set([7736, 6529, 7393]);
export const hasBlockedWishlistIds = (raw: unknown): boolean => {
  if (!raw || typeof raw !== 'object') return false;
  const w = raw as Partial<GachaWishlist>;
  return (Array.isArray(w.troopIds) && w.troopIds.some(id => BLOCKED_WISHLIST_IDS.has(id)))
    || BLOCKED_WISHLIST_IDS.has(w.pursuit?.targetId ?? -1);
};

export const wishlistKingdom = (t: TroopData): string => t.kingdom ?? '无王国';
export const WISHLIST_TROOPS = TROOPS.filter((t) => t.rarityIdx >= RULES.minRarity && !BLOCKED_WISHLIST_IDS.has(t.id));
/** 修改器临时收藏不影响首张资格。 */
export const reallyOwned = (save: MetaSave, id: number): boolean => !!(save.collectionTruth ?? save.collection)[String(id)];

export function validateWishlist(ids: readonly number[], blockedIds: ReadonlySet<number> = BLOCKED_WISHLIST_IDS): MetaFailure | null {
  if (ids.length > RULES.maxTroops) return fail('INVALID', '已达愿望单上限，请先移除一名角色');
  const seen = new Set<number>();
  const bands = new Map<number, number>();
  for (const id of ids) {
    const t = Number.isInteger(id) ? getTroopById(id) : undefined;
    if (!t || t.rarityIdx < RULES.minRarity || blockedIds.has(id)) return fail('INVALID', '请选择传说、史诗或神话角色');
    if (seen.has(id)) return fail('INVALID', '同一角色只占一个愿望位置');
    seen.add(id);
    bands.set(t.rarityIdx, (bands.get(t.rarityIdx) ?? 0) + 1);
    if (bands.get(t.rarityIdx)! > RULES.slotsPerRarity) return fail('INVALID', `该稀有度已满 ${RULES.slotsPerRarity} 人，请先移除一人`);
  }
  return null;
}
export function wishlistCount(ids: readonly number[], rarity: number): number {
  return ids.filter((id) => getTroopById(id)?.rarityIdx === rarity).length;
}
export function wishlistHitRate(ids: readonly number[], rarity: number): number {
  return wishlistCount(ids, rarity) * (RULES.wishlistShares[rarity] ?? 0) / RULES.slotsPerRarity;
}
export function setWishlist(save: MetaSave, ids: readonly number[]): { ok: true } | MetaFailure {
  const error = validateWishlist(ids);
  if (error) return error;
  save.gachaWishlist.troopIds = [...ids];
  const p = save.gachaWishlist.pursuit;
  if (p.targetId !== null && !ids.includes(p.targetId)) p.targetId = null;
  return { ok: true };
}
export function setPursuitTarget(save: MetaSave, id: number | null): { ok: true } | MetaFailure {
  if (id !== null && (BLOCKED_WISHLIST_IDS.has(id) || !save.gachaWishlist.troopIds.includes(id)
    || getTroopById(id)?.rarityIdx !== RULES.pursuitRarity || reallyOwned(save, id))) {
    return fail('INVALID', '追寻目标需为愿望单中尚未拥有的神话角色');
  }
  const p = save.gachaWishlist.pursuit;
  // 无进度时采用当前参数；切换中途目标保留进度与当轮上限。
  if (p.progress === 0) p.limit = pursuitLimitFor(p.completed);
  p.targetId = id;
  return { ok: true };
}
/** 节级容错：去重、丢弃悬空/超配额项，保留合法进度。 */
export function hydrateWishlist(raw: unknown, owned: (id: number) => boolean = () => false): GachaWishlist {
  const value = emptyGachaWishlist();
  if (!raw || typeof raw !== 'object') return value;
  const input = raw as Partial<GachaWishlist>;
  if (Array.isArray(input.troopIds)) {
    for (const id of input.troopIds) {
      const next = [...value.troopIds, id];
      if (!validateWishlist(next)) value.troopIds = next;
    }
  }
  const p = input.pursuit;
  if (p && typeof p === 'object') {
    const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
    value.pursuit.completed = integer(p.completed) ? p.completed : 0;
    const fallback = pursuitLimitFor(value.pursuit.completed);
    value.pursuit.limit = integer(p.limit) && p.limit > 0 && p.limit <= 1_000_000 ? p.limit : fallback;
    // 旧版后续轮次固定为 400 抽；只升级这一旧值，保留其他合法当轮快照。
    if (value.pursuit.completed >= 1 && value.pursuit.limit === 400) value.pursuit.limit = fallback;
    value.pursuit.progress = integer(p.progress) ? Math.min(p.progress, value.pursuit.limit - 1) : 0;
    value.pursuit.targetId = value.troopIds.includes(p.targetId!) && getTroopById(p.targetId!)?.rarityIdx === RULES.pursuitRarity ? p.targetId : null;
    if (BLOCKED_WISHLIST_IDS.has(p.targetId ?? -1)) value.pursuit.targetId = replacementPursuit(value.troopIds, owned);
  }
  return value;
}

/** 确定性补齐建议：每档各补至九名，仅添加不替换；偏好未拥有、当前队伍同色/同族。 */
function replacementPursuit(ids: readonly number[], owned: (id: number) => boolean): number | null {
  return ids.find(id => getTroopById(id)?.rarityIdx === RULES.pursuitRarity && !owned(id)) ?? null;
}

/** Idempotent cleanup for already-loaded saves; preserve pursuit progress and limit. */
export function purgeBlockedWishlist(save: MetaSave): boolean {
  const wishlist = save.gachaWishlist;
  if (!hasBlockedWishlistIds(wishlist)) return false;
  wishlist.troopIds = wishlist.troopIds.filter(id => !BLOCKED_WISHLIST_IDS.has(id));
  if (BLOCKED_WISHLIST_IDS.has(wishlist.pursuit.targetId ?? -1))
    wishlist.pursuit.targetId = replacementPursuit(wishlist.troopIds, id => reallyOwned(save, id));
  return true;
}

export function recommendWishlist(save: MetaSave): number[] {
  const ids = [...save.gachaWishlist.troopIds];
  const team = save.teams[save.activeTeamIndex]?.members ?? [];
  const allies = team.flatMap((m) => m.kind === 'troop' ? [getTroopById(m.troopId)!].filter(Boolean) : []);
  const colors = new Set(allies.flatMap((t) => t.manaColors));
  const races = new Set(allies.flatMap((t) => t.troopTypes));
  const score = (t: TroopData): number => (reallyOwned(save, t.id) ? 0 : 100)
    + t.manaColors.filter((c) => colors.has(c)).length * 5 + t.troopTypes.filter((r) => races.has(r)).length * 3;
  for (const rarity of [3, 4, 5]) {
    const slots = RULES.slotsPerRarity - wishlistCount(ids, rarity);
    ids.push(...WISHLIST_TROOPS.filter((t) => t.rarityIdx === rarity && !ids.includes(t.id))
      .sort((a, b) => score(b) - score(a) || a.id - b.id).slice(0, slots).map((t) => t.id));
  }
  return ids;
}

/** 审计记录只接收完整合法快照，缺失/损坏记录保持旧日志基础字段。 */
export function hydrateGachaAudit(raw: unknown, count: number): GachaAudit | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const a = raw as GachaAudit;
  if (!Number.isSafeInteger(a.rulesVersion) || a.rulesVersion < 1 || !Array.isArray(a.wishlistIds)
    || validateWishlist(a.wishlistIds, HISTORICAL_AUDIT_BLOCKED_IDS) || !Array.isArray(a.reasons) || a.reasons.length !== count
    || a.reasons.some(r=>!['normal','ten-pity','pursuit','novice'].includes(r))) return undefined;
  for (const p of [a.pursuitBefore,a.pursuitAfter]) {
    if (!p || !Number.isSafeInteger(p.progress) || p.progress < 0 || !Number.isSafeInteger(p.completed) || p.completed < 0
      || !Number.isSafeInteger(p.limit) || p.limit < 1 || p.progress >= p.limit
      || (p.targetId !== null && (!a.wishlistIds.includes(p.targetId) || getTroopById(p.targetId)?.rarityIdx !== RULES.pursuitRarity))) return undefined;
  }
  return { rulesVersion:a.rulesVersion,wishlistIds:[...a.wishlistIds],reasons:[...a.reasons],pursuitBefore:{...a.pursuitBefore},pursuitAfter:{...a.pursuitAfter} };
}
