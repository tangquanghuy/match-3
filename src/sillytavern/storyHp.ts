/**
 * Story entry HP: the tavern's current/max ratio applied to the match-3 maximum. A living
 * character never rounds down to zero, because match-3 maxima are small (a Lv.20 unit has
 * about 23 HP). Party preparation and story write-back validation must use the same rule.
 */
export function storyInitialHp(battleMaxHp: number, current: number, max: number): number {
  const scaled = Math.round(battleMaxHp * current / max);
  return current > 0 ? Math.max(1, scaled) : scaled;
}
