/**
 * 效果原语的共享执行上下文与接口（战斗技能系统 · 设计文档「效果原语接口」）。
 *
 * 一个「效果原语」是最小可复用的战斗操作（造成伤害、创造宝石、施加中毒…）。
 * 技能原型（prototypes.ts）把一至多个原语按描述顺序编排为完整技能。
 *
 * 纯逻辑：无 pixi/gsap/dom 依赖；随机性经 ctx.rng（需求 12.1, 12.2）。
 */
import type { GameState } from '../../GameState';
import type { GameEvent } from '../../events';
import type { SeededRNG } from '../../rng';
import type { Character, Team, PlayerSide, GemType, BaseColor, CellPos } from '../../types';
import { PlayerSide as Side } from '../../types';
import { isWebbed } from './status';

/** 被技能直接摧毁的宝石（用于法力/骷髅结算，需求 7.5） */
export interface DestroyedGem {
  gemType: GemType;
  /**
   * 被摧毁时所在格（clear 管线填充）。特殊宝石的"被摧毁时"触发（炸弹爆炸/闪电清行列/
   * 许愿回蓝）需要位置才能连锁；缺省（旧调用方）时特殊宝石摧毁不触发。
   */
  pos?: CellPos;
}

/**
 * 单次施法的跨段追踪（窗口 B · 五机制）：
 * 同一次技能内，后续效果段的二次缩放来源（被摧毁/被转化的宝石、耗掉的法力）
 * 与段间条件（「如果该敌人身亡」）都从这里读。由 executePrototype 创建并挂到 ctx 上，
 * 效果原语只写不建——纯原语单测（不走 executePrototype）时为 undefined，相关来源按 0 计。
 */
export interface CastTracking {
  /** 本技能效果段直接摧毁的宝石（不含连锁；按执行顺序累积） */
  destroyed: DestroyedGem[];
  /** 本技能效果段直接转化的宝石数 */
  transformed: number;
  /** 本技能耗掉的敌方法力总和 */
  drainedMana: number;
  /**
   * 本技能效果段直接造成的敌方/己方阵亡数（原语 Wave3 批，官方 CountEnemyDeaths /
   * CountAllyDeaths——Glutmaw「因敌方阵亡数而增强 [x5]」、Dullahan 双来源）。
   * executePrototype 在每段结算时数 defeat 事件（参考 drainedMana 先例；
   * 官方口径是全战斗累计，受技能层可动范围限制先落「本次施法内」口径，见 runSegment）。
   */
  enemyDeaths: number;
  allyDeaths: number;
  /** 最近被献祭的盟友属性快照（「因献祭军队的攻击力而增强」跨段追踪） */
  sacrificed?: { attack: number; armor: number; magic: number; hp: number };
  /**
   * 最近一个 reduce 段的实际削减总额（原语 Wave4 批，7507「减除其 [魔法 + 2] 点生命值
   * 并将之转化为攻击力」的跨段数值绑定）：debuff.ts reduce 结算把**实际发生**的削减额
   * （夹零/夹当前值后，多目标/多步累加）记入此处；后段增益以 modifier 来源
   * { kind: 'lastReduce' }（multiplier 1）引用同额——「并转化为攻击力」= 增益等于实际
   * 削减额而非声明额。每个 reduce 段结算时整体覆写（保留「最近一段」语义）。
   */
  lastReduce?: { amount: number };
  /**
   * 最近一个解析出目标的效果段：主目标 id + 该段执行前是否存活。
   * 「如果该敌人身亡」= 它 aliveBefore 且现在 defeated。
   */
  lastTarget?: { id: number; aliveBefore: boolean };
}

