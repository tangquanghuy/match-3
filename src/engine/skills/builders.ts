/**
 * 技能配置 Builder（战斗技能系统 · 手写技能库用）。
 *
 * 理念：技能 = 效果段（EffectSegment）的有序组合。直接手写效果段对象太啰嗦，
 * 本模块提供简洁的构造函数，让配置一个技能像填表一样短，例如：
 *
 *   skill(dmg('enemyFront', 2))                       // 对队首造成 [魔法+2] 伤害
 *   skill(dmgSplash('enemyFront', 2))                 // 溅射
 *   skill(dmg('enemyAll', 1), inflict('poison','enemyAll'))  // 群体伤害+全体中毒
 *   skill(createGems(BaseColor.Green, 8), heal('allySelf', 1)) // 造8绿+自愈
 *   skill(destroyRow(), dmg('enemyFront', 1), extraTurn())     // 摧毁一行+伤害+额外回合
 *
 * 纯逻辑：无 pixi/gsap/dom 依赖。所有数值以 [魔法 x mult + base] 表达（mult 默认 1，
 * 纯常数用 mult=0）。
 */
import type { BaseColor, CellPos, SkullStormDropKind, SpecialGemKind, SpecialGemSpec } from '../types';
import type { ScalingSpec } from './scaling';
import type { TargetMode } from './targeting';
import type { DamageRange } from './effects/damage';
import type { BuffStat } from './effects/buff';
import type { ReduceStat } from './effects/debuff';
import type { ModifierSpec, ModifierSource, Condition } from './effects/secondary';
import type { ColorSpec, ClearTarget, ClearGemParams, CreateGemParams, TransformFrom } from './effects/gems';
import type { SummonSource, SummonTemplate } from './effects/summon';
import type {
  SkillPrototype,
  DamageSegment,
  BuffSegment,
  ReduceSegment,
  GemSegment,
  StatusSegment,
  CleanseSegment,
  DispelSegment,
  StormSegment,
  ShuffleBoardSegment,
  OneOfSegment,
  ChooseSegment,
  EffectSegment,
  ExtraTurnSegment,
  SummonSegment,
  EscapeChanceSegment,
  GainEconomySegment,
  StealGoldSegment,
  SpendEconomySegment,
  SacrificeSegment,
  RandomStatusSegment,
  TransformTroopSegment,
  RepositionSegment,
  ShuffleTeamSegment,
  DevourSegment,
  SummonCopySegment,
  SwapPositionsSegment,
  SelfReviveSegment,
  NRangeSpec,
} from './prototypes';
import { RACE_SUMMON_REFS } from './data/raceRoster';

/** 选色占位符：技能文本"指定/选定颜色"，运行时由 ColorChooser 解析（需求 2） */
export const CHOSEN = 'CHOSEN' as const;

/**
 * 「本次释放手动选定目标的法力颜色」占位符（R22 批，8188「创建 10 颗与盟友的法力颜色
 * 相同的宝石」——无前序 chosen 段时直接读 ctx.chosenTargetId，其候选集由同技能后段的
 * allyChosen/enemyChosen 段驱动）。
 */
export const CHOSEN_TARGET = 'CHOSEN_TARGET' as const;

/**
 * 「施法者的军队法力颜色」占位符（动态颜色技能：「创造 9 颗具有该军队法力颜色的宝石」）。
 * 运行时解析为施法者首个关联法力色。
 */
export const CASTER = 'CASTER' as const;

/**
 * 段级公共选项（窗口 B · 五机制）：概率子句 / 死亡条件 / 二次缩放 / 种族翻倍。
 * 各构造函数以 opts 透传，缺省不写字段（序列化保持干净）。
 */
export interface SegmentOpts {
  /** 概率子句（0~1）：执行时 rng.next() < chance 才生效 */
  chance?: number;
  /** 死亡条件：前一个产目标段的主目标身亡才生效 */
  ifTargetDied?: boolean;
  /** 二次缩放（[xN]/[N:M] + 来源） */
  modifier?: ModifierSpec;
  /** 种族条件翻倍（troopType） */
  raceDouble?: string;
  /** 种族条件倍率（默认 2；「翻 3 倍」= 3），仅与 raceDouble 同用 */
  raceTimes?: number;
  /** 条件倍率：条件成立时数值 ×times（「如果敌人是X族/使用X色法力，则 N 倍」） */
  condMult?: import('./effects/secondary').CondMult;
  /** 概率随来源增强（「每颗X宝石有 7% 几率…」，单位百分点） */
  chanceBoost?: ModifierSpec;
  /**
   * 通用条件触发（「如果敌人已被冻结，则…」）：目标相对条件按该段自己的目标逐个过滤，
   * 全局条件整段判定；不成立 → 静默跳过。条件域见 effects/secondary.ts Condition。
   */
  ifCond?: import('./effects/secondary').Condition;
  /** 条件加成（「若…则增加 N 点」，加算；叠加顺序：先加后乘） */
  condBonus?: { n: number; cond: import('./effects/secondary').Condition };
  /** 种族限定目标：只作用于 troopTypes 含该族的目标（「所有恶魔盟友」） */
  targetRace?: string;
  /** 王国限定目标（武器原语批 K-E）：只作用于 kingdom 匹配的目标（「对所有来自阿达纳的敌人…」） */
  targetKingdom?: string;
}

/** 把公共选项拷到段上（仅写出现的字段，保持序列化确定性） */
function attach<T extends object>(seg: T, opts?: SegmentOpts): T {
  if (!opts) return seg;
  const s = seg as T & SegmentOpts;
  if (opts.chance !== undefined) s.chance = opts.chance;
  if (opts.ifTargetDied !== undefined) s.ifTargetDied = opts.ifTargetDied;
  if (opts.modifier !== undefined) s.modifier = opts.modifier;
  if (opts.raceDouble !== undefined) s.raceDouble = opts.raceDouble;
  if (opts.raceTimes !== undefined) s.raceTimes = opts.raceTimes;
  if (opts.condMult !== undefined) s.condMult = opts.condMult;
  if (opts.chanceBoost !== undefined) s.chanceBoost = opts.chanceBoost;
  if (opts.ifCond !== undefined) s.ifCond = opts.ifCond;
  if (opts.condBonus !== undefined) s.condBonus = opts.condBonus;
  if (opts.targetRace !== undefined) (s as { targetRace?: string }).targetRace = opts.targetRace;
  if (opts.targetKingdom !== undefined) (s as { targetKingdom?: string }).targetKingdom = opts.targetKingdom;
  return seg;
}

/** 组装技能：把若干效果段按顺序组成一个技能原型 */
/** Root-level player choice: branches have visible effect labels, not random selection. */
export function chooseSkill(labels: string[], ...options: SkillPrototype['segments'][]): ChooseSegment {
  if (labels.length !== options.length || options.length < 2) throw new Error('Invalid skill choices');
  return { kind: 'choose', labels, options };
}

/** Declares a player-selected anchor even when no branch segment directly hits it. */
export function targetedSkill(inputTarget: NonNullable<SkillPrototype['inputTarget']>, ...segments: SkillPrototype['segments']): SkillPrototype {
  return { inputTarget, segments };
}

export function skill(...segments: SkillPrototype['segments']): SkillPrototype {
  return { segments };
}

/** 数值：[魔法 × mult + base]。纯常数用 s(n)（mult=0）。 */
export function scale(base: number, mult = 1): ScalingSpec {
  return { base, mult };
}
/** 常数数值（与魔力无关） */
export function flat(n: number): ScalingSpec {
  return { base: n, mult: 0 };
}

// —— 伤害 ——

/** 目标数量区间（「使 1 到 4 名敌人中毒」）：带 n 的段可改用区间，rng 掷选 */
export interface NRangeOpts {
  /** 目标数量区间 { min, max }；给出时忽略 n */
  nRange?: NRangeSpec;
}

