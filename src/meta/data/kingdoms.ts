/**
 * 王国元数据首版（M2 最小集）——META-GAME-PLAN.md §4.5 的 kingdoms.ts 落地。
 *
 * 本文件先解决战斗闭环需要的部分：王国定序、敌人基数等级、任务链 8 关的
 * 队伍规模 / 敌人等级 / 奖励部队。地图坐标、主色、纹章、两主色（旗帜）等
 * 视觉与经营字段在 M3 世界地图时补进同一条数据线；id 口径始终 =
 * troops.json 的 `kingdom` 字段（中文王国名），与部队数据零复制。
 */
import { TROOPS, type TroopData } from '../../data/troops';
import { COMMUNITY_KINGDOM } from '../../data/communityTroops';

/** 每王国任务链长度（对齐 GoW 的 8 关） */
export const QUESTS_PER_KINGDOM = 8;

// —— 王国 → 兵种池（kingdom 为 null 的兵种不属任何王国，不进表） ——
const POOL_BY_KINGDOM = new Map<string, TroopData[]>();
const MIN_ID_BY_KINGDOM = new Map<string, number>();
for (const troop of TROOPS) {
  if (!troop.kingdom) continue;
  let pool = POOL_BY_KINGDOM.get(troop.kingdom);
  if (!pool) {
    pool = [];
    POOL_BY_KINGDOM.set(troop.kingdom, pool);
  }
  pool.push(troop);
  const min = MIN_ID_BY_KINGDOM.get(troop.kingdom);
  if (min === undefined || troop.id < min) MIN_ID_BY_KINGDOM.set(troop.kingdom, troop.id);
}
for (const pool of POOL_BY_KINGDOM.values()) {
  pool.sort((a, b) => a.rarityIdx - b.rarityIdx || a.id - b.id);
}

/**
 * 王国推进序（首版口径：按各王国最小兵种 id 升序——破碎尖塔的 6000 是全数据
 * 最小 id，恰好第一个）。M3 接世界地图时如需官方顺序，只改这里的排序依据。
 */
export const KINGDOM_ORDER: readonly string[] = [...POOL_BY_KINGDOM.keys()]
  .filter((kingdom) => kingdom !== COMMUNITY_KINGDOM)
  .sort((a, b) => (MIN_ID_BY_KINGDOM.get(a) as number) - (MIN_ID_BY_KINGDOM.get(b) as number));

/** 全部王国名（有兵种的 42 个，按推进序） */
export function allKingdoms(): string[] {
  return [...KINGDOM_ORDER];
}

/** 王国兵种池（可按稀有度带过滤，min/max 含端） */
export function kingdomTroopPool(
  kingdom: string,
  rarityBand?: { min: number; max: number },
): TroopData[] {
  const pool = POOL_BY_KINGDOM.get(kingdom) ?? [];
  if (!rarityBand) return [...pool];
  return pool.filter((t) => t.rarityIdx >= rarityBand.min && t.rarityIdx <= rarityBand.max);
}

/**
 * 敌人基数等级 = 该王国的解锁等级（封顶 50）。
 *
 * GoW 4.5 起「任务难度随王国组缩放」：刚解锁的王国，主线第 1 关敌人与冒险者同级，
 * 第 8 关高 7 级。改前是「1 + 序号 × 2」，与每级解锁一国的新节奏错位——冒险者 20 级
 * 刚解锁的第 20 个王国会是 39 级敌人。
 */
export function kingdomBaseLevel(kingdom: string): number {
  return Math.min(kingdomUnlockLevel(kingdom), 50);
}

/** 出战双方固定 4 人（不存在 3v3） */
export const BATTLE_TEAM_SIZE = 4;

/** 任务第 node 关（1 起）的敌人等级：基数 + node - 1 */
export function questEnemyLevel(kingdom: string, node: number): number {
  return kingdomBaseLevel(kingdom) + Math.min(Math.max(node, 1), QUESTS_PER_KINGDOM) - 1;
}

/** Hard 3 关 / Very Hard 3 关，内部仍用 1~6 档接现有探索出敌 */
export const HARD_NODE_COUNT = 3;
export const VERY_HARD_NODE_COUNT = 3;
export const EXPLORE_MAX_TIER = HARD_NODE_COUNT + VERY_HARD_NODE_COUNT;

export type KingdomStageMode = 'normal' | 'hard' | 'veryHard';

export const KINGDOM_STAGE_COUNTS: Readonly<Record<KingdomStageMode, number>> = {
  normal: QUESTS_PER_KINGDOM, hard: HARD_NODE_COUNT, veryHard: VERY_HARD_NODE_COUNT,
};

/** Hard 1~3 → 档 1~3，Very Hard 1~3 → 档 4~6 */
export function exploreTierForNode(mode: 'hard' | 'veryHard', node: number): number {
  const count = mode === 'hard' ? HARD_NODE_COUNT : VERY_HARD_NODE_COUNT;
  const index = Math.min(Math.max(node, 1), count);
  return mode === 'hard' ? index : HARD_NODE_COUNT + index;
}

