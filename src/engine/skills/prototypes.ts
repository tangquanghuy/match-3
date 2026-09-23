/**
 * 技能原型组合器（战斗技能系统 · 需求 11）。
 *
 * 一个「技能原型」= 一至多个「效果段」的有序数组。每个效果段声明：
 *   目标模式 + 效果类型（伤害/宝石/增益/状态/召唤/额外回合/削减）+ 参数（含已解析的缩放）。
 * 执行器 executePrototype 按描述顺序解释各段：选目标 → 调对应效果原语 → 汇集事件（需求 11.1, 11.3）。
 *
 * 回退策略：未被支持的效果段被安全跳过、不崩溃；空原型 = 仅扣法力无战斗效果（需求 11.4）。
 *
 * 确定性：段顺序固定、目标选择/随机经 ctx.rng，相同状态 + 种子 → 相同事件流（需求 11.5, 12.4）。
 * 纯逻辑：无 pixi/gsap/dom 依赖。
 *
 * 窗口 B · 五机制（详见 `scripts/spell-rules.md`）：
 *   - 二次缩放：段级 modifier 字段，来源计数在效果执行时读棋盘/跨段追踪（effects/secondary.ts）；
 *   - 概率子句：段级 chance 字段，执行循环统一掷签（ctx.rng）；
 *   - 敌方削弱：新段 kind 'reduce'（减攻/减甲/减魔/耗蓝/窃取，effects/debuff.ts）；
 *   - 死亡条件：段级 ifTargetDied 字段（前一个产目标段的主目标身亡才生效）；
 *   - 种族翻倍：段级 raceDouble 字段（目标含该族时数值 ×2）。
 * 全部自包含在本文件与效果原语内，不动行动生命周期（TurnEngine 无改动）。
 */
import type { GameEvent } from '../events';
import type { Character, BaseColor } from '../types';
import type { ScalingSpec } from './scaling';
import type { TargetMode } from './targeting';
import { selectTargets } from './targeting';
import type { EffectContext, EffectPrimitive, CastTracking } from './effects/context';
import { findCharacter, findSide } from './effects/context';
import { modifierBonus, conditionMet, isTargetCondition } from './effects/secondary';
import { damageEffect } from './effects/damage';
import type { DamageRange } from './effects/damage';
import { buffEffect, randomStatEffect } from './effects/buff';
import type { BuffStat } from './effects/buff';
import { reduceEffect } from './effects/debuff';
import type { ReduceStat } from './effects/debuff';
import type { ModifierSpec } from './effects/secondary';
import { gemEffect } from './effects/gems';
import type { GemParams } from './effects/gems';
import { cleanseEffect, statusEffect, dispelStatusEffect, randomStatusEffect } from './effects/status';
import { summonEffect, extraTurnEffect, transformTroopEffect, repositionEffect, shuffleTeamEffect, summonCopyEffect, swapPositionsEffect, selfReviveEffect, resolveDefeatAfterRevive } from './effects/summon';
import { devourEffect } from './effects/devour';
import { stormEffect } from './effects/storm';
import { escapeEffect } from './effects/escape';
import { economyGainEffect, stealGoldEffect, spendEconomyEffect } from './effects/economy';
import { shuffleBoardEffect } from './effects/gems';
import type { SummonParams } from './effects/summon';

/** 段级通用可选项（概率子句 / 死亡条件，五机制之二、之四） */
export interface SegmentOptions {
  /**
   * 概率子句（「有 20% 几率…」）：0~1。执行循环统一掷签 `ctx.rng.next() < chance`，
   * 不通过则整段跳过（不发事件、不更新跨段追踪）。缺省必发；0 = 恸不发、1 = 必发。
   */
  chance?: number;
  /**
   * 死亡/阵亡条件（「如果该敌人身亡，获得…」）：
   * 指最近一个解析出目标的效果段的**主目标**（其首个目标），且该段执行前存活、
   * 执行后阵亡——被此前已阵亡的目标不满足。缺省无条件执行。
   */
  ifTargetDied?: boolean;
  /**
   * 通用条件触发（「如果敌人已被冻结，则窃取 5 点法力值」「如果板面上有 13 颗红宝石，则…」）：
   * 目标相对条件（targetRace/targetColor/targetStatus/targetHpDamaged）按**该段自己的目标**
   * 逐个过滤（无目标段挂这类条件 → 整段跳过）；全局条件（selfHpDamaged/boardAtLeast/
   * enemyRacePresent）整段判定。不成立 → 静默跳过（同 chance 语义）。
   */
  ifCond?: import('./effects/secondary').Condition;
  /**
   * 概率随来源增强（「每有一颗X宝石，就有 7% 的几率…」「几率因X而增强 [xN]」）：
   * 生效概率 = chance（缺省 0）+ 加成（百分点）/ 100，夹在 [0,1]。
   */
  chanceBoost?: import('./effects/secondary').ModifierSpec;
}

/** 目标数量区间（引擎原语批）：给出时忽略 n，在 [min, max] 内均匀掷选（种子化，每段一次） */
export interface NRangeSpec {
  min: number;
  max: number;
}

