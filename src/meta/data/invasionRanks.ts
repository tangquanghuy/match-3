/** Project VP progression, NOT an official GoW league threshold table.
 * Official source distinctions and economy budget: docs/GOW-INVASION-RANKS.md.
 * Stable reward IDs are scoped to invasion.weekStart; each week has a fresh claim ledger.
 */
import { INVASION_LEAGUES } from './economy';
const THRESHOLDS = [0,50,100,200,300,450,600,800,1000,1250,1500,1750,2000,2300,2600,2900,3200,3500,3800,4100,4400,4700,5100,5500,5900,6300,6700,7100,7500,8000];
const GEMS = [100,150,200,250,350,450,500,600,650,750];
export const INVASION_RANKS = THRESHOLDS.map((vp, index) => ({
  id: `rank-${index}`, index, league: Math.floor(index / 3),
  division: ['I', 'II', 'III'][index % 3]!,
  name: `${INVASION_LEAGUES[Math.floor(index / 3)]} ${['I', 'II', 'III'][index % 3]}`,
  vp, gems: GEMS[Math.floor(index / 3)]!,
  icon: `/static/invasion-ranks/rank-${index}.webp`,
}));
export function invasionRankAt(vp: number) {
  return INVASION_RANKS.reduce((current, rank) => vp >= rank.vp ? rank : current, INVASION_RANKS[0]!);
}
export const INVASION_RANK_GEMS_TOTAL = INVASION_RANKS.reduce((sum, rank) => sum + rank.gems, 0);

/** Weekly pace: 800 easy / 400 normal / 267 hard victories to 8000 VP. */
export const INVASION_VP_BY_DIFFICULTY = { easy: 10, normal: 20, hard: 30 } as const;
