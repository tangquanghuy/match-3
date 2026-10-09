import { getTroopById } from '../../data/troops';
import { BaseColor } from '../../engine/types';
import { traitUnlockCost } from '../data/economy';
import { stoneColorKeyOf } from '../data/materials';
import type { MetaSave } from '../state/schema';
import { getRecord } from '../systems/troopProgress';

export type TraitStoneFilter = 'basic' | 'arcane' | 'celestial';

/** Current locked trait's recipe; prefer Arcane stones when the recipe also needs basic stones. */
export function traitStoneBagFocus(save: MetaSave, troopId: number): { filter: TraitStoneFilter; keys: string[]; focus: string } | null {
  const troop = getTroopById(troopId);
  const record = getRecord(save, troopId);
  if (!troop || !record) return null;
  const slot = record.traits.findIndex(unlocked => !unlocked) + 1;
  if (!slot || !troop.traits[slot - 1]) return null;
  const cost = traitUnlockCost(slot, stoneColorKeyOf(troop.manaColors[0] ?? BaseColor.Brown), troopId);
  const keys = Object.keys(cost.stones).filter(key => cost.stones[key]! > 0);
  if (!keys.length) return null;
  const filter: TraitStoneFilter = keys.some(key => key.startsWith('arcane:')) ? 'arcane'
    : keys.includes('celestial') ? 'celestial' : 'basic';
  const visibleKeys = keys.filter(key => filter === 'arcane' ? key.startsWith('arcane:')
    : filter === 'celestial' ? key === 'celestial' : /^(minor|major|runic):/.test(key));
  const focus = visibleKeys.find(key => (save.materials.traitstones[key] ?? 0) < cost.stones[key]!) ?? visibleKeys[0];
  return focus ? { filter, keys: visibleKeys, focus } : null;
}

export function traitStoneBagRoute(save: MetaSave, troopId: number): string | null {
  const target = traitStoneBagFocus(save, troopId);
  return target ? `#bag/stones/${target.filter}/for/${troopId}` : null;
}
