import type { CellPos, GemType, BaseColor, PlayerSide, SpecialGemKind, SkullStormDropKind } from './types';
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
  /**
   * 骷髅爆炸演出元数据（炸毁骷髅结算，TurnEngine.settleExplodedSkulls）：
   * 爆炸源格位（被炸骷髅的质心，表现层从该点向目标发射骷髅弹体）+ 被炸构成
   * （普通/末日/至尊数量，决定弹体数量与贴图）。普通技能伤害缺省。
   */
  originCell?: CellPos;
  skullBurst?: { normal: number; doom: number; uber: number };
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

/**
 * 特殊宝石触发（需求 20.1）：末日骷髅匹配引爆、炸弹爆炸、闪电清行列、织网施网、
 * 沙漏额外回合、许愿回蓝。表现层据此放触发特效/飘字；实际被清除的格子随后经
 * 既有 gem-explode / gem-destroy 事件下发，法力经 buff、状态经 status-apply。
 */
export interface SpecialGemTriggerEvent {
  type: 'special-gem-trigger';
  kind: SpecialGemKind;
  /** 触发宝石所在格 */
  pos: CellPos;
  /** 闪电：被清空的行号（lightningRow）或列号（lightningCol） */
  line?: number;
  /** 许愿：抽中选项（0..2=随机 1/2/3 名己方，3=己方全员，4=双方全员）与受益角色 */
  wish?: { option: number; targetIds: number[] };
}

/**
 * 风暴全局掉落修正变更。风暴不是兵种：不占编队位、无血量、不可被攻击，
 * 仅按颜色修正 refill 掉落权重。全场同时最多一个风暴（后召顶替先召）。
 * - set：风暴首次生效（color 非 null）
 * - replaced：新风暴顶替旧风暴（prevColor 为被顶掉的颜色；被顶方若是另一方，
 *   该方也会收到一条 color=null 的 replaced，供表现层撤除其指示器）
 * - expired：持续计数器归零清除（color=null）
 */
export interface StormChangeEvent {
  type: 'storm-change';
  player: PlayerSide;
  color: BaseColor | null;
  reason: 'set' | 'replaced' | 'expired';
  prevColor?: BaseColor;
  /** 骷髅系风暴（骸骨/末日/超级末日）的掉落目标；颜色风暴缺省 */
  dropKind?: SkullStormDropKind;
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
  | SpecialGemTriggerEvent
  | StormChangeEvent
  | ExtraTurnEvent
  | TurnEndEvent
  | GameOverEvent;

/** 事件流 */
export type EventStream = GameEvent[];
