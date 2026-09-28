// P-F2-precount-explode (troop:6398 Ancient Golem, spell 7553): native CountGems Blue 400 BoardTarget Block3x3 (step 0)
// -> Dispel@RandomEnemy -> TrueDamage@FromPrevious [counter] -> ExplodeGems SingleGem (last step).
// The Blue count is taken from the 3x3 block around the chosen cell BEFORE the explosion, and the damage lands first.
import { describe, it, expect } from 'vitest';
import { castSpell, sixColourBoard, withCells } from '../helpers/gowCast';
import { BaseColor, colorGem } from '@engine/types';

describe('P-F2-precount-explode', () => {
  it('default board: 1 Blue in the 3x3 around (3,3) -> true damage 10+4+4 = 18, before the explosion', () => {
    const r = castSpell({ key: 'troop:6398' });
    const iDmg = r.summary.order.findIndex(l => /^dmg E1\d 18$/.test(l));
    const iExp = r.summary.order.findIndex(l => l.startsWith('explode'));
    expect(iDmg).toBeGreaterThanOrEqual(0);
    expect(iExp).toBeGreaterThan(iDmg);
  });

  it('three Blue gems in the block -> +12', () => {
    const board = withCells(sixColourBoard, { '3,3': colorGem(BaseColor.Blue), '4,4': colorGem(BaseColor.Blue) });
    const r = castSpell({ key: 'troop:6398', board });
    expect(r.summary.order.some(l => /^dmg E1\d 26$/.test(l))).toBe(true);
  });
});
