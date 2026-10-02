/** Seeded main-story encounters and fixed 4 + 1 + 1 kingdom Explore teams. */
import { isImmortal } from '../../data/immortals';
import { TROOPS, getTroopById, type TroopData } from '../../data/troops';
import { enemyLevel, enemyTraitCount } from '../data/enemyDifficulty';
import { ROLE_COMP_CHANCE, ROLE_COMPS, roleSlotAccepts, type CompSlot } from '../data/roleComps';
import { troopStrategy } from '../data/troopStrategy';
import { SeededRNG } from '../../engine/rng';
import {
  BATTLE_TEAM_SIZE,
  EXPLORE_MAX_TIER,
  exploreEnemyLevel,
  kingdomTroopPool,
  QUESTS_PER_KINGDOM,
  QUEST_TEAM_SIZES,
  questEnemyLevel,
  questEnemyTraitCount,
} from '../data/kingdoms';
import type { MetaSave } from '../state/schema';
import type { BattleBonusSpec } from './battleBonus';

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
  /** tutorial = 新手引导试炼战（按起始王国第 1 关结算，敌人削弱） */
  | { kind: 'quest'; node: number; tutorial?: boolean }
  | { kind: 'explore'; tier: number; stage?: number; runId?: string }
  /** 每周活动战斗（素材批 2026-09-19）：weekStart 锚定活动周实例，typeId 定主题 */
  | { kind: 'event'; weekStart: number; typeId: string; choice?: string; matchingTroops?: number; bossStartHp?: number; topTier?: boolean };

