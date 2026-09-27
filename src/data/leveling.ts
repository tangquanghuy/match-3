/** Player/hero/sandbox progression (1..100).
 * Imported GoWHead rows use actual per-level gains through 20. Index 0 is level 1;
 * indices 1..19 are increments for levels 2..20. The legacy average shape remains
 * only for heroes and community troops without imported progression.
 * Levels 21..100 retain the project sandbox extension; NPC difficulty is separate
 * in meta/data/enemyDifficulty.ts. Provenance and deviations: docs/GOW-NUMERIC-AUDIT.md.
 */
import type { TroopData } from './troops';
import progressionData from './troop-progression.json';

export interface TroopProgression {
  growth: Record<StatKey, number[]>;
  traits: Record<string, number>[];
}
export const TROOP_PROGRESSION: Readonly<Record<string, TroopProgression>> = progressionData as unknown as Readonly<Record<string, TroopProgression>>;

/** 曲线版本。改动任何锚点或外推节奏都要递增，便于宿主判断数值口径。 */
export const LEVEL_CURVE_VERSION = 2;

export const MIN_LEVEL = 1;
/** 导入逐级表覆盖到这一级；之后走外推段 */
export const OFFICIAL_MAX_LEVEL = 20;
export const MAX_LEVEL = 100;

export interface LeveledStats {
  health: number;
  armor: number;
  attack: number;
  magic: number;
}

export type StatKey = keyof LeveledStats;

/**
 * 1～20 级的归一化累积成长形状，索引 0 = 1 级（0%），索引 19 = 20 级（100%）。
 * 由 `data/raw/troops.gow.zh.json` 里全部兵种的官方增量数组累积归一化后平均得出
 * （生命 n=1792、护甲 n=1766、攻击 n=1780、法强 n=1529）。
 */
export const GROWTH_SHAPE: Readonly<Record<StatKey, readonly number[]>> = {
  health: [
    0, 0.0432, 0.0706, 0.1017, 0.1356, 0.1679, 0.1977, 0.2283, 0.2635, 0.3084,
    0.3507, 0.3835, 0.413, 0.4476, 0.4635, 0.545, 0.6511, 0.7538, 0.8607, 1,
  ],
  armor: [
    0, 0.0223, 0.0597, 0.1058, 0.1465, 0.1776, 0.2057, 0.2446, 0.2925, 0.3413,
    0.3656, 0.4067, 0.4591, 0.4994, 0.5142, 0.5722, 0.6689, 0.7692, 0.8656, 1,
  ],
  attack: [
    0, 0.0329, 0.0708, 0.1048, 0.1413, 0.1712, 0.2112, 0.2476, 0.2542, 0.3386,
    0.3474, 0.3578, 0.3658, 0.3731, 0.4613, 0.5407, 0.6384, 0.7517, 0.8505, 1,
  ],
  magic: [
    0, 0.0054, 0.0183, 0.0597, 0.1187, 0.1296, 0.1747, 0.1845, 0.1887, 0.3216,
    0.3291, 0.3872, 0.3941, 0.4062, 0.5506, 0.6015, 0.6726, 0.7565, 0.8378, 1,
  ],
};

/**
 * 21～100 级的外推节奏：每 `everyLevels` 级增加 `points` 点。
 *
 * 取值理由：生命 0.667/级、护甲 0.5/级、攻击 0.2/级、法强 0.125/级，
 * 沿用项目既有相对节奏（生命最快、法强最慢），并让 100 级生命落在 70～80 的目标区间。
 */
export const EXTENDED_GROWTH: Readonly<Record<StatKey, { points: number; everyLevels: number }>> = {
  health: { points: 2, everyLevels: 3 },
  armor: { points: 1, everyLevels: 2 },
  attack: { points: 1, everyLevels: 5 },
  magic: { points: 1, everyLevels: 8 },
};

/** 把等级夹到合法区间。非整数向下取整。 */
export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_LEVEL;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.floor(level)));
}

/** 外推段（>20 级）相对 20 级的累计增量。 */
function extendedGain(stat: StatKey, level: number): number {
  if (level <= OFFICIAL_MAX_LEVEL) return 0;
  const { points, everyLevels } = EXTENDED_GROWTH[stat];
  const levelsPast = level - OFFICIAL_MAX_LEVEL;
  return Math.floor((levelsPast * points) / everyLevels);
}

/**
 * 单项数值在指定等级的值。
 *
 * @param base 1 级基础值（官方 `*_Base`）
 * @param maxOfficial 20 级满级值（官方顶层字段）
 */
export function statAtLevel(stat: StatKey, base: number, maxOfficial: number, level: number): number {
  const lv = clampLevel(level);
  const anchoredBase = Math.min(base, maxOfficial); // 少数条目 base 缺失记 0，或数据异常时兜住
  if (lv >= OFFICIAL_MAX_LEVEL) {
    return maxOfficial + extendedGain(stat, lv);
  }
  const delta = maxOfficial - anchoredBase;
  const shape = GROWTH_SHAPE[stat][lv - 1];
  return anchoredBase + Math.round(delta * shape);
}

/** 兵种在指定等级的四项战斗数值。 */
export function troopStatsAtLevel(troop: TroopData, level: number): LeveledStats {
  const lv = clampLevel(level);
  const progression = TROOP_PROGRESSION[troop.id];
  const value = (stat: StatKey): number => {
    if (!progression) return statAtLevel(stat, troop.base?.[stat] ?? 0, troop[stat], lv);
    // Index 0 belongs to level 1 (zero); indices 1..19 are actual level-up gains.
    const gain = progression.growth[stat].slice(0, Math.min(lv, OFFICIAL_MAX_LEVEL)).reduce((sum, n) => sum + n, 0);
    return (troop.base?.[stat] ?? 0) + gain + extendedGain(stat, lv);
  };
  return { health: value('health'), armor: value('armor'), attack: value('attack'), magic: value('magic') };
}
