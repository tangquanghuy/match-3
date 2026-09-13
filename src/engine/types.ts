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

/** 特殊宝石规格（需求 20.1）—— 本阶段已定义，未启用行为 */
export interface SpecialGemSpec {
  kind: 'lightning' | 'bomb' | 'giantSkull' | string;
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

/** 判断两个宝石类型是否"可匹配同类"（同色，或同为骷髅） */
export function isSameMatchType(a: GemType, b: GemType): boolean {
  if (a.kind === 'color' && b.kind === 'color') return a.color === b.color;
  if (a.kind === 'skull' && b.kind === 'skull') return true;
  return false;
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
