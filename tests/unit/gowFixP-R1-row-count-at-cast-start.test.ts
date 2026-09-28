// sa-P review round 2: P-R1-row-count-at-cast-start.
// troop:7316 8928: damage boosted by Red / Brown / Skull gems in the chosen row, counted before the row explodes
// (source chosenRowAtCastStart), not by the whole board.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import { castSpell, reviewBoard } from '../helpers/gowCast';

describe('P-R1-row-count-at-cast-start', () => {
  it('troop:7316 8928: [(M x 2) + 6] + 8 x (Red + Brown + Skull in row 3)', () => {
    let n = 0;
    for (let c = 0; c < 8; c++) {
      const g = reviewBoard(3, c);
      if (g && (g.kind === 'skull' || (g.kind === 'color' && (g.color === BaseColor.Red || g.color === BaseColor.Brown)))) n++;
    }
    const enemies = [0, 1, 2, 3].map(() => ({ hp: 900, maxHp: 900, armor: 0 }));
    const r = castSpell({ key: 'troop:7316', cell: { row: 3, col: 3 }, enemies });
    const hit = r.summary.order.find((s) => /^dmg E1\d \d+$/.test(s));
    expect(hit).toBeDefined();
    expect(Number(hit!.split(' ')[2])).toBe(26 + 8 * n);
  });
});
