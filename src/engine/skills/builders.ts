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
import type { CellPos } from '../types';
import type { ScalingSpec } from './scaling';
import type { TargetMode } from './targeting';
import type { DamageRange } from './effects/damage';
import type { BuffStat } from './effects/buff';
import type { ColorSpec, ClearTarget } from './effects/gems';
import type { SummonSource, SummonTemplate } from './effects/summon';
import type {
  SkillPrototype,
  DamageSegment,
  BuffSegment,
  GemSegment,
  StatusSegment,
  CleanseSegment,
  ExtraTurnSegment,
  SummonSegment,
} from './prototypes';

/** 选色占位符：技能文本"指定/选定颜色"，运行时由 ColorChooser 解析（需求 2） */
export const CHOSEN = 'CHOSEN' as const;

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

/** 通用伤害段 */
export function dmg(
  target: TargetMode,
  base: number,
  mult = 1,
  opts: { range?: DamageRange; trueDamage?: boolean; n?: number } = {},
): DamageSegment {
  const seg: DamageSegment = { kind: 'damage', target, scaling: scale(base, mult) };
  if (opts.range) seg.range = opts.range;
  if (opts.trueDamage) seg.trueDamage = true;
  if (opts.n !== undefined) seg.n = opts.n;
  return seg;
}

/** 溅射伤害（主目标 + 相邻位） */
export function dmgSplash(target: TargetMode, base: number, mult = 1): DamageSegment {
  return dmg(target, base, mult, { range: 'splash' });
}

/** 全体伤害（range=all；target 一般用 enemyAll） */
export function dmgAll(base: number, mult = 1, trueDamage = false): DamageSegment {
  return dmg('enemyAll', base, mult, { range: 'all', trueDamage });
}

/** 真实/穿透伤害（跳护甲） */
export function trueDmg(target: TargetMode, base: number, mult = 1): DamageSegment {
  return dmg(target, base, mult, { trueDamage: true });
}

// —— 增益（作用己方） ——

function buff(target: TargetMode, stat: BuffStat, base: number, mult: number): BuffSegment {
  return { kind: 'buff', target, stat, scaling: scale(base, mult) };
}
/** 治疗 */
export function heal(target: TargetMode, base: number, mult = 1): BuffSegment {
  return buff(target, 'hp', base, mult);
}
/** 加护甲 */
export function armor(target: TargetMode, base: number, mult = 1): BuffSegment {
  return buff(target, 'armor', base, mult);
}
/** 加攻击力 */
export function attack(target: TargetMode, base: number, mult = 1): BuffSegment {
  return buff(target, 'attack', base, mult);
}
/** 加魔法值 */
export function magic(target: TargetMode, base: number, mult = 1): BuffSegment {
  return buff(target, 'magic', base, mult);
}
/** 加法力 */
export function mana(target: TargetMode, base: number, mult = 1): BuffSegment {
  return buff(target, 'mana', base, mult);
}

/** Remove all current statuses from selected allies. */
export function cleanse(target: TargetMode, n?: number): CleanseSegment {
  const segment: CleanseSegment = { kind: 'cleanse', target };
  if (n !== undefined) segment.n = n;
  return segment;
}

// —— 宝石：创造 / 转化 ——

/** 创造指定颜色宝石（颜色可为 CHOSEN），数量 = [魔法 × mult + base]（默认常数） */
export function createGems(color: ColorSpec, base: number, mult = 0): GemSegment {
  return { kind: 'gem', params: { op: 'create', gem: { kind: 'color', color }, count: scale(base, mult) } };
}
/** 创造骷髅头，数量同上 */
export function createSkulls(base: number, mult = 0): GemSegment {
  return { kind: 'gem', params: { op: 'create', gem: { kind: 'skull' }, count: scale(base, mult) } };
}
/** 转化：某色 → 另一色（全棋盘；任一端可为 CHOSEN） */
export function transform(from: ColorSpec, to: ColorSpec): GemSegment {
  return { kind: 'gem', params: { op: 'transform', from, to } };
}

// —— 宝石：清除（destroy 只清目标 / explode 目标+辐射一圈） ——
//    统一用 clear 段：目标集(ClearTarget) × 模式(destroy|explode) 自由组合。

/** 选定宝石/格占位符：释放时玩家点选一枚宝石（见 CellChooser） */
export const CELL = 'CELL' as const;

function clearSeg(mode: 'destroy' | 'explode', target: ClearTarget): GemSegment {
  return { kind: 'gem', params: { op: 'clear', mode, target } };
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

// 随机 N 行/列
export function destroyRandomRows(base: number, mult = 0): GemSegment { return clearSeg('destroy', { kind: 'randomLines', orientation: 'row', count: scale(base, mult) }); }
export function destroyRandomCols(base: number, mult = 0): GemSegment { return clearSeg('destroy', { kind: 'randomLines', orientation: 'col', count: scale(base, mult) }); }
export function explodeRandomRows(base: number, mult = 0): GemSegment { return clearSeg('explode', { kind: 'randomLines', orientation: 'row', count: scale(base, mult) }); }
export function explodeRandomCols(base: number, mult = 0): GemSegment { return clearSeg('explode', { kind: 'randomLines', orientation: 'col', count: scale(base, mult) }); }

// 指定颜色（可 CHOSEN）/ 全部颜色 / 骷髅
export function destroyColor(color: ColorSpec): GemSegment { return clearSeg('destroy', { kind: 'color', color }); }
export function explodeColor(color: ColorSpec): GemSegment { return clearSeg('explode', { kind: 'color', color }); }
export function destroyAllColors(): GemSegment { return clearSeg('destroy', { kind: 'allColors' }); }
export function destroySkulls(): GemSegment { return clearSeg('destroy', { kind: 'skulls' }); }
export function explodeSkulls(): GemSegment { return clearSeg('explode', { kind: 'skulls' }); }

// 随机 N 颗宝石（include: 'color' 仅颜色 / 'all' 含骷髅，默认 all）
export function destroyRandomGems(base: number, mult = 0, include: 'color' | 'all' = 'all'): GemSegment {
  return clearSeg('destroy', { kind: 'randomGems', count: scale(base, mult), include });
}
export function explodeRandomGems(base: number, mult = 0, include: 'color' | 'all' = 'all'): GemSegment {
  return clearSeg('explode', { kind: 'randomGems', count: scale(base, mult), include });
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
const DOT_IDS = new Set(['poison', 'burning']);

/**
 * 施加状态段。turns/magnitude 缺省用默认值；DoT（中毒/燃烧）默认带伤害量。
 */
export function inflict(
  statusId: string,
  target: TargetMode,
  opts: { turns?: number; magnitude?: number; n?: number } = {},
): StatusSegment {
  const turns = opts.turns ?? DEFAULT_STATUS_TURNS;
  const seg: StatusSegment = { kind: 'status', target, statusId, turns };
  const mag = opts.magnitude ?? (DOT_IDS.has(statusId) ? DEFAULT_DOT : undefined);
  if (mag !== undefined) seg.magnitude = mag;
  if (opts.n !== undefined) seg.n = opts.n;
  return seg;
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

/** 获得额外回合 */
export function extraTurn(): ExtraTurnSegment {
  return { kind: 'extraTurn' };
}
