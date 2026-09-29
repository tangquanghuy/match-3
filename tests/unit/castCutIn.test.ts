/**
 * 我方施法立绘切入（lane A）：时间线预留只给我方施法者、注销只清自己、几何比例。
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  CAST_CUTIN_TIMING,
  castCutInGeometry,
  castCutInReserveSeconds,
  registerCastCutInSide,
} from '../../src/render/CastCutIn';

describe('castCutInReserveSeconds', () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => { cleanup?.(); cleanup = null; });

  it('未注册阵营判定时不占时间线（单测里的 EventStreamPlayer 行为不变）', () => {
    expect(castCutInReserveSeconds(1)).toBe(0);
  });

  it('我方预留切入入场+停留；敌方预留较短的施法预告', () => {
    cleanup = registerCastCutInSide((id) => id < 4);
    expect(castCutInReserveSeconds(0)).toBeCloseTo(CAST_CUTIN_TIMING.reserveMs / 1000);
    expect(castCutInReserveSeconds(5)).toBeCloseTo(CAST_CUTIN_TIMING.enemyReserveMs / 1000);
    expect(CAST_CUTIN_TIMING.enemyReserveMs).toBeLessThan(CAST_CUTIN_TIMING.reserveMs);
    expect(CAST_CUTIN_TIMING.enemyReserveMs).toBeGreaterThanOrEqual(300);
  });

  it('预留时长 ≈650–700ms，退场与随后的技能演出重叠', () => {
    const { enterMs, holdMs, exitMs, reserveMs } = CAST_CUTIN_TIMING;
    expect(reserveMs).toBeGreaterThanOrEqual(650);
    expect(reserveMs).toBeLessThanOrEqual(700);
    expect(enterMs + holdMs).toBeLessThanOrEqual(reserveMs);
    expect(enterMs + holdMs + exitMs).toBeGreaterThan(reserveMs);
  });

  it('旧实例注销不会清掉新实例注册的判定（meta 外壳按场新建/销毁 App）', () => {
    const disposeOld = registerCastCutInSide(() => false);
    cleanup = registerCastCutInSide(() => true);
    disposeOld();
    expect(castCutInReserveSeconds(9)).toBeGreaterThan(0);
  });
});

describe('castCutInGeometry', () => {
  const inside = (board: { left: number; top: number; size: number }) => {
    const g = castCutInGeometry(board);
    // 立绘与名牌都落在棋盘范围内，不压两侧卡列
    expect(g.artLeft).toBeGreaterThanOrEqual(board.left);
    expect(g.artLeft + g.artW).toBeLessThan(board.left + board.size);
    expect(g.artTop).toBeGreaterThanOrEqual(board.top - board.size * 0.02);
    expect(g.plateLeft + g.plateMaxW).toBeLessThanOrEqual(board.left + board.size);
    // 立绘底边落在横带底边，上半身探出横带
    expect(g.artTop + g.artH).toBe(g.bandTop + g.bandH);
    expect(g.artTop).toBeLessThan(g.bandTop);
    expect(g.artW / g.artH).toBeCloseTo(2 / 3, 2);
    return g;
  };

  it('1440×900 棋盘（768 见方）：立绘在棋盘内居左、名牌在其右侧', () => {
    const g = inside({ left: 212, top: 48, size: 768 });
    expect(g.plateLeft).toBeGreaterThan(g.artLeft + g.artW * 0.8);
  });

  it('740×400 小棋盘：字号有下限', () => {
    const g = inside({ left: 112, top: 48, size: 344 });
    expect(g.casterFont).toBeGreaterThanOrEqual(11);
    expect(g.skillFont).toBeGreaterThanOrEqual(16);
  });
});
