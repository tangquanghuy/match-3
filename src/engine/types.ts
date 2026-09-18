/**
 * 逻辑层基础类型定义。
 * 本文件为纯类型/数据定义，禁止依赖任何渲染、动画、浏览器 API（需求 17.2）。
 */

/** 基础颜色（六系元素，需求 2.1） */
export enum BaseColor {
  Red = 'Red',
  Green = 'Green',
  Blue = 'Blue',
  Yellow = 'Yellow',
  Purple = 'Purple',
  Brown = 'Brown',
}

/** 全部基础颜色的有序列表，供随机生成与遍历使用 */
export const ALL_BASE_COLORS: readonly BaseColor[] = [
  BaseColor.Red,
  BaseColor.Green,
  BaseColor.Blue,
  BaseColor.Yellow,
  BaseColor.Purple,
  BaseColor.Brown,
];

/** 元素类型 */
export type Element = 'Fire' | 'Wood' | 'Water' | 'Wind' | 'Magic' | 'Earth';

/** 基础颜色到元素的映射（需求 2.2） */
export const COLOR_ELEMENT: Record<BaseColor, Element> = {
  [BaseColor.Red]: 'Fire',
  [BaseColor.Green]: 'Wood',
  [BaseColor.Blue]: 'Water',
  [BaseColor.Yellow]: 'Wind',
  [BaseColor.Purple]: 'Magic',
  [BaseColor.Brown]: 'Earth',
};

/**
 * 特殊宝石种类（官方语义见 `.kiro/specs/combat-mechanics/GEMS-SEMANTICS.md`）。
 * 触发时机分两条入口：被匹配（MatchResolver 匹配组）与被摧毁（clear 管线）。
 */
export type SpecialGemKind =
  /** 末日骷髅：被匹配时骷髅伤害 +5 并引爆相邻一圈（不响应"被摧毁"） */
  | 'doomSkull'
  /** 至尊末日骷髅（Uber，官方 4.1 更强变体，仅特定兵种/武器生成）：被匹配时 +10 并引爆一圈 */
  | 'uberDoomSkull'
  /** 炸弹：不可匹配；被摧毁时爆炸摧毁相邻一圈 */
  | 'bomb'
  /** 织网：可匹配（紫色）；被匹配时随机一名敌人获得 web 状态 */
  | 'web'
  /** 闪电·蓝：可匹配（蓝色）；被匹配或被摧毁时清空整行 */
  | 'lightningRow'
  /** 闪电·黄：可匹配（黄色）；被匹配或被摧毁时清空整列 */
  | 'lightningCol'
  /** 通配：可与任意颜色直线匹配；tier 为该次匹配法力收益倍率（官方 2/3/4 三档，同次匹配相加：x2+x3=x5） */
  | 'wildcard'
  /** 许愿：不可匹配；被摧毁时 5 选 1 随机回蓝（20% 是"双方全员回满"的坑） */
  | 'wish'
  /** 沙漏：可匹配（黄色）；被匹配时获得一次额外回合 */
  | 'hourglass'
  /**
   * 赃物（Booty，官方 Heroic Gems 原文）：不可匹配、无法力色；被摧毁时给摧毁方 +10 金币
   * （战场经济，DECISIONS 四项拍板①）。只由技能创造/末日骷髅爆炸波及摧毁，不自然掉落。
   */
  | 'bootyGem'
  /**
   * 幽魂：官方语义为"被摧毁时获得 10 灵魂"（战斗外货币，已裁定暂不实现，语义改造待定）。
   * 当前无任何行为、不可匹配、无自然掉落——仅素材先行接入，引擎遇到时按普通移除处理。
   */
  | 'ghost'
  // ── 状态搬运宝石族（GEMS-SEMANTICS-2 A/B 组 · 波A，2026-09-16）──
  // 共性：无独立贴图，基图=归属色宝石贴图 + 程序化叠层；只由技能创造（不进 SPAWNABLE_SPECIALS）。
  // 触发时机两条入口（织网/末日骷髅先例）：被匹配（collectMatchTriggers）/ 被摧毁（expandSpecialDestruction）。
  /** 燃烧宝石：可匹配（红）；被匹配时燃烧敌方全体（官方 Heroic Gems 原文） */
  | 'burningGem'
  /** 冻结宝石：可匹配（蓝）；被匹配时冻结一名随机敌人（官方 Heroic Gems 原文） */
  | 'freezeGem'
  /** 诅咒宝石：可匹配（棕）；被匹配时诅咒一名随机敌人（官方 Heroic Gems 原文） */
  | 'curseGem'
  /** 流血宝石：可匹配（紫）；被摧毁时（含被匹配）流血一名随机敌人（官方战役公告 Wilhelmina's Rose） */
  | 'bleedGem'
  /** 毒宝石：可匹配（绿）；被匹配时毒敌方全体（官方战役公告 Campaign 27） */
  | 'poisonGem'
  /** 死亡标记宝石：无色不可匹配（官方 Dev 发言不可匹配集合成员）；被摧毁时死亡标记一名随机敌人 */
  | 'deathMarkGem'
  /** 恐怖宝石：可匹配（紫）；被匹配时恐怖一名随机敌人（官方 Heroic Gems 原文；夜魇马戏团战役） */
  | 'terrorGem'
  /** 缠绕宝石：可匹配（绿）；被摧毁时（含被匹配）缠绕一名随机敌人（官方战役公告 The Primeval Tome） */
  | 'entangleGem'
  /** 激怒宝石：可匹配（红）；被摧毁时（含被匹配）激怒一名随机己方（官方战役公告 Axe of the Horde） */
  | 'enrageGem'
  /** 沉没宝石：可匹配（蓝）；被摧毁时（含被匹配）下潜一名随机己方（官方战役公告 Trident of Dago'Nath） */
  | 'submergeGem'
  /** 精灵火宝石：可匹配（绿）；被摧毁时（含被匹配）妖火一名随机敌人（状态语义官方已核实，宝石触发句为建议默认） */
  | 'faerieFireGem'
  /** 打昏宝石：可匹配（棕）；被摧毁时（含被匹配）打昏一名随机敌人（触发句未证实，建议默认行为） */
  | 'stunGem'
  /** 屏障宝石：可匹配（黄）；被摧毁时（含被匹配）屏障一名随机己方（触发句未证实，建议默认行为） */
  | 'barrierGem'
  // ── 波B（GEMS-SEMANTICS-2 六色族/星族/不可匹配族/杂项，2026-09-17）──
  // 共性：仍不进 SPAWNABLE_SPECIALS（自然掉落白名单不变）；六色族经 spec.color 携带归属色。
  /** 龙宝石：可匹配（spec.color 六色）；被匹配或被摧毁时爆炸其所在列**下方**全部宝石（官方 Heroic Gems 原文） */
  | 'dragonGem'
  /** 巨人宝石：可匹配（spec.color 六色）；被匹配或被摧毁时 +5 该色法力并爆炸相邻一圈（官方"法力版末日骷髅"） */
  | 'giantGem'
  /** 灵力宝石：可匹配（spec.color 六色，官方颜色集合存疑缺省紫）；被匹配或被摧毁时敌方每个存活角色 -2 法力（汲取不转移） */
  | 'spiritGem'
  /** 法力药水宝石：可匹配（spec.color 六色）；被匹配或被摧毁时全盘随机空格撒 7-11 颗该色普通宝石 */
  | 'manaPotionGem'
  /** 糖果宝石：可匹配（spec.color 六色）；被匹配时己方全体该色存活盟友各 +1 法力（官方 in-game guide 原文） */
  | 'candyGem'
  /** 元素星：与棕/蓝/绿/红互连（特殊连接键 'star4'）；组结算给四色各 +1 法力，并摧毁匹配点对角线四格 */
  | 'elementalStar'
  /** 暗影之星（官方枚举 LightDarkStar）：与黄/紫互连（'star2'）；组结算给两色各 +1 法力，摧毁整行+整列 */
  | 'umbralStar'
  /** 天使宝石：无色不可匹配；被摧毁时随机己方获得 blessed（施加即净化负面+全免疫，状态本日已实现） */
  | 'angelGem'
  /** 恶魔传送门宝石：无色不可匹配；被摧毁时爆炸相邻一圈并为摧毁者召唤一名随机恶魔（TroopType 含 Daemon） */
  | 'daemonicPortalGem'
  /** 石像鬼宝石：无色不可匹配；tier 1=善（摧毁→己方每个存活角色随机 1 条正面状态）/ 2=恶（敌方全体随机 1 条负面） */
  | 'gargoyleGem'
  /** 石块：无色不可匹配惰性障碍——无任何触发；被摧毁不计法力不计骷髅（settleDestroyed 天然不数 special） */
  | 'stoneBlock'
  /** 狼化宝石：可匹配（紫）；被摧毁时（含被匹配）随机敌人施加狼化状态（官方"Removing Lycanthropy gems cast lycanthropy"） */
  | 'lycanthropyGem'
  /** 腐朽宝石：可匹配（棕）；无匹配/摧毁触发——盘上光环：每回合开始兵多一方全员 -1 甲/颗（同数双方都扣） */
  | 'decayGem'
  /** 火山宝石：可匹配（红）；被匹配时向上垂直列 + 对角方向爆炸（dragonGem「向下」的反向） */
  | 'volcanoGem'
  /** 陷阱宝石：无色不可匹配；被摧毁时五选一负面（stun/frozen/entangle/faerie-fire 全员打玩家队 or 创造 3 末日骷髅，官方 Underspire 原文） */
  | 'trapGem'
  /**
   * 附魔宝石：⚠️ 行为句官方未证实（公开渠道无定义，GEMS-SEMANTICS-2 E5）——先落 kind
   * （可创造/可摧毁），按官方"紫色 Heroic Gem"给紫匹配（匹配产紫法力），摧毁无特殊效果。
   * 待官方语义核实后再补触发行为。
   */
  | 'enchantedGem'
  /**
   * 宝箱怪宝石：⚠️ 公开渠道无定义（官方数据仅 1 处 CreateGems(Mimic)，GEMS-SEMANTICS-2 E6）——
   * 先落 kind（可创造/可摧毁），无匹配归属（颜色未知），摧毁无特殊效果。待官方语义核实。
   */
  | 'mimicGem';

