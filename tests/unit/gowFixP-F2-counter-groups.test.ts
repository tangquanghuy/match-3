// P-counter-per-step follow-up (sa-F2 note, troop:6826 Umenath spell 8228): native CountAttackArmorLife 50 is ONE
// step over Attack+Armor+Life (floored once), CountMagic 50 a second step. R007-1: floor per native step, then sum.
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';
import { modifierBonus } from '@engine/skills/effects/secondary';
import type { EffectContext } from '@engine/skills/effects/context';

describe('P-counter-per-step follow-up: grouped modifier sources (one floor per native Count step)', () => {
  it('sourceGroups floor each group once, then sum', () => {
    const ctx = { castTracking: { destroyed: [], transformed: 0, drainedMana: 7, enemyDeaths: 0, allyDeaths: 0, goldSpent: 3 } } as unknown as EffectContext;
    // drained 7 + gold 3 = 10 -> floor(10/2) = 5 (one group); separate floors would give 3 + 1 = 4
    expect(modifierBonus({ mod: { kind: 'ratio', a: 2, b: 1 }, sourceGroups: [[{ kind: 'drainedMana' }, { kind: 'goldSpent' }]] } as never, ctx)).toBe(5);
    expect(modifierBonus({ mod: { kind: 'ratio', a: 2, b: 1 }, sources: [{ kind: 'drainedMana' }, { kind: 'goldSpent' }] } as never, ctx)).toBe(4);
  });

  it('troop:6826 spell 8228: E11 (Attack+Armor+Life 927, Magic 11) takes 13 + floor(927/2) + floor(11/2) = 481', () => {
    const r = castSpell({ key: 'troop:6826' });
    const hit = r.summary.order.find(l => l.startsWith('dmg E11'));
    expect(hit).toBe('dmg E11 481');
  });
});