export interface EncounterPlan {
  kingdom: string;
  source: EncounterSource;
  seed: number;
  enemies: EncounterEnemy[];
  /** 通用额外奖励声明（battleBonus.ts）；结算统一发放，结算页并列展示 */
  bonus?: BattleBonusSpec[];
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

/** 档内稀有度加权：t = clamp(level/60)，n = 档内归一化位次，w = exp(−1.6·(n−t)²)。
 *  钟形峰值随进度移动：早期关卡偏带内低稀有度、后期偏带内高稀有度；单稀有度池退化为均匀。 */
function pickByRarityWeight<T extends { rarityIdx: number }>(
  rng: SeededRNG,
  pool: readonly T[],
  min: number,
  max: number,
  level: number,
): T {
  if (pool.length === 1) return pool[0]!;
  const t = Math.max(0, Math.min(1, level / 60));
  const span = max - min;
  const weights = pool.map((troop) => (span === 0 ? 1 : Math.exp(-1.6 * ((troop.rarityIdx - min) / span - t) ** 2)));
  let roll = rng.next() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < pool.length; i += 1) {
    roll -= weights[i]!;
    if (roll <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

/** 掷一次职责模板：≥3 槽的队伍半数成阵（偏好约束，槽位无合格者时调用方自行退回原池）。 */
function rollRoleComp(rng: SeededRNG, slotCount: number) {
  if (slotCount < 3 || rng.next() >= ROLE_COMP_CHANCE) return null;
  return ROLE_COMPS[rng.nextInt(ROLE_COMPS.length)] ?? null;
}

/** 纯墙：0 攻击且技能无任何输出——可以当肉盾，但一队多面会锁死战斗节奏（叠甲互锁教训）。 */
const isPureWall = (t: TroopData): boolean =>
  t.attack === 0 && !troopStrategy(t.id).damage && !troopStrategy(t.id).skulls;

/**
 * 槽位资格筛选：官方卡不是单一职责，槽位看「卡实际会做什么」而非定位标签。
 * 职责（duty）先按技能文本/相对坦度筛出合格者，官方 role 只在合格者内作风味偏好；
 * 每层筛空都整层回落，绝不因筛选缺员。纯墙每队至多一面（墙已上过则剔除纯墙候选）。
 */
function qualifySlot(pool: readonly TroopData[], slot: CompSlot | undefined, wallUsed: boolean): readonly TroopData[] {
  let out = pool;
  if (slot) {
    if (slot.duty === 'front') {
      // 池内相对坦度：护甲+生命不低于中位数（Rowanne 型护甲输出也算合格前排）
      const bulk = pool.map((t) => t.armor + t.health).sort((a, b) => a - b);
      const mid = bulk[Math.floor(bulk.length / 2)] ?? 0;
      const fronts = pool.filter((t) => t.armor + t.health >= mid);
      if (fronts.length) out = fronts;
    } else if (slot.duty === 'damage') {
      const strikers = pool.filter((t) => {
        const p = troopStrategy(t.id);
        return p.damage || p.skulls;
      });
      if (strikers.length) out = strikers;
    } else if (slot.duty === 'mana') {
      const feeders = pool.filter((t) => troopStrategy(t.id).generator);
      if (feeders.length) out = feeders;
    } else if (slot.duty === 'sustain') {
      const medics = pool.filter((t) => {
        const p = troopStrategy(t.id);
        return p.support || p.armorSupport;
      });
      if (medics.length) out = medics;
    }
    const flavored = out.filter((t) => roleSlotAccepts(slot.roles, t.role));
    if (flavored.length) out = flavored;
  }
  if (wallUsed) {
    const noWall = out.filter((t) => !isPureWall(t));
    if (noWall.length) out = noWall;
  }
  return out;
}

/** 域外随机敌人统一排除不朽；王国稀有度带逐档放宽，活动与主线共用。 */
export function pickEnemies(
  kingdom: string,
  level: number,
  tiers: readonly EnemyTier[],
  rng: SeededRNG,
): EncounterEnemy[] {
  const chosen = new Set<number>();
  if (!kingdomTroopPool(kingdom).length) throw new RangeError(`王国不存在: ${kingdom}`);
  const eligible = (t: (typeof TROOPS)[number]): boolean => !chosen.has(t.id) && !isImmortal(t);
  const comp = rollRoleComp(rng, tiers.length);
  let wallUsed = false;
  return tiers.map((tier, slot) => {
    const band = BAND_BY_TIER[tier];
    let min = band.min;
    let max = band.max;
    let pool = qualifySlot(kingdomTroopPool(kingdom, { min, max }).filter(eligible), comp?.slots[slot], wallUsed);
    while (pool.length === 0 && (min > 0 || max < 5)) {
      min = Math.max(0, min - 1);
      max = Math.min(5, max + 1);
      pool = qualifySlot(kingdomTroopPool(kingdom, { min, max }).filter(eligible), comp?.slots[slot], wallUsed);
    }
    // Preserve exclusions even when the local rarity bands are exhausted.
    if (!pool.length) pool = TROOPS.filter(t => eligible(t) && !isImmortal(t) && t.rarityIdx >= band.min && t.rarityIdx <= band.max);
    const troop = pickByRarityWeight(rng, pool, min, max, level);
    chosen.add(troop.id);
    if (isPureWall(troop)) wallUsed = true;
    return { troopId: troop.id, level: enemyLevel(level), tier, traitCount: enemyTraitCount(level) };
  });
}

/** 新手试炼固定队序：堡垒大门、食人魔、火枪手、女祭司；Lv.3、无特质。 */
export const TUTORIAL_ENEMY_IDS = [6097, 6000, 6004, 6028] as const;
export function planTutorialEncounter(kingdom: string, seed: number): EncounterPlan {
  return {
    kingdom,
    source: { kind: 'quest', node: 1, tutorial: true },
    seed: seed >>> 0,
    enemies: TUTORIAL_ENEMY_IDS.map((troopId) => ({ troopId, level: 3, tier: 'minion', traitCount: 0 })),
  };
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
    enemies: pickEnemies(kingdom, questEnemyLevel(kingdom, node), questTierPlan(node), new SeededRNG(seed))
      .map(enemy => ({ ...enemy, traitCount: questEnemyTraitCount(kingdom, node) })),
  };
}

/** Four regular teams (base rarity <= Epic), one Legendary mini-boss, one Mythic boss.
 * Project names map official Epic -> 传说(idx3), Legendary -> 史诗(idx4).
 * Kingdoms without the required boss rarity use their strongest eligible local troop.
 * Event-only pseudo-kingdoms without regular troops use global low-rarity fillers.
 */
export function planExploreEncounter(kingdom: string, tier: number, seed: number, stage = 0, runId?: string): EncounterPlan {
  if (!Number.isInteger(tier) || tier < 1 || tier > EXPLORE_MAX_TIER) throw new RangeError(`探索档越界: ${tier}`);
  if (!Number.isInteger(stage) || stage < 0 || stage > 5) throw new RangeError(`探索阶段越界: ${stage}`);
  const rng = new SeededRNG(seed);
  const kingdomPool = kingdomTroopPool(kingdom);
  if (!kingdomPool.length) throw new RangeError(`王国不存在: ${kingdom}`);
  const all = kingdomPool.filter(t => !isImmortal(t));
  const chosen = new Set<number>();
  const level = exploreEnemyLevel(kingdom, tier);
  const comp = rollRoleComp(rng, BATTLE_TEAM_SIZE);
  let wallUsed = false;
  const enemies: EncounterEnemy[] = [];
  for (let slot = 0; slot < BATTLE_TEAM_SIZE; slot++) {
    const boss = stage >= 4 && slot === 0;
    const max = boss ? (stage === 4 ? 4 : 5) : 3;
    // boss 槽按阶段锁稀有度（===4 / ===5），不吃职责资格，保持首领身份优先
    let pool = boss
      ? all.filter(t => !chosen.has(t.id) && t.rarityIdx === max)
      : qualifySlot(all.filter(t => !chosen.has(t.id) && t.rarityIdx <= max), comp?.slots[slot], wallUsed);
    if (!pool.length) {
      const eligible = all.filter(t => !chosen.has(t.id) && t.rarityIdx <= max);
      const best = Math.max(...eligible.map(t => t.rarityIdx));
      pool = boss ? eligible.filter(t => t.rarityIdx === best) : eligible;
    }
    // Tiny kingdoms may repeat eligible troops, never introduce a second Mythic boss.
    if (!pool.length) pool = all.filter(t => t.rarityIdx <= (boss ? max : 3));
    // Event pseudo-kingdoms may have no regular troops: use global low-rarity fillers.
    if (!pool.length) pool = TROOPS.filter(t => !isImmortal(t) && t.rarityIdx <= max && !chosen.has(t.id));
    const troop = pickByRarityWeight(rng, pool, 0, max, level);
    chosen.add(troop.id);
    if (isPureWall(troop)) wallUsed = true;
    enemies.push({ troopId: troop.id, level, tier: boss ? 'boss' : troop.rarityIdx >= 2 ? 'elite' : 'minion', traitCount: enemyTraitCount(level) });
  }
  return { kingdom, source: { kind: 'explore', tier, stage, ...(runId ? { runId } : {}) }, seed: seed >>> 0, enemies };
}


/** Repair only forbidden members of old generated event rosters, without resetting progress. */
export function repairLegacyRandomEnemyRoster(ids: readonly number[], seed: number): number[] {
  const rng = new SeededRNG(seed);
  const chosen = new Set(ids.filter(id => !isImmortal(getTroopById(id))));
  return ids.map(id => {
    const troop = getTroopById(id);
    if (!troop || !isImmortal(troop)) return id;
    const eligible = TROOPS.filter(t => !isImmortal(t) && !chosen.has(t.id));
    const local = eligible.filter(t => t.kingdom === troop.kingdom);
    let pool = local.filter(t => t.rarityIdx === troop.rarityIdx);
    if (!pool.length) pool = eligible.filter(t => t.rarityIdx === troop.rarityIdx);
    if (!pool.length) pool = local.length ? local : eligible;
    const replacement = pool[rng.nextInt(pool.length)]!.id;
    chosen.add(replacement);
    return replacement;
  });
}
