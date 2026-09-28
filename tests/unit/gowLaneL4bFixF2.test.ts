// sa-F2 fix round A (lane L4b): cases the four standard golden scenarios cannot show.
// Real TurnEngine.castSkill through tests/helpers/gowCast.ts; each row has its own entity and expected values.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import { castSpell } from '../helpers/gowCast';

describe('L4b fix F2: troop:6265 sacrifice (spell 7408)', () => {
  const dm = [{ id: 'death-mark', turns: 99 }] as never;
  // CountSpecificStatusEffect@AllEnemies deathmark 400 -> +4 Magic per Death Marked enemy on top of [(Magic / 2) + 1]
  for (const [n, want] of [[0, 6], [1, 10], [2, 14]] as const) it(`${n} death-marked enemies -> other allies +${want} Magic`, () => {
    const enemies = [0, 1, 2, 3].map(i => ({ hp: 500, maxHp: 500, statuses: i < n ? dm : [] }));
    const r = castSpell({ key: 'troop:6265', enemies });
    expect(r.summary.order.filter(x => x.startsWith('buff'))).toEqual([`buff A1 magic+${want}`]);
    expect(r.summary.units.C ?? '').not.toContain('mag');
  });
  // native Dispel@LastAlly before Damage 10000: a Barrier on the last ally does not save it (dispel order is not observable
  // beyond that, the ally is dead afterwards)
  it('last ally dies even with Barrier', () => {
    const r = castSpell({ key: 'troop:6265', allies: [{}, { statuses: [{ id: 'barrier', turns: 99 }] as never }] });
    expect(r.summary.units.A2).toContain('DEAD');
  });
});

describe('L4b fix F2: troop:6529 dispel before kill (spell 7723)', () => {
  it('chosen enemy dies even with Barrier; remaining enemies Burned and Frozen', () => {
    const enemies = [0, 1, 2, 3].map(i => ({ hp: 500, maxHp: 500, statuses: i === 1 ? [{ id: 'barrier', turns: 99 }] as never : [] }));
    const r = castSpell({ key: 'troop:6529', enemies });
    expect(r.summary.units.E11).toContain('DEAD');
    expect(r.summary.order.filter(x => x.startsWith('status')).length).toBe(6);
  });
});

describe('L4b fix F2: troop:7145 (spell 8694) [Magic + 1]% slay', () => {
  it('Magic 99 -> 100% slay, 12 Skulls, no stat loss', () => {
    const r = castSpell({ key: 'troop:7145', magic: 99 });
    expect(r.summary.units.E11).toContain('DEAD');
    expect(r.summary.gems.created.skull).toBe(12);
    expect(r.summary.order.some(x => x.startsWith('buff'))).toBe(false);
  });
  it('miss -> -10 Armor/Attack/Magic and 10 true damage, no Skulls', () => {
    const r = castSpell({ key: 'troop:7145', magic: 0 });
    expect(r.summary.order).toEqual(['buff E11 armor-10', 'buff E11 attack-10', 'buff E11 magic-10', 'dmg E11 10']);
    expect(r.summary.gems.created.skull).toBeUndefined();
  });
});

describe('L4b fix F2: troop:6689 (spell 8035) Frozen count taken before the freeze', () => {
  for (const [n, want] of [[0, 6], [1, 9], [2, 12]] as const) it(`${n} enemies already Frozen -> ${want} Blue`, () => {
    const enemies = [0, 1, 2, 3].map(i => ({ hp: 500, maxHp: 500, statuses: i >= 2 && i < 2 + n ? [{ id: 'frozen', turns: 99 }] as never : [] }));
    const r = castSpell({ key: 'troop:6689', enemies });
    expect(r.summary.gems.created.Blue).toBe(want);
    expect(r.summary.order.at(-1)).toBe('status E11 +frozen');
  });
});

describe('L4b fix F2: weapon:1313 (spell 8299) +8 Skulls only when my Life is higher', () => {
  it('higher Life -> 14 Skulls; order self front, create, enemy front', () => {
    const r = castSpell({ key: 'weapon:1313', caster: { hp: 950 } });
    expect(r.summary.gems.created.skull).toBe(14);
    expect(r.summary.order[0]).toBe('move C front');
    expect(r.summary.order.at(-1)).toBe('move E11 front');
  });
  it('equal Life -> 6 Skulls', () => {
    expect(castSpell({ key: 'weapon:1313' }).summary.gems.created.skull).toBe(6);
  });
});

describe('L4b fix F2: ally colour counts', () => {
  // troop:6974 spell 8477: CountArmyColor@AllAllies 300 ; IncreaseArmor@AllyColor 1 +Mx1 ; IncreaseSpellPower@AllyColor 3 ; CreateGems 4 Brown
  const rows = [
    { brown: 2, allies: [{ colors: [BaseColor.Brown] }, { colors: [BaseColor.Brown, BaseColor.Red] }, { colors: [BaseColor.Blue] }], ids: ['A1', 'A2'] },
    { brown: 1, allies: [{ colors: [BaseColor.Blue] }, { colors: [BaseColor.Brown] }], ids: ['A2'] },
    { brown: 0, allies: [{ colors: [BaseColor.Blue] }], ids: [] },
  ];
  for (const row of rows) it(`troop:6974 with ${row.brown} Brown allies`, () => {
    const r = castSpell({ key: 'troop:6974', allies: row.allies });
    const buffs = r.summary.order.filter(x => x.startsWith('buff'));
    expect(buffs).toEqual([...row.ids.map(id => `buff ${id} armor+11`), ...row.ids.map(id => `buff ${id} magic+3`)]);
    expect(r.summary.gems.created.Brown).toBe(4 + 3 * row.brown);
  });
});
