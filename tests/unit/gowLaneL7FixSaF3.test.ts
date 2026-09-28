// sa-F3 fix round A, lane L7: Web-gem boosted slay chance (native LethalDamageConditional before Damage).
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';
import { specialGem } from '@engine/types';

describe('L7 sa-F3', () => {
  it('troop:7867 slays when 15% + 3% per Web gem reaches 100%; otherwise just deals damage', () => {
    const webs = castSpell({ key: 'troop:7867', board: (r, c) => ((r + c) % 2 === 0 ? specialGem('web') : null) });
    expect(webs.summary.units.E11).toContain('DEAD'); // 32 Web gems -> 111%
    const plain = castSpell({ key: 'troop:7867', seed: 1 });
    expect(plain.summary.order).toEqual(['dmg E11 14']);
  });
});