/** 伤害段公共选项：范围/真实伤害之外，还支持概率、二次缩放、种族翻倍、死亡条件 */
export interface DmgOpts extends SegmentOpts, NRangeOpts {
  range?: DamageRange;
  /** Adjacent splash fraction (0.25 / 0.5 / 0.75). */
  splashRatio?: number;
  /** Independent probabilities for enemyRandomN splash waves; overrides n/nRange. */
  splashChances?: number[];
  /** Native repeated random damage steps, including repeat hits when fewer enemies remain. */
  randomWaves?: number;
  /** 'notHit': plain RandomEnemy chains prefer not-yet-hit enemies (R006-C3); default avoids only the previous (R007-3). */
  randomPrefer?: 'notHit';
  trueDamage?: boolean;
  /** Native ManaBurn: add each victim's current Mana, never drain it. */
  manaBurn?: boolean;
  /** enemyFirstN/allyFirstN/allyRandomN/enemyRandomN 的 N */
  n?: number;
  /**
   * 多份二次缩放（batch-r28，双系数句式——7483「伤害值等同于自身的攻击力，并因棕色敌军
   * 数量而增强 [x10]」= modifiers: [{multiplier 1, selfStat attack}, {multiplier 10,
   * enemiesOfColor Brown}]）：与 modifier 并存、各份加成相加（单 modifier 通道在
   * 「基数=属性 ×1 + 来源计数 ×10」双系数结构下数学上不可同表）。
   */
  modifiers?: ModifierSpec[];
  /** 伤害区间（[A] – [B]）：设置后忽略 base/mult */
  rangeSpec?: { min: import('./scaling').ScalingSpec; max: import('./scaling').ScalingSpec };
  /** 分摊（「伤害分摊给至多 {N} 名敌人」）：掷一次总额均分给前 N 名存活敌人 */
  split?: number;
  /** 随机分摊（R22 批，7207「随机分配给所有敌人」）：总额按随机切点分给全部存活敌人 */
  splitRandom?: boolean;
  /** 生命窃取：实际伤害总额治疗施法者（「窃取 X 点生命值」） */
  drain?: boolean;
  /** 即杀（「摧毁/消灭该敌人」）：伤害额 = 目标当前有效耐久 */
  execute?: boolean;
}

/** 通用伤害段 */
export function dmg(
  target: TargetMode,
  base: number,
  mult = 1,
  opts: DmgOpts = {},
): DamageSegment {
  const seg: DamageSegment = { kind: 'damage', target, scaling: scale(base, mult) };
  if (opts.range) seg.range = opts.range;
  if (opts.splashRatio !== undefined) seg.splashRatio = opts.splashRatio;
  if (opts.splashChances !== undefined) seg.splashChances = [...opts.splashChances];
  if (opts.randomWaves !== undefined) seg.randomWaves = opts.randomWaves;
  if (opts.randomPrefer) seg.randomPrefer = opts.randomPrefer;
  if (opts.trueDamage) seg.trueDamage = true;
  if (opts.manaBurn) seg.manaBurn = true;
  if (opts.n !== undefined) seg.n = opts.n;
  if (opts.nRange !== undefined) seg.nRange = opts.nRange;
  if (opts.rangeSpec) seg.rangeSpec = opts.rangeSpec;
  if (opts.split !== undefined) seg.split = opts.split;
  if (opts.splitRandom) seg.splitRandom = true;
  if (opts.drain) seg.drain = true;
  if (opts.execute) seg.execute = true;
  if (opts.modifiers !== undefined) seg.modifiers = opts.modifiers;
  return attach(seg, opts);
}

/** 溅射伤害（主目标 + 相邻位） */
export function dmgSplash(target: TargetMode, base: number, mult = 1, opts: DmgOpts = {}): DamageSegment {
  return dmg(target, base, mult, { ...opts, range: 'splash' });
}

/** 全体伤害（range=all；target 一般用 enemyAll） */
export function dmgAll(base: number, mult = 1, trueDamage = false): DamageSegment {
  return dmg('enemyAll', base, mult, { range: 'all', trueDamage });
}

/** 真实/穿透伤害（跳护甲） */
export function trueDmg(target: TargetMode, base: number, mult = 1, opts: DmgOpts = {}): DamageSegment {
  return dmg(target, base, mult, { ...opts, trueDamage: true });
}

// —— 增益（作用己方） ——

type BuffOpts = SegmentOpts & NRangeOpts & { n?: number; full?: boolean; halve?: boolean; fraction?: number; double?: boolean; rangeSpec?: { min: import('./scaling').ScalingSpec; max: import('./scaling').ScalingSpec } };

function buff(target: TargetMode, stat: BuffStat, base: number, mult: number, opts?: BuffOpts): BuffSegment {
  const seg: BuffSegment = { kind: 'buff', target, stat, scaling: scale(base, mult) };
  if (opts?.n !== undefined) seg.n = opts.n;
  if (opts?.nRange !== undefined) seg.nRange = opts.nRange;
  if (opts?.full) seg.full = true;
  if (opts?.halve) seg.halve = true;
  if (opts?.fraction !== undefined) seg.fraction = opts.fraction;
  if (opts?.double) seg.double = true;
  if (opts?.rangeSpec !== undefined) seg.rangeSpec = opts.rangeSpec;
  return attach(seg, opts);
}
/** 治疗（opts.full = 全额治疗：「恢复所有生命值」；opts.n = N 目标：「前 2 位盟友」） */
export function heal(target: TargetMode, base: number, mult = 1, opts: BuffOpts = {}): BuffSegment {
  return buff(target, 'hp', base, mult, opts);
}
/** Native IncreaseHealth: increase current and maximum Life by the same amount. */
export function gainLife(target: TargetMode, base: number, mult = 1, opts: BuffOpts = {}): BuffSegment {
  return { ...buff(target, 'hp', base, mult, opts), lifeMode: 'gain' };
}
/** 加护甲 */
export function armor(target: TargetMode, base: number, mult = 1, opts: BuffOpts = {}): BuffSegment {
  return buff(target, 'armor', base, mult, opts);
}
/** 加攻击力 */
export function attack(target: TargetMode, base: number, mult = 1, opts: BuffOpts = {}): BuffSegment {
  return buff(target, 'attack', base, mult, opts);
}
/** 加魔力值 */
export function magic(target: TargetMode, base: number, mult = 1, opts: BuffOpts = {}): BuffSegment {
  return buff(target, 'magic', base, mult, opts);
}
/** 加法力（opts.halve = 「获得半数法力值」：获得 floor(manaCost/2)，忽略数值；
 *  opts.fraction = 任意比例（R12 批）：「获得 4 分之一的法力值 / 25% 法力值」= floor(manaCost × fraction)） */
export function mana(target: TargetMode, base: number, mult = 1, opts: BuffOpts = {}): BuffSegment {
  return buff(target, 'mana', base, mult, opts);
}

/** Cleanse: remove negative statuses from selected targets (positives kept, R002). */
export function cleanse(target: TargetMode, n?: number, opts: SegmentOpts & NRangeOpts = {}): CleanseSegment {
  const segment: CleanseSegment = { kind: 'cleanse', target };
  if (n !== undefined) segment.n = n;
  if (opts.nRange !== undefined) segment.nRange = opts.nRange;
  return attach(segment, opts);
}

/**
 * 定向驱散单一状态（引擎原语批）：只移除目标身上 statusId 这一个状态（「驱散其流血效果」），
 * 发既有 status-expire 事件；与 cleanse（净化全部状态）互补。
 */
export function dispelStatus(statusId: string, target: TargetMode, opts: SegmentOpts & NRangeOpts = {}): DispelSegment {
  const segment: DispelSegment = { kind: 'dispel', target, statusId };
  if (opts.nRange !== undefined) segment.nRange = opts.nRange;
  return attach(segment, opts);
}

/** 随机属性获得（「获得 [魔法] 点随机技能值」：每点随机分给攻/甲/血/魔） */
export function randomStat(target: TargetMode, base: number, mult = 1, opts: SegmentOpts & NRangeOpts & { oneSkill?: boolean } = {}): import('./prototypes').RandomStatSegment {
  const seg: import('./prototypes').RandomStatSegment = { kind: 'randomStat', target, scaling: scale(base, mult) };
  if (opts.nRange !== undefined) seg.nRange = opts.nRange;
  if (opts.oneSkill !== undefined) seg.oneSkill = opts.oneSkill;
  return attach(seg, opts);
}

// —— 敌方削弱家族（减攻/减甲/减魔/耗蓝/窃取，窗口 B 五机制之三） ——

