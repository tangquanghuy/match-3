/**
 * 职业数据消费端（主角系统 v2）——classes.json 的类型化读取层。
 *
 * 数据事实源：scripts/build_classes.mjs 从 gowhead 官方 38 职业快照生成
 * （天赋树/专属特质/文案为官方文本，效果编译与别名见该脚本头注）。
 * 本文件只做类型与查表：禁 DOM、禁引擎依赖（meta → data 单向）。
 *
 * 官方口径：冠军等级 1~100（胜场积经验）；解锁门槛见 CLASS_UNLOCK（分五批，用户裁定）；
 * 天赋 7 档（1/5/10/20/40/70/100），每档从 3 棵树中**选 1** 条生效，可随时改配；
 * 职业特质 3 条按槽解锁（本仓库沿用特质槽解锁费用，见 systems/talents.unlockHeroTrait）。
 */
import { clampLevel, type LeveledStats, type StatKey } from '../../data/leveling';
import {
  HARD_NODE_COUNT, KINGDOM_ORDER, QUESTS_PER_KINGDOM, VERY_HARD_NODE_COUNT,
} from './kingdoms';
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

/** 王国 → 职业；42 王国中 38 个有职业 */
export function classByKingdom(kingdom: string): ClassDef | undefined {
  return CLASSES.find((c) => c.kingdom === kingdom);
}

// ---------------------------------------------------------------------------
// 职业解锁门槛（用户裁定 2026-09-29：分五批，不再一律「主线 8 关」）
// ---------------------------------------------------------------------------

/**
 * 解锁条件：
 *  - default   新档即解锁（破碎尖塔／督军，保证一开局就有职业可用）
 *  - quest     通关该王国主线第 N 关（N = 4 或 8）
 *  - hard      通关该王国**困难全 3 关**
 *  - veryHard  通关该王国**非常困难全 3 关**
 */
export type ClassUnlockRule =
  | { kind: 'default' }
  | { kind: 'quest'; nodes: number }
  | { kind: 'hard' }
  | { kind: 'veryHard' };

/** 新档默认解锁并装备的职业所属王国（推进序第一个王国） */
export const STARTER_CLASS_KINGDOM = '破碎尖塔';

/**
 * 按推进序分批的批次容量：默认 1 + 主线 4 关 7 个 + 主线 8 关 10 个 + 困难 10 个 + 非常困难 10 个 = 38。
 * 推进序取 KINGDOM_ORDER 中「有职业」的王国序列，越靠后的王国门槛越高。
 */
const UNLOCK_BATCHES: readonly { count: number; rule: ClassUnlockRule }[] = [
  { count: 1, rule: { kind: 'default' } },
  { count: 7, rule: { kind: 'quest', nodes: 4 } },
  { count: 10, rule: { kind: 'quest', nodes: 8 } },
  { count: 10, rule: { kind: 'hard' } },
  { count: Number.POSITIVE_INFINITY, rule: { kind: 'veryHard' } },
];

/** 有职业的王国按推进序（破碎尖塔在首位，与 KINGDOM_ORDER 同源） */
export const CLASS_KINGDOM_ORDER: readonly string[] = (() => {
  const withClass = KINGDOM_ORDER.filter((k) => CLASSES.some((c) => c.kingdom === k));
  // 起始职业王国强制置首：KINGDOM_ORDER 的排序依据将来若变，这条裁定不受影响
  return [STARTER_CLASS_KINGDOM, ...withClass.filter((k) => k !== STARTER_CLASS_KINGDOM)]
    .filter((k) => withClass.includes(k));
})();

/** classId → 解锁条件（单一事实源；结算解锁与界面文案都读它） */
export const CLASS_UNLOCK: Readonly<Record<string, ClassUnlockRule>> = (() => {
  const out: Record<string, ClassUnlockRule> = {};
  let index = 0;
  let batch = 0;
  let taken = 0;
  for (const kingdom of CLASS_KINGDOM_ORDER) {
    while (batch < UNLOCK_BATCHES.length - 1 && taken >= UNLOCK_BATCHES[batch]!.count) {
      batch += 1;
      taken = 0;
    }
    const cls = CLASSES.find((c) => c.kingdom === kingdom);
    if (cls) out[cls.id] = UNLOCK_BATCHES[batch]!.rule;
    taken += 1;
    index += 1;
  }
  void index;
  return out;
})();

/** 新档默认解锁的职业 id（破碎尖塔／督军） */
export const STARTER_CLASS_ID: string = CLASSES.find((c) => c.kingdom === STARTER_CLASS_KINGDOM)?.id ?? CLASSES[0]!.id;

export function classUnlockRule(classId: string): ClassUnlockRule {
  return CLASS_UNLOCK[classId] ?? { kind: 'quest', nodes: QUESTS_PER_KINGDOM };
}