/**
 * 状态搬运宝石族（波A 13 颗）的 kind 子集。用于渲染基图映射与触发路径判定。
 */
export type StatusGemKind =
  | 'burningGem'
  | 'freezeGem'
  | 'curseGem'
  | 'bleedGem'
  | 'poisonGem'
  | 'deathMarkGem'
  | 'terrorGem'
  | 'entangleGem'
  | 'enrageGem'
  | 'submergeGem'
  | 'faerieFireGem'
  | 'stunGem'
  | 'barrierGem';

/**
 * 特殊宝石规格（需求 20.1）。
 * wildcard 的 tier 表示法力倍率；bootyGem 的 tier 1-8 仅选择价值链外观；
 * gargoyleGem 的 tier 1=善 / 2=恶（wildcard 先例的 tier 通道复用）。
 * color：六色族（dragonGem/giantGem/spiritGem/manaPotionGem/candyGem）的归属基色
 * （GEMS-SEMANTICS-2 开放问题1 拍板方案：spec.color 携带，避免 12 个分色 kind 爆炸词表）。
 */
export interface SpecialGemSpec {
  kind: SpecialGemKind;
  tier?: number;
  /** 六色族归属基色；matchJoinKey 对带 color 的特殊宝石返回该色（与同色互连） */
  color?: BaseColor;
}

/** 末日骷髅被匹配时的额外骷髅伤害（官方 +5） */
export const DOOMSKULL_BONUS_DAMAGE = 5;
/** 至尊末日骷髅被匹配时的额外骷髅伤害（官方更强变体，双倍于末日骷髅） */
export const UBER_DOOMSKULL_BONUS_DAMAGE = 10;
/** 织网宝石对随机敌人施加 web 状态的回合数（与特质表 web 时长约定一致） */
export const WEB_GEM_TURNS = 3;
/** 赃物宝石被摧毁时给摧毁方的金币数（官方 Heroic Gems 原文：10 Gold） */
export const BOOTY_GEM_GOLD = 10;
/** 巨人宝石被匹配/被摧毁时给予的该色法力（官方 Heroic Gems 原文：+5 Mana of their color） */
export const MANA_BONUS_GIANT = 5;
/** 灵力宝石被匹配/被摧毁时从敌方每个存活角色汲取的法力（官方 "drain 2 Mana from Enemies"） */
export const SPIRIT_GEM_DRAIN = 2;
/** 法力药水宝石撒落该色普通宝石的数量区间（官方 "create 7-11 Mana Gems"） */
export const MANA_POTION_GEM_RANGE = { min: 7, max: 11 } as const;
/** 糖果宝石被匹配时己方全体该色存活盟友各获得的法力（官方 "give 1 mana to all allies of that colour"） */
export const CANDY_GEM_MANA = 1;
/** 陷阱宝石被摧毁时的五选一掷签面数（官方 Underspire 原文：1 of 5 effects） */
export const TRAP_GEM_OPTIONS = 5;
/** 天使宝石被摧毁时祝福的存续回合数（设计默认，与屏障同档） */
export const ANGEL_GEM_TURNS = 3;
/** 狼化宝石施加狼化状态的存续回合数（官方未给时限，取状态宝石族缺省 3） */
export const LYCANTHROPY_GEM_TURNS = 3;
/** 石像鬼宝石随机状态的存续回合数（随机状态效果缺省口径 3） */
export const GARGOYLE_GEM_TURNS = 3;

/**
 * 石像鬼宝石的随机状态池（GEMS-SEMANTICS-2 B4：池引用引擎已实现的施加管线状态集）。
 * 正面 = traits POSITIVE_STATUS_IDS 同集；负面剔除诅咒外的已实现负面（DoT 带 magnitude 由施加侧补）。
 */
export const GARGOYLE_POSITIVE_STATUS_POOL: readonly string[] = [
  'barrier', 'blessed', 'enchanted', 'enraged', 'reflect', 'submerged',
];
export const GARGOYLE_NEGATIVE_STATUS_POOL: readonly string[] = [
  'poison', 'burning', 'bleed', 'silence', 'frozen', 'entangle', 'web', 'stun', 'curse',
];

/**
 * 可匹配特殊宝石参与匹配时视作的颜色。单色 kind 的静态归属表——
 * 六色族（dragonGem/giantGem/spiritGem/manaPotionGem/candyGem）不在表内，
 * 经 spec.color 动态归属（matchJoinKey 优先读实例色）；星族走特殊连接键，也不入表。
 * 不可匹配的炸弹/许愿/幽魂/死亡标记/天使/传送门/石像鬼/石块/陷阱/宝箱怪不在表内。
 */
export const SPECIAL_MATCH_COLOR: Partial<Record<SpecialGemKind, BaseColor>> = {
  web: BaseColor.Purple,
  hourglass: BaseColor.Yellow,
  lightningCol: BaseColor.Yellow,
  lightningRow: BaseColor.Blue,
  // 状态搬运族（GEMS-SEMANTICS-2 各节考证归属色；deathMarkGem 无色不可匹配，不入表）
  burningGem: BaseColor.Red,
  freezeGem: BaseColor.Blue,
  curseGem: BaseColor.Brown,
  bleedGem: BaseColor.Purple,
  poisonGem: BaseColor.Green,
  terrorGem: BaseColor.Purple,
  entangleGem: BaseColor.Green,
  enrageGem: BaseColor.Red,
  submergeGem: BaseColor.Blue,
  faerieFireGem: BaseColor.Green,
  stunGem: BaseColor.Brown,
  barrierGem: BaseColor.Yellow,
  // 波B 单色 kind（六色族/星族见上注）
  volcanoGem: BaseColor.Red,
  decayGem: BaseColor.Brown,
  lycanthropyGem: BaseColor.Purple,
  enchantedGem: BaseColor.Purple,
};

/**
 * 单颗状态搬运宝石的施加规格（GEMS-SEMANTICS-2 A/B 组波A）。
 * statusId/turns/magnitude 与目标侧（side）、施加人数（scope）逐节按文档考证落定。
 */
export interface StatusGemTriggerSpec {
  /** 施加的状态 id（与 skills/effects/status.ts 的状态表一致） */
  statusId: string;
  /** 存续回合数 */
  turns: number;
  /** DoT 每回合量（仅文档明示的 burning/bleed 携带） */
  magnitude?: number;
  /** 目标侧：enemy=施加方（行动方）的敌方 / ally=施加方己方 */
  side: 'enemy' | 'ally';
  /** 施加人数：random=随机一名存活 / all=全部存活 */
  scope: 'random' | 'all';
}

/**
 * 状态搬运宝石 → 施加规格（考证来源见各 kind 注释与 GEMS-SEMANTICS-2）。
 * poison 按文档 A6 不带 magnitude（引擎 tick 产出 0 伤 status-tick，仅作表现占位）；
 * terror 的 turns 文档未定值，取与 curse 同档 4（设计默认）。
 */
export const STATUS_GEM_EFFECTS: Record<StatusGemKind, StatusGemTriggerSpec> = {
  burningGem: { statusId: 'burning', turns: 3, magnitude: 3, side: 'enemy', scope: 'all' },
  freezeGem: { statusId: 'frozen', turns: 3, side: 'enemy', scope: 'random' },
  curseGem: { statusId: 'curse', turns: 4, side: 'enemy', scope: 'random' },
  bleedGem: { statusId: 'bleed', turns: 3, magnitude: 1, side: 'enemy', scope: 'random' },
  poisonGem: { statusId: 'poison', turns: 3, side: 'enemy', scope: 'all' },
  deathMarkGem: { statusId: 'death-mark', turns: 3, side: 'enemy', scope: 'random' },
  terrorGem: { statusId: 'terror', turns: 4, side: 'enemy', scope: 'random' },
  entangleGem: { statusId: 'entangle', turns: 3, side: 'enemy', scope: 'random' },
  enrageGem: { statusId: 'enraged', turns: 2, side: 'ally', scope: 'random' },
  submergeGem: { statusId: 'submerged', turns: 2, side: 'ally', scope: 'random' },
  faerieFireGem: { statusId: 'faerie-fire', turns: 3, side: 'enemy', scope: 'random' },
  stunGem: { statusId: 'stun', turns: 1, side: 'enemy', scope: 'random' },
  barrierGem: { statusId: 'barrier', turns: 3, side: 'ally', scope: 'random' },
};

