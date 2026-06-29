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

/** 法力需求：每种颜色一个所需阈值（需求 10.2） */
export type ManaRequirement = Partial<Record<BaseColor, number>>;

/** 法力池：每种颜色当前累积值（需求 10.1, 10.3） */
export type ManaPool = Partial<Record<BaseColor, number>>;

/** 状态效果接口（需求 20.3）—— 本阶段为空壳，不产生效果 */
export interface StatusEffect {
  id: string;
}

/** 角色（需求 13） */
export interface Character {
  id: number;
  name: string;
  maxHp: number;
  hp: number;
  attack: number;
  armor: number;
  colors: BaseColor[];
  manaRequirement: ManaRequirement;
  manaPool: ManaPool;
  skillId: string;
  statuses: StatusEffect[];
  defeated: boolean;
}

/** 队伍：4 名角色，索引 0=顶 3=底 */
export interface Team {
  player: PlayerSide;
  characters: Character[];
}
