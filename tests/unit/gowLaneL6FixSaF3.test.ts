// sa-F3 fix round A, lane L6: conditions the standard golden scenarios cannot show. Real TurnEngine casts.
import { describe, it, expect } from 'vitest';
import { castSpell, DEFAULT_ALLIES } from '../helpers/gowCast';

describe('L6 sa-F3', () => {
  it('troop:6499 doubles both Attack and Magic only when the chosen ally is a Raksha', () => {
    const raksha = castSpell({ key: 'troop:6499', allies: [{ ...DEFAULT_ALLIES[0], troopTypes: ['Raksha'] }, DEFAULT_ALLIES[1]] });
    expect(raksha.summary.units.A1).toBe('atk+22 mag+4');
    const plain = castSpell({ key: 'troop:6499' });
    expect(plain.summary.units.A1).toBe('atk+11 mag+2');
  });
  it('troop:6226 steals Magic before the hit; double only against a Blue user', () => {
    expect(castSpell({ key: 'troop:6226' }).summary.order).toEqual(['buff E11 magic-2', 'buff C magic+2', 'dmg E11 28']);
    expect(castSpell({ key: 'troop:6226', target: 10 }).summary.order).toEqual(['buff E10 magic-2', 'buff C magic+2', 'dmg E10 14']);
  });
});
