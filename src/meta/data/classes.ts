/**
 * 职业数据消费端（主角系统 v2）——classes.json 的类型化读取层。
 *
 * 数据事实源：scripts/build_classes.mjs 从 gowhead 官方 38 职业快照生成
 * （天赋树/专属特质/文案为官方文本，效果编译与别名见该脚本头注）。
 * 本文件只做类型与查表：禁 DOM、禁引擎依赖（meta → data 单向）。
 *
 * 官方口径：解锁 = 通关所属王国任务链；冠军等级 1~100（胜场积经验）；
 * 天赋 7 档（1/5/10/20/40/70/100），每档从 3 棵树中**选 1** 条生效，可随时改配；
 * 职业特质 3 条按槽解锁（本仓库沿用特质槽解锁费用，见 systems/talents.unlockHeroTrait）。
 */
import { statAtLevel, type LeveledStats, type StatKey } from '../../data/leveling';
import classesJson from './classes.json';

export const CHAMPION_TIERS = classesJson.championTiers as unknown as readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** 冠军等级上限（官方 100，最后一档天赋随之解锁） */
export const CLASS_MAX_LEVEL = 100;

/** 天赋效果编译（生成器裁定，运行期按 kind 消费） */
export type TalentEffect =
  | { kind: 'selfStat'; stat: 'attack' | 'armor' | 'health' | 'magic'; amount: number }
  | { kind: 'selfStatIfPosition'; position: 'first' | 'last'; stat: 'attack' | 'armor' | 'health' | 'magic' | 'all'; amount: number }
  | { kind: 'selfStatIfWeapon'; weaponType: string; stat: 'attack' | 'armor' | 'health' | 'magic'; amount: number }
  | { kind: 'selfStatPerAlly'; troopType: string; stat: 'attack' | 'armor' | 'health' | 'magic'; amount: number }
  | { kind: 'alliesStat'; scope: { kind: 'all' } | { kind: 'color'; color: string } | { kind: 'type'; troopType: string }; stats: Partial<Record<'attack' | 'armor' | 'health' | 'magic', number>> }
  | { kind: 'xpBonus'; pct: number }
  | { kind: 'pvp' }
  | { kind: 'trait'; code: string }
  | { kind: 'unimplemented' };

export interface TalentDef {
  code: string;
  /** 官方英文名 */
  name: string;
  /** 仓库存口径中文名 */
  nameZh: string;
  description: string;
  descriptionZh: string;
  effect: TalentEffect;
}

export interface TalentTreeDef {
  name: string;
  nameZh: string;
  /** 恰好 7 条，下标即天赋档位（0..6 ↔ CHAMPION_TIERS） */
  talents: TalentDef[];
}

export interface ClassPerkDef extends TalentDef {
  /** code 在引擎已实现特质集合（traits.json / TRAIT_LIBRARY）内 */
  implemented: boolean;
}

export interface ClassDef {
  id: string;
  name: string;
  nameEn: string;
  /** 解锁王国（troops.json 中文王国名；通关该王国任务链 8 关解锁职业） */
  kingdom: string;
  /** 主角装备该职业后采纳的兵种类型（无字面证据的为 Human） */
  troopType: string;
  baseStats: { attack: number; armor: number; health: number; magic: number };
  trees: TalentTreeDef[];
  perks: ClassPerkDef[];
}

export const CLASSES: readonly ClassDef[] = classesJson.classes as unknown as ClassDef[];

export function classById(id: string): ClassDef | undefined {
  return CLASSES.find((c) => c.id === id);
}

/** 王国 → 职业（任务链全通解锁）；42 王国中 38 个有职业 */
export function classByKingdom(kingdom: string): ClassDef | undefined {
  return CLASSES.find((c) => c.kingdom === kingdom);
}

/** 职业升到下一级所需冠军经验（设计值：100 + 50×等级，沿 M5 曲线） */
export function classXpToNext(level: number): number {
  return 100 + 50 * Math.max(level, 1);
}

/** 天赋档位下标（0 起）是否已按冠军等级解锁 */
export function tierUnlocked(championLevel: number, tierIndex: number): boolean {
  const tier = CHAMPION_TIERS[tierIndex];
  return tier !== undefined && championLevel >= tier;
}

/** 当前冠军等级可用的天赋档数（0~7） */
export function unlockedTierCount(championLevel: number): number {
  return CHAMPION_TIERS.filter((t) => championLevel >= t).length;
}

// ---------------------------------------------------------------------------
// 主角自身等级（M5 沿用：官方主角等级与冠军等级是两条线）
// ---------------------------------------------------------------------------

/** 主角四维锚点（设计值）：base = 1 级，max = 20 级 */
export const HERO_STAT_ANCHORS: Record<StatKey, { base: number; max: number }> = {
  health: { base: 20, max: 62 },
  armor: { base: 8, max: 24 },
  attack: { base: 6, max: 15 },
  magic: { base: 10, max: 27 },
};

/** 主角指定等级的四维（含 20 级后的外推段） */
export function heroStatsAt(level: number): LeveledStats {
  return {
    health: statAtLevel('health', HERO_STAT_ANCHORS.health.base, HERO_STAT_ANCHORS.health.max, level),
    armor: statAtLevel('armor', HERO_STAT_ANCHORS.armor.base, HERO_STAT_ANCHORS.armor.max, level),
    attack: statAtLevel('attack', HERO_STAT_ANCHORS.attack.base, HERO_STAT_ANCHORS.attack.max, level),
    magic: statAtLevel('magic', HERO_STAT_ANCHORS.magic.base, HERO_STAT_ANCHORS.magic.max, level),
  };
}

/** 主角升到下一级所需经验（设计值：80×等级^1.35，就近取 10） */
export function heroXpToNext(level: number): number {
  return Math.max(10, Math.round((80 * Math.pow(Math.max(level, 1), 1.35)) / 10) * 10);
}
