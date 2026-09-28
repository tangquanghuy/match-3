// sa-B lane review round 3 (lane L4b): cases the four standard golden scenarios cannot show.
// Real TurnEngine.castSkill through tests/helpers/gowCast.ts; each row has its own entity and expected values.
import { describe, it, expect } from 'vitest';
import { BaseColor, specialGem, type GemType, type SpecialGemKind } from '@engine/types';
import { castSpell, setupCast, summarize, withCells, reviewBoard } from '../helpers/gowCast';
/** review board with `n` copies of a special gem on row 7 (cols 0..n-1). */
const withSpecials = (kind: SpecialGemKind, n: number, tier?: number) => {
  const over: Record<string, GemType> = {};
  for (let c = 0; c < n; c++) over[`7,${c}`] = specialGem(kind, tier);
  return withCells(reviewBoard, over);
};
const dmgs = (o: string[]) => o.filter(x => x.startsWith('dmg'));
const castStorm = (key: string, board = reviewBoard) => {
  const f = setupCast({ key, board });
  f.engine.debugSetStorm(BaseColor.Red, f.side);
  return summarize(f, f.cast()).order;
};

describe('L4b R3 B01: damage boosted by special gems on the board', () => {
  // [key, gem, per gem (x N), base damage at Magic 10, target text]
  const rows: [string, SpecialGemKind, number, number][] = [
    ['troop:7600', 'daemonicPortalGem', 4, 12], ['troop:7635', 'decayGem', 2, 14], ['troop:7780', 'bleedGem', 4, 13],
    ['troop:7509', 'angelGem', 3, 14], ['troop:7538', 'ghost', 8, 13], ['troop:7590', 'angelGem', 6, 13],
    ['troop:7678', 'submergeGem', 2, 14], ['troop:7757', 'enrageGem', 2, 11],
  ];
  for (const [key, gem, per, base] of rows) it(`${key}: 2 ${gem} -> ${base} + ${per} x 2`, () => {
    expect(dmgs(castSpell({ key, board: withSpecials(gem, 2) }).summary.order)[0]).toBe(`dmg E11 ${base + 2 * per}`);
  });
  it('troop:7566: 2 Freeze Gems -> 12 + 4 = 16 to all enemies; Storm doubles -> 24 (12 x 2) on the default board', () => {
    expect(dmgs(castSpell({ key: 'troop:7566', board: withSpecials('freezeGem', 2) }).summary.order))
      .toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `dmg ${e} 16 (all)`));
    expect(dmgs(castStorm('troop:7566'))).toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `dmg ${e} 24 (all)`));
  });
  it('troop:6869: Storm doubles 26 -> 52', () => {
    expect(dmgs(castStorm('troop:6869'))[0]).toBe('dmg E11 52');
  });
  it('troop:7635: count precedes the conversion (3 Blue -> Decay does not boost the same cast)', () => {
    const o = castSpell({ key: 'troop:7635' }).summary.order;
    expect(o).toEqual(['dmg E11 14', 'convert Blue x3 -> decayGem x3']);
  });
});

