/** Spell restoration is not reduced by Bleed or Disease in GoW.
 * Bleed deals stacking true damage; Disease only halves mana gained from gems.
 * Retain this shared entry point for traits and skill restoration.
 * Source: official status guide (Infinity Plus 2, article 150000208274).
 */
import type { Character } from './types';

export const HEAL_BLOCK_STATUS_IDS = new Set<string>();
export const HEAL_HALVE_STATUS_IDS = new Set<string>();
export function isBleeding(char: Character): boolean {
  return char.statuses.some(s => s.id === 'bleed' && s.turns > 0);
}
export function isDiseased(char: Character): boolean {
  return char.statuses.some(s => s.id === 'disease' && s.turns > 0);
}
export function healingMultiplier(_char: Character): number { return 1; }
export function effectiveHealing(_char: Character, amount: number): number { return amount; }
