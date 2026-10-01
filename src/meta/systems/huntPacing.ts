import { SeededRNG } from '../../engine/rng';
import type { HuntSoftCap } from '../state/schema';

/** One inclusive interval, NOT independently rolled red-chest/vault thresholds. */
export const HUNT_SOFT_CAP = Object.freeze({ min: 3, max: 9, maxPressure: 5, rampEveryMoves: 3 });

export function huntRewardProgress(cells: readonly number[]): number {
  return cells.reduce((sum, tier) => sum + (tier === 7 ? 3 : tier === 6 ? 1 : 0), 0);
}

/** A separate deterministic stream leaves the unbiased opening/refill sequence intact. */
export function createHuntSoftCap(seed: number, cells: readonly number[] = []): HuntSoftCap {
  const rng = new SeededRNG((seed ^ 0x48554e54) >>> 0);
  return {
    target: HUNT_SOFT_CAP.min + rng.nextInt(HUNT_SOFT_CAP.max - HUNT_SOFT_CAP.min + 1),
    peak: huntRewardProgress(cells),
    activeMoves: 0,
  };
}

export function hydrateHuntSoftCap(raw: unknown, seed: number, cells: readonly number[]): HuntSoftCap {
  const fallback = createHuntSoftCap(seed, cells);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const record = raw as Record<string, unknown>;
  const integer = (v: unknown, min: number, max: number, otherwise: number): number =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : otherwise;
  const target = integer(record.target, HUNT_SOFT_CAP.min, HUNT_SOFT_CAP.max, fallback.target);
  const peak = Math.max(fallback.peak, integer(record.peak, 0, 64 * 3, fallback.peak));
  return { target, peak, activeMoves: peak >= target ? integer(record.activeMoves, 0, Number.MAX_SAFE_INTEGER, 0) : 0 };
}

/** Only record the board value, never red merges + vault merges (which double counts upgrades). */
export function observeHuntProgress(cap: HuntSoftCap, cells: readonly number[]): void {
  cap.peak = Math.max(cap.peak, huntRewardProgress(cells));
}

/** Leave room to assemble chests before gradually cooling a long run, even if its random reward threshold is not reached.
 * Neither clock time nor accumulated turns is consumed; four/five matches keep their rewards. */
export const HUNT_LONG_RUN = Object.freeze({ startMoves: 150, rampEveryMoves: 30 });

export function huntComboBias(cap: HuntSoftCap, moves = 0): number {
  const rewardPressure = cap.peak < cap.target ? 0
    : 1 + Math.floor(cap.activeMoves / HUNT_SOFT_CAP.rampEveryMoves) + Math.floor((cap.peak - cap.target) / 2);
  const lengthPressure = moves < HUNT_LONG_RUN.startMoves ? 0
    : 1 + Math.floor((moves - HUNT_LONG_RUN.startMoves) / HUNT_LONG_RUN.rampEveryMoves);
  const pressure = Math.min(HUNT_SOFT_CAP.maxPressure, Math.max(rewardPressure, lengthPressure));
  return pressure === 0 ? 0 : -pressure;
}
