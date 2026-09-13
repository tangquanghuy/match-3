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

/**
 * 攻击落空（队首攻击者被控无法攻击：冰冻/缠绕/击晕）。
 * 表现层播放"原地挣扎/小幅前冲被拉回"动画，不造成伤害。
 */
export interface AttackStruggleEvent {
  type: 'attack-struggle';
  attackerId: number;
  /** 攻击未造成伤害的原因（供表现层可选区分）。barrier 为屏障整发吸收。 */
  reason: 'frozen' | 'entangle' | 'stun' | 'dodge' | 'barrier';
}

export interface SkillCastEvent {
  type: 'skill-cast';
  characterId: number;
  skillId: string;
}

/**
 * 技能造成的伤害（需求 3.1, 6.5）。
 * 与骷髅伤害区分：由技能效果原语产出，携带足够动画数据。
 */
export interface SkillDamageEvent {
  type: 'skill-damage';
  casterId: number;
  targetId: number;
  /** Presentation semantics: splash uses a dedicated no-projectile impact. */
  range: 'single' | 'all' | 'splash';
  /** Splash-chain presentation metadata; absent for ordinary damage. */
  chainIndex?: number;
  chainCount?: number;
  chainFromId?: number;
  damage: number;
  resultingHp: number;
  resultingArmor: number;
}

/** 创造宝石（需求 7.1, 7.4）。spawns 携带落点、稳定 id 与类型供动画。 */
export interface GemCreateEvent {
  type: 'gem-create';
  spawns: { pos: CellPos; gemId: number; gemType: GemType }[];
}

/** 转化宝石颜色/类型（需求 7.1, 7.4）。 */
export interface GemTransformEvent {
  type: 'gem-transform';
  changes: { pos: CellPos; gemId: number; from: GemType; to: GemType }[];
}

/** 摧毁宝石（只清目标本身，需求 7.1, 7.4）。cells 携带被清宝石的 id 与类型。 */
export interface GemDestroyEvent {
  type: 'gem-destroy';
  cells: { pos: CellPos; gemId: number; gemType: GemType }[];
}

/** 爆破宝石（目标 + 辐射一圈，需求 7.1, 7.4）。cells 同上；表现层用向外冲击波区别于摧毁。 */
export interface GemExplodeEvent {
  type: 'gem-explode';
  cells: { pos: CellPos; gemId: number; gemType: GemType }[];
}

/** 清除类事件（摧毁/爆破）共用的 cells 结构别名，供效果原语内部复用 */
export type GemClearEvent = GemDestroyEvent | GemExplodeEvent;

/** 增益/资源变更（需求 8.5）。stat 指明被改的属性，amount 为实际变化量。 */
export interface BuffEvent {
  type: 'buff';
  targetId: number;
  stat: 'attack' | 'armor' | 'hp' | 'mana' | 'magic';
  amount: number;
}

/** 施加状态（需求 9.1）。 */
export interface StatusApplyEvent {
  type: 'status-apply';
  targetId: number;
  statusId: string;
  turns: number;
}

/** 状态回合结算（需求 9.2）。DoT 类携带本次伤害量。 */
export interface StatusTickEvent {
  type: 'status-tick';
  targetId: number;
  statusId: string;
  damage?: number;
}

/** 状态到期移除（需求 9.5）。 */
export interface StatusExpireEvent {
  type: 'status-expire';
  targetId: number;
  statusId: string;
}

/** Skill-driven removal of negative/all status effects from one target. */
export interface StatusCleanseEvent {
  type: 'status-cleanse';
  targetId: number;
  statusIds: string[];
}

/** 召唤新角色入队伍空位（需求 10.3, 10.4）。 */
export interface SummonEvent {
  type: 'summon';
  player: PlayerSide;
  /** Active field slot or FIFO queue index. */
  slot: number;
  troopId: number;
  characterId: number;
  destination: 'field' | 'queue';
  /** True when this event promotes an earlier queued summon after a defeat. */
  fromQueue?: boolean;
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
  /** 来源：技能主动给（skill，配 0082 大动画）或三消 4/5连·L/T形给（match，仅轻反馈）。 */
  source: 'skill' | 'match';
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
  | AttackStruggleEvent
  | SkillCastEvent
  | SkillDamageEvent
  | GemCreateEvent
  | GemTransformEvent
  | GemDestroyEvent
  | GemExplodeEvent
  | BuffEvent
  | StatusApplyEvent
  | StatusTickEvent
  | StatusExpireEvent
  | StatusCleanseEvent
  | SummonEvent
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