describe('L4b R3 B02', () => {
  const boosts: [string, SpecialGemKind, number, string][] = [
    ['troop:7873', 'freezeGem', 2, 'dmg E11 16'], ['weapon:1570', 'angelGem', 2, 'dmg E11 23'],
    ['troop:7568', 'stoneBlock', 2, 'dmg E11 21'], ['troop:7716', 'curseGem', 2, 'dmg E12 19'],
    ['weapon:1713', 'volcanoGem', 2, 'dmg E12 21'],
  ];
  for (const [key, gem, n, line] of boosts) it(`${key}: ${n} ${gem} -> ${line}`, () => {
    expect(dmgs(castSpell({ key, board: withSpecials(gem, n) }).summary.order)[0]).toBe(line);
  });
  it('weapon:1613: 2 Daemonic Portals -> 13 + 6 = 19 to the first two enemies', () => {
    expect(dmgs(castSpell({ key: 'weapon:1613', board: withSpecials('daemonicPortalGem', 2) }).summary.order))
      .toEqual(['dmg E10 19 (all)', 'dmg E11 19 (all)']);
  });
  it('troop:6318 / 7595 / 7848: self buffs boosted by Bomb x3 / Portal x6 / Lycanthropy x8', () => {
    expect(castSpell({ key: 'troop:6318', board: withSpecials('bomb', 2) }).summary.order[0]).toBe('buff C armor+21');
    expect(castSpell({ key: 'troop:7595', board: withSpecials('daemonicPortalGem', 2) }).summary.order[0]).toBe('buff C armor+24');
    expect(castSpell({ key: 'troop:7848', board: withSpecials('lycanthropyGem', 2) }).summary.order[0]).toBe('buff C attack+27');
  });
  it('troop:7568: CreateGemsRange 1 -> 1 or 2 Stone Blocks, both occur', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) seen.add(castSpell({ key: 'troop:7568', seed }).summary.gems.created.stoneBlock ?? 0);
    expect([...seen].sort()).toEqual([1, 2]);
  });
  // Native RandomEnemy + RandomPrefNotPrevEnemy chain (R007-3): a lone enemy takes every hit.
  const lone = [0, 1, 2, 3].map(i => (i === 2 ? { hp: 500, maxHp: 500, armor: 0 } : { hp: 0, defeated: true }));
  for (const [key, hits] of [['troop:7596', 2], ['troop:7716', 2], ['weapon:1713', 3]] as const) it(`${key}: lone enemy takes ${hits} hits`, () => {
    expect(dmgs(castSpell({ key, enemies: lone as never }).summary.order)).toHaveLength(hits);
  });
  it('weapon:1713: PrefNotPrev only avoids the previous target (third hit can repeat the first)', () => {
    let repeat = false;
    for (let seed = 1; seed <= 40 && !repeat; seed++) {
      const t = dmgs(castSpell({ key: 'weapon:1713', seed }).summary.order).map(x => x.split(' ')[1]);
      expect(t[1]).not.toBe(t[0]); expect(t[2]).not.toBe(t[1]);
      repeat = t[2] === t[0];
    }
    expect(repeat).toBe(true);
  });
  it('troop:7596: a kill on the second hit alone still creates 2 Daemonic Portals', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const enemies = [0, 1, 2, 3].map(() => ({ hp: 500, maxHp: 500, armor: 0 }));
      const f = setupCast({ key: 'troop:7596', seed, enemies });
      const s = summarize(f, f.cast());
      const [first, second] = dmgs(s.order).map(x => x.split(' ')[1]);
      expect(first).not.toBe(second);
      expect(s.gems.created.daemonicPortalGem ?? 0).toBe(0);
      // make the second target 1 hp: only it dies
      const g = setupCast({ key: 'troop:7596', seed, enemies: enemies.map((e, i) => (`E${10 + i}` === second ? { ...e, hp: 1 } : e)) });
      const t = summarize(g, g.cast());
      expect(t.order).toContain(`defeat ${second}`);
      expect(t.order).not.toContain(`defeat ${first}`);
      expect(t.gems.created.daemonicPortalGem).toBe(2);
    }
  });
  it('troop:7595: native order Yellow -> Spirit before the 2 Portals are created', () => {
    const o = castSpell({ key: 'troop:7595' }).summary.order;
    expect(o[1]).toMatch(/^convert Yellow x9 -> spiritGem\/Yellow x9$/);
    expect(o[2]).toMatch(/-> daemonicPortalGem x2$/);
  });
});

