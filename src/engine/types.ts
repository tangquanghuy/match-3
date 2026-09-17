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
  | 'barrierGem';

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
 * wildcard 的 tier 表示法力倍率；bootyGem 的 tier 1-8 仅选择价值链外观。
 */
export interface SpecialGemSpec {
  kind: SpecialGemKind;
  tier?: number;
}

/** 末日骷髅被匹配时的额外骷髅伤害（官方 +5） */
export const DOOMSKULL_BONUS_DAMAGE = 5;
/** 至尊末日骷髅被匹配时的额外骷髅伤害（官方更强变体，双倍于末日骷髅） */
export const UBER_DOOMSKULL_BONUS_DAMAGE = 10;
/** 织网宝石对随机敌人施加 web 状态的回合数（与特质表 web 时长约定一致） */
export const WEB_GEM_TURNS = 3;
/** 赃物宝石被摧毁时给摧毁方的金币数（官方 Heroic Gems 原文：10 Gold） */
export const BOOTY_GEM_GOLD = 10;

/** 可匹配特殊宝石参与匹配时视作的颜色（不可匹配的炸弹/许愿/幽魂/死亡标记不在表内） */
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

/** 便捷构造：特殊宝石 */
export function specialGem(kind: SpecialGemKind, tier?: number): GemType {
  const spec: SpecialGemSpec = tier === undefined ? { kind } : { kind, tier };
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
 * 不可匹配（炸弹/许愿）返回 null。MatchResolver 的 run 级扫描与 isSameMatchType 共用。
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
      return SPECIAL_MATCH_COLOR[type.spec.kind] ?? null;
    }
  }
}

/**
 * 判断两个宝石类型是否"可匹配同类"。
 * 颜色按色名；末日骷髅与普通骷髅同族；织网/沙漏/闪电按各自归属色；
 * 通配与任意颜色同类（不与骷髅族相连）；炸弹/许愿与任何宝石都不同类（只能被消除管线触发）。
 */
export function isSameMatchType(a: GemType, b: GemType): boolean {
  const ka = matchJoinKey(a);
  const kb = matchJoinKey(b);
  if (ka === null || kb === null) return false;
  if (ka === 'wildcard' || kb === 'wildcard') {
    return ka !== 'skull' && kb !== 'skull';
  }
  return ka === kb;
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
  /** 自身受到伤害后获得的数值 */
  gainOnDamaged: StatGains;
  /**
   * 自身受到伤害后获得的**状态**（aquatic「在自身受到伤害时使自身下潜」）。
   * 与 gainOnDamaged 同一触发点（骷髅受击结算处，闪避/屏障/挣扎路径不触发），
   * 施加经 applyStatus（免疫在 applyStatus 内拦截）。
   */
  onDamagedStatus?: { statusId: string; turns: number };
  /** 法力操作免疫（manashield「对法力灼烧、法力耗尽和法力窃取免疫」）：
   *  法力耗（耗蓝/耗尽/减半）与窃取（stat='mana' 的 reduce 原语，含窃取回灌）在执行
   *  入口对带此被动的目标整体跳过。灼烧另有 mana-burn 状态免疫（statusImmunities）。 */
  manaOpsImmunity: boolean;
  /** 自己造成骷髅伤害时获得的数值 */
  gainOnSkullHit: StatGains;
  inflictOnSkullHit?: { id: string; turns: number; magnitude?: number };
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
   * randomEnemy=随机一名存活敌人（winterveil「冻结一名随机敌人」）。
   * statuses 逐条施加（bloodcoldrage 一条特质带冻结+出血两条）；DoT 才带 magnitude。
   * chance 为触发概率（lotusblessing 50%），缺省必定；minSize 限定触发的大连颗数（缺省 4）。
   */
  onBigMatchStatus?: {
    scope: 'self' | 'randomAlly' | 'allAllies' | 'allEnemies' | 'randomEnemy';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
    chance?: number;
    randomPositive?: boolean;
    minSize?: number;
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
   * 配对某色（或骷髅）宝石时给随机一名敌人施加状态（T5 配色状态批 16 code：
   * molten/sunfire/deepwounds…）。外层色键同 gainOnEnemyColorMatch（'skull'=骷髅匹配）；
   * scope 当前仅 randomEnemy（「（随机）使一名随机敌人陷入X状态」句式族，多条 statuses
   * 逐条施加，enchantedvines 缠绕+妖火）。触发点 applyColorMatchTriggers（配色触发同点），
   * 施加经 TurnEngine 注入的 applyStatus（免疫在施加口拦截），随机目标与概率
   * （foxfire 50% 用 chance）消耗注入的 rng；无注入时概率 <1 不生效、目标退化为首个存活。
   */
  colorMatchStatus: Readonly<Record<string, {
    scope: 'randomEnemy';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
    chance?: number;
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
   * 自己一方配对 4+ 连时对敌人造成技能伤害（T5 大连伤害批 3 code：shock/tentacles/
   * lightningbolt「在配对 4 或 5 颗宝石时对…造成 N 点伤害」）。多条并存按声明序逐条结算，
   * minSize 缺省 4；伤害经 TurnEngine 注入的 damage（damageOne 管线）产出 skill-damage
   * 事件，randomEnemy 每条规格消耗一次注入的 rng。
   */
  bigMatchDamage: readonly {
    amount: number;
    scope: 'randomEnemy' | 'enemyAll';
    minSize: number;
  }[];
  /**
   * 自己一方配对 4+ 连时削减敌方属性（T5 大连敌减批 5 code：suppression/aspectofplague/
   * technomancy/creepinggloom/chillingaura「敌人损失/耗掉/窃取 N 点X」）。reduce 语义
   * （持有者不进账）：目标属性夹零发负 buff 事件，mana 为耗蓝口径（manashield 免疫在
   * 削减口拦截）；front=首位存活敌人、randomEnemy 每条规格消耗一次注入的 rng；
   * minSize 缺省 4。
   */
  bigMatchEnemyDrain: readonly {
    stat: 'attack' | 'armor' | 'magic' | 'mana';
    amount: number;
    scope: 'front' | 'randomEnemy';
    minSize: number;
  }[];
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
   * 获得 5 点生命值和魔法值」）。受益者为持有者一方该种族的存活盟友，含持有者本人。
   */
  onEnemyDeathTypeAura?: { troopType: string; gains: Partial<StatGains> };
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
