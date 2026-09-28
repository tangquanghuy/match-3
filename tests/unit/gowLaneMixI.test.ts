// sa-I mixed-lane review (L7, L6, L1, L3, L4b, L2): behaviour the four standard golden scenarios cannot show.
// Real TurnEngine casts through tests/helpers/gowCast.
import { describe, it, expect } from 'vitest';
import { castSpell, setupCast, summarize, type CastOpts } from '../helpers/gowCast';
import { BaseColor } from '@engine/types';

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
describe('sa-I L7 B02', () => {
  it('weapon:1106 scatter [M+7] = 17, +8 when the enemy team has a Daemon', () => {
    const dae = [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, troopTypes: ['Daemon'] }];
    const plain = [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900 }];
    for (let seed = 1; seed <= 20; seed++) {
      expect(dmgs({ key: 'weapon:1106', seed, enemies: dae }).reduce((a, b) => a + b, 0)).toBe(25);
      expect(dmgs({ key: 'weapon:1106', seed, enemies: plain }).reduce((a, b) => a + b, 0)).toBe(17);
    }
  });
  it('weapon:1005 light splash always centred on the first enemy', () => {
    expect(dmgLines({ key: 'weapon:1005', target: 12 })).toEqual(['dmg E10 9 (splash)', 'dmg E11 2 (splash)']);
  });
  it.each([
    ['weapon:1016', 14, 3], ['weapon:1031', 16, 4], ['weapon:1046', 14, 3],
  ])('%s light splash on the chosen enemy (%i) and both neighbours (%i)', (key, main, side) => {
    expect(dmgLines({ key, target: 12 })).toEqual([`dmg E12 ${main} (splash)`, `dmg E11 ${side} (splash)`, `dmg E13 ${side} (splash)`]);
  });
});
const st = (...ids: string[]) => ids.map(id => ({ id, turns: 99 })) as never;
const withStorm = (o: CastOpts, side: 'Left' | 'Right') => {
  const f = setupCast(o); f.state.teams[side].storm = { color: BaseColor.Red, turns: 3, troopId: 0 };
  return summarize(f, f.cast()).order.filter(s => s.startsWith('dmg '));
};
describe('sa-I L7 B03', () => {
  it('weapon:1097 light splash 14/3, +5 on the main hit when the target is Entangled', () => {
    const ent = [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, statuses: st('entangle') }, { hp: 900, maxHp: 900 }];
    expect(dmgLines({ key: 'weapon:1097', enemies: ent })).toEqual(['dmg E11 19 (splash)', 'dmg E10 4 (splash)', 'dmg E12 4 (splash)']);
    expect(dmgLines({ key: 'weapon:1097', enemies: ent, target: 10 })).toEqual(['dmg E10 14 (splash)', 'dmg E11 3 (splash)']);
  });
  it('troop:6116 two light splashes: RandomEnemy then RandomPrefNotPrev (a lone enemy is hit twice)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const mains = dmgLines({ key: 'troop:6116', seed }).filter(s => / 12 \(splash\)$/.test(s)).map(s => s.split(' ')[1]);
      expect(mains).toHaveLength(2); expect(mains[0]).not.toBe(mains[1]);
    }
    expect(dmgLines({ key: 'troop:6116', enemies: ONE })).toEqual(['dmg E10 12 (splash)', 'dmg E10 12 (splash)']);
  });
  it('weapon:1561 heavy splash on the chosen enemy, then light splash on a plain RandomEnemy (may repeat)', () => {
    expect(dmgLines({ key: 'weapon:1561', enemies: ONE })).toEqual(['dmg E10 13 (splash)', 'dmg E10 13 (splash)']);
    let same = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const l = dmgLines({ key: 'weapon:1561', seed, target: 12 });
      expect(l.slice(0, 3)).toEqual(['dmg E12 13 (splash)', 'dmg E11 9 (splash)', 'dmg E13 9 (splash)']);
      if (l[3].startsWith('dmg E12 13')) same++;
    }
    expect(same).toBeGreaterThan(20);
  });
  it('weapon:1273 splash 16/8, doubled with any storm (either side)', () => {
    expect(withStorm({ key: 'weapon:1273' }, 'Left')).toEqual(['dmg E11 32 (splash)', 'dmg E10 16 (splash)', 'dmg E12 16 (splash)']);
    expect(withStorm({ key: 'weapon:1273' }, 'Right')).toEqual(['dmg E11 32 (splash)', 'dmg E10 16 (splash)', 'dmg E12 16 (splash)']);
  });
  it('troop:6057 true damage 11 on the chosen enemy, 17 when it is wounded', () => {
    const hurt = [{ hp: 900, maxHp: 900 }, { hp: 899, maxHp: 900 }];
    expect(dmgLines({ key: 'troop:6057', enemies: hurt })).toEqual(['dmg E11 17']);
    expect(dmgLines({ key: 'troop:6057', enemies: hurt, target: 10 })).toEqual(['dmg E10 11']);
  });
});
