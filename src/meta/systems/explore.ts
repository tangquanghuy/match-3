/** Persistent 4 + 1 + 1 Explore runs. No daily resets, tickets or target troop selection. */
import { EXPLORE_MAX_TIER, EXPLORE_RUN_LENGTH, KINGDOM_ORDER } from '../data/kingdoms';
import { BANNERS } from '../data/banners';
import { EXPLORE_DROPS } from '../data/economy';
import { parseStoneKey, STONE_COLORS } from '../data/materials';
import type { SeededRNG } from '../../engine/rng';
import type { ExploreRun, KingdomState, MetaSave } from '../state/schema';
import type { EncounterSource } from './encounter';
import { fail, type MetaFailure } from '../types';

/** Highest full-run first clear in this kingdom; selected or unlocked tier is not progress. */
export function highestClearedExploreTier(entry?: Pick<KingdomState, 'clearedExploreTiers'>): number {
  return (entry?.clearedExploreTiers ?? []).reduce(
    (highest, tier) => Number.isInteger(tier) && tier >= 1 && tier <= EXPLORE_MAX_TIER ? Math.max(highest, tier) : highest,
    0,
  );
}

/** Official account-wide unlocking; preserve genuine legacy clears, never selected tier. */
export function maxExploreTier(save: Pick<MetaSave, 'kingdoms'>): number {
  let max = 2;
  for (const kingdom of KINGDOM_ORDER) {
    const entry = save.kingdoms[kingdom];
    if (!entry) continue;
    max = Math.max(max, entry.exploreUnlockedTier ?? 2);
    for (const tier of entry.clearedExploreTiers ?? []) max = Math.max(max, tier + 1);
  }
  return Math.min(EXPLORE_MAX_TIER, max);
}

export function exploreRunMatches(save: MetaSave, kingdom: string, source: EncounterSource): boolean {
  if (source.kind !== 'explore' || source.runId === undefined) return true; // in-flight legacy ticket
  const run = save.kingdoms[kingdom]?.exploreRun;
  return !!run && run.id === source.runId && run.tier === source.tier && run.stage === source.stage;
}

export function advanceExploreRun(save: MetaSave, kingdom: string, source: EncounterSource, victory: boolean): void {
  if (source.kind !== 'explore' || source.runId === undefined || !exploreRunMatches(save, kingdom, source)) return;
  const entry = save.kingdoms[kingdom]!;
  const run = entry.exploreRun!;
  if (!victory) {
    // Defeat retries the current encounter, including mini-boss and final boss.
    return;
  }
  if (run.stage === 4) entry.exploreUnlockedTier = Math.max(entry.exploreUnlockedTier ?? 2, Math.min(EXPLORE_MAX_TIER, run.tier + 1));
  if (run.stage === EXPLORE_RUN_LENGTH - 1) entry.exploreRun = null;
  else run.stage += 1;
}

export function abandonExploreRun(save: MetaSave, kingdom: string): { ok: true } | MetaFailure {
  if (!KINGDOM_ORDER.includes(kingdom) || !save.kingdoms[kingdom]) return fail('INVALID', '王国不存在');
  const pending = save.pendingBattle;
  if (pending?.mode === 'encounter' && pending.plan.kingdom === kingdom && pending.plan.source.kind === 'explore') save.pendingBattle = null;
  save.kingdoms[kingdom]!.exploreRun = null;
  return { ok: true };
}

/** Stable encounter on reconnect/retry; only winning advances this seed. */
export function exploreBattleSeed(run: ExploreRun): number {
  return (run.seed + Math.imul(run.stage, 0x9e3779b9)) >>> 0;
}

/** Positive banner colours, in the same order as stone recipes. */
export function kingdomBoostedStoneColors(kingdom: string): string[] {
  const boosts = BANNERS[kingdom]?.boosts ?? {};
  return STONE_COLORS.filter(c => (boosts[c.base] ?? 0) > 0).map(c => c.key);
}

/** Kingdom's fixed Arcane reward for the final exploration boss. */
export function kingdomArcaneKey(kingdom: string): string {
  const colors = kingdomBoostedStoneColors(kingdom);
  const first = colors[0] ?? 'blue';
  return `arcane:${first}:${colors[1] ?? first}`;
}

/** Prefer banner colours while preserving a route to every other eligible stone. */
export function pickExploreStoneKey(kingdom: string, candidates: readonly string[], rng: SeededRNG): string | null {
  if (!candidates.length) return null;
  const boosted = new Set(kingdomBoostedStoneColors(kingdom));
  const preferred = candidates.filter(key => parseStoneKey(key)?.colorKey?.split(':').some(color => boosted.has(color)));
  const others = candidates.filter(key => !preferred.includes(key));
  const pool = preferred.length && others.length
    ? rng.next() < EXPLORE_DROPS.bannerColorShare ? preferred : others
    : candidates;
  return pool[rng.nextInt(pool.length)]!;
}

/** Kingdoms whose banner gives this stone a colour affinity. */
export function kingdomsForExploreStone(key: string): string[] {
  const stone = parseStoneKey(key);
  if (!stone || stone.tier === 'celestial') return [];
  return KINGDOM_ORDER.filter(kingdom => {
    const boosted = kingdomBoostedStoneColors(kingdom);
    return stone.colorKey!.split(':').some(color => boosted.includes(color));
  });
}