/** 「被匹配」路径施加的状态宝石（collectMatchTriggers 即时施加，织网先例） */
export const MATCH_STATUS_GEMS: ReadonlySet<StatusGemKind> = new Set([
  'burningGem',
  'freezeGem',
  'curseGem',
  'poisonGem',
  'terrorGem',
]);

/** 「被摧毁」路径施加的状态宝石（expandSpecialDestruction；被匹配同样视为被摧毁——A 组共性） */
export const DESTROY_STATUS_GEMS: ReadonlySet<StatusGemKind> = new Set([
  'bleedGem',
  'entangleGem',
  'stunGem',
  'barrierGem',
  'enrageGem',
  'submergeGem',
  'faerieFireGem',
  'deathMarkGem',
]);

/** 类型守卫：该特殊宝石 kind 是否属于状态搬运族（波A 13 颗） */
export function isStatusGemKind(kind: SpecialGemKind): kind is StatusGemKind {
  return kind in STATUS_GEM_EFFECTS;
}

/**
 * 波B 17 kind（GEMS-SEMANTICS-2 2026-09-17：六色族/星族/不可匹配族/杂项）。
 * 免贴图族：渲染侧据此叠加程序化占位层（叠层≤1、无逐帧滤镜，§0 预算）；
 * 自然掉落白名单不含本集合任何 kind（SPAWNABLE_SPECIALS 不扩，风险护栏）。
 */
export const WAVE_B_GEM_KINDS: ReadonlySet<SpecialGemKind> = new Set<SpecialGemKind>([
  'dragonGem', 'giantGem', 'spiritGem', 'manaPotionGem', 'candyGem',
  'elementalStar', 'umbralStar',
  'angelGem', 'daemonicPortalGem', 'gargoyleGem', 'stoneBlock', 'lycanthropyGem',
  'decayGem', 'volcanoGem', 'trapGem', 'enchantedGem', 'mimicGem',
]);

/** 类型守卫：该特殊宝石 kind 是否属于波B 17 颗 */
export function isWaveBGemKind(kind: SpecialGemKind): boolean {
  return WAVE_B_GEM_KINDS.has(kind);
}

/** 便捷构造：特殊宝石。六色族（dragonGem 等）经 color 携带归属基色 */
export function specialGem(kind: SpecialGemKind, tier?: number, color?: BaseColor): GemType {
  const spec: SpecialGemSpec = { kind };
  if (tier !== undefined) spec.tier = tier;
  if (color !== undefined) spec.color = color;
  return { kind: 'special', spec };
}

/**
 * 宝石类型采用可辨识联合（discriminated union），
 * 以满足需求 2.5 / 20.1 的可扩展性：新增类型不改动现有定义。
 */
export type GemType =
  | { kind: 'color'; color: BaseColor }
  | { kind: 'skull'; variant: 'normal' }
  | { kind: 'special'; spec: SpecialGemSpec };

/** 便捷构造：颜色宝石 */
export function colorGem(color: BaseColor): GemType {
  return { kind: 'color', color };
}

/** 便捷构造：普通骷髅宝石 */
export function skullGem(): GemType {
  return { kind: 'skull', variant: 'normal' };
}

/**
 * 匹配连接键：颜色返回色名，骷髅族（普通/末日）返回 'skull'，通配返回 'wildcard'，
 * 六色族特殊宝石返回其 spec.color（与同色宝石互连），星族返回特殊键
 * 'star4'（棕蓝绿红）/ 'star2'（黄紫），不可匹配（炸弹/许愿等）返回 null。
 * MatchResolver 的 run 级扫描与 isSameMatchType 共用。
 */
export function matchJoinKey(type: GemType): string | null {
  switch (type.kind) {
    case 'color':
      return type.color;
    case 'skull':
      return 'skull';
    case 'special': {
      if (type.spec.kind === 'wildcard') return 'wildcard';
      if (type.spec.kind === 'doomSkull' || type.spec.kind === 'uberDoomSkull') return 'skull';
      if (type.spec.kind === 'elementalStar') return ELEMENTAL_STAR_JOIN_KEY;
      if (type.spec.kind === 'umbralStar') return UMBRAL_STAR_JOIN_KEY;
      if (type.spec.color !== undefined) return type.spec.color;
      return SPECIAL_MATCH_COLOR[type.spec.kind] ?? null;
    }
  }
}

/** 元素星的特殊连接键（GEMS-SEMANTICS-2 D1）：与棕/蓝/绿/红四色互连 */
export const ELEMENTAL_STAR_JOIN_KEY = 'star4';
/** 暗影之星的特殊连接键（GEMS-SEMANTICS-2 D2）：与黄/紫两色互连 */
export const UMBRAL_STAR_JOIN_KEY = 'star2';

/** 星族连接键的匹配白名单：star4 与自身+四基色互连（不与骷髅/黄紫相连） */
const STAR4_MATCH_KEYS: ReadonlySet<string> = new Set([
  ELEMENTAL_STAR_JOIN_KEY,
  BaseColor.Brown,
  BaseColor.Blue,
  BaseColor.Green,
  BaseColor.Red,
]);
/** star2 与自身+黄紫互连（不与骷髅/棕蓝绿红相连） */
const STAR2_MATCH_KEYS: ReadonlySet<string> = new Set([
  UMBRAL_STAR_JOIN_KEY,
  BaseColor.Yellow,
  BaseColor.Purple,
]);

/**
 * run 级连接判定（MatchResolver.scanLines 的 run 延续条件 + isSameMatchType 共用）：
 * 等值键相连；星族特殊键按各自白名单族相连（'star4' 与棕蓝绿红/star4、'star2' 与黄紫/star2，
 * 星不与骷髅连、两族星互不连）。isSameMatchType 的逐对判定与 run 的延续判定同源，
 * 避免两套语义漂移。
 *
 * 注意 run 继承是贪心从左到右（与通配同款既有语义）：星先被左侧同族 run 前缀吸收后，
 * 右侧同族 run 不再拿到它——两颗星分属两侧同族色时按扫描序归属先到者。
 */
export function matchKeysConnect(runKey: string | null, key: string | null): boolean {
  if (runKey === null || key === null) return false;
  if (runKey === ELEMENTAL_STAR_JOIN_KEY || key === ELEMENTAL_STAR_JOIN_KEY) {
    return STAR4_MATCH_KEYS.has(runKey) && STAR4_MATCH_KEYS.has(key);
  }
  if (runKey === UMBRAL_STAR_JOIN_KEY || key === UMBRAL_STAR_JOIN_KEY) {
    return STAR2_MATCH_KEYS.has(runKey) && STAR2_MATCH_KEYS.has(key);
  }
  return runKey === key;
}

/**
 * 判断两个宝石类型是否"可匹配同类"。
 * 颜色按色名；末日骷髅与普通骷髅同族；织网/沙漏/闪电/状态搬运族按各自归属色；
 * 六色族按 spec.color；星族按特殊连接键白名单（'star4'/'star2'，星不与骷髅连）；
 * 通配与任意颜色同类（不与骷髅族相连）；不可匹配宝石与任何宝石都不同类（只能被消除管线触发）。
 */
export function isSameMatchType(a: GemType, b: GemType): boolean {
  const ka = matchJoinKey(a);
  const kb = matchJoinKey(b);
  if (ka === null || kb === null) return false;
  if (ka === 'wildcard' || kb === 'wildcard') {
    return ka !== 'skull' && kb !== 'skull';
  }
  return matchKeysConnect(ka, kb);
}

/** 宝石实例。id 稳定唯一，供表现层追踪同一宝石的移动（下落动画依赖此） */
export interface Gem {
  id: number;
  type: GemType;
}

/** 格子坐标：行、列，从 0 开始（需求 1.2） */
export interface CellPos {
  row: number;
  col: number;
}

/**
 * 一次完整的战斗行动。交换和施法共用 TurnEngine 的行动入口，
 * 以保证解析态、回合尾结算和后续行动日志遵循同一生命周期。
 */
export type BattleAction =
  | { type: 'swap'; from: CellPos; to: CellPos }
  | { type: 'cast'; characterId: number };

/**
 * 一次行动在回合尾结算后的回合归属结果。
 * 用于校验「普通技能交出回合、额外回合只保留一次」而不必重新解析事件流。
 * held：释放技能不消耗回合（用户裁定，对齐 GoW）——行动方未变，也非额外回合。
 */
export type ActionOutcome = 'switched' | 'extra-turn' | 'held' | 'game-over';

/**
 * 结构化行动日志条目（需求 1.5、3.6）。
 *
 * 只登记被受理并进入解析态的行动：非法交换、法力不足、被沉默/冰冻等拒绝路径不占号，
 * 因此 `index` 可直接作为「本场第 n 次行动」用于复现与结果摘要。
 */
