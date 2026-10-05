import { getTroopById, TROOPS, type TroopData } from '../data/troops';
import type { CombatantSnapshot } from '../session/contract';

/** A display name is not an identity: the hero can be named after any troop. */
export function battleTroopOf(name: string, snapshot?: CombatantSnapshot): TroopData | undefined {
  // A transformed character retains its battle ID, but can take another form.
  // The original snapshot identifies only the form still bearing its name.
  if (snapshot?.name === name && /-hero$/.test(snapshot.externalId)) return undefined;
  if (snapshot?.name === name && snapshot.templateId !== undefined) {
    const id = Number(snapshot.templateId);
    return Number.isInteger(id) ? getTroopById(id) : undefined;
  }
  return TROOPS.find(t => t.name === name);
}