/** 解锁条件的玩家可读文案（职业圣殿、提示 toast 共用） */
export function classUnlockText(classId: string): string {
  const rule = classUnlockRule(classId);
  const kingdom = classById(classId)?.kingdom ?? '';
  switch (rule.kind) {
    case 'default': return '初始职业 · 无需解锁';
    case 'quest': return `通关${kingdom}主线 ${rule.nodes} 关`;
    case 'hard': return `通关${kingdom}困难 ${HARD_NODE_COUNT} 关`;
    case 'veryHard': return `通关${kingdom}非常困难 ${VERY_HARD_NODE_COUNT} 关`;
  }
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

/**
 * 主角等级的属性点表（2026-09-29 重做，官方口径）。
 *
 * 官方结构是「职业给基底 + 等级只加少量属性点」，而不是像兵种那样按 1→20 曲线膨胀：
 *  - 官方开发者 Sirrian（2016-11 主角加强公告）：额外属性点在固定等级发放——
 *    攻击 55/110/190，护甲 75/95/130/160/225，生命 65/85/120/140/180，魔法 170/250；
 *    并明确「这会让 200 级主角的属性点大致和一张神话卡相当」。
 *  - 社区实测（50 级后的旧档位）：魔法 50/100/500，生命 60/90/200/750，
 *    护甲 70/150/400，攻击 80/300/1000。
 *  合并去重后官方 50→200 级总共只加 21 点（生命 8 / 护甲 6 / 攻击 4 / 魔法 3）。
 *
 * 本项目等级上限 100（官方 1000），用户裁定「**100 级对齐官方 200 级**」，故按 2:1 压缩：
 * 本项目 Lv100 ← 官方 Lv200、Lv50 ← 官方 Lv100、Lv25 ← 官方 Lv50。
 * 25 级以上的档位 = 上述官方等级 ÷2；1~24 级官方未公布逐级表，按官方形状
 * （前段快、过 25 级后极平缓）与两个锚点反推：Lv25 ≈ 官方 Lv50 的 ~70 点、
 * Lv100 ≈ 神话卡 ~90 点。各项配比沿用官方 50→200 的 8:6:4:3。
 *
 * 表内是「在该等级获得 +1」的等级清单，因此四维恒为整数（不做插值取整）。
 */
const HERO_LEVEL_GAIN_AT: Readonly<Record<StatKey, readonly number[]>> = {
  // 1~24 设计段 15 点 + 官方段（30/33/43/45/60/70/90/100 ← 官方 60/65/85/90/120/140/180/200）8 点 = 23
  health: [2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 15, 17, 19, 21, 23, 30, 33, 43, 45, 60, 70, 90, 100],
  // 1~24 设计段 11 点 + 官方段（35/38/48/65/75/80 ← 官方 70/75/95/130/150/160）6 点 = 17
  armor: [3, 5, 7, 9, 11, 13, 16, 18, 20, 22, 24, 35, 38, 48, 65, 75, 80],
  // 1~24 设计段 7 点 + 官方段（28/40/55/95 ← 官方 55/80/110/190）4 点 = 11
  attack: [4, 7, 10, 13, 16, 20, 23, 28, 40, 55, 95],
  // 1~24 设计段 6 点 + 官方段（25/50/85 ← 官方 50/100/170）3 点 = 9
  magic: [6, 9, 12, 15, 19, 22, 25, 50, 85],
};

/** 主角等级带来的属性点（1 级为 0；不含职业基底与淬炼）。 */
export function heroLevelGain(level: number): LeveledStats {
  const lv = clampLevel(level);
  const count = (stat: StatKey): number => HERO_LEVEL_GAIN_AT[stat].reduce((n, at) => n + (at <= lv ? 1 : 0), 0);
  return { health: count('health'), armor: count('armor'), attack: count('attack'), magic: count('magic') };
}

/**
 * 无职业时的主角基底（38 职业四维合计 25~34、均值 30.6，这里取个偏下的中位形态）。
 * 新档默认解锁并装备破碎尖塔职业，正常流程不会走到这里；只兜住「职业被清空」的旧档。
 */
export const HERO_BASE_WITHOUT_CLASS: Readonly<LeveledStats> = { health: 12, armor: 9, attack: 6, magic: 0 };

/** 主角在指定等级、指定职业下的四维（职业基底 + 等级属性点；不含淬炼/王国/天赋）。 */
export function heroStatsAt(level: number, classId?: string | null): LeveledStats {
  const base = (classId ? classById(classId)?.baseStats : undefined) ?? HERO_BASE_WITHOUT_CLASS;
  const gain = heroLevelGain(level);
  return {
    health: base.health + gain.health,
    armor: base.armor + gain.armor,
    attack: base.attack + gain.attack,
    magic: base.magic + gain.magic,
  };
}

/**
 * 主角每级的「目标场数」：按同级内容打一场胜利大约能拿多少经验来反推升级门槛。
 *  - 1~10 级：0.45 → 1.85 场（首胜即升 2 级门槛；新手期几乎一场一级，王国一级开一个）
 *  - 10~50 级：1.85 → 7 场（平缓爬升；Lv.42 全部王国开放）
 *  - 50 级以后：每级 +0.36 场，到 99 级约 25 场（长线养成期）
 * GoW 官方未公布主角经验表；社区观察是「需求按等级线性增长、每场经验基本恒定」，
 * 所以前期快、后期慢。本项目等级上限 100，按上面三段压缩。
 */
function heroBattlesPerLevel(level: number): number {
  const lv = Math.max(1, level);
  if (lv <= 10) return 0.45 + 0.155 * (lv - 1);
  if (lv <= 50) return 1.85 + 0.13 * (lv - 10);
  return 7.05 + 0.36 * (lv - 50);
}

/** 同级主线一场胜利的参考经验：4 名敌人 ×（等级×10 + 稀有度加成）+ 胜利 40 + 主角 60 */
function heroReferenceBattleXp(level: number): number {
  return 40 * Math.max(1, level) + 180;
}

/** 主角升到下一级所需经验（设计值：目标场数 × 同级一场经验，就近取 10） */
export function heroXpToNext(level: number): number {
  const raw = heroBattlesPerLevel(level) * heroReferenceBattleXp(level);
  return Math.max(10, Math.round(raw / 10) * 10);
}

/** 从 1 级升到 level 级累计所需经验（经验曲线说明 / 测试用） */
export function heroXpTotalTo(level: number): number {
  let total = 0;
  for (let lv = 1; lv < Math.max(1, Math.floor(level)); lv++) total += heroXpToNext(lv);
  return total;
}
