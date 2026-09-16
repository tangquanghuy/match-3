import type { CellPos } from '@engine/types';

/**
 * 全盘重排演出计划（UX 审查 P0 · 重排卡死修复）。
 *
 * 旧行为的缺陷：聚拢用「脱离时间线的 gsap 补间」（0.3s 墙钟）做位移，而「瞬移到新位」
 * 是时间线回调（+0.32s）。0.32−0.3=20ms 边距不足一帧（16.7ms），同一帧内时间线回调先
 * 写入终点、未结束的聚拢补间随后 onUpdate 又把 x/y 写回聚集点——宝石永久悬停棋盘中央
 * （SP5/B14 截图实证，逻辑棋盘已结算、表现不可玩）。
 *
 * 修复模式与本仓库 clearEventBatches.ts 同款：把演出计划抽成纯逻辑模块——
 *   - buildReshufflePlan：段开始时快照全部活精灵，算出每颗的起点/聚集点/终点/散开延迟；
 *   - gatherPointAt / scatterPoseAt：聚拢位移与散开缩放的纯插值（确定性，不用 Math.random）；
 *   - EventStreamPlayer 把插值全部挂在主时间线上（proxy tween 驱动），并以
 *     「终态强制归位」回调兜底——无论 skip/快进/中断，宝石必然精确落在逻辑位。
 *
 * 纯逻辑：无 pixi/gsap/DOM 依赖，可被单元测试锁死不变量。
 */

/** 时间线各段时长（秒）。窗口总和 ≈0.9s，符合审查期望「聚集→短停→散开≤1s」 */
export const RESHUFFLE_TIMING = {
  /** 聚拢（位移+缩放+旋转同窗） */
  gather: 0.3,
  /** 单颗散开时长 */
  scatter: 0.45,
  /** 散开错峰步长与槽位数（(i % 12) × 0.012，末颗延迟 0.132s） */
  scatterStaggerStep: 0.012,
  scatterStaggerSlots: 12,
  /** 聚拢后的缩放 */
  gatherScale: 0.45,
  /** 聚集点随机散布幅度（像素，按 gemId 确定性派生） */
  gatherJitterPx: 30,
  /** 聚拢旋转幅度（弧度） */
  gatherRotMax: 0.6,
} as const;

/** 散开总窗口：错峰延迟的最大值 + 单颗时长——窗口必须覆盖每一颗，否则尾颗被截断（悬挂） */
export const RESHUFFLE_SCATTER_WINDOW =
  (RESHUFFLE_TIMING.scatterStaggerSlots - 1) * RESHUFFLE_TIMING.scatterStaggerStep +
  RESHUFFLE_TIMING.scatter;

/** 单颗宝石的重排演出计划 */
export interface ReshufflePlanItem {
  gemId: number;
  /** 段开始时的实际位置（像素） */
  startX: number;
  startY: number;
  /** 聚集点（像素） */
  gatherX: number;
  gatherY: number;
  /** 逻辑终点（像素）：变动宝石 = 新格中心；未变动宝石 = 原位 */
  finalX: number;
  finalY: number;
  /** 聚拢旋转目标（弧度，确定性派生） */
  rotTarget: number;
  /** 散开错峰延迟（秒） */
  scatterDelay: number;
}

export interface ReshufflePlanInput {
  /** 引擎 reshuffle 事件的 moves（from 仅用于诊断，位移终点以 to 为准） */
  moves: { gemId: number; from: CellPos; to: CellPos }[];
  /** 段开始时的全部活精灵快照（变动与未变动的都要有，漏掉的会滞留原地） */
  sprites: { gemId: number; x: number; y: number }[];
  /** 格中心像素换算（BoardView.cellCenter） */
  centerOf: (pos: CellPos) => { x: number; y: number };
  /** 棋盘边长（像素），聚拢目标 = 棋盘中心 */
  gridPixels: number;
}

/** [-1,1) 的确定性伪随机（按 gemId+盐派生；取代旧实现里的 Math.random，保证可测） */
function jitter(gemId: number, salt: number): number {
  const h = Math.sin(gemId * 127.1 + salt * 311.7) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}

