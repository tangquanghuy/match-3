/** NPC-only tuning; not a claim about GoW's unpublished enemy stat formula.
 * Player troop caps, hero growth and arena normalization are separate.
 * See docs/GOW-NUMERIC-AUDIT.md for sources and tuning anchors.
 */
import { STAT_LIMITS } from '../../session/validateRequest';
import type { TroopData } from '../../data/troops';
import { troopStatsAtLevel, type LeveledStats } from '../../data/leveling';

export const MAX_ENEMY_LEVEL = 1000;
export function enemyLevel(level: number): number {
  return Number.isFinite(level) ? Math.min(MAX_ENEMY_LEVEL, Math.max(1, Math.floor(level))) : 1;
}

/** Conservative early encounters; progressive NPC training, not a player unlock gate. */
export function enemyTraitCount(level: number): number {
  const lv = enemyLevel(level);
  return lv < 10 ? 0 : lv < 15 ? 1 : lv < 20 ? 2 : 3;
}

/** Lv.20 = x1; Lv.100 = x5; Lv.500 = x25. Zero stats stay zero. */
export function enemyStatsAtLevel(troop: TroopData, level: number): LeveledStats {
  const lv = enemyLevel(level);
  const stats = troopStatsAtLevel(troop, Math.min(20, lv));
  if (lv <= 20) return stats;
  const multiplier = lv / 20;
  return {
    health: Math.min(STAT_LIMITS.hp.max, Math.max(1, Math.round(stats.health * multiplier))),
    armor: Math.min(STAT_LIMITS.armor.max, Math.round(stats.armor * multiplier)),
    attack: Math.min(STAT_LIMITS.attack.max, Math.round(stats.attack * multiplier)),
    magic: Math.min(STAT_LIMITS.magic.max, Math.round(stats.magic * multiplier)),
  };
}

/** Optional encounter stat boost; zero stats remain zero, contract limits still apply. */
export function enemyEncounterStats(troop: TroopData, level: number, multiplier = 1): LeveledStats {
  const base = enemyStatsAtLevel(troop, level);
  const scale = Number.isFinite(multiplier) ? Math.min(3, Math.max(1, multiplier)) : 1;
  return {
    health: Math.min(STAT_LIMITS.hp.max, Math.ceil(base.health * scale)),
    armor: Math.min(STAT_LIMITS.armor.max, Math.ceil(base.armor * scale)),
    attack: Math.min(STAT_LIMITS.attack.max, Math.ceil(base.attack * scale)),
    magic: Math.min(STAT_LIMITS.magic.max, Math.ceil(base.magic * scale)),
  };
}