/** 伤害段 */
export interface DamageSegment extends SegmentOptions {
  kind: 'damage';
  target: TargetMode;
  scaling: ScalingSpec;
  range?: DamageRange;
  trueDamage?: boolean;
  /** enemyFirstN/allyFirstN 的 N */
  n?: number;
  /** 目标数量区间（「使 1 到 4 名敌人中毒」）：给出时忽略 n，rng 掷选 */
  nRange?: NRangeSpec;
  /** 种族限定目标：只作用于 troopTypes 含该族的目标（「所有恶魔盟友」） */
  targetRace?: string;
  /** 王国限定目标（武器原语批 K-E）：只作用于 kingdom 匹配的目标（「对所有来自阿达纳的敌人…」） */
  targetKingdom?: string;
  /** 二次缩放（[xN]/[N:M] + 来源），叠加在基础数值上（五机制之一） */
  modifier?: ModifierSpec;
  /**
   * 多份二次缩放（batch-r28，双系数句式——7483「伤害值等同于自身的攻击力，并因棕色敌军
   * 数量而增强 [x10]」）：与 modifier 并存、各份加成相加（单 modifier 通道数学上不可同表）。
   */
  modifiers?: ModifierSpec[];
  /** 种族条件翻倍：受击者 troopTypes 含该族时其所受伤害 ×2（五机制之五） */
  raceDouble?: string;
  /** 种族条件倍率（默认 2；「翻 3 倍」= 3），仅与 raceDouble 同用 */
  raceTimes?: number;
  /** 条件倍率（「如果敌人是X族/使用X色法力/已陷入X状态，则造成 N 倍伤害」） */
  condMult?: import('./effects/secondary').CondMult;
  /** 条件加成（「若…则增加 N 点」，加算） */
  condBonus?: import('./effects/secondary').CondBonus;
  /** 伤害区间（[A] – [B]）：与 scaling 二选一，区间内均匀取整 */
  rangeSpec?: { min: ScalingSpec; max: ScalingSpec };
  /** 分摊（「伤害分摊给至多 {N} 名敌人」）：掷一次总额均分给前 N 名存活敌人（余数给靠前者） */
  split?: number;
  /** 随机分摊（R22 批，7207「随机分配给所有敌人」）：总额按随机切点分给全部存活敌人 */
  splitRandom?: boolean;
  /** 生命窃取：实际伤害总额治疗施法者（「窃取 X 点生命值」） */
  drain?: boolean;
  /** 即杀（「摧毁/消灭该敌人」）：伤害额 = 目标当前有效耐久 */
  execute?: boolean;
}

/** 增益段（作用己方目标） */
export interface BuffSegment extends SegmentOptions {
  kind: 'buff';
  target: TargetMode;
  stat: BuffStat;
  scaling: ScalingSpec;
  n?: number;
  /** 目标数量区间：给出时忽略 n，rng 掷选 */
  nRange?: NRangeSpec;
  /** 种族限定目标（「所有恶魔盟友」） */
  targetRace?: string;
  /** 王国限定目标（武器原语批 K-E，「给予所有白盔国盟友…」） */
  targetKingdom?: string;
  /** 全额治疗（stat='hp' 且 full：恢复全部生命，「恢复所有生命值」） */
  full?: boolean;
  /** 比例获得（仅 stat='mana'）：「获得半数法力值」= 获得 floor(manaCost/2) */
  halve?: boolean;
  /** 任意比例获得（R12 批，仅 stat='mana'）：floor(manaCost × fraction)（「4 分之一」= 0.25） */
  fraction?: number;
  /**
   * 属性翻倍（W05，7188「使 1 名盟友的护甲值翻倍」/ 7199「使 1 名盟友的攻击力翻倍」）：
   * 增益额 = 目标当前该属性，给出时忽略 scaling。
   */
  double?: boolean;
  /** 二次缩放 */
  modifier?: ModifierSpec;
  /** 种族条件翻倍：受益者 troopTypes 含该族时数值 ×2 */
  raceDouble?: string;
  /** 种族条件倍率（默认 2；「翻 3 倍」= 3），仅与 raceDouble 同用 */
  raceTimes?: number;
  /** 条件倍率（「如果敌人是X族/使用X色法力/已陷入X状态，则数值 ×N」） */
  condMult?: import('./effects/secondary').CondMult;
  /** 条件加成（「若…则增加 N 点」，加算；叠加顺序见 SOP） */
  condBonus?: import('./effects/secondary').CondBonus;
  /** 数值区间（R22 批，7469/9055/9181「3-8 点法力值」/ 8055 护甲区间）：与 scaling 二选一 */
  rangeSpec?: { min: ScalingSpec; max: ScalingSpec };
}

/**
 * 削减段（敌方削弱家族，五机制之三）：减攻/减甲/减魔/耗蓝/窃取。
 * 数值夹零（属性不会变负、mana 不为负）；窃取 = gainStat 指定自身获得的属性。
 */
export interface ReduceSegment extends SegmentOptions {
  kind: 'reduce';
  target: TargetMode;
  stat: ReduceStat;
  scaling: ScalingSpec;
  /** 耗尽全部法力（stat='mana'）：数值取目标当前法力（「耗尽法力值」） */
  drainAll?: boolean;
  /** 窃取：目标削减的同时自身获得该属性（同额 ×gainRatio）。stat='random' 时仅作
   *  窃取标记：实际获得 = 掷中的属性（debuff.ts R12 口径） */
  gainStat?: BuffStat;
  /** 自身获得比例，默认 1（「获得其中半数」= 0.5） */
  gainRatio?: number;
  /** 连掷次数（仅 stat='random'，「从其 2 个随机技能值各消除 N 点」= 2；缺省 1） */
  times?: number;
  n?: number;
  /** 目标数量区间：给出时忽略 n，rng 掷选 */
  nRange?: NRangeSpec;
  /** 比例减半：「将敌方攻击力减半」= 按该属性当前值 50% 下取整削减 */
  halve?: boolean;
  /** 任意比例削减（R26 批，8040「窃取敌人四分之一的护甲值」）：削减额 = 当前值 × fraction 下取整 */
  fraction?: number;
  /** 种族限定目标 */
  targetRace?: string;
  /** 王国限定目标（武器原语批 K-E） */
  targetKingdom?: string;
  /** 二次缩放（如「数值因被摧毁的棕色宝石而增强 [1:1]」） */
  modifier?: ModifierSpec;
  /** 种族条件翻倍 */
  raceDouble?: string;
  /** 种族条件倍率（默认 2；「翻 3 倍」= 3），仅与 raceDouble 同用 */
  raceTimes?: number;
  /** 条件倍率（「如果敌人是X族/使用X色法力/已陷入X状态，则数值 ×N」） */
  condMult?: import('./effects/secondary').CondMult;
  /** 条件加成（「若…则增加 N 点」，加算） */
  condBonus?: import('./effects/secondary').CondBonus;
  /** 数值区间（R22 批，8356「耗掉 1-3 点法力值」CountRange）：与 scaling 二选一 */
  rangeSpec?: { min: ScalingSpec; max: ScalingSpec };
}

