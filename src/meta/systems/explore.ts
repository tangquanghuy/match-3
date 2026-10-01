/** Persistent 4 + 1 + 1 Explore runs. No daily resets, tickets or target troop selection. */
import { EXPLORE_MAX_TIER, EXPLORE_RUN_LENGTH, KINGDOM_ORDER } from '../data/kingdoms';
import { BANNERS } from '../data/banners';
import { STONE_COLORS } from '../data/materials';
import type { ExploreRun, MetaSave } from '../state/schema';
import type { EncounterSource } from './encounter';
import { fail, type MetaFailure } from '../types';

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
    // Regular encounters retry the same team. Boss defeat ends the run.
    if (run.stage >= 4) entry.exploreRun = null;
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

/** Kingdom's positive banner colours, ordered like imported Arcane recipes. */
export function kingdomArcaneKey(kingdom: string): string {
  const boosts = BANNERS[kingdom]?.boosts ?? {};
  const colors = STONE_COLORS.filter(c => (boosts[c.base] ?? 0) > 0).map(c => c.key);
  const first = colors[0] ?? 'blue';
  return `arcane:${first}:${colors[1] ?? first}`;
}
