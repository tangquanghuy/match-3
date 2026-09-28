// sa-D lane review round 3, lane L7 (then L6): behaviour the standard golden scenarios cannot show. Real TurnEngine casts.
import { describe, it, expect } from 'vitest';
import { castSpell, reviewBoard, withCells, type BoardFn } from '../helpers/gowCast';
import { BaseColor, colorGem, specialGem, type GemType } from '@engine/types';

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
  it('troop:6860 triple damage from 13 Brown Gems (R003: MultiplyFor10 = 13 or more)', () => {
    const nBrown = (n: number): BoardFn => (r, c) => colorGem(r * 8 + c < n ? BaseColor.Brown : (r + c) % 2 ? BaseColor.Red : BaseColor.Blue);
    expect(dmgs(castSpell({ key: 'troop:6860', board: nBrown(12) }))).toEqual([14]);
    expect(dmgs(castSpell({ key: 'troop:6860', board: nBrown(13) }))).toEqual([42]);
  });
  it('weapon:1000 hits the strongest enemy (Life + Armor, R005), not the first', () => {
    expect(castSpell({ key: 'weapon:1000' }).summary.order).toEqual(['dmg E11 8']);
    const enemies = [{ hp: 600, maxHp: 600, armor: 5 }, { hp: 300, maxHp: 300 }, { hp: 590, maxHp: 900, armor: 20 }];
    expect(castSpell({ key: 'weapon:1000', enemies }).summary.order).toEqual(['dmg E12 8']);
  });
  it('weapon:1049 +8 against a Dragon; weapon:1079 +12 when the target Attack is greater than mine', () => {
    const dragons = [0, 1, 2, 3].map(() => ({ hp: 900, maxHp: 900, troopTypes: ['Dragon'] }));
    expect(dmgs(castSpell({ key: 'weapon:1049', enemies: dragons }))).toEqual([23]);
    const strong = [{ hp: 600, maxHp: 600 }, { hp: 900, maxHp: 900, attack: 18 }];
    expect(dmgs(castSpell({ key: 'weapon:1079', enemies: strong }))).toEqual([26]);
    const equal = [{ hp: 600, maxHp: 600 }, { hp: 900, maxHp: 900, attack: 17 }]; // caster Attack 17
    expect(dmgs(castSpell({ key: 'weapon:1079', enemies: equal }))).toEqual([14]);
  });
  it('weapon:1109 one hit of [M+4] +8 with 13+ Red Gems (native single Damage step, AddFor10RedGems)', () => {
    const nRed = (n: number): BoardFn => (r, c) => colorGem(r * 8 + c < n ? BaseColor.Red : (r + c) % 2 ? BaseColor.Green : BaseColor.Blue);
    expect(castSpell({ key: 'weapon:1109', board: nRed(13) }).summary.order).toEqual(['dmg E11 22']);
    expect(castSpell({ key: 'weapon:1109', board: nRed(12) }).summary.order).toEqual(['dmg E11 14']);
  });
  it('weapon:1121 x3 vs Submerged; weapon:1127 x3 vs Goblin', () => {
    const sub = [{ hp: 600, maxHp: 600 }, { hp: 900, maxHp: 900, statuses: [{ id: 'submerged', turns: 99 }] as never }];
    expect(dmgs(castSpell({ key: 'weapon:1121', enemies: sub }))).toEqual([33]);
    const gob = [{ hp: 600, maxHp: 600 }, { hp: 900, maxHp: 900, troopTypes: ['Goblin'] }];
    expect(dmgs(castSpell({ key: 'weapon:1127', enemies: gob }))).toEqual([39]);
  });
  it('troop:6956 three RandomEnemy steps: 3 hits even with 2 enemies left (R006-C3), x2 on Burning', () => {
    const two = [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, statuses: [{ id: 'burning', turns: 99 }] as never }];
    for (let seed = 1; seed <= 20; seed++) {
      const o = castSpell({ key: 'troop:6956', seed, enemies: two }).summary.order.filter(s => s.startsWith('dmg '));
      expect(o).toHaveLength(3);
      expect(new Set(o.map(s => s.split(' ')[1])).size).toBe(2); // both hit before any repeat
      for (const s of o) expect(s).toMatch(s.startsWith('dmg E11') ? /^dmg E11 28/ : /^dmg E10 14/);
    }
  });
  it('weapon:1103 second-last then last enemy, x2 vs Dragons', () => {
    const enemies = [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, troopTypes: ['Dragon'] }, { hp: 900, maxHp: 900 }];
    expect(castSpell({ key: 'weapon:1103', enemies }).summary.order).toEqual(['dmg E11 24 (all)', 'dmg E12 12 (all)']);
  });
  it('weapon:1119 with an Undead enemy: 9 damage to another random enemy (never the chosen one)', () => {
    const enemies = [{ hp: 900, maxHp: 900, troopTypes: ['Undead'] }, { hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900 }];
    for (let seed = 1; seed <= 20; seed++) {
      const o = castSpell({ key: 'weapon:1119', seed, enemies }).summary.order;
      expect(o[0]).toBe('dmg E11 14');
      expect(o).toHaveLength(2);
      expect(o[1]).toMatch(/^dmg E1[02] 9$/);
    }
    expect(castSpell({ key: 'weapon:1119' }).summary.order).toEqual(['dmg E11 14']);
  });
  it('troop:6470 lethal on the poisoned one of the last 2; a poisoned enemy that becomes last-2 after a kill is spared', () => {
    const P = [{ id: 'poison', turns: 99 }] as never;
    const a = castSpell({ key: 'troop:6470', enemies: [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, statuses: P }] });
    expect(a.summary.units.E12).toContain('DEAD');
    expect(a.summary.units.E11).toBe('hp-25');
    const b = castSpell({ key: 'troop:6470', enemies: [{ hp: 900, maxHp: 900, statuses: P }, { hp: 900, maxHp: 900 }, { hp: 10, maxHp: 10 }] });
    expect(b.summary.units.E12).toContain('DEAD');
    expect(b.summary.units.E10).toBeUndefined();
  });
  it('weapon:1509 steals 6 Life only when the target itself has Hunter\'s Mark', () => {
    const M = [{ id: 'marked', turns: 99 }] as never;
    const onTarget = castSpell({ key: 'weapon:1509', enemies: [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, statuses: M }] });
    expect(onTarget.summary.order).toEqual(['dmg E11 12', 'dmg E11 6', 'buff C hp+6 max+6']);
    const onOther = castSpell({ key: 'weapon:1509', enemies: [{ hp: 900, maxHp: 900, statuses: M }, { hp: 900, maxHp: 900 }] });
    expect(onOther.summary.order).toEqual(['dmg E11 12']);
  });
  it('troop:6581 +15 (separate hit) when the target Attack is weaker, +15 more with Hunter\'s Mark', () => {
    const M = [{ id: 'marked', turns: 99 }] as never;
    const r = castSpell({ key: 'troop:6581', enemies: [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, attack: 5, statuses: M }] });
    expect(dmgs(r)).toEqual([14, 15, 15]);
    expect(dmgs(castSpell({ key: 'troop:6581', enemies: [{ hp: 900, maxHp: 900 }, { hp: 900, maxHp: 900, attack: 17 }] }))).toEqual([14]);
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
