import type { Character } from '@engine/types';
import type { CombatantSnapshot } from '@session/contract';

/** Battle IDs survive transformation; the opening snapshot describes only the original form. */
export function currentFormSnapshot(
  char: Character,
  snapshot: CombatantSnapshot | undefined,
): CombatantSnapshot | undefined {
  if (!snapshot || snapshot.name !== char.name) return undefined;
  if (snapshot.skillId !== undefined && snapshot.skillId !== char.skillId) return undefined;
  return snapshot;
}
