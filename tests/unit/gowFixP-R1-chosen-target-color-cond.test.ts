// sa-P review round 2: P-R1-chosen-target-color-cond.
// Global condition chosenTargetColor (cast-start colours of the chosen target); troop:6964 8467 native order
// DestroyColumn -> IncreaseAttack -> TrueDamage last.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import { castSpell } from '../helpers/gowCast';

const foe = (colors: BaseColor[]) => ({ hp: 900, maxHp: 900, armor: 0, colors });

describe('P-R1-chosen-target-color-cond', () => {
  it('troop:6964 8467: Blue target -> destroy a column and +5 Attack before the true damage', () => {
    const r = castSpell({ key: 'troop:6964', target: 10, enemies: [foe([BaseColor.Blue]), foe([BaseColor.Red]), foe([BaseColor.Red]), foe([BaseColor.Red])] });
    const o = r.summary.order;
    const destroy = o.findIndex((s) => s.startsWith('destroy'));
    const buff = o.findIndex((s) => s.startsWith('buff C attack+5'));
    const hit = o.findIndex((s) => s.startsWith('dmg E10') && !s.includes('skull'));
    expect(destroy).toBeGreaterThanOrEqual(0);
    expect(buff).toBeGreaterThan(destroy);
    expect(o.lastIndexOf(o.filter((s) => s.startsWith('dmg E10')).slice(-1)[0])).toBeGreaterThan(buff);
    expect(hit).toBeGreaterThanOrEqual(0);
  });
  it('troop:6964 8467: non-Blue target -> no column, no Attack', () => {
    const r = castSpell({ key: 'troop:6964', target: 10, enemies: [foe([BaseColor.Red]), foe([BaseColor.Blue]), foe([BaseColor.Blue]), foe([BaseColor.Blue])] });
    expect(r.summary.order.some((s) => s.startsWith('destroy'))).toBe(false);
    expect(r.summary.order.some((s) => s.startsWith('buff C attack'))).toBe(false);
  });
});