/** 宝石操作段（不经目标选择） */
export interface GemSegment extends SegmentOptions {
  kind: 'gem';
  params: GemParams;
}

/** 随机属性获得段（「获得 [魔法] 点随机技能值」，DECISIONS「顺路」小活） */
export interface RandomStatSegment extends SegmentOptions {
  kind: 'randomStat';
  target: TargetMode;
  scaling: ScalingSpec;
  n?: number;
  /** 目标数量区间：给出时忽略 n，rng 掷选 */
  nRange?: NRangeSpec;
  /** 种族限定目标 */
  targetRace?: string;
  /** 王国限定目标（武器原语批 K-E） */
  targetKingdom?: string;
  /** 二次缩放（「点数因…而增强」） */
  modifier?: ModifierSpec;
  /** 种族条件翻倍 */
  raceDouble?: string;
  /** 种族条件倍率（默认 2；「翻 3 倍」= 3），仅与 raceDouble 同用 */
  raceTimes?: number;
  /** 条件倍率（「如果敌人是X族/使用X色法力/已陷入X状态，则数值 ×N」） */
  condMult?: import('./effects/secondary').CondMult;
  /** 条件加成（「若…则增加 N 点」，加算；叠加顺序见 SOP） */
  condBonus?: import('./effects/secondary').CondBonus;
}

/** 状态施加段 */
export interface StatusSegment extends SegmentOptions {
  kind: 'status';
  target: TargetMode;
  statusId: string;
  turns: number;
  magnitude?: number;
  /** 叠加层数（「陷入 2 层流血」）：最终 magnitude = 每层值 × 层数 */
  stacks?: number;
  n?: number;
  /** 目标数量区间：给出时忽略 n，rng 掷选 */
  nRange?: NRangeSpec;
  /** 种族限定目标（「所有恶魔盟友」） */
  targetRace?: string;
  /** 王国限定目标（武器原语批 K-E） */
  targetKingdom?: string;
  /**
   * 逐颗宝石驱动施加（原语 Wave4 批，官方 7463/9287/8804 的
   * InflictEffectOnRandomTroops + UseCounterForAmount 步骤）：给出时施加编排改为
   * 「次数 = 本次施放被摧毁的该类宝石数（castTracking.destroyed 口径），每次随机取
   * 存活目标池一名（可重复同目标，rng 逐次掷）」。消费在 effects/status.ts statusEffect。
   */
  perDestroyed?: { color?: BaseColor | 'skull' };
  /**
   * 计数驱动施加（R22 批，「每有一名X则使一名随机(盟友/敌人)Y」族）：施加次数 =
   * modifierBonus(perCount)，每次随机取存活目标池一名（可重复）。消费在 effects/status.ts。
   */
  perCount?: import('./effects/secondary').ModifierSpec;
}

/** Remove statuses from selected allies. */
export interface CleanseSegment extends SegmentOptions {
  kind: 'cleanse';
  target: TargetMode;
  n?: number;
  /** 目标数量区间：给出时忽略 n，rng 掷选 */
  nRange?: NRangeSpec;
  /** 种族限定目标 */
  targetRace?: string;
  /** 王国限定目标（武器原语批 K-E） */
  targetKingdom?: string;
}

/**
 * 定向驱散单一状态（引擎原语批）：只移除目标身上 statusId 这一个状态，
 * 发既有 status-expire 事件；与 cleanse（净化全部状态）互补。
 */
export interface DispelSegment extends SegmentOptions {
  kind: 'dispel';
  target: TargetMode;
  statusId: string;
  n?: number;
  /** 目标数量区间：给出时忽略 n，rng 掷选 */
  nRange?: NRangeSpec;
  /** 种族限定目标 */
  targetRace?: string;
  /** 王国限定目标（武器原语批 K-E） */
  targetKingdom?: string;
}

/** 创造风暴段（引擎原语批）：施法方获得风暴（全场唯一/顶替裁定与 TurnEngine 共用） */
export interface StormSegment extends SegmentOptions {
  kind: 'storm';
  color: BaseColor;
  /** 持续回合；缺省 8（官方口径，effects/storm.ts DEFAULT_STORM_TURNS） */
  turns: number;
  /** 骷髅系风暴（骸骨/末日/超级末日）：掉落加权目标；缺省 = 颜色风暴 */
  dropKind?: import('../types').SkullStormDropKind;
}

/** 打乱板面段（引擎原语批）：复用 boardUtils.reshuffle + 既有 reshuffle 事件 */
export interface ShuffleBoardSegment extends SegmentOptions {
  kind: 'shuffleBoard';
}

/**
 * 随机多选一段（引擎原语批）：执行时 rng 掷选一个分支，只执行该分支的段序列；
 * 未选中分支完全不执行、不发事件、不消耗其随机数。分支内各段仍走完整的
 * 段级管线（chance/ifCond/ifTargetDied/目标解析）。
 */
