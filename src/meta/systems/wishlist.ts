import { TROOPS, getTroopById, type TroopData } from '../../data/troops';
import { GACHA_RULES as RULES, emptyGachaWishlist, type GachaWishlist, type GachaAudit } from '../data/gachaRules';
import type { MetaSave } from '../state/schema';
import { fail, type MetaFailure } from '../types';

export const wishlistKingdom = (t: TroopData): string => t.kingdom ?? '无王国';
export const WISHLIST_TROOPS = TROOPS.filter((t) => t.rarityIdx >= RULES.minRarity);
/** 修改器临时收藏不影响首张资格。 */
export const reallyOwned = (save: MetaSave, id: number): boolean => !!(save.collectionTruth ?? save.collection)[String(id)];

export function validateWishlist(ids: readonly number[]): MetaFailure | null {
  if (ids.length > RULES.maxTroops) return fail('INVALID', '已达愿望单上限，请先移除一名角色');
  const seen = new Set<number>();
  const kingdoms = new Map<string, number>();
  const bands = new Map<number, number>();
  for (const id of ids) {
    const t = Number.isInteger(id) ? getTroopById(id) : undefined;
    if (!t || t.rarityIdx < RULES.minRarity) return fail('INVALID', '请选择传说、史诗或神话角色');
    if (seen.has(id)) return fail('INVALID', '同一角色只占一个愿望位置');
    seen.add(id);
    const k = wishlistKingdom(t);
    kingdoms.set(k, (kingdoms.get(k) ?? 0) + 1);
    bands.set(t.rarityIdx, (bands.get(t.rarityIdx) ?? 0) + 1);
    if (kingdoms.get(k)! > RULES.perKingdom) return fail('INVALID', `${k}已满 ${RULES.perKingdom} 人，请先移除一人`);
    if (bands.get(t.rarityIdx)! > RULES.slotsPerRarity) return fail('INVALID', `该稀有度已满 ${RULES.slotsPerRarity} 人，请先移除一人`);
    if (kingdoms.size > RULES.maxKingdoms) return fail('INVALID', `已选 ${RULES.maxKingdoms} 个王国，请先清空一个王国`);
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
  if (id !== null && (!save.gachaWishlist.troopIds.includes(id)
    || getTroopById(id)?.rarityIdx !== RULES.pursuitRarity || reallyOwned(save, id))) {
    return fail('INVALID', '追寻目标需为愿望单中尚未拥有的神话角色');
  }
  const p = save.gachaWishlist.pursuit;
  // 无进度时采用当前参数；切换中途目标保留进度与当轮上限。
  if (p.progress === 0) p.limit = p.completed === 0 ? RULES.firstPursuitLimit : RULES.repeatPursuitLimit;
  p.targetId = id;
  return { ok: true };
}
/** 节级容错：去重、丢弃悬空/超配额项，保留合法进度。 */
export function hydrateWishlist(raw: unknown): GachaWishlist {
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
    const fallback = value.pursuit.completed === 0 ? RULES.firstPursuitLimit : RULES.repeatPursuitLimit;
    value.pursuit.limit = integer(p.limit) && p.limit > 0 && p.limit <= 1_000_000 ? p.limit : fallback;
    value.pursuit.progress = integer(p.progress) ? Math.min(p.progress, value.pursuit.limit - 1) : 0;
    value.pursuit.targetId = value.troopIds.includes(p.targetId!) && getTroopById(p.targetId!)?.rarityIdx === RULES.pursuitRarity ? p.targetId : null;
  }
  return value;
}

/** 确定性补齐建议：仅添加，不替换；偏好未拥有、当前队伍同色/同族，非强度评级。
 * 固定至多九个王国后，以稀有度→王国的最大流分配剩余槽，避免贪心填满某一档造成死路。
 */
