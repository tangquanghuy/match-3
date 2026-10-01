import { BATTLE_MAP_LIMIT, clampBattleMaps } from '../../engine/battleMaps';
import { SeededRNG } from '../../engine/rng';
import type { BattleResult } from '../../session/contract';
import type { MaterialDelta } from '../data/materials';
import { fnv1a32 } from '../data/hash';

export const BATTLE_MAP_DROP_CHANCE = 0.01;
type MapResult = Pick<BattleResult, 'requestId' | 'winner' | 'endReason' | 'economy'>;

/** Independent, replay-stable roll. Uses the checked battle ticket ID, not client seed/digest. */
export function battleMapDrop(result: Pick<MapResult, 'requestId' | 'winner' | 'endReason'>): number {
  if (result.winner !== 'player' || result.endReason === 'surrender') return 0;
  return new SeededRNG(fnv1a32(`battle-map:${result.requestId}`)).nextInt(10_000)
    < BATTLE_MAP_DROP_CHANCE * 10_000 ? 1 : 0;
}

/** One budget for every source: skills, then encounter bonuses, then the victory roll.
 * Bonus materials other than maps are preserved; callers pay/display the returned amounts.
 * Battle ticket consumption remains the settlement gateway's responsibility. */
export function resolveBattleMaps(result: MapResult, materials: readonly MaterialDelta[] = []) {
  let remaining = result.endReason === 'surrender' ? 0 : BATTLE_MAP_LIMIT;
  const take = (value: unknown): number => {
    const amount = Math.min(remaining, clampBattleMaps(value));
    remaining -= amount;
    return amount;
  };
  const collected = take(result.economy?.maps);
  const bonuses = materials.map(material => {
    const capped = { ...material };
    if (capped.treasureMaps !== undefined) {
      const amount = take(capped.treasureMaps);
      if (amount) capped.treasureMaps = amount;
      else delete capped.treasureMaps;
    }
    return capped;
  });
  const drop = take(battleMapDrop(result));
  const total = collected + bonuses.reduce((sum, material) => sum + (material.treasureMaps ?? 0), 0) + drop;
  return { collected, bonuses, drop, total };
}