export interface OneOfSegment extends SegmentOptions {
  kind: 'oneOf';
  /** 分支列表；每支为一至多个段（单段分支序列化为长度 1 的数组） */
  options: EffectSegment[][];
}

/** 召唤段 */
export interface SummonSegment extends SegmentOptions {
  kind: 'summon';
  params: SummonParams;
}

/**
 * 逃跑段（DECISIONS 四项拍板③）：官方句式「有 N% 的几率跑掉」。
 * 字段独立命名 escapeChance——SegmentOptions.chance 是"整段是否执行"的通用概率管线，
 * 与逃跑判定语义冲突（会双重掷签）；**组装词汇 escape() 不接受 opts**，chance/ifCond 等
 * 段级通用项在逃跑段上恒缺省（继承 SegmentOptions 仅为满足段联合的统一访问）。
 * 判定成功 → 施法者 fled + 发 flee 事件（编队移出走 defeat 同款管线）。
 */
export interface EscapeChanceSegment extends SegmentOptions {
  kind: 'escapeChance';
  /** 逃跑几率 0~1（「有 30% 的几率跑掉」= 0.3） */
  escapeChance: number;
}

/** 战场经济获得段（DECISIONS 四项拍板①）：金币/灵魂/宝石三币种 */
/** 献祭（「献祭一名盟友」）：即杀己方目标；属性快照入跨段追踪供 sacrificedStat 来源 */
export interface SacrificeSegment extends SegmentOptions {
  kind: 'sacrifice';
  target: TargetMode;
}

/** 随机状态（「造成随机状态效果」）：每目标独立掷签负面池 */
export interface RandomStatusSegment extends SegmentOptions {
  kind: 'randomStatus';
  target: TargetMode;
  turns?: number;
  /** 每目标连续施加个数（「陷入 3 个随机状态效果」） */
  times?: number;
  /** 池强制（原语 Wave3 批）：'positive' = 正面全集（官方 RandomPositiveStatusEffect，
   *  Book of Secrets 8369 @AllAllies 分支）；缺省按目标阵营选池 */
  pool?: 'positive';
}

/** 兵种转化（「将一名敌人转化为怨灵」）：目标就地替换为模板兵种，不触发阵亡钩子 */
export interface TransformTroopSegment extends SegmentOptions {
  kind: 'transformTroop';
  target: TargetMode;
  /** 目标兵种 referenceName（英文，同召唤引用）；与 randomOf 二选一 */
  ref?: string;
  /** 兵种族随机（「转化为一只随机龙族」）：候选 referenceName 集合，rng 掷选 */
  randomOf?: string[];
  /** 复制形态（R22 批，官方 TransformSelfFromTarget——8187「转化成一名敌人」）：
   *  给出时模板 = 该目标模式解析出的现存角色快照，targets 被就地改写（与 ref/randomOf 互斥） */
  copyOf?: TargetMode;
  troopId?: number;
}

/** 吞噬段（R22 批，官方 Devour——8573/9364/9492）：即杀目标 + 吞噬者官方额度成长；
 *  概率在原语内部掷签（chance 段级通用管线不用——失败也要完成目标解析入追踪）。 */
export interface DevourSegment extends SegmentOptions {
  kind: 'devour';
  target: TargetMode;
  /** 基础概率（0~1） */
  chance: number;
  /** 概率条件倍率（「若敌人是纳迦族则几率翻倍」） */
  chanceMult?: import('./effects/secondary').CondMult;
}

/** 复制召唤段（R22 批，官方 SummoningTarget(NoError)——8188/8190/8273）：以目标现存角色
 *  快照为模板召唤一名（走编队/队列管线） */
export interface SummonCopySegment extends SegmentOptions {
  kind: 'summonCopy';
  target: TargetMode;
}

/** 交换编队位段（R22 批，官方 Swap——7555/7992「使首位和末位敌人交换位置」） */
export interface SwapPositionsSegment extends SegmentOptions {
  kind: 'swapPositions';
  a: TargetMode;
  b: TargetMode;
}

/**
 * 自复活段（凤凰涅槃批，Sunbird「浴火重生」官方 "Die and rise from the Ashes"）：
 * 本次施法中施法者被击杀 → 死亡被撤销（defeat 事件不出流、不出编队、不触发阵亡钩子），
 * 按段规格原位回血复活（healPct 缺省 0.5；full=满血，官方涅槃口径；fullMana=法力回满）。
 * 段级 chance 缺省 1（必发、不掷签、零随机消耗）——与 escapeChance 同理**不用**
 * SegmentOptions.chance 通用管线（那是「整段是否执行」的掷签，语义冲突），字段走
 * 段自己的规格。段本体执行时施法者通常已在拦截口复活：无事发生、零事件。
 */
export interface SelfReviveSegment extends SegmentOptions {
  kind: 'selfRevive';
  /** 复活回血到 maxHp 的百分比（0~1]，缺省 0.5（向上取整） */
  healPct?: number;
  /** 满血复活（覆盖 healPct） */
  full?: boolean;
  /** 复活同时法力回满（deepsoul「复活并恢复全部魔力」口径） */
  fullMana?: boolean;
}

/** 调位（「将一名敌人击回末位」「移至队伍首位」）：改编队顺序 */
export interface RepositionSegment extends SegmentOptions {
  kind: 'reposition';
  target: TargetMode;
  to: 'front' | 'back';
  /**
   * 编队第 N 位（原语 Wave4 批，8101 Tricky Blow 官方步骤两轮 TroopOrderBack——第二轮
   * 打的是动态编队第二位）：配合 enemyNth/allyNth 目标模式，n 为 1-based 编队位
   * （resolveTargetsTracked 既有 n 通道，按执行时刻的存活编队动态解析）。
   */
  n?: number;
}

