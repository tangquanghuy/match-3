// sa-F1 fix round A, lane L3: conditional parts the four standard scenarios cannot show.
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';
import { BaseColor, type Character } from '@engine/types';

const mana = (r: ReturnType<typeof castSpell>, id: number) => r.f.units.find(u => u.id === id)!.mana;

describe('L3 fix sa-F1: colour / race gated mana', () => {
  // troop:6871 GenerateQuarterMana@AllyColor Purple: floor(manaCost / 4) to Purple allies only.
  // Large mana costs so the cascade from the created Purple gems never hits the mana cap.
  it.each([
    { key: 'troop:6871', ally: { colors: [BaseColor.Purple], manaCost: 40 }, gain: 10 },
    { key: 'troop:6871', ally: { colors: [BaseColor.Purple], manaCost: 43 }, gain: 10 },
    { key: 'troop:6871', ally: { colors: [BaseColor.Red], manaCost: 40 }, gain: 0 },
  ])('$key quarter mana ally $ally.colors cost $ally.manaCost -> +$gain', ({ key, ally, gain }) => {
    const r = castSpell({ key, allies: [ally as Partial<Character>] });
    expect(r.summary.order.filter(o => o.startsWith('buff A1 mana'))).toEqual(gain ? [`buff A1 mana+${gain}`] : []);
  });

  // troop:7749 GenerateHalfManaConditional AddForTauros: half the chosen ally's mana cost only if it is a Tauros.
  it.each([
    { types: ['Tauros'], gain: 8 },
    { types: ['Human'], gain: 0 },
  ])('troop:7749 half mana for $types', ({ types, gain }) => {
    const r = castSpell({ key: 'troop:7749', allies: [{ troopTypes: types, manaCost: 16 }] });
    expect(mana(r, 1)).toBe(gain);
    expect(r.summary.units.A1).toContain('atk+11');
    expect(r.summary.units.A1).toContain('+barrier');
  });
});
