// sa-F1 fix round A, lane L1: conditional parts the four standard scenarios cannot show.
import { describe, it, expect } from 'vitest';
import { castSpell, setupCast, summarize } from '../helpers/gowCast';

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

  // troop:6047 native Dispel@FromTarget before Consume: a Barrier on the chosen ally does not block the devour.
  it('troop:6047 dispels the chosen ally, then devours it and heals to full', () => {
    const r = castSpell({ key: 'troop:6047', allies: [{ hp: 400, maxHp: 400, attack: 12, armor: 6, statuses: [{ id: 'barrier', turns: 99 }] }, {}] });
    expect(r.summary.order[0]).toBe('remove A1 -barrier');
    expect(r.f.allies[0].defeated).toBe(true);
    expect(r.summary.order.some(o => /^dmg A1 \d+ devoured$/.test(o))).toBe(true);
    expect(r.f.caster.hp).toBe(r.f.caster.maxHp);
    expect(r.summary.gems.created.skull).toBe(6);
  });

  // troop:6289 +2 Magic to Daemon allies only; summon a random Daemon only with 12+ Souls (summoned one is not buffed).
  it.each([
    { souls: 12, summons: 1 },
    { souls: 11, summons: 0 },
  ])('troop:6289 daemons +2 magic, souls $souls -> $summons summon', ({ souls, summons }) => {
    const f = setupCast({ key: 'troop:6289', allies: [{ troopTypes: ['Daemon'] }, { troopTypes: ['Human'] }] });
    f.state.economy.souls = souls;
    const ev = f.cast();
    const s = summarize(f, ev);
    expect(s.order.filter(o => o.startsWith('buff'))).toEqual(['buff A1 magic+2']);
    expect(s.summons).toHaveLength(summons);
  });

  // troop:6292 Randomize AB-CD-EF on the chosen enemy: halve Attack (floor), halve Magic, or turn it into a Giant Toad.
  it('troop:6292 every branch hits the chosen enemy', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) seen.add(castSpell({ key: 'troop:6292', seed, enemies: [{}, { attack: 21, magic: 9 }] }).summary.order.join(' ; '));
    expect([...seen].sort()).toEqual(['buff E11 attack-10', 'buff E11 magic-4', 'transform E11 -> 巨蟾蜍'].sort());
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