/** 队伍乱序（「打乱敌方队伍」）：整队随机重排（种子化） */
export interface ShuffleTeamSegment extends SegmentOptions {
  kind: 'shuffleTeam';
  side: 'ally' | 'enemy';
}

export interface GainEconomySegment extends SegmentOptions {
  kind: 'gainEconomy';
  currency: 'gold' | 'souls' | 'gems' | 'maps';
  scaling: ScalingSpec;
  /** 二次缩放（「数量因本战斗收集的灵魂数而增强」） */
  modifier?: ModifierSpec;
}

/**
 * 窃取黄金段（batch-r28，官方 CountEnemyGold+TakeEnemyGold+GiveGold——8087/8904/9189/8141）。
 * 口径见 effects/economy.ts stealGoldEffect：定量 = 入账并发 economy-gain；all = 零和易主。
 * 实际窃取额入 castTracking.goldStolen，供来源 goldStolen 跨段挂载。
 */
export interface StealGoldSegment extends SegmentOptions {
  kind: 'stealGold';
  scaling: ScalingSpec;
  /** 「最多 N」入账上限（8087 官方 CountMax 50） */
  cap?: number;
  /** 全额句式（「窃取(所有)敌人的黄金」）：零和易主 */
  all?: boolean;
  modifier?: ModifierSpec;
}

/**
 * 经济支出段（batch-r28，官方 TakeMyGold——7460「花费我所有的黄金」/8243「失去所有黄金」）：
 * 从共用池扣减（夹零）；实际扣减额入 castTracking.goldSpent 供来源 goldSpent 挂载。
 */
export interface SpendEconomySegment extends SegmentOptions {
  kind: 'spendEconomy';
  currency: 'gold';
  scaling: ScalingSpec;
  /** 全额句式（「花费/失去所有的黄金」） */
  all?: boolean;
  modifier?: ModifierSpec;
}

/** 额外回合段 */
export interface ExtraTurnSegment extends SegmentOptions {
  kind: 'extraTurn';
}

/** 效果段联合 */
export type EffectSegment =
  | DamageSegment
  | BuffSegment
  | ReduceSegment
  | GemSegment
  | RandomStatSegment
  | StatusSegment
  | CleanseSegment
  | DispelSegment
  | StormSegment
  | ShuffleBoardSegment
  | OneOfSegment
  | SummonSegment
  | ExtraTurnSegment
  | EscapeChanceSegment
  | GainEconomySegment
  | StealGoldSegment
  | SpendEconomySegment
  | SacrificeSegment
  | RandomStatusSegment
  | TransformTroopSegment
  | RepositionSegment
  | ShuffleTeamSegment
  | DevourSegment
  | SummonCopySegment
  | SwapPositionsSegment
  | SelfReviveSegment;

/** 技能原型：有序效果段数组 */
export interface SkillPrototype {
  segments: EffectSegment[];
  /** 一场战斗只能释放一次（「此咒语只能使用一次」）：TurnEngine 按 actionLog 拒绝重复 */
  oncePerBattle?: boolean;
}

/** 空原型：仅扣法力、无战斗效果（回退用，需求 11.4） */
export function fallbackPrototype(): SkillPrototype {
  return { segments: [] };
}

/** 为需要目标选择的段解析目标 */
function resolveTargets(
  segment: { target: TargetMode; n?: number; nRange?: NRangeSpec; targetRace?: string; targetKingdom?: string; ifCond?: import('./effects/secondary').Condition },
  ctx: EffectContext,
  overrideMode?: TargetMode,
): Character[] {
  // 目标数量区间（「使 1 到 4 名敌人中毒」）：掷选一次 n（种子化），随后照常走目标模式
  let n = segment.n ?? 1;
  if (segment.nRange) {
    const lo = Math.max(0, Math.floor(Math.min(segment.nRange.min, segment.nRange.max)));
    const hi = Math.max(lo, Math.floor(Math.max(segment.nRange.min, segment.nRange.max)));
    n = lo + ctx.rng.nextInt(hi - lo + 1);
  }
  const picked = selectTargets(
    overrideMode ?? segment.target,
    ctx.state,
    ctx.casterId,
    ctx.rng,
    n,
    ctx.chosenTargetId,
  );
  let result = picked;
  // 种族限定目标：命中不了的段整体跳过（空列表由调用方安全跳过）
  if (segment.targetRace) {
    result = result.filter((c) => (c.troopTypes ?? []).includes(segment.targetRace!));
  }
  // 王国限定目标（武器原语批 K-E，「给予所有白盔国盟友…」）：按目标模板的 kingdom 字段
  // 过滤（Character.kingdom 缺省者不属于任何王国，恒不命中）；全不命中 → 段整体跳过。
  if (segment.targetKingdom) {
    result = result.filter((c) => c.kingdom === segment.targetKingdom);
  }
  // 通用条件（目标相对类）：按该段自己的目标逐个过滤（「如果敌人已被冻结，则窃取…」）
  if (segment.ifCond && isTargetCondition(segment.ifCond)) {
    result = result.filter((c) => conditionMet(segment.ifCond!, ctx, c));
  }
  return result;
}

/**
 * 解析目标并更新跨段追踪（死亡条件的「该敌人」指向这里的首个目标）。
 * aliveBefore 必须在效果执行前取值。
 */
