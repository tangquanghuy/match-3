// sa-R2 lane review round 1 (lane L4b + R009 giant/dragon items from L3): cases the four standard golden scenarios cannot show.
// Real TurnEngine.castSkill through tests/helpers/gowCast.ts; each row has its own entity and expected values.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import { castSpell, type BoardFn } from '../helpers/gowCast';

const colorGem = (color: BaseColor) => ({ kind: 'color', color }) as never;
const OTHERS = [BaseColor.Red, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
/** No-match board with exactly `n` = 30 gems of `hot` (rows 0-4 on (r+c)%3 != 0, plus row 5 cols 0/2/5). */
const hotBoard = (hot: BaseColor): BoardFn => {
  const others = OTHERS.includes(hot) ? [...OTHERS.filter(c => c !== hot), BaseColor.Blue] : OTHERS;
  return (r, c) => (r < 5 && (r + c) % 3 !== 0) || (r === 5 && [0, 2, 5].includes(c)) ? colorGem(hot) : colorGem(others[(2 * r + c) % 5]);
};
const countHot = (b: BoardFn, hot: BaseColor) => {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((b(r, c) as unknown as { color: BaseColor }).color === hot) n++;
  return n;
};

// R009: ConvertGems 5 <C> > Giant<C> / Dragon<C>. CountGems (step 0) precedes the conversion, so both the damage boost
// (giants, [x2]) and the extra-turn chance boost ([x2] giants, [x3] dragons) use the pre-conversion count.
const GIANTS = [['troop:7245', BaseColor.Blue], ['troop:7246', BaseColor.Green], ['troop:7247', BaseColor.Red],
  ['troop:7248', BaseColor.Yellow], ['troop:7249', BaseColor.Purple], ['troop:7250', BaseColor.Brown]] as const;
const DRAGONS = [['troop:7440', BaseColor.Blue], ['troop:7441', BaseColor.Green], ['troop:7442', BaseColor.Red],
  ['troop:7443', BaseColor.Yellow], ['troop:7444', BaseColor.Purple], ['troop:7445', BaseColor.Brown]] as const;

describe('R009 giant gem dragons (spells 8844-8849)', () => {
  it('fixture board has 30 hot gems', () => { for (const [, c] of GIANTS) expect(countHot(hotBoard(c), c)).toBe(30); });
  for (const [key, color] of GIANTS) it(`${key}: 5 ${color} -> giantGem/${color}, damage 15+6+2x30`, () => {
    const r = castSpell({ key, board: hotBoard(color) });
    expect(r.summary.order.filter(x => x.startsWith('dmg'))).toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `dmg ${e} 81 (all)`));
    expect(r.summary.order).toContain(`convert ${color} x5 -> giantGem/${color} x5`);
    // extra-turn roll precedes the conversion (same segment order as the dragon rows below, which prove it at 100%)
    expect(r.summary.order.at(-1)).toMatch(/^convert /);
  });
});

describe('R009 dragon gem dragons (spells 9132-9137)', () => {
  for (const [key, color] of DRAGONS) it(`${key}: 5 ${color} -> dragonGem/${color}; 30 ${color} -> 10% + 3x30 = 100% extra turn`, () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = castSpell({ key, board: hotBoard(color), seed });
      expect(r.summary.order.filter(x => x.startsWith('dmg'))).toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `dmg ${e} 31 (all)`));
      expect(r.summary.order).toContain(`convert ${color} x5 -> dragonGem/${color} x5`);
      expect(r.summary.order).toContain('extra-turn skill');
    }
  });
});

describe('L4b B01', () => {
  // weapon:1625 / 1674: ConvertGems 100 FromTarget>Decay|Bleed converts only the chosen colour, not the whole board
  for (const [key, kind] of [['weapon:1625', 'decayGem'], ['weapon:1674', 'bleedGem']] as const) it(`${key}: chosen Red -> only Red gems become ${kind}`, () => {
    const r = castSpell({ key, color: BaseColor.Red });
    expect(r.summary.order[0]).toBe(`convert Red x9 -> ${kind} x9`);
  });
  it('weapon:1674: Burn + Bleed only enemies of the chosen colour (Red -> E10)', () => {
    const r = castSpell({ key: 'weapon:1674', color: BaseColor.Red });
    expect(r.summary.order.slice(1, 3)).toEqual(['status E10 +burning', 'status E10 +bleed']);
  });
  // troop:6842: CauseWeb@WeakestEnemy ; CausePoison@FromPrevious -> same enemy even when all are tied
  it('troop:6842: tied weakest -> Poison follows the Web target', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const r = castSpell({ key: 'troop:6842', seed, enemies: [0, 1, 2, 3].map(() => ({ hp: 100, maxHp: 100, armor: 0 })) });
      const st = r.summary.order.filter(x => x.startsWith('status'));
      expect(st[1].split(' ')[1]).toBe(st[0].split(' ')[1]);
    }
  });
  // troop:6399: ConvertGems 100 Blue>FromTarget
  it('troop:6399: chosen Red -> all Blue become Red; random ally gets Enchanted + 3 Magic', () => {
    const r = castSpell({ key: 'troop:6399', color: BaseColor.Red });
    expect(r.summary.order[0]).toBe('convert Blue x11 -> Red x11');
    const [s, b] = r.summary.order.slice(1, 3);
    expect(b).toBe(`buff ${s.split(' ')[1]} magic+3`);
  });
  // troop:6124 / 6256 / 6824: FromTarget colour
  for (const [key, to] of [['troop:6124', 'Green'], ['troop:6256', 'Brown'], ['troop:6824', 'Brown']] as const) it(`${key}: chosen Red -> Red x9 -> ${to}`, () => {
    expect(castSpell({ key, color: BaseColor.Red }).summary.order[0]).toBe(`convert Red x9 -> ${to} x9`);
  });
});
