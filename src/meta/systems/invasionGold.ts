/** Project PvP gold curve. Total victory gold includes the common battle bonus.
 * Battle-generated gold is paid separately; frenzy has no direct gold multiplier.
 */
import type { InvasionMirror } from './invasion';
import { PVP_LEVEL_BASES } from '../data/opponentTeams';
import { INVASION_DIFFICULTIES } from '../data/invasionDifficulty';

export const INVASION_GOLD = {
  minimum: 300, leagueBonus: 1200, levelBonus: 750, powerBonus: 750,
  minLevel: 8, maxLevel: 36, minPower: 100, maxPower: 750,
} as const;

const finite = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;
const progress = (value: number, min: number, max: number): number =>
  Math.min(1, Math.max(0, (value - min) / (max - min)));

/** Old saved NPCs have no league field. Their original level identifies the league,
 * without reading the attacker's current rank (which can change during settlement).
 */
export function invasionGoldFactors(mirror: InvasionMirror) {
  const level = mirror.defense.length
    ? mirror.defense.reduce((sum, d) => sum + Math.max(0, finite(d.level, 0)), 0) / mirror.defense.length
    : 0;
  const baseLevel = level - Math.max(0, INVASION_DIFFICULTIES.indexOf(mirror.difficulty)) * 2;
  const legacyLeague = PVP_LEVEL_BASES.reduce<number>((best, candidate, index) =>
    Math.abs(candidate - baseLevel) < Math.abs(PVP_LEVEL_BASES[best]! - baseLevel) ? index : best, 0);
  const league = Math.min(9, Math.max(0, Math.floor(finite(mirror.player?.league, finite(mirror.league, legacyLeague)))));
  return { league, level, power: Math.max(0, finite(mirror.statRating, finite(mirror.rating, 0))) };
}

export function invasionVictoryGold(mirror: InvasionMirror): number {
  const { league, level, power } = invasionGoldFactors(mirror);
  const c = INVASION_GOLD;
  return Math.round(c.minimum + c.leagueBonus * league / 9
    + c.levelBonus * progress(level, c.minLevel, c.maxLevel)
    + c.powerBonus * progress(power, c.minPower, c.maxPower));
}
