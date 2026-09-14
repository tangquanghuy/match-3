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
  /** 通配：可与任意颜色直线匹配；tier 为该次匹配法力收益倍率（2/4） */
  | 'wildcard'
  /** 许愿：不可匹配；被摧毁时 5 选 1 随机回蓝（20% 是"双方全员回满"的坑） */
  | 'wish'
  /** 沙漏：可匹配（黄色）；被匹配时获得一次额外回合 */
  | 'hourglass'
  /**
   * 幽魂：官方语义为"被摧毁时获得 10 灵魂"（战斗外货币，已裁定暂不实现，语义改造待定）。
   * 当前无任何行为、不可匹配、无自然掉落——仅素材先行接入，引擎遇到时按普通移除处理。
   */
  | 'ghost';

/** 特殊宝石规格（需求 20.1）。tier 仅通配宝石使用（法力倍率）。 */
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

/** 可匹配特殊宝石参与匹配时视作的颜色（不可匹配的炸弹/许愿不在表内） */
export const SPECIAL_MATCH_COLOR: Partial<Record<SpecialGemKind, BaseColor>> = {
  web: BaseColor.Purple,
  hourglass: BaseColor.Yellow,
  lightningCol: BaseColor.Yellow,
  lightningRow: BaseColor.Blue,
};

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
 */
export type ActionOutcome = 'switched' | 'extra-turn' | 'game-over';

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
  /** 自己造成骷髅伤害时获得的数值 */
  gainOnSkullHit: StatGains;
  inflictOnSkullHit?: { id: string; turns: number; magnitude?: number };
  /** 承受骷髅伤害时给攻击者施加的状态（毒孢子族：被打时反手让敌人中毒） */
  inflictOnSkullDamaged?: { id: string; turns: number; magnitude?: number };
  /** 自己一方匹配 4/5 连时，给同队指定种族盟友的增益（firstwargare/overclock 族）；键为种族或 'all'（全队） */
  bigMatchTypeAura: Readonly<Record<string, StatGains>>;
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
  /** 同队角色阵亡时获得（复仇者…） */
  gainOnAllyDeath: StatGains;
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
  summonOnDeath?: { chance: number; troopId: number; referenceName: string; displayName: string };
  /** 一名盟友（含自己）身亡时召唤（fromdark 族） */
  summonOnAllyDeath?: { chance: number; troopId: number; referenceName: string; displayName: string };
  /** 敌方角色身亡时召唤（darkdeath 族） */
  summonOnEnemyDeath?: { chance: number; troopId: number; referenceName: string; displayName: string };
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
}
