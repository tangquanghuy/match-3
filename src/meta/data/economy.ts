/**
 * Meta 数值单源（设计值）——META-GAME-PLAN.md §4.1/§4.2 的落地常量。
 *
 * 官方口径（对齐 GoW，页面文案不得写错）：
 *  - 部队等级上限按基础稀有度：15/16/17/18/19/20（rarityIdx 0..5，升阶提档即提高上限）；
 *  - 升阶同名卡 5/10/25 张（不耗本体，即持有 6/11/26 张起可升）；
 *  - 灵魂成本按**基础稀有度**与目标等级查表，升阶不改成本表；
 *  - 特质解锁（裁定②简化版）：特质1=黄金+灵魂；特质2=特质1 代价×5+同名卡2；特质3=更高额黄金+同名卡5。
 *
 * 其余数字为设计值（首版宁紧勿松）：调经济节奏只改本文件；
 * 概率公示等玩家可见文案必须从这里派生，禁止两处硬编码。
 */
import { TROOPS } from '../../data/troops';

/** 稀有度档位顺序（与 troops.json 的 rarityIdx 严格一致，勿改动顺序） */
export const RARITY_ORDER = [
  'Common',
  'Uncommon',
  'Rare',
  'UltraRare',
  'Epic',
  'Legendary',
] as const;

/** 部队等级上限按稀有度档（idx 0..5） */
export const LEVEL_CAP_BY_RARITY = [15, 16, 17, 18, 19, 20] as const;

/** 升阶上限（三阶） */
export const MAX_ASCENSION = 3;
/** 升阶所需同名卡（不含本体）：一阶 5 / 二阶 10 / 三阶 25 */
export const ASCENSION_COPIES = [5, 10, 25] as const;

/**
 * 当前稀有度档的等级上限。
 * 档位 = 基础 rarityIdx + 升阶数，封顶到表尾（ Legendary 升阶不再提上限，仍可升阶保留星标语义）。
 */
export function levelCapFor(rarityIdx: number, ascension: number): number {
  const tier = Math.min(
    Math.max(Math.floor(rarityIdx), 0) + Math.max(Math.floor(ascension), 0),
    LEVEL_CAP_BY_RARITY.length - 1,
  );
  return LEVEL_CAP_BY_RARITY[tier];
}

/** 升到第 ascension+1 阶所需同名卡数量（不含本体）：5/10/25 */
export function ascensionCopiesNeeded(ascension: number): number {
  if (ascension < 0 || ascension >= MAX_ASCENSION) {
    throw new RangeError(`ascension 越界: ${ascension}`);
  }
  return ASCENSION_COPIES[ascension];
}

/**
 * 灵魂成本曲线（设计值）：升到 targetLevel 级消耗 base[idx] × (targetLevel-1)^1.25，就近取 5。
 * 查表用**基础稀有度**（升阶不抬成本，对齐官方）。
 */
const SOUL_COST_BASE = [30, 60, 120, 240, 480, 960] as const;

export function soulCostForLevel(rarityIdx: number, targetLevel: number): number {
  const idx = Math.min(Math.max(Math.floor(rarityIdx), 0), SOUL_COST_BASE.length - 1);
  const lv = Math.min(Math.max(Math.floor(targetLevel), 2), LEVEL_CAP_BY_RARITY[LEVEL_CAP_BY_RARITY.length - 1]);
  const raw = SOUL_COST_BASE[idx] * Math.pow(lv - 1, 1.25);
  return Math.max(5, Math.round(raw / 5) * 5);
}

/** 从 fromLevel 升到 toLevel 的灵魂总消耗（逐级求和，fromLevel < toLevel 才有意义） */
export function totalSoulCost(rarityIdx: number, fromLevel: number, toLevel: number): number {
  let sum = 0;
  for (let lv = Math.max(fromLevel, 1) + 1; lv <= toLevel; lv++) {
    sum += soulCostForLevel(rarityIdx, lv);
  }
  return sum;
}

