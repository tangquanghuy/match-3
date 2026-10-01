/** Immortal identity is a data type, never a translated-name prefix. */
import type { TroopData } from './troops';

export const IMMORTAL_MAX_LEVEL = 30;
export const IMMORTAL_TEAM_LIMIT = 1;
export function isImmortal(troop: Pick<TroopData, 'troopTypes'> | null | undefined): boolean {
  return troop?.troopTypes.includes('Immortal') ?? false;
}

/** Additional trait-unlock currency; ordinary troops keep their existing stone recipe. */
export function immortalTraitBurningCost(troop: Pick<TroopData, 'troopTypes'>, slot: number): number {
  return isImmortal(troop) ? ([33, 66, 99][slot - 1] ?? 0) : 0;
}
