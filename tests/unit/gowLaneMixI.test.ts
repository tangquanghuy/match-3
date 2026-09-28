// sa-I mixed-lane review (L7, L6, L1, L3, L4b, L2): behaviour the four standard golden scenarios cannot show.
// Real TurnEngine casts through tests/helpers/gowCast.
import { describe, it, expect } from 'vitest';
import { castSpell, type CastOpts } from '../helpers/gowCast';

const dmgLines = (o: CastOpts) => castSpell(o).summary.order.filter(s => s.startsWith('dmg '));
const dmgs = (o: CastOpts) => dmgLines(o).map(s => Number(s.split(' ')[2]));
const targets = (o: CastOpts) => dmgLines(o).map(s => s.split(' ')[1]);
const range = (o: CastOpts, seeds = 300) => {
  const all: number[] = [];
  for (let seed = 1; seed <= seeds; seed++) all.push(...dmgs({ ...o, seed }));
  return { min: Math.min(...all), max: Math.max(...all), n: all.length };
};
const ONE = [{ hp: 900, maxHp: 900, armor: 0 }];

describe('sa-I L7 B01', () => {
  it('troop:6575 one chosen enemy, [(M/2)+8]..[M+16] = 13..26 at Magic 10 (Tower x3-x5 waived R000)', () => {
    const r = range({ key: 'troop:6575' });
    expect(r).toEqual({ min: 13, max: 26, n: 300 });
    for (let seed = 1; seed <= 30; seed++) expect(targets({ key: 'troop:6575', seed })).toEqual(['E11']);
    expect(targets({ key: 'troop:6575', target: 12 })).toEqual(['E12']);
  });
  it('troop:7337 one hit on the chosen enemy, [(M/2)+1]..[M+3] = 6..13 (was front enemy split in 2)', () => {
    const r = range({ key: 'troop:7337' });
    expect(r).toEqual({ min: 6, max: 13, n: 300 });
    expect(targets({ key: 'troop:7337', target: 12 })).toEqual(['E12']);
  });
  it('troop:6932 six hits, never the same enemy twice in a row, repeats a lone enemy; 7..15 (R006-C1)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const t = targets({ key: 'troop:6932', seed });
      expect(t).toHaveLength(6);
      for (let i = 1; i < 6; i++) expect(t[i]).not.toBe(t[i - 1]);
    }
    expect(targets({ key: 'troop:6932', enemies: ONE })).toEqual(Array(6).fill('E10'));
    const r = range({ key: 'troop:6932' }, 100);
    expect(r.min).toBe(7); expect(r.max).toBe(15);
  });
  it('weapon:1050 scatter: [M+8] = 18 split over all enemies', () => {
    for (let seed = 1; seed <= 30; seed++) expect(dmgs({ key: 'weapon:1050', seed }).reduce((a, b) => a + b, 0)).toBe(18);
  });
  it('weapon:1078 scatter [M+4] = 14, +10 when the enemy team has a Fey', () => {
    const fey = [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, troopTypes: ['Fey'] }, { hp: 900, maxHp: 900 }];
    const plain = [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900 }];
    for (let seed = 1; seed <= 20; seed++) {
      expect(dmgs({ key: 'weapon:1078', seed, enemies: fey }).reduce((a, b) => a + b, 0)).toBe(24);
      expect(dmgs({ key: 'weapon:1078', seed, enemies: plain }).reduce((a, b) => a + b, 0)).toBe(14);
    }
  });
});