/** 效果原语执行上下文（施法者、状态、随机源、宝石 id 分配器） */
export interface EffectContext {
  state: GameState;
  casterId: number;
  rng: SeededRNG;
  /** 分配新宝石稳定 id（创造宝石时用；由 TurnEngine 注入） */
  nextGemId: () => number;
  /**
   * 宝石操作后交回引擎的棋盘结算（需求 7.3, 7.5）：
   * 结算被直接摧毁宝石的法力/骷髅 → 重力补充 → 解析由此产生的连锁。
   * 由 TurnEngine 注入；缺省（纯原语单测）时宝石操作只改棋盘、不结算连锁。
   */
  resolveBoardChange?: (destroyed: DestroyedGem[], events: GameEvent[]) => void;
  /**
   * 额外回合信号（需求 10.2）：调用后当前玩家保留回合。
   * 由 TurnEngine 注入；缺省时额外回合原语只发事件、不改回合归属（供纯单测）。
   */
  grantExtraTurn?: () => void;
  /** 分配新角色 id（召唤时用）；缺省时由现有最大 id + 1 推导（确定性） */
  nextCharId?: () => number;
  /**
   * 本次释放选定的颜色（需求 2）：技能文本"指定/选定颜色"由 ColorChooser 在释放时解析，
   * 宝石段遇 'CHOSEN' 占位符时取此值；缺省（未选色/无可选色）时依赖它的段安全跳过。
   */
  chosenColor?: BaseColor;
  /**
   * 本次释放手动选定的目标角色 id：目标模式为 enemyChosen/allyChosen 时，
   * 由 TargetChooser（玩家点选 / AI 策略）在释放时解析；缺省或目标失效则该段安全跳过。
   */
  chosenTargetId?: number;
  /**
   * 本次释放手动选定的棋盘格（玩家点选一枚宝石 / AI 策略）。作为宝石清除的起点：
   *   - clear 目标 cell='CELL'：以该格为中心（destroy 单格 / explode 3x3）
   *   - clear 目标 chosenLine：取该格所在的整行 / 整列
   * 缺省（未选格）时依赖它的段安全跳过。
   */
  chosenCell?: CellPos;
  /**
   * 召唤物 referenceName → 属性模板 的映射器（需求 7）：由装配层注入（来自 troops 数据）。
   * 召唤段 ref/randomOf 来源用它解析属性；缺省时该来源安全跳过。
   */
  resolveSummonRef?: (referenceName: string) => import('./summon').SummonTemplate | null;
  /**
   * 王国 → 该王国兵种 referenceName 清单 的映射器（武器原语批 K-E，「召唤一名来自X王国的
   * 随机部队」）：由装配层注入（来自 troops.json kingdom 字段）。召唤段 randomOfKingdom
   * 来源用它先取候选集再种子化掷选（随后仍经 resolveSummonRef 解析属性）；
   * 缺省时该来源安全跳过（同 resolveSummonRef 的缺省口径）。
   */
  resolveKingdomSummonRefs?: (kingdom: string) => string[] | null;
  /**
   * 单次施法的跨段追踪（五机制：二次缩放来源 / 段间死亡条件）。
   * executePrototype 进入段循环前创建；缺省（纯原语单测）时相关来源按 0 计、
   * ifTargetDied 段按条件不成立跳过。
   */
  castTracking?: CastTracking;
}

/** 效果原语：读写 state 并产出事件流 */
export interface EffectPrimitive {
  apply(ctx: EffectContext): GameEvent[];
}

/** 在双方队伍中按 id 查找角色 */
export function findCharacter(state: GameState, id: number): Character | undefined {
  for (const side of [Side.Left, Side.Right]) {
    const ch = state.teams[side].characters.find((c) => c.id === id);
    if (ch) return ch;
  }
  return undefined;
}

/** 定位角色所在方；找不到返回 null */
export function findSide(state: GameState, id: number): PlayerSide | null {
  for (const side of [Side.Left, Side.Right]) {
    if (state.teams[side].characters.some((c) => c.id === id)) return side;
  }
  return null;
}

/**
 * 施法者魔力；找不到施法者按 0 计。
 * 织网（GoW Web）期间魔力按 0 计——技能数值只剩基础项，基础能力不受影响。
 */
export function casterMagic(ctx: EffectContext): number {
  const caster = findCharacter(ctx.state, ctx.casterId);
  if (!caster) return 0;
  return isWebbed(caster) ? 0 : caster.magic;
}

/** 取某角色所在队伍与其在队伍中的索引 */
export function locate(
  state: GameState,
  id: number,
): { team: Team; index: number } | null {
  for (const side of [Side.Left, Side.Right]) {
    const team = state.teams[side];
    const index = team.characters.findIndex((c) => c.id === id);
    if (index >= 0) return { team, index };
  }
  return null;
}