function resolveTargetsTracked(
  segment: { target: TargetMode; n?: number; nRange?: NRangeSpec },
  ctx: EffectContext,
  overrideMode?: TargetMode,
): Character[] {
  const mode = overrideMode ?? segment.target;
  // 跨段绑定：'lastTarget' 指向最近一个产目标段的主目标（不再消耗 rng 重抽）
  if (mode === 'lastTarget') {
    const last = ctx.castTracking?.lastTarget;
    const ch = last ? findCharacter(ctx.state, last.id) : undefined;
    const targets = ch && !ch.defeated ? [ch] : [];
    if (targets.length > 0 && ctx.castTracking) {
      ctx.castTracking.lastTarget = { id: targets[0].id, aliveBefore: targets[0].defeated === false };
    }
    return targets;
  }
  // R22 批跨段追踪族：'lastTargets' 全列表 / 'lastTargetFirst'·'lastTargetLast' 首尾 /
  // 'lastDamaged' 最近伤害段实际命中集。不重抽 rng；追踪为空或全灭 → 空目标安全跳过。
  if (mode === 'lastTargets' || mode === 'lastTargetFirst' || mode === 'lastTargetLast' || mode === 'lastDamaged') {
    const tracking = ctx.castTracking;
    if (!tracking) return [];
    let ids: number[] = [];
    if (mode === 'lastDamaged') {
      ids = tracking.lastDamaged ?? [];
    } else {
      const list = tracking.lastTargets ?? [];
      if (list.length === 0) return [];
      if (mode === 'lastTargets') ids = list.map((t) => t.id);
      else if (mode === 'lastTargetFirst') ids = [list[0].id];
      else ids = [list[list.length - 1].id];
    }
    const targets = ids
      .map((id) => findCharacter(ctx.state, id))
      .filter((c): c is Character => !!c && !c.defeated);
    if (targets.length > 0) {
      tracking.lastTargets = targets.map((c) => ({ id: c.id, aliveBefore: !c.defeated }));
      tracking.lastTarget = { id: targets[0].id, aliveBefore: true };
    }
    return targets;
  }
  // 'lastAlly'（batch-r28，7402「伤害值等同于一名盟友的攻击力……给予其……」）：指向
  // randomAllyStat 来源本施法掷中并缓存的盟友（不重掷 rng）；未缓存/已阵亡 → 空目标。
  if (mode === 'lastAlly') {
    const tracking = ctx.castTracking;
    if (!tracking || tracking.randomAllyId === undefined) return [];
    const ch = findCharacter(ctx.state, tracking.randomAllyId);
    const targets = ch && !ch.defeated ? [ch] : [];
    if (targets.length > 0) {
      tracking.lastTarget = { id: targets[0].id, aliveBefore: true };
    }
    return targets;
  }
  const targets = resolveTargets(segment, ctx, overrideMode);
  if (targets.length > 0 && ctx.castTracking) {
    ctx.castTracking.lastTarget = { id: targets[0].id, aliveBefore: !targets[0].defeated };
    // R22 批：全目标列表快照（'lastTargets' 族读最近一段；allTargets 跨段累积供 anyTrackedDied）
    const snapshot = targets.map((c) => ({ id: c.id, aliveBefore: !c.defeated }));
    ctx.castTracking.lastTargets = snapshot;
    const all = ctx.castTracking.allTargets ?? [];
    const seen = new Set(all.map((t) => t.id));
    for (const t of snapshot) if (!seen.has(t.id)) all.push(t);
    ctx.castTracking.allTargets = all;
  }
  return targets;
}

/** 死亡条件判定：最近产目标段的主目标此前存活、现在阵亡。
 * 阵亡者会被 resolveDefeatEvents 从队伍移除——「找不到」同样视为身亡。 */
function lastTargetDied(ctx: EffectContext): boolean {
  const last = ctx.castTracking?.lastTarget;
  if (!last || !last.aliveBefore) return false;
  const ch = findCharacter(ctx.state, last.id);
  return ch === undefined || ch.defeated;
}

/**
 * 把单个效果段编译为效果原语；未支持的段返回 null（安全跳过，需求 11.4）。
 */