describe('L4b R3 B03', () => {
  const total = (o: string[]) => dmgs(o).reduce((a, x) => a + Number(x.split(' ')[2]), 0);
  it('troop:6167: weakest ally A1 healed 10 + floor(9 Purple x 34%) = 13; convert-first order is equivalent (count = converted)', () => {
    const o = castSpell({ key: 'troop:6167' }).summary.order;
    expect(o.slice(0, 2)).toEqual(['convert Purple x9 -> Yellow x9', 'buff A1 hp+13 max+13']);
  });
  it('troop:7632: 2 Decaying Gems -> 27 + 20 = 47 scatter total', () => {
    expect(total(castSpell({ key: 'troop:7632', board: withSpecials('decayGem', 2) }).summary.order)).toBe(47);
  });
  it('weapon:1585: boosted by Entangle Gems on the board (2 -> 18 + 16 = 34), not by Entangled enemies', () => {
    expect(total(castSpell({ key: 'weapon:1585', board: withSpecials('entangleGem', 2) }).summary.order)).toBe(34);
    const tangled = [0, 1, 2, 3].map(() => ({ hp: 900, maxHp: 900, armor: 0, statuses: [{ id: 'entangle', turns: 99 }] }));
    expect(total(castSpell({ key: 'weapon:1585', enemies: tangled as never }).summary.order)).toBe(18);
  });
  it('troop:7790: with a Storm, create 4 Yellow then convert all Yellow to Purple', () => {
    const o = castStorm('troop:7790');
    expect(o.filter(x => x.startsWith('convert'))).toHaveLength(2);
    expect(o.find(x => x.startsWith('convert') && x.endsWith('-> Yellow x4'))).toBeTruthy();
    expect(o.find(x => x.startsWith('convert Yellow x'))).toMatch(/^convert Yellow x13 -> Purple x13$/);
  });
  it('troop:7824: 2 Poison Gems -> 18 + 16 = 34 scatter total, then jumble, then 4 Green -> Poison', () => {
    const o = castSpell({ key: 'troop:7824', board: withSpecials('poisonGem', 2) }).summary.order;
    expect(total(o)).toBe(34);
    expect(o.slice(-2)).toEqual(['shuffle theirs', 'convert Green x4 -> poisonGem x4']);
  });
  it('troop:6104: steals 10 + floor(11 Blue x 34%) = 13 Attack and converts Blue (not Yellow) to Purple', () => {
    const o = castSpell({ key: 'troop:6104' }).summary.order;
    expect(o).toEqual(['convert Blue x11 -> Purple x11', 'buff E11 attack-13', 'buff C attack+13']);
  });
  it('troop:7192 / weapon:1468: true damage boosted by Stone Blocks (x5 / x2)', () => {
    expect(dmgs(castSpell({ key: 'troop:7192', board: withSpecials('stoneBlock', 2) }).summary.order)[0]).toBe('dmg E11 23');
    expect(dmgs(castSpell({ key: 'weapon:1468', board: withSpecials('stoneBlock', 2) }).summary.order)[0]).toBe('dmg E11 17');
  });
  it('troop:7192: target killed -> 8 gems of one of its colours (Yellow/Blue) still become Stone Blocks', () => {
    const enemies = [{ colors: [BaseColor.Red] }, { colors: [BaseColor.Yellow, BaseColor.Blue] }, { colors: [BaseColor.Purple] }, { colors: [BaseColor.Green] }]
      .map(e => ({ ...e, hp: 1, maxHp: 1, armor: 0 }));
    const o = castSpell({ key: 'troop:7192', enemies }).summary.order;
    expect(o).toContain('defeat E11');
    expect(o.find(x => x.startsWith('convert'))).toMatch(/^convert (Yellow|Blue) x8 -> stoneBlock x8$/);
  });
  it('troop:7046: 2 Lycanthropy Gems -> 6 Doomskulls; first and last enemies take 12 true damage', () => {
    const r = castSpell({ key: 'troop:7046', board: withSpecials('lycanthropyGem', 2) }).summary;
    expect(dmgs(r.order)).toEqual(['dmg E10 12', 'dmg E13 12']);
    expect(r.gems.created.doomSkull).toBe(6);
  });
});
