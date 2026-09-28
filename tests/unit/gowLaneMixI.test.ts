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
describe('sa-I L7 B04', () => {
  const armoured = [{ hp: 900, maxHp: 900, armor: 50 }, { hp: 900, maxHp: 900, armor: 50 }, { hp: 900, maxHp: 900, armor: 50 }];
  it.each([['weapon:1026', 15], ['weapon:1041', 13]])('%s true damage %i to the chosen enemy, ignores Armor', (key, n) => {
    const r = castSpell({ key, enemies: armoured, target: 12 }).summary;
    expect(r.order).toEqual([`dmg E12 ${n}`]); expect(r.units.E12).toMatch(new RegExp(`hp-${n}\\b`)); expect(r.units.E12).not.toMatch(/arm-/);
  });
  it.each([['weapon:1027', 17], ['weapon:1042', 14]])('%s true damage %i to a random enemy, ignores Armor', (key, n) => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const l = dmgLines({ key, seed, enemies: armoured }); expect(l).toHaveLength(1);
      expect(l[0]).toMatch(new RegExp(` ${n}$`)); seen.add(l[0].split(' ')[1]);
    }
    expect(seen.size).toBe(3);
  });
  it('weapon:1115 true damage 11, doubled on a Hunter-Marked target', () => {
    const m = [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, statuses: st('marked') }];
    expect(dmgLines({ key: 'weapon:1115', enemies: m })).toEqual(['dmg E11 22']);
    expect(dmgLines({ key: 'weapon:1115', enemies: m, target: 10 })).toEqual(['dmg E10 11']);
  });
});
describe('sa-I L7 B05', () => {
  it('weapon:1118 true damage 12, +5 only when the target itself is Divine (was any Divine enemy)', () => {
    const d = [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, troopTypes: ['Divine'] }];
    expect(dmgLines({ key: 'weapon:1118', enemies: d })).toEqual(['dmg E11 17']);
    expect(dmgLines({ key: 'weapon:1118', enemies: d, target: 10 })).toEqual(['dmg E10 12']);
  });
  it('troop:6883 two true hits on the same enemy: x2 if Poisoned, x2 if Stunned, independently', () => {
    const e = (...s: string[]) => [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, statuses: st(...s) }];
    expect(dmgLines({ key: 'troop:6883', enemies: e('poison') })).toEqual(['dmg E11 22', 'dmg E11 11']);
    expect(dmgLines({ key: 'troop:6883', enemies: e('stun') })).toEqual(['dmg E11 11', 'dmg E11 22']);
    expect(dmgLines({ key: 'troop:6883', enemies: e('poison', 'stun') })).toEqual(['dmg E11 22', 'dmg E11 22']);
  });
});
const buffs = (o: CastOpts) => castSpell(o).summary.order.filter(s => s.startsWith('buff '));
describe('sa-I L6 B01', () => {
  it('weapon:1522 +2 Magic to all allies first, then [M+2] = 14 Armor to Brown allies only, +10 Attack iff an enemy is Doom', () => {
    const allies = [{ hp: 500, maxHp: 500, colors: [BaseColor.Brown] }, { hp: 500, maxHp: 500, colors: [BaseColor.Red] }];
    expect(buffs({ key: 'weapon:1522', allies })).toEqual(['buff C magic+2', 'buff A1 magic+2', 'buff A2 magic+2', 'buff C armor+14', 'buff A1 armor+14']);
    const doom = [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, troopTypes: ['Doom'] }];
    expect(buffs({ key: 'weapon:1522', enemies: doom }).at(-1)).toBe('buff C attack+10');
  });
  it('troop:6699 3 true hits 14..28 (RandomEnemy + 2 PrefNotPrev, lone enemy thrice), then 14..28 Armor (EN range)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const t = targets({ key: 'troop:6699', seed });
      expect(t).toHaveLength(3); expect(t[1]).not.toBe(t[0]); expect(t[2]).not.toBe(t[1]);
    }
    expect(targets({ key: 'troop:6699', enemies: ONE })).toEqual(['E10', 'E10', 'E10']);
    expect(range({ key: 'troop:6699' }, 150)).toMatchObject({ min: 14, max: 28 });
    const arm: number[] = [];
    for (let seed = 1; seed <= 200; seed++) arm.push(Number(buffs({ key: 'troop:6699', seed })[0].split('+')[1]));
    expect(Math.min(...arm)).toBe(14); expect(Math.max(...arm)).toBe(28);
  });
  it('weapon:1035 scatter 18 only: native DecreaseArmor@FrontEnemy 5 has PercentageChance 0 (never fires)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const o = castSpell({ key: 'weapon:1035', seed }).summary.order;
      expect(o.every(s => s.startsWith('dmg ') && s.endsWith('(scatter)'))).toBe(true);
      expect(dmgs({ key: 'weapon:1035', seed }).reduce((a, b) => a + b, 0)).toBe(18);
    }
  });
});
describe('sa-I L6 B02', () => {
  it('troop:6554 drains [M+3] Life from the 2 weakest (hp+armor), then steals 8 Magic stat (not Mana) from the 2 strongest', () => {
    const o = castSpell({ key: 'troop:6554' }).summary.order;
    expect(o).toEqual(['dmg E12 13 (all)', 'dmg E10 13 (all)', 'buff C hp+26 max+26',
      'buff E11 magic-8', 'buff C magic+8', 'buff E13 magic-8', 'buff C magic+8']);
    expect(o.some(s => s.includes('mana'))).toBe(false);
  });
  it('troop:6603 steals 3 Magic per beaten stat BEFORE the hit (native order), so the hit uses the raised Magic', () => {
    const weak = [{ hp: 900, maxHp: 900 }, { hp: 100, maxHp: 100, armor: 0, attack: 1, magic: 20 }];
    // caster Magic 10 < 20: beats Attack, Life, Armor only -> steal 9, hit [19 + 3]
    expect(castSpell({ key: 'troop:6603', enemies: weak, caster: { attack: 20, armor: 10 } }).summary.order)
      .toEqual(['buff E11 magic-9', 'buff C magic+9', 'dmg E11 22']);
    const strong = [{ hp: 900, maxHp: 900 }, { hp: 2000, maxHp: 2000, armor: 50, attack: 50, magic: 50 }];
    expect(castSpell({ key: 'troop:6603', enemies: strong, caster: { attack: 5, armor: 0 } }).summary.order).toEqual(['dmg E11 13']);
  });
});
describe('sa-I L6 B03', () => {
  it('troop:6681 scatter 22, then native moves (Jumble step is 0%): SecondLast->front, Front->back 75%, Last->front 50%, Second->back 25%', () => {
    const moves = (seed: number) => castSpell({ key: 'troop:6681', seed }).summary.order.filter(s => s.startsWith('move '));
    // expected per cast: 1 + .75 + .5 + .25 = 2.5 moves; fronts after the first .5; backs .75 + .25 = 1.0
    let total = 0, front = 0, back = 0, secondFront = 0; const N = 400;
    for (let seed = 1; seed <= N; seed++) {
      const m = moves(seed);
      expect(m[0]).toBe('move E12 front');
      expect(m.length).toBeLessThanOrEqual(4);
      total += m.length; front += m.slice(1).filter(s => s.endsWith(' front')).length; back += m.filter(s => s.endsWith(' back')).length;
      if (m[1] === 'move E12 back') secondFront++;
    }
    expect(total / N).toBeGreaterThan(2.35); expect(total / N).toBeLessThan(2.65);
    expect(front / N).toBeGreaterThan(0.4); expect(front / N).toBeLessThan(0.6);
    expect(back / N).toBeGreaterThan(0.88); expect(back / N).toBeLessThan(1.12);
    expect(secondFront / N).toBeGreaterThan(0.65); expect(secondFront / N).toBeLessThan(0.85);
    expect(dmgs({ key: 'troop:6681' }).reduce((a, b) => a + b, 0)).toBe(22);
  });
});
describe('sa-I L6 B04 + L1', () => {
  it('troop:6859 steals 3 Magic from each enemy first, so the hit is [22 + 1] = 23 on all', () => {
    expect(dmgs({ key: 'troop:6859' })).toEqual([23, 23, 23, 23]);
  });
  it('weapon:1360 true 14; all Armor removed only when the target is Undead', () => {
    const e = (types: string[]) => [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, armor: 40, troopTypes: types }];
    expect(castSpell({ key: 'weapon:1360', enemies: e(['Undead']) }).summary.units.E11).toMatch(/arm-40/);
    expect(castSpell({ key: 'weapon:1360', enemies: e(['Beast']) }).summary.units.E11).not.toMatch(/arm-/);
  });
  it('weapon:1430 true scatter [2M+6] = 26 total, then the last enemy moves to the front', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const o = castSpell({ key: 'weapon:1430', seed }).summary.order;
      expect(dmgs({ key: 'weapon:1430', seed }).reduce((a, b) => a + b, 0)).toBe(26);
      expect(o.at(-1)).toBe('move E13 front');
    }
  });
  it('troop:6268 AB-CD: [transform a random enemy into Wraith, then scatter 19] OR [scatter 19, then +3 Magic all allies]', () => {
    let a = 0, b = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const o = castSpell({ key: 'troop:6268', seed }).summary.order;
      const d = dmgs({ key: 'troop:6268', seed });
      expect(d.reduce((x, y) => x + y, 0)).toBe(19);
      if (o[0].startsWith('transform ')) { a++; expect(o[0]).toMatch(/-> 怨灵$/); expect(o.some(s => s.includes('magic+'))).toBe(false); }
      else { b++; expect(o[0]).toMatch(/^dmg /); expect(o.filter(s => s.includes('magic+3'))).toHaveLength(3); expect(o.some(s => s.startsWith('transform'))).toBe(false); }
    }
    expect(a).toBeGreaterThan(20); expect(b).toBeGreaterThan(20);
  });
});
