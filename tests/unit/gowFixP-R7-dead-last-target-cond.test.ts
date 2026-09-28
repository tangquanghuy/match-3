// sa-P review round 4: P-R7-dead-last-target-cond (troop:7646 / 9550, weapon:1144 / 7410, troop:6386 / 7541).
// castTracking.lastTarget.unit keeps the picked Character; lastTargetColor / Race / Status read it after the hit
// killed the target and it left the roster (native step-0 Count* before the Damage step).
import { describe, it, expect } from 'vitest';
import { BaseColor, type Character } from '@engine/types';
import { castSpell } from '../helpers/gowCast';

const weak = (extra: Partial<Character> = {}): Partial<Character> => ({ hp: 1, maxHp: 1, armor: 0, ...extra });
const st = (id: string) => [{ id, turns: 3 }] as Character['statuses'];
const order = (r: ReturnType<typeof castSpell>) => r.summary.order;

describe('P-R7-dead-last-target-cond', () => {
  it('troop:7646: a Purple random enemy killed by the hit still refunds half the mana', () => {
    const r = castSpell({ key: 'troop:7646', seed: 7, enemies: [weak({ colors: [BaseColor.Purple] }), { hp: 100, maxHp: 100, colors: [BaseColor.Red] }] });
    expect(order(r)).toEqual(['dmg E10 13', 'defeat E10', 'buff C mana+6']);
  });
  it('troop:7646: a Red random enemy killed by the hit refunds nothing', () => {
    const r = castSpell({ key: 'troop:7646', seed: 7, enemies: [weak({ colors: [BaseColor.Red] }), { hp: 100, maxHp: 100, colors: [BaseColor.Red] }] });
    expect(order(r)).toEqual(['dmg E10 13', 'defeat E10']);
  });
  it('weapon:1144: a Webbed target killed by the hit still grants the extra turn; unwebbed killed target does not', () => {
    expect(castSpell({ key: 'weapon:1144', target: 10, enemies: [weak({ statuses: st('web') }), {}] }).summary.extraTurn).toBe('skill');
    expect(castSpell({ key: 'weapon:1144', target: 10, enemies: [weak(), {}] }).summary.extraTurn).not.toBe('skill');
  });
  it('troop:6386: a Hunter-Marked target killed by the hit still grants the extra turn; unmarked does not', () => {
    expect(castSpell({ key: 'troop:6386', target: 10, enemies: [weak({ statuses: st('marked') }), {}] }).summary.extraTurn).toBe('skill');
    expect(castSpell({ key: 'troop:6386', target: 10, enemies: [weak(), {}] }).summary.extraTurn).not.toBe('skill');
  });
});