export interface ActionLogEntry {
  /** 本场第 n 次被受理的行动，从 0 递增 */
  index: number;
  /** 提交方，取行动开始时的 activePlayer */
  side: PlayerSide;
  /** 行动本体快照（含类型与角色/格子），已拷贝，不随调用方对象后续变化 */
  action: BattleAction;
  /** cast 时记录实际释放的技能 id，结果摘要无需回查角色 */
  skillId?: string;
  /** 行动结束后的回合归属 */
  outcome: ActionOutcome;
}

/** 坐标相等判断 */
export function posEquals(a: CellPos, b: CellPos): boolean {
  return a.row === b.row && a.col === b.col;
}

/** 坐标转字符串键，用于 Set/Map */
export function posKey(p: CellPos): string {
  return `${p.row},${p.col}`;
}

/** 玩家方（需求：左玩家=人类，右玩家=对手） */
export enum PlayerSide {
  Left = 'Left',
  Right = 'Right',
}

/** 取对方玩家 */
export function opponentOf(side: PlayerSide): PlayerSide {
  return side === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
}

/** 对局状态（需求：等待输入/解析中/游戏结束） */
export enum MatchState {
  AwaitingInput = 'AwaitingInput',
  Resolving = 'Resolving',
  GameOver = 'GameOver',
}

/**
 * 单一法力条模型（照搬《Gems of War》）：
 * 角色关联一至多种法力颜色（见 Character.colors），任一关联色的匹配都为「同一条」法力充能，
 * 累积到 manaCost 即满，释放技能后清零。不再有分色阈值。
 */

/**
 * 状态实例（战斗技能系统 · 需求 9.1）。
 * 施加在角色身上的持续性效果，如中毒/燃烧(DoT)、沉默/眩晕(控制)。
 */
export interface StatusInstance {
  /** 状态类型 id：'poison' | 'burning' | 'silence' | 'stun' | ... */
  id: string;
  /** 剩余存续回合数；结算后递减，归零移除 */
  turns: number;
  /** DoT 类每回合伤害量等（可选） */
  magnitude?: number;
  /** 自动解除的累计概率（百分比）；与 DoT/web 的 magnitude 分开存储。 */
  recoveryChance?: number;
}

/** @deprecated 旧空壳别名，保留以兼容早期引用；等价于 StatusInstance。 */
export type StatusEffect = StatusInstance;

/** 角色（需求 13） */
export interface Character {
  id: number;
  name: string;
  maxHp: number;
  hp: number;
  attack: number;
  armor: number;
  /** 法术强度：技能数值按 [魔法+N] 缩放（照搬 GoW，需求 13.1） */
  magic: number;
  /** 关联法力颜色，可一至多种；任一色的匹配为同一条法力充能（需求 13.2） */
  colors: BaseColor[];
  /** 释放技能所需的法力总量（单一数值，需求 10.2） */
  manaCost: number;
  /** 当前累积的法力值（单一，[0, manaCost]，需求 10.1, 10.3） */
  mana: number;
  skillId: string;
  statuses: StatusInstance[];
  defeated: boolean;
  /**
   * 逃跑标记（DECISIONS 四项拍板③）：escape 效果段判定成功时置位，随后角色从编队
   * splice 移出（复用 defeat 的移出管线，但不置 defeated、不触发死亡召唤/阵亡响应）。
   * 结算侧据此与阵亡区分（fled 者不按击杀记账）。
   */
  fled?: boolean;
  /**
   * 被动特质 code 列表（对齐 GoW 官方 trait code）。未实现的 code 安全忽略。
   * 可选：手写夹具可省略，等价于无特质。
   */
  traitIds?: string[];
  /**
   * 种族/类型（对齐 GoW 的 `TroopType`，如 `Beast`/`Knight`），一至两个。
   * 种族光环（族亲/之盾）按它筛选受益对象。可选：无种族即不吃族亲光环。
   */
  troopTypes?: string[];
  /**
   * 王国归属（对齐 GoW 的 `KingdomId` → kingdoms 数据的王国名，如 `Merlantis`/`Dhrak-Zum`）。
   * 原语 Wave4 批消费点：条件 kingdomOf（「如果敌人来自 Merlantis」）与
   * modifier 来源 alliesOfKingdom/enemiesOfKingdom（「因 Dhrak-Zum 盟友数量而增强」）；
   * 武器原语批（K-E）追加消费点：段级 targetKingdom 目标过滤（「给予所有白盔国盟友…」）。
   * 可选：宿主快照未携带或手写夹具省略即不属于任何王国（条件不成立、计数不计入）。
   */
  kingdom?: string;
  /**
   * 淬炼段位（武器原语批 K-E，官方 Doomed 档武器「+N per Tempering level」的缩放来源）：
   * 施法者（主角）的武器淬炼等级。modifier 来源 `{ kind: 'tempering' }` 按它计数——
   * 「Deal [Magic + 10] …, +4 per Tempering level」= 淬炼段 modifier {multiplier 4}：
   * level 2 → +8、level 0 / 缺省（undefined 按 0 计）→ 增项为 0，数值退化为普通一次缩放。
   * 可选：meta 层淬炼系统接入前恒缺省（=0），不影响既有对局。
   */
  temperingLevel?: number;
  /** ===== 以下为宿主显示字段（引擎逻辑不消费；2026-09-19 素材批追加） ===== */
  /** 技能显示名/描述（引擎原型不含文本，详情面板兜底用） */
  spellName?: string;
  spellDescription?: string;
  /** 特质显示名（code → 中文名），库外 code 的名称兜底 */
  traitNames?: Record<string, string>;
  /** 卡面特质展示清单（缺省回落 traitIds；主角= 3 条职业特质，天赋不上卡面） */
  displayTraitIds?: string[];
  /**
   * 由 `traitIds` 编译出的被动修正，战斗开始时算一次。
   * 结算路径只读这里，不查特质注册表，见 `src/engine/traits.ts`。
   */
  passive?: PassiveModifiers;
}

/**
 * 特质编译后的被动修正。定义放在 types 里而不是 traits.ts，
 * 避免 `Character` 与特质模块互相 import 形成循环。
 *
 * 两个 `*DamageTaken` 是**乘数**（1 = 无减免，0.75 = 减伤 25%），
 * 结算处直接相乘即可，不必理解特质语义。
 */
export interface StatGains {
  hp: number;
  armor: number;
  attack: number;
  magic: number;
  /** 法力：只有少数触发类特质会给（如庆功 +8 法力） */
  mana: number;
}

