import type { FrenzyMultiplier } from './invasionFrenzy';
/** Internal difficulty policies. These are not player-facing deck names or official matchmaking. */
import { PVP_LEVEL_BASES, buildAdaptiveDefense, type AdaptiveDefensePolicy } from './opponentTeams';
import { COMMUNITY_DEFENSES } from './communityDefenses';
import { enemyTraitCount } from './enemyDifficulty';
import { BANNERS } from './banners';
import { getTroopById } from '../../data/troops';
import { fnv1a32 } from './hash';

export const INVASION_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type InvasionDifficulty = typeof INVASION_DIFFICULTIES[number];

// Common -> Mythic; unavailable rarity buckets are removed before rolling.
export const INVASION_DRAFT_POLICIES: Record<InvasionDifficulty, AdaptiveDefensePolicy> = {
  easy: { rarityWeights: [40, 30, 18, 8, 3, 1], sampleSize: 8, jitter: 14, exploration: .35, requireManaSupport: false },
  normal: { rarityWeights: [10, 20, 28, 24, 14, 4], sampleSize: 20, jitter: 8, exploration: .2, requireManaSupport: true },
  hard: { rarityWeights: [3, 6, 13, 26, 32, 20], sampleSize: 40, jitter: 4, exploration: .1, requireManaSupport: true },
};
export function invasionPoolLeague(league: number, difficulty: InvasionDifficulty): number {
  return Math.min(9, Math.max(0, Math.floor(league) - (difficulty === 'easy' ? 2 : 0)));
}
export function invasionDefenseLevel(league: number, difficulty: InvasionDifficulty): number {
  return PVP_LEVEL_BASES[Math.min(9, Math.max(0, Math.floor(league)))]! + INVASION_DIFFICULTIES.indexOf(difficulty) * 2;
}
function draftBanner(troops: readonly number[], seed: number): string {
  const score = (boosts: (typeof BANNERS)[string]['boosts']) => troops.reduce((sum, id) =>
    sum + getTroopById(id)!.manaColors.reduce((n, c) => n + (boosts[c] ?? 0), 0), 0);
  const choices = Object.entries(BANNERS).filter(([, banner]) => banner.official)
    .sort(([a, x], [b, y]) => score(y.boosts) - score(x.boosts) || a.localeCompare(b));
  const best = score(choices[0]![1].boosts);
  const tied = choices.filter(([, b]) => score(b.boosts) === best);
  return tied[(seed >>> 0) % tied.length]![0];
}
export function buildTieredDefense(seed: number, league: number, difficulty: InvasionDifficulty, ordinal: number) {
  const level = invasionDefenseLevel(league, difficulty);
  // Nine hard NPCs per bracket: seven random rosters, two complete reference teams.
  // The ordinal quota keeps references a minority in every week, not just on average.
  if (difficulty === 'hard' && ordinal % 4 === 3) {
    const pool = COMMUNITY_DEFENSES.filter(t => league >= t.minLeague && league <= t.maxLeague
      && level >= t.minLevel && enemyTraitCount(level) >= t.requiredTraits);
    const template = pool[((seed >>> 0) + Math.floor(ordinal / 4)) % pool.length];
    if (template) return { ...template, level, provenance: `GoW Team Share · Teams 第 ${template.sourceRow} 行 · 原四槽 / 旗帜适配` };
  }
  const draftSeed = fnv1a32(`invasion-draft:${seed}:${league}:${difficulty}:${ordinal}`);
  const template = buildAdaptiveDefense(draftSeed, invasionPoolLeague(league, difficulty), level, INVASION_DRAFT_POLICIES[difficulty]);
  return { ...template, level, sourceRow: null,
    bannerKingdom: difficulty === 'hard' ? draftBanner(template.troops, draftSeed) : null,
    provenance: '本地稀有度加权随机编队' };
}

/** Stronger random drafts, not a small fixed list of named teams. Keep the same level/trait gates. */
export function buildFrenzyDefense(seed: number, league: number, difficulty: InvasionDifficulty, multiplier: FrenzyMultiplier) {
  const level = invasionDefenseLevel(league, difficulty);
  const basePolicy = INVASION_DRAFT_POLICIES[difficulty === 'easy' ? 'normal' : 'hard'];
  const policy: AdaptiveDefensePolicy = {
    ...basePolicy,
    rarityWeights: multiplier === 2 && difficulty !== 'easy' ? [1, 3, 8, 23, 37, 28] : basePolicy.rarityWeights,
    sampleSize: multiplier === 2 ? 80 : 60,
    jitter: multiplier === 2 ? 1 : 2,
    exploration: multiplier === 2 ? .02 : .04,
    requireManaSupport: true,
  };
  const draftSeed = fnv1a32(`frenzy-draft:${seed}:${league}:${difficulty}:${multiplier}`);
  const template = buildAdaptiveDefense(draftSeed, Math.min(9, invasionPoolLeague(league, difficulty) + (multiplier === 2 ? 2 : 1)), level, policy);
  return { ...template, level, sourceRow: null, bannerKingdom: draftBanner(template.troops, draftSeed), provenance: '血怒稀有度加权随机编队' };
}
