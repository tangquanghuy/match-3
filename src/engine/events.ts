import type { CellPos, GemType, BaseColor, PlayerSide, SpecialGemKind, SkullStormDropKind } from './types';
import type { MatchShape } from './MatchResolver';
import type { GemMove, GemSpawn } from './GravitySystem';

/**
 * 游戏事件定义（需求 18）。
 * 事件流是逻辑层与表现层之间唯一的契约。每个事件自带足够数据，
 * 使表现层无需回查引擎状态即可制作动画（需求 18.5）。
 */

/** Presentation-only provenance, captured when an effect actually resolves. */
export interface TraitActivation {
  characterId: number;
  traitId: string;
  name: string;
}
export interface TraitPresentation {
  traitActivations?: TraitActivation[];
}

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

/** Board-only merge: consumed pieces travel into a surviving, upgraded piece. */
export interface GemMergeEvent {
  type: 'gem-merge';
  chainCount: number;
  groups: {
    target: { pos: CellPos; gemId: number; gemType: GemType };
    consumed: { pos: CellPos; gemId: number }[];
  }[];
}

export interface ManaGainEvent extends TraitPresentation {
  type: 'mana-gain';
  color: BaseColor;
  amount: number;
  characterId: number;
  player: PlayerSide;
  /** 本次来自 Mana Surge（3 消概率翻倍 / 5+ 必翻倍）。缺省 = 普通入账。 */
  surge?: boolean;
  /**
   * 疾病使本次入账减半（纯演出元数据）：amount 已是减半后的实际值，
   * 表现层据此标注「疾病 减半」——否则玩家看到消了 4 颗只加 2 点会以为是 bug。
   */
  halved?: boolean;
}

export interface SkullDamageEvent extends TraitPresentation {
  type: 'skull-damage';
  attackerId: number; // 队首存活攻击者（需求 14.5）
  targetId: number;
  damage: number;
  resultingHp: number;
  resultingArmor: number;
  /**
   * 反弹伤害标记（炼狱护甲/荆棘/米提护甲 + Reflect 状态）：本次伤害是受击方反弹给
   * 攻击者的，attackerId 是反弹方。表现层据此不播攻击冲撞（否则看起来像双方对撞），
   * 只给受弹方受击反馈。
   */
  reflected?: boolean;
}

/**
 * 攻击落空（队首攻击者被控无法攻击：冰冻/缠绕/击晕）。
 * 表现层播放"原地挣扎/小幅前冲被拉回"动画，不造成伤害。
 */