export function recommendWishlist(save: MetaSave): number[] {
  const ids = [...save.gachaWishlist.troopIds];
  const team = save.teams[save.activeTeamIndex]?.members ?? [];
  const allies = team.flatMap((m) => m.kind === 'troop' ? [getTroopById(m.troopId)!].filter(Boolean) : []);
  const colors = new Set(allies.flatMap((t) => t.manaColors));
  const races = new Set(allies.flatMap((t) => t.troopTypes));
  const score = (t: TroopData): number => (reallyOwned(save, t.id) ? 0 : 100)
    + t.manaColors.filter((c) => colors.has(c)).length * 5 + t.troopTypes.filter((r) => races.has(r)).length * 3;
  const available = WISHLIST_TROOPS.filter((t) => !ids.includes(t.id)).sort((a, b) => score(b) - score(a) || a.id - b.id);
  const kingdoms = [...new Set(ids.map((id) => wishlistKingdom(getTroopById(id)!)))];
  const allKingdoms = [...new Set(available.map(wishlistKingdom))].filter((k) => !kingdoms.includes(k));
  allKingdoms.sort((a, b) => {
    const rank = (k: string) => {
      const pool = available.filter((t) => wishlistKingdom(t) === k);
      return new Set(pool.map((t) => t.rarityIdx)).size * 1000 + Math.max(0, ...pool.map(score));
    };
    return rank(b) - rank(a) || a.localeCompare(b, 'zh-Hans-CN');
  });
  kingdoms.push(...allKingdoms.slice(0, RULES.maxKingdoms - kingdoms.length));
  const source = 0, sink = 4 + kingdoms.length, size = sink + 1;
  const cap = Array.from({ length: size }, () => Array<number>(size).fill(0));
  for (let r = 3; r <= 5; r++) {
    const node = r - 2;
    cap[source]![node] = RULES.slotsPerRarity - wishlistCount(ids, r);
    kingdoms.forEach((k, i) => { cap[node]![4 + i] = available.filter((t) => t.rarityIdx === r && wishlistKingdom(t) === k).length; });
  }
  kingdoms.forEach((k, i) => { cap[4 + i]![sink] = RULES.perKingdom - ids.filter((id) => wishlistKingdom(getTroopById(id)!) === k).length; });
  const original = cap.map((row) => [...row]);
  while (true) {
    const parent = Array<number>(size).fill(-1); parent[source] = source;
    const queue = [source];
    for (let q = 0; q < queue.length && parent[sink] === -1; q++) {
      const u = queue[q]!;
      for (let v = 0; v < size; v++) if (parent[v] === -1 && cap[u]![v]! > 0) { parent[v] = u; queue.push(v); }
    }
    if (parent[sink] === -1) break;
    for (let v = sink; v !== source; v = parent[v]!) { const u = parent[v]!; cap[u]![v]!--; cap[v]![u]!++; }
  }
  for (let r = 3; r <= 5; r++) kingdoms.forEach((k, i) => {
    const n = original[r - 2]![4 + i]! - cap[r - 2]![4 + i]!;
    ids.push(...available.filter((t) => t.rarityIdx === r && wishlistKingdom(t) === k).slice(0, n).map((t) => t.id));
  });
  return ids;
}

/** 审计记录只接收完整合法快照，缺失/损坏记录保持旧日志基础字段。 */
export function hydrateGachaAudit(raw: unknown, count: number): GachaAudit | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const a = raw as GachaAudit;
  if (!Number.isSafeInteger(a.rulesVersion) || a.rulesVersion < 1 || !Array.isArray(a.wishlistIds)
    || validateWishlist(a.wishlistIds) || !Array.isArray(a.reasons) || a.reasons.length !== count
    || a.reasons.some(r=>!['normal','ten-pity','pursuit'].includes(r))) return undefined;
  for (const p of [a.pursuitBefore,a.pursuitAfter]) {
    if (!p || !Number.isSafeInteger(p.progress) || p.progress < 0 || !Number.isSafeInteger(p.completed) || p.completed < 0
      || !Number.isSafeInteger(p.limit) || p.limit < 1 || p.progress >= p.limit
      || (p.targetId !== null && (!a.wishlistIds.includes(p.targetId) || getTroopById(p.targetId)?.rarityIdx !== RULES.pursuitRarity))) return undefined;
  }
  return { rulesVersion:a.rulesVersion,wishlistIds:[...a.wishlistIds],reasons:[...a.reasons],pursuitBefore:{...a.pursuitBefore},pursuitAfter:{...a.pursuitAfter} };
}
