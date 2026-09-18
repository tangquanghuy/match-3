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
import type { ModifierSpec } from './effects/secondary';
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
  EffectSegment,
  ExtraTurnSegment,
  SummonSegment,
  EscapeChanceSegment,
  GainEconomySegment,
  SacrificeSegment,
  RandomStatusSegment,
  TransformTroopSegment,
  RepositionSegment,
  ShuffleTeamSegment,
  NRangeSpec,
} from './prototypes';

/** 选色占位符：技能文本"指定/选定颜色"，运行时由 ColorChooser 解析（需求 2） */
export const CHOSEN = 'CHOSEN' as const;

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
  return seg;
}

/** 组装技能：把若干效果段按顺序组成一个技能原型 */
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
  trueDamage?: boolean;
  /** enemyFirstN/allyFirstN/allyRandomN/enemyRandomN 的 N */
  n?: number;
  /** 伤害区间（[A] – [B]）：设置后忽略 base/mult */
  rangeSpec?: { min: ScalingSpec; max: ScalingSpec };
  /** 分摊（「伤害分摊给至多 {N} 名敌人」）：掷一次总额均分给前 N 名存活敌人 */
  split?: number;
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
  if (opts.trueDamage) seg.trueDamage = true;
  if (opts.n !== undefined) seg.n = opts.n;
  if (opts.nRange !== undefined) seg.nRange = opts.nRange;
  if (opts.rangeSpec) seg.rangeSpec = opts.rangeSpec;
  if (opts.split !== undefined) seg.split = opts.split;
  if (opts.drain) seg.drain = true;
  if (opts.execute) seg.execute = true;
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

type BuffOpts = SegmentOpts & NRangeOpts & { n?: number; full?: boolean; halve?: boolean; fraction?: number };

function buff(target: TargetMode, stat: BuffStat, base: number, mult: number, opts?: BuffOpts): BuffSegment {
  const seg: BuffSegment = { kind: 'buff', target, stat, scaling: scale(base, mult) };
  if (opts?.n !== undefined) seg.n = opts.n;
  if (opts?.nRange !== undefined) seg.nRange = opts.nRange;
  if (opts?.full) seg.full = true;
  if (opts?.halve) seg.halve = true;
  if (opts?.fraction !== undefined) seg.fraction = opts.fraction;
  return attach(seg, opts);
}
/** 治疗（opts.full = 全额治疗：「恢复所有生命值」；opts.n = N 目标：「前 2 位盟友」） */
export function heal(target: TargetMode, base: number, mult = 1, opts: BuffOpts = {}): BuffSegment {
  return buff(target, 'hp', base, mult, opts);
}
/** 加护甲 */
export function armor(target: TargetMode, base: number, mult = 1, opts: BuffOpts = {}): BuffSegment {
  return buff(target, 'armor', base, mult, opts);
}
/** 加攻击力 */
export function attack(target: TargetMode, base: number, mult = 1, opts: BuffOpts = {}): BuffSegment {
  return buff(target, 'attack', base, mult, opts);
}
/** 加魔法值 */
export function magic(target: TargetMode, base: number, mult = 1, opts: BuffOpts = {}): BuffSegment {
  return buff(target, 'magic', base, mult, opts);
}
/** 加法力（opts.halve = 「获得半数法力值」：获得 floor(manaCost/2)，忽略数值；
 *  opts.fraction = 任意比例（R12 批）：「获得 4 分之一的法力值 / 25% 法力值」= floor(manaCost × fraction)） */
export function mana(target: TargetMode, base: number, mult = 1, opts: BuffOpts = {}): BuffSegment {
  return buff(target, 'mana', base, mult, opts);
}