export interface PassiveModifiers {
  skullDamageTaken: number;
  spellDamageTaken: number;
  /** 免疫的状态 id；含 '*' 表示全免 */
  statusImmunities: readonly string[];
  /** 每回合开始恢复的生命 */
  regenPerTurn: number;
  /** 每回合开始恢复的护甲 */
  regenArmorPerTurn: number;
  /**
   * 每回合开始获得的攻击力（aspectofwar「在每回合开始时获得 3 点攻击力」）。
   * regen.stat 按 attack/magic 分路由——历史上非 armor 的 regen 一律落 regenPerTurn
   * （HP 回复），攻击/魔法回合增益被静默结算成回血，属接线 bug，已按 stat 字段修正。
   */
  regenAttackPerTurn: number;
  /** 每回合开始获得的魔法值（织网下的魔法增益拦截走 grantStat 既有口径） */
  regenMagicPerTurn: number;
  /** 自身受到伤害后获得的数值 */
  gainOnDamaged: StatGains;
  /**
   * 自身受到伤害后获得的**状态**（aquatic「在自身受到伤害时使自身下潜」）。
   * 与 gainOnDamaged 同一触发点（骷髅受击结算处，闪避/屏障/挣扎路径不触发），
   * 施加经 applyStatus（免疫在 applyStatus 内拦截）。
   */
  onDamagedStatus?: { statusId: string; turns: number };
  /**
   * 自身承受骷髅伤害时使**对方阵营**队伍序首位存活陷入状态（接线批 deathray 死光
   * 「在自身生命值受损时，使敌方第一名敌人陷入死亡标记效果」）。与 onDamagedStatus
   * 同一触发点（落空不触发、激怒无视敌方特质）；受魅惑反打时按持有者归属取对面。
   * 建模子集：技能伤害路径（damageOne）不触发。
   */
  onDamagedEnemyStatus?: { id: string; turns: number };
  /**
   * 自身承受骷髅伤害时对**对方全体存活**造成固定额技能伤害（接线批 manyheads 九头攻击
   * 「当敌人造成骷髅头伤害时，全体敌人受到 3 点伤害」）。消费在
   * TurnEngine.applyDamagedTriggersFromEvents（伤害经 damageOne 管线注入）。
   */
  onSkullDamagedEnemyDamage?: { amount: number };
  /**
   * 自身承受骷髅伤害时创造特殊宝石（接线批 onyxshard 缟玛瑙碎片「创造 2 颗极度末日骷髅头」
   * + *shard 巨人宝石族 / 法力药水族）。随机现存格就地翻新，color 为六色族宝石归属基色；
   * 消费在 TurnEngine.applyDamagedTriggersFromEvents（不重入连锁，外层循环吸收）。
   */
  onDamagedCreateGem?: { gem: SpecialGemKind; tier?: number; color?: string; count: number };
  /** 法力操作免疫（manashield「对法力灼烧、法力耗尽和法力窃取免疫」）：
   *  法力耗（耗蓝/耗尽/减半）与窃取（stat='mana' 的 reduce 原语，含窃取回灌）在执行
   *  入口对带此被动的目标整体跳过。灼烧另有 mana-burn 状态免疫（statusImmunities）。 */
  manaOpsImmunity: boolean;
  /** 自己造成骷髅伤害时获得的数值 */
  gainOnSkullHit: StatGains;
  inflictOnSkullHit?: { id: string; turns: number; magnitude?: number };
  /**
   * 造成骷髅伤害时给目标施加的**多条**状态（接线批 brokenjaw 断颚「使第一位敌人陷入出血
   * 和沉默状态」）。与 inflictOnSkullHit 同一触发点、条目按描述顺序保留，在单条施加点
   * 之后逐条施加；仅 DoT（poison/burning/bleed）带 magnitude。
   */
  inflictOnSkullHitList?: readonly { id: string; turns: number; magnitude?: number }[];
  /**
   * 造成骷髅伤害时窃取本次受击目标的法力（接线批 siphon 吸星大法；官方 RawData
   * Modifier=1）。偷多少削多少（目标夹零、自己按 manaCost 夹取），manashield 免疫
   * 在削减口整体跳过；消费在 CombatResolver 骷髅结算口。
   */
  onSkullHitStealMana?: number;
  /** 承受骷髅伤害时给攻击者施加的状态（毒孢子族：被打时反手让敌人中毒） */
  inflictOnSkullDamaged?: { id: string; turns: number; magnitude?: number };
  /**
   * 承受骷髅伤害时给攻击者施加的**多条**状态（双状态诅咒族 frozencurse 等：
   * 「使其陷入诅咒和冻结状态」）。与 inflictOnSkullDamaged 并存，结算时在单条施加点
   * 之后逐条施加；条目按特质声明的描述顺序保留。仅 DoT（poison/burning/bleed）带 magnitude。
   */
  inflictOnSkullDamagedList?: readonly { id: string; turns: number; magnitude?: number }[];
  /** 自己一方匹配 4/5 连时，给同队指定种族盟友的增益（firstwargare/overclock 族）；键为种族或 'all'（全队） */
  bigMatchTypeAura: Readonly<Record<string, StatGains>>;
  /**
   * 自己一方匹配 4/5 连时施加状态（条件光环批：屏障/狂怒/下潜/反射/赐福…）。
   * scope 指受益范围：self=持有者 / randomAlly=随机一名存活盟友 / allAllies=全队存活 /
   * allEnemies=敌方全队存活（bloodmark「使所有敌人陷入出血状态」）/
   * randomEnemy=随机一名存活敌人（winterveil「冻结一名随机敌人」）/
   * firstEnemy=敌方队伍序首个存活（dragonvines「缠绕第一名敌人」，确定性、零随机消耗）。
   * statuses 逐条施加（bloodcoldrage 一条特质带冻结+出血两条）；DoT 才带 magnitude。
   * chance 为触发概率（lotusblessing 50%），缺省必定；minSize 限定触发的大连颗数（缺省 4）。
   * randomNegative（experiment「陷入一个随机的状态效果」）：从 statuses 负面池经 rng
   * 掷一条施加（与 randomPositive 的掷签同口径，仅 randomEnemy scope）。
   */
  onBigMatchStatus?: {
    scope: 'self' | 'randomAlly' | 'allAllies' | 'allEnemies' | 'randomEnemy' | 'firstEnemy';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
    chance?: number;
    randomPositive?: boolean;
    randomNegative?: boolean;
    minSize?: number;
    /**
     * 独立概率掷（maladycurse「Independent 25% chances to inflict Curse or Death Mark」）：
     * 每条状态各自掷一次 chance（各中各的），而非一次判定全上；每条各耗一次 rng。
     */
    independentChance?: boolean;
  };
  /** 配对 N 连限定自身增益（insanegrowth「配对 5 或 5 颗」只认 5 连），键为 minSize */
  gainOnBigMatchSized: Readonly<Record<string, StatGains>>;
  /**
   * 匹配某色宝石时给同队指定范围盟友加值（celestial/powerof/各色 aura 族）。
   * 外层键为颜色或 'skull'（骷髅匹配）；内层 scope 为 'all'（全队）/种族名（查 troopTypes）/
   * 颜色名（查 colors，如「所有红色盟友」）。
   */
  colorMatchTypeAura: Readonly<Record<string, Readonly<Record<string, StatGains>>>>;
  /** 匹配列内颜色时净化全队（adagio）：移除全部负面状态 */
  cleanseOnColorMatch: readonly string[];
  /** 自己一方 4+ 连时净化全队（royalhoney） */
  cleanseOnBigMatch: boolean;
  /** 敌方配对某色/骷髅时自身获得（rancor），色键同 colorMatchTypeAura */
  gainOnEnemyColorMatch: Readonly<Record<string, StatGains>>;
  /**
   * 配对某色（或骷髅）宝石时施加状态（T5 配色状态批 16 code：
   * molten/sunfire/deepwounds…）。外层色键同 gainOnEnemyColorMatch（'skull'=骷髅匹配）；
   * scope：randomEnemy=随机一名存活敌人（多条 statuses 逐条施加，enchantedvines 缠绕+妖火）/
   * self=持有者自身（angrybear「配对棕色宝石时赋予自身狂怒状态」）。触发点
   * applyColorMatchTriggers（配色触发同点），
   * 施加经 TurnEngine 注入的 applyStatus（免疫在施加口拦截），随机目标与概率
   * （foxfire 50% 用 chance）消耗注入的 rng；无注入时概率 <1 不生效、目标退化为首个存活。
   */
  colorMatchStatus: Readonly<Record<string, {
    scope: 'randomEnemy' | 'randomAlly' | 'self';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
    chance?: number;
    /** 独立概率掷（brambleheart「Independent 50% chances to Entangle or inflict Bleed」）：
     *  每条状态各自掷一次 chance（各中各的），每条各耗一次 rng */
    independentChance?: boolean;
  }>>;
  /**
   * 配对某色（或骷髅）宝石时窃取首位敌人的生命（T5 窃取批 5 code：corruption/poisontide/
   * justabite/darkesthunger/ladyofdesire「在配对X色宝石时窃取第一/首位敌人 N 点生命值」）。
   * 外层色键同 gainOnEnemyColorMatch；值为伤害额，同色键累加。触发点
   * applyColorMatchTriggers（配色触发同点），结算经 TurnEngine 注入的 drainLife
   * （damageOne 管线伤害 + 持有者按实际伤害额等量治疗，与技能 drain 的 settleDrain 同源）；
   * front 目标确定性选取、零随机消耗。
   */
  colorMatchDrain: Readonly<Record<string, number>>;
  /**
   * 配对某色（或骷髅）宝石时对（随机一名 / 全体）敌人造成技能伤害（T5 杂项批 lumpofcoal/
   * dawnslayer/sleetstorm「在配对X色宝石时，对一名随机敌人造成 N 点伤害」+ 缺口清扫批
   * spiny/spiky「在自身配对骷髅头时，对所有敌人造成 N 点伤害」）。外层色键同
   * colorMatchDrain；同色键累加。触发点 applyColorMatchTriggers（配色触发同点），结算经
   * TurnEngine 注入的 damage（damageOne 管线，同技能伤害口径），随机目标每次触发消耗一次
   * 注入的 rng（与配色施加状态的随机分支同口径）；allEnemies 逐个结算、零随机消耗。
   */
  colorMatchDamage: Readonly<Record<string, {
    amount: number;
    scope: 'randomEnemy' | 'allEnemies';
  }>>;
  /**
   * 自己一方配对 4+ 连时对敌人造成技能伤害（T5 大连伤害批 3 code：shock/tentacles/
   * lightningbolt「在配对 4 或 5 颗宝石时对…造成 N 点伤害」）。多条并存按声明序逐条结算，
   * minSize 缺省 4；伤害经 TurnEngine 注入的 damage（damageOne 管线）产出 skill-damage
   * 事件，randomEnemy 每条规格消耗一次注入的 rng。
   */
  bigMatchDamage: readonly {
    amount: number;
    scope: 'randomEnemy' | 'enemyAll' | 'lastEnemy';
    minSize: number;
  }[];
  /**
   * 自己一方配对 4+ 连时削减敌方属性（T5 大连敌减批 5 code：suppression/aspectofplague/
   * technomancy/creepinggloom/chillingaura「敌人损失/耗掉/窃取 N 点X」）。reduce 语义
   * （持有者不进账）：目标属性夹零发负 buff 事件，mana 为耗蓝口径（manashield 免疫在
   * 削减口拦截）；front=首位存活敌人、randomEnemy 每条规格消耗一次注入的 rng、
   * allEnemies=敌方全队存活逐个削减（darkness「所有敌人损失 4 点攻击力」，确定性、
   * 零随机消耗）；minSize 缺省 4。
   */
  bigMatchEnemyDrain: readonly {
    stat: 'attack' | 'armor' | 'magic' | 'mana';
    amount: number;
    scope: 'front' | 'randomEnemy' | 'allEnemies';
    minSize: number;
  }[];
  /**
   * 自己一方配对 4+ 连时创造特殊宝石（T4 大连创造批 wildtribe/wildmagic/twinfires/
   * spectromancy「在配对 4 或更多宝石时（有 N% 几率）创建 x2/x3 通配/燃烧宝石」）。
   * 多条并存按声明序逐条结算，minSize 缺省 4；概率经 TurnEngine 注入的 rng 判定，
   * 落子经注入的 createGem（随机格就地转化 + gem-transform 事件，连锁由外层
   * runCascades 下一轮吸收）；无注入时概率 <1 不生效（纯逻辑环境零事件、零随机消耗）。
   */
  bigMatchCreateGem: readonly {
    gem: SpecialGemKind;
    tier?: number;
    /** 六色族宝石（dragonGem/giantGem/spiritGem/manaPotionGem/candyGem）的归属基色 */
    color?: string;
    count: number;
    chance?: number;
    minSize: number;
  }[];
  /**
   * 配对 N 连时把生命转换为魔法（T5 杂项批 trascend「在配对 4 或 5 颗宝石时，将 2 点
   * 生命值替换成 2 点魔法值」）：持有者自身 1:1 交换，生命侧保底 1 点（特质不自杀），
   * 实际减少多少生命就等量加魔法（织网下的魔法增益拦截走 grantStat 既有口径）；
   * 不掷随机数。同类取先声明的一条，minSize 缺省 4。
   */
  onBigMatchConvert?: { from: 'hp'; to: 'magic'; amount: number; minSize: number };
  /**
   * 配对 N 连时按概率召唤兵种（T5 杂项批 genieslamp「配对 4+ 30% 召唤神灯之灵」/
   * stormflock「35% 召唤鸟妖法师」）。复用死亡召唤基建：概率经 TurnEngine 注入的
   * rng 判定，召唤物经注入的 summon 口按兵种数据装配并入队（容量/FIFO 同口径），
   * 归持有者一方；同类取概率更高的一条，minSize 缺省 4。
   */
  bigMatchSummon?: { chance: number; troopId: number; referenceName: string; displayName: string; minSize: number };
  /**
   * 配对 N 连时创造风暴（T5 杂项批 deadlywaters「配对 4/5 创造骸骨风暴」）。走 TurnEngine
   * 的全局唯一风暴顶替裁定（与技能造风暴同一 storm-change 事件形态），troopId 为虚拟
   * 风暴号段；同类取先声明的一条，minSize 缺省 4。
   */
  bigMatchStorm?: StormSummon & { troopId: number; referenceName: string; displayName: string; minSize: number };
  /**
   * 配对 N 连时按概率即杀（T5 杂项批 deathbelow「配对 4/5 有 8% 的几率猎杀最后一名敌人」）。
   * 即死原语（death-mark 的回合开始 10% 即死先例同族）：概率经注入的 rng 判定（无 rng
   * 不生效），目标取敌方队伍序末位存活（确定性），处决经注入的 kill 口走 defeat 出编队
   * 管线；同类取概率更高的一条，minSize 缺省 4。
   */
  bigMatchKill?: { chance: number; scope: 'lastEnemy'; minSize: number };
  /** 匹配某色宝石时的额外法力；键为颜色或 '*'（全色） */
  manaLink: Readonly<Record<string, number>>;
  /** 反弹给攻击者的骷髅伤害比例（0～1） */
  reflectSkullRatio: number;
  /** 闪避骷髅伤害的概率（0～1） */
  dodgeChance: number;
  /** 同队任一角色施法时获得（秘法/生气勃勃…） */
  gainOnAllyCast: StatGains;
  /** 敌方任一角色施法时获得（铭刻/怨恨…） */
  gainOnEnemyCast: StatGains;
  /** 敌方角色阵亡时获得（吸收生命/庆功…） */
  gainOnEnemyDeath: StatGains;
  /** 敌方角色阵亡时自身获得的状态（bloodlust「在敌人身亡时获得狂怒效果」） */
  onEnemyDeathStatus?: { id: string; turns: number };
  /**
   * 敌方角色阵亡时同队指定种族盟友获得的数值（lordofdeath「所有不死族在一名敌人身亡时
   * 获得 5 点生命值和魔法值」）。受益者为持有者一方该种族的存活盟友，含持有者本人；
   * troopType 'all' = 全队（virtueofjustice「当敌人身亡时，所有盟友获得 3 点攻击力和护甲值」）。
   */
  onEnemyDeathTypeAura?: { troopType: string; gains: Partial<StatGains> };
  /**
   * 同队角色阵亡时同队指定范围盟友获得的数值（virtueofsacrifice「当一名盟友身亡时，
   * 所有盟友获得 2 点攻击力和魔法值」）。受益者为持有者一方存活盟友（'all'=全队/种族名），
   * 与 onEnemyDeathTypeAura 同构、方向相反。
   */
  onAllyDeathTypeAura?: { troopType: string; gains: Partial<StatGains> };
  /**
   * 同队任一角色施法时同队指定范围盟友获得的数值（virtueofloyalty「当一名盟友施放法术时，
   * 所有盟友获得 3 点护甲值和生命值」）。持有者在施法方队伍时生效，受益者为该队存活盟友。
   */
  onAllyCastTypeAura?: { troopType: string; gains: Partial<StatGains> };
  /**
   * 自身承受伤害时同队指定范围盟友获得的数值（virtueofhumility「当自身生命值承受伤害时，
   * 所有盟友获得 2 点护甲值和魔法值」）。与 gainOnDamaged 同一触发点（骷髅受击结算处），
   * 受益者为受击者一方存活盟友（'all'=全队/种族名）。
   */
  onDamagedTypeAura?: { troopType: string; gains: Partial<StatGains> };
  /**
   * 敌方角色阵亡时使死者一方仍存活的「另一名敌人」陷入状态（sharedfate「在一名敌人
   * 身亡时，使另一名敌人陷入死亡标记状态」）。死者已被移出编队，目标取死者一方
   * 队伍序首个存活角色，确定性结算、不消耗随机数。
   */
  onEnemyDeathEnemyStatus?: { id: string; turns: number };
  /** 同队角色阵亡时获得（复仇者…） */
  gainOnAllyDeath: StatGains;
  /**
   * 自己身亡时向战场经济池入账（valuable「在自身身亡时获得 25 黄金」）。
   * 由 TurnEngine.processDeathTriggers 按行动开始的角色引用快照结算（阵亡者已移出
   * 编队），复用 creditEconomy 入账口（economy-gain 事件，side 记行动方）。
   */
  onDeathEconomy?: { currency: keyof TraitEconomyGain; amount: number };
  /**
   * 自己身亡时创造 N 颗特殊宝石（T4 批 unstablecore「在我身亡时创造 3 颗炸弹宝石」）。
   * 与 onDeathEconomy 同一结算点（行动末尾统一扫 defeat 事件），从行动开始的引用快照取
   * （阵亡者已移出编队）；落子为随机格就地转化（满盘创造的代理口径）。
   */
  onDeathCreateGem?: { gem: SpecialGemKind; tier?: number; count: number };
  /** 自己一方匹配 4 或 5 连时获得（庞然/巨型/修理…） */
  gainOnBigMatch: StatGains;
  /** 对特定种族的骷髅伤害倍率（屠戮类，如龙族杀手 ×2） */
  skullMultVsTroopType: Readonly<Record<string, number>>;
  /** 对处于特定状态的目标的骷髅伤害倍率（纵火狂对燃烧 ×2） */
  skullMultVsStatus: Readonly<Record<string, number>>;
  /** 对关联特定法力色的目标的骷髅伤害倍率（烈焰之恨对红色 ×2） */
  skullMultVsColor: Readonly<Record<string, number>>;
  /** 对已受伤（生命未满）目标的骷髅伤害倍率 */
  skullMultVsWounded: number;
  /** 骷髅伤害无视护甲的概率（穿透护甲 50%） */
  armorPierceChance: number;
  /** 匹配某色宝石时获得的数值（食人魔之怒/阳光…），键为颜色 */
  gainOnColorMatch: Readonly<Record<string, StatGains>>;
  /**
   * 无法成为技能「指定」目标（隐匿）。与下潮状态同一机制；
   * 全员都不可指定时由目标选择器退化为可指定，避免技能空放。
   */
  untargetable: boolean;
  /** 自己身亡时按概率召唤（daemonicpact 族；数据由生成器预解析到兵种） */
  summonOnDeath?: { chance: number; troopId: number; referenceName: string; displayName: string; storm?: StormSummon };
  /** 一名盟友（含自己）身亡时召唤（fromdark 族） */
  summonOnAllyDeath?: { chance: number; troopId: number; referenceName: string; displayName: string; storm?: StormSummon };
  /** 敌方角色身亡时召唤（darkdeath 族） */
  summonOnEnemyDeath?: { chance: number; troopId: number; referenceName: string; displayName: string; storm?: StormSummon };
  /**
   * 战后经济加成（merchant/necromancy/necromaster/moneybags 族，DECISIONS 四项拍板①）：
   * 战斗结束时对战场经济池的 gold/souls 总额按 (1 + Σratio) 一次性放大。
   * 多条特质同类比率相加；gems 无对应官方句式不设键。
   */
  battleEconomyGain?: { gold: number; souls: number };
  /**
   * 条件经济光环·大连版（greedy/extremegreed/pillageandplunder 族）：
   * 自己一方配对 N 连时向战场经济池入账，键为 minSize（缺省 4，「配对 4 或 5 颗」
   * 官方口径 = 任意大连）。多持有者各自入账（与 gainOnBigMatch 累加口径一致）。
   */
  bigMatchEconomyGain: Readonly<Record<string, TraitEconomyGain>>;
  /** 条件经济光环·骷髅版（darkensouls「在配对骷髅头时，获得 3 个灵魂」），骷髅匹配触发点结算 */
  skullMatchEconomyGain: TraitEconomyGain;
  /**
   * 模式专属·淘宝层属性（deepvitality/deepmagic/deepshield/deepstrength 族：「在淘宝模式中
   * 获得 N 点生命值/魔法值/护甲值/攻击力」，官方 RawData GameMode=delve_attacker）。
   * **标准战斗惰性**：按 stat 聚合累加（同一角色可持多条 deep* 特质），Delve 进层时才生效；
   * 本作未建模 Delve 层，战斗结算路径不读此字段——编译进 passive 是为了数据建模完整
   * （审计对账通过）与将来 Delve 模式直接消费，不需要回头查特质表。
   */
  onDelveGains: Partial<Record<'hp' | 'magic' | 'armor' | 'attack', number>>;
  /**
   * 模式专属·赏金（bountyhunter「基于我已晋升的稀有度获得 2 到 6 倍的赏金点数」，官方
   * Activation=end_battle_rewards / TraitType=bonus_bounty）：战后赏金点数倍率区间，
   * 下限/上限按晋升稀有度取位。**标准战斗惰性**（战后结算属 meta 层，本作未接入）；
   * 多条并存取区间最宽的一条。
   */
  onDelveBounty?: { min: number; max: number };
  /**
   * 模式专属·旅程英里（pathfinder「在自身旅程活动中获得 2x/2.5x/3x 英里，数量因自身晋升
   * 稀有度而定」）：英里倍率表，位序=晋升稀有度序。**标准战斗惰性**（旅程结算属 meta 层，
   * 本作未接入）；同类取先声明的一条。
   */
  onDelveMiles?: { multipliers: readonly number[] };
  /**
   * 模式专属·晋升度屠魔/攻城（godslayer/siegebreaker「基于我已晋升的稀有度对魔头/高塔
   * 造成 3 到 5 倍伤害」，官方 Filter=boss/castle）：骷髅伤害倍率区间，target boss=魔头 /
   * tower=高塔。**标准战斗惰性**：晋升度本作未建模，且魔头/高塔不是兵种种族（是模式构造），
   * 刻意**不**编译进 skullMultVs* 屠戮表——标准骷髅结算不读此字段，倍率不会泄漏进普通战斗；
   * 多条并存按声明序保留（同一角色可同时持 godslayer+siegebreaker）。
   */
  vsAscendedMultipliers: readonly { target: 'boss' | 'tower'; min: number; max: number }[];
  /**
   * 敌方宝石灵力倍率（jinx「将敌人的宝石灵力减半。」官方「Halve enemy Gem Masteries」，
   * Activation=start_battle / TraitType=adjust_all_masteries / Modifier=0.5）：本引擎以
   * 「匹配宝石产出的法力」作为 Gem Masteries 的落地模型——持有者的**敌方**队伍经
   * ManaDistributor 分得的宝石法力按此倍率折减（向下取整、保底 1，与疾病的法力减半
   * 同口径；法力灵链等直接法力 grant 不受影响）。多条并存取最强抑制（min）。
   * TurnEngine 构造期快照（开局生效全场持续，与 economyGainRatios 同口径）。
   */
  enemyMasteryMult: number;
  /**
   * 吞噬免疫（indigestible「对吞噬免疫。」官方「Immunity to Devour」）：引擎尚无吞噬
   * 机制，数据字段先行编译进 passive——吞噬机制将来落地时经 passivesOf 消费
   * （impervious 等全状态免疫的「吞噬」段由 statusImmunities ['*'] 覆盖，不经此字段）。
   */
  devourImmunity: boolean;
  /**
   * 盟友施法时的随机状态（goodtarot「Grant a random status effect to a random Ally when
   * an Ally casts a spell」/ badtarot 官方目标是随机 Enemy）。触发点 applyCastTriggers
   * 旁（castSkillAction 施法响应区）；池按 scope 取阵营——randomAlly=正面池、
   * randomEnemy=负面池（消费端与 skills/effects/status.ts 的 RANDOM_*_STATUS_POOL 同源），
   * 回合数 3（randomStatusEffect 缺省同款）。
   */
  castRandomStatus?: { scope: 'randomAlly' | 'randomEnemy' };
  /**
   * 施法显式状态（缺口清扫批）：onAllyCast=同队任一角色施法时（moonfestival 30% 法印随机
   * 盟友 / gibberingmadness 狂怒随机盟友 / hemlock 诅咒+疾病随机敌人）、onEnemyCast=敌方
   * 施法时（magehunter 自身狂怒 / psychicbacklash 击晕随机敌人）。与 castRandomStatus 同一
   * 触发点（applyCastRandomStatusTriggers 显式分支），施加经注入的 applyStatus（免疫在
   * 施加口拦截），概率/随机目标经注入的 rng，回合数 3（与大连施加同口径）。
   */
  castStatus?: {
    onAllyCast?: {
      scope: 'self' | 'randomAlly' | 'randomEnemy';
      statuses: readonly { id: string; magnitude?: number }[];
      turns: number;
      chance?: number;
    };
    onEnemyCast?: {
      scope: 'self' | 'randomAlly' | 'randomEnemy';
      statuses: readonly { id: string; magnitude?: number }[];
      turns: number;
      chance?: number;
    };
  };
  /**
   * 施法响应·敌方属性削减（psychicaffliction「消除所有敌人 1 点魔法值」/ succumb「敌人
   * 失去 4 点随机技能值」）。reduce 语义（持有者不进账）：stat 'random' 每次触发经注入的
   * rng 在四项属性中掷一条（无 rng 按随机技能值口径落 magic）；scope 'allEnemies' 逐个
   * 削减、零随机消耗。触发点与 castStatus 同点（applyCastRandomStatusTriggers）。
   */
  castEnemyDrain?: { stat: 'hp' | 'attack' | 'armor' | 'magic' | 'mana' | 'random'; amount: number; scope: 'allEnemies' | 'randomEnemy' };
  // —— 缺口清扫批惰性字段（同 onDelveGains 口径：编译进 passive 建模完整，战斗结算路径
  // 不读——对应钩子（回合/受击/施法的经济与召唤口、PVP 模式）落地时直接消费）——
  /** 回合开始经济入账（goldenhoard 5 黄金 / soulgatherer 4 灵魂）。惰性：回合开始钩子无经济口 */
  turnStartEconomyGains: TraitEconomyGain;
  /** 盟友施法时经济入账（soulverdict 3 灵魂）。惰性：施法响应区无经济口 */
  allyCastEconomyGains: TraitEconomyGain;
  /** 自身承伤时经济入账（pickpocket 10 黄金）。惰性：受击结算无经济口 */
  damagedEconomyGains: TraitEconomyGain;
  /** 回合开始按概率召唤兵种（harpyflock 5% 鸟妖 / parliamentarycall 10% 枭熊）。惰性：回合开始钩子无召唤口 */
  turnStartSummon?: { chance: number; troopId: number; referenceName: string; displayName: string };
  /**
   * 回合开始创造风暴（snowstorm 冰 / penumbra 暗 / endlessdawn 光 / dustplume 尘 /
   * shroudofskulls 骸骨 / unstablemind 疯狂 / fluxcapacitor 电 / astronomy 星 /
   * magmastorm 熔岩 / holly&ivy 冬青 / stormwinds 烈风）。惰性：回合开始棋盘钩子
   * （applyTurnStartBoardTraits）无风暴口。colors=官方 BoostColors（Filter 原色风暴单色、
   * 混合风暴双色，引擎风暴契约落地时取并集加权）；dropKind 为骷髅系掉落（骸骨风暴）。
   */
  turnStartStorm?: {
    referenceName: string;
    displayName: string;
    colors: readonly BaseColor[];
    dropKind?: 'skull' | 'doomSkull' | 'uberDoomSkull';
  };
  /**
   * PVP 限定（缺口清扫批 mode 字段 + pvpBonus 加成）：defender「防守 PVP 时盟友 +3 护甲」/
   * siege「进攻 PVP 时盟友 +2 攻击」/ virtueofhonor「PVP 战斗中自身全部技能 +10」。
   * **标准战斗惰性**：本作无 PVP 模式层，字段编译进 passive 建模完整、审计对账通过，
   * 战斗结算路径不读（phase=battle 时 gains 为持有者自身，attack/defense 时为全队）。
   */
  pvpMode: boolean;
  pvpBonuses: readonly { phase: 'attack' | 'defense' | 'battle'; gains: Partial<StatGains> }[];
  // —— 职业天赋批（meta 动态特质定义消费的新键；中性形态见 traits.neutralPassives）——
  /** 承受骷髅伤害时按概率召唤（golemprotector）；规格同死亡召唤，概率经注入 rng */
  summonOnDamaged?: { chance: number; troopId: number; referenceName: string; displayName: string };
  /** 同队施法时按概率召唤（childofsky）；召唤物归持有者一方 */
  summonOnAllyCast?: { chance: number; troopId: number; referenceName: string; displayName: string };
  /** 骷髅伤害附加护甲比（razorarmor「附加 20% 的护甲值」）：附加 = 自身护甲 × ratio */
  skullDamageFromArmorRatio?: number;
  /** 配对 4/5 连驱散所有敌人（banishment）：移除敌方全队存活正面状态 */
  onBigMatchDispelEnemies?: boolean;
  /** 配对 4/5 连净化自身（purification）：移除自身负面状态 */
  onBigMatchCleanseSelf?: boolean;
  /** 配对 4/5 连窃取首位敌人生命（lifesiphon）；经注入 drainLife 结算 */
  onBigMatchDrainLife?: { amount: number; minSize?: number };
  /** 配对 4/5 连爆破关联色宝石（lightningstrike）；经注入爆破口结算 */
  onBigMatchExplodeGem?: readonly { color: string; count: number; minSize: number }[];
  /** 配对 4/5 连召唤随机风暴（chaosstorm）；经注入 setStorm + rng 掷色 */
  onBigMatchRandomStorm?: { minSize: number };
  /** 自己召唤部队后使随机敌人陷入状态（hauntedweave）；施加经注入 applyStatus */
  onSelfSummonStatus?: { statuses: readonly { id: string; magnitude?: number }[]; turns: number };
  /** 同队阵亡时施加状态（savior 随机盟友屏障 / feyvengeance、upinflames 随机敌人） */
  onAllyDeathStatus?: {
    target: 'randomAlly' | 'randomEnemy';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
  };
  /** 敌方阵亡时使死者一方另一名随机存活陷入状态（chillofdeath） */
  onEnemyDeathRandomStatus?: { statuses: readonly { id: string; magnitude?: number }[]; turns: number };
  /** 敌方阵亡时按概率猎杀最后一名敌人（risingshadows）；处决经注入 kill */
  onEnemyDeathKill?: { chance: number; scope: 'lastEnemy' };
  /** 匹配骷髅头时所有敌人随机损失技能（chaoswave）；stat 'random' 经 rng 掷项 */
  onSkullMatchEnemyDrain?: { stat: 'attack' | 'armor' | 'magic' | 'mana' | 'random'; amount: number };
  // —— 职业特质收编批（perk 动态定义消费）——
  /** 敌方施法时同队指定范围盟友获得（portent）；与 onAllyCastTypeAura 同构反向 */
  onEnemyCastTypeAura?: { troopType: string; gains: Partial<StatGains> };
  /** 敌方身亡时使其一方全部存活陷入状态（brutalstrike） */
  onEnemyDeathEnemyAllStatus?: { statuses: readonly { id: string; magnitude?: number }[]; turns: number };
  /** 自己身亡时使敌方全部存活陷入状态（deathcurse）；死者被动经行动开始快照取 */
  onSelfDeathEnemyAllStatus?: { statuses: readonly { id: string; magnitude?: number }[]; turns: number };
  /** 骷髅伤害即死概率（bullseye「15% 几率一击致命」）；骷髅结算口判定 */
  skullLethalChance?: number;
  /** 造成骷髅伤害时按概率猎杀末位敌人（assassinate） */
  onSkullHitKill?: { chance: number; scope: 'lastEnemy' };
  // —— R22 吞噬批（voracious/consumefuel/bloodyfeast；TurnEngine 消费，复用 devourEffect 原语）——
  /** 造成骷髅伤害时按概率吞噬本次受击目标（voracious 贪食）；吞噬免疫在原语口拦截 */
  onSkullHitDevour?: { chance: number };
  /** 承受骷髅伤害时按概率吞噬攻击者（consumefuel 消耗燃料；官方「第一个敌人」= 受击时攻击者即敌方队首） */
  onSkullDamagedDevour?: { chance: number };
  /** 敌方角色阵亡时按概率吞噬死者一方随机一名存活（bloodyfeast 血腥盛宴） */
  onEnemyDeathDevour?: { chance: number };
  // —— 自复活/凤凰涅槃批（Sunbird「浴火重生」官方 "Die and rise from the Ashes"；出编队口消费）——
  /**
   * 死亡时自我复活（凤凰涅槃浴火重生）：本次伤害致死的 defeat 事件在出编队（resolveDefeatEvents
   * 移除编队）之前被拦截——掷中后**不走 defeat 路径**（defeat 事件从事件流剔除，死亡扫描
   * processDeathTriggers 不触发任何阵亡钩子），原位回血复活并发 buff(hp) 事件（官方口径 = 死亡被撤销）。
   * healPct 缺省 0.5（复活到 50% maxHp）；full=true 满血复活；fullMana=true 同时法力回满
   * （deepsoul「复活并恢复全部魔力」口径）；chance 缺省 1（必发；<1 时经同一条种子化 rng 掷签，
   * 无 selfRevive 角色零 rng 消耗，护栏不破坏）。消费在 TurnEngine/prototypes 的出编队统一口
   * （skills/effects/summon.ts resolveDefeatAfterRevive）。
   */
  selfRevive?: { chance?: number; healPct?: number; full?: boolean; fullMana?: boolean };
  /** PvP 战斗结算荣耀映射（bloodandglory「PvP 战斗中获得 1 点荣耀」→ 本作映射黄金）：
   *  GameOver 且 pvpMode 时对持有者（玩家侧）入账 */
  pvpEconomyGain?: { currency: 'gold' | 'souls'; amount: number };
}