export function exploreNodeLabel(tier: number): string {
  if (tier <= HARD_NODE_COUNT) return `HARD ${tier}`;
  return `VERY HARD ${tier - HARD_NODE_COUNT}`;
}

/** 探索档 tier 的敌人等级：主线末关 + [5,10,20,35,55,80]（项目六档曲线） */
export function exploreEnemyLevel(kingdom: string, tier: number): number {
  const clamped = Math.min(Math.max(tier, 1), EXPLORE_MAX_TIER);
  return questEnemyLevel(kingdom, QUESTS_PER_KINGDOM) + [5, 10, 20, 35, 55, 80][clamped - 1]!;
}

/** 主线 8 关一律 4 人队 */
export const QUEST_TEAM_SIZES = [
  BATTLE_TEAM_SIZE,
  BATTLE_TEAM_SIZE,
  BATTLE_TEAM_SIZE,
  BATTLE_TEAM_SIZE,
  BATTLE_TEAM_SIZE,
  BATTLE_TEAM_SIZE,
  BATTLE_TEAM_SIZE,
  BATTLE_TEAM_SIZE,
] as const;
/** Hard 1~3 + Very Hard 1~3 一律 4 人队 */
export const EXPLORE_TEAM_SIZES = [
  BATTLE_TEAM_SIZE,
  BATTLE_TEAM_SIZE,
  BATTLE_TEAM_SIZE,
  BATTLE_TEAM_SIZE,
  BATTLE_TEAM_SIZE,
  BATTLE_TEAM_SIZE,
] as const;

/**
 * 任务 4/8 关的王国部队奖励（对齐 GoW「王国部队投放」）：从该王国普通卡
 * （无普通卡的王国回退全池）按 id 序取第 1/2 张；8 关没有第二张普通卡时
 * 重复首张——同名卡本来就是升阶/特质资源，不浪费。
 */
export function kingdomQuestRewardTroop(kingdom: string, node: 4 | 8): number | null {
  const pool = POOL_BY_KINGDOM.get(kingdom) ?? [];
  if (pool.length === 0) return null;
  const commons = pool.filter((t) => t.rarityIdx === 0);
  const source = commons.length > 0 ? commons : pool;
  const pick = node === 4 ? source[0] : (source[1] ?? source[0]);
  return pick.id;
}

// ---------------------------------------------------------------------------
// 王国加成 / 解锁门槛（M3）
// ---------------------------------------------------------------------------

/** 王国 10 级绑定属性（计划 §4.5「每王国固定一项」）：按推进序轮转分配（设计值） */
const BONUS_STATS = ['health', 'armor', 'attack', 'magic'] as const;

/** 某王国 10 级时给全体部队 +1 的属性项 */
export function kingdomBonusStat(kingdom: string): (typeof BONUS_STATS)[number] {
  const idx = KINGDOM_ORDER.indexOf(kingdom);
  return BONUS_STATS[Math.max(idx, 0) % BONUS_STATS.length];
}

/**
 * 王国解锁所需冒险者等级：推进序第 n 个王国（0 起）在 Lv.n+1 开放——每升一级开一国，
 * 42 国在 Lv.42 全部开放。
 *
 * 依据：GoW 官方数据（data/raw/gow-2026-09-18/kingdoms.en.json 的 LevelRequired）旧版口径
 * 就是「按等级逐个开放」：破碎尖塔 1 → 阿达纳 8 → 卡拉考斯 9 → 蛛尔卡里 10 → 白盔国 12 …
 * 大部分 25、最后一批 30。本项目推进序与官方顺序基本一致（按最小兵种 id），
 * 等级上限 100 而官方上千，所以压成「一级一国、四十出头全开」。
 * 未知王国按 1 级处理（不因数据缺口把内容锁死）。
 */
export function kingdomUnlockLevel(kingdom: string): number {
  const idx = KINGDOM_ORDER.indexOf(kingdom);
  return idx < 0 ? 1 : idx + 1;
}

/** 冒险者达到 level 时已开放的王国（按推进序） */
export function kingdomsUnlockedAt(level: number): string[] {
  return KINGDOM_ORDER.filter((kingdom) => kingdomUnlockLevel(kingdom) <= level);
}

/** 冒险者从 fromLevel 升到 toLevel 时新开放的王国（结算升级页的「新王国开放」提示） */
export function kingdomsUnlockedBetween(fromLevel: number, toLevel: number): string[] {
  return KINGDOM_ORDER.filter((kingdom) => {
    const need = kingdomUnlockLevel(kingdom);
    return need > fromLevel && need <= toLevel;
  });
}

/** 全部王国开放所需的冒险者等级 */
export const ALL_KINGDOMS_UNLOCK_LEVEL = KINGDOM_ORDER.length;
