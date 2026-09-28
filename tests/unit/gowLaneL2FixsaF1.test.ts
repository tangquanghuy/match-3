// sa-F1 fix round A, lane L2: random branches (native Randomize) and board-gated parts the standard scenarios cannot show.
import { describe, it, expect } from 'vitest';
import { castSpell, reviewBoard, withCells, summaryLine, type CastOpts } from '../helpers/gowCast';
import { specialGem } from '@engine/types';

/** Distinct spell-phase effect lines over seeds 1..60 (one line per observed branch). */
function branches(o: CastOpts): Set<string> {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 60; seed++) seen.add(castSpell({ ...o, seed }).summary.order.join(' ; ') || '(none)');
  return seen;
}

describe('L2 fix sa-F1: Randomize branches with a chosen enemy (inputTarget declared)', () => {
  it.each([
    // Steal [Magic + 2] Life OR steal all Mana (E11 has 8 mana, caster cost 7)
    { key: 'troop:6206', expected: ['dmg E11 12 ; buff C hp+12 max+12', 'buff E11 mana-8 ; buff C mana+7'] },
    // Drain all Mana OR steal [Magic + 1] Attack OR Silence
    { key: 'troop:6845', expected: ['buff E11 mana-8', 'buff E11 attack-11 ; buff C attack+11', 'status E11 +silence'] },
    // [Magic + 3] true damage + Burn OR destroy all Bomb gems (none on the board)
    { key: 'troop:6969', expected: ['dmg E11 11 ; status E11 +burning', '(none)'] },
    // Eliminate 4 Magic OR drain 4 Mana OR steal [Magic + 1] Life (no Web gems)
    { key: 'troop:7329', expected: ['buff E11 magic-4', 'buff E11 mana-4', 'dmg E11 11 ; buff C hp+11 max+11'] },
    // all Armor removed, then Poison OR [Magic + 2] damage
    { key: 'weapon:1081', expected: ['buff E11 armor-10 ; status E11 +poison', 'buff E11 armor-10 ; dmg E11 12'] },
  ])('$key hits the chosen enemy in every branch', ({ key, expected }) => {
    expect([...branches({ key })].sort()).toEqual([...expected].sort());
  });

  // troop:6929 A = [Magic + 3], B = 3 x [Magic + 3] (MultiplyIfIHaveMech; the bot is a Mech); 15% self destruct after either
  it('troop:6929 normal or triple damage, sometimes self-destructs', () => {
    const seen = branches({ key: 'troop:6929' });
    const dmgs = new Set([...seen].map(l => /^dmg E11 (\d+)/.exec(l)?.[1]));
    expect(dmgs).toEqual(new Set(['13', '39']));
    expect([...seen].some(l => l.includes('defeat C'))).toBe(true);
    expect([...seen].some(l => !l.includes('defeat C'))).toBe(true);
  });

  // Web gems boost every branch x2: 2 Web gems -> +4
  it('troop:7329 boosted by Web gems [x2]', () => {
    const board = withCells(reviewBoard, { '3,3': specialGem('web'), '5,1': specialGem('web') });
    expect([...branches({ key: 'troop:7329', board })].sort()).toEqual(['buff E11 magic-8', 'buff E11 mana-8', 'dmg E11 15 ; buff C hp+15 max+15'].sort());
  });

  // troop:7825 Explode all Poison gems, curse one random enemy per Poison gem (count taken before the explosion)
  it.each([
    { cells: { '3,3': specialGem('poisonGem') }, curses: 1 },
    { cells: { '1,6': specialGem('poisonGem'), '6,1': specialGem('poisonGem') }, curses: 2 },
    { cells: {}, curses: 0 },
  ])('troop:7825 curses per Poison gem -> $curses', ({ cells, curses }) => {
    const r = castSpell({ key: 'troop:7825', board: withCells(reviewBoard, cells) });
    expect(r.summary.order.filter(o => /^status E1\d \+curse$/.test(o))).toHaveLength(curses);
    if (!curses) expect(summaryLine(r.summary)).toBe('(no spell events)');
  });
});
