/**
 * 王国元数据首版（M2 最小集）——META-GAME-PLAN.md §4.5 的 kingdoms.ts 落地。
 *
 * 本文件先解决战斗闭环需要的部分：王国定序、敌人基数等级、任务链 8 关的
 * 队伍规模 / 敌人等级 / 奖励部队。地图坐标、主色、纹章、两主色（旗帜）等
 * 视觉与经营字段在 M3 世界地图时补进同一条数据线；id 口径始终 =
 * troops.json 的 `kingdom` 字段（中文王国名），与部队数据零复制。
 */
import { TROOPS, type TroopData } from '../../data/troops';

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
export const KINGDOM_ORDER: readonly string[] = [...POOL_BY_KINGDOM.keys()].sort(
  (a, b) => (MIN_ID_BY_KINGDOM.get(a) as number) - (MIN_ID_BY_KINGDOM.get(b) as number),
);

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

/** 敌人基数等级：1 + 王国序号 × 2，封顶 50（设计值；越靠后解锁的王国越硬） */
export function kingdomBaseLevel(kingdom: string): number {
  const idx = KINGDOM_ORDER.indexOf(kingdom);
  if (idx < 0) return 1;
  return Math.min(1 + idx * 2, 50);
}

/** 任务第 node 关（1 起）的敌人等级：基数 + node - 1 */
export function questEnemyLevel(kingdom: string, node: number): number {
  return kingdomBaseLevel(kingdom) + Math.min(Math.max(node, 1), QUESTS_PER_KINGDOM) - 1;
}

/** 探索难度档 tier（1~5）的敌人等级：基数 + (tier-1)×5 */
export function exploreEnemyLevel(kingdom: string, tier: number): number {
  return kingdomBaseLevel(kingdom) + (Math.min(Math.max(tier, 1), 5) - 1) * 5;
}

/** 任务各关敌人队伍规模（设计值）：1~8 关 → 2/3/3/3/3/4/4/4 */
export const QUEST_TEAM_SIZES = [2, 3, 3, 3, 3, 4, 4, 4] as const;
/** 探索各档队伍规模（设计值）：1~5 档 → 2/3/3/4/4 */
export const EXPLORE_TEAM_SIZES = [2, 3, 3, 4, 4] as const;

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
 * 王国解锁所需主角等级（设计值）：直接复用敌人基数等级表——越靠后的王国
 * 敌人越硬、解锁门槛越高，两张表天然一致，免维护第二份。
 */
export function kingdomUnlockLevel(kingdom: string): number {
  return kingdomBaseLevel(kingdom);
}