/**
 * 构建重排演出计划。不变量（测试锁死）：
 *   1. 覆盖快照里的每一颗精灵——变动的终点 = 新格中心，未变动的终点 = 原位；
 *   2. 计划确定性（同输入同计划）；
 *   3. 散开窗口覆盖所有错峰延迟（RESHUFFLE_SCATTER_WINDOW ≥ maxDelay + scatter）。
 */
export function buildReshufflePlan(input: ReshufflePlanInput): ReshufflePlanItem[] {
  const finalById = new Map<number, { x: number; y: number }>();
  for (const mv of input.moves) {
    finalById.set(mv.gemId, input.centerOf(mv.to));
  }

  const cx = input.gridPixels / 2;
  const cy = input.gridPixels / 2;

  return input.sprites.map((sp, i) => {
    const fin = finalById.get(sp.gemId) ?? { x: sp.x, y: sp.y };
    return {
      gemId: sp.gemId,
      startX: sp.x,
      startY: sp.y,
      gatherX: cx + (sp.x - cx) * 0.25 + jitter(sp.gemId, 1) * RESHUFFLE_TIMING.gatherJitterPx,
      gatherY: cy + (sp.y - cy) * 0.25 + jitter(sp.gemId, 2) * RESHUFFLE_TIMING.gatherJitterPx,
      finalX: fin.x,
      finalY: fin.y,
      rotTarget: jitter(sp.gemId, 3) * RESHUFFLE_TIMING.gatherRotMax,
      scatterDelay: (i % RESHUFFLE_TIMING.scatterStaggerSlots) * RESHUFFLE_TIMING.scatterStaggerStep,
    };
  });
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 端点精确的插值：t=0 → a、t=1 → b 逐字节返回（不做浮点运算），
 * 聚拢终点/散开终态因此可与逻辑位精确对齐（回归测试锁死）。
 * 注意：back.out 缓动中段会过冲（t>1），此处仅短路恰好的端点，不夹取。
 */
function lerpExact(a: number, b: number, t: number): number {
  if (t === 0) return a;
  if (t === 1) return b;
  return a + (b - a) * t;
}

/** gsap 'power2.in' 的纯实现：聚拢位移/缩放的缓动（端点精确 0/1） */
function power2In(t: number): number {
  return t * t;
}

/** gsap 'back.out(2)' 的纯实现：散开缩放的过冲弹性（端点精确 0/1，中段可 >1） */
function backOut2(t: number): number {
  const c1 = 2;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/**
 * 聚拢阶段位移插值。p ∈ [0,1] 为时间线代理的原始进度（ease 由时间线 tween 承担）。
 * p=1 精确等于聚集点——瞬移回调必然从这个位置接手，不再有补间竞态。
 */
export function gatherPointAt(item: ReshufflePlanItem, p: number): { x: number; y: number } {
  const e = power2In(clamp01(p));
  return { x: lerpExact(item.startX, item.gatherX, e), y: lerpExact(item.startY, item.gatherY, e) };
}

/** 聚拢阶段缩放插值（1 → gatherScale，与位移同窗；全 gem 统一曲线故不按颗差异化） */
export function gatherScaleAt(p: number): number {
  return lerpExact(1, RESHUFFLE_TIMING.gatherScale, power2In(clamp01(p)));
}

/** 聚拢阶段旋转插值（0 → rotTarget） */
export function gatherRotationAt(item: ReshufflePlanItem, p: number): number {
  return item.rotTarget * power2In(clamp01(p));
}

/**
 * 散开阶段姿态插值。tSec 为散开窗口内的秒数；每颗在自己的延迟窗内走完 back.out(2)。
 * 窗口末端（tSec ≥ scatterDelay + scatter）精确回到 scale=1、rotation=0——终态归位。
 */
export function scatterPoseAt(
  item: ReshufflePlanItem,
  tSec: number,
): { scale: number; rotation: number } {
  const local = clamp01((tSec - item.scatterDelay) / RESHUFFLE_TIMING.scatter);
  const e = backOut2(local);
  const rotation = lerpExact(item.rotTarget, 0, e);
  return {
    scale: lerpExact(RESHUFFLE_TIMING.gatherScale, 1, e),
    rotation: rotation === 0 ? 0 : rotation, // 归一 -0
  };
}