/** Remove all current statuses from selected allies. */
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
export function randomStat(target: TargetMode, base: number, mult = 1, opts: SegmentOpts & NRangeOpts = {}): import('./prototypes').RandomStatSegment {
  const seg: import('./prototypes').RandomStatSegment = { kind: 'randomStat', target, scaling: scale(base, mult) };
  if (opts.nRange !== undefined) seg.nRange = opts.nRange;
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
  /** 连掷次数（仅 stat='random'）：「从其 2 个随机技能值各消除 N 点」= 2（官方多条
   *  DecreaseRandom 步骤，每步独立掷签攻/甲/魔其一）；缺省 1 */
  times?: number;
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
  if (opts.times !== undefined) seg.times = opts.times;
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
 * 「窃取 2 点护甲值并将之转为魔法值」= steal(t, 'armor', 'magic', 2, 0)。
 * stat='random'（R12 批，官方 StealRandom）：gainStat 仅作窃取标记，
 * 实际获得 = 掷中的那项属性；一般用 stealRandomStat() 构造。
 */
export function steal(
  target: TargetMode,
  stat: ReduceStat,
  gainStat: BuffStat,
  base: number,
  mult = 1,
  opts: ReduceOpts & { gainRatio?: number } = {},
): ReduceSegment {
  const seg: ReduceSegment = { kind: 'reduce', target, stat, scaling: scale(base, mult), gainStat };
  if (opts.gainRatio !== undefined && opts.gainRatio !== 1) seg.gainRatio = opts.gainRatio;
  if (opts.n !== undefined) seg.n = opts.n;
  if (opts.nRange !== undefined) seg.nRange = opts.nRange;
  if (opts.times !== undefined) seg.times = opts.times;
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
 */
export function createMix(colors: ColorSpec[], base: number, mult = 0, opts: CreateOpts = {}): GemSegment {
  const params: CreateGemParams = { op: 'create', gem: { kind: 'mix', colors }, count: scale(base, mult) };
  return createSeg(params, opts);
}

/**
 * 创造特殊宝石（「创造 2 颗炸弹宝石」「创造一颗织网宝石」；窗口 C spec，台账 09-14）。
 * kind 取值域见 types.ts SpecialGemKind（doomSkull/uberDoomSkull/bomb/web/lightningRow/
 * lightningCol/wildcard/wish/hourglass/ghost）；wildcard 带 tier（2/4）。
 */
export function createSpecialGems(spec: SpecialGemSpec, base: number, mult = 0, opts: CreateOpts = {}): GemSegment {
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
  const params: CreateGemParams = { op: 'create', gem: { kind: 'mixSpecial', specs: [kinds[0], kinds[1]] }, count: scale(base, mult) };
  return createSeg(params, opts);
}

// —— 特殊宝石清除（「摧毁所有末日骷髅头」「引爆 3 颗末日骷髅」） ——

/** 摧毁棋盘上某特殊宝石全量 */
export function destroySpecialGems(gem: SpecialGemKind): GemSegment {
  return clearSeg('destroy', { kind: 'special', gem });
}
/** 爆破棋盘上某特殊宝石全量（含辐射一圈） */
export function explodeSpecialGems(gem: SpecialGemKind): GemSegment {
  return clearSeg('explode', { kind: 'special', gem });
}
/** 随机摧毁 N 颗指定特殊宝石（「摧毁 3 颗末日骷髅头」） */
export function destroyRandomSpecialGems(gem: SpecialGemKind, base: number, mult = 0, opts?: SegmentOpts): GemSegment {
  return clearSeg('destroy', { kind: 'randomGems', count: scale(base, mult), include: 'all', special: gem }, opts);
}
/** 随机爆破 N 颗指定特殊宝石（「引爆 3 个末日骷髅」） */
export function explodeRandomSpecialGems(gem: SpecialGemKind, base: number, mult = 0, opts?: SegmentOpts): GemSegment {
  return clearSeg('explode', { kind: 'randomGems', count: scale(base, mult), include: 'all', special: gem }, opts);
}

/** 包一层段并透传创造段选项 */
function createSeg(params: CreateGemParams, opts: CreateOpts): GemSegment {
  if (opts.modifier) params.modifier = opts.modifier;
  if (opts.countRange !== undefined) params.countRange = opts.countRange;
  const seg: GemSegment = { kind: 'gem', params };
  return attach(seg, opts);
}
/** 转化：某色 → 另一色（全棋盘；任一端可为 CHOSEN）。opts.count = 定量随机转换 N 颗 */
export function transform(from: ColorSpec, to: ColorSpec, opts: SegmentOpts & { count?: number } = {}): GemSegment {
  const params: TransformGemParamsLike = { op: 'transform', from, to };
  if (opts.count !== undefined) params.count = flat(opts.count);
  return gemSegWithOpts(params, opts);
}

/** 定量转换的段选项（count 为常数颗数；概率/条件等公共选项照常） */
export interface TransformOpts extends SegmentOpts {
  /** 随机转换颗数（「将一颗宝石转换成炸弹宝石」「将 2 颗紫色宝石转换成X」） */
  count?: number;
}

/**
 * 转化：来源（色/'ANY' 不限）→ 指定特殊宝石，可定量（opts.count，随机取 N 颗）。
 * 「将一颗宝石转换成炸弹宝石」= transformToSpecial('ANY', 'bomb', { count: 1 })。
 */
export function transformToSpecial(from: TransformFrom, gem: SpecialGemKind, opts: TransformOpts = {}): GemSegment {
  const params: TransformGemParamsLike = { op: 'transform', from, to: 'SKULL', toSpecial: gem };
  if (opts.count !== undefined) params.count = flat(opts.count);
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
export function explodeChosenRow(): GemSegment { return clearSeg('explode', { kind: 'chosenLine', orientation: 'row' }); }
export function explodeChosenCol(): GemSegment { return clearSeg('explode', { kind: 'chosenLine', orientation: 'col' }); }

// 随机 N 行/列（opts.modifier 支持数量二次缩放）
export function destroyRandomRows(base: number, mult = 0, opts?: SegmentOpts): GemSegment { return clearSeg('destroy', { kind: 'randomLines', orientation: 'row', count: scale(base, mult) }, opts); }
export function destroyRandomCols(base: number, mult = 0, opts?: SegmentOpts): GemSegment { return clearSeg('destroy', { kind: 'randomLines', orientation: 'col', count: scale(base, mult) }, opts); }
export function explodeRandomRows(base: number, mult = 0, opts?: SegmentOpts): GemSegment { return clearSeg('explode', { kind: 'randomLines', orientation: 'row', count: scale(base, mult) }, opts); }
export function explodeRandomCols(base: number, mult = 0, opts?: SegmentOpts): GemSegment { return clearSeg('explode', { kind: 'randomLines', orientation: 'col', count: scale(base, mult) }, opts); }

// 指定颜色（可 CHOSEN）/ 全部颜色 / 骷髅
export function destroyColor(color: ColorSpec): GemSegment { return clearSeg('destroy', { kind: 'color', color }); }
export function explodeColor(color: ColorSpec): GemSegment { return clearSeg('explode', { kind: 'color', color }); }
export function destroyAllColors(): GemSegment { return clearSeg('destroy', { kind: 'allColors' }); }
export function destroySkulls(): GemSegment { return clearSeg('destroy', { kind: 'skulls' }); }
export function explodeSkulls(): GemSegment { return clearSeg('explode', { kind: 'skulls' }); }

// 随机 N 颗宝石（include: 'color' 仅颜色 / 'all' 含骷髅，默认 all；可限定 color；opts.modifier 支持数量二次缩放）
export function destroyRandomGems(base: number, mult = 0, include: 'color' | 'all' = 'all', color?: ColorSpec, opts?: SegmentOpts): GemSegment {
  const target: ClearTarget = { kind: 'randomGems', count: scale(base, mult), include };
  if (color !== undefined) target.color = color;
  return clearSeg('destroy', target, opts);
}
export function explodeRandomGems(base: number, mult = 0, include: 'color' | 'all' = 'all', color?: ColorSpec, opts?: SegmentOpts): GemSegment {
  const target: ClearTarget = { kind: 'randomGems', count: scale(base, mult), include };
  if (color !== undefined) target.color = color;
  return clearSeg('explode', target, opts);
}

// 以某格为中心（cell 可 CELL）：destroy=仅该格；explode=该格辐射一圈(3x3)
export function destroyAt(cell: CellPos | typeof CELL): GemSegment { return clearSeg('destroy', { kind: 'cell', cell }); }
/** 以选定格（或固定格）为中心引爆（3x3）——即 explode 单格辐射一圈 */
export function explodeAt(cell: CellPos | typeof CELL): GemSegment { return clearSeg('explode', { kind: 'cell', cell }); }
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
  center?: CellPos | typeof CELL,
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
 */
export function inflict(
  statusId: string,
  target: TargetMode,
  opts: { turns?: number; magnitude?: number; stacks?: number; n?: number } & SegmentOpts & NRangeOpts = {},
): StatusSegment {
  const turns = opts.turns ?? DEFAULT_STATUS_TURNS;
  const seg: StatusSegment = { kind: 'status', target, statusId, turns };
  const mag = opts.magnitude ?? (DOT_IDS.has(statusId) ? DEFAULT_DOT : BLEED_IDS.has(statusId) ? BLEED_DOT : undefined);
  if (mag !== undefined) seg.magnitude = mag;
  if (opts.n !== undefined) seg.n = opts.n;
  if (opts.nRange !== undefined) seg.nRange = opts.nRange;
  if (opts.stacks !== undefined && opts.stacks > 1) seg.stacks = opts.stacks;
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
export function summonRef(referenceName: string, troopId?: number, opts?: SegmentOpts & { countRange?: { min: number; max: number } }): SummonSegment {
  const source: SummonSource = troopId !== undefined
    ? { ref: referenceName, troopId }
    : { ref: referenceName };
  const seg = attach({ kind: 'summon', params: { source, countRange: opts?.countRange } } as SummonSegment, opts);
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
export function transformTroop(target: TargetMode, ref: string, opts?: SegmentOpts & { troopId?: number }): TransformTroopSegment {
  const seg = attach({ kind: 'transformTroop', target, ref } as TransformTroopSegment, opts);
  if (opts?.troopId !== undefined) seg.troopId = opts.troopId;
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


/** 调位（「将一名敌人击回末位」「移至队伍首位」）：改编队顺序，影响前 N 名类目标序 */
export function reposition(target: TargetMode, to: 'front' | 'back', opts?: SegmentOpts): RepositionSegment {
  return attach({ kind: 'reposition', target, to }, opts);
}

/** 队伍乱序（「打乱敌方队伍」）：整队种子化重排 */
export function shuffleTeam(side: 'ally' | 'enemy', opts?: SegmentOpts): ShuffleTeamSegment {
  return attach({ kind: 'shuffleTeam', side }, opts);
}

/** once-per-battle 原型（「此咒语只能使用一次」）：本场重复释放会被引擎拒绝（不占号） */
export function skillOnce(...segments: SkillPrototype['segments']): SkillPrototype {
  return { segments, oncePerBattle: true };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