export interface ReduceOpts extends SegmentOpts, NRangeOpts {
  /** enemyFirstN/allyFirstN/randomN 的 N */
  n?: number;
  /** 耗尽目标该属性的全部当前值（「减除全部护甲值」「耗尽法力值」） */
  drainAll?: boolean;
  /** 比例减半：「将敌方攻击力减半」= 按当前值 50% 下取整削减（忽略数值） */
  halve?: boolean;
  /** 任意比例削减（R26 批，官方 CountArmor 25 + StealArmor）：「窃取敌人四分之一的护甲值」
   *  = steal(t,'armor','armor',0,0,{ fraction: 0.25 })——削减额 = 当前值 × fraction 下取整
   *  （与 halve 同一比例族口径；给出时忽略数值缩放/条件修饰） */
  fraction?: number;
  /** 连掷次数（仅 stat='random'）：「从其 2 个随机技能值各消除 N 点」= 2（官方多条
   *  DecreaseRandom 步骤，每步独立掷签攻/甲/魔其一）；缺省 1 */
  times?: number;
  /** 数值区间（R22 批，8356「耗掉 1-3 点法力值」CountRange）：设置后忽略 base/mult */
  rangeSpec?: { min: import('./scaling').ScalingSpec; max: import('./scaling').ScalingSpec };
}

/**
 * 削减段：目标属性扣减（夹零）。stat='mana' 即耗蓝；opts.halve = 按当前值减半；
 * stat='random'（R12 批）= 官方 DecreaseRandom：执行时 rng 在攻/甲/魔三围掷选其一削减，
 * opts.times 为连掷次数（「从其 2 个随机技能值各消除 N 点」）。
 */
export function reduce(
  target: TargetMode,
  stat: ReduceStat,
  base: number,
  mult = 1,
  opts: ReduceOpts = {},
): ReduceSegment {
  const seg: ReduceSegment = { kind: 'reduce', target, stat, scaling: scale(base, mult) };
  if (opts.n !== undefined) seg.n = opts.n;
  if (opts.nRange !== undefined) seg.nRange = opts.nRange;
  if (opts.drainAll) seg.drainAll = true;
  if (opts.halve) seg.halve = true;
  if (opts.fraction !== undefined) seg.fraction = opts.fraction;
  if (opts.times !== undefined) seg.times = opts.times;
  if (opts.rangeSpec !== undefined) seg.rangeSpec = opts.rangeSpec;
  return attach(seg, opts);
}

/** 耗尽目标全部法力（「耗尽法力值」「法力燃烧」的清空语义） */
export function drainMana(target: TargetMode, opts: ReduceOpts = {}): ReduceSegment {
  const seg: ReduceSegment = { kind: 'reduce', target, stat: 'mana', scaling: scale(0, 0), drainAll: true };
  if (opts.n !== undefined) seg.n = opts.n;
  if (opts.nRange !== undefined) seg.nRange = opts.nRange;
  return attach(seg, opts);
}

/**
 * 窃取：目标 stat 削减（夹零），施法者获得同额 ×gainRatio 的 gainStat。
 * 「窃取 2 点护甲值并将之转为魔力值」= steal(t, 'armor', 'magic', 2, 0)。
 * stat='random'（R12 批，官方 StealRandom）：gainStat 仅作窃取标记，
 * 实际获得 = 掷中的那项属性；一般用 stealRandomStat() 构造。
 */
export function steal(
  target: TargetMode,
  stat: ReduceStat,
  gainStat: BuffStat,
  base: number,
  mult = 1,
  opts: ReduceOpts & { gainRatio?: number; gainLifeMode?: import('./effects/buff').LifeMode; modifierAfterCap?: boolean } = {},
): ReduceSegment {
  const seg: ReduceSegment = { kind: 'reduce', target, stat, scaling: scale(base, mult), gainStat };
  if (opts.gainRatio !== undefined && opts.gainRatio !== 1) seg.gainRatio = opts.gainRatio;
  // P-steal-to-life: native IncreaseHealth gain step / CountMaxWithMagic cap on the base part only
  if (opts.gainLifeMode) seg.gainLifeMode = opts.gainLifeMode;
  if (opts.modifierAfterCap) seg.modifierAfterCap = true;
  if (opts.n !== undefined) seg.n = opts.n;
  if (opts.nRange !== undefined) seg.nRange = opts.nRange;
  if (opts.times !== undefined) seg.times = opts.times;
  // R26 修：drainAll 此前未透传——r15 7347「耗尽其法力值并获得其中半数」段削减额恒 0（静默无效）
  if (opts.drainAll) seg.drainAll = true;
  if (opts.fraction !== undefined) seg.fraction = opts.fraction;
  return attach(seg, opts);
}

/**
 * 窃取随机属性（R12 批，「窃取 [魔法 + 1] 点随机技能值」，官方 StealRandom/DecreaseRandom
 * 窃取变体）：掷中攻/甲/魔哪项就削减哪项，施法者同项入账（同额 ×gainRatio）。
 */
export function stealRandomStat(target: TargetMode, base: number, mult = 1, opts: ReduceOpts & { gainRatio?: number } = {}): ReduceSegment {
  return steal(target, 'random', 'attack', base, mult, opts);
}

// —— 宝石：创造 / 转化 ——

export interface CreateOpts extends SegmentOpts {
  /** 创造数量可带二次缩放（如「每摧毁一颗紫色宝石，则创造 4 颗骷髅头 [x4]」） */
  n?: number;
  /** 数量区间（「创造 8-12 颗紫色宝石」）：给出时忽略 base/mult，rng 在 [min, max] 掷选 */
  countRange?: { min: number; max: number };
}

/** 创造指定颜色宝石（颜色可为 CHOSEN/CASTER），数量 = [魔法 × mult + base]（默认常数） */
export function createGems(color: ColorSpec, base: number, mult = 0, opts: CreateOpts = {}): GemSegment {
  const params: CreateGemParams = { op: 'create', gem: { kind: 'color', color }, count: scale(base, mult) };
  return createSeg(params, opts);
}
/** 创造骷髅头，数量同上 */
export function createSkulls(base: number, mult = 0, opts: CreateOpts = {}): GemSegment {
  const params: CreateGemParams = { op: 'create', gem: { kind: 'skull' }, count: scale(base, mult) };
  return createSeg(params, opts);
}
/**
 * 创造混合宝石（「创造 15 颗宝石，混合绿色和一种选定类型」）：
 * 逐颗从 colors 里随机取色（种子化）。
 * R26 扩容（9658「合成 18 颗冰冻宝石和末日骷髅头」/ 7713「混合骷髅头和绿色宝石」）：
 * colors 端点亦可传 'SKULL'（骷髅头）或 SpecialGemSpec（冻结/流血等状态宝石）——
 * 混合端走既有 mixAny 路径（effects/gems.ts，每颗 rng 掷选色/骷髅/特殊宝石）；
 * 纯基色/占位符数组维持旧 `{ kind: 'mix' }` 序列化逐字节不变（零事件零 rng 护栏）。
 */
export function createMix(colors: (ColorSpec | SpecialGemSpec)[], base: number, mult = 0, opts: CreateOpts = {}): GemSegment {
  colors.forEach((color) => { if (typeof color !== 'string') requireSpiritColor(color); });
  const hasMixedEndpoint = colors.some((c) => typeof c !== 'string' || c === 'SKULL');
  const params: CreateGemParams = hasMixedEndpoint
    ? { op: 'create', gem: { kind: 'mixAny', entries: colors }, count: scale(base, mult) }
    : { op: 'create', gem: { kind: 'mix', colors: colors as ColorSpec[] }, count: scale(base, mult) };
  return createSeg(params, opts);
}

/**
 * 创造特殊宝石（「创造 2 颗炸弹宝石」「创造一颗织网宝石」；窗口 C spec，台账 09-14）。
 * kind 取值域见 types.ts SpecialGemKind（doomSkull/uberDoomSkull/bomb/web/lightningRow/
 * lightningCol/wildcard/wish/hourglass/ghost）；wildcard 带 tier（2/4）。
 */
function requireSpiritColor(spec: SpecialGemSpec): void {
  if (spec.kind === 'spiritGem' && spec.color === undefined)
    throw new Error('Creating Spirit Gems requires an explicit color');
}

export function createSpecialGems(spec: SpecialGemSpec, base: number, mult = 0, opts: CreateOpts = {}): GemSegment {
  requireSpiritColor(spec);
  const params: CreateGemParams = { op: 'create', gem: { kind: 'special', spec }, count: scale(base, mult) };
  return createSeg(params, opts);
}

