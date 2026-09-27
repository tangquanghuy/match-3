/** Resolve the mana color used by the most currently present troops on a side.
 * Player battle tests: https://community.gemsofwar.com/t/69325/12
 * Ties are drawn through the battle RNG; no cast-history or mana-cost weighting.
 * Whether defeated/removed troops still count is not specified by the source.
 */
import { ALL_BASE_COLORS, type BaseColor, type PlayerSide } from '../../types';
import type { GameState } from '../../GameState';
import type { SeededRNG } from '../../rng';
import type { EffectContext } from './context';

export function mostUsedManaColor(state: GameState, side: PlayerSide, rng: SeededRNG): BaseColor | null {
  const tally = new Map<BaseColor, number>();
  for (const troop of state.teams[side].characters) {
    if (troop.defeated) continue;
    for (const color of new Set(troop.colors)) tally.set(color, (tally.get(color) ?? 0) + 1);
  }
  const max = Math.max(0, ...tally.values());
  if (!max) return null;
  const tied = ALL_BASE_COLORS.filter(color => tally.get(color) === max);
  return tied[rng.nextInt(tied.length)];
}

/** Both gem effects and secondary board counts use the same cast-time tie draw. */
export function mostUsedManaColorForCast(ctx: EffectContext, side: PlayerSide): BaseColor | null {
  const cache = ctx.castTracking?.mostUsedManaColors;
  if (cache && Object.prototype.hasOwnProperty.call(cache, side)) return cache[side] ?? null;
  const color = mostUsedManaColor(ctx.state, side, ctx.rng);
  if (ctx.castTracking) (ctx.castTracking.mostUsedManaColors ??= {})[side] = color;
  return color;
}
