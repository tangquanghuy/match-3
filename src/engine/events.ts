import type { CellPos, GemType, BaseColor, PlayerSide } from './types';
import type { MatchShape } from './MatchResolver';
import type { GemMove, GemSpawn } from './GravitySystem';

/**
 * 游戏事件定义（需求 18）。
 * 事件流是逻辑层与表现层之间唯一的契约。每个事件自带足够数据，
 * 使表现层无需回查引擎状态即可制作动画（需求 18.5）。
 */

export interface SwapEvent {
  type: 'swap';
  a: CellPos;
  b: CellPos;
  gemIdA: number; // 交换前位于 a 的宝石
  gemIdB: number; // 交换前位于 b 的宝石
}

export interface SwapRejectedEvent {
  type: 'swap-rejected';
  a: CellPos;
  b: CellPos;
  gemIdA: number;
  gemIdB: number;
}

export interface EliminationEvent {
  type: 'elimination';
  chainCount: number; // 需求 8.8
  cells: { pos: CellPos; gemId: number; gemType: GemType }[];
  shape: MatchShape; // 需求 7, 19.11
}

export interface ManaGainEvent {
  type: 'mana-gain';
  color: BaseColor;
  amount: number;
  characterId: number;
  player: PlayerSide;
}

export interface SkullDamageEvent {
  type: 'skull-damage';
  attackerId: number; // 队首存活攻击者（需求 14.5）
  targetId: number;
  damage: number;
  resultingHp: number;
  resultingArmor: number;
}

export interface SkillCastEvent {
  type: 'skill-cast';
  characterId: number;
  skillId: string;
}

export interface DefeatEvent {
  type: 'defeat';
  characterId: number;
}

export interface GravityEvent {
  type: 'gravity';
  chainCount: number;
  moves: GemMove[];
}

export interface RefillEvent {
  type: 'refill';
  chainCount: number;
  spawns: GemSpawn[];
}

/** 洗牌（死局重排，无合法交换时触发） */
export interface ReshuffleEvent {
  type: 'reshuffle';
  moves: { gemId: number; from: CellPos; to: CellPos }[];
}

/** 特殊宝石生成钩子（需求 7.4, 7.5）—— 本阶段仅标记，不生成 */
export interface SpecialGemHookEvent {
  type: 'special-gem-hook';
  pos: CellPos;
  reason: 'match5' | 'L' | 'T';
}

export interface ExtraTurnEvent {
  type: 'extra-turn';
  player: PlayerSide;
}

export interface TurnEndEvent {
  type: 'turn-end';
  nextPlayer: PlayerSide;
}

export interface GameOverEvent {
  type: 'game-over';
  winner: PlayerSide;
}

/** 全部事件的可辨识联合 */
export type GameEvent =
  | SwapEvent
  | SwapRejectedEvent
  | EliminationEvent
  | ManaGainEvent
  | SkullDamageEvent
  | SkillCastEvent
  | DefeatEvent
  | GravityEvent
  | RefillEvent
  | ReshuffleEvent
  | SpecialGemHookEvent
  | ExtraTurnEvent
  | TurnEndEvent
  | GameOverEvent;

/** 事件流 */
export type EventStream = GameEvent[];