/**
 * 创造混合特殊宝石（原语 Wave3 批，官方 CreateGems2Colors 双特殊端点）：每颗在给定
 * 两种 spec 间**放回均匀**掷选（种子化）。官方善/恶石像鬼逐颗掷签——
 * 8795 Frozen Time「Freeze a random Enemy. Create 3 Gargoyle Gems, and gain an extra turn.」
 * 步骤 {Color1: GoodGargoyle, Amount: 3, Color2: BadGargoyle, Type: CreateGems2Colors}
 * = createSpecialGems2([{ kind: 'gargoyleGem', tier: 1 }, { kind: 'gargoyleGem', tier: 2 }], 3)
 * （gargoyleGem tier 1=善 / 2=恶，types.ts 口径）。
 */
export function createSpecialGems2(
  kinds: readonly [SpecialGemSpec, SpecialGemSpec],
  base: number,
  mult = 0,
  opts: CreateOpts = {},
): GemSegment {
  kinds.forEach(requireSpiritColor);
  const params: CreateGemParams = { op: 'create', gem: { kind: 'mixSpecial', specs: [kinds[0], kinds[1]] }, count: scale(base, mult) };
  return createSeg(params, opts);
}

// —— 特殊宝石清除（「摧毁所有末日骷髅头」「引爆 3 颗末日骷髅」） ——
//    K-B 收官轮（武器条件化清除族 9381/9486/9809/9983）：全量清除构造器补 opts 形参，
//    段级公共选项（ifCond 等）经 clearSeg→attach 挂载；不传 opts 时序列化与旧形逐字节一致。

/** 摧毁棋盘上某特殊宝石全量 */
export function destroySpecialGems(gem: SpecialGemKind, opts?: SegmentOpts): GemSegment {
  return clearSeg('destroy', { kind: 'special', gem }, opts);
}
/** 爆破棋盘上某特殊宝石全量（含辐射一圈） */
export function explodeSpecialGems(gem: SpecialGemKind, opts?: SegmentOpts): GemSegment {
  return clearSeg('explode', { kind: 'special', gem }, opts);
}
/** 随机摧毁 N 颗指定特殊宝石（「摧毁 3 颗末日骷髅头」） */
export function destroyRandomSpecialGems(gem: SpecialGemKind, base: number, mult = 0, opts?: SegmentOpts, specialTier?: number): GemSegment {
  return clearSeg('destroy', { kind: 'randomGems', count: scale(base, mult), include: 'all', special: gem, ...(specialTier !== undefined ? { specialTier } : {}) }, opts);
}
/** 随机爆破 N 颗指定特殊宝石（「引爆 3 个末日骷髅」）；specialTier 限定档位（gargoyleGem 1=善 / 2=恶，native Good/BadGargoyle） */
export function explodeRandomSpecialGems(gem: SpecialGemKind, base: number, mult = 0, opts?: SegmentOpts, specialTier?: number): GemSegment {
  return clearSeg('explode', { kind: 'randomGems', count: scale(base, mult), include: 'all', special: gem, ...(specialTier !== undefined ? { specialTier } : {}) }, opts);
}

/** 包一层段并透传创造段选项 */
function createSeg(params: CreateGemParams, opts: CreateOpts): GemSegment {
  if (opts.modifier) params.modifier = opts.modifier;
  if (opts.countRange !== undefined) params.countRange = opts.countRange;
  const seg: GemSegment = { kind: 'gem', params };
  return attach(seg, opts);
}
/** 转化：某色 → 另一色（全棋盘；任一端可为 CHOSEN）。opts.count = 定量随机转换 N 颗；
 *  from 亦可为 'CELL'（原语 Wave4 批，9638「选择一颗宝石转换」= 选定单格那颗） */
export function transform(from: ColorSpec | 'CELL', to: ColorSpec, opts: SegmentOpts & { count?: number } = {}): GemSegment {
  const params: TransformGemParamsLike = { op: 'transform', from, to };
  if (opts.count !== undefined) params.count = flat(opts.count);
  return gemSegWithOpts(params, opts);
}

/** 定量转换的段选项（count 为常数颗数；概率/条件等公共选项照常） */
export interface TransformOpts extends SegmentOpts {
  /** 随机转换颗数（「将一颗宝石转换成炸弹宝石」「将 2 颗紫色宝石转换成X」） */
  count?: number;
  /**
   * 转换颗数二次缩放（batch-r28，官方 ConvertGems UseCounterForAmount——9545「将 3 颗
   * 黄色宝石转换成紫色龙宝石，诅咒敌人数量增加 [1:1]」= { count: 3, countModifier:
   * boostPer(enemyStatusCount curse, 1) }，实际颗数 = 3 + 被诅咒敌人数）：与 count 同用。
   */
  countModifier?: ModifierSpec;
  /**
   * toSpecial tier 掷签（原语 Wave4 批，8801「Convert 4 Stone Blocks to either Good or
   * Evil Gargoyle Gems」）：执行时整段掷签一次，本次转换的所有宝石取同一 tier
   * （官方 Randomize AB-CD 双分支语义；与 toSpecial 同用，仅 convertSpecial/transformToSpecial 消费）。
   */
  tiers?: [number, number];
  /**
   * toSpecial 固定 tier（K-B 收官轮，8966「Convert a selected Mana Gem into a x3 Wildcard」
   * ——官方通配倍率三档 2/3/4，tier 通道此前仅 createSpecialGems 有）：与 opts.tiers 掷签
   * 互斥；亦可用 toSpecial 的 spec 形态 `{ kind, tier }` 表达（对齐 createSpecialGems）。
   */
  tier?: number;
}

/**
 * 转化：来源（色/'ANY' 不限）→ 指定特殊宝石，可定量（opts.count，随机取 N 颗）。
 * 「将一颗宝石转换成炸弹宝石」= transformToSpecial('ANY', 'bomb', { count: 1 })。
 * gem 亦可传 spec 形态 `{ kind, tier? , color? }`（K-B 收官轮，带档通配/恶石像鬼等
 * tier 端点——「将选定的法力宝石转换为 x3 通配符」= transformToSpecial('CELL',
 * { kind: 'wildcard', tier: 3 })）；传 kind 字符串 + opts.tier 等价。
 */
export function transformToSpecial(from: TransformFrom, gem: SpecialGemKind | SpecialGemSpec, opts: TransformOpts = {}): GemSegment {
  const spec: SpecialGemSpec = typeof gem === 'string' ? { kind: gem } : gem;
  const tier = opts.tier ?? spec.tier;
  const params: TransformGemParamsLike = { op: 'transform', from, to: 'SKULL' };
  if (spec.kind === 'spiritGem' && spec.color === undefined) {
    // Bind the new gem's color to its source, including dynamic target-color selectors.
    if (from === 'ANY' || from === 'CELL' || from === 'SKULL')
      throw new Error('Spirit Gem conversion needs a mana color source');
    params.spiritColorFromSource = true;
  }
  if (tier !== undefined || spec.color !== undefined) {
    // spec 形态（新通道）：仅带 tier/color 时升级为对象，字段按定义序收敛
    const specOut: SpecialGemSpec = { kind: spec.kind };
    if (tier !== undefined) specOut.tier = tier;
    if (spec.color !== undefined) specOut.color = spec.color;
    params.toSpecial = specOut;
  } else {
    // 既有 kind 字符串形态：序列化与旧形逐字节一致（护栏）
    params.toSpecial = spec.kind;
  }
  if (opts.count !== undefined) params.count = flat(opts.count);
  if (opts.countModifier !== undefined) params.countModifier = opts.countModifier;
  if (opts.tiers !== undefined) params.tiers = opts.tiers;
  return gemSegWithOpts(params, opts);
}

/**
 * 特殊↔特殊转换（原语 Wave4 批，8801 Crypt of Despair「Convert 4 Stone Blocks to either
 * Good or Evil Gargoyle Gems. Then explode a Gem.」官方步骤 {Color1: Block, Color2:
 * GoodGargoyle/BadGargoyle, Type: ConvertGems}）：from/to 均为特殊宝石 kind——石块 =
 * 'stoneBlock'，善/恶石像鬼 = 'gargoyleGem'（tier 1=善 / 2=恶）。
 * 「善或恶」整段掷签 = opts.tiers: [1, 2]（本次转换的所有宝石同 tier，官方 AB-CD 双分支）；
 * 池匹配按 kind 精确对位（不可匹配宝石不走 isSameMatchType 管线，见 effects/gems.ts）。
 * 9638 的选定单格转换走 transform('CELL', …) 族，不在此处。
 */
