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

  it('只为我方施法者预留入场+停留，敌方为 0', () => {
    cleanup = registerCastCutInSide((id) => id < 4);
    expect(castCutInReserveSeconds(0)).toBeCloseTo(CAST_CUTIN_TIMING.reserveMs / 1000);
    expect(castCutInReserveSeconds(5)).toBe(0);
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
  it('高约 62% 舞台、2:3；小舞台字号有下限', () => {
    const g = castCutInGeometry(1214, 820);
    expect(g.artH / 820).toBeGreaterThanOrEqual(0.6);
    expect(g.artH / 820).toBeLessThanOrEqual(0.65);
    expect(g.artW / g.artH).toBeCloseTo(2 / 3, 2);
    const small = castCutInGeometry(550, 396);
    expect(small.casterFont).toBeGreaterThanOrEqual(11);
    expect(small.skillFont).toBeGreaterThanOrEqual(15);
    expect(small.plateLeft).toBeLessThan(small.artW);
  });
});
