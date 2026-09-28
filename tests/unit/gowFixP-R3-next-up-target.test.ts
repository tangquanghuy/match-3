// sa-P review round 2: P-R3-next-up-target.
// New target mode enemyNextUp (native NextUpFromTarget, one unit above the chosen target).
// troop:6982 8485: silence chosen / next up / next down are three independent 30% rolls, so over many seeds
// exactly one neighbour is sometimes silenced.
import { describe, it, expect } from 'vitest';
import { skill, inflict } from '@engine/skills/builders';
import { castSpell, registry } from '../helpers/gowCast';

const tough = { hp: 900, maxHp: 900, armor: 0 };
const silenced = (r: ReturnType<typeof castSpell>, i: number) => r.f.enemies[i].statuses.some((s) => s.id === 'silence');

describe('P-R3-next-up-target', () => {
  it('enemyNextUp picks the living enemy right above the chosen one; none above the front', () => {
    registry.prototypes.set('test-p-r3-nextup', skill(inflict('silence', 'enemyChosen'), inflict('stun', 'enemyNextUp')));
    const mid = castSpell({ skill: 'test-p-r3-nextup', target: 12, enemies: [tough, tough, tough, tough] });
    expect(mid.f.enemies.map((e) => e.statuses.some((s) => s.id === 'stun'))).toEqual([false, true, false, false]);
    const front = castSpell({ skill: 'test-p-r3-nextup', target: 10, enemies: [tough, tough, tough, tough] });
    expect(front.f.enemies.some((e) => e.statuses.some((s) => s.id === 'stun'))).toBe(false);
  });
  it('troop:6982 8485: the two neighbours roll independently', () => {
    let onlyOne = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = castSpell({ key: 'troop:6982', target: 11, seed, enemies: [tough, tough, tough, tough] });
      if (silenced(r, 0) !== silenced(r, 2)) onlyOne += 1;
    }
    expect(onlyOne).toBeGreaterThan(0);
  });
});
