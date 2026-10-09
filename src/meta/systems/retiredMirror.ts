import type { CombatantSnapshot } from '../../session/contract';
import type { MetaSave } from '../state/schema';
import { getTroopById } from '../../data/troops';
import { troopToSnapshot } from './battleBridge';
import { teamPower } from './combatPower';
import { kingdomBonusOf } from './kingdomOps';
import { teamHash } from './invasionMirrors';

export interface StoredRetirementMirror {
  team: CombatantSnapshot[];
  defense: { troopId: number; level: number; tier: 'elite' | 'minion'; traitCount: number }[];
  heroLevel: number;
  bannerKingdom: string | null;
  teamHash: string;
}

/** Build an immutable replacement snapshot; the owner's collection is never granted 7440. */
export function replaceRetiredMirror(original: MetaSave, source: StoredRetirementMirror): {
  snapshot: StoredRetirementMirror; power: number;
} {
  if (!Array.isArray(source.team) || !Array.isArray(source.defense)) throw new Error('Invalid mirror snapshot');
  const replacement = getTroopById(7440);
  if (!replacement) throw new Error('Missing replacement troop');
  const snapshot = structuredClone(source);
  const counts = new Map<number, number>();
  const bonus = kingdomBonusOf(original);
  for (let i = 0; i < source.team.length; i++) {
    const old = source.team[i]!;
    const id = Number(old.templateId);
    if (id !== 7446 && id !== 7622) continue;
    const previous = getTroopById(id);
    const relevant = source.defense.filter(unit => unit.troopId === id);
    const occurrence = counts.get(id) ?? 0;
    counts.set(id, occurrence + 1);
    const defense = relevant[occurrence];
    if (!previous || !defense || !old.externalId.endsWith(String(id)))
      throw new Error(`Incomplete mirror replacement inputs for ${id}`);
    const saved = (original.collectionTruth ?? original.collection)[String(id)];
    // Keep the historical mirror's recorded level/trait count, not the owner's
    // current progression, which could have changed after recording the mirror.
    const record = { copies: 0, ascension: saved?.ascension ?? 0, level: defense.level,
      traits: [defense.traitCount > 0, defense.traitCount > 1, defense.traitCount > 2] as [boolean, boolean, boolean], locked: false };
    const baseline = troopToSnapshot(previous, record, old.externalId, bonus);
    const next = troopToSnapshot(replacement, record, old.externalId.slice(0, -String(id).length) + '7440', bonus);
    for (const stat of ['hp', 'attack', 'armor', 'magic'] as const)
      next.stats[stat] = Math.max(0, next.stats[stat] + old.stats[stat] - baseline.stats[stat]);
    snapshot.team[i] = next;
  }
  if (counts.size === 0 || [...counts].some(([id, count]) => source.defense.filter(unit => unit.troopId === id).length !== count) ||
      source.defense.some(unit => (unit.troopId === 7446 || unit.troopId === 7622) && !counts.has(unit.troopId)))
    throw new Error('Mirror roster mismatch');
  snapshot.defense = source.defense.map(unit => unit.troopId === 7446 || unit.troopId === 7622
    ? { ...unit, troopId: 7440 } : unit);
  snapshot.teamHash = teamHash(snapshot.team);
  return { snapshot, power: teamPower(snapshot.team) };
}
