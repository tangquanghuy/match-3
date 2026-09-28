/**
 * Meta 数值单源（设计值）——META-GAME-PLAN.md §4.1/§4.2 的落地常量。
 *
 * 规则来源及项目差异见 docs/GOW-NUMERIC-AUDIT.md：
 *  - 部队等级上限按基础稀有度：15/16/17/18/19/20（rarityIdx 0..5，升阶提档即提高上限）；
 *  - 项目保留三阶升阶 5/10/25 张（不耗本体；并非完整官方升阶表）；
 *  - 灵魂成本按**基础稀有度**与目标等级查表，升阶不改成本表；
 *  - 特质按导入逐卡配方顺序解锁，只耗特质石；灵魂逐级消耗使用项目调整公式。
 *
 * 其余数字为设计值（首版宁紧勿松）：调经济节奏只改本文件；
 * 概率公示等玩家可见文案必须从这里派生，禁止两处硬编码。
 */
import { TROOP_PROGRESSION } from '../../data/leveling';
import { TROOPS } from '../../data/troops';
import type { KingdomStageMode } from './kingdoms';

/** 每个王国、每个关卡独立的一次性首通奖励；重复胜利不发。 */
export const KINGDOM_FIRST_CLEAR_GEMS: Readonly<Record<KingdomStageMode, number>> = {
  normal: 100, hard: 200, veryHard: 300,
};

/** 稀有度档位顺序（与 troops.json 的 rarityIdx 严格一致，定义见共享稀有度模块） */
export { RARITY_ORDER } from './rarity';

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
 * 灵魂成本曲线（设计值）：升到 targetLevel 级消耗 base[idx] × (targetLevel-1)^1.25（项目调整表，非官方逐级表），就近取 5。
 * 查表用**基础稀有度**（升阶不抬成本，对齐官方）。
 */
// Project tuning, NOT an official published soul table. Base rarity remains the cost key.
const SOUL_COST_BASE = [10, 12, 14, 16, 18, 20] as const;

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

/** Traitstone-only costs. Imported recipes take precedence; gold stays zero for API compatibility. */
export interface TraitStoneCost {
  gold: number;
  /** 特质石键 → 数量（不含黄金） */
  stones: Record<string, number>;
}