/** 条件经济光环的入账数额（按币种；maps 无对应官方句式不设键） */
export interface TraitEconomyGain {
  gold: number;
  souls: number;
  gems: number;
}

/**
 * 骷髅系风暴的掉落目标（官方 Bonestorm / Doomstorm / Uber Doomstorm 语义，查证结论
 * 见 DECISIONS.md「风暴（Storm）全局掉落修正」第 2 节）：
 * - 'skull'         骸骨风暴：骷髅头掉率提升（skullChance × STORM_DROP_WEIGHT）；
 * - 'doomSkull'     末日风暴：末日骷髅开始从顶部掉落；
 * - 'uberDoomSkull' 超级末日风暴：至尊末日骷髅开始从顶部掉落。
 * 颜色风暴契约（Team.storm.color: BaseColor）只支持颜色加权，dropKind 是预留的扩展位：
 * 设置后掉落加权作用于骷髅系宝石，color 仅作表现层主色（近似色系）。
 */
export type SkullStormDropKind = 'skull' | 'doomSkull' | 'uberDoomSkull';

/**
 * 死亡召唤的风暴变体载荷（阶段 1.3）：spec 带 storm 时该召唤**不产出兵种**
 * （referenceName/displayName 仅作展示，troopId 为虚拟风暴号段 9001~9009），
 * 改为设置持有者一方的全局风暴（Team.storm），持续 turns 回合。
 * 颜色映射与查证来源见 DECISIONS.md「风暴（Storm）全局掉落修正」。
 */
