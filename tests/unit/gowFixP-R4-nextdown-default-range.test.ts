// sa-P review round 2: P-R4-nextdown-default-range.
// enemyChosenAndNextDown resolves two victims; without an explicit range both take full damage (like enemyChosenAndBelow).
import { describe, it, expect } from 'vitest';
import { skill, dmg } from '@engine/skills/builders';
import { castSpell, registry } from '../helpers/gowCast';

describe('P-R4-nextdown-default-range', () => {
  it('dmg(enemyChosenAndNextDown) with no range hits the chosen enemy and the next one down', () => {
    registry.prototypes.set('test-p-r4-nextdown', skill(dmg('enemyChosenAndNextDown', 3, 1)));
    const r = castSpell({ skill: 'test-p-r4-nextdown', target: 11 });
    const hits = r.summary.order.filter((s) => s.startsWith('dmg '));
    expect(hits.map((s) => s.split(' ')[1])).toEqual(['E11', 'E12']);
    expect(hits.every((s) => s.split(' ')[2] === '13')).toBe(true);
  });
});