export function convertSpecial(from: SpecialGemKind, to: SpecialGemKind, opts: TransformOpts = {}): GemSegment {
  const params: TransformGemParamsLike = { op: 'transform', from: 'ANY', to: 'SKULL', fromSpecial: from, toSpecial: to };
  if (opts.count !== undefined) params.count = flat(opts.count);
  if (opts.tiers !== undefined) params.tiers = opts.tiers;
  return gemSegWithOpts(params, opts);
}

/** 只为规避循环引用的别名：与 effects/gems.ts TransformGemParams 同形（结构性兼容） */
type TransformGemParamsLike = import('./effects/gems').TransformGemParams;

/** transform 族通用收尾：拷公共选项、包成段 */
function gemSegWithOpts(params: TransformGemParamsLike, opts: SegmentOpts): GemSegment {
  const seg: GemSegment = { kind: 'gem', params };
  return attach(seg, opts);
}

// —— 宝石：清除（destroy 只清目标 / explode 目标+辐射一圈） ——
//    统一用 clear 段：目标集(ClearTarget) × 模式(destroy|explode) 自由组合。

/** 选定宝石/格占位符：释放时玩家点选一枚宝石（见 CellChooser） */
export const CELL = 'CELL' as const;

function clearSeg(mode: 'destroy' | 'explode', target: ClearTarget, opts?: SegmentOpts): GemSegment {
  const params: ClearGemParams = { op: 'clear', mode, target };
  if (opts?.modifier) params.modifier = opts.modifier;
  const seg: GemSegment = { kind: 'gem', params };
  return attach(seg, opts);
}

// 固定整行/列
export function destroyRows(...rows: number[]): GemSegment { return clearSeg('destroy', { kind: 'lines', rows }); }
export function destroyCols(...cols: number[]): GemSegment { return clearSeg('destroy', { kind: 'lines', cols }); }
export function explodeRows(...rows: number[]): GemSegment { return clearSeg('explode', { kind: 'lines', rows }); }
export function explodeCols(...cols: number[]): GemSegment { return clearSeg('explode', { kind: 'lines', cols }); }

// 玩家点选一枚宝石，以其所在整行/整列为目标（与"选一枚宝石引爆"同一选择器）
export function destroyChosenRow(): GemSegment { return clearSeg('destroy', { kind: 'chosenLine', orientation: 'row' }); }
export function destroyChosenCol(): GemSegment { return clearSeg('destroy', { kind: 'chosenLine', orientation: 'col' }); }
/** 选定宝石的行+列一并摧毁（R22 批，7253「选择一颗紫色宝石，摧毁其行和列」） */
export function destroyChosenCross(): GemSegment { return clearSeg('destroy', { kind: 'chosenCross' }); }
export function explodeChosenRow(): GemSegment { return clearSeg('explode', { kind: 'chosenLine', orientation: 'row' }); }
export function explodeChosenCol(): GemSegment { return clearSeg('explode', { kind: 'chosenLine', orientation: 'col' }); }

/**
 * 摧毁前序 clear 段辐射前锚定格所在的整行/整列（W05，7217「爆破一颗宝石，并摧毁该行」）。
 * 读 ctx.castTracking.lastClearedAnchor；无前序锚时安全跳过。不走玩家点选。
 */
export function destroyLineOfLastGem(orientation: 'row' | 'col', opts?: SegmentOpts): GemSegment {
  return clearSeg('destroy', { kind: 'lastDestroyedLine', orientation }, opts);
}

// 随机 N 行/列（opts.modifier 支持数量二次缩放）
export function destroyRandomRows(base: number, mult = 0, opts?: SegmentOpts): GemSegment { return clearSeg('destroy', { kind: 'randomLines', orientation: 'row', count: scale(base, mult) }, opts); }
export function destroyRandomCols(base: number, mult = 0, opts?: SegmentOpts): GemSegment { return clearSeg('destroy', { kind: 'randomLines', orientation: 'col', count: scale(base, mult) }, opts); }
export function explodeRandomRows(base: number, mult = 0, opts?: SegmentOpts): GemSegment { return clearSeg('explode', { kind: 'randomLines', orientation: 'row', count: scale(base, mult) }, opts); }
export function explodeRandomCols(base: number, mult = 0, opts?: SegmentOpts): GemSegment { return clearSeg('explode', { kind: 'randomLines', orientation: 'col', count: scale(base, mult) }, opts); }

// 指定颜色（可 CHOSEN）/ 全部颜色 / 骷髅
// K-B 收官轮：opts 形参补齐（「如果现有尘风暴，则移除所有绿色的宝石」7286 等
// 条件化清除族）；不传 opts 序列化不变。
export function destroyColor(color: ColorSpec, opts?: SegmentOpts): GemSegment { return clearSeg('destroy', { kind: 'color', color }, opts); }
export function explodeColor(color: ColorSpec, opts?: SegmentOpts): GemSegment { return clearSeg('explode', { kind: 'color', color }, opts); }
export function destroyAllColors(opts?: SegmentOpts): GemSegment { return clearSeg('destroy', { kind: 'allColors' }, opts); }
export function destroySkulls(opts?: SegmentOpts): GemSegment { return clearSeg('destroy', { kind: 'skulls' }, opts); }
export function explodeSkulls(opts?: SegmentOpts): GemSegment { return clearSeg('explode', { kind: 'skulls' }, opts); }

// 随机 N 颗宝石（include: 'color' 仅颜色 / 'all' 含骷髅 / 'skull' 仅普通骷髅，默认 all；
// 可限定 color 或 colors 双色并集池（R22 批 8429）；opts.modifier 数量二次缩放、opts.countRange 区间）
export function destroyRandomGems(base: number, mult = 0, include: 'color' | 'all' | 'skull' = 'all', color?: ColorSpec, opts?: SegmentOpts & { countRange?: { min: number; max: number }; colors?: ColorSpec[] }): GemSegment {
  const target: import('./effects/gems').ClearTarget = { kind: 'randomGems', count: scale(base, mult), include };
  if (color !== undefined) target.color = color;
  if (opts?.colors !== undefined) target.colors = opts.colors;
  if (opts?.countRange !== undefined) target.countRange = opts.countRange;
  return clearSeg('destroy', target, opts);
}
export function explodeRandomGems(base: number, mult = 0, include: 'color' | 'all' | 'skull' = 'all', color?: ColorSpec, opts?: SegmentOpts & { countRange?: { min: number; max: number }; colors?: ColorSpec[] }): GemSegment {
  const target: import('./effects/gems').ClearTarget = { kind: 'randomGems', count: scale(base, mult), include };
  if (color !== undefined) target.color = color;
  if (opts?.colors !== undefined) target.colors = opts.colors;
  if (opts?.countRange !== undefined) target.countRange = opts.countRange;
  return clearSeg('explode', target, opts);
}

/**
 * 随机爆破 N 颗普通骷髅（R22 批，7136「随机爆破 10 颗骷髅头」/ 8504「炸毁三个骷髅头」）：
 * include 'skull' 限定普通骷髅（末日族属特殊宝石，不入池），爆破仍辐射一圈。
 */
export function explodeRandomSkulls(base: number, mult = 0, opts?: SegmentOpts): GemSegment {
  return explodeRandomGems(base, mult, 'skull', undefined, opts);
}

/**
 * 双色并集池随机爆破（R22 批，8429「爆破 [魔法 + 1] 颗绿色或紫色宝石」）：逐颗从
 * 两色**合并池**随机取（官方 ExplodeColor×2 双步骤口径），非 oneOf 二选一。
 */
export function explodeRandomGemsAny(colors: [ColorSpec, ColorSpec], base: number, mult = 0, opts?: SegmentOpts): GemSegment {
  return explodeRandomGems(base, mult, 'all', undefined, { ...opts, colors });
}

