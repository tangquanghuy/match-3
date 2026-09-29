// sa-Q1 final wrap-up: issued skills of lanes L2 / L4a re-checked after the fixed primitives
// (sa-P fix rounds) and rulings R011-R016. Each case pins the behaviour the acceptance was based on.
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';
const has = (order: string[], s: string) => order.some(x => x === s || x.startsWith(s));
const statOf = (line: string) => line.split(' ').pop()!.replace(/[+-]\d+$/, '');

describe('sa-Q1 B01: random Skill pool (R007-2), row count at cast start, precount explode, remove', () => {
  it('troop:6134 Dark Song: [M+6] dmg, 4 from a random Skill (Life in the pool), Daemon + Orc mana steals', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = castSpell({ key: 'troop:6134', seed }).summary;
      expect(s.order[0]).toBe('dmg E11 16');
      s.order.filter(x => x.startsWith('buff E11')).forEach(x => seen.add(statOf(x)));
    }
    expect(seen.has('hp')).toBe(true);
    expect(seen.size).toBeGreaterThanOrEqual(3);
    const both = castSpell({ key: 'troop:6134', enemies: [{ hp: 500, maxHp: 500 }, { hp: 500, maxHp: 500, mana: 30, troopTypes: ['Orc', 'Daemon'] } as never] }).summary;
    expect(both.order.filter(x => x.startsWith('buff C mana+6')).length).toBe(2);
  });
  it('troop:6171 Ghiralee: StealRandom before the damage; stolen Life grows caster Life + max; Mech x2', () => {
    const s = castSpell({ key: 'troop:6171' }).summary;
    expect(s.order).toEqual(['buff E11 hp-11', 'buff C hp+11 max+11', 'dmg E11 11']);
    const mech = castSpell({ key: 'troop:6171', enemies: [{ hp: 500, maxHp: 500 }, { hp: 500, maxHp: 500, armor: 0, troopTypes: ['Mech'] } as never] }).summary;
    expect(has(mech.order, 'dmg E11 22')).toBe(true);
  });
  it('troop:6182 Herald of Chaos: Blue in the chosen row counted at cast start, damage + drain, row destroyed last', () => {
    const s = castSpell({ key: 'troop:6182' }).summary;
    expect(s.order[0]).toBe('dmg E10 15'); // 1 + 10 + 2 x 2 Blue in the row
    expect(s.order[1]).toMatch(/^buff E10 (attack|armor|hp|magic)-15$/);
    expect(s.order[2]).toMatch(/^destroy 8 /);
  });
  it('troop:6398 Ancient Golem: Blue in the 3x3 block counted before the explosion, true damage lands first', () => {
    const s = castSpell({ key: 'troop:6398' }).summary;
    expect(s.order[0]).toBe('dmg E12 18');
    expect(s.order[1]).toBe('explode 9');
  });
  it('troop:6423 Cat Sith: chosen colour counted [3:1] before RemoveColor; removed gems give no mana', () => {
    const s = castSpell({ key: 'troop:6423' }).summary;
    expect(s.order.slice(0, 4)).toEqual(['buff E13 hp-14', 'buff E13 mana-4', 'buff C mana+4', 'destroy 11 (Blue x11)']);
    expect(Object.keys(s.units).some(u => u.startsWith('A') && (s.units[u] ?? '').includes('mana+'))).toBe(false);
  });
});