function compileSegment(segment: EffectSegment, ctx: EffectContext): EffectPrimitive | null {
  switch (segment.kind) {
    case 'damage':
      return damageEffect({
        // 溅射的主目标 = 段自己的 target 模式（enemyChosen 时由选择器给 id；
        // enemyFront/enemyRandomN 等按各自模式解析，不再强制覆写——覆写会让
        // 「对 N 名随机敌人溅射」在无手动目标时整段落空）
        targets: resolveTargetsTracked(segment, ctx),
        scaling: segment.scaling,
        range: segment.range,
        trueDamage: segment.trueDamage,
        modifier: segment.modifier,
        modifiers: segment.modifiers,
        raceDouble: segment.raceDouble,
        raceTimes: segment.raceTimes,
        condMult: segment.condMult,
        condBonus: segment.condBonus,
        rangeSpec: segment.rangeSpec,
        drain: segment.drain,
        execute: segment.execute,
        split: segment.split,
        splitRandom: segment.splitRandom,
      });
    case 'buff':
      return buffEffect({
        targets: resolveTargetsTracked(segment, ctx),
        stat: segment.stat,
        scaling: segment.scaling,
        full: segment.full,
        halve: segment.halve,
        fraction: segment.fraction,
        double: segment.double,
        modifier: segment.modifier,
        raceDouble: segment.raceDouble,
        raceTimes: segment.raceTimes,
        condMult: segment.condMult,
        condBonus: segment.condBonus,
        rangeSpec: segment.rangeSpec,
      });
    case 'reduce':
      return reduceEffect({
        targets: resolveTargetsTracked(segment, ctx),
        stat: segment.stat,
        scaling: segment.scaling,
        drainAll: segment.drainAll,
        halve: segment.halve,
        fraction: segment.fraction,
        gainStat: segment.gainStat,
        gainRatio: segment.gainRatio,
        times: segment.times,
        modifier: segment.modifier,
        raceDouble: segment.raceDouble,
        raceTimes: segment.raceTimes,
        condMult: segment.condMult,
        condBonus: segment.condBonus,
        rangeSpec: segment.rangeSpec,
      });
    case 'gem':
      return gemEffect(segment.params);
    case 'randomStat':
      return randomStatEffect({
        targets: resolveTargetsTracked(segment, ctx),
        scaling: segment.scaling,
        modifier: segment.modifier,
        raceDouble: segment.raceDouble,
        raceTimes: segment.raceTimes,
        condMult: segment.condMult,
        condBonus: segment.condBonus,
      });
    case 'status':
      return statusEffect({
        targets: resolveTargetsTracked(segment, ctx),
        statusId: segment.statusId,
        turns: segment.turns,
        magnitude: segment.magnitude,
        stacks: segment.stacks,
        perDestroyed: segment.perDestroyed,
        perCount: segment.perCount,
      });
    case 'cleanse':
      return cleanseEffect({ targets: resolveTargetsTracked(segment, ctx) });
    case 'dispel':
      return dispelStatusEffect({
        targets: resolveTargetsTracked(segment, ctx),
        statusId: segment.statusId,
      });
    case 'storm':
      return stormEffect({ color: segment.color, turns: segment.turns, dropKind: segment.dropKind });
    case 'shuffleBoard':
      return shuffleBoardEffect();
    case 'summon':
      // 注入上下文的召唤物解析器（ref/randomOf 来源需要）
      return summonEffect({ ...segment.params, resolveRef: ctx.resolveSummonRef });
    case 'extraTurn':
      return extraTurnEffect();
    case 'escapeChance':
      return escapeEffect({ escapeChance: segment.escapeChance });
    case 'gainEconomy':
      return economyGainEffect({
        currency: segment.currency,
        scaling: segment.scaling,
        modifier: segment.modifier,
      });
    case 'stealGold':
      return stealGoldEffect({
        scaling: segment.scaling,
        cap: segment.cap,
        all: segment.all,
        modifier: segment.modifier,
      });
    case 'spendEconomy':
      return spendEconomyEffect({
        currency: segment.currency,
        scaling: segment.scaling,
        all: segment.all,
        modifier: segment.modifier,
      });
    case 'sacrifice': {
      // 献祭 = 即杀己方目标（走 execute 管线：defeat/阵亡钩子照常），
      // 属性快照入跨段追踪供 sacrificedStat 来源（「因献祭军队的攻击力而增强」）
      const targets = resolveTargetsTracked(segment, ctx);
      const first = targets.find((t) => !t.defeated);
      if (first && ctx.castTracking) {
        ctx.castTracking.sacrificed = { attack: first.attack, armor: first.armor, magic: first.magic, hp: first.hp };
      }
      return damageEffect({
        targets,
        scaling: { base: 0, mult: 0 },
        trueDamage: true,
        execute: true,
      });
    }
    case 'randomStatus':
      return randomStatusEffect({
        targets: resolveTargetsTracked(segment, ctx),
        turns: segment.turns,
        times: segment.times,
        pool: segment.pool,
      });
    case 'transformTroop': {
      // R22 批 copyOf 形态（TransformSelfFromTarget，8187）：模板来自 copyOf 目标解析
      const copyTargets = segment.copyOf !== undefined
        ? resolveTargets({ target: segment.copyOf }, ctx)
        : [];
      return transformTroopEffect({
        targets: resolveTargetsTracked(segment, ctx),
        ref: segment.ref,
        randomOf: segment.randomOf,
        copyOf: copyTargets.length > 0 ? copyTargets : undefined,
        troopId: segment.troopId,
      });
    }
    case 'devour':
      return devourEffect({
        targets: resolveTargetsTracked(segment, ctx),
        chance: segment.chance,
        chanceMult: segment.chanceMult,
      });
    case 'summonCopy':
      return summonCopyEffect({ targets: resolveTargetsTracked(segment, ctx) });
    case 'selfRevive': {
      // 复活对象 = 施法者本人（含 defeated——死亡态仍带标记待出编队；已被出编队移除则无从
      // 复活，靠 executePrototype 的施法内拦截兜底：见 runSegment 的 castRevive 通道）
      const caster = findCharacter(ctx.state, ctx.casterId);
      return selfReviveEffect({
        targets: caster ? [caster] : [],
        healPct: segment.healPct,
        full: segment.full,
        fullMana: segment.fullMana,
      });
    }
    case 'swapPositions':
      return swapPositionsEffect({ a: segment.a, b: segment.b });
    case 'reposition':
      return repositionEffect({
        targets: resolveTargetsTracked(segment, ctx),
        to: segment.to,
      });
    case 'shuffleTeam':
      return shuffleTeamEffect({ side: segment.side });
    default: {
      // 未知段：安全跳过（回退，需求 11.4）
      return null;
    }
  }
}

/** 新建一段施法的跨段追踪（已挂在 ctx 上则复用） */
function ensureCastTracking(ctx: EffectContext): CastTracking {
  if (!ctx.castTracking) {
    // statusesAtCastStart（batch-r28，7690「如果该敌人已被冻结」）：进入段循环前对全部
    // 在场角色采集一次生效状态 id 快照（只录有状态者）——首段的施加不影响后续段读
    // 「施法前」状态，时序绑定有了确定性锚点。
    const snapshot: Record<number, string[]> = {};
    for (const side of ['Left', 'Right'] as const) {
      for (const c of ctx.state.teams[side].characters) {
        const active = c.statuses.filter((s) => s.turns > 0).map((s) => s.id);
        if (active.length > 0) snapshot[c.id] = active;
      }
    }
    ctx.castTracking = {
      destroyed: [],
      transformed: 0,
      drainedMana: 0,
      enemyDeaths: 0,
      allyDeaths: 0,
      statusesAtCastStart: snapshot,
    };
  }
  return ctx.castTracking;
}

