/**
 * sa-J final wrap-up round: checks for final-queue.json unreviewed / not-eligible keys that the
 * standard golden scenarios (L10 R10 L0 K) do not show on their own.
 */
import { describe, expect, it } from 'vitest';
import { castSpell } from '../helpers/gowCast';

const order = (key: string, o: Record<string, unknown> = {}) => castSpell({ key, ...o }).summary.order;

describe('sa-J B01', () => {
  // troop:6017 StarGazer (7017): CountGems Blue ; RemoveColor Blue ; IncreaseAttack UseCounter -> Magic + removed.
  it('troop:6017 gives Magic + removed Blue gems as attack', () => {
    const o = order('troop:6017');
    expect(o[0]).toBe('destroy 11 (Blue x11)');
    expect(o).toContain('buff A1 attack+21');
  });
  // troop:6018 Pegasus (7018): quarter mana goes to all other allies, not self.
  it('troop:6018 gives quarter mana to other allies only', () => {
    const o = order('troop:6018');
    expect(o.filter(x => /^buff \w+ mana\+/.test(x))).toEqual(['buff A1 mana+4', 'buff A2 mana+4']);
  });
});