// 以某格为中心（cell 可 CELL）：destroy=仅该格；explode=该格辐射一圈(3x3)
export function destroyAt(cell: CellPos | typeof CELL): GemSegment { return clearSeg('destroy', { kind: 'cell', cell }); }
/** 以选定格（或固定格）为中心引爆（3x3）——即 explode 单格辐射一圈 */
export function explodeAt(cell: CellPos | typeof CELL, opts?: SegmentOpts): GemSegment {
  return clearSeg('explode', { kind: 'cell', cell }, opts);
}
/** @deprecated 旧名，等价 explodeAt（radius 已由"辐射一圈"取代） */
export function destroyAround(cell: CellPos | typeof CELL): GemSegment { return explodeAt(cell); }

/**
 * 面积形状清除（R12 批；R13 批增补 circle5）：以中心格（缺省棋盘中心，可给固定格/CELL）
 * 生成形状格集合，走既有清除管线。形状即完整目标集——不再做 8 邻辐射，mode 只区分事件类型：
 *   destroyArea('square5', 'destroy')  「摧毁一整块大小为 5x5 的宝石」（官方 Block5x5）
 *   destroyArea('square3', 'explode')  「爆破 3x3 阵型的宝石」（官方 Block3x3）
 *   destroyArea('cross3',  'explode')  「以 3x3 交叉队列方式爆破」（官方 Block1x3+Block3x1 十字）
 *   destroyArea('x',       'destroy')  「以 X 形状摧毁宝石」（过中心的两条对角线）
 *   destroyArea('circle5', 'destroy')  「摧毁 5x5 圈宝石」（官方 BoardTarget=Circle，半径 2.5 格圆）
 */
export function destroyArea(
  shape: import('./effects/gems').AreaShape,
  mode: 'destroy' | 'explode' = 'destroy',
  center?: CellPos | typeof CELL | 'RANDOM',
  opts?: SegmentOpts,
): GemSegment {
  const target: import('./effects/gems').ClearTarget = center !== undefined
    ? { kind: 'area', shape, center }
    : { kind: 'area', shape };
  return clearSeg(mode, target, opts);
}

// —— 状态 ——

/** 状态默认存续回合 */
const DEFAULT_STATUS_TURNS = 3;
/** DoT 默认每回合伤害 */
const DEFAULT_DOT = 3;
/** 出血官方语义：每回合 1 点/层（DECISIONS 语义对齐清单） */
const BLEED_DOT = 1;
const DOT_IDS = new Set(['poison', 'burning']);
const BLEED_IDS = new Set(['bleed']);

/**
 * 施加状态段。turns/magnitude 缺省用默认值；DoT（中毒/燃烧）默认带伤害量。
 * 支持概率/死亡条件等公共选项。
 * opts.perDestroyed（原语 Wave4 批，官方 InflictEffectOnRandomTroops +
 * UseCounterForAmount 步骤族）：给出时施加次数 = 本次施放被摧毁的该类宝石数
 * （color 筛基色 / 'skull' 筛骷髅族 / 缺省全部），每次随机取目标池一名（可重复）——
 * 7463「每摧毁一颗黄宝石便使一名随机盟友获得屏障」= inflict('barrier','allyAll',
 * { perDestroyed: { color: BaseColor.Yellow } })。
 */
export function inflict(
  statusId: string,
  target: TargetMode,
  opts: { turns?: number; magnitude?: number; stacks?: number; n?: number; perDestroyed?: { color?: import('../types').BaseColor | 'skull' }; perCount?: ModifierSpec } & SegmentOpts & NRangeOpts = {},
): StatusSegment {
  const turns = opts.turns ?? DEFAULT_STATUS_TURNS;
  const seg: StatusSegment = { kind: 'status', target, statusId, turns };
  const mag = opts.magnitude ?? (DOT_IDS.has(statusId) ? DEFAULT_DOT : BLEED_IDS.has(statusId) ? BLEED_DOT : undefined);
  if (mag !== undefined) seg.magnitude = mag;
  if (opts.n !== undefined) seg.n = opts.n;
  if (opts.nRange !== undefined) seg.nRange = opts.nRange;
  if (opts.stacks !== undefined && opts.stacks > 1) seg.stacks = opts.stacks;
  if (opts.perDestroyed !== undefined) seg.perDestroyed = opts.perDestroyed;
  if (opts.perCount !== undefined) seg.perCount = opts.perCount;
  return attach(seg, opts);
}

// —— 风暴 / 打乱板面 / 随机多选一（引擎原语批，DECISIONS 翻案记录②） ——

/** 风暴段选项：颜色必填；骷髅系风暴（骸骨/末日/超级末日）给 dropKind；持续回合缺省 8 */
export function createStorm(
  color: BaseColor,
  opts: SegmentOpts & { turns?: number; dropKind?: SkullStormDropKind } = {},
): StormSegment {
  const seg: StormSegment = { kind: 'storm', color, turns: opts.turns ?? 8 };
  if (opts.dropKind !== undefined) seg.dropKind = opts.dropKind;
  return attach(seg, opts);
}

/** 打乱板面（「Shuffle the Board」）：满盘时把现有宝石重排到无现成三连且有解的布局 */
export function shuffleBoard(opts?: SegmentOpts): ShuffleBoardSegment {
  return attach({ kind: 'shuffleBoard' }, opts);
}

/**
 * 随机多选一（「X 或 Y」「或 A 或 B 或 C」）：执行时 rng 掷选一支，只执行该支。
 * 每支可为一至多个段（「造成真实伤害，再陷入燃烧」整支算一个选项）。
 */
export function oneOf(...branches: (EffectSegment | EffectSegment[])[]): OneOfSegment {
  return { kind: 'oneOf', options: branches.map((b) => (Array.isArray(b) ? b : [b])) };
}

// —— 召唤 ——

/**
 * 召唤段。召唤物逐技能显式指定：
 *   summonRef('Skeleton')            引用已有兵种
 *   summonRandom(['Goblin', ...])    随机族（种子化选一个）
 *   summonTemplate({ name, maxHp,... }) 手写模板
 */
export function summonRef(referenceName: string, troopId?: number, opts?: SegmentOpts & { countRange?: { min: number; max: number }; position?: 'front' | 'back' }): SummonSegment {
  const source: SummonSource = troopId !== undefined
    ? { ref: referenceName, troopId }
    : { ref: referenceName };
  const seg = attach({ kind: 'summon', params: { source, countRange: opts?.countRange, position: opts?.position } } as SummonSegment, opts);
  return seg;
}
export function summonRandom(refs: string[], troopId?: number, opts?: SegmentOpts & { countRange?: { min: number; max: number } }): SummonSegment {
  const source: SummonSource = troopId !== undefined
    ? { randomOf: refs, troopId }
    : { randomOf: refs };
  const seg = attach({ kind: 'summon', params: { source, countRange: opts?.countRange } } as SummonSegment, opts);
  return seg;
}
export function summonTemplate(template: SummonTemplate, troopId?: number): SummonSegment {
  const source: SummonSource = troopId !== undefined
    ? { template, troopId }
    : { template };
  return { kind: 'summon', params: { source } };
}

/**
 * 按王国随机召唤（武器原语批 K-E，「召唤一名来自X王国的随机部队」）：执行期经
 * 注入的王国兵册解析器取该王国的 referenceName 清单（troops.json kingdom 字段口径，
 * TurnEngine.setSummonKingdomResolver 注入），再种子化掷选一名召唤——官方语义 =
 * 整个王国兵册均匀随机。清单为空/解析器缺省 → 整段安全跳过（零随机消耗）。
 */
export function summonRandomOfKingdom(kingdom: string, troopId?: number, opts?: SegmentOpts & { countRange?: { min: number; max: number } }): SummonSegment {
  const source: SummonSource = troopId !== undefined
    ? { randomOfKingdom: kingdom, troopId }
    : { randomOfKingdom: kingdom };
  return attach({ kind: 'summon', params: { source, countRange: opts?.countRange } } as SummonSegment, opts);
}

/**
 * 按种族随机召唤（batch-r28，「召唤一位随机恶魔」7435/8056）：名册 = data/raceRoster.ts
 * 构建期从 troops.json 提取的 种族→referenceName[] 静态表（不依赖 TurnEngine 注入的
 * 王国解析器），效果段直接把名册喂给 summonRandom 的 randomOf 池（种子化均匀掷选，
 * 官方语义 = 该族全兵册随机）。名册缺该族/为空 → 整段安全跳过（零随机消耗）。
 */