/**
 * 阵亡计数（原语 Wave3 批，countEnemyDeaths/countAllyDeaths 来源）+
 * R22 批扩展：lastDamaged / lastDamage（最近伤害段实际命中集与伤害总额）。
 * 数本段事件流里的 defeat/skill-damage 事件、按死者与施法者的阵营归边入跨段追踪。
 * 在 resolveDefeatEvents 之前调用——阵亡者此刻仍在编队里（仅 defeated 标记），
 * findSide 才能判出归属；此后官方口径的阵亡响应由 TurnEngine 收尾。
 * 官方 CountEnemyDeaths/CountAllyDeaths 是**全战斗累计**（含骷髅/DoT 击杀）；
 * 引擎技能层只见本技能事件流，先落「本次施法内」口径（drainedMana 同款权衡），
 * 全战斗累计需 TurnEngine processDeathTriggers 挂全局计数器，已在交接注记。
 */
function countCastDeaths(events: GameEvent[], ctx: EffectContext): void {
  const tracking = ctx.castTracking;
  if (!tracking || events.length === 0) return;
  const casterSide = findSide(ctx.state, ctx.casterId);
  if (casterSide === null) return;
  let damageTotal = 0;
  const damagedIds = new Set<number>();
  for (const ev of events) {
    if (ev.type === 'skill-damage') {
      // R22 批：本段实际命中集（含溅射链受害者）与伤害总额（lastDamaged/lastDamage 来源）
      damageTotal += ev.damage;
      damagedIds.add(ev.targetId);
      continue;
    }
    if (ev.type !== 'defeat') continue;
    const side = findSide(ctx.state, ev.characterId);
    if (side === null) continue;
    if (side === casterSide) tracking.allyDeaths += 1;
    else tracking.enemyDeaths += 1;
  }
  if (damagedIds.size > 0) tracking.lastDamaged = [...damagedIds];
  if (damageTotal > 0) tracking.lastDamage = damageTotal;
}

/**
 * 单段的完整裁决管线（概率掷签 → 全局条件 → 目标相对条件 × 无目标段 → 死亡条件 →
 * 编译执行），供主循环与 oneOf 选中分支共用。跳过的段返回空事件、不消耗目标选择、
 * 不更新跨段追踪（lastTarget 保持上一有效段）。
 * castRevive（凤凰涅槃批）：本次施法带 selfRevive 段时的施法者复活标记，出编队时拦截
 * 施法者被击杀的 defeat 事件（官方「Die and rise from the Ashes」——死亡被撤销）。
 */
function runSegment(
  segment: EffectSegment,
  ctx: EffectContext,
  castRevive?: { casterId: number } & import('./effects/summon').SelfReviveSpec,
): GameEvent[] {
  // 概率子句：掷签不通过 → 整段跳过（rng 消耗固定发生，保证同种子同事件流）
  if (segment.chance !== undefined || segment.chanceBoost) {
    const boost = modifierBonus(segment.chanceBoost, ctx) / 100;
    const p = Math.min(1, Math.max(0, (segment.chance ?? 0) + boost));
    if (!(ctx.rng.next() < p)) return [];
  }
  // 通用条件（全局类）：整段判定，不成立 → 静默跳过（目标相对类在目标解析处过滤）
  if (segment.ifCond && !isTargetCondition(segment.ifCond) && !conditionMet(segment.ifCond, ctx)) {
    return [];
  }
  // 目标相对条件挂在无目标段（gem/extraTurn/summon/storm/oneOf）→ 无从判定，整段跳过
  if (segment.ifCond && isTargetCondition(segment.ifCond) && !('target' in segment)) {
    return [];
  }
  // 死亡条件：前一个产目标段的主目标确实身亡才执行
  if (segment.ifTargetDied === true && !lastTargetDied(ctx)) return [];

  // 随机多选一：rng 掷选一个分支，只执行该分支（未选中分支零执行、零事件、零随机消耗）
  if (segment.kind === 'oneOf') {
    const branches = segment.options;
    if (branches.length === 0) return [];
    const picked = branches[ctx.rng.nextInt(branches.length)];
    const events: GameEvent[] = [];
    for (const sub of picked) events.push(...runSegment(sub, ctx, castRevive));
    return events;
  }

  const primitive = compileSegment(segment, ctx);
  if (!primitive) return [];
  const produced = primitive.apply(ctx);
  countCastDeaths(produced, ctx);
  return resolveDefeatAfterRevive(ctx.state, produced, ctx.rng, castRevive);
}

/**
 * 执行技能原型：按段顺序解释，汇集事件流（需求 11.3, 11.5）。
 * 空原型或全部段不支持 → 返回空事件（仅扣法力回退由 castSkill 处理，需求 11.4）。
 * 凤凰涅槃批：原型带 selfRevive 段时，本次施法中施法者被击杀（如反弹反杀）的 defeat
 * 事件在各段出编队前被拦截撤销并复活——「Die and rise from the Ashes」。
 */
export function executePrototype(proto: SkillPrototype, ctx: EffectContext): GameEvent[] {
  ensureCastTracking(ctx);
  const reviveSeg = proto.segments.find((s): s is SelfReviveSegment => s.kind === 'selfRevive');
  const castRevive = reviveSeg
    ? {
      casterId: ctx.casterId,
      chance: reviveSeg.chance,
      healPct: reviveSeg.healPct,
      full: reviveSeg.full,
      fullMana: reviveSeg.fullMana,
    }
    : undefined;
  const events: GameEvent[] = [];
  for (const segment of proto.segments) {
    events.push(...runSegment(segment, ctx, castRevive));
  }
  return events;
}
