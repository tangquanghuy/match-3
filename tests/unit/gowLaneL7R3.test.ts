// sa-D lane review round 3, lane L7 (then L6): behaviour the standard golden scenarios cannot show. Real TurnEngine casts.
import { describe, it, expect } from 'vitest';
import { castSpell, reviewBoard, withCells, type BoardFn } from '../helpers/gowCast';
import { specialGem, type GemType } from '@engine/types';

const withSpecials = (gems: GemType[], base: BoardFn = reviewBoard): BoardFn =>
  withCells(base, Object.fromEntries(gems.map((g, i) => [`${i < 8 ? 0 : 7},${i % 8}`, g])));
const doom = (n: number) => withSpecials(Array.from({ length: n }, () => specialGem('doomSkull')));
const killRate = (o: Parameters<typeof castSpell>[0], victim: string, runs = 300) => {
  let k = 0;
  for (let seed = 1; seed <= runs; seed++) if (castSpell({ ...o, seed }).summary.order.includes(`defeat ${victim}`)) k++;
  return k / runs;
};

const dmgs = (r: ReturnType<typeof castSpell>) => r.summary.order.filter(s => s.startsWith('dmg ')).map(s => Number(s.split(' ')[2]));

describe('L7 sa-D: conditional multipliers and counts', () => {
  it('troop:6117 triple damage against a Beast (native MultiplyForBeast 3)', () => {
    const enemies = [{ hp: 600, maxHp: 600 }, { hp: 900, maxHp: 900, armor: 0, troopTypes: ['Beast'] }];
    expect(dmgs(castSpell({ key: 'troop:6117', enemies }))).toEqual([51]);
    expect(dmgs(castSpell({ key: 'troop:6117' }))).toEqual([17]);
  });
  it('troop:6806 CountLife@FromTarget 20 = 20% of the target Life ([5:1])', () => {
    expect(dmgs(castSpell({ key: 'troop:6806' }))).toEqual([14 + 180]); // E11 900 Life
    expect(dmgs(castSpell({ key: 'troop:6806', target: 12 }))).toEqual([14 + 60]); // E12 300 Life
  });
  it('troop:7463 50% chance to repeat the damage on every enemy below the target', () => {
    let hits = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const o = castSpell({ key: 'troop:7463', seed }).summary.order;
      expect(o[0]).toBe('dmg E11 13');
      if (o.length > 1) { hits++; expect(o.slice(1)).toEqual(['dmg E12 13 (all)', 'dmg E13 13 (all)']); }
    }
    expect(Math.abs(hits / 200 - 0.5)).toBeLessThan(0.12);
  });
});

describe('L7 sa-D: instant-kill chances', () => {
  it('weapon:1435 6% +6% per Doomskull (plain Skulls do not count); slay and damage hit the same last enemy', () => {
    const sure = castSpell({ key: 'weapon:1435', board: doom(16) }); // 6% + 96% >= 100%
    // native order is Lethal then TrueDamage (queued P-D-lethal-first-lasttarget); for now damage first, slay the same unit
    expect(sure.summary.order).toEqual(['dmg E13 13', 'dmg E13 790', 'defeat E13']);
    // review board has 5 plain Skulls and no Doomskull -> 6% only
    expect(killRate({ key: 'weapon:1435' }, 'E13')).toBeLessThan(0.12);
    expect(castSpell({ key: 'weapon:1435', seed: 1 }).summary.order).toEqual(['dmg E13 13']);
  });
});
