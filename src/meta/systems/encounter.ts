/**
 * 出敌生成器（M2）——主线 8 关 / Hard 3 关 / Very Hard 3 关的敌队计划。
 *
 * 纯函数 + 种子化 RNG（engine/rng 的 mulberry32）：同 seed 必出同一份计划，
 * 与会话层「同 seed 复现同一场战斗」的口径衔接。
 *
 * 分层规则（设计值）：
 *  - 任务 1~3 关：杂兵群；4~6 关：精英带队；7~8 关：精英群 + 首领压阵；
 *  - Hard 1~2 杂兵、Hard 3 / Very Hard 1 精英带队、Very Hard 2~3 精英 + 首领；
 *  - 按稀有度带选人（杂兵 0~2 / 精英 2~4 / 首领 4~5），池内无货时逐档放宽
 *    （少数王国缺高稀有度内容，不因缺卡而无敌可出）。
 */
import { enemyLevel, enemyTraitCount } from '../data/enemyDifficulty';
import { SeededRNG } from '../../engine/rng';
import {
  BATTLE_TEAM_SIZE,
  EXPLORE_MAX_TIER,
  EXPLORE_TEAM_SIZES,
  exploreEnemyLevel,
  kingdomTroopPool,
  QUESTS_PER_KINGDOM,
  QUEST_TEAM_SIZES,
  questEnemyLevel,
} from '../data/kingdoms';
import type { MetaSave } from '../state/schema';

export type EnemyTier = 'minion' | 'elite' | 'boss';

export interface EncounterEnemy {
  troopId: number;
  level: number;
  tier: EnemyTier;
  /** Explicit training policy; omitted legacy plans use level-based NPC defaults. */
  traitCount?: number;
  /** Encounter-only base-stat boost; does not unlock extra traits or change mana costs. */
  statMultiplier?: number;
}

export type EncounterSource =
  | { kind: 'quest'; node: number }
  | { kind: 'explore'; tier: number }
  /** 每周活动战斗（素材批 2026-09-19）：weekStart 锚定活动周实例，typeId 定主题 */
  | { kind: 'event'; weekStart: number; typeId: string; choice?: string; matchingTroops?: number; bossStartHp?: number };

export interface EncounterPlan {
  kingdom: string;
  source: EncounterSource;
  seed: number;
  enemies: EncounterEnemy[];
}

/** 任务链线性推进：只能打「下一关」（重打刷材料走探索模式） */
export function questNodeUnlocked(save: MetaSave, kingdom: string, node: number): boolean {
  if (!Number.isInteger(node) || node < 1 || node > QUESTS_PER_KINGDOM) return false;
  const done = save.kingdoms[kingdom]?.questsDone ?? 0;
  return node === done + 1;
}

/** 下一个可打的任务关（全链通关后返回 null） */
export function nextQuestNode(save: MetaSave, kingdom: string): number | null {
  const done = save.kingdoms[kingdom]?.questsDone ?? 0;
  return done < QUESTS_PER_KINGDOM ? done + 1 : null;
}

const BAND_BY_TIER: Record<EnemyTier, { min: number; max: number }> = {
  minion: { min: 0, max: 2 },
  elite: { min: 2, max: 4 },
  boss: { min: 4, max: 5 },
};

function squad(lead: EnemyTier, rest: EnemyTier, last?: EnemyTier): EnemyTier[] {
  const size = BATTLE_TEAM_SIZE;
  const mid = Array.from({ length: size - (last ? 2 : 1) }, () => rest);
  return last ? [lead, ...mid, last] : [lead, ...mid];
}

function questTierPlan(node: number): EnemyTier[] {
  const size = QUEST_TEAM_SIZES[node - 1] ?? BATTLE_TEAM_SIZE;
  if (node <= 3) return Array.from({ length: size }, () => 'minion' as const);
  if (node <= 6) return squad('elite', 'minion');
  return squad('elite', 'elite', 'boss');
}

function exploreTierPlan(tier: number): EnemyTier[] {
  const size = EXPLORE_TEAM_SIZES[tier - 1] ?? BATTLE_TEAM_SIZE;
  if (tier <= 2) return Array.from({ length: size }, () => 'minion' as const);
  if (tier <= 4) return squad('elite', 'minion');
  return squad('elite', 'elite', 'boss');
}

/** 按层级表从王国池选人（稀有度带逐档放宽）；供 encounter 与竞技场对手共用 */
export function pickEnemies(
  kingdom: string,
  level: number,
  tiers: readonly EnemyTier[],
  rng: SeededRNG,
): EncounterEnemy[] {
  const chosen = new Set<number>();
  return tiers.map((tier) => {
    const band = BAND_BY_TIER[tier];
    let min = band.min;
    let max = band.max;
    let pool = kingdomTroopPool(kingdom, { min, max }).filter((t) => !chosen.has(t.id));
    while (pool.length === 0 && (min > 0 || max < 5)) {
      min = Math.max(0, min - 1);
      max = Math.min(5, max + 1);
      pool = kingdomTroopPool(kingdom, { min, max }).filter((t) => !chosen.has(t.id));
    }
    const troop = pool[rng.nextInt(pool.length)];
    chosen.add(troop.id);
    return { troopId: troop.id, level: enemyLevel(level), tier, traitCount: enemyTraitCount(level) };
  });
}

/** 任务关出敌。node 越界抛 RangeError；是否可打由 questNodeUnlocked 校验（屏层先查再调）。 */
export function planQuestEncounter(kingdom: string, node: number, seed: number): EncounterPlan {
  if (!Number.isInteger(node) || node < 1 || node > QUESTS_PER_KINGDOM) {
    throw new RangeError(`任务关越界: ${node}`);
  }
  return {
    kingdom,
    source: { kind: 'quest', node },
    seed: seed >>> 0,
    enemies: pickEnemies(kingdom, questEnemyLevel(kingdom, node), questTierPlan(node), new SeededRNG(seed)),
  };
}

/** 探索出敌。tier 1~6（Hard 1~3 + Very Hard 1~3），越界抛 RangeError。 */
export function planExploreEncounter(kingdom: string, tier: number, seed: number): EncounterPlan {
  if (!Number.isInteger(tier) || tier < 1 || tier > EXPLORE_MAX_TIER) {
    throw new RangeError(`探索档越界: ${tier}`);
  }
  return {
    kingdom,
    source: { kind: 'explore', tier },
    seed: seed >>> 0,
    enemies: pickEnemies(kingdom, exploreEnemyLevel(kingdom, tier), exploreTierPlan(tier), new SeededRNG(seed)),
  };
}