export function summonRandomOfRace(race: string, opts?: SegmentOpts & { countRange?: { min: number; max: number } }): SummonSegment {
  return summonRandom([...(RACE_SUMMON_REFS[race] ?? [])], undefined, opts);
}

// —— 其它 ——

/** 获得额外回合（可带死亡条件：「如果敌人身亡，则获得一个额外回合」） */
export function extraTurn(opts?: SegmentOpts): ExtraTurnSegment {
  return attach({ kind: 'extraTurn' }, opts);
}

// —— 逃跑 / 战场经济（DECISIONS 四项拍板①③） ——

/**
 * 逃跑（「有 N% 的几率跑掉」）：判定成功 → 施法者逃出战斗（标 fled、移出编队，
 * 不算阵亡——不触发死亡召唤/阵亡响应；全队逃光判负）。
 */
export function escape(chance: number): EscapeChanceSegment {
  return { kind: 'escapeChance', escapeChance: clamp01(chance) };
}

/**
 * 战场经济获得（金币/灵魂/宝石）：数值 = [魔法 × mult + base]，opts.modifier 支持
 * 二次缩放（来源可为 battleGold/battleSouls/battleGems 等）。
 * 「获得 10 金币」= gainGold(10)；「获得 [魔法 + 2] 点灵魂」= gainSouls(2)。
 */
export function gainGold(base: number, mult = 0, opts: SegmentOpts = {}): GainEconomySegment {
  return attach({ kind: 'gainEconomy', currency: 'gold', scaling: scale(base, mult) }, opts);
}
export function gainSouls(base: number, mult = 0, opts: SegmentOpts = {}): GainEconomySegment {
  return attach({ kind: 'gainEconomy', currency: 'souls', scaling: scale(base, mult) }, opts);
}
export function gainGems(base: number, mult = 0, opts: SegmentOpts = {}): GainEconomySegment {
  return attach({ kind: 'gainEconomy', currency: 'gems', scaling: scale(base, mult) }, opts);
}

/** Transfer available enemy Gold; optionally defer native GiveGold until after another step. */
export function stealGold(base: number, mult = 0, opts: SegmentOpts & { cap?: number; all?: boolean; deferCredit?: boolean } = {}): StealGoldSegment {
  const seg = attach({ kind: 'stealGold', scaling: scale(base, mult) } as StealGoldSegment, opts);
  if (opts.cap !== undefined) seg.cap = opts.cap;
  if (opts.all) seg.all = true;
  if (opts.deferCredit) seg.deferCredit = true;
  return seg;
}

/**
 * 花费/失去黄金（batch-r28，官方 TakeMyGold——7460「花费我所有的黄金以增强伤害」/
 * 8243「失去所有黄金」）：spendGold() 全额扣减施法者黄金计数（夹零），实际扣减额入
 * castTracking.goldSpent，后续伤害段以 { multiplier 1, source: goldSpent } 引用同额
 * （「花费的黄金转化为伤害加成」；支出段须排在消费段之前）。
 */
export function spendGold(opts: SegmentOpts & { all?: boolean } = {}): SpendEconomySegment {
  const seg = attach({ kind: 'spendEconomy', currency: 'gold', scaling: scale(0, 0) } as SpendEconomySegment, opts);
  if (opts.all !== false) seg.all = true;
  return seg;
}


// —— 放弃桶回收原语（2026-09-17 用户裁定：献祭/随机状态/兵种转化/藏宝图/特定兵种在场） ——

/** 献祭（「献祭一名盟友」= 随机一名盟友，GoW 官方口径）：即杀己方目标（走 execute 管线，
 *  阵亡钩子照常触发）；属性快照入跨段追踪，供 modifier 来源 sacrificedStat。 */
export function sacrifice(target: TargetMode, opts?: SegmentOpts): SacrificeSegment {
  return attach({ kind: 'sacrifice', target }, opts);
}

/**
 * 随机状态（「造成随机状态效果」）：每目标独立掷签，池按目标阵营（盟友=正面池、
 * 敌方=负面池，池见 effects/status.ts）。opts.times 连掷 N 条（「陷入 3 个随机状态
 * 效果」，每条独立掷签）；opts.pool='positive' 强制正面全集（原语 Wave3 批，官方
 * RandomPositiveStatusEffect——Book of Secrets「…or Allies」分支，无视阵营）。
 */
export function inflictRandom(target: TargetMode, opts?: SegmentOpts & { turns?: number; times?: number; pool?: 'positive' }): RandomStatusSegment {
  const seg = attach({ kind: 'randomStatus', target } as RandomStatusSegment, opts);
  if (opts?.turns !== undefined) seg.turns = opts.turns;
  if (opts?.times !== undefined) seg.times = opts.times;
  if (opts?.pool !== undefined) seg.pool = opts.pool;
  return seg;
}

/** 兵种转化（「将一名随机敌人转化为怨灵」）：ref 为 troops.json 的 referenceName（英文）。
 *  就地替换、保留编队位，不触发阵亡钩子（官方「转化不是死亡」）。 */
export function transformTroop(target: TargetMode, ref: string, opts?: SegmentOpts & { troopId?: number; fullMana?: boolean }): TransformTroopSegment {
  const seg = attach({ kind: 'transformTroop', target, ref } as TransformTroopSegment, opts);
  if (opts?.troopId !== undefined) seg.troopId = opts.troopId;
  if (opts?.fullMana !== undefined) seg.fullMana = opts.fullMana;
  return seg;
}

/** 兵种族随机转化（「转化为一只随机龙族」）：候选 referenceName 集合，rng 掷选 */
export function transformTroopRandom(target: TargetMode, refs: string[], opts?: SegmentOpts & { troopId?: number }): TransformTroopSegment {
  const seg = attach({ kind: 'transformTroop', target, randomOf: refs } as TransformTroopSegment, opts);
  if (opts?.troopId !== undefined) seg.troopId = opts.troopId;
  return seg;
}

/** 获得藏宝图（「有 20% 的几率获得一张藏宝图」= gainMaps(1, 0, { chance: 0.2 })）。
 *  战场经济第四币种；来源计数 battleMaps 供二次缩放（「每张藏宝图额外创造 4 颗 [x4]」）。 */
export function gainMaps(base: number, mult = 0, opts?: SegmentOpts): GainEconomySegment {
  return attach({ kind: 'gainEconomy', currency: 'maps', scaling: scale(base, mult) }, opts);
}


/**
 * 调位（「将一名敌人击回末位」「移至队伍首位」）：改编队顺序，影响前 N 名类目标序。
 * opts.n（原语 Wave4 批，8101 Tricky Blow 官方两轮 TroopOrderBack 的第二轮）：配合
 * 'enemyNth'/'allyNth' 目标模式指定编队第 N 位（1-based、按执行时刻动态解析）——
 * 「第二次击退」= reposition('enemyNth', 'back', { n: 2 })。
 */
export function reposition(target: TargetMode, to: 'front' | 'back', opts?: SegmentOpts & { n?: number }): RepositionSegment {
  const seg = attach({ kind: 'reposition', target, to } as RepositionSegment, opts);
  if (opts?.n !== undefined) seg.n = opts.n;
  return seg;
}

/** 队伍乱序（「打乱敌方队伍」）：整队种子化重排 */
export function shuffleTeam(side: 'ally' | 'enemy', opts?: SegmentOpts): ShuffleTeamSegment {
  return attach({ kind: 'shuffleTeam', side }, opts);
}

// —— 武器法术原语批（窗口 K-E，生成器下一轮按名字消费） ——

/**
 * 通用计数来源增幅（「因X数量而增强 [xN]」）：ModifierSpec = multiplier a × 来源计数，
 * 计数为 0 时增项为 0（multiplier 路径早退）。来源取值域见
 * effects/secondary.ts 的 ModifierSource（destroyedGems/boardGems/alliesOfColor/…）。
 */
export function boostPer(source: ModifierSource, a: number): ModifierSpec {
  return { mod: { kind: 'multiplier', a }, source };
}

/**
 * 淬炼段位增幅（官方 Doomed 档武器族 76 把「+N per Tempering level / 每锻炼 1 个武器
 * 段位则 +N」）：计数来源 = 施法者（主角）的 `Character.temperingLevel`（缺省 0）。
 * 「Deal [Magic + 10] scatter damage, +4 per Tempering level」=
 * dmg(…, 10, 1, { modifier: temperingBoost(4) })——level 2 → +8、level 0 → 增项为 0。
 */