/** 解锁第 slot（1 起）个特质的代价（primaryColor = 部队主色的元素键） */
export function traitUnlockCost(slot: number, primaryColor: string, troopId?: number): TraitStoneCost {
  if (slot < 1 || slot > TRAIT_SLOT_COUNT) {
    throw new RangeError(`特质槽位越界: ${slot}`);
  }
  const recipe = troopId === undefined ? undefined : TROOP_PROGRESSION[String(troopId)]?.traits[slot - 1];
  if (recipe && Object.keys(recipe).length) return { gold: 0, stones: { ...recipe } };
  // Community troops absent from the imported snapshot: explicit common-tier fallback.
  const stones: Record<string, number> = { [`minor:${primaryColor}`]: 6 + slot * 4, [`major:${primaryColor}`]: 4 };
  if (slot === 2) stones[`runic:${primaryColor}`] = 4;
  if (slot === 3) stones[`arcane:${primaryColor}:${primaryColor}`] = 1;
  return { gold: 0, stones };
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

// ---------------------------------------------------------------------------
// 王国经营（M3 设计值）
// ---------------------------------------------------------------------------

/**
 * 进贡（GoW 口径 + 单机节奏）：
 *  - 每王国每小时掷一次「进贡几率」= 等级 × 5%（GoW 为 1%/级、10 级 10%，但官方玩家
 *    每小时上线收一次且有 30+ 王国，单机版放大到 5%/级）；离线最多累积 12 小时；
 *  - 命中时按**该王国自己的进贡配比**产出黄金 / 灵魂 / 荣耀（GoW 每个王国配比不同：
 *    破碎尖塔 200 金 8 魂、盖塔尔 40 魂、白盔国 10 荣耀…，见 data/kingdomTribute.ts）；
 *  - 同一小时有多个王国一起进贡 → 额外宝石与金钥匙（GoW：「多个王国同时进贡会额外
 *    给宝石和钥匙」，社区实测 2 国 2 宝石 1 钥匙 … 5 国以上 20 宝石 4 钥匙，这里按单机
 *    经济压缩，见 TRIBUTE_MULTI_BONUS）；
 *  - 主城（Home Kingdom）进贡翻倍（GoW 官方规则）。
 */
export const TRIBUTE = {
  /** 每王国等级的每小时命中概率 */
  chancePerLevel: 0.05,
  /** 概率封顶 */
  maxChance: 0.75,
  /** 离线累积上限（小时） */
  capHours: 12,
  /** 黄金/灵魂随王国等级放大：× (1 + 0.4 ×(等级−1))，10 级 ×4.6 */
  amountPerLevel: 0.4,
  /** 荣耀随王国等级放大得慢：× (1 + 0.1 ×(等级−1))，10 级 ×1.9 */
  gloryPerLevel: 0.1,
  /** 灵魂按官方基数 ×2（本项目部队升级更依赖灵魂，改前口径每次 25~115 魂） */
  soulScale: 2,
  /** 主城进贡倍率 */
  homeMultiplier: 2,
} as const;

/**
 * 同一小时 N 个王国一起进贡的额外奖励（取满足 min 的最高一档）。
 * GoW 社区实测：2 国 2 宝石/1 钥匙、3 国 10/2、4 国 15/3、5 国以上 20/4；
 * 单机版没有商城与公会消耗，宝石与钥匙按约 1/3~1/2 压缩，另加 8 国一档给后期。
 */
export const TRIBUTE_MULTI_BONUS: readonly { min: number; gems: number; goldKeys: number }[] = [
  { min: 2, gems: 1, goldKeys: 0 },
  { min: 3, gems: 3, goldKeys: 1 },
  { min: 4, gems: 5, goldKeys: 1 },
  { min: 5, gems: 8, goldKeys: 1 },
  { min: 8, gems: 12, goldKeys: 2 },
];

/** 某小时有 count 个王国同时进贡时的额外奖励（不足 2 国为 0） */
export function tributeMultiBonus(count: number): { gems: number; goldKeys: number } {
  let hit = { gems: 0, goldKeys: 0 };
  for (const tier of TRIBUTE_MULTI_BONUS) {
    if (count >= tier.min) hit = { gems: tier.gems, goldKeys: tier.goldKeys };
  }
  return hit;
}

/** 每小时进贡命中概率 */
export function tributeChance(level: number): number {
  return Math.min(Math.max(level, 0) * TRIBUTE.chancePerLevel, TRIBUTE.maxChance);
}

/** 黄金/灵魂的等级倍率 */
export function tributeAmountScale(level: number): number {
  return 1 + TRIBUTE.amountPerLevel * (Math.max(level, 1) - 1);
}

/** 荣耀的等级倍率 */
export function tributeGloryScale(level: number): number {
  return 1 + TRIBUTE.gloryPerLevel * (Math.max(level, 1) - 1);
}

/**
 * 王国黄金升级成本（设计值，lv2..lv10 共 9 档）：
 * 末级 4 万对齐计划 §1.2「末级约 4 万黄金量级」，总投入约 10.9 万（宁紧勿松）。
 */
export const KINGDOM_UPGRADE_COSTS = [
  1000, 2000, 3500, 5000, 7500, 10000, 15000, 25000, 40000,
] as const;

/** 王国从当前等级升到下一级的黄金成本（已满级抛 RangeError） */
export function kingdomUpgradeCost(currentLevel: number): number {
  if (currentLevel < 1 || currentLevel >= 10) {
    throw new RangeError(`王国等级越界: ${currentLevel}`);
  }
  return KINGDOM_UPGRADE_COSTS[currentLevel - 1];
}

// ---------------------------------------------------------------------------
// 抽卡（M4）——官方调研结论见 TASK-META.md §7，权重为设计值单源
// ---------------------------------------------------------------------------

/** 宝石宝箱：单抽 150 / 十连 1500（裁定③，价格不随官方变动）；十连保底稀有或以上 */
export const GEM_CHEST = {
  singleCost: 150,
  multiCount: 10,
  multiCost: 1500,
} as const;

/**
 * 金宝箱：1 把金钥匙一开（金钥匙来自进贡/任务/成就/竞技场）。
 * `multiCount` = 「开启十次」一次成交的张数（**原子批量**，CH-1：不允许循环单抽后半途失败）。
 */
export const GOLD_CHEST = { keyCost: 1, multiCount: 10 } as const;

/**
 * 稀有度权重表（万分比，idx 0..5 = Common..Legendary）。
 * 依据：计划 §4.2「顶两档 2.0%」+ 社区实测顶档 ~1/1000 量级
 * （GoW 官方不公布概率；gem chest 顶档实测 ≈0.1%，见 TASK-META.md §7 来源）。
 * 本数据无 Mythic，顶档即 Legendary。
 */
export const GEM_CHEST_WEIGHTS = [5200, 2400, 1700, 500, 180, 20] as const;

/** 金宝箱权重（万分比）：官方口径金宝箱只出 Common/Rare，本作放宽到 UR（裁定池偏低稀有度） */
export const GOLD_CHEST_WEIGHTS = [5600, 3000, 1200, 200, 0, 0] as const;

/** 十连至少一张稀有或以上；仅将未达标批次的末张低档结果提升到 Rare。 */
export const GACHA_PITY_MIN_IDX = 2;

// ---------------------------------------------------------------------------
// 主角成长（M5 设计值）
// ---------------------------------------------------------------------------

/** 每次胜利的主角经验加成（击杀经验之外） */
export const HERO_XP_PER_WIN = 60;
/** 主角编入队伍的胜场：当前职业经验 */
export const CLASS_XP_PER_WIN = 25;

// ---------------------------------------------------------------------------
// 竞技场 · 现开赛（M7 设计值；2026-09-18 对照官方调研修正 draft 结构）
// ---------------------------------------------------------------------------

/** Official normal Arena (help center + 5.2 reward table, checked 2026-09-27). */
export const ARENA = {
  entryFeeGold: 1000,
  rounds: 4,
  choicesPerRound: 3,
  winsToFinish: 6,
  lossesToFinish: 2,
  level: 15,
  // Numeric source rarities: Common, Rare, Ultra-Rare, Epic (legacy English aliases differ).
  roundBands: [{ min: 0, max: 0 }, { min: 1, max: 1 }, { min: 2, max: 2 }, { min: 3, max: 3 }],
  rarityLabels: ['普通', '稀有', '超稀有', '史诗'],
  opponentLevels: [15, 15, 15, 15, 15, 15],
  opponentSizes: [4, 4, 4, 4, 4, 4],
} as const;

export interface ArenaRewards { gold: number; souls: number; gloryKeys: number; trophies: number }
/** Official base rewards, without VIP/difficulty multipliers. */
export const ARENA_REWARDS: readonly ArenaRewards[] = [
  { gold: 50, souls: 0, gloryKeys: 0, trophies: 0 },
  { gold: 100, souls: 0, gloryKeys: 0, trophies: 0 },
  { gold: 500, souls: 75, gloryKeys: 1, trophies: 3 },
  { gold: 1000, souls: 200, gloryKeys: 1, trophies: 8 },
  { gold: 2000, souls: 350, gloryKeys: 2, trophies: 18 },
  { gold: 3000, souls: 500, gloryKeys: 2, trophies: 30 },
  { gold: 4000, souls: 750, gloryKeys: 3, trophies: 50 },
];

/** 任务链全通（8/8）奖励的金钥匙数（金钥匙经济收口 M6：来源=进贡/任务，去向=金宝箱） */
export const QUEST_COMPLETE_GOLD_KEYS = 1;

/** draft 部队的等级口径：双方固定 15 级，无特质、无外部属性加成 */
export function arenaDraftLevel(_rarityIdx: number): number {
  return 15;
}

// ---------------------------------------------------------------------------
// 素材产出 · 探索掉落（2026-09-19 素材批；官方公会任务渠道的单机映射）
// ---------------------------------------------------------------------------

/** 探索胜利掉落（设计值）：官方「王国战斗掉特质石」+ 公会任务给钢锭的合并口径 */
export const EXPLORE_DROPS = {
  /** 胜利掉钢锭概率 */
  ingotChance: 0.3,
  /** 钢锭档位随王国基数等级递进：≤10 普通 / ≤20 稀有 / ≤30 超稀 / ≤40 史诗 / 其余传说 */
  ingotTierByKingdomLevel: [10, 20, 30, 40] as const,
  /** 胜利掉初级特质石概率（颜色=敌方队首部队主色） */
  minorStoneChance: 0.25,
} as const;

// ---------------------------------------------------------------------------
// 荣耀宝箱（2026-09-19 入侵批；官方 Glory Chest 语义：特质石为主）
// ---------------------------------------------------------------------------

export const GLORY_CHEST = {
  /** 官方口径：20 荣耀 = 1 荣耀箱 */
  cost: 20,
  /** 批量开启数量；十连按单价结算，不额外改写奖池概率。 */
  multiCount: 10,
  /** 出金钥匙概率 */
  goldKeyChance: 0.1,
  /** 出部队卡概率（低稀有度带，其余出特质石包） */
  troopChance: 0.25,
  /** 特质石包里的圣辉石概率 */
  celestialChance: 0.05,
} as const;

// ---------------------------------------------------------------------------
// 入侵 PvP（2026-09-19；VP 计分表为官方数值，联赛/奖励为官方结构+设计数值）
// ---------------------------------------------------------------------------

/** 官阶联赛（官方 10 级名；0 = 青铜最底层，勿改动顺序） */
export const INVASION_LEAGUES = [
  '青铜', '白银', '黄金', '白金', '翡翠', '蓝宝石', '紫水晶', '黄玉', '红宝石', '钻石',
] as const;

/** 官方晋级/降级区（30 人小组按每周最终 VP 排名；1 起名次）：
 *  promote = 达到该名次以内晋级；relegate = 落入该名次及以后降级（0 = 本级是底，无降级） */
/** @deprecated Historic league table, not used by permanent VP ranks. */
export const INVASION_ZONES: ReadonlyArray<{ promote: number; relegate: number }> = [
  { promote: 20, relegate: 0 }, // 青铜：前 20 晋级，无降级
  { promote: 15, relegate: 26 }, // 白银：前 15 / 末 5（26-30）
  { promote: 10, relegate: 25 }, // 黄金：前 10 / 末 6（25-30）
  { promote: 7, relegate: 24 }, // 白金：前 7 / 末 7（24-30）
  { promote: 7, relegate: 24 },
  { promote: 7, relegate: 24 },
  { promote: 7, relegate: 24 },
  { promote: 5, relegate: 24 }, // 黄玉：前 5 / 末 7
  { promote: 3, relegate: 24 }, // 红宝石：前 3 / 末 7
  { promote: 0, relegate: 0 }, // 钻石：顶点
];

/** 周结奖励（官方结构、设计数值）：晋级 / 守级（中间带）/ 降级 */
/** @deprecated Old automatic weekly rewards; disabled by the VP rank/claim system. */
export const INVASION_SEASON_REWARDS = {
  promote: { glory: 150, gems: 100 },
  stay: { glory: 75, gems: 30 },
  relegate: { glory: 25, gems: 0 },
  /** 晋级材料包（对齐「周结大礼」手感）：钢锭 + 符卷 + 符文石 */
  promoteMats: {
    ingots: { epic: 8, legendary: 2 },
    forgeScrolls: 2,
    traitstones: { 'runic:red': 2, 'runic:blue': 2, 'runic:purple': 2 },
  },
} as const;

/** 旧 VP 表（仅兼容历史测试，实际使用 INVASION_VP_BY_DIFFICULTY）：对手平均等级段 → [基础, 下限, 上限] */
export const INVASION_VP_TABLE: ReadonlyArray<{ maxLevel: number; base: number; min: number; max: number }> = [
  { maxLevel: 9, base: 10, min: 5, max: 25 },
  { maxLevel: 19, base: 20, min: 10, max: 45 },
  { maxLevel: 29, base: 30, min: 15, max: 60 },
  { maxLevel: 39, base: 40, min: 20, max: 75 },
  { maxLevel: 999, base: 50, min: 25, max: 90 },
];

export const INVASION = {
  /** 解锁门槛（主角等级，设计值；官方排位无门槛） */
  unlockHeroLevel: 10,
  /** 每组镜像对手数（官方 30 人小组 - 玩家自己） */
  bracketSize: 29,
  /** 三选一：主屏同一时间呈现三名对手，可免费无限刷新。 */
  candidates: 3,
  /** 败北扣 VP（保底 0；官方败场会掉分） */
  vpLoss: 5,
  /** 胜场荣耀基础（官方「排位主产荣耀」的设计值化） */
  gloryPerWin: 10,
  /** 打榜单前 5「宿敌」的荣耀加成（官方复仇+2/宿敌+3 的合并） */
  gloryRivalBonus: 5,
  /** 每日入侵首胜荣耀加成（官方每日首胜语义） */
  gloryFirstWinOfDay: 15,
  /** 兼容旧榜单字段：候选血怒随机规则见 invasionFrenzy.ts，不由榜单人数决定 */
  frenzyCount: 0,
  /** 速胜加分（官方表）：≤turns → 加分，每类取最高 */
  speedBonuses: [
    { maxTurns: 10, bonus: 2 },
    { maxTurns: 8, bonus: 4 },
    { maxTurns: 6, bonus: 6 },
    { maxTurns: 4, bonus: 9 },
    { maxTurns: 2, bonus: 12 },
  ] as const,
  /** 存活加分（官方表）：存活人数 → 加分 */
  survivorBonuses: [
    { survivors: 2, bonus: 3 },
    { survivors: 3, bonus: 5 },
    { survivors: 4, bonus: 10 },
  ] as const,
  /** 额外回合加分（官方表）：extra-turn 事件计数达到 → 加分（每类取最高） */
  extraTurnBonuses: [
    { count: 2, bonus: 1 },
    { count: 4, bonus: 2 },
    { count: 6, bonus: 3 },
    { count: 8, bonus: 4 },
  ] as const,
} as const;

/** @deprecated 旧版项目等级压缩映射；新角色从青铜 I 起步，不再使用此定级方法 */
export function invasionInitialLeague(heroLevel: number): number {
  if (heroLevel >= 81) return 4;
  if (heroLevel >= 61) return 3;
  if (heroLevel >= 41) return 2;
  if (heroLevel >= 21) return 1;
  return 0;
}
