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

  // troop:7351 native ConsumeConditional (35% if Death Marked) BEFORE the [Magic + 3] +4/Orc damage.
  it.each([
    { marked: true, outcomes: ['devour', 'dmg 17'] },
    { marked: false, outcomes: ['dmg 17'] },
  ])('troop:7351 devour first when Death Marked=$marked', ({ marked, outcomes }) => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const r = castSpell({ key: 'troop:7351', seed, enemies: [{}, { hp: 900, maxHp: 900, attack: 20, armor: 10, statuses: marked ? [{ id: 'death-mark', turns: 9 }] : [] }] });
      const o = r.summary.order;
      if (o[0]?.endsWith('devoured')) { expect(o).toContain('buff C attack+20'); expect(o.filter(x => x.startsWith('dmg'))).toHaveLength(1); seen.add('devour'); }
      else { expect(o[0]).toBe('dmg E11 17'); seen.add('dmg 17'); }
    }
    expect([...seen].sort()).toEqual([...outcomes].sort());
  });

  // Devour family: native ConsumeConditional (50% if race) -> IncreaseHealth 5 -> Damage [Magic + 4] x2 if race.
  it.each([
    { key: 'troop:6119', race: 'Elf' }, { key: 'troop:6173', race: 'Goblin' }, { key: 'troop:6212', race: 'Dragon' },
    { key: 'troop:6455', race: 'Monster' }, { key: 'troop:6879', race: 'Undead' },
  ])('$key devours or double-hits a $race, plain hit otherwise', ({ key, race }) => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const o = castSpell({ key, seed, enemies: [{}, { hp: 900, maxHp: 900, armor: 10, troopTypes: [race] }] }).summary.order;
      if (o[0]?.endsWith('devoured')) { expect(o.slice(-1)[0]).toBe('buff C hp+5 max+5'); seen.add('devour'); }
      else { expect(o).toEqual(['buff C hp+5 max+5', 'dmg E11 28']); seen.add('double'); }
    }
    expect([...seen].sort()).toEqual(['devour', 'double']);
    for (let seed = 1; seed <= 10; seed++) {
      expect(castSpell({ key, seed, enemies: [{}, { hp: 900, maxHp: 900, armor: 10, troopTypes: ['Human'] }] }).summary.order).toEqual(['buff C hp+5 max+5', 'dmg E11 14']);
    }
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