export function temperingBoost(a: number): ModifierSpec {
  return boostPer({ kind: 'tempering' }, a);
}

/** 敌方色计数增幅（「因X色敌人数而增强 [xN]」，来源 enemiesOfColor） */
export function enemiesOfColorBoost(color: BaseColor, a: number): ModifierSpec {
  return boostPer({ kind: 'enemiesOfColor', color }, a);
}

/** 敌方种族计数增幅（「因X族敌人数而增强 [xN]」，来源 enemiesOfRace，K-E 批新增） */
export function enemiesOfRaceBoost(race: string, a: number): ModifierSpec {
  return boostPer({ kind: 'enemiesOfRace', race }, a);
}

/** 王国盟友计数增幅（「因X王国盟友数量而增强 [xN]」，来源 alliesOfKingdom） */
export function alliesOfKingdomBoost(kingdom: string, a: number): ModifierSpec {
  return boostPer({ kind: 'alliesOfKingdom', kingdom }, a);
}

/** 王国敌人计数增幅（「因来自X王国的敌人数量而增强 [xN]」，来源 enemiesOfKingdom） */
export function enemiesOfKingdomBoost(kingdom: string, a: number): ModifierSpec {
  return boostPer({ kind: 'enemiesOfKingdom', kingdom }, a);
}

/**
 * 敌方拥有劫数（官方 Doomed 档武器族「If the Enemy has a Doom / 如果敌方有劫数，
 * 则再增加 N 点」）：条件 kind targetHasDoom——敌方存活者中存在 TroopType 'Doom'
 * 的劫数部队（troops.json 考证见 effects/secondary.ts）。全局条件，配 opts.condBonus /
 * opts.condMult / opts.ifCond 消费：「Give 3 Magic to all Allies, if the Enemy has a
 * Doom, give 5 more」= magic('allyAll', 3, 0, { condBonus: { n: 5, cond: enemyHasDoom() } })。
 */
export function enemyHasDoom(): Condition {
  return { kind: 'targetHasDoom' };
}

/**
 * 战斗发生在指定王国（官方「战斗发生在X王国时…」条件族）：条件 kind kingdomPresent，
 * 读战斗上下文 GameState.kingdom（BattleRequest.kingdom → createGameState opts 注入；
 * 探索/入侵 = 当前王国、竞技场 = null）。缺省/null → 恒为假。全局条件，配
 * opts.ifCond / opts.condMult / opts.condBonus 消费。
 */
export function kingdomPresent(kingdom: string): Condition {
  return { kind: 'kingdomPresent', kingdom };
}

/**
 * 「如果一名敌人死亡」（武器 K-B 收官轮，官方「If an Enemy dies, …」条件族——
 * 7117/7861/8075/8076/9629/9903 考证：官方语义 = 本咒语执行中任一敌人被击杀
 * （若结尾条件是即时死亡判定），与部队批 R22 已落地的 anyTrackedDied 口径一致
 * （9986/9812/7747「若有敌人死亡」同族先例——读本次施放跨段追踪 allTargets：
 * 任一目标执行前存活、现下阵亡即真）。故不新增 Condition kind，本构造器为
 * `{ kind: 'anyTrackedDied' }` 的武器法术专名形态，配 opts.ifCond 消费。
 */
export function anyEnemyDied(): Condition {
  return { kind: 'anyTrackedDied' };
}

/** once-per-battle 原型（「此咒语只能使用一次」）：本场重复释放会被引擎拒绝（不占号） */
export function skillOnce(...segments: SkillPrototype['segments']): SkillPrototype {
  return { segments, oncePerBattle: true };
}

// —— R22 批新增原语（92 条硬尾攻坚） ——

/**
 * 通用混合创造（R22 批，官方 CreateGems「a mix of …」句式）：entries 逐颗放回均匀掷选，
 * 端点可为颜色占位符（'CHOSEN' 等）/ 'SKULL'（骷髅头）/ 特殊宝石 spec——
 *   8880「创造 24 颗混合紫色和骷髅头的宝石」= createGemsMixAny(['Purple', 'SKULL'], 24)
 *   9780「创造 14 颗绿色和流血宝石混合体」= createGemsMixAny(['Green', { kind: 'bleedGem' }], 14)
 */
export function createGemsMixAny(
  entries: (ColorSpec | 'SKULL' | SpecialGemSpec)[],
  base: number,
  mult = 0,
  opts: CreateOpts = {},
): GemSegment {
  entries.forEach((entry) => { if (typeof entry !== 'string') requireSpiritColor(entry); });
  const params: CreateGemParams = { op: 'create', gem: { kind: 'mixAny', entries }, count: scale(base, mult) };
  return createSeg(params, opts);
}

/**
 * 吞噬（R22 批，官方 Devour——8573/9364/9492）：即杀目标（走伤害管线，阵亡钩子照常）+
 * 吞噬者获得目标当前攻击、护甲、生命而非魔法（opts.gain 可覆写）。「免疫吞噬」特质目标跳过。
 * opts.chance（基础概率，恒必填）/ opts.chanceMult（条件倍率）/ opts.chanceBoost（加成
 * 百分点）在原语内部掷签——掷签失败时目标解析照常入跨段追踪，后段 dmg('lastTarget') 在
 * 成功时自动空转（目标已死）、失败时正常生效（8573「否则则造成伤害」无需额外条件）。
 */
export function devour(target: TargetMode, opts: SegmentOpts & { chance: number; chanceMult?: { times: number; cond: import('./effects/secondary').Condition }; gain?: { attack?: number; armor?: number; magic?: number; hp?: number } }): DevourSegment {
  const seg = attach({ kind: 'devour', target, chance: opts.chance } as DevourSegment, opts);
  if (opts.chanceMult !== undefined) seg.chanceMult = opts.chanceMult;
  return seg;
}

/** 复制召唤（R22 批，官方 SummoningTarget(NoError)——8188「复制盟友」8190「复制那名敌人」
 *  8273「召唤首位敌人的卡牌」）：以目标现存角色快照为模板召唤一名（满血、零法力、无状态）。 */
export function summonCopy(target: TargetMode, opts?: SegmentOpts): SummonCopySegment {
  return attach({ kind: 'summonCopy', target } as SummonCopySegment, opts);
}

/**
 * 交换编队位（R22 批，官方 Swap——7555「再使他们交换位置」7992「使首位和末位敌人
 * 交换位置」）：两个目标模式各解析一名存活者（同队、不同人），交换其编队索引。
 */
export function swapPositions(a: TargetMode, b: TargetMode, opts?: SegmentOpts): SwapPositionsSegment {
  return attach({ kind: 'swapPositions', a, b } as SwapPositionsSegment, opts);
}

/**
 * 自复活（凤凰涅槃批，Sunbird「浴火重生」官方 "Die and rise from the Ashes"）：本次施法中
 * 施法者被击杀 → 死亡被撤销（defeat 不出流、不出编队、不触发阵亡钩子），原位回血复活。
 * healPct 缺省 0.5（复活到 50% maxHp、向上取整）；opts.full = 满血复活（官方涅槃口径）；
 * opts.fullMana = 复活同时法力回满（deepsoul「复活并恢复全部魔力」）。
 * 与 escape() 同理不接受 opts.chance：段级缺省必发（chance 管线是「整段是否执行」掷签，
 * 与复活判定语义冲突）；无死亡时整段零事件、零随机消耗。
 */
export function selfRevive(healPct = 0.5, opts: SegmentOpts & { full?: boolean; fullMana?: boolean } = {}): SelfReviveSegment {
  const seg = attach({ kind: 'selfRevive', healPct } as SelfReviveSegment, opts);
  if (opts.full) seg.full = true;
  if (opts.fullMana) seg.fullMana = true;
  return seg;
}

/**
 * 化形为复制体（R22 批，官方 TransformSelfFromTarget——8187「转化成一名敌人」）：施法者
 * 就地改写为 source 模式解析出的现存敌人/盟友快照（保留自身 id 与编队位，不触发阵亡钩子）。
 */
export function transformSelfFrom(source: TargetMode, opts?: SegmentOpts & { troopId?: number }): TransformTroopSegment {
  return attach({ kind: 'transformTroop', target: 'allySelf', copyOf: source } as TransformTroopSegment, opts);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