export interface StormSummon {
  color: BaseColor;
  turns: number;
  /** 骷髅系风暴（骸骨/末日/超级末日）：掉落加权目标；缺省 = 颜色风暴（加权 color） */
  dropKind?: SkullStormDropKind;
}

/** A summoned character waiting off-field for the next open active slot. */
export interface QueuedSummon {
  character: Character;
  troopId: number;
}

/** Active roster is ordered top-to-bottom and capped at four characters. */
export interface Team {
  player: PlayerSide;
  characters: Character[];
  /** FIFO summon bench. Entries promote to the bottom when an active character is defeated. */
  summonQueue?: QueuedSummon[];
  /**
   * 风暴全局掉落修正（Storm / Mana Storm）。不是 Character：不占编队位、无血量、
   * 不可被攻击，仅按 color 修正 refill 掉落权重。字段挂在持有方 Team 上；
   * 全场同时只允许一个风暴（后召顶替先召），将来放开为每方一个时天然兼容。
   * turns 为剩余回合数，回合尾递减，归零清除。
   * dropKind 设置时为骷髅系风暴（骸骨/末日/超级末日）：加权作用于骷髅系掉落，
   * color 仅作表现层主色（见 SkullStormDropKind）。
   */
  storm?: { color: BaseColor; turns: number; troopId: number; dropKind?: SkullStormDropKind };
}
