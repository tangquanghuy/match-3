// sa-P round 5: P-C-firstlast-army-color. troop:6937 Sister Ebony (spell 8418) native CountArmyColor@FirstLastEnemies
// Data 4 (Purple) before the primary damage -> Barrier@Self. Only the first and last alive enemies at cast start count.
import { describe, it, expect } from 'vitest';
import { castSpell, DEFAULT_ENEMIES } from '../helpers/gowCast';
import { BaseColor, type Character } from '@engine/types';

const P = BaseColor.Purple, R = BaseColor.Red, G = BaseColor.Green;
const base = { hp: 500, maxHp: 500, armor: 0, statuses: [] };
function barrier(colors: BaseColor[][], extra: Partial<Character>[] = []) {
  const enemies = colors.map((c, i) => ({ ...(DEFAULT_ENEMIES[i] ?? {}), ...base, colors: c, ...(extra[i] ?? {}) }));
  const r = castSpell({ key: 'troop:6937', enemies, caster: { statuses: [] } });
  return r.f.caster.statuses.some((s) => s.id === 'barrier');
}
describe('P-C-firstlast-army-color (troop:6937 / 8418)', () => {
  it('Purple only in the middle -> no Barrier', () => expect(barrier([[R], [P], [P], [G]])).toBe(false));
  it('Purple first -> Barrier', () => expect(barrier([[P], [R], [R], [G]])).toBe(true));
  it('Purple last -> Barrier', () => expect(barrier([[R], [G], [G], [P, G]])).toBe(true));
  it('no Purple enemy -> no Barrier', () => expect(barrier([[R], [G], [R], [G]])).toBe(false));
  it('lone Purple enemy is first and last -> Barrier', () => expect(barrier([[P]])).toBe(true));
  it('dead Purple front enemy is not counted (alive enemies at cast start)', () =>
    expect(barrier([[P], [R], [R], [G]], [{ hp: 0, defeated: true }])).toBe(false));
  it('last enemy killed by this cast still counts (cast-start snapshot)', () =>
    expect(barrier([[R], [G], [G], [P]], [{}, {}, {}, { hp: 1, maxHp: 500 }])).toBe(true));
});
