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

type BuffOpts = SegmentOpts & NRangeOpts & { n?: number; full?: boolean; halve?: boolean };

function buff(target: TargetMode, stat: BuffStat, base: number, mult: number, opts?: BuffOpts): BuffSegment {
  const seg: BuffSegment = { kind: 'buff', target, stat, scaling: scale(base, mult) };
  if (opts?.n !== undefined) seg.n = opts.n;
  if (opts?.nRange !== undefined) seg.nRange = opts.nRange;
  if (opts?.full) seg.full = true;
  if (opts?.halve) seg.halve = true;
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
/** 加法力（opts.halve = 「获得半数法力值」：获得 floor(manaCost/2)，忽略数值） */
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
}

/**
 * 削减段：目标属性扣减（夹零）。stat='mana' 即耗蓝；opts.halve = 按当前值减半。
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
  return attach(seg, opts);
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
export function summonRef(referenceName: string, troopId?: number): SummonSegment {
  const source: SummonSource = troopId !== undefined
    ? { ref: referenceName, troopId }
    : { ref: referenceName };
  return { kind: 'summon', params: { source } };
}
export function summonRandom(refs: string[], troopId?: number): SummonSegment {
  const source: SummonSource = troopId !== undefined
    ? { randomOf: refs, troopId }
    : { randomOf: refs };
  return { kind: 'summon', params: { source } };
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
