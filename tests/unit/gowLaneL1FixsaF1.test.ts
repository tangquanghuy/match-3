// sa-F1 fix round A, lane L1: conditional parts the four standard scenarios cannot show.
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';

describe('L1 fix sa-F1', () => {
  // weapon:1311 CountArmyType@AllAllies orc 100 [1:1] + IncreaseAttack [(Magic/2)+1]: Magic 10 -> 6, +1 per Orc ally.
  it.each([
    { allies: [{ troopTypes: ['Orc'] }, { troopTypes: ['Orc'] }], atk: 8 },
    { allies: [{ troopTypes: ['Orc'] }, { troopTypes: ['Human'] }], atk: 7 },
    { allies: [{ troopTypes: ['Human'] }, { troopTypes: ['Human'] }], atk: 6 },
  ])('weapon:1311 attack boosted by Orc allies -> +$atk', ({ allies, atk }) => {
    const r = castSpell({ key: 'weapon:1311', allies });
    expect(r.summary.order).toContain(`buff A1 attack+${atk}`);
    expect(r.summary.units.A1).toContain('+rage');
    expect(r.summary.summons).toHaveLength(1);
  });

  // troop:6931 native Dispel@RandomEnemy before LethalDamage: a Barrier does not save the target.
  it('troop:6931 dispels the random enemy, then kills it', () => {
    const shield = [{ id: 'barrier', turns: 99 }];
    const r = castSpell({ key: 'troop:6931', enemies: [{ hp: 600, maxHp: 600, statuses: shield }, { hp: 700, maxHp: 700, statuses: shield }] });
    const dead = r.f.enemies.filter(e => e.defeated);
    expect(dead).toHaveLength(1);
    expect(dead[0].statuses.some(s => s.id === 'barrier')).toBe(false);
    expect(r.summary.order[0]).toMatch(/^remove E1\d -barrier$/);
    expect(r.f.enemies.filter(e => !e.defeated)[0].statuses.map(s => s.id)).toEqual(['barrier']);
  });
});
