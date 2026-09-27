/** Project encounter tuning, separate from weekly leaderboard identity and ordinary VP. */
import { SeededRNG } from '../../engine/rng';
import { fnv1a32 } from './hash';

export type FrenzyMultiplier = 1.5 | 2;
export const INVASION_FRENZY = {
  batchChance: .25, // 75% of refreshes have no frenzy; at most one of the three cards.
  doubleChance: .25, // Of frenzy encounters, one quarter are the stronger x2 variant.
  stats: { 1.5: 1.25, 2: 1.5 },
} as const;

/** Stable until manual refresh, week change or league change; no wall-clock rerolls. */
export function rollInvasionFrenzy(weekStart: number, league: number, refresh: number): { slot: number; multiplier: FrenzyMultiplier } | null {
  const rng = new SeededRNG(fnv1a32(`invasion-frenzy:${weekStart}:${league}:${refresh}`));
  if (rng.next() >= INVASION_FRENZY.batchChance) return null;
  const slot = rng.nextInt(3);
  return { slot, multiplier: rng.next() < INVASION_FRENZY.doubleChance ? 2 : 1.5 };
}