/** 特质槽位数（GoW 每部队 3 槽） */
export const TRAIT_SLOT_COUNT = 3;
/** 特质 1 的基准代价（黄金+灵魂）；特质 2 = ×5 + 同名卡 2；特质 3 = 更高额黄金（×10）+ 同名卡 5（灵魂维持 ×5） */
export const TRAIT_UNLOCK_BASE = { gold: 2000, souls: 500 } as const;
/** 各特质槽所需同名卡（不含本体） */
export const TRAIT_SLOT_COPIES = [0, 2, 5] as const;

export interface TraitUnlockCost {
  gold: number;
  souls: number;
  copies: number;
}

/** 解锁第 slot（1 起）个特质的代价 */
export function traitUnlockCost(slot: number): TraitUnlockCost {
  if (slot < 1 || slot > TRAIT_SLOT_COUNT) {
    throw new RangeError(`特质槽位越界: ${slot}`);
  }
  const mult = slot === 1 ? 1 : 5;
  const goldMult = slot === 3 ? 10 : mult;
  return {
    gold: TRAIT_UNLOCK_BASE.gold * goldMult,
    souls: TRAIT_UNLOCK_BASE.souls * mult,
    copies: TRAIT_SLOT_COPIES[slot - 1],
  };
}

/** 分解多余卡收益（设计值，按基础稀有度档）：只拆 copies（本体不拆），不回收已投入养成 */
export const DECOMPOSE_GOLD = [25, 50, 100, 200, 400, 800] as const;
export const DECOMPOSE_SOULS = [5, 10, 20, 40, 80, 160] as const;

export function decomposeYield(rarityIdx: number): { gold: number; souls: number } {
  const idx = Math.min(Math.max(Math.floor(rarityIdx), 0), DECOMPOSE_GOLD.length - 1);
  return { gold: DECOMPOSE_GOLD[idx], souls: DECOMPOSE_SOULS[idx] };
}

// ---------------------------------------------------------------------------
// 新档起点（设计值）
// ---------------------------------------------------------------------------

/** 起始王国：破碎尖塔（GoW 同款开局） */
export const STARTING_KINGDOM = '破碎尖塔';
/** 新档货币（设计值） */
export const STARTING_CURRENCIES = { gold: 2000, souls: 800, gems: 150, goldKeys: 1 } as const;
/** 初始预设队名 */
export const STARTING_TEAM_NAME = '先锋队';

/**
 * 初始部队：起始王国的普通卡（数据内恰好 3 张，正好组成一支合法 3 人队）。
 * 从 troops.json 派生而非硬编码 id，内容更新后自动跟随。
 */
export function starterTroopIds(): number[] {
  return TROOPS.filter((t) => t.kingdom === STARTING_KINGDOM && t.rarityIdx === 0)
    .map((t) => t.id)
    .sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// 战斗结算（M2 设计值）——击杀奖励 / 胜负 / 每日首胜 / 经验
// ---------------------------------------------------------------------------

/** 击杀灵魂（设计值）：(8 + 4×稀有度档) × (1 + 敌人等级/10)，就近取整 */
export function killSoulReward(rarityIdx: number, level: number): number {
  return Math.round((8 + 4 * Math.max(rarityIdx, 0)) * (1 + Math.max(level, 1) / 10));
}

/** 击杀黄金（设计值）：(5 + 3×稀有度档) × (1 + 敌人等级/12)，就近取整 */
export function killGoldReward(rarityIdx: number, level: number): number {
  return Math.round((5 + 3 * Math.max(rarityIdx, 0)) * (1 + Math.max(level, 1) / 12));
}

/** 胜利额外奖励（设计值，固定值） */
export const VICTORY_BONUS = { gold: 60, souls: 30 } as const;

/** 战败保底（设计值；防「打不过就彻底卡死」） */
export const DEFEAT_CONSOLATION = { gold: 20, souls: 10 } as const;

/** 每日首胜宝石（设计值；宝石=抽卡货币只产出于玩法，裁定③） */
export const DAILY_FIRST_WIN_GEMS = 50;

/** 击杀经验（设计值）：敌人等级×10 + 稀有度档×20 */
export function xpForEnemy(rarityIdx: number, level: number): number {
  return Math.max(level, 1) * 10 + Math.max(rarityIdx, 0) * 20;
}

/** 胜利额外经验（设计值） */
export const WIN_BONUS_XP = 40;