export interface AttackStruggleEvent extends TraitPresentation {
  type: 'attack-struggle';
  attackerId: number;
  /** 攻击未造成伤害的原因（供表现层可选区分）。barrier 为屏障整发吸收。 */
  reason: 'frozen' | 'entangle' | 'stun' | 'dodge' | 'barrier';
  /** 被打的目标（dodge / barrier 时给出：攻击确实打过去了，表现层要播冲撞 + 格挡/闪避） */
  targetId?: number;
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
export interface SkillDamageEvent extends TraitPresentation {
  /** Confirmed lethal devour, not an ordinary lethal spell or a blocked attempt. */
  devoured?: boolean;
  type: 'skill-damage';
  casterId: number;
  targetId: number;
  /** Presentation semantics: splash uses a dedicated no-projectile impact. */
  range: 'single' | 'all' | 'splash' | 'scatter';
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
  /** 反射状态弹回的法术伤害：casterId 是反射方（表现层不当作一次主动施法）。 */
  reflected?: boolean;
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
  /** 原生 Remove（只拿走、不结算法力/骷髅/资源，P-F1-remove-gems） */
  removed?: boolean;
}

/** 爆破宝石（目标 + 辐射一圈，需求 7.1, 7.4）。cells 同上；表现层用向外冲击波区别于摧毁。 */
export interface GemExplodeEvent {
  type: 'gem-explode';
  cells: { pos: CellPos; gemId: number; gemType: GemType }[];
}

/** 清除类事件（摧毁/爆破）共用的 cells 结构别名，供效果原语内部复用 */
export type GemClearEvent = GemDestroyEvent | GemExplodeEvent;

/**
 * 增益/资源变更（需求 8.5）。stat 指明被改的属性，amount 为实际变化量。
 *
 * source 标记（表现层轻量通道裁定 2026-09-19）：特质/被动触发的 buff（每回合回复、
 * 受击增益、施法响应光环、回合开始削减……）触发频率高，表现层只飘字+刷新卡面，
 * 不播音效、不占序列帧时长；技能段（effects/buff.ts 等）不带标记，走完整反馈。
 */
export interface BuffEvent extends TraitPresentation {
  type: 'buff';
  targetId: number;
  stat: 'attack' | 'armor' | 'hp' | 'mana' | 'magic';
  amount: number;
  /** IncreaseHealth growth, for event-only projections; omitted for pure healing. */
  maxHpGain?: number;
  source?: 'trait';
}

/** 施加状态（需求 9.1）。 */
export interface StatusApplyEvent {
  type: 'status-apply';
  targetId: number;
  statusId: string;
  turns: number;
  /** 施加后的层数（仅出血等有层数语义的状态；纯演出元数据）。 */
  stacks?: number;
  /** 目标此前已有同 id 状态：本次是刷新/叠层而非新挂（表现层只脉冲既有徽记）。 */
  refreshed?: boolean;
}

/**
 * 状态被拦截/机制被状态抵消（纯演出元数据，不改变任何结算）：
 *   - immune：特质免疫挡下施加；blessed：赐福挡下负面状态；
 *   - submerged：下潮躲开覆盖整队的法术伤害；
 *   - extra-turn：冰冻吞掉本应获得的匹配额外回合（targetId=被冻结的相关单位）；
 *   - mana：沉默使该单位跳过本次充能（法力流向下一个吃该色的队友）。
 */
export interface StatusBlockedEvent extends TraitPresentation {
  type: 'status-blocked';
  targetId: number;
  statusId: string;
  reason: 'immune' | 'blessed' | 'submerged' | 'extra-turn' | 'mana';
}

/** 状态移除原因（纯演出元数据；缺省视为 expired）。 */
export type StatusExpireReason =
  | 'expired'    // 旧式倒计时归零
  | 'recovered'  // 累积自愈掷中（挣脱）
  | 'consumed'   // 屏障/反射/狂怒被一次伤害消耗
  | 'cast'       // 附魔：施法移除
  | 'action'     // 潜水/赐福：持有者行动后移除
  | 'stripped'   // 诅咒剥离正面状态 / 诅咒×赐福互消
  | 'cleansed'   // 赐福施加时净化负面
  | 'dispelled'  // 技能定向驱散
  | 'transform'; // 变身清空

/** 状态回合结算（需求 9.2）。DoT 类携带本次伤害量。 */
export interface StatusTickEvent {
  type: 'status-tick';
  targetId: number;
  statusId: string;
  /** Life lost on this tick (never includes armor). */
  damage?: number;
  /** Armor lost on this tick (Burning only). */
  armorDamage?: number;
}

/** 状态到期移除（需求 9.5）。 */
export interface StatusExpireEvent {
  type: 'status-expire';
  targetId: number;
  statusId: string;
  /**
   * 屏障被一发法术伤害打掉时的来源（纯演出元数据）：表现层据此从施法者打一发弹道到目标、
   * 在目标身上播格挡。骷髅普攻打掉屏障走 attack-struggle(reason='barrier')，不带这个字段。
   */
  absorbedFrom?: { casterId: number; range: string };
  /** 移除原因（演出元数据，缺省=expired）。 */
  reason?: StatusExpireReason;
}

/** Skill-driven removal of negative/all status effects from one target. */
export interface StatusCleanseEvent {
  type: 'status-cleanse';
  targetId: number;
  statusIds: string[];
  /** cleanse=净化负面（缺省）；dispel=驱散正面。表现层据此选光效/音效。 */
  kind?: 'cleanse' | 'dispel';
}

/** 召唤新角色入队伍空位（需求 10.3, 10.4）。 */
export interface SummonEvent {
  type: 'summon';
  player: PlayerSide;
  /** Active field slot；queue 仅为旧事件回放兼容。 */
  slot: number;
  troopId: number;
  characterId: number;
  destination: 'field' | 'queue'; // queue 为旧事件兼容值
  /** 旧事件回放兼容字段。 */
  fromQueue?: boolean;
}

export interface DefeatEvent {
  type: 'defeat';
  characterId: number;
}

/**
 * 逃跑（DECISIONS 四项拍板③）：escape 效果段判定成功后发出。
 * 表现层按"轻量退场"处理（残影/淡出，不做阵亡粒子）；编队移出复用 defeat 的
 * resolveDefeatEvents 管线（splice + 队列补位），但不置 defeated、不进死亡扫描——
 * 死亡召唤/阵亡响应都不触发。hp/armor 快照供结果上报照实回传（fled 不按击杀记账）。
 */
export interface FleeEvent {
  type: 'flee';
  characterId: number;
  /** 逃跑者所在方 */
  player: PlayerSide;
  /** 逃跑瞬间的生命/护甲快照（结果上报用） */
  hp: number;
  armor: number;
}

/**
 * 战场经济获得（DECISIONS 四项拍板①）：金币/灵魂/宝石三币种共用一个战场经济池
 * （GameState.economy），side 记录获得发生时的行动方（GoW 奖励归玩家，全场共用）。
 * 来源：gainGold/gainSouls/gainGems 效果段、赃物宝石被摧毁（+10 金币）。
 */
export interface EconomyGainEvent {
  type: 'economy-gain';
  currency: 'gold' | 'souls' | 'gems' | 'maps';
  /** 本次获得量（恒为正整数） */
  amount: number;
  /** 获得发生时的行动方（归因字段，池本身共用） */
  side: PlayerSide;
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
  /** 六色族（龙/巨人/灵力/药水/糖果）与按色结算的触发：归属/结算基色（表现层按色演出） */
  color?: BaseColor;
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
  reason: 'set' | 'replaced' | 'expired' | 'removed';
  prevColor?: BaseColor;
  /** 骷髅系风暴（骸骨/末日/超级末日）的掉落目标；颜色风暴缺省 */
  dropKind?: SkullStormDropKind;
}

export interface ExtraTurnEvent {
  type: 'extra-turn';
  player: PlayerSide;
  /** Source of the grant; both sources use the same lightweight HUD notice. */
  source: 'skill' | 'match' | 'destroy';
}

export interface TurnEndEvent {
  type: 'turn-end';
  nextPlayer: PlayerSide;
}

export interface GameOverEvent {
  /** surrender 投降；turn-limit 回合上限到期；objective 规则击杀目标达成 */
  reason?: 'surrender' | 'turn-limit' | 'objective';
  type: 'game-over';
  winner: PlayerSide;
}


/** 兵种转化（「将一名敌人转化为怨灵」）：目标角色就地替换为模板兵种（保留 id/编队位）。
 *  表现层据此刷新卡面（立绘/名称/数值）；引擎侧同刻生效。 */
export interface TroopTransformEvent {
  /** Side responsible for this transformation. */
  sourceSide?: PlayerSide;
  type: 'troop-transform';
  targetId: number;
  /** 转化后的兵种名（中文名，来自模板） */
  name: string;
  /** 转化后兵种 id（可选，供表现层取立绘） */
  troopId?: number;
}


/** 兵种调位（「将一名敌人击回末位」「移至队伍首位」）：
 *  引擎即改编队顺序。index 是这一步做完后该角色的编队下标，侧边卡列按这个下标滑过去。
 *  多步调位要按事件顺序重放，不能读最终编队。 */
export interface TroopRepositionEvent {
  type: 'troop-reposition';
  targetId: number;
  to: 'front' | 'back';
  index: number;
}

/** 队伍乱序（「打乱敌方队伍」）：整队随机重排（种子化）。order 是打乱后从上到下的角色 id。 */
export interface TeamShuffleEvent {
  type: 'team-shuffle';
  player: PlayerSide;
  order: number[];
}

/** 全部事件的可辨识联合 */
export type GameEvent = (
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
  | GemMergeEvent
  | GemDestroyEvent
  | GemExplodeEvent
  | BuffEvent
  | StatusApplyEvent
  | StatusTickEvent
  | StatusExpireEvent
  | StatusCleanseEvent
  | StatusBlockedEvent
  | SummonEvent
  | DefeatEvent
  | FleeEvent
  | EconomyGainEvent
  | TroopTransformEvent
  | TroopRepositionEvent
  | TeamShuffleEvent
  | GravityEvent
  | RefillEvent
  | ReshuffleEvent
  | SpecialGemTriggerEvent
  | StormChangeEvent
  | ExtraTurnEvent
  | TurnEndEvent
  | GameOverEvent) & TraitPresentation;

/** 事件流 */
export type EventStream = GameEvent[];
