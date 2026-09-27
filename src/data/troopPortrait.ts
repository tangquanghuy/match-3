/** Catalogue-backed portraits for summons and transformations absent from the battle snapshot. */
import { TROOPS, getTroopById } from './troops';

const byName = new Map<string, (typeof TROOPS)[number][]>();
for (const troop of TROOPS) {
  const entries = byName.get(troop.name) ?? [];
  entries.push(troop); byName.set(troop.name, entries);
}

/** Explicit troop IDs win; spell identity disambiguates repeated display names.
 * Unknown ad-hoc combatants retain the legacy fallback, not known catalogue troops. */
export function resolveTroopPortrait(name: string, identity: { troopId?: number; skillId?: string } = {}): string {
  const candidates = byName.get(name) ?? [];
  const troop = (identity.troopId === undefined ? undefined : getTroopById(identity.troopId))
    ?? candidates.find(t => String(t.spell.id) === identity.skillId)
    ?? candidates[0];
  if (troop?.artUrl) return troop.artUrl;
  if (troop?.portrait) return `/meta/assets/portraits/${troop.portrait}.webp`;
  return `https://rpg.bolt.qzz.io/${encodeURIComponent('封面')}/${encodeURIComponent(name)}.webp`;
}
