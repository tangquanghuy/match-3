// sa-B lane review round 5 (lane L4b) + R013 user rulings items 1-4.
// Real TurnEngine.castSkill through tests/helpers/gowCast.ts; each row has its own entity and expected values.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import { castSpell, reviewBoard, DEFAULT_ALLIES, DEFAULT_ENEMIES } from '../helpers/gowCast';

const dmgs = (o: string[]) => o.filter(x => x.startsWith('dmg'));
const manaBuffs = (o: string[]) => o.filter(x => / mana\+/.test(x));

describe('R013-1: quarter / half Mana rounds down (floor(manaCost x ratio))', () => {
  // odd mana costs: 13 -> quarter 3 / half 6; 11 -> half 5
  const allies = DEFAULT_ALLIES.map(a => ({ ...a, manaCost: 13 }));
  it('troop:6928 GenerateQuarterMana to other allies: 13 -> 3 each', () => {
    expect(manaBuffs(castSpell({ key: 'troop:6928', allies }).summary.order)).toEqual(['buff A1 mana+3', 'buff A2 mana+3']);
  });
  it('weapon:1376 GenerateQuarterMana to the chosen ally: 13 -> 3', () => {
    expect(manaBuffs(castSpell({ key: 'weapon:1376', allies }).summary.order)).toEqual(['buff A1 mana+3']);
  });
  it('troop:7804 GenerateHalfManaConditional (kill): 11 -> 5', () => {
    const odd = DEFAULT_ALLIES.map(a => ({ ...a, manaCost: 11 }));
    const o = castSpell({ key: 'troop:7804', allies: odd, enemies: [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0 })) }).summary.order;
    expect(manaBuffs(o).filter(x => !x.startsWith('buff C'))).toEqual(['buff A1 mana+5', 'buff A2 mana+5']);
  });
  it('weapon:1623 GenerateHalfManaConditional (Immortal Selene present): 13 -> 6', () => {
    const withSelene = [{ ...allies[0], name: '不朽的塞勒涅' }, allies[1]];
    expect(manaBuffs(castSpell({ key: 'weapon:1623', allies: withSelene }).summary.order)).toEqual(['buff A1 mana+6', 'buff A2 mana+6']);
  });
});

describe('R013-2: random Mana is one roll shared by every recipient', () => {
  const rows: [string, number, number][] = [
    ['troop:7465', 3, 10], ['troop:7319', 3, 8], ['troop:6259', 3, 8], ['troop:7405', 3, 10], ['troop:6319', 3, 8],
  ];
  for (const [key, lo, hi] of rows) it(`${key}: all allies get the same ${lo}-${hi} value; several values occur`, () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const v = manaBuffs(castSpell({ key, seed }).summary.order).map(x => Number(x.split('+')[1]));
      expect(v.length).toBeGreaterThanOrEqual(2);
      expect(new Set(v).size).toBe(1);
      expect(v[0]).toBeGreaterThanOrEqual(lo); expect(v[0]).toBeLessThanOrEqual(hi);
      seen.add(v[0]);
    }
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('R013-3: weapon:1203 second hit = another random enemy (RandomPrefNotPrev)', () => {
  const daemons = DEFAULT_ENEMIES.map(e => ({ ...e, troopTypes: ['Daemon'] }));
  it('with a Daemon enemy the 12 damage never hits the chosen target while others live', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const d = dmgs(castSpell({ key: 'weapon:1203', enemies: daemons, seed }).summary.order);
      expect(d[0]).toBe('dmg E11 12');
      expect(d).toHaveLength(2);
      expect(d[1]).toMatch(/^dmg E1[023] 12$/);
      seen.add(d[1]);
    }
    expect(seen.size).toBe(3);
  });
  it('lone Daemon enemy takes both hits', () => {
    const lone = [0, 1, 2, 3].map(i => (i === 1 ? { hp: 500, maxHp: 500, armor: 0, troopTypes: ['Daemon'] } : { hp: 0, defeated: true }));
    expect(dmgs(castSpell({ key: 'weapon:1203', enemies: lone as never }).summary.order)).toEqual(['dmg E11 12', 'dmg E11 12']);
  });
  it('no Daemon: single hit only', () => {
    expect(dmgs(castSpell({ key: 'weapon:1203' }).summary.order)).toEqual(['dmg E11 12']);
  });
});

describe('R013-4: weapon:1404 heal boost counts Yellow gems only', () => {
  it('heal = 1 + Magic + Yellow on board after creation (removed Purple not added again)', () => {
    let purple = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const g = reviewBoard(r, c);
      if (g?.kind === 'color' && g.color === BaseColor.Purple) purple++;
    }
    const { f, summary } = castSpell({ key: 'weapon:1404' });
    expect(summary.gems.cascade).toBe(false);
    let yellowNow = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const g = f.board.get({ row: r, col: c })?.type;
      if (g?.kind === 'color' && g.color === BaseColor.Yellow) yellowNow++;
    }
    expect(summary.order[0]).toBe(`destroy ${purple} (Purple x${purple})`);
    // Yellow on the board after the creation only (refilled holes included); not + Purple removed (R013-4)
    expect(summary.order.find(x => x.startsWith('buff A1 hp'))).toBe(`buff A1 hp+${11 + yellowNow} max+${11 + yellowNow}`);
  });
});
